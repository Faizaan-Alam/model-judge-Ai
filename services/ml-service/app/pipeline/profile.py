from __future__ import annotations

import io
from typing import Any

import pandas as pd

from app.config import settings


def profile_csv(data: bytes, sep: str = ",") -> dict[str, Any]:
    df = pd.read_csv(io.BytesIO(data), sep=sep, nrows=settings.max_upload_rows + 1)
    warnings: list[str] = []
    if len(df) > settings.max_upload_rows:
        warnings.append(f"Truncated to {settings.max_upload_rows} rows")
        df = df.iloc[: settings.max_upload_rows]
    if df.shape[1] > settings.max_features:
        raise ValueError(f"LIMIT_FEATURES: more than {settings.max_features} columns")

    columns = []
    for col in df.columns:
        s = df[col]
        inferred = "unknown"
        if pd.api.types.is_bool_dtype(s):
            inferred = "boolean"
        elif pd.api.types.is_numeric_dtype(s):
            inferred = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(s):
            inferred = "datetime"
        else:
            nunique = s.nunique(dropna=True)
            inferred = "categorical" if nunique <= max(50, int(0.05 * len(df))) else "text"

        entry: dict[str, Any] = {
            "name": str(col),
            "inferredType": inferred,
            "nMissing": int(s.isna().sum()),
            "nUnique": int(s.nunique(dropna=True)),
        }
        if inferred == "numeric":
            entry["mean"] = float(s.mean()) if s.notna().any() else None
            entry["std"] = float(s.std()) if s.notna().any() else None
            entry["min"] = float(s.min()) if s.notna().any() else None
            entry["max"] = float(s.max()) if s.notna().any() else None
        elif inferred in ("categorical", "text", "boolean"):
            vc = s.astype(str).value_counts().head(10)
            entry["topCategories"] = [{"value": str(i), "count": int(c)} for i, c in vc.items()]
        columns.append(entry)

        if s.nunique(dropna=True) <= 1:
            warnings.append(f"Constant or empty column: {col}")
        if s.isna().mean() > 0.5:
            warnings.append(f"High missingness (>50%): {col}")

    return {
        "n_rows": int(len(df)),
        "n_cols": int(df.shape[1]),
        "columns": columns,
        "warnings": warnings,
        "profile_version": "1.0.0",
    }
