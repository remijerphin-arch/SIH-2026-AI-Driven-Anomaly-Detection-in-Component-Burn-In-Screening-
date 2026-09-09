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
python -m uvicorn app.main:app --app-dir . --reload --host 127.0.0.1 --port 8000
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

### Deploy frontend to Vercel and API to Render

Deploy the `frontend` directory as the Vercel project root. In Vercel project settings, set:

```text
VITE_API_URL=https://<your-render-service>.onrender.com
```

Do not include a trailing slash. Redeploy Vercel after changing this variable because Vite embeds it during the frontend build. The checked-in `frontend/vercel.json` keeps React Router routes working after refresh.

For Render, either use the checked-in `render.yaml` or configure the service with root directory `backend`, build command `pip install -r requirements.txt`, and start command `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set:

```text
CORS_ORIGINS=https://<your-vercel-domain>,https://<your-vercel-project>.vercel.app
```

The API also permits Vercel preview origins matching `https://*.vercel.app`. Verify deployment before uploading by opening `https://<your-render-service>.onrender.com/api/health`; it must return JSON with `ok: true`.

### 3. Analysis workflow

1. Start with the empty **No dataset loaded** state.
2. Upload a CSV, XLSX, XLS, JSON, TXT, or ZIP dataset from **Data intake**, or choose **Load Demo Dataset** to use the real local `Dataset/train_FD001.txt` benchmark file.
3. Review validation, detected schema, quality metadata, and preview data, then click **Run Analysis**.
4. Review calculated anomaly scores, trends, alerts, analytics, and explanations.
5. Generate a print-friendly engineering report, or use **Clear Dataset** to return to the empty state.

Reports generate analysis automatically when a selected component has not been analyzed yet. The report view includes the selected component's measured history, model layer scores, explanations, prediction context, and recommendation. Use **Download report** for the actual JSON report payload or **Print / Save PDF** for a browser-generated PDF.

The demo is never loaded automatically. C-MAPSS whitespace-separated files are detected without conversion and mapped from their real source columns into the screening schema. User datasets are classified as component screening, C-MAPSS, time series, generic engineering, or tabular engineering. Component screening uses its required fields; generic datasets use detected numeric, group, and time fields and do not need component-only columns. Missing values are reported and are only median-imputed on a separate copy for generic model processing; original rows are preserved.

## Verified workflows

- Empty startup and `CLEAR DATASET` return `NO DATASET LOADED` with no stored results.
- Component/C-MAPSS uploads use the existing relational pipeline and replace the active dataset only after parsing succeeds.
- Generic datasets are stored as `DatasetSnapshot` records with source rows, schema mapping, metadata, quality counts, and deterministic Isolation Forest findings.
- C-MAPSS demo selection supports `FD001` through `FD004`; the UI defaults to `FD001`.
- Reports are persisted and downloadable from `/api/reports/{id}/download`.
- No original engineering values are generated or overwritten.

## Schema detection and metadata

`backend/app/services/schema_detection.py` detects aliases such as `asset_id`, `unit_id`, `component_id`, `timestamp`, `cycle`, `temp_c`, and `voltage_v`. It returns the detected classification, source-column mapping, numeric/categorical/time/group columns, row and column counts, group count, missing values, duplicate rows, and time bounds. The upload response uses that same parsed dataframe for both metadata and preview, preventing mismatched counts.

## Analysis methods

Component screening uses specification, lot-relative robust z-score, temporal trend, Isolation Forest, and Random Forest leakage prediction. Generic datasets use a RobustScaler and seeded Isolation Forest over detected numeric fields; median imputation exists only in the preprocessing matrix. Scores, severities, baselines, and explanations are derived from those outputs. The system does not use an LLM to create measurements, scores, identifiers, timestamps, or causes.

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
| GET | `/dataset/current` | Current persisted dataset schema, metadata, and analysis |
| GET | `/dashboard` | KPIs, charts, alerts |
| GET | `/components` | Filterable inventory |
| GET | `/components/{id}` | Detail + explanations |
| GET | `/alerts` | Alert feed |
| GET | `/batches` | Lots |
| POST | `/analyze` | Fit models + score fleet |
| POST | `/predict` | 168h prediction for a unit |
| POST | `/upload/preview` | Validate uploaded dataset |
| POST | `/upload` | Parse, validate, and ingest dataset |
| POST | `/demo?dataset=FD001` | Load and analyze a real local C-MAPSS demo dataset (`FD001`–`FD004`) |
| DELETE | `/dataset` | Clear active dataset, analysis results, and reports |
| GET | `/analytics` | Fleet stats + correlation |
| GET | `/burn-in` | In-progress units (`?live=true` ticks readings) |
| GET/PUT | `/settings` | Limits and thresholds |
| POST/GET | `/reports/{id}` | Screening reports |
| GET | `/reports/{id}/download` | Download the persisted report payload |
| GET | `/dataset/report/download` | Download a report for a generic dataset |
| GET | `/export` | JSON export of scores |

## Configuration

Copy `backend/.env.example` to `backend/.env`. Do not commit secrets. SQLite is the default; point `DATABASE_URL` at PostgreSQL when you are ready.

Uploads are size-limited (`MAX_CSV_BYTES`) and must include `component_id`, `batch_id`, `test_hour`, `component_type`, `temperature`, `voltage`, `current`, `pressure`, `vibration`, `resistance`, `leakage_current`, `propagation_delay`, and `capacitance`. Missing or invalid required fields fail validation; no engineering values are invented.

## Project layout

```
frontend/src/{pages,components,lib}
backend/app/{api,ml,services,models,database,utils}
data/sample/
```
