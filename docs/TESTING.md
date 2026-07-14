# Phase 8 — Testing Strategy

## Test pyramid

| Layer | Location | Runner | Scope |
|-------|----------|--------|-------|
| MJS math & ML units | `services/ml-service/tests/` | pytest | score, entropy, profile, train, security paths, FastAPI auth |
| Shared Zod/enums | `packages/shared/src/schemas.test.ts` | tsx | weights sum, experiment schema, model zoo |
| API units | `apps/api/src/test/` | tsx | JWT, bcrypt, Zod, start-status gate |
| Worker logic | `apps/worker/src/test/` | tsx | top-K, partial status, recommendation text, families |
| Web pure helpers | `apps/web/src/lib/*.test.ts` | tsx | weight renormalize, status colors |

## Commands

```bash
# all (requires ml-service venv)
npm test

# pieces
npm run test -w @modeljudge/shared
npm run test -w @modeljudge/api
npm run test -w @modeljudge/worker
npm run test -w @modeljudge/web
cd services/ml-service && source .venv/bin/activate && pytest -q
```

## What is deliberately not in CI (yet)

- Full Docker Compose e2e (needs long ML train)
- Playwright browser e2e
- Live MinIO integration for every train path (preprocess apply is mocked in unit tests)

## Manual smoke (recommended before demo)

1. `docker compose up -d mongo redis minio minio-init`
2. Start ml-service, api, worker, web
3. Register → upload `scripts/sample_data.csv` → experiment with 3 models + fast mode → COMPLETED
4. Re-run with fast mode off → explanations tab populated
5. Confirm ranking ≠ accuracy-only on a mixed zoo

## Research-aligned assertions

Tests encode thesis claims:

1. Weights must sum to 1  
2. Minmax equal models → dimension score 1  
3. Efficiency favors faster/smaller when else equal  
4. Intrinsic explainability: linear > boosting prior  
5. Post-hoc quality overrides prior  
6. Entropy weights sum to 1  
7. Accuracy-first weights can change rank-1  
8. Artifact paths outside `experiments/` are rejected  
9. ML routes require service token  
10. Partial completion status rules  
