"""
Train a RandomForest on robot CSV data and predict outcome from a single API snapshot.
Run train_model() once (or when data changes); predict_outcome(snapshot) uses the saved model.
"""
import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score

# Paths relative to this file
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "training_data.csv")
MODEL_PATH = os.path.join(SCRIPT_DIR, "robot_model.pkl")
FEATURE_NAMES_PATH = os.path.join(SCRIPT_DIR, "robot_feature_names.json")

CURRENT_J_COLS = [f"Current_J{i}" for i in range(6)]
TEMP_COLS = ["Temperature_T0", "Temperature_J1", "Temperature_J2", "Temperature_J3", "Temperature_J4", "Temperature_J5"]
# Snapshot-level features only (no lags/rolling) so we can predict from a single snapshot
FEATURE_COLS = (
    ["hour", "minute", "second"]
    + CURRENT_J_COLS
    + TEMP_COLS
    + ["Tool_current", "robot_protective_stop", "grip_lost"]
)


def _load_training_data() -> pd.DataFrame:
    """Load and prepare training DataFrame from CSV."""
    df = pd.read_csv(DATA_PATH)
    # Drop any unnamed/empty columns
    df = df.drop(columns=[c for c in df.columns if "Unnamed" in c or c.strip() == ""], errors="ignore")
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], utc=True)
    df = df.sort_values(by="Timestamp").reset_index(drop=True)
    return df


def _add_target_and_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add target and snapshot-level features (no lags)."""
    df = df.copy()
    # Target: 1 if any joint current is outside -3 to 3
    df["is_exceeding_threshold"] = (
        (df[CURRENT_J_COLS] < -3).any(axis=1) | (df[CURRENT_J_COLS] > 3).any(axis=1)
    ).astype(int)

    # Time features
    df["hour"] = df["Timestamp"].dt.hour
    df["minute"] = df["Timestamp"].dt.minute
    df["second"] = df["Timestamp"].dt.second

    # Fault flags as numeric
    df["robot_protective_stop"] = (df["Robot_ProtectiveStop"].astype(str).str.lower() == "true").astype(int)
    df["grip_lost"] = (df["grip_lost"].astype(str).str.lower() == "true").astype(int)

    return df


def train_model() -> dict:
    """
    Train the model on data/training_data.csv and save model + feature names.
    Returns dict with accuracy and report.
    """
    df = _load_training_data()
    df = _add_target_and_features(df)

    # Ensure we have all feature columns (drop rows missing Tool_current etc.)
    for col in FEATURE_COLS:
        if col not in df.columns:
            raise ValueError(f"Training CSV missing column: {col}")
    df = df.dropna(subset=FEATURE_COLS + ["is_exceeding_threshold"])

    X = df[FEATURE_COLS]
    y = df["is_exceeding_threshold"]

    split_index = int(len(X) * 0.8)
    X_train, X_val = X.iloc[:split_index], X.iloc[split_index:]
    y_train, y_val = y.iloc[:split_index], y.iloc[split_index:]

    model = RandomForestClassifier(random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_val)
    acc = accuracy_score(y_val, y_pred)
    report = classification_report(y_val, y_pred)

    joblib.dump(model, MODEL_PATH)
    with open(FEATURE_NAMES_PATH, "w") as f:
        json.dump(FEATURE_COLS, f, indent=2)

    return {"accuracy": acc, "classification_report": report}


def _snapshot_to_feature_row(snapshot: dict) -> pd.DataFrame:
    """Convert API snapshot (jointCurrents, jointTemperatures, toolCurrent, faultFlags) to one row with FEATURE_COLS."""
    # Timestamp from first available
    ts_str = None
    if snapshot.get("jointCurrents"):
        ts_str = snapshot["jointCurrents"][0].get("timestamp")
    if not ts_str and snapshot.get("jointTemperatures"):
        ts_str = snapshot["jointTemperatures"][0].get("timestamp")
    if not ts_str:
        ts_str = pd.Timestamp.utcnow().isoformat()

    try:
        ts = pd.Timestamp(ts_str, tz="UTC")
    except Exception:
        ts = pd.Timestamp.utcnow()

    # Currents by joint 1..6 -> Current_J0..J5
    currents = [0.0] * 6
    for s in snapshot.get("jointCurrents") or []:
        j = s.get("jointId")
        if j in (1, 2, 3, 4, 5, 6):
            currents[j - 1] = float(s.get("currentA", 0))
    # Temperatures by joint 1..6 -> Temperature_T0, Temperature_J1..J5
    temps = [0.0] * 6
    for s in snapshot.get("jointTemperatures") or []:
        j = s.get("jointId")
        if j in (1, 2, 3, 4, 5, 6):
            temps[j - 1] = float(s.get("temperatureC", 0))

    tool_current = 0.0
    if snapshot.get("toolCurrent"):
        tool_current = float(snapshot["toolCurrent"].get("currentA", 0))

    fault_flags = snapshot.get("faultFlags") or []
    robot_protective_stop = 1 if any(f.get("type") == "safety_stop" for f in fault_flags) else 0
    grip_lost = 1 if any(f.get("type") == "grip_failure" for f in fault_flags) else 0

    row = {
        "hour": ts.hour,
        "minute": ts.minute,
        "second": ts.second,
        **{f"Current_J{i}": currents[i] for i in range(6)},
        "Temperature_T0": temps[0],
        "Temperature_J1": temps[1],
        "Temperature_J2": temps[2],
        "Temperature_J3": temps[3],
        "Temperature_J4": temps[4],
        "Temperature_J5": temps[5],
        "Tool_current": tool_current,
        "robot_protective_stop": robot_protective_stop,
        "grip_lost": grip_lost,
    }
    return pd.DataFrame([row])[FEATURE_COLS]


# Thresholds aligned with frontend (lib/maintenance.ts)
CURRENT_OK_MIN, CURRENT_OK_MAX = -3.0, 3.0   # model training threshold
CURRENT_WARN_MIN, CURRENT_WARN_MAX = -3.0, 3.0
TEMP_OK_MIN, TEMP_OK_MAX = 28.0, 45.0


def _extract_joint_data(snapshot: dict) -> tuple[list[float], list[float]]:
    """Return (currents[0..5], temps[0..5]) from snapshot."""
    currents = [0.0] * 6
    temps = [0.0] * 6
    for s in snapshot.get("jointCurrents") or []:
        j = s.get("jointId")
        if j in (1, 2, 3, 4, 5, 6):
            currents[j - 1] = float(s.get("currentA", 0))
    for s in snapshot.get("jointTemperatures") or []:
        j = s.get("jointId")
        if j in (1, 2, 3, 4, 5, 6):
            temps[j - 1] = float(s.get("temperatureC", 0))
    return currents, temps


def _current_status(a: float) -> str:
    if a < CURRENT_WARN_MIN or a > CURRENT_WARN_MAX:
        return "critical"
    if a < CURRENT_OK_MIN or a > CURRENT_OK_MAX:
        return "warning"
    return "ok"


def _temp_status(c: float) -> str:
    if c < TEMP_OK_MIN or c > TEMP_OK_MAX:
        return "warning"
    return "ok"


def predict_outcome(snapshot: dict) -> dict:
    """
    Predict from a single API snapshot.
    snapshot: { jointCurrents, jointTemperatures, toolCurrent, faultFlags } (e.g. from POST body).
    Returns: riskScore, predictedOutcome, joints (per-joint details), jointsExceedingCurrent, jointsExceedingTemperature.
    """
    if not os.path.isfile(MODEL_PATH) or not os.path.isfile(FEATURE_NAMES_PATH):
        # Train on first use if no saved model
        train_model()

    model = joblib.load(MODEL_PATH)
    with open(FEATURE_NAMES_PATH) as f:
        feature_names = json.load(f)

    X = _snapshot_to_feature_row(snapshot)
    X = X[feature_names]  # same column order as training

    proba = model.predict_proba(X)[0]
    # riskScore = probability of exceeding threshold (class 1)
    risk_score = float(proba[1]) if len(proba) > 1 else 0.0

    if risk_score >= 0.6:
        predicted_outcome = "critical"
    elif risk_score >= 0.3:
        predicted_outcome = "warning"
    else:
        predicted_outcome = "ok"

    # Per-joint info from snapshot
    currents, temps = _extract_joint_data(snapshot)
    joints = []
    joints_exceeding_current = []
    joints_exceeding_temperature = []

    for i in range(6):
        joint_id = i + 1
        cur = currents[i]
        temp = temps[i]
        cur_status = _current_status(cur)
        temp_status = _temp_status(temp)
        joints.append({
            "jointId": joint_id,
            "currentA": round(cur, 4),
            "temperatureC": round(temp, 2),
            "currentStatus": cur_status,
            "temperatureStatus": temp_status,
        })
        if cur_status != "ok":
            joints_exceeding_current.append(joint_id)
        if temp_status != "ok":
            joints_exceeding_temperature.append(joint_id)

    return {
        "riskScore": risk_score,
        "predictedOutcome": predicted_outcome,
        "joints": joints,
        "jointsExceedingCurrent": joints_exceeding_current,
        "jointsExceedingTemperature": joints_exceeding_temperature,
    }


if __name__ == "__main__":
    # Train and print metrics
    out = train_model()
    print("Accuracy:", out["accuracy"])
    print(out["classification_report"])
    # Example: predict from first row of training data as if it were an API snapshot
    df = _load_training_data()
    row = df.iloc[0]
    fake_snapshot = {
        "jointCurrents": [
            {"jointId": i + 1, "currentA": float(row[f"Current_J{i}"]), "timestamp": str(row["Timestamp"])}
            for i in range(6)
        ],
        "jointTemperatures": [
            {"jointId": i + 1, "temperatureC": float(row[TEMP_COLS[i]]), "timestamp": str(row["Timestamp"])}
            for i in range(6)
        ],
        "toolCurrent": {"currentA": float(row["Tool_current"]), "timestamp": str(row["Timestamp"])},
        "faultFlags": [],
    }
    if str(row.get("Robot_ProtectiveStop", "")).lower() == "true":
        fake_snapshot["faultFlags"].append({"type": "safety_stop", "timestamp": str(row["Timestamp"])})
    if str(row.get("grip_lost", "")).lower() == "true":
        fake_snapshot["faultFlags"].append({"type": "grip_failure", "timestamp": str(row["Timestamp"])})
    result = predict_outcome(fake_snapshot)
    print("Sample prediction:", result)
