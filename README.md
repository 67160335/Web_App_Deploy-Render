# BusinessPilot AI

## Project layout

- `main.py`: FastAPI entry point.
- `requirements.txt`: Python dependencies.
- `frontend/pages/`: static HTML pages.
- `frontend/assets/css/`: stylesheets.
- `frontend/assets/js/`: browser scripts.
- `data/businesspilot.db`: runtime SQLite database.
- `data/uploads/`: uploaded CSV files.
- `data/samples/`: example CSV files.
- `data/backups/legacy_b_backup.zip`: backup archive created before removing the legacy `B/` directory.
- `data/backups/legacy_root_database.db`: backup of the old root database.

## Frontend pages

`landing.html`, `login.html`, `register.html`, `upload_data.html`, `dashboard.html`, `business_health.html`, `forecast.html`, `scenario.html`, `recommendation.html`, `report.html`, `notification.html`, and `settings.html`.

## Run locally

1. Install dependencies: `py -m pip install -r requirements.txt`
2. Start API: `py -m uvicorn main:app --reload`
3. Open `http://127.0.0.1:8000/docs` and check `GET /health`.
4. Serve `frontend/pages/` using a local static web server. The frontend defaults to the deployed API URL; set `localStorage.api_url` to override it.

The API stores its database at `data/businesspilot.db` and uploaded CSV files at `data/uploads/`. A legacy `database.db` may remain in the project root while an older local server process holds it open; the startup migration fallback can copy it into `data/` if needed. CSV dates currently use `YYYY-MM-DD` format. The upload page supports mapping date, revenue, expense, and profit columns, including automatic profit calculation.

## Docker deployment (required runtime)

1. Install Docker Desktop and ensure its engine is running.
2. Copy `.env.example` to `.env` and replace `SECRET_KEY` with a long random secret.
3. Build and start the API and local Ollama model server: `docker compose up -d --build`.
4. Download the model once: `docker compose exec ollama ollama pull qwen2.5:3b`.
5. Check API docs at `http://localhost:8000/docs` and health at `http://localhost:8000/health`.
6. View logs with `docker compose logs -f backend`; stop with `docker compose down`.

The backend calls Ollama over the private Compose network. The model is downloaded into the persistent `ollama_data` volume; SQLite data and uploaded CSV files persist under `data/`. If Ollama is not ready or unavailable, analysis falls back to the existing rule-based recommendations and returns `recommendation_source: rules`; successful local model recommendations return `recommendation_source: ollama`. The Ollama model is pretrained, not fine-tuned on project-specific data.

## Verification

- Full project check: `py scripts/verify_project.py`
- Syntax: `py -m py_compile main.py`
- API docs: `GET /docs`

## Known security limitations

The backend still needs password hashing, a secret-managed JWT key, restrictive CORS, per-user upload isolation, safer file naming, and persistent logout-token revocation before production use. Forecast and scenario pages are lightweight planning aids, not validated predictive models.
