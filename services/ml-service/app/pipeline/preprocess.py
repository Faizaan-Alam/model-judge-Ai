from __future__ import annotations

import io
import json
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app import storage
from app.config import settings


def build_plan(
    columns: list[dict[str, Any]],
    problem_type: str,
    target_column: str,
    feature_columns: list[str],
) -> dict[str, Any]:
    steps = []
    numeric, categorical = [], []
    for c in columns:
        name = c.get("name")
        if name not in feature_columns:
            continue
        t = c.get("inferredType")
        if t == "numeric":
            numeric.append(name)
        else:
            categorical.append(name)

    if numeric:
        steps.append({"op": "impute_median", "columns": numeric, "params": {}})
        steps.append({"op": "standard_scale", "columns": numeric, "params": {}})
    if categorical:
        steps.append({"op": "impute_mode", "columns": categorical, "params": {}})
        steps.append(
            {
                "op": "one_hot",
                "columns": categorical,
                "params": {"max_categories": 50, "min_frequency": 0.01},
            }
        )

    return {
        "version": "1.0.0",
        "problem_type": problem_type,
        "target_column": target_column,
        "feature_columns": feature_columns,
        "numeric_columns": numeric,
        "categorical_columns": categorical,
        "steps": steps,
        "notes": ["v1 shared dense matrix for all model families"],
    }


def _make_transformer(numeric: list[str], categorical: list[str]) -> ColumnTransformer:
    transformers = []
    if numeric:
        transformers.append(
            (
                "num",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric,
            )
        )
    if categorical:
        transformers.append(
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(
                                handle_unknown="ignore",
                                max_categories=50,
                                min_frequency=0.01,
                                sparse_output=False,
                            ),
                        ),
                    ]
                ),
                categorical,
            )
        )
    if not transformers:
        raise ValueError("No usable feature columns")
    return ColumnTransformer(transformers=transformers, remainder="drop")


def apply_preprocess(
    raw_bytes: bytes,
    plan: dict[str, Any],
    experiment_id: str,
    test_size: float,
    split_seed: int,
    max_rows: int | None = None,
) -> dict[str, Any]:
    df = pd.read_csv(io.BytesIO(raw_bytes))
    limit = max_rows or settings.max_upload_rows
    if len(df) > limit:
        df = df.sample(n=limit, random_state=split_seed).reset_index(drop=True)

    target = plan["target_column"]
    features = plan["feature_columns"]
    numeric = plan.get("numeric_columns") or []
    categorical = plan.get("categorical_columns") or []

    if target not in df.columns:
        raise ValueError(f"Target column missing: {target}")
    for f in features:
        if f not in df.columns:
            raise ValueError(f"Feature missing: {f}")

    X = df[features].copy()
    y = df[target].copy()
    problem_type = plan.get("problem_type", "")

    # Drop rows with missing target
    mask = y.notna()
    X, y = X.loc[mask], y.loc[mask]

    stratify = None
    if problem_type != "regression" and y.nunique() > 1:
        # stratify only if each class has at least 2 samples
        vc = y.value_counts()
        if vc.min() >= 2 and len(vc) < 50:
            stratify = y

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=split_seed, stratify=stratify
    )

    ct = _make_transformer(numeric, categorical)
    X_train_t = ct.fit_transform(X_train)
    X_test_t = ct.transform(X_test)

    if X_train_t.shape[1] > settings.max_features * 4:
        raise ValueError("LIMIT_FEATURES: encoded feature space too large")

    # Encode y for classification if object
    y_encoder = None
    if problem_type != "regression" and y_train.dtype == object:
        from sklearn.preprocessing import LabelEncoder

        y_encoder = LabelEncoder()
        y_train_enc = y_encoder.fit_transform(y_train.astype(str))
        y_test_enc = y_encoder.transform(y_test.astype(str))
    else:
        y_train_enc = y_train.to_numpy()
        y_test_enc = y_test.to_numpy()
        if problem_type != "regression":
            # ensure numeric labels
            if y_train_enc.dtype == object:
                from sklearn.preprocessing import LabelEncoder

                y_encoder = LabelEncoder()
                y_train_enc = y_encoder.fit_transform(y_train.astype(str))
                y_test_enc = y_encoder.transform(y_test.astype(str))

    prefix = f"experiments/{experiment_id}"
    train_key = f"{prefix}/data/train.npz"
    test_key = f"{prefix}/data/test.npz"
    pipe_key = f"{prefix}/pipeline.joblib"
    meta_key = f"{prefix}/data/split_meta.json"

    # Store arrays
    train_buf = io.BytesIO()
    np.savez_compressed(train_buf, X=np.asarray(X_train_t, dtype=np.float32), y=np.asarray(y_train_enc))
    storage.put_bytes(train_key, train_buf.getvalue(), "application/octet-stream")

    test_buf = io.BytesIO()
    np.savez_compressed(test_buf, X=np.asarray(X_test_t, dtype=np.float32), y=np.asarray(y_test_enc))
    storage.put_bytes(test_key, test_buf.getvalue(), "application/octet-stream")

    pipe_buf = io.BytesIO()
    joblib.dump({"transformer": ct, "y_encoder": y_encoder, "plan": plan}, pipe_buf)
    storage.put_bytes(pipe_key, pipe_buf.getvalue(), "application/octet-stream")

    feature_names = list(ct.get_feature_names_out())
    meta = {
        "n_train": int(X_train_t.shape[0]),
        "n_test": int(X_test_t.shape[0]),
        "n_features_out": int(X_train_t.shape[1]),
        "feature_names": feature_names,
        "problem_type": problem_type,
        "split_seed": split_seed,
        "test_size": test_size,
    }
    if problem_type != "regression":
        uniq, counts = np.unique(y_train_enc, return_counts=True)
        meta["class_distribution"] = {str(u): int(c) for u, c in zip(uniq, counts)}
    storage.put_bytes(meta_key, json.dumps(meta).encode("utf-8"), "application/json")

    import sklearn
    import numpy
    import pandas as pd_mod

    return {
        "artifacts": {
            "trainNpzKey": train_key,
            "testNpzKey": test_key,
            "pipelineKey": pipe_key,
            "splitMetaKey": meta_key,
            "train_key": train_key,
            "test_key": test_key,
            "pipeline_key": pipe_key,
        },
        "n_features_out": int(X_train_t.shape[1]),
        "class_distribution": meta.get("class_distribution"),
        "library_versions": {
            "python": f"{__import__('sys').version_info.major}.{__import__('sys').version_info.minor}",
            "sklearn": sklearn.__version__,
            "numpy": numpy.__version__,
            "pandas": pd_mod.__version__,
        },
        "feature_names": feature_names,
    }


def load_xy(artifacts: dict[str, str], split: str = "train") -> tuple[np.ndarray, np.ndarray]:
    key = artifacts.get("train_key") or artifacts.get("trainNpzKey")
    if split == "test":
        key = artifacts.get("test_key") or artifacts.get("testNpzKey")
    if not key:
        raise ValueError("Missing data artifact key")
    raw = storage.get_bytes(settings.minio_bucket, key)
    z = np.load(io.BytesIO(raw))
    return z["X"], z["y"]
