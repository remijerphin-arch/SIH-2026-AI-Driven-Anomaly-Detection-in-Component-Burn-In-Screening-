# AEGIS — AI-Driven Component Reliability & Anomaly Detection

SIH 26170 prototype for **AI-Driven Anomaly Detection in Component Burn-In & Screening**.

The application starts with an empty analysis workspace. Results are created only after an aerospace telemetry or component-test dataset is uploaded. It is **not** an official ISRO system and does **not** use confidential ISRO datasets.

A component can stay under a datasheet limit (for example 50 µA leakage) while drifting far faster than its lot. AEGIS combines specification checks, lot-relative statistics, trend/drift analysis, Isolation Forest scoring, and 168-hour prediction so those units can be flagged before they become failures.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts, Lucide |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| ML | scikit-learn IsolationForest + RandomForestRegressor, robust z-score (MAD) |
| Database | SQLite (swap `DATABASE_URL` later for PostgreSQL/Supabase) |

## Quick start

Requires Python 3.11+ and Node.js 20+.

### 1. API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On first start the API creates the database schema and waits for an uploaded dataset.

Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) for interactive API docs.

### 2. Console

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` to port 8000.

### 3. Analysis workflow

1. Upload a CSV, XLSX, XLS, or JSON dataset from **Data intake**.
2. Preview and validate the dataset, then ingest it and run analysis.
3. Review calculated anomaly scores, trends, alerts, and explanations.
4. Generate a print-friendly engineering report from the analyzed records.

## Architecture

```
Uploaded aerospace telemetry or component test data
        ↓
   SQLite feature store
        ↓
 Isolation Forest  +  Random Forest (168h)  +  robust z / drift layers
        ↓
      Risk engine (transparent 0–100 score)
        ↓
  Dashboard · alerts · reports
```

Model trainers live in `backend/app/ml/`. `registry.py` lists planned replacements (XGBoost, LSTM, GRU) without changing API routes.

## Risk engine

Weighted combination of:

1. Specification proximity / violation  
2. Lot-relative robust deviation  
3. Trend / acceleration  
4. Isolation Forest anomaly score  
5. Predicted 168h vs limit  

Default bands (Settings): 0–30 SAFE · 31–60 WARNING · 61–80 ANOMALY · 81–100 REJECTED.

## API (prefix `/api`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/dashboard` | KPIs, charts, alerts |
| GET | `/components` | Filterable inventory |
| GET | `/components/{id}` | Detail + explanations |
| GET | `/alerts` | Alert feed |
| GET | `/batches` | Lots |
| POST | `/analyze` | Fit models + score fleet |
| POST | `/predict` | 168h prediction for a unit |
| POST | `/upload/preview` | Validate uploaded dataset |
| POST | `/upload` | Ingest dataset + analyze |
| GET | `/analytics` | Fleet stats + correlation |
| GET | `/burn-in` | In-progress units (`?live=true` ticks readings) |
| GET/PUT | `/settings` | Limits and thresholds |
| POST/GET | `/reports/{id}` | Screening reports |
| GET | `/export` | JSON export of scores |

## Configuration

Copy `backend/.env.example` to `backend/.env`. Do not commit secrets. SQLite is the default; point `DATABASE_URL` at PostgreSQL when you are ready.

CSV uploads are size-limited (`MAX_CSV_BYTES`) and must include `component_id`, `batch_id`, and `test_hour`. Missing numeric columns are filled with documented defaults and surfaced as warnings — they are not silently ignored when a required column is absent.

## Project layout

```
frontend/src/{pages,components,lib}
backend/app/{api,ml,services,models,database,utils}
data/sample/
```
