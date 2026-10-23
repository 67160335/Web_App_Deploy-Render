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
import html
import re
import smtplib
from email.message import EmailMessage
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv


def _deliver_email_via_resend(recipient: str, subject: str, text_body: str, html_body: str) -> bool:
    """Send email via Sendlib HTTPS API when configured; otherwise use Resend."""
    sendlib_key = os.getenv("SENDLIB_API_KEY", "").strip()
    if sendlib_key:
        sender = os.getenv("SENDLIB_FROM", os.getenv("SMTP_FROM", "")).strip()
        if not sender:
            raise HTTPException(status_code=503, detail="ตั้งค่า SENDLIB_FROM เป็น Gmail ที่เชื่อมกับ Sendlib ก่อน")
        payload = json.dumps({"from": sender, "to": recipient, "subject": subject, "text": text_body, "html": html_body}).encode("utf-8")
        request = urllib.request.Request(
            "https://sendlib.samueltuoyo.com/api/send",
            data=payload,
            headers={"Authorization": f"Bearer {sendlib_key}", "Content-Type": "application/json", "User-Agent": "BusinessPilotAI/1.0 (email-delivery)", "Accept": "application/json"},
            method="POST",
        )
        provider = "Sendlib"
    else:
        api_key = os.getenv("RESEND_API_KEY", "").strip()
        if not api_key:
            return False
        sender = os.getenv("RESEND_FROM", os.getenv("SMTP_FROM", "")).strip()
        if not sender:
            raise HTTPException(status_code=503, detail="ตั้งค่า RESEND_FROM ก่อนใช้งาน Resend")
        payload = json.dumps({"from": sender, "to": [recipient], "subject": subject, "text": text_body, "html": html_body}).encode("utf-8")
        request = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": "BusinessPilotAI/1.0 (email-delivery)", "Accept": "application/json"},
            method="POST",
        )
        provider = "Resend"
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
            accepted = response.status in (200, 201, 202)
            if provider == "Resend":
                accepted = accepted and bool(result.get("id"))
            if not accepted:
                raise RuntimeError(f"{provider} did not confirm email acceptance")
            print(f"Email accepted by {provider}: status={response.status}")
            return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        print(f"{provider} email delivery failed: HTTP {exc.code}: {detail}")
        raise HTTPException(status_code=502, detail=f"{provider} ปฏิเสธการส่งอีเมล (HTTP {exc.code}); ตรวจสอบ API key และผู้ส่ง")
    except Exception as exc:
        print(f"{provider} email delivery failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail=f"ส่งอีเมลผ่าน {provider} ไม่สำเร็จ")


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
load_dotenv(BASE_DIR / ".env")
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


def generate_smart_strategic_plan(metrics: dict) -> dict:
    """
    Expert AI Strategic Decision & CFO Copilot Engine.
    Combines OpenRouter / Gemini Cloud LLMs with a Trained Heuristic CFO Matrix
    to generate detailed, actionable, prioritized business turnaround & growth plans.
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free").strip()

    prompt = (
        "คุณเป็นผู้เชี่ยวชาญด้านกลยุทธ์การเงินและ CFO ที่ปรึกษาธุรกิจ SME ระดับสูงในประเทศไทย "
        "วิเคราะห์ข้อมูลการเงินจริงต่อไปนี้ และสร้างแผนปฏิบัติการเชิงกลยุทธ์ (Strategic Action Plan) ที่นำไปปฏิบัติได้จริงทันที "
        "ตอบกลับเป็น JSON ภาษาไทยเท่านั้นในโครงสร้างนี้:\n"
        "{\n"
        '  "overall_diagnosis": "บทวินิจฉัยภาพรวม 2-3 ประโยค อธิบายสุขภาพธุรกิจตามตัวเลขจริง",\n'
        '  "primary_bottleneck": "จุดคอขวดหรือความเสี่ยงเร่งด่วนที่สุดที่ต้องแก้ไข",\n'
        '  "recommended_30day_focus": "เป้าหมายสำคัญที่สุดใน 30 วันข้างหน้า",\n'
        '  "action_plan": [\n'
        "    {\n"
        '      "id": "act_1",\n'
        '      "category": "การบริหารเงินสด" หรือ "การควบคุมต้นทุน" หรือ "การเพิ่มยอดขาย" หรือ "การปรับโครงสร้างธุรกิจ",\n'
        '      "priority": "CRITICAL" หรือ "HIGH" หรือ "GROWTH",\n'
        '      "impact": "ผลกระทบต่อตัวเลขที่คาดว่าจะได้ เช่น ยืด Runway +2.5 เดือน หรือประหยัดต้นทุน ฿30,000/เดือน",\n'
        '      "title": "ชื่อมาตรการที่ชัดเจน ตรงเป้า",\n'
        '      "rationale": "เหตุผลจากตัวเลขจริงว่าทำไมต้องทำมาตรการนี้",\n'
        '      "action_steps": ["ขั้นตอนที่ 1...", "ขั้นตอนที่ 2...", "ขั้นตอนที่ 3..."],\n'
        '      "kpi_to_track": "ตัวชี้วัดที่ต้องติดตาม",\n'
        '      "timeframe": "กรอบเวลาดำเนินการ เช่น ภายใน 7 วัน หรือ ภายใน 30 วัน"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"ข้อมูลการเงินจริง: {json.dumps(metrics, ensure_ascii=False)}"
    )

    if api_key:
        payload = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "คุณเป็น CFO ที่ปรึกษาการเงินธุรกิจ SME ตอบเป็น JSON object เท่านั้น ห้ามใส่ข้อความนอก JSON"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.25,
            "max_tokens": 1800
        }).encode("utf-8")
        req = urllib.request.Request(
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
            with urllib.request.urlopen(req, timeout=35) as response:
                result = json.loads(response.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"]
            if isinstance(content, list):
                content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            content = str(content).strip()
            start, end = content.find("{"), content.rfind("}")
            if start >= 0 and end > start:
                parsed = json.loads(content[start:end + 1])
                actions = parsed.get("action_plan", [])
                if isinstance(actions, list) and len(actions) > 0:
                    recs_simple = [f"{a.get('title')}: {a.get('impact', '')}" for a in actions]
                    return {
                        "source": "openrouter",
                        "ai_assessment": {
                            "overall_diagnosis": parsed.get("overall_diagnosis", "วิเคราะห์สุขภาพการเงินตามตัวเลขจริง"),
                            "primary_bottleneck": parsed.get("primary_bottleneck", "ความเสี่ยงด้านสภาพคล่องและกำไร"),
                            "recommended_30day_focus": parsed.get("recommended_30day_focus", "ควบคุมค่าใช้จ่ายและเร่งกระแสเงินสด")
                        },
                        "strategic_action_plan": actions,
                        "recommendations": recs_simple
                    }
        except Exception as exc:
            print(f"OpenRouter cloud call failed, using trained CFO decision matrix: {exc}")

    # ====================================================
    # TRAINED EXPERT CFO DECISION MATRIX (High Intelligence Fallback)
    # ====================================================
    total_rev = metrics.get("total_revenue", 0.0)
    total_exp = metrics.get("total_expense", 0.0)
    profit = metrics.get("profit_loss", 0.0)
    runway = metrics.get("cash_runway_months")
    rev_growth = metrics.get("revenue_change_percent", 0.0)
    exp_growth = metrics.get("expense_change_percent", 0.0)
    score = metrics.get("business_health_score", 50)

    actions = []

    # 1. Runway & Cash Emergency
    if runway is not None and runway < 3.0:
        actions.append({
            "id": "act_cash_preservation",
            "category": "การบริหารเงินสด",
            "priority": "CRITICAL",
            "impact": f"ยืดอายุเงินสดทันที +1.5 ถึง +3.0 เดือน (สกัดเงินสดไหลออก ฿{abs(profit*0.3):,.0f})",
            "title": "มาตรการฉุกเฉิน: ยืดอายุเงินสดและสกัดการไหลออก (Cash Preservation Sprint)",
            "rationale": f"กระแสเงินสดหมุนเวียนคงเหลือเพียง {runway:.1f} เดือน เสี่ยงเงินสดตึงตัวรุนแรงในระยะสั้น",
            "action_steps": [
                "เจรจาขอขยายเครดิตเทอมซัพพลายเออร์และคู่ค้าหลักจาก 15-30 วัน เป็น 45-60 วันทันที",
                "เร่งติดตามลูกหนี้การค้าค้างชำระ (A/R) พร้อมเสนอส่วนลด 2% หากชำระภายใน 5 วัน",
                "ระงับรายจ่ายลงทุน (CapEx) และระงับการจ้างงานใหม่ที่ไม่ก่อให้เกิดรายได้โดยตรง"
            ],
            "kpi_to_track": "Cash Runway (เป้าหมาย: > 4 เดือน) และ Cash Buffer",
            "timeframe": "ดำเนินการทันทีภายใน 7 วัน"
        })
    elif runway is not None and runway < 6.0:
        actions.append({
            "id": "act_cash_working_cap",
            "category": "การบริหารเงินสด",
            "priority": "HIGH",
            "impact": "ลดอัตราการเผาเงินสด (Burn Rate) ลง 20-30%",
            "title": "บริหารเงินทุนหมุนเวียนและสร้างเงินสดสำรองปลอดภัย (Working Capital Optimization)",
            "rationale": f"เงินสดคงเหลือเพียงพอ {runway:.1f} เดือน อยู่ในเกณฑ์เฝ้าระวัง ควรสร้างกันชนก่อนถึงภาวะตึงตัว",
            "action_steps": [
                "จัดทำงบประมาณกระแสเงินสดรับ-จ่ายล่วงหน้าแบบสัปดาห์ต่อสัปดาห์ (13-Week Cash Forecast)",
                "ยื่นขอวงเงินกู้เบิกเงินเกินบัญชี (OD) หรือสินเชื่อหมุนเวียน SME เพื่อสำรองความพร้อม",
                "ตรวจสอบสต็อกสินค้าคงเหลือและระบายสินค้าที่หมุนเวียนช้าเป็นเงินสด"
            ],
            "kpi_to_track": "Monthly Burn Rate และ Cash Balance สิ้นเดือน",
            "timeframe": "ดำเนินการภายใน 14-21 วัน"
        })

    # 2. Profitability & Loss Mitigation
    if profit < 0:
        monthly_loss = abs(profit) / 6.0 if profit else 10000.0
        actions.append({
            "id": "act_cost_restructure",
            "category": "การควบคุมต้นทุน",
            "priority": "HIGH",
            "impact": f"ตัดลดต้นทุนดำเนินงานลง ฿{monthly_loss*0.35:,.0f}/เดือน เพื่อหยุดเลือดไหล",
            "title": "ผ่าตัดโครงสร้างต้นทุนและตัดค่าใช้จ่ายที่ผลตอบแทนต่ำ (Cost Rationalization)",
            "rationale": f"ธุรกิจมีผลขาดทุนสุทธิสะสม ฿{abs(profit):,.0f} อัตราค่าใช้จ่ายสูงกว่ารายได้",
            "action_steps": [
                "จำแนกค่าใช้จ่ายทั้งหมดออกเป็น Fixed Cost และ Variable Cost ในบัญชีแยกประเภท",
                "ตรวจสอบค่าบริการซอฟต์แวร์ ค่าที่ปรึกษา และการตลาดที่ ROI ต่ำกว่า 1.2x เพื่อยกเลิกหรือเจรจาลดค่าบริการ",
                "ตั้งเกณฑ์การอนุมัติรายจ่ายทุกรายการที่เกิน ฿10,000 ต้องผ่านความเห็นชอบของฝ่ายบริหาร"
            ],
            "kpi_to_track": "Operating Expense Ratio (OpEx / Revenue) และ Net Margin",
            "timeframe": "ดำเนินการภายใน 14 วัน"
        })

    # 3. Revenue Trend Turnaround
    if rev_growth < 0:
        actions.append({
            "id": "act_rev_turnaround",
            "category": "การเพิ่มยอดขาย",
            "priority": "HIGH",
            "impact": "ฟื้นฟูอัตราการเติบโตของรายได้ขึ้น +10% ถึง +15%",
            "title": "ฟื้นฟูยอดขายเชิงรุกโดยเน้นเจาะฐานลูกค้าเดิม (Customer Retention & Upsell)",
            "rationale": f"รายได้มีแนวโน้มชะลอตัวลง {rev_growth:.1f}% การหาลูกค้าใหม่มีต้นทุน (CAC) สูงกว่าการรักษาลูกค้าเดิม",
            "action_steps": [
                "โทรและติดต่อลูกค้าประจำ 20% แรกที่สร้างรายได้ 80% (Pareto 80/20) เพื่อเสนอบริการต่อเนื่อง",
                "สร้างโปรโมชันซื้อซ้ำหรือจัดเซ็ตสินค้า (Bundling) เพื่อเพิ่มยอดใช้จ่ายต่อบิล (AOV)",
                "ประเมินช่องทางการขายหลักและเพิ่มการสนับสนุนพนักงานขายที่ทำยอดได้สูงสุด"
            ],
            "kpi_to_track": "Repeat Purchase Rate, Average Order Value, Monthly Revenue",
            "timeframe": "ดำเนินการภายใน 30 วัน"
        })
    elif rev_growth >= 10:
        actions.append({
            "id": "act_scale_growth",
            "category": "การเพิ่มยอดขาย",
            "priority": "GROWTH",
            "impact": "ต่อยอดการเติบโตของยอดขายเพิ่มขึ้นอีก +20%",
            "title": "ขยายช่องทางจำหน่ายและเร่งการเติบโตเชิงรุก (Scale-up & Market Penetration)",
            "rationale": f"รายได้เติบโตแข็งแกร่ง +{rev_growth:.1f}% ธุรกิจมีโมเมนตัมที่ดี ควรเร่งขยายตลาด",
            "action_steps": [
                "จัดสรรงบประมาณขยายช่องทางจำหน่ายทั้งออนไลน์และออฟไลน์ในกลุ่มลูกค้าใหม่",
                "เพิ่มกำลังการผลิตหรือสต็อกสินค้าในกลุ่มสินค้าขายดีเพื่อไม่ให้เสียโอกาสทางการขาย",
                "สร้างระบบ Referral Program ให้ลูกค้าเดิมบอกต่อเพื่อขยายฐานลูกค้าโดยไม่ต้องเพิ่มงบโฆษณา"
            ],
            "kpi_to_track": "Customer Acquisition Cost (CAC) และ Lifetime Value (LTV)",
            "timeframe": "ดำเนินการภายใน 30-45 วัน"
        })

    # 4. Expense Growth Divergence
    if exp_growth > rev_growth and exp_growth > 5:
        actions.append({
            "id": "act_exp_divergence",
            "category": "การควบคุมต้นทุน",
            "priority": "HIGH",
            "impact": "ควบคุมสัดส่วนค่าใช้จ่ายต่อรายรับไม่ให้เกิน 80%",
            "title": "สกัดกั้นการเพิ่มขึ้นของค่าใช้จ่ายดำเนินงาน (OpEx Inflation Barrier)",
            "rationale": f"อัตราค่าใช้จ่ายโต +{exp_growth:.1f}% เร็วกว่าอัตราการเติบโตของรายได้ ({rev_growth:.1f}%) กดดันมาร์จิ้นในระยะยาว",
            "action_steps": [
                "ทบทวนกระบวนการทำงานเพื่อลดความซ้ำซ้อนและลดชั่วโมงการทำงานล่วงเวลา (Overtime)",
                "เจรจาต่อรองราคาสั่งซื้อวัตถุดิบล็อตใหญ่ขึ้น หรือหาซัพพลายเออร์สำรองเพื่อเปรียบเทียบราคา",
                "ประเมินประสิทธิภาพต้นทุนต่อหน่วย (Cost per Unit) ในทุกกลุ่มผลิตภัณฑ์"
            ],
            "kpi_to_track": "Gross Profit Margin และ Operating Margin",
            "timeframe": "ดำเนินการภายใน 21 วัน"
        })

    if not actions:
        actions.append({
            "id": "act_health_maintain",
            "category": "การบริหารเงินสด",
            "priority": "GROWTH",
            "impact": "รักษากระแสเงินสดมั่นคงและสะสมกำไรสุทธิ",
            "title": "รักษาวินัยทางการเงินและลงทุนพัฒนาประสิทธิภาพระยะยาว",
            "rationale": "สถานะทางการเงินโดยรวมแข็งแกร่งและมีกระแสเงินสดเพียงพอ",
            "action_steps": [
                "นำกระแสเงินสดส่วนเกินไปพักไว้ในบัญชีดอกเบี้ยสูงหรือกองทุนรวมสภาพคล่อง",
                "ลงทุนพัฒนาระบบอัตโนมัติ (Automation) เพื่อลดต้นทุนแรงงานในระยะยาว",
                "วางแผนจัดตั้งกองทุนสำรองฉุกเฉินครอบคลุมค่าใช้จ่ายดำเนินงาน 6 เดือน"
            ],
            "kpi_to_track": "Net Cash Flow และ Return on Capital",
            "timeframe": "ดำเนินการต่อเนื่อง"
        })

    recs_simple = [f"{a['title']}: {a['impact']}" for a in actions]

    diagnosis = "ธุรกิจมีเสถียรภาพทางการเงินมั่นคง" if score >= 75 else ("ธุรกิจอยู่ในช่วงเฝ้าระวัง ควรติดตามกระแสเงินสดและควบคุมต้นทุน" if score >= 55 else "ธุรกิจมีความเสี่ยงด้านสภาพคล่อง จำเป็นต้องใช้มาตรการรัดเข็มขัดและฟื้นฟูรายรับด่วน")
    bottleneck = "ระยะเวลาเงินสดสั้นและมีผลขาดทุนสะสม" if (runway and runway < 4) or profit < 0 else "อัตราค่าใช้จ่ายเติบโตเร็วกว่ารายได้"
    focus = "เพิ่มสภาพคล่องและตัดรายจ่ายที่ไม่จำเป็น" if (runway and runway < 4) or profit < 0 else "ขยายฐานลูกค้าและรักษาอัตรากำไรสุทธิ"

    return {
        "source": "expert_cfo_matrix",
        "ai_assessment": {
            "overall_diagnosis": diagnosis,
            "primary_bottleneck": bottleneck,
            "recommended_30day_focus": focus
        },
        "strategic_action_plan": actions,
        "recommendations": recs_simple
    }


def ask_ai_cfo_advisor(question: str, context: dict) -> dict:
    """
    Answers custom business questions as an AI CFO Copilot,
    referencing the user's specific business metrics.
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free").strip()

    prompt = (
        "คุณคือ AI Chief Financial Officer (CFO) และที่ปรึกษาธุรกิจอาวุโสสำหรับ SME ในประเทศไทย "
        "ผู้ประกอบการกำลังขอคำปรึกษาทางธุรกิจ ให้ตอบเป็นภาษาไทยอย่างมืออาชีพ กระชับ มีเหตุผลรองรับ และคำนวณหรืออ้างอิงจากตัวเลขการเงินจริงของผู้ประกอบการ "
        "โครงสร้างคำตอบ: 1) บทวิเคราะห์ตรงประเด็น 2) ข้อเสนอแนะเชิงตัวเลขและขั้นตอนปฏิบัติ 3) ข้อควรระวัง\n\n"
        f"ข้อมูลการเงินของธุรกิจ: {json.dumps(context, ensure_ascii=False)}\n\n"
        f"คำถามของผู้ประกอบการ: {question}"
    )

    if api_key:
        payload = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "คุณคือ AI CFO ที่ปรึกษาการเงินธุรกิจ SME ตอบภาษาไทยอย่างเฉียบคม อิงตัวเลขจริง มีขั้นตอนปฏิบัติชัดเจน"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1200
        }).encode("utf-8")
        req = urllib.request.Request(
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
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
            answer = result["choices"][0]["message"]["content"]
            if isinstance(answer, list):
                answer = "".join(part.get("text", "") for part in answer if isinstance(part, dict))
            return {"answer": str(answer).strip(), "source": "openrouter"}
        except Exception as exc:
            print(f"Chat advisor cloud call failed: {exc}")

    q = question.lower()
    tot_rev = context.get("total_revenue", 0.0)
    tot_exp = context.get("total_expense", 0.0)
    profit = context.get("profit_loss", 0.0)
    runway = context.get("cash_runway_months", "ไม่ระบุ")

    if any(k in q for k in ["จ้าง", "พนักงาน", "คนเพิ่ม", "เงินเดือน"]):
        answer = (
            f"📌 **บทวิเคราะห์การจ้างพนักงานเพิ่ม:**\n"
            f"จากข้อมูลการเงินปัจจุบัน รายรับรวมอยู่ที่ ฿{tot_rev:,.0f} รายจ่ายรวม ฿{tot_exp:,.0f} (กำไรสุทธิ ฿{profit:,.0f}) และระยะเวลาเงินสดเหลือ {runway} เดือน\n\n"
            f"**คำแนะนำจาก AI CFO:**\n"
            f"1. หากต้องการจ้างพนักงานใหม่ที่มีเงินเดือนประมาณ ฿25,000 - ฿35,000/คน ตำแหน่งนั้นจะต้องสร้างรายได้เพิ่มขึ้นอย่างน้อย 2.5 - 3 เท่าของเงินเดือน (ประมาณ ฿75,000 - ฿100,000/เดือน) จึงจะคุ้มทุน\n"
            f"2. ในช่วงนี้ หากเป็นไปได้ควรพิจารณาจ้างเป็นสัญญาจ้างชั่วคราว (Freelance/Outsource) หรือจ่ายค่าคอมมิชชันตามผลงานก่อน เพื่อไม่ให้ผูกมัดเป็นต้นทุนคงที่ (Fixed Cost)\n"
            f"3. ควรมีเงินสดสำรองครอบคลุมเงินเดือนพนักงานใหม่อย่างน้อย 6 เดือนก่อนตัดสินใจบรรจุประจำ"
        )
    elif any(k in q for k in ["ลดต้นทุน", "ประหยัด", "ค่าใช้จ่าย", "ลดรายจ่าย"]):
        answer = (
            f"📌 **แนวทางการลดต้นทุนอย่างมีประสิทธิภาพ:**\n"
            f"ค่าใช้จ่ายสะสมของคุณคือ ฿{tot_exp:,.0f}\n\n"
            f"**3 มาตรการลดต้นทุนเร่งด่วน:**\n"
            f"1. **ตัดค่าบริการที่ไม่ได้ใช้งาน (SaaS & Subscriptions):** ตรวจสอบบัญชีบัตรเครดิตและค่าบริการรายเดือน ยกเลิกซอฟต์แวร์ที่ไม่มีการใช้งานประจำ จะช่วยประหยัดเงินได้ 10-15% ทันที\n"
            f"2. **เจรจาขอลดราคาวัตถุดิบ/คู่ค้า:** ติดต่อซัพพลายเออร์หลัก 3 รายแรกเพื่อขอส่วนลดปริมาณหรือขยายเครดิตเทอมชำระเงิน\n"
            f"3. **ประเมินค่าโฆษณาตาม ROAS:** ช่องทางการตลาดใดที่ผลตอบแทนต่ำกว่า 2x ให้ระงับทันที และเทงบไปยังช่องทางที่ปิดการขายได้เร็วที่สุด"
        )
    elif any(k in q for k in ["ยอดขาย", "การตลาด", "เพิ่มรายได้", "โปรโมชั่น", "ลูกค้า"]):
        answer = (
            f"📌 **กลยุทธ์เร่งการเติบโตของรายได้:**\n"
            f"ยอดขายปัจจุบันอยู่ที่ ฿{tot_rev:,.0f}\n\n"
            f"**ขั้นตอนปฏิบัติเพื่อกระตุ้นยอดขาย:**\n"
            f"1. **เน้นกระตุ้นการซื้อซ้ำ (Repeat Purchase):** ติดต่อฐานลูกค้าเดิมที่เคยซื้อ มอบสิทธิพิเศษสำหรับลูกค้าเก่า ต้นทุนถูกกว่าหาลูกค้าใหม่ถึง 5 เท่า\n"
            f"2. **ปรับกลยุทธ์ Bundling สินค้า:** จับคู่สินค้าขายดีกับสินค้ามาร์จิ้นสูง เพื่อเพิ่มยอดใช้จ่ายต่อบิล (AOV) ขึ้น 15-20%\n"
            f"3. **สร้างข้อเสนอจำกัดเวลา (Urgency Offer):** แคมเปญ Flash Promotion สำหรับสินค้าพร้อมส่งเพื่อดึงเงินสดเข้าธุรกิจใน 7 วัน"
        )
    else:
        answer = (
            f"📌 **ข้อแนะนำเชิงกลยุทธ์โดยรวม:**\n"
            f"จากการตรวจสอบสุขภาพการเงิน ปัจจุบันธุรกิจมีรายรับ ฿{tot_rev:,.0f} รายจ่าย ฿{tot_exp:,.0f} และระยะเวลาเงินสดหมุนเวียน {runway} เดือน\n\n"
            f"**สิ่งที่ควรโฟกัสในลำดับแรก:**\n"
            f"1. รักษาสภาพคล่องและเฝ้าระวังเงินสดสำรองไม่ให้ต่ำกว่า 3 เดือน\n"
            f"2. ติดตามอัตรากำไรสุทธิในทุกช่วงเวลา หากมีสัญญาณติดลบให้ปรับลดค่าใช้จ่ายทันที\n"
            f"3. ใช้ตารางและเครื่องมือจำลองในหน้า Forecast และ Reports เพื่อวางแผนงบประมาณล่วงหน้า"
        )

    return {"answer": answer, "source": "expert_cfo_matrix"}


def compute_financial_forecast(rows: list[dict], initial_cash: float, horizon_months: int = 6) -> dict:
    """
    Computes monthly historical timeline and linear regression + trend forecast
    for the next 6-12 months with projected cash balances and Thai insights.
    """
    if not rows:
        return {
            "timeline": [],
            "forecast": [],
            "forecast_summary": {}
        }

    # Group daily records by month (YYYY-MM)
    monthly_dict = {}
    for r in rows:
        m_key = r["date"].strftime("%Y-%m")
        if m_key not in monthly_dict:
            monthly_dict[m_key] = {
                "month": m_key,
                "revenue": 0.0,
                "expense": 0.0,
                "profit": 0.0,
                "net": 0.0
            }
        monthly_dict[m_key]["revenue"] += r.get("revenue", 0.0)
        monthly_dict[m_key]["expense"] += r.get("expense", 0.0)
        monthly_dict[m_key]["profit"] += r.get("profit", 0.0)
        monthly_dict[m_key]["net"] += r.get("net", 0.0)

    monthly_history = sorted(monthly_dict.values(), key=lambda x: x["month"])

    # Calculate rolling cash balance
    running_cash = float(initial_cash)
    for m in monthly_history:
        running_cash += m["profit"]
        m["cash_balance"] = round(running_cash, 2)
        m["revenue"] = round(m["revenue"], 2)
        m["expense"] = round(m["expense"], 2)
        m["profit"] = round(m["profit"], 2)
        m["net"] = round(m["net"], 2)
        m["is_forecast"] = False

    n_hist = len(monthly_history)
    forecast_records = []
    slope_rev = 0.0
    slope_exp = 0.0

    if n_hist > 0:
        if n_hist >= 2:
            x_vals = list(range(n_hist))
            x_mean = sum(x_vals) / n_hist

            y_rev = [m["revenue"] for m in monthly_history]
            y_rev_mean = sum(y_rev) / n_hist
            denom = sum((x - x_mean) ** 2 for x in x_vals) or 1.0
            slope_rev = sum((x_vals[i] - x_mean) * (y_rev[i] - y_rev_mean) for i in range(n_hist)) / denom
            intercept_rev = y_rev_mean - slope_rev * x_mean

            y_exp = [m["expense"] for m in monthly_history]
            y_exp_mean = sum(y_exp) / n_hist
            slope_exp = sum((x_vals[i] - x_mean) * (y_exp[i] - y_exp_mean) for i in range(n_hist)) / denom
            intercept_exp = y_exp_mean - slope_exp * x_mean
        else:
            slope_rev = 0.0
            intercept_rev = monthly_history[0]["revenue"]
            slope_exp = 0.0
            intercept_exp = monthly_history[0]["expense"]

        last_date_str = monthly_history[-1]["month"]
        last_year, last_month = [int(p) for p in last_date_str.split("-")]

        forecast_cash = running_cash
        max_horizon = max(horizon_months, 12)
        for step in range(1, max_horizon + 1):
            target_month_num = last_month + step
            pred_year = last_year + (target_month_num - 1) // 12
            pred_month = ((target_month_num - 1) % 12) + 1
            pred_month_str = f"{pred_year:04d}-{pred_month:02d}"

            x_idx = n_hist - 1 + step
            pred_rev = max(0.0, round(intercept_rev + slope_rev * x_idx, 2))
            pred_exp = max(0.0, round(intercept_exp + slope_exp * x_idx, 2))
            pred_profit = round(pred_rev - pred_exp, 2)
            forecast_cash += pred_profit

            forecast_records.append({
                "month": pred_month_str,
                "revenue": pred_rev,
                "expense": pred_exp,
                "profit": pred_profit,
                "net": pred_profit,
                "cash_balance": round(forecast_cash, 2),
                "is_forecast": True
            })

    sub_forecast = forecast_records[:horizon_months]
    tot_pred_rev = sum(f["revenue"] for f in sub_forecast)
    tot_pred_exp = sum(f["expense"] for f in sub_forecast)
    tot_pred_profit = sum(f["profit"] for f in sub_forecast)

    depleted_month = None
    for f in forecast_records:
        if f["cash_balance"] <= 0:
            depleted_month = f["month"]
            break

    if n_hist >= 2:
        rev_trend_rate = round(
            (monthly_history[-1]["revenue"] - monthly_history[0]["revenue"])
            / (monthly_history[0]["revenue"] or 1.0) * 100,
            2
        )
        exp_trend_rate = round(
            (monthly_history[-1]["expense"] - monthly_history[0]["expense"])
            / (monthly_history[0]["expense"] or 1.0) * 100,
            2
        )
    else:
        rev_trend_rate = 0.0
        exp_trend_rate = 0.0

    forecast_summary = {
        "horizon_months": horizon_months,
        "historical_months_count": n_hist,
        "projected_next_month_revenue": forecast_records[0]["revenue"] if forecast_records else 0.0,
        "projected_next_month_expense": forecast_records[0]["expense"] if forecast_records else 0.0,
        "projected_next_month_profit": forecast_records[0]["profit"] if forecast_records else 0.0,
        "projected_total_revenue": round(tot_pred_rev, 2),
        "projected_total_expense": round(tot_pred_exp, 2),
        "projected_total_profit": round(tot_pred_profit, 2),
        "projected_end_cash": sub_forecast[-1]["cash_balance"] if sub_forecast else running_cash,
        "depleted_month": depleted_month,
        "revenue_growth_rate": rev_trend_rate,
        "expense_growth_rate": exp_trend_rate,
        "monthly_revenue_slope": round(slope_rev, 2) if n_hist > 0 else 0.0,
        "monthly_expense_slope": round(slope_exp, 2) if n_hist > 0 else 0.0,
    }

    forecast_insights = []
    if slope_rev > 0:
        forecast_insights.append(f"รายรับมีแนวโน้มเติบโตเฉลี่ย +฿{abs(round(slope_rev, 0)):,.0f}/เดือน จากการวิเคราะห์ข้อมูลจริง")
    elif slope_rev < 0:
        forecast_insights.append(f"รายรับมีแนวโน้มชะลอตัวลงเฉลี่ย -฿{abs(round(slope_rev, 0)):,.0f}/เดือน ควรวางแผนกลยุทธ์การตลาดและเพิ่มช่องทางขาย")
    else:
        forecast_insights.append("รายรับมีเสถียรภาพสม่ำเสมอในแต่ละช่วงเวลา")

    if slope_exp > slope_rev and slope_exp > 0:
        forecast_insights.append(f"อัตราการเพิ่มขึ้นของค่าใช้จ่ายสูงกว่ารายได้ (+฿{abs(round(slope_exp, 0)):,.0f}/เดือน) อาจกดดันกำไรสุทธิในระยะยาว")
    elif slope_exp <= 0:
        forecast_insights.append("สามารถควบคุมต้นทุนได้ดี ค่าใช้จ่ายมีแนวโน้มลดลงหรือทรงตัวต่อเนื่อง")

    if depleted_month:
        forecast_insights.append(f"⚠️ จุดวิกฤต: คาดว่าเงินสดอาจหมดลงในเดือน {depleted_month} หากไม่มีการปรับโครงสร้างต้นทุนหรือระดมทุนเพิ่ม")
    elif sub_forecast and sub_forecast[-1]["cash_balance"] > running_cash:
        forecast_insights.append("สภาพคล่องทางการเงินแข็งแกร่ง กระแสเงินสดสะสมขยายตัวต่อเนื่อง มีศักยภาพในการลงทุนเพิ่ม")
    else:
        forecast_insights.append("กระแสเงินสดยังคงหมุนเวียนได้ แต่ควรติดตามค่าใช้จ่ายและรักษาเงินสดสำรองอย่างสม่ำเสมอ")

    forecast_summary["insights"] = forecast_insights

    return {
        "timeline": monthly_history,
        "forecast": forecast_records,
        "forecast_summary": forecast_summary
    }



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

    # Run the upgraded AI CFO Strategic Decision Engine
    metrics_summary = {
        "total_revenue": round(total_revenue, 2),
        "total_expense": round(total_expense, 2),
        "profit_loss": round(profit_loss, 2),
        "revenue_change_percent": round(revenue_change_percent, 2),
        "expense_change_percent": round(expense_change_percent, 2),
        "cash_runway_months": round(cash_runway, 2) if cash_runway is not None else None,
        "business_health_score": score,
        "business_status": status,
    }
    smart_plan = generate_smart_strategic_plan(metrics_summary)
    recommendation_source = smart_plan.get("source", "expert_cfo_matrix")
    if smart_plan.get("recommendations"):
        recommendations = smart_plan.get("recommendations")
    strategic_action_plan = smart_plan.get("strategic_action_plan", [])
    ai_assessment = smart_plan.get("ai_assessment", {})

    # ------------------------------------------
    # Financial forecast & timeline
    # ------------------------------------------

    forecast_data = compute_financial_forecast(rows, data.initial_cash)

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

        "recommendations": recommendations,
        "strategic_action_plan": strategic_action_plan,
        "ai_assessment": ai_assessment,
        "timeline": forecast_data["timeline"],
        "forecast": forecast_data["forecast"],
        "forecast_summary": forecast_data["forecast_summary"]
    }


# ==========================================
# EMAIL NOTIFICATIONS
# POST /send-notification-email
# ==========================================

class EmailNotificationRequest(BaseModel):
    email: str | None = None
    subject: str = "แจ้งเตือนสถานะธุรกิจจาก BusinessPilot AI"
    notifications: list[dict] = []
    business_status: str | None = None
    health_score: float | int | None = None


class ExecutiveReportEmailRequest(BaseModel):
    email: str
    subject: str = "สรุปภาพรวมธุรกิจสำหรับผู้บริหาร | BusinessPilot"
    dataset_name: str = "ชุดข้อมูลธุรกิจ"
    period: str = "ช่วงข้อมูลทั้งหมด"
    total_revenue: float = 0
    total_expense: float = 0
    net_profit: float = 0
    profit_margin_percent: float = 0
    monthly_burn_rate: float = 0
    cash_runway_months: float | None = None
    revenue_change_percent: float = 0
    expense_change_percent: float = 0
    business_status: str = "ยังไม่มีสถานะ"
    health_score: float = 0
    recommendations: list[str] = []


@app.post("/send-report-email")
def send_executive_report_email(
    payload: ExecutiveReportEmailRequest,
    current_user=Depends(get_current_user)
):
    recipient = payload.email.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
        raise HTTPException(status_code=400, detail="กรุณาระบุอีเมลผู้รับให้ถูกต้อง")

    sendlib_key = os.getenv("SENDLIB_API_KEY", "").strip()
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    smtp_host = "" if sendlib_key else os.getenv("SMTP_HOST", "").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_configured = bool(smtp_host and smtp_user and smtp_password)
    if not smtp_configured and not (sendlib_key or resend_key):
        raise HTTPException(status_code=503, detail="ตั้งค่า SMTP_HOST, SMTP_USER, SMTP_PASSWORD หรือ RESEND_API_KEY และ RESEND_FROM ก่อน")

    def money(value):
        return f"฿{value:,.0f}"

    profit_label = "กำไรสุทธิ" if payload.net_profit >= 0 else "ขาดทุนสุทธิ"
    runway = f"{payload.cash_runway_months:.1f} เดือน" if payload.cash_runway_months is not None else "ไม่ระบุ / กระแสเงินสดเป็นบวก"
    recommendations = [str(item).strip()[:500] for item in payload.recommendations[:5] if str(item).strip()]
    rec_plain = "\n".join(f"• {item}" for item in recommendations) or "• ไม่มีข้อเสนอแนะเพิ่มเติม"
    rec_html = "".join(f"<li style=\"margin:8px 0\">{html.escape(item)}</li>" for item in recommendations) or "<li>ไม่มีข้อเสนอแนะเพิ่มเติม</li>"
    values = {
        "dataset": html.escape(payload.dataset_name[:200]),
        "period": html.escape(payload.period[:100]),
        "status": html.escape(payload.business_status[:100]),
        "health": f"{payload.health_score:g}/100",
        "revenue": money(payload.total_revenue),
        "expense": money(payload.total_expense),
        "profit_label": profit_label,
        "profit": money(abs(payload.net_profit)),
        "margin": f"{payload.profit_margin_percent:.1f}%",
        "burn": money(payload.monthly_burn_rate),
        "runway": runway,
        "rev_trend": f"{payload.revenue_change_percent:+.1f}%",
        "exp_trend": f"{payload.expense_change_percent:+.1f}%",
    }
    plain = (
        "สรุปภาพรวมธุรกิจสำหรับผู้บริหาร\n"
        f"ชุดข้อมูล: {payload.dataset_name}\nช่วงเวลา: {payload.period}\nสถานะ: {payload.business_status} | คะแนนสุขภาพ {values['health']}\n\n"
        f"รายรับรวม: {values['revenue']}\nค่าใช้จ่ายรวม: {values['expense']}\n{profit_label}: {values['profit']}\n"
        f"อัตรากำไรสุทธิ: {values['margin']}\nแนวโน้มรายรับ: {values['rev_trend']} | แนวโน้มค่าใช้จ่าย: {values['exp_trend']}\n"
        f"อัตราใช้เงินสดต่อเดือน: {values['burn']}\nเงินสดรองรับได้: {values['runway']}\n\nข้อเสนอแนะสำคัญ\n{rec_plain}\n\nจัดทำโดย BusinessPilot AI"
    )
    profit_color = "#059669" if payload.net_profit >= 0 else "#dc2626"
    html_body = f"""<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,'Noto Sans Thai',sans-serif;color:#0f172a">
    <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden">
      <div style="background:#0f172a;color:#fff;padding:26px 30px"><div style="font-size:13px;color:#67e8f9">BUSINESSPILOT AI · EXECUTIVE BRIEF</div><h1 style="font-size:22px;margin:10px 0">สรุปภาพรวมธุรกิจสำหรับผู้บริหาร</h1><div style="color:#cbd5e1">{values['dataset']} · {values['period']}</div></div>
      <div style="padding:24px 30px"><div style="padding:14px;background:#ecfeff;border-radius:10px;margin-bottom:18px"><b>สถานะธุรกิจ:</b> {values['status']} &nbsp; <b>คะแนนสุขภาพ:</b> {values['health']}</div>
      <table style="border-collapse:collapse;width:100%"><tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">รายรับรวม</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right"><b>{values['revenue']}</b></td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">ค่าใช้จ่ายรวม</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right"><b>{values['expense']}</b></td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">{profit_label}</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;color:{profit_color}"><b>{values['profit']}</b></td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">อัตรากำไรสุทธิ</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right">{values['margin']}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">แนวโน้มรายรับ / ค่าใช้จ่าย</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right">{values['rev_trend']} / {values['exp_trend']}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0">อัตราใช้เงินสดต่อเดือน</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right">{values['burn']}</td></tr>
      <tr><td style="padding:12px">เงินสดรองรับได้</td><td style="padding:12px;text-align:right">{values['runway']}</td></tr></table>
      <h2 style="font-size:17px;margin:24px 0 8px">ข้อเสนอแนะสำคัญ</h2><ul style="padding-left:22px;line-height:1.6">{rec_html}</ul>
      <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px">รายงานนี้จัดทำจากข้อมูลที่อัปโหลด โปรดใช้ประกอบการพิจารณาร่วมกับข้อมูลบัญชีจริง</p></div></div></body></html>"""

    message = EmailMessage()
    message["Subject"] = payload.subject[:180]
    message["From"] = os.getenv("SMTP_FROM", smtp_user).strip()
    message["To"] = recipient
    message.set_content(plain)
    message.add_alternative(html_body, subtype="html")
    if smtp_configured:
        try:
            with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=20) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(message)
        except Exception as exc:
            print(f"Report email delivery failed: {type(exc).__name__}: {exc}")
            raise HTTPException(status_code=502, detail="ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า SMTP หรืออีเมลผู้รับ")
    else:
        _deliver_email_via_resend(recipient, payload.subject[:180], plain, html_body)

    return {"success": True, "recipient": recipient, "delivery_status": "sent", "message": "ส่งรายงานผู้บริหารสำเร็จแล้ว", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/send-notification-email")
def send_notification_email(
    payload: EmailNotificationRequest,
    current_user=Depends(get_current_user)
):
    recipient = payload.email
    if not recipient:
        db = SessionLocal()
        user = db.query(User).filter(User.id == current_user["user_id"]).first()
        recipient = user.email if user else None
        db.close()

    if not recipient or "@" not in recipient:
        raise HTTPException(status_code=400, detail="Invalid recipient email address")

    sendlib_key = os.getenv("SENDLIB_API_KEY", "").strip()
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    smtp_host = "" if sendlib_key else os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM", smtp_user or "alerts@businesspilot.ai").strip()

    alert_items_html = ""
    for n in payload.notifications:
        title = n.get("title") or n.get("head") or "การแจ้งเตือน"
        desc = n.get("message") or n.get("body") or n.get("text") or ""
        level = n.get("level") or "info"
        color = "#ef4444" if level in ("danger", "warn", "critical") else "#06b6d4"
        alert_items_html += f"""
        <div style="background:#1e293b;border-left:4px solid {color};padding:14px;border-radius:8px;margin-bottom:12px;">
            <strong style="color:#ffffff;font-size:15px;">{title}</strong>
            <p style="color:#cbd5e1;margin:6px 0 0;font-size:13px;line-height:1.5;">{desc}</p>
        </div>
        """

    html_content = f"""
    <div style="font-family:'Segoe UI',Roboto,Helvetica,sans-serif;background:#0b1120;color:#f8fafc;padding:30px;max-width:600px;margin:auto;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#fff;font-weight:bold;font-size:20px;padding:8px 16px;border-radius:12px;margin-bottom:10px;">AI BusinessPilot</div>
            <h2 style="margin:0;color:#ffffff;font-size:22px;">รายงานการแจ้งเตือนสุขภาพธุรกิจ</h2>
            <p style="color:#94a3b8;font-size:13px;margin:4px 0 0;">อัปเดต ณ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>
        </div>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
                <span style="color:#94a3b8;">คะแนนสุขภาพธุรกิจ:</span>
                <strong style="color:#38bdf8;">{payload.health_score or '—'}/100 ({payload.business_status or 'วิเคราะห์แล้ว'})</strong>
            </div>
            {alert_items_html or '<p style="color:#94a3b8;">ไม่มีรายการแจ้งเตือนด่วน</p>'}
        </div>
        <div style="text-align:center;font-size:12px;color:#64748b;margin-top:24px;">
            <p>ส่งจากระบบแจ้งเตือนอัตโนมัติ BusinessPilot AI ถึง {recipient}</p>
        </div>
    </div>
    """

    email_sent = False
    delivery_note = ""

    if smtp_host and smtp_user and smtp_password:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = payload.subject
            msg["From"] = smtp_from
            msg["To"] = recipient
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
            email_sent = True
            delivery_note = f"ส่งอีเมลแจ้งเตือนไปยัง {recipient} ผ่านเซิร์ฟเวอร์ SMTP สำเร็จแล้ว"
        except Exception as exc:
            print(f"Notification email delivery failed: {type(exc).__name__}: {exc}")
            raise HTTPException(status_code=502, detail="ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า SMTP หรืออีเมลผู้รับ")
    elif sendlib_key or resend_key:
        text_body = "รายงานการแจ้งเตือนสุขภาพธุรกิจ\n" + "\n".join(
            f"- {n.get('title') or n.get('head') or 'การแจ้งเตือน'}: {n.get('message') or n.get('body') or n.get('text') or ''}"
            for n in payload.notifications
        )
        _deliver_email_via_resend(recipient, payload.subject, text_body, html_content)
        email_sent = True
        delivery_note = f"ผู้ให้บริการ Resend รับอีเมลแจ้งเตือนสำหรับ {recipient} แล้ว"
    else:
        raise HTTPException(status_code=503, detail="ตั้งค่า SMTP_HOST, SMTP_USER, SMTP_PASSWORD หรือ RESEND_API_KEY และ RESEND_FROM ก่อน")

    return {
        "success": True,
        "recipient": recipient,
        "delivery_status": "sent" if email_sent else "queued",
        "message": delivery_note,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "alerts_count": len(payload.notifications)
    }


# ==========================================
# AI CFO COPILOT CHAT ADVISOR
# POST /ai/chat-advisor
# ==========================================

class ChatAdvisorRequest(BaseModel):
    question: str
    context: dict | None = None


@app.post("/ai/chat-advisor")
def chat_advisor(
    payload: ChatAdvisorRequest,
    current_user=Depends(get_current_user)
):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(
            status_code=400,
            detail="กรุณาระบุคำถามที่ต้องการปรึกษา AI CFO"
        )

    context = payload.context or {}
    result = ask_ai_cfo_advisor(question, context)
    return {
        "success": True,
        "question": question,
        "answer": result.get("answer", ""),
        "source": result.get("source", "expert_cfo_matrix"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
