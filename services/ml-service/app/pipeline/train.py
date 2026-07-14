from __future__ import annotations

import io
import time
from typing import Any

import joblib
import numpy as np

from app import storage
from app.config import settings
from app.metrics.compute import train_and_evaluate
from app.models.factory import make_model
from app.pipeline.preprocess import load_xy


def train_one(payload: dict[str, Any]) -> dict[str, Any]:
    experiment_id = payload["experiment_id"]
    model_name = payload["model_name"]
    problem_type = payload["problem_type"]
    artifacts = payload["artifacts"]
    seed = int(payload.get("seed", 42))
    cv_folds = int(payload.get("cv_folds", 5))

    X_train, y_train = load_xy(artifacts, "train")
    X_test, y_test = load_xy(artifacts, "test")

    model, family, hyperparams = make_model(model_name, problem_type, seed)
    result = train_and_evaluate(
        model, X_train, y_train, X_test, y_test, problem_type, cv_folds=cv_folds
    )

    # Serialize model produced by us only
    model_key = f"experiments/{experiment_id}/models/{model_name}.joblib"
    buf = io.BytesIO()
    joblib.dump({"model": model, "model_name": model_name, "family": family}, buf)
    raw = buf.getvalue()
    storage.put_bytes(model_key, raw, "application/octet-stream")
    size_kb = len(raw) / 1024.0

    feature_names = [f"f{i}" for i in range(X_train.shape[1])]
    meta_key = artifacts.get("splitMetaKey") or artifacts.get("split_meta_key")
    if meta_key:
        try:
            import json

            meta = json.loads(storage.get_bytes(settings.minio_bucket, meta_key))
            feature_names = meta.get("feature_names") or feature_names
        except Exception:
            pass

    return {
        "hyperparams": hyperparams,
        "metrics": result["metrics"],
        "primary_score": result["primary_score"],
        "timing": result["timing"],
        "resources": {
            "modelSizeKb": size_kb,
            "peakMemoryMb": None,
            "nParams": None,
        },
        "artifacts": {
            "modelKey": model_key,
            "model_key": model_key,
        },
        "feature_names": feature_names,
        "n_features_in": int(X_train.shape[1]),
        "model_family": family,
    }


def robustness_eval(payload: dict[str, Any]) -> dict[str, Any]:
    """Lightweight robustness: feature noise retention + seed re-eval proxy."""
    problem_type = payload["problem_type"]
    artifacts = payload["artifacts"]
    model_key = artifacts.get("model_key") or artifacts.get("modelKey")
    seed = int(payload.get("seed", 42))
    primary_score = float(payload.get("primary_score") or 0.0)

    if not model_key or not str(model_key).startswith("experiments/"):
        raise ValueError("Invalid model artifact path")

    raw = storage.get_bytes(settings.minio_bucket, model_key)
    bundle = joblib.load(io.BytesIO(raw))
    model = bundle["model"]

    X_test, y_test = load_xy(artifacts, "test")
    rng = np.random.default_rng(seed)

    clean_pred = model.predict(X_test)
    if problem_type == "regression":
        from sklearn.metrics import r2_score

        clean = max(0.0, float(r2_score(y_test, clean_pred)))
    else:
        from sklearn.metrics import f1_score

        clean = float(f1_score(y_test, clean_pred, average="macro", zero_division=0))

    levels = [0.05, 0.1]
    scores = []
    for sigma in levels:
        noise = rng.normal(0.0, sigma, size=X_test.shape).astype(np.float32)
        # scale noise by feature std
        std = X_test.std(axis=0) + 1e-6
        Xn = X_test + noise * std
        pred = model.predict(Xn)
        if problem_type == "regression":
            from sklearn.metrics import r2_score

            s = max(0.0, float(r2_score(y_test, pred)))
        else:
            from sklearn.metrics import f1_score

            s = float(f1_score(y_test, pred, average="macro", zero_division=0))
        scores.append(s)

    retentions = [min(1.0, s / (clean + 1e-9)) for s in scores]
    summary = float(np.mean(retentions)) if retentions else 0.5
    # blend with primary stability prior
    summary = float(0.7 * summary + 0.3 * min(1.0, primary_score))

    return {
        "status": "COMPLETED",
        "featureNoise": {"levels": levels, "scores": scores, "retentions": retentions},
        "seedSensitivity": {"seeds": [seed], "scores": [clean], "std": 0.0},
        "summaryScore": summary,
        "summary_score": summary,
    }
