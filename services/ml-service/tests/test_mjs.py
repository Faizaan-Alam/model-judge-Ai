"""Unit tests for ModelJudge Score (MJS) aggregation."""

from app.mjs.score import entropy_weights, score_models
import numpy as np


def _model(
    name: str,
    family: str,
    primary: float,
    train_ms: float,
    size_kb: float,
    rob: float,
    cv_std: float = 0.01,
    explain=None,
):
    return {
        "model_name": name,
        "model_run_id": f"id-{name}",
        "model_family": family,
        "primary_score": primary,
        "metrics": {"cv": {"std": cv_std, "mean": primary, "foldScores": [primary]}},
        "timing": {"trainMs": train_ms, "inferenceMs": 5.0},
        "resources": {"modelSizeKb": size_kb},
        "robustness": {"summaryScore": rob},
        "explainability_quality": explain,
    }


FIXED = {
    "method": "fixed",
    "weights": {
        "performance": 0.35,
        "robustness": 0.20,
        "efficiency": 0.15,
        "explainability": 0.15,
        "reproducibility": 0.15,
    },
}


def test_weights_sum_to_one_fixed():
    out = score_models(
        {
            "models": [
                _model("a", "linear", 0.7, 10, 5, 0.6),
                _model("b", "tree", 0.9, 1000, 500, 0.8),
            ],
            "mjs_config": FIXED,
        }
    )
    s = sum(out["weights"].values())
    assert abs(s - 1.0) < 1e-6
    assert out["mjs_version"]
    assert len(out["scores"]) == 2


def test_ranks_are_unique_and_dense():
    out = score_models(
        {
            "models": [
                _model("lr", "linear", 0.7, 10, 5, 0.6),
                _model("rf", "tree", 0.9, 1000, 500, 0.8),
                _model("knn", "neighbor", 0.75, 50, 20, 0.7),
            ],
            "mjs_config": FIXED,
        }
    )
    ranks = sorted(s["rank"] for s in out["scores"])
    assert ranks == [1, 2, 3]
    # composite decreases with rank
    ordered = sorted(out["scores"], key=lambda x: x["rank"])
    assert ordered[0]["composite"] >= ordered[1]["composite"] >= ordered[2]["composite"]


def test_minmax_all_equal_gives_one():
    out = score_models(
        {
            "models": [
                _model("a", "linear", 0.8, 100, 50, 0.7, cv_std=0.02),
                _model("b", "linear", 0.8, 100, 50, 0.7, cv_std=0.02),
            ],
            "mjs_config": FIXED,
        }
    )
    for s in out["scores"]:
        for d, v in s["dimensions"].items():
            assert abs(v - 1.0) < 1e-9, d


def test_efficiency_favors_faster_smaller_when_else_equal():
    """When performance/robustness similar, lighter model should rank higher on efficiency dim."""
    out = score_models(
        {
            "models": [
                _model("heavy", "tree", 0.8, 10_000, 5_000, 0.7),
                _model("light", "linear", 0.8, 10, 5, 0.7),
            ],
            "mjs_config": FIXED,
        }
    )
    by_name = {s["modelName"]: s for s in out["scores"]}
    assert by_name["light"]["dimensions"]["efficiency"] > by_name["heavy"]["dimensions"]["efficiency"]


def test_intrinsic_explainability_linear_beats_boosting_prior():
    out = score_models(
        {
            "models": [
                _model("lr", "linear", 0.8, 100, 50, 0.7),
                _model("xgb", "boosting", 0.8, 100, 50, 0.7),
            ],
            "mjs_config": FIXED,
        }
    )
    by_name = {s["modelName"]: s for s in out["scores"]}
    assert (
        by_name["lr"]["dimensions"]["explainability"]
        > by_name["xgb"]["dimensions"]["explainability"]
    )


def test_posthoc_explainability_overrides_prior():
    out = score_models(
        {
            "models": [
                _model(
                    "xgb",
                    "boosting",
                    0.8,
                    100,
                    50,
                    0.7,
                    explain={"summaryScore": 0.95},
                ),
                _model("lr", "linear", 0.8, 100, 50, 0.7, explain=None),
            ],
            "mjs_config": FIXED,
        }
    )
    by_name = {s["modelName"]: s for s in out["scores"]}
    # xgb has explicit high quality; lr uses intrinsic ~0.9 but after minmax both matter
    assert by_name["xgb"]["raw"]["explainability"] == 0.95
    assert by_name["lr"]["raw"]["explainability"] == 0.90


def test_entropy_weights_sum_to_one():
    matrix = np.array(
        [
            [1.0, 0.0, 0.5, 0.2, 0.8],
            [0.0, 1.0, 0.5, 0.8, 0.2],
            [0.5, 0.5, 0.5, 0.5, 0.5],
        ]
    )
    w = entropy_weights(matrix)
    assert abs(sum(w.values()) - 1.0) < 1e-6
    assert set(w.keys()) == {
        "performance",
        "robustness",
        "efficiency",
        "explainability",
        "reproducibility",
    }


def test_entropy_method_on_score_models():
    out = score_models(
        {
            "models": [
                _model("a", "linear", 0.9, 10, 5, 0.5),
                _model("b", "tree", 0.5, 1000, 500, 0.9),
            ],
            "mjs_config": {"method": "entropy", "weights": FIXED["weights"]},
        }
    )
    assert out["method"] == "entropy"
    assert abs(sum(out["weights"].values()) - 1.0) < 1e-6


def test_accuracy_first_weighting_changes_rank():
    """High performance model can beat efficient model under accuracy-first weights."""
    models = [
        _model("accurate_heavy", "boosting", 0.95, 50_000, 10_000, 0.6),
        _model("weak_light", "linear", 0.55, 5, 1, 0.6),
    ]
    acc_first = {
        "method": "fixed",
        "weights": {
            "performance": 0.7,
            "robustness": 0.1,
            "efficiency": 0.05,
            "explainability": 0.1,
            "reproducibility": 0.05,
        },
    }
    out = score_models({"models": models, "mjs_config": acc_first})
    assert out["scores"][0]["modelName"] == "accurate_heavy"
