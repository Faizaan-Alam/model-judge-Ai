"""FastAPI service token gate."""

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

client = TestClient(app)


def test_health_open():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_profile_requires_auth():
    r = client.post("/v1/profile", json={"bucket": "x", "key": "y"})
    assert r.status_code == 401


def test_profile_rejects_bad_token():
    r = client.post(
        "/v1/profile",
        json={"bucket": "x", "key": "y"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert r.status_code == 401


def test_score_mjs_with_token():
    body = {
        "models": [
            {
                "model_name": "a",
                "model_run_id": "1",
                "model_family": "linear",
                "primary_score": 0.8,
                "metrics": {"cv": {"std": 0.01}},
                "timing": {"trainMs": 10, "inferenceMs": 1},
                "resources": {"modelSizeKb": 1},
                "robustness": {"summaryScore": 0.7},
                "explainability_quality": None,
            },
            {
                "model_name": "b",
                "model_run_id": "2",
                "model_family": "tree",
                "primary_score": 0.7,
                "metrics": {"cv": {"std": 0.02}},
                "timing": {"trainMs": 100, "inferenceMs": 5},
                "resources": {"modelSizeKb": 50},
                "robustness": {"summaryScore": 0.8},
                "explainability_quality": None,
            },
        ],
        "mjs_config": {
            "method": "fixed",
            "weights": {
                "performance": 0.35,
                "robustness": 0.2,
                "efficiency": 0.15,
                "explainability": 0.15,
                "reproducibility": 0.15,
            },
        },
    }
    r = client.post(
        "/v1/score/mjs",
        json=body,
        headers={"Authorization": f"Bearer {settings.service_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["scores"]) == 2
