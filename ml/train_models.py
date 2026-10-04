from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import average_precision_score, mean_absolute_error, mean_squared_error, recall_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from generate_synthetic_data import main as generate_data_main


def load_data(data_path: Path) -> pd.DataFrame:
    if not data_path.exists():
        generate_data_main()
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    df = df.sort_values(["timestamp", "well_id"]).reset_index(drop=True)
    return df


def time_split(df: pd.DataFrame, frac: float = 0.8):
    split_idx = int(len(df) * frac)
    return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()


def train_failure_model(train_df: pd.DataFrame, test_df: pd.DataFrame, artifacts_dir: Path):
    features = [
        "pressure_psi",
        "temperature_c",
        "flow_rate",
        "esp_motor_current_a",
        "esp_vibration_mms",
        "gas_injection_rate_mscfd",
        "gas_valve_cycling",
        "depth_ft",
        "formation_pressure_psi",
        "lift_type",
        "fluid_type",
    ]

    x_train = train_df[features]
    y_train = train_df["failure_within_24h"]
    x_test = test_df[features]
    y_test = test_df["failure_within_24h"]

    numeric_cols = [c for c in features if c not in {"lift_type", "fluid_type"}]
    preproc = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric_cols),
            ("cat", OneHotEncoder(handle_unknown="ignore"), ["lift_type", "fluid_type"]),
        ]
    )

    clf = Pipeline(
        [
            ("preproc", preproc),
            ("model", LogisticRegression(max_iter=500, class_weight="balanced", solver="lbfgs")),
        ]
    )
    clf.fit(x_train, y_train)

    proba = clf.predict_proba(x_test)[:, 1]
    preds = (proba >= 0.5).astype(int)
    pr_auc = average_precision_score(y_test, proba)
    recall = recall_score(y_test, preds)

    joblib.dump(clf, artifacts_dir / "failure_classifier.joblib")

    plt.figure(figsize=(8, 4))
    plt.plot(np.arange(len(proba)), proba, label="Predicted failure risk")
    plt.title("Failure risk probabilities (synthetic test split)")
    plt.xlabel("Time-ordered sample")
    plt.ylabel("Probability")
    plt.ylim(0, 1)
    plt.legend()
    plt.tight_layout()
    plt.savefig(artifacts_dir / "failure_risk_plot.png", dpi=140)
    plt.close()

    return {"pr_auc": float(pr_auc), "recall": float(recall)}


def train_forecast_model(train_df: pd.DataFrame, test_df: pd.DataFrame, artifacts_dir: Path):
    train = train_df.copy()
    test = test_df.copy()

    train["time_idx"] = np.arange(len(train))
    test["time_idx"] = np.arange(len(train), len(train) + len(test))

    features = ["time_idx", "pressure_psi", "temperature_c", "lift_type", "fluid_type"]
    target = "flow_rate"

    preproc = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), ["time_idx", "pressure_psi", "temperature_c"]),
            ("cat", OneHotEncoder(handle_unknown="ignore"), ["lift_type", "fluid_type"]),
        ]
    )

    reg = Pipeline([("preproc", preproc), ("model", Ridge(alpha=1.0))])
    reg.fit(train[features], train[target])
    preds = reg.predict(test[features])

    mae = mean_absolute_error(test[target], preds)
    rmse = np.sqrt(mean_squared_error(test[target], preds))

    joblib.dump(reg, artifacts_dir / "production_forecast_regressor.joblib")

    plt.figure(figsize=(8, 4))
    plt.plot(test["timestamp"], test[target], label="Actual")
    plt.plot(test["timestamp"], preds, label="Forecast")
    plt.title("Production forecast (synthetic test split)")
    plt.xlabel("Timestamp")
    plt.ylabel("Flow rate")
    plt.xticks(rotation=35)
    plt.legend()
    plt.tight_layout()
    plt.savefig(artifacts_dir / "production_forecast_plot.png", dpi=140)
    plt.close()

    return {"mae": float(mae), "rmse": float(rmse)}


def main() -> None:
    root = Path(__file__).resolve().parent
    data_path = root / "data" / "synthetic_well_timeseries.csv"
    artifacts_dir = root / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    df = load_data(data_path)
    train_df, test_df = time_split(df)

    failure_metrics = train_failure_model(train_df, test_df, artifacts_dir)
    forecast_metrics = train_forecast_model(train_df, test_df, artifacts_dir)

    report = {
        "data_note": "All metrics are from deterministic synthetic data and are not field-validated.",
        "failure_detection": failure_metrics,
        "production_forecast": forecast_metrics,
    }

    with (artifacts_dir / "metrics.json").open("w", encoding="utf-8") as fp:
        json.dump(report, fp, indent=2)

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
