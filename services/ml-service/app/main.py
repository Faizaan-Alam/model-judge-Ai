from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.mjs.score import score_models
from app.pipeline.explain import explain_model
from app.pipeline.preprocess import apply_preprocess, build_plan
from app.pipeline.profile import profile_csv
from app.pipeline.train import robustness_eval, train_one
from app.security import require_service_token
from app import storage

app = FastAPI(title="ModelJudge ML Service", version="0.1.0", docs_url="/docs")


@app.on_event("startup")
def _startup() -> None:
    try:
        storage.ensure_bucket()
    except Exception as e:
        print(f"[ml] minio ensure failed: {e}")


@app.get("/health")
def health() -> dict[str, Any]:
    import sklearn
    import numpy

    versions = {
        "sklearn": sklearn.__version__,
        "numpy": numpy.__version__,
        "mjs": settings.mjs_version,
    }
    try:
        import shap
        import xgboost

        versions["shap"] = shap.__version__
        versions["xgboost"] = xgboost.__version__
    except Exception:
        pass
    return {"status": "ok", "versions": versions}


def _err(code: str, message: str, status: int = 400) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@app.post("/v1/profile")
def api_profile(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        bucket = body.get("bucket") or settings.minio_bucket
        key = body["key"]
        data = storage.get_bytes(bucket, key)
        return profile_csv(data)
    except Exception as e:
        raise _err("PROFILE_FAILED", str(e), 500) from e


@app.post("/v1/preprocess/plan")
def api_plan(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        plan = build_plan(
            columns=body.get("columns") or [],
            problem_type=body["problem_type"],
            target_column=body["target_column"],
            feature_columns=body["feature_columns"],
        )
        return {"plan": plan}
    except Exception as e:
        raise _err("PLAN_FAILED", str(e), 400) from e


@app.post("/v1/preprocess/apply")
def api_apply(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        bucket = body.get("bucket") or settings.minio_bucket
        raw = storage.get_bytes(bucket, body["raw_key"])
        return apply_preprocess(
            raw_bytes=raw,
            plan=body["plan"],
            experiment_id=body["experiment_id"],
            test_size=float(body.get("test_size", 0.2)),
            split_seed=int(body.get("split_seed", 42)),
            max_rows=body.get("max_rows"),
        )
    except Exception as e:
        raise _err("PREPROCESS_FAILED", str(e), 500) from e


@app.post("/v1/train/one")
def api_train(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        return train_one(body)
    except Exception as e:
        raise _err("TRAIN_FAILED", str(e), 500) from e


@app.post("/v1/evaluate/robustness")
def api_robust(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        return robustness_eval(body)
    except Exception as e:
        raise _err("ROBUSTNESS_FAILED", str(e), 500) from e


@app.post("/v1/score/mjs")
def api_mjs(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        return score_models(body)
    except Exception as e:
        raise _err("MJS_FAILED", str(e), 500) from e


@app.post("/v1/explain")
def api_explain(body: dict[str, Any], _: None = Depends(require_service_token)) -> dict[str, Any]:
    try:
        return explain_model(body)
    except Exception as e:
        raise _err("EXPLAIN_FAILED", str(e), 500) from e


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content={"error": detail})
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "ERROR", "message": str(detail)}},
    )
