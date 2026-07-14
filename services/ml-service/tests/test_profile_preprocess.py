"""Profile + preprocess plan/apply tests (in-memory, no MinIO for plan/profile)."""

import io

import numpy as np
import pandas as pd
import pytest

from app.pipeline.profile import profile_csv
from app.pipeline.preprocess import build_plan, apply_preprocess
from app.models.factory import make_model
from app.metrics.compute import train_and_evaluate, efficiency_raw


def _sample_csv_bytes(n=40) -> bytes:
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "age": rng.integers(20, 60, n),
            "income": rng.normal(50_000, 10_000, n),
            "hours": rng.integers(30, 50, n),
            "city": rng.choice(["A", "B", "C"], n),
            "label": rng.integers(0, 2, n),
        }
    )
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def test_profile_basic_shape():
    out = profile_csv(_sample_csv_bytes())
    assert out["n_rows"] == 40
    assert out["n_cols"] == 5
    names = [c["name"] for c in out["columns"]]
    assert "label" in names
    assert out["profile_version"]


def test_profile_detects_numeric_and_categorical():
    out = profile_csv(_sample_csv_bytes())
    by = {c["name"]: c for c in out["columns"]}
    assert by["age"]["inferredType"] == "numeric"
    assert by["city"]["inferredType"] in ("categorical", "text")


def test_build_plan_includes_impute_and_encode():
    profile = profile_csv(_sample_csv_bytes())
    plan = build_plan(
        columns=profile["columns"],
        problem_type="binary_classification",
        target_column="label",
        feature_columns=["age", "income", "hours", "city"],
    )
    ops = [s["op"] for s in plan["steps"]]
    assert "impute_median" in ops
    assert "one_hot" in ops
    assert plan["target_column"] == "label"


def test_make_model_applicability():
    m, family, hp = make_model("logistic_regression", "binary_classification", 42)
    assert family == "linear"
    assert "random_state" in hp or hasattr(m, "random_state")

    with pytest.raises(ValueError):
        make_model("logistic_regression", "regression", 42)

    with pytest.raises(ValueError):
        make_model("lasso", "binary_classification", 42)


def test_train_and_evaluate_classification():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(80, 4)).astype(np.float32)
    y = (X[:, 0] + X[:, 1] > 0).astype(int)
    X_train, X_test = X[:60], X[60:]
    y_train, y_test = y[:60], y[60:]
    model, _, _ = make_model("logistic_regression", "binary_classification", 0)
    result = train_and_evaluate(
        model, X_train, y_train, X_test, y_test, "binary_classification", cv_folds=3
    )
    assert "metrics" in result
    assert 0.0 <= result["primary_score"] <= 1.0
    assert result["timing"]["trainMs"] >= 0
    assert "accuracy" in result["metrics"] or "f1_macro" in result["metrics"]


def test_train_and_evaluate_regression():
    rng = np.random.default_rng(2)
    X = rng.normal(size=(80, 3)).astype(np.float32)
    y = X[:, 0] * 2 + X[:, 1] - 0.5
    model, _, _ = make_model("ridge", "regression", 0)
    result = train_and_evaluate(model, X[:60], y[:60], X[60:], y[60:], "regression", cv_folds=3)
    assert "r2" in result["metrics"]
    assert "rmse" in result["metrics"]


def test_efficiency_raw_monotonic():
    fast = efficiency_raw(10, 1, 1)
    slow = efficiency_raw(10_000, 1000, 10_000)
    assert fast > slow


def test_apply_preprocess_roundtrip(monkeypatch, tmp_path):
    """apply_preprocess needs MinIO — mock storage put/get."""
    store: dict[str, bytes] = {}

    def put_bytes(key, data, content_type="application/octet-stream", bucket=None):
        store[key] = data
        return key

    def get_bytes(bucket, key):
        return store[key]

    monkeypatch.setattr("app.pipeline.preprocess.storage.put_bytes", put_bytes)
    monkeypatch.setattr("app.pipeline.preprocess.storage.get_bytes", get_bytes)
    # load_xy uses storage.get_bytes with settings bucket
    monkeypatch.setattr("app.storage.put_bytes", put_bytes)
    monkeypatch.setattr("app.storage.get_bytes", get_bytes)

    profile = profile_csv(_sample_csv_bytes(60))
    plan = build_plan(
        profile["columns"],
        "binary_classification",
        "label",
        ["age", "income", "hours", "city"],
    )
    out = apply_preprocess(
        raw_bytes=_sample_csv_bytes(60),
        plan=plan,
        experiment_id="exp_test",
        test_size=0.25,
        split_seed=42,
    )
    assert out["n_features_out"] > 0
    assert "train_key" in out["artifacts"] or "trainNpzKey" in out["artifacts"]
    assert any(k.startswith("experiments/exp_test/") for k in store)
