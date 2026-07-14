from __future__ import annotations

from typing import Any

import numpy as np

from app.config import settings
from app.metrics.compute import INTRINSIC_EXPLAIN, efficiency_raw


def _minmax(vals: list[float]) -> list[float]:
    arr = np.asarray(vals, dtype=float)
    lo, hi = float(arr.min()), float(arr.max())
    if abs(hi - lo) < 1e-12:
        return [1.0] * len(vals)
    return [float((v - lo) / (hi - lo)) for v in arr]


def entropy_weights(matrix: np.ndarray) -> dict[str, float]:
    """matrix shape (m, 5), values in [0,1]."""
    m, d = matrix.shape
    eps = 1e-12
    weights = []
    for j in range(d):
        col = matrix[:, j]
        s = col.sum()
        if s < eps:
            p = np.ones(m) / m
        else:
            p = col / s
        e = -np.sum(p * np.log(p + eps)) / np.log(m + eps)
        weights.append(1.0 - float(e))
    w = np.asarray(weights)
    if w.sum() < eps:
        w = np.ones(d) / d
    else:
        w = w / w.sum()
    keys = ["performance", "robustness", "efficiency", "explainability", "reproducibility"]
    return {k: float(v) for k, v in zip(keys, w)}


def score_models(payload: dict[str, Any]) -> dict[str, Any]:
    models = payload["models"]
    mjs_config = payload.get("mjs_config") or {}
    method = mjs_config.get("method", "fixed")
    fixed_w = mjs_config.get("weights") or {
        "performance": 0.35,
        "robustness": 0.20,
        "efficiency": 0.15,
        "explainability": 0.15,
        "reproducibility": 0.15,
    }

    raw_rows = []
    for m in models:
        timing = m.get("timing") or {}
        resources = m.get("resources") or {}
        robustness = m.get("robustness") or {}
        metrics = m.get("metrics") or {}
        family = m.get("model_family") or "other"

        perf = float(m.get("primary_score") or 0.0)
        rob = float(robustness.get("summaryScore") or robustness.get("summary_score") or 0.5)
        eff = efficiency_raw(
            float(timing.get("trainMs") or timing.get("train_ms") or 1.0),
            float(timing.get("inferenceMs") or timing.get("inference_ms") or 1.0),
            float(resources.get("modelSizeKb") or resources.get("model_size_kb") or 1.0),
        )

        q = m.get("explainability_quality")
        if q and isinstance(q, dict) and q.get("summaryScore") is not None:
            expl = float(q["summaryScore"])
        elif q and isinstance(q, dict) and q.get("summary_score") is not None:
            expl = float(q["summary_score"])
        else:
            expl = float(INTRINSIC_EXPLAIN.get(family, 0.4))

        # Reproducibility from CV std + presence flags
        repro = 0.5
        cv = metrics.get("cv") or {}
        if isinstance(cv, dict) and "std" in cv:
            std = float(cv["std"])
            repro = float(max(0.0, min(1.0, 1.0 - std)))
            repro = 0.3 * 1.0 + 0.5 * repro + 0.2  # seeds+versions assumed present from pipeline
            repro = min(1.0, repro)

        raw_rows.append(
            {
                "model_name": m.get("model_name"),
                "model_run_id": m.get("model_run_id"),
                "raw": {
                    "performance": perf,
                    "robustness": rob,
                    "efficiency": eff,
                    "explainability": expl,
                    "reproducibility": repro,
                },
            }
        )

    dims = ["performance", "robustness", "efficiency", "explainability", "reproducibility"]
    norm = {d: _minmax([r["raw"][d] for r in raw_rows]) for d in dims}
    matrix = np.array([[norm[d][i] for d in dims] for i in range(len(raw_rows))])

    if method == "entropy":
        weights = entropy_weights(matrix)
    else:
        weights = {k: float(fixed_w.get(k, 0.2)) for k in dims}
        s = sum(weights.values())
        weights = {k: v / s for k, v in weights.items()}

    scores = []
    for i, r in enumerate(raw_rows):
        dimensions = {d: norm[d][i] for d in dims}
        composite = sum(weights[d] * dimensions[d] for d in dims)
        scores.append(
            {
                "modelName": r["model_name"],
                "model_name": r["model_name"],
                "modelRunId": r["model_run_id"],
                "model_run_id": r["model_run_id"],
                "dimensions": dimensions,
                "raw": r["raw"],
                "composite": float(composite),
            }
        )

    scores.sort(key=lambda x: (-x["composite"], -x["dimensions"]["performance"]))
    for rank, s in enumerate(scores, start=1):
        s["rank"] = rank

    return {
        "mjs_version": settings.mjs_version,
        "method": method if method in ("fixed", "entropy", "ahp") else "fixed",
        "weights": weights,
        "normalization": {
            "scheme": "minmax_across_models",
            "details": {d: {"min": min(norm[d]), "max": max(norm[d])} for d in dims},
        },
        "scores": scores,
        "explainability_pending": any(
            not (m.get("explainability_quality")) for m in models
        ),
    }
