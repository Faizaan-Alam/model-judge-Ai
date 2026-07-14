from __future__ import annotations

import io
from typing import Any

import joblib
import numpy as np

from app import storage
from app.config import settings
from app.pipeline.preprocess import load_xy


def _quality_from_importance(imp: np.ndarray) -> dict[str, float]:
    """Heuristic quality scores when full faithfulness suite is too heavy for v1."""
    imp = np.abs(imp.astype(float))
    if imp.sum() <= 0:
        return {
            "faithfulness": 0.5,
            "stability": 0.5,
            "complexity": 1.0,
            "summaryScore": 0.4,
            "summary_score": 0.4,
        }
    p = imp / imp.sum()
    # complexity: entropy of importance distribution (higher = more diffuse)
    entropy = float(-np.sum(p * np.log(p + 1e-12)) / np.log(len(p) + 1e-12))
    complexity = min(1.0, max(0.0, entropy))
    # faithfulness proxy: concentration on top features
    topk = np.sort(p)[::-1][: max(1, len(p) // 5)].sum()
    faithfulness = float(min(1.0, topk + 0.2))
    stability = 0.7  # placeholder until multi-run stability computed
    summary = 0.5 * faithfulness + 0.3 * stability + 0.2 * (1.0 - complexity)
    return {
        "faithfulness": faithfulness,
        "stability": stability,
        "complexity": complexity,
        "summaryScore": float(summary),
        "summary_score": float(summary),
    }


def explain_model(payload: dict[str, Any]) -> dict[str, Any]:
    experiment_id = payload["experiment_id"]
    model_name = payload["model_name"]
    artifacts = payload["artifacts"]
    seed = int(payload.get("seed", 42))

    model_key = artifacts.get("model_key") or artifacts.get("modelKey")
    if not model_key or not str(model_key).startswith("experiments/"):
        raise ValueError("Invalid model artifact path")

    bundle = joblib.load(io.BytesIO(storage.get_bytes(settings.minio_bucket, model_key)))
    model = bundle["model"]
    family = bundle.get("family", "other")

    X_train, _ = load_xy(artifacts, "train")
    X_test, _ = load_xy(artifacts, "test")

    feature_names = [f"f{i}" for i in range(X_train.shape[1])]
    meta_key = artifacts.get("splitMetaKey") or artifacts.get("split_meta_key")
    if meta_key:
        try:
            import json

            meta = json.loads(storage.get_bytes(settings.minio_bucket, meta_key))
            feature_names = meta.get("feature_names") or feature_names
        except Exception:
            pass

    method = "feature_importance"
    method_params: dict[str, Any] = {}
    values = None

    # Tree / boosting → TreeSHAP
    if family in ("tree", "boosting") or model_name in (
        "decision_tree",
        "random_forest",
        "gradient_boosting",
        "xgboost",
    ):
        try:
            import shap

            n_bg = min(settings.kernel_shap_max_rows, len(X_train))
            bg = X_train[:n_bg]
            explainer = shap.TreeExplainer(model, data=bg)
            sv = explainer.shap_values(X_test[: min(100, len(X_test))])
            if isinstance(sv, list):
                # multiclass: average abs across classes
                values = np.mean([np.abs(s) for s in sv], axis=0)
            else:
                values = np.abs(sv)
            method = "shap_tree"
            method_params = {"n_background": n_bg, "n_explain": int(min(100, len(X_test)))}
        except Exception:
            values = None

    # Linear coefficients
    if values is None and hasattr(model, "coef_"):
        coef = np.asarray(model.coef_, dtype=float)
        if coef.ndim > 1:
            imp = np.mean(np.abs(coef), axis=0)
        else:
            imp = np.abs(coef)
        values = np.tile(imp, (min(5, len(X_test)), 1))
        method = "coefficients"
        method_params = {}

    # LIME fallback for a few instances → approximate global by mean abs
    if values is None:
        try:
            from lime.lime_tabular import LimeTabularExplainer

            n_bg = min(500, len(X_train))
            explainer = LimeTabularExplainer(
                X_train[:n_bg],
                feature_names=feature_names,
                mode="regression"
                if payload.get("problem_type") == "regression"
                else "classification",
                random_state=seed,
                discretize_continuous=True,
            )

            def predict_fn(x):
                if payload.get("problem_type") == "regression":
                    return model.predict(x)
                if hasattr(model, "predict_proba"):
                    return model.predict_proba(x)
                # decision function fallback
                preds = model.predict(x)
                # fake two-class proba
                p = preds.astype(float)
                if p.ndim == 1:
                    return np.vstack([1 - p, p]).T if set(np.unique(p)).issubset({0, 1}) else np.eye(
                        len(np.unique(preds))
                    )[preds.astype(int)]
                return preds

            n_local = min(5, len(X_test))
            imps = []
            local_out = []
            for i in range(n_local):
                exp = explainer.explain_instance(
                    X_test[i],
                    predict_fn,
                    num_features=min(20, X_test.shape[1]),
                    num_samples=min(1000, max(100, n_bg)),
                )
                # map feature index weights
                w = np.zeros(X_test.shape[1])
                for feat, weight in exp.as_map().get(1, exp.as_map().get(0, [])):
                    if feat < len(w):
                        w[feat] = abs(weight)
                imps.append(w)
                local_out.append(
                    {
                        "rowIndex": i,
                        "prediction": float(model.predict(X_test[i : i + 1])[0]),
                        "features": [
                            {
                                "feature": feature_names[j] if j < len(feature_names) else f"f{j}",
                                "value": float(X_test[i, j]),
                                "shap": float(w[j]),
                            }
                            for j in np.argsort(-w)[:15]
                        ],
                    }
                )
            values = np.vstack(imps)
            method = "lime"
            method_params = {"n_samples": 1000, "n_local": n_local}
            global_imp = np.mean(values, axis=0)
            quality = _quality_from_importance(global_imp)
            global_importance = [
                {
                    "feature": feature_names[j] if j < len(feature_names) else f"f{j}",
                    "value": float(global_imp[j]),
                    "absValue": float(global_imp[j]),
                }
                for j in np.argsort(-global_imp)[:50]
            ]
            out_key = f"experiments/{experiment_id}/explain/{model_name}/global.json"
            import json

            storage.put_bytes(
                out_key,
                json.dumps({"global": global_importance, "method": method}).encode(),
                "application/json",
            )
            return {
                "method": method,
                "method_params": method_params,
                "quality": quality,
                "global_importance": global_importance,
                "local": local_out,
                "artifacts": {"fullValuesKey": out_key},
            }
        except Exception as e:
            # last resort: zeros
            raise ValueError(f"Explain failed: {e}") from e

    global_imp = np.mean(values, axis=0) if values.ndim == 2 else np.abs(values)
    quality = _quality_from_importance(global_imp)
    order = np.argsort(-global_imp)[:50]
    global_importance = [
        {
            "feature": feature_names[j] if j < len(feature_names) else f"f{j}",
            "value": float(global_imp[j]),
            "absValue": float(abs(global_imp[j])),
        }
        for j in order
    ]

    local = []
    n_local = min(5, values.shape[0] if values.ndim == 2 else 0)
    for i in range(n_local):
        row = values[i]
        local.append(
            {
                "rowIndex": i,
                "prediction": float(model.predict(X_test[i : i + 1])[0]),
                "features": [
                    {
                        "feature": feature_names[j] if j < len(feature_names) else f"f{j}",
                        "value": float(X_test[i, j]),
                        "shap": float(row[j]),
                    }
                    for j in np.argsort(-np.abs(row))[:15]
                ],
            }
        )

    import json

    out_key = f"experiments/{experiment_id}/explain/{model_name}/global.json"
    storage.put_bytes(
        out_key,
        json.dumps({"global": global_importance, "method": method}).encode(),
        "application/json",
    )

    return {
        "method": method,
        "method_params": method_params,
        "quality": quality,
        "global_importance": global_importance,
        "local": local,
        "artifacts": {"fullValuesKey": out_key},
    }
