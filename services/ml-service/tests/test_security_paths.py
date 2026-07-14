"""Security: reject invalid model artifact paths for robustness/explain."""

import pytest

from app.pipeline.train import robustness_eval
from app.pipeline.explain import explain_model


def test_robustness_rejects_non_experiment_path():
    with pytest.raises(ValueError, match="Invalid model"):
        robustness_eval(
            {
                "problem_type": "binary_classification",
                "artifacts": {"model_key": "/etc/passwd", "test_key": "x"},
                "seed": 1,
                "primary_score": 0.5,
            }
        )


def test_explain_rejects_non_experiment_path():
    with pytest.raises(ValueError, match="Invalid model"):
        explain_model(
            {
                "experiment_id": "e1",
                "model_name": "rf",
                "problem_type": "binary_classification",
                "artifacts": {"model_key": "user_upload/evil.joblib"},
                "seed": 1,
            }
        )


def test_explain_rejects_path_traversal_style():
    with pytest.raises(ValueError, match="Invalid model"):
        explain_model(
            {
                "experiment_id": "e1",
                "model_name": "rf",
                "artifacts": {"modelKey": "../secrets/model.joblib"},
                "seed": 1,
            }
        )
