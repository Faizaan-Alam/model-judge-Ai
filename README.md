# ModelJudge AI

Explainable multi-criteria evaluation framework for **tabular supervised** ML models.

**Core contribution:** ModelJudge Score (MJS) — composite of predictive performance, robustness, efficiency, explainability, and reproducibility — with weight justification (fixed / entropy) and full experiment lineage.

> **Not AutoML.** Fixed model zoo. Node/MERN owns product orchestration; **Python FastAPI** owns training, SHAP/LIME, and MJS math.

## Architecture

| Service | Role |
|---------|------|
| `apps/web` | React + TypeScript + Tailwind |
| `apps/api` | Express REST + Socket.io + JWT |
| `apps/worker` | BullMQ orchestration → ML service |
| `services/ml-service` | FastAPI: profile, preprocess, train, MJS, explain |
| MongoDB | Experiments, scores, explanations |
| Redis | BullMQ + socket bridge |
| MinIO | Datasets & model artifacts |

## Quick start (local dev)

### Prerequisites
- Node 20+
- Python 3.11+
- Docker (for mongo/redis/minio) **or** local installs

### 1. Infrastructure

```bash
docker compose up -d mongo redis minio minio-init
```

### 2. Environment

```bash
cp .env.example .env
# defaults work for local compose ports
```

### 3. Node workspaces

```bash
npm install
npm run build -w @modeljudge/shared
```

### 4. ML service

```bash
cd services/ml-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# point at local minio
export SERVICE_TOKEN=dev-ml-service-token-change-me
export MINIO_ENDPOINT=127.0.0.1
export MINIO_PORT=9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
uvicorn app.main:app --reload --port 8000
```

### 5. API + worker + web

```bash
# terminal A
export MONGODB_URI=mongodb://127.0.0.1:27017/modeljudge
export REDIS_URL=redis://127.0.0.1:6379
export ML_SERVICE_URL=http://127.0.0.1:8000
export MINIO_ENDPOINT=127.0.0.1
npm run dev:api

# terminal B
export MONGODB_URI=mongodb://127.0.0.1:27017/modeljudge
export REDIS_URL=redis://127.0.0.1:6379
export ML_SERVICE_URL=http://127.0.0.1:8000
npm run dev:worker

# terminal C
npm run dev:web
```

Open http://localhost:5173 → register → upload CSV → new experiment → view MJS radar & rankings.

### Full Docker Compose

```bash
docker compose up --build
```

- Web: http://localhost:5173  
- API: http://localhost:4000  
- ML docs: http://localhost:8000/docs (internal token required for data routes)

## Sample data

A tiny synthetic CSV:

```csv
age,income,hours,label
25,30000,40,0
45,80000,50,1
32,45000,38,0
51,90000,45,1
28,35000,40,0
60,120000,55,1
```

Use `label` as target, binary classification, select a few models, optionally enable **fast mode**.

## MJS (v1.0.0)

\[
MJS_i = \sum_d w_d \tilde{s}_{i,d}
\]

Dimensions normalized with **minmax across models** in the experiment. Default fixed weights: performance 0.35, robustness 0.20, efficiency 0.15, explainability 0.15, reproducibility 0.15. Entropy weighting available in the ML `/v1/score/mjs` API.

## Security notes

- Client never calls the ML service.
- ML rejects loads outside `experiments/` artifact paths.
- Do not load user-uploaded pickle models.
- Change `JWT_SECRET` and `SERVICE_TOKEN` before any shared deployment.

## Testing

```bash
npm run test -w @modeljudge/shared
npm run test -w @modeljudge/api
npm run test -w @modeljudge/worker
npm run test -w @modeljudge/web
cd services/ml-service && source .venv/bin/activate && pytest -q
# or: npm test   (all of the above if venv exists)
```

See [docs/TESTING.md](docs/TESTING.md) for the test pyramid and research-aligned assertions.

## Project phases

1. Literature review (complete)  
2. Architecture (complete)  
3. Mongo schema (complete)  
4. ML pipeline design (complete)  
5. Frontend design (complete)  
6. Express integration design (complete)  
7. Implementation (complete)  
8. **Testing (complete)**  
9. Deployment polish  
10. Research paper  

## License

Academic / college project use.
