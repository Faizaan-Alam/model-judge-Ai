from __future__ import annotations

from typing import Any

from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import (
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
    RidgeClassifier,
)
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import LinearSVC, LinearSVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor


def make_model(model_name: str, problem_type: str, seed: int = 42) -> tuple[Any, str, dict]:
    is_reg = problem_type == "regression"
    hyperparams: dict = {"random_state": seed}

    if model_name == "logistic_regression":
        if is_reg:
            raise ValueError("logistic_regression not for regression")
        m = LogisticRegression(max_iter=500, random_state=seed)
        return m, "linear", {"max_iter": 500, "random_state": seed}

    if model_name == "linear_regression":
        if not is_reg:
            raise ValueError("linear_regression only for regression")
        return LinearRegression(), "linear", {}

    if model_name == "ridge":
        if is_reg:
            return Ridge(random_state=seed), "linear", {"random_state": seed}
        return RidgeClassifier(random_state=seed), "linear", {"random_state": seed}

    if model_name == "lasso":
        if not is_reg:
            raise ValueError("lasso only for regression in v1")
        return Lasso(random_state=seed, max_iter=5000), "linear", {"random_state": seed, "max_iter": 5000}

    if model_name == "decision_tree":
        if is_reg:
            return DecisionTreeRegressor(random_state=seed, max_depth=10), "tree", {
                "max_depth": 10,
                "random_state": seed,
            }
        return DecisionTreeClassifier(random_state=seed, max_depth=10), "tree", {
            "max_depth": 10,
            "random_state": seed,
        }

    if model_name == "random_forest":
        if is_reg:
            return (
                RandomForestRegressor(n_estimators=100, random_state=seed, n_jobs=-1),
                "tree",
                {"n_estimators": 100, "random_state": seed},
            )
        return (
            RandomForestClassifier(n_estimators=100, random_state=seed, n_jobs=-1),
            "tree",
            {"n_estimators": 100, "random_state": seed},
        )

    if model_name == "svm":
        if is_reg:
            raise ValueError("use svr for regression")
        return LinearSVC(random_state=seed, max_iter=5000, dual="auto"), "svm", {
            "random_state": seed,
            "max_iter": 5000,
        }

    if model_name == "svr":
        if not is_reg:
            raise ValueError("svr only for regression")
        return LinearSVR(random_state=seed, max_iter=5000, dual="auto"), "svm", {
            "random_state": seed,
            "max_iter": 5000,
        }

    if model_name == "knn":
        if is_reg:
            return KNeighborsRegressor(n_neighbors=5), "neighbor", {"n_neighbors": 5}
        return KNeighborsClassifier(n_neighbors=5), "neighbor", {"n_neighbors": 5}

    if model_name == "naive_bayes":
        if is_reg:
            raise ValueError("naive_bayes not for regression")
        return GaussianNB(), "bayes", {}

    if model_name == "gradient_boosting":
        if is_reg:
            return (
                GradientBoostingRegressor(random_state=seed),
                "boosting",
                {"random_state": seed},
            )
        return (
            GradientBoostingClassifier(random_state=seed),
            "boosting",
            {"random_state": seed},
        )

    if model_name == "xgboost":
        try:
            from xgboost import XGBClassifier, XGBRegressor
        except ImportError as e:
            raise ValueError("xgboost not installed") from e
        if is_reg:
            return (
                XGBRegressor(
                    n_estimators=100,
                    max_depth=6,
                    random_state=seed,
                    n_jobs=-1,
                    verbosity=0,
                ),
                "boosting",
                {"n_estimators": 100, "max_depth": 6, "random_state": seed},
            )
        return (
            XGBClassifier(
                n_estimators=100,
                max_depth=6,
                random_state=seed,
                n_jobs=-1,
                verbosity=0,
                eval_metric="logloss",
            ),
            "boosting",
            {"n_estimators": 100, "max_depth": 6, "random_state": seed},
        )

    raise ValueError(f"Unknown model: {model_name}")
