from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import jwt
import csv
import os
import shutil
import uuid
import json
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta, timezone


# ==========================================
# BusinessPilot AI API
# ==========================================

app = FastAPI(
    title="BusinessPilot AI API",
    description="REST API for Startup Business Health Analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# DATABASE
# ==========================================

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
FRONTEND_PAGES_DIR = FRONTEND_DIR / "pages"
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="frontend-assets")

DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = DATA_DIR / "businesspilot.db"
LEGACY_DATABASE_PATH = BASE_DIR / "database.db"
if not LEGACY_DATABASE_PATH.exists():
    LEGACY_DATABASE_PATH = DATA_DIR / "backups" / "legacy_root_database.db"
if not DATABASE_PATH.exists() and LEGACY_DATABASE_PATH.exists():
    shutil.copy2(LEGACY_DATABASE_PATH, DATABASE_PATH)

LEGACY_UPLOAD_DIR = BASE_DIR / "uploads"
if LEGACY_UPLOAD_DIR.exists() and not any(p.is_file() and p.name != ".gitkeep" for p in UPLOAD_DIR.iterdir()):
    for legacy_file in LEGACY_UPLOAD_DIR.iterdir():
        if legacy_file.is_file():
            shutil.copy2(legacy_file, UPLOAD_DIR / legacy_file.name)

DATABASE_URL = "sqlite:///" + str(DATABASE_PATH).replace("\\", "/")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


# ==========================================
# USER TABLE
# ==========================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    password = Column(
        String,
        nullable=False
    )


# Create database/table automatically
Base.metadata.create_all(bind=engine)


# ==========================================
# JWT SETTINGS
# ==========================================

SECRET_KEY = os.getenv("SECRET_KEY", "businesspilot-dev-only-change-this-secret")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60

security = HTTPBearer()


# เก็บ Token ที่ Logout แล้ว
# (ชั่วคราวใน memory)
revoked_tokens = set()


# ==========================================
# REQUEST MODELS
# ==========================================

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdateUserRequest(BaseModel):
    username: str | None = None
    email: str | None = None


# ==========================================
# CREATE JWT TOKEN
# ==========================================

def create_access_token(user_id: int, username: str):

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "username": username,
        "exp": expire
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return token


# ==========================================
# VERIFY JWT TOKEN
# ==========================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):

    token = credentials.credentials

    # Check logout token
    if token in revoked_tokens:
        raise HTTPException(
            status_code=401,
            detail="Token has been logged out"
        )

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

        return payload

    except jwt.ExpiredSignatureError:

        raise HTTPException(
            status_code=401,
            detail="Token has expired"
        )

    except jwt.InvalidTokenError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )


# ==========================================
# ROOT
# ==========================================

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/pages/landing.html")


@app.get("/pages/{page_name}", include_in_schema=False)
def frontend_page(page_name: str):
    # Only serve HTML files directly inside frontend/pages.
    if not page_name.endswith(".html") or Path(page_name).name != page_name:
        raise HTTPException(status_code=404, detail="Page not found")
    page_path = FRONTEND_PAGES_DIR / page_name
    if not page_path.is_file():
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(page_path)


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# ==========================================
# 1. REGISTER
# POST /register
# ==========================================

@app.post("/register")
def register(user: RegisterRequest):

    db = SessionLocal()

    # Check username
    existing_username = db.query(User).filter(
        User.username == user.username
    ).first()

    if existing_username:

        db.close()

        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    # Check email
    existing_email = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_email:

        db.close()

        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    # Create user
    new_user = User(
        username=user.username,
        email=user.email,
        password=user.password
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.close()

    return {
        "message": "Register successful",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email
        }
    }


# ==========================================
# 2. LOGIN
# POST /login
# ==========================================

@app.post("/login")
def login(user: LoginRequest):

    db = SessionLocal()

    existing_user = db.query(User).filter(
        User.username == user.username
    ).first()

    if not existing_user:

        db.close()

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    if existing_user.password != user.password:

        db.close()

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    token = create_access_token(
        existing_user.id,
        existing_user.username
    )

    db.close()

    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": existing_user.id,
            "username": existing_user.username,
            "email": existing_user.email
        }
    }


# ==========================================
# 3. LOGOUT
# POST /logout
# ==========================================

@app.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user=Depends(get_current_user)
):

    token = credentials.credentials

    revoked_tokens.add(token)

    return {
        "message": "Logout successful"
    }


# ==========================================
# 4. CHANGE PASSWORD
# POST /change-password
# ==========================================

@app.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user=Depends(get_current_user)
):

    db = SessionLocal()

    user = db.query(User).filter(
        User.id == current_user["user_id"]
    ).first()

    if not user:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Check old password
    if user.password != data.old_password:

        db.close()

        raise HTTPException(
            status_code=400,
            detail="Old password is incorrect"
        )

    # Update password
    user.password = data.new_password

    db.commit()

    db.close()

    return {
        "message": "Password changed successfully"
    }


# ==========================================
# 5. GET MY PROFILE
# GET /me
# ==========================================

@app.get("/me")
def get_me(
    current_user=Depends(get_current_user)
):

    db = SessionLocal()

    user = db.query(User).filter(
        User.id == current_user["user_id"]
    ).first()

    if not user:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    result = {
        "id": user.id,
        "username": user.username,
        "email": user.email
    }

    db.close()

    return result


# ==========================================
# 6. GET USER BY ID
# GET /users/{user_id}
# ==========================================

@app.get("/users/{user_id}")
def get_user_by_id(
    user_id: int,
    current_user=Depends(get_current_user)
):

    db = SessionLocal()

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    result = {
        "id": user.id,
        "username": user.username,
        "email": user.email
    }

    db.close()

    return result


# ==========================================
# 7. GET ALL USERS
# GET /users
# ==========================================

@app.get("/users")
def get_users(
    page: int = 1,
    limit: int = 10,
    current_user=Depends(get_current_user)
):

    if page < 1:

        raise HTTPException(
            status_code=400,
            detail="Page must be greater than 0"
        )

    if limit < 1 or limit > 100:

        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100"
        )

    db = SessionLocal()

    total = db.query(User).count()

    skip = (page - 1) * limit

    users = db.query(User).offset(
        skip
    ).limit(
        limit
    ).all()

    result = []

    for user in users:

        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email
        })

    db.close()

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "users": result
    }


# ==========================================
# 8. UPDATE USER
# PUT /users/{user_id}
# ==========================================

@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UpdateUserRequest,
    current_user=Depends(get_current_user)
):

    # ให้ User แก้ข้อมูลของตัวเองเท่านั้น
    if user_id != current_user["user_id"]:

        raise HTTPException(
            status_code=403,
            detail="You can only update your own account"
        )

    db = SessionLocal()

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Update username
    if data.username is not None:

        existing_username = db.query(User).filter(
            User.username == data.username,
            User.id != user_id
        ).first()

        if existing_username:

            db.close()

            raise HTTPException(
                status_code=400,
                detail="Username already exists"
            )

        user.username = data.username

    # Update email
    if data.email is not None:

        existing_email = db.query(User).filter(
            User.email == data.email,
            User.id != user_id
        ).first()

        if existing_email:

            db.close()

            raise HTTPException(
                status_code=400,
                detail="Email already exists"
            )

        user.email = data.email

    db.commit()
    db.refresh(user)

    result = {
        "message": "User updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }

    db.close()

    return result


# ==========================================
# 9. DELETE USER
# DELETE /users/{user_id}
# ==========================================

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user=Depends(get_current_user)
):

    # ให้ User ลบบัญชีตัวเองเท่านั้น
    if user_id != current_user["user_id"]:

        raise HTTPException(
            status_code=403,
            detail="You can only delete your own account"
        )

    db = SessionLocal()

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    db.delete(user)
    db.commit()

    db.close()

    return {
        "message": "User deleted successfully"
    }


# ==========================================
# 10. CHECK USERNAME
# GET /check-username/{name}
# ==========================================

@app.get("/check-username/{name}")
def check_username(
    name: str
):

    db = SessionLocal()

    user = db.query(User).filter(
        User.username == name
    ).first()

    db.close()

    if user:

        return {
            "username": name,
            "available": False,
            "message": "Username already exists"
        }

    return {
        "username": name,
        "available": True,
        "message": "Username is available"
    }

# ==========================================
# BUSINESS DATA UPLOAD
# POST /upload
# ==========================================

@app.post("/upload")
def upload_business_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):

    # ตรวจสอบนามสกุลไฟล์
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported"
        )

    # สร้างโฟลเดอร์ uploads
    upload_dir = str(UPLOAD_DIR)

    os.makedirs(
        upload_dir,
        exist_ok=True
    )

    # ตั้งชื่อไฟล์
    original_name = os.path.basename(file.filename or "upload.csv")
    filename = f"{uuid.uuid4().hex}_{original_name}"

    file_path = os.path.join(
        upload_dir,
        filename
    )

    # บันทึกไฟล์
    with open(file_path, "wb") as buffer:

        shutil.copyfileobj(
            file.file,
            buffer
        )

    # ส่งชื่อคอลัมน์กลับไปให้ Frontend สร้าง dropdown สำหรับจับคู่ข้อมูล
    try:
        with open(file_path, "r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            columns = reader.fieldnames or []
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read CSV headers: {str(e)}")

    if not columns:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    return {
        "message": "File uploaded successfully. Map the CSV columns before analysis.",
        "filename": filename,
        "columns": columns,
        "column_mapping_required": ["date_column", "revenue_column", "expense_column", "profit_column"],
        "profit_column_options": columns + ["__calculated__"],
        "user_id": current_user["user_id"]
    }

# ==========================================
# MULTI-FILE CSV UPLOAD
# ==========================================

@app.post("/upload-multiple")
def upload_business_files(files: list[UploadFile] = File(...), current_user=Depends(get_current_user)):
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one CSV file")
    os.makedirs(str(UPLOAD_DIR), exist_ok=True)
    uploaded = []
    for file in files:
        original_name = os.path.basename(file.filename or "upload.csv")
        if not original_name.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail=f"Only CSV files are supported: {original_name}")
        filename = f"{uuid.uuid4().hex}_{original_name}"
        file_path = os.path.join(str(UPLOAD_DIR), filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            with open(file_path, "r", encoding="utf-8-sig", newline="") as csv_file:
                columns = csv.DictReader(csv_file).fieldnames or []
            if not columns:
                os.remove(file_path)
                raise HTTPException(status_code=400, detail=f"CSV has no header row: {original_name}")
            uploaded.append({"filename": filename, "original_name": original_name, "columns": columns})
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot read {original_name}: {exc}")
    return {"message": "Files uploaded successfully", "files": uploaded, "user_id": current_user["user_id"]}


# ==========================================
# BUSINESS ANALYSIS
# POST /analyze
# ==========================================

class FileMapping(BaseModel):
    filename: str
    date_column: str
    revenue_columns: list[str] = []
    expense_columns: list[str] = []
    profit_column: str = "__calculated__"


class AnalyzeRequest(BaseModel):
    filename: str | None = None
    initial_cash: float
    date_column: str | None = None
    revenue_column: str | list[str] | None = None
    expense_column: str | list[str] | None = None
    profit_column: str = "__calculated__"
    files: list[FileMapping] | None = None


def generate_ai_recommendations(metrics: dict) -> list[str] | None:
    """Request Thai business recommendations through OpenRouter; fall back to rules on failure."""
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free").strip()
    if not api_key:
        print("OpenRouter API key is not configured; using rule-based recommendations.")
        return None

    prompt = (
        "คุณเป็นผู้ช่วยวิเคราะห์การเงินธุรกิจ SME ในประเทศไทย "
        "วิเคราะห์เฉพาะตัวเลขที่ได้รับ ห้ามแต่งข้อมูลหรือรับประกันผลลัพธ์ "
        "ให้คำแนะนำภาษาไทย 3-5 ข้อ เรียงตามผลกระทบและความเร่งด่วน "
        "แต่ละข้อควรระบุสิ่งที่ต้องทำ เหตุผลจากตัวเลข และตัวชี้วัดที่ควรติดตาม "
        "ห้ามสร้างตัวเลขเป้าหมายที่ไม่มีข้อมูลรองรับ ห้ามอ้างเหตุและผลเกินข้อมูล "
        "หากข้อมูลไม่พอให้บอกว่าต้องเก็บข้อมูลอะไรเพิ่ม ตอบเป็น JSON เท่านั้นในรูปแบบ "
        "{\"recommendations\":[\"คำแนะนำ\"]}\n"
        f"ข้อมูลการเงิน: {json.dumps(metrics, ensure_ascii=False)}"
    )
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "ตอบภาษาไทย กระชับ อิงข้อมูลที่ให้มา และคืน JSON object ที่มี recommendations เป็น array ของ string เท่านั้น"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1200
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "BusinessPilot AI"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        content = str(content).strip()
        try:
            generated = json.loads(content)
        except ValueError:
            start, end = content.find("{"), content.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("Model did not return a JSON object")
            generated = json.loads(content[start:end + 1])
        recommendations = generated.get("recommendations", [])
        if isinstance(recommendations, list):
            cleaned = [str(item).strip() for item in recommendations if str(item).strip()]
            return cleaned[:5] or None
        raise ValueError("Invalid recommendations format")
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError, IndexError) as exc:
        print(f"OpenRouter recommendation unavailable; using rule-based fallback: {exc}")
    return None


@app.post("/analyze")
def analyze_business(
    data: AnalyzeRequest,
    current_user=Depends(get_current_user)
):

    # Read either the new per-file mapping payload or the legacy single-file payload.
    rows = []
    if data.files:
        mappings = data.files
    elif data.filename and data.date_column:
        rev = data.revenue_column if isinstance(data.revenue_column, list) else ([data.revenue_column] if data.revenue_column else [])
        exp = data.expense_column if isinstance(data.expense_column, list) else ([data.expense_column] if data.expense_column else [])
        mappings = [FileMapping(filename=data.filename, date_column=data.date_column, revenue_columns=rev, expense_columns=exp, profit_column=data.profit_column)]
    else:
        raise HTTPException(status_code=400, detail="Provide files and column mappings")

    def parse_amount(value):
        cleaned = str(value or "0").strip().replace(",", "").replace("฿", "").replace("$", "")
        if cleaned in {"", "-", "—", "N/A", "n/a"}:
            return 0.0
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = "-" + cleaned[1:-1]
        return float(cleaned)

    for mapping in mappings:
        filename = os.path.basename(mapping.filename)
        file_path = os.path.join(str(UPLOAD_DIR), filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Uploaded file not found: {filename}")
        try:
            with open(file_path, "r", encoding="utf-8-sig", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                available_columns = set(reader.fieldnames or [])
                required = [mapping.date_column, *mapping.revenue_columns, *mapping.expense_columns]
                if mapping.profit_column != "__calculated__":
                    required.append(mapping.profit_column)
                invalid = [column for column in required if column not in available_columns]
                if invalid:
                    raise HTTPException(status_code=400, detail={"message": f"Column mapping references columns not found in {filename}", "invalid_columns": invalid, "available_columns": reader.fieldnames or []})
                if not mapping.revenue_columns and not mapping.expense_columns:
                    raise HTTPException(status_code=400, detail=f"Select at least one revenue or expense column for {filename}")
                for row in reader:
                    try:
                        raw_date = str(row.get(mapping.date_column, "")).strip()
                        date = None
                        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y"):
                            try:
                                date = datetime.strptime(raw_date, fmt)
                                break
                            except ValueError:
                                pass
                        if date is None:
                            continue
                        revenue = sum(parse_amount(row.get(column)) for column in mapping.revenue_columns)
                        expense = sum(parse_amount(row.get(column)) for column in mapping.expense_columns)
                        profit = revenue - expense if mapping.profit_column == "__calculated__" else parse_amount(row.get(mapping.profit_column))
                        rows.append({"date": date, "revenue": revenue, "expense": expense, "net": profit, "profit": profit})
                    except (ValueError, TypeError):
                        continue
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot read CSV {filename}: {str(e)}")

    # Combine records from different files on the same date so revenue and expenses align.
    daily = {}
    for row in rows:
        key = row["date"].date()
        if key not in daily:
            daily[key] = {"date": row["date"], "revenue": 0.0, "expense": 0.0, "net": 0.0, "profit": 0.0}
        daily[key]["revenue"] += row["revenue"]
        daily[key]["expense"] += row["expense"]
        daily[key]["net"] += row["net"]
        daily[key]["profit"] += row["profit"]
    rows = sorted(daily.values(), key=lambda item: item["date"])

    # ------------------------------------------
    # ตรวจสอบข้อมูล
    # ------------------------------------------

    if len(rows) == 0:

        raise HTTPException(
            status_code=400,
            detail="CSV contains no valid data"
        )

    # เรียงตามวันที่
    rows.sort(
        key=lambda x: x["date"]
    )

    # ------------------------------------------
    # Financial calculations
    # ------------------------------------------

    total_revenue = sum(
        row["revenue"]
        for row in rows
    )

    total_expense = sum(
        row["expense"]
        for row in rows
    )

    profit_loss = sum(
        row["profit"]
        for row in rows
    )

    # ------------------------------------------
    # Recent 3-month burn rate
    # ------------------------------------------

    recent_rows = rows[-3:]

    recent_burns = []

    for row in recent_rows:

        if row["net"] < 0:

            recent_burns.append(
                abs(row["net"])
            )

    if recent_burns:

        burn_rate = sum(
            recent_burns
        ) / len(recent_burns)

    else:

        burn_rate = 0

    # ------------------------------------------
    # Cash Runway
    # ------------------------------------------

    if burn_rate > 0:

        cash_runway = (
            data.initial_cash /
            burn_rate
        )

    else:

        cash_runway = None

    # ------------------------------------------
    # Revenue trend
    # ------------------------------------------

    first_revenue = rows[0]["revenue"]
    latest_revenue = rows[-1]["revenue"]

    if first_revenue > 0:

        revenue_change_percent = (
            (latest_revenue - first_revenue)
            / first_revenue
        ) * 100

    else:

        revenue_change_percent = 0

    # ------------------------------------------
    # Expense trend
    # ------------------------------------------

    first_expense = rows[0]["expense"]
    latest_expense = rows[-1]["expense"]

    if first_expense > 0:

        expense_change_percent = (
            (latest_expense - first_expense)
            / first_expense
        ) * 100

    else:

        expense_change_percent = 0

    # ------------------------------------------
    # Profit margin
    # ------------------------------------------

    if total_revenue > 0:

        profit_margin = (
            profit_loss /
            total_revenue
        ) * 100

    else:

        profit_margin = 0

    # ==========================================
    # BUSINESS HEALTH SCORE
    # ==========================================

    score = 0

    # Cash runway: 40 points
    if cash_runway is None:

        score += 40

    elif cash_runway >= 12:

        score += 40

    elif cash_runway >= 6:

        score += 30

    elif cash_runway >= 3:

        score += 15

    else:

        score += 5

    # Profit margin: 30 points
    if profit_margin >= 20:

        score += 30

    elif profit_margin >= 10:

        score += 25

    elif profit_margin >= 0:

        score += 15

    else:

        score += 5

    # Revenue trend: 20 points
    if revenue_change_percent >= 10:

        score += 20

    elif revenue_change_percent >= 0:

        score += 15

    elif revenue_change_percent >= -10:

        score += 10

    else:

        score += 5

    # Expense trend: 10 points
    if expense_change_percent <= 0:

        score += 10

    elif expense_change_percent <= 10:

        score += 7

    elif expense_change_percent <= 20:

        score += 5

    else:

        score += 2

    # ------------------------------------------
    # Business status
    # ------------------------------------------

    if score >= 80:

        status = "Healthy"

    elif score >= 60:

        status = "Watch"

    else:

        status = "Risk"




    # ------------------------------------------
    # Recommendation
    # ------------------------------------------

    recommendations = []

    if profit_loss < 0:

        recommendations.append(
            "ค่าใช้จ่ายสูงกว่ารายรับ ควรลดค่าใช้จ่ายหรือเพิ่มรายได้"
        )

    if revenue_change_percent < 0:

        recommendations.append(
            "รายรับมีแนวโน้มลดลง ควรหาวิธีเพิ่มยอดขาย"
        )

    if expense_change_percent > 10:

        recommendations.append(
            "ค่าใช้จ่ายมีแนวโน้มเพิ่มขึ้น ควรควบคุมต้นทุน"
        )

    if cash_runway is not None and cash_runway < 6:

        recommendations.append(
            "เงินสดมีแนวโน้มหมดภายใน 6 เดือน ควรเตรียมเงินทุนสำรอง"
        )

    if not recommendations:

        recommendations.append(
            "ธุรกิจมีแนวโน้มทางการเงินที่ดี ควรรักษากระแสเงินสด"
        )

    # Use the local model when available; preserve rule-based results if it is offline.
    recommendation_source = "rules"
    ai_recommendations = generate_ai_recommendations({
        "total_revenue": round(total_revenue, 2),
        "total_expense": round(total_expense, 2),
        "profit_loss": round(profit_loss, 2),
        "revenue_change_percent": round(revenue_change_percent, 2),
        "expense_change_percent": round(expense_change_percent, 2),
        "cash_runway_months": round(cash_runway, 2) if cash_runway is not None else None,
        "business_health_score": score,
        "business_status": status,
    })
    if ai_recommendations:
        recommendations = ai_recommendations
        recommendation_source = "openrouter"

    # ------------------------------------------
    # Return result
    # ------------------------------------------

    return {
        "message": "Business analysis completed",
        "recommendation_source": recommendation_source,

        "filename": filename,

        "business_health": {
            "score": score,
            "status": status
        },

        "financial": {
            "total_revenue": round(
                total_revenue,
                2
            ),

            "total_expense": round(
                total_expense,
                2
            ),

            "profit_loss": round(
                profit_loss,
                2
            ),

            "profit_margin_percent": round(
                profit_margin,
                2
            )
        },

        "cash_flow": {
            "initial_cash": round(
                data.initial_cash,
                2
            ),

            "monthly_burn_rate": round(
                burn_rate,
                2
            ),

            "cash_runway_months": (
                round(cash_runway, 2)
                if cash_runway is not None
                else None
            )
        },

        "trends": {
            "revenue_change_percent": round(
                revenue_change_percent,
                2
            ),

            "expense_change_percent": round(
                expense_change_percent,
                2
            )
        },

        "recommendations": recommendations
    }