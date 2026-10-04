# IntelliWell Analytics (Synthetic Demo)

IntelliWell is a lightweight petroleum-well analytics demo for artificial-lift failure detection and production forecasting.

> **Safety warning:** This project uses deterministic synthetic demo data only. Outputs are not field-validated and must **not** be used for operational decisions.

## Features

- Responsive dashboard (GitHub Pages-ready) with one deterministic synthetic dataset.
- Well overview using consistent pressure, temperature, flow-rate and equipment-status values.
- Lift-type support: **ESP, gas lift, PCP, SRP**.
- Historical sensor charts and filterable event table.
- Rule-based failure-risk alerts with explicit rule explanations (no threshold rules labeled as AI/ML).
- Production chart with actual history, short-horizon forecast, and Arps decline-curve baseline.
- Simplified wellbore simulator with validation and assumptions shown.
- Data-source/status labeling to clearly mark all displayed values as synthetic demo data.
- Separate Python workflow for synthetic-data generation, preprocessing, time-aware model training, evaluation, and artifact creation.

## Repository layout

- `/index.html`, `/styles.css`, `/app.js`: static dashboard app.
- `/ml/generate_synthetic_data.py`: deterministic synthetic dataset generation.
- `/ml/train_models.py`: time-aware training/evaluation for
  - binary failure prediction (metrics: PR-AUC, recall)
  - production forecast regression (metrics: MAE, RMSE)
- `/ml/requirements.txt`: Python dependencies.

## Quick start (dashboard)

1. Clone repository.
2. Open `index.html` in a browser, or serve locally:
   ```bash
   cd /home/runner/work/intelliwell-anylytics/intelliwell-anylytics
   python -m http.server 8000
   ```
3. Visit `http://localhost:8000`.

## GitHub Pages deployment

1. Push this repository to GitHub.
2. In GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set:
   - Source: `Deploy from a branch`
   - Branch: your default branch (for example `main`), folder `/ (root)`
4. Save. GitHub Pages serves `index.html` automatically.

## Python ML workflow (synthetic only)

```bash
cd /home/runner/work/intelliwell-anylytics/intelliwell-anylytics/ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python generate_synthetic_data.py
python train_models.py
```

Generated outputs:
- `ml/data/synthetic_well_timeseries.csv`
- `ml/artifacts/failure_classifier.joblib`
- `ml/artifacts/production_forecast_regressor.joblib`
- `ml/artifacts/failure_risk_plot.png`
- `ml/artifacts/production_forecast_plot.png`
- `ml/artifacts/metrics.json`

## Data dictionary (synthetic demo)

| Field | Unit | Description |
|---|---|---|
| `timestamp` | UTC datetime | Sample timestamp |
| `well_id` | text | Well identifier |
| `lift_type` | text | ESP / gas lift / PCP / SRP |
| `fluid_type` | text | oil or gas |
| `depth_ft` | ft | Fixed per well (not randomized over time) |
| `formation_pressure_psi` | psi | Static formation pressure input |
| `pressure_psi` | psi | Synthetic flowing pressure signal |
| `temperature_c` | °C | Synthetic temperature signal |
| `flow_rate` | bbl/d or Mscf/d | Synthetic production rate (unit based on fluid type) |
| `esp_motor_current_a` | A | ESP indicator |
| `esp_vibration_mms` | mm/s | ESP indicator |
| `gas_injection_rate_mscfd` | Mscf/d | Gas-lift indicator |
| `gas_valve_cycling` | flag (0/1) | Gas-lift valve instability indicator |
| `failure_within_24h` | flag (0/1) | Synthetic binary target |

## Model methodology (synthetic)

- **Preprocessing**
  - Time-ordered split (first 80% train, last 20% test) to avoid leakage.
  - Numeric imputation/scaling + one-hot encoding for categorical lift/fluid type.
- **Failure prediction**
  - Logistic regression classifier with class balancing.
  - Metrics: PR-AUC and recall on held-out time slice.
- **Forecasting**
  - Ridge regression baseline for flow-rate prediction.
  - Metrics: MAE and RMSE on held-out time slice.

## Dashboard simulator assumptions and limitations

- Simplified single-phase wellbore approximation.
- Default geothermal gradient near **0.9 °C per 100 ft**.
- Flowing bottomhole pressure is constrained not to exceed formation pressure.
- Simulator omits full multiphase hydraulics, compositional effects, transient behavior, and field-calibrated nodal analysis.

## Additional limitations

- Synthetic deterministic data only; no live source connectors.
- Alerting is rule-based and heuristic.
- Forecast display includes simple trend projection + Arps baseline; not a field-tuned reservoir model.
- Results are for software demonstration only.
