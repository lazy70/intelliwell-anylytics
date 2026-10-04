from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

WELLS = [
    {"well_id": "IW-ESP-01", "lift_type": "ESP", "fluid_type": "oil", "depth_ft": 8900, "formation_pressure_psi": 3920},
    {"well_id": "IW-GL-01", "lift_type": "gas lift", "fluid_type": "gas", "depth_ft": 10150, "formation_pressure_psi": 4350},
    {"well_id": "IW-PCP-01", "lift_type": "PCP", "fluid_type": "oil", "depth_ft": 7200, "formation_pressure_psi": 3380},
    {"well_id": "IW-SRP-01", "lift_type": "SRP", "fluid_type": "oil", "depth_ft": 6500, "formation_pressure_psi": 3120},
]


def build_dataset(points_per_well: int = 220) -> pd.DataFrame:
    timestamps = pd.date_range("2026-01-01", periods=points_per_well, freq="6h", tz="UTC")
    rows = []

    for w_idx, well in enumerate(WELLS):
        for i, ts in enumerate(timestamps):
            pressure = 2100 + 180 * np.sin((i + w_idx) / 15) - 0.8 * i + 60 * w_idx
            temp = 78 + 0.03 * i + 3.2 * np.sin((i + w_idx) / 11)
            base_rate = 620 if well["fluid_type"] == "oil" else 4200
            decline = 1.4 if well["fluid_type"] == "oil" else 10.5
            flow_rate = max(1.0, base_rate - decline * i + 20 * np.cos(i / 9))

            esp_motor_current = 58 + 0.03 * i if well["lift_type"] == "ESP" else 0
            esp_vibration = 2.8 + 0.01 * i if well["lift_type"] == "ESP" else 0
            gas_valve_cycling = 1 if well["lift_type"] == "gas lift" and i % 24 == 0 else 0
            gas_injection_rate = 760 + 45 * np.sin(i / 8) if well["lift_type"] == "gas lift" else 0

            failure_signal = (
                (flow_rate < base_rate * 0.82)
                + (well["lift_type"] == "ESP" and esp_vibration > 4.1)
                + (well["lift_type"] == "gas lift" and gas_valve_cycling == 1)
                + (pressure < 1880)
                + (i > 110 and i % (14 + w_idx) == 0)
            )
            failure_within_24h = int(failure_signal >= 1)

            rows.append(
                {
                    "timestamp": ts,
                    "well_id": well["well_id"],
                    "lift_type": well["lift_type"],
                    "fluid_type": well["fluid_type"],
                    "depth_ft": well["depth_ft"],
                    "formation_pressure_psi": well["formation_pressure_psi"],
                    "pressure_psi": round(float(pressure), 2),
                    "temperature_c": round(float(temp), 2),
                    "flow_rate": round(float(flow_rate), 2),
                    "esp_motor_current_a": round(float(esp_motor_current), 2),
                    "esp_vibration_mms": round(float(esp_vibration), 2),
                    "gas_injection_rate_mscfd": round(float(gas_injection_rate), 2),
                    "gas_valve_cycling": gas_valve_cycling,
                    "failure_within_24h": failure_within_24h,
                }
            )

    df = pd.DataFrame(rows).sort_values(["timestamp", "well_id"]).reset_index(drop=True)
    return df


def main() -> None:
    out_dir = Path(__file__).resolve().parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "synthetic_well_timeseries.csv"
    build_dataset().to_csv(output_path, index=False)
    print(f"Wrote deterministic synthetic dataset to {output_path}")


if __name__ == "__main__":
    main()
