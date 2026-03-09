"""
Temporary FastAPI for robot maintenance prediction.
Run: uvicorn api:app --host 0.0.0.0 --port 5000
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from predict_model import predict_outcome

app = FastAPI(title="Robot maintenance prediction API")


class RobotSnapshotBody(BaseModel):
    """Request body: robot snapshot (same shape as frontend RobotSnapshot)."""
    jointCurrents: list
    jointTemperatures: list
    toolCurrent: dict | None
    faultFlags: list



@app.post("/predict")
def predict(snapshot: RobotSnapshotBody):
    """Accept a robot snapshot JSON and return prediction from underlying model."""
    try:
        result = predict_outcome(snapshot.model_dump())
        # print(result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/test")
def test():
    return {"message": "ok"}

