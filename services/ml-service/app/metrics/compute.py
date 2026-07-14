from __future__ import annotations

import time
from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score


def train_and_evaluate(
    model: Any,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    problem_type: str,
    cv_folds: int = 5,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    model.fit(X_train, y_train)
    train_ms = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    pred = model.predict(X_test)
    inference_ms = (time.perf_counter() - t1) * 1000

    metrics: dict[str, Any] = {}
    primary = 0.0

    if problem_type == "regression":
        rmse = float(np.sqrt(mean_squared_error(y_test, pred)))
        mae = float(mean_absolute_error(y_test, pred))
        r2 = float(r2_score(y_test, pred))
        metrics.update({"rmse": rmse, "mae": mae, "r2": r2})
        primary = max(0.0, min(1.0, r2))
        scoring = "r2"
    else:
        acc = float(accuracy_score(y_test, pred))
        f1m = float(f1_score(y_test, pred, average="macro", zero_division=0))
        metrics.update({"accuracy": acc, "f1_macro": f1m})
        primary = f1m
        # ROC AUC when possible
        try:
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(X_test)
                if proba.shape[1] == 2:
                    metrics["roc_auc"] = float(roc_auc_score(y_test, proba[:, 1]))
                    primary = metrics["roc_auc"]
                else:
                    metrics["roc_auc"] = float(
                        roc_auc_score(y_test, proba, multi_class="ovr", average="macro")
                    )
            elif hasattr(model, "decision_function"):
                df = model.decision_function(X_test)
                if len(np.unique(y_test)) == 2:
                    metrics["roc_auc"] = float(roc_auc_score(y_test, df))
                    primary = metrics["roc_auc"]
        except Exception:
            pass
        scoring = "f1_macro"

    # CV on train (bounded)
    folds = min(cv_folds, max(2, len(np.unique(y_train)) if problem_type != "regression" else cv_folds))
    folds = min(folds, len(y_train) // 2) if len(y_train) >= 4 else 2
    try:
        if folds >= 2 and len(y_train) >= folds:
            cv_scores = cross_val_score(model, X_train, y_train, cv=folds, scoring=scoring)
            metrics["cv"] = {
                "metricName": scoring,
                "foldScores": [float(x) for x in cv_scores],
                "mean": float(cv_scores.mean()),
                "std": float(cv_scores.std()),
            }
    except Exception as e:
        metrics["cv"] = {"error": str(e)}

    return {
        "metrics": metrics,
        "primary_score": float(primary),
        "timing": {
            "trainMs": train_ms,
            "inferenceMs": inference_ms,
            "inferenceN": int(len(X_test)),
        },
    }


def efficiency_raw(train_ms: float, inference_ms: float, size_kb: float) -> float:
    return float(
        (1.0 / (1.0 + np.log1p(train_ms)))
        * (1.0 / (1.0 + np.log1p(inference_ms)))
        * (1.0 / (1.0 + np.log1p(size_kb)))
    )


INTRINSIC_EXPLAIN = {
    "linear": 0.90,
    "tree": 0.75,
    "bayes": 0.70,
    "boosting": 0.40,
    "svm": 0.35,
    "neighbor": 0.35,
    "other": 0.40,
}
