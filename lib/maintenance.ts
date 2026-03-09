/**
 * 1. define max / min ranges for each robot parameter
 * 2. define a function to look at a given set of parameters in a time series to see if anything is outtside of the defined normal ranges
 */
import {
    Anomaly,
    MaintenanceAssessment,
    RobotSnapshot,
  } from '../types/robot'

  // FastAPI: uvicorn api:app --host 0.0.0.0 --port 5000
const PREDICT_API_URL = process.env.PREDICT_API_URL ?? 'http://127.0.0.1:5000/predict'

  export interface JointPrediction {
    jointId: number
    currentA: number
    temperatureC: number
    currentStatus: 'ok' | 'warning' | 'critical'
    temperatureStatus: 'ok' | 'warning'
  }

  export interface PredictionResult {
    riskScore: number
    predictedOutcome: 'ok' | 'warning' | 'critical'
    joints: JointPrediction[]
    jointsExceedingCurrent: number[]
    jointsExceedingTemperature: number[]
    /** When outcome is warning/critical but no joint exceeds limits, joints closest to current limit */
    jointsOfConcern?: number[]
  }

  // TODO: this is calling the fastapi pytthon model
  export async function predictOutcome(snapshot: RobotSnapshot): Promise<PredictionResult | null> {
    try {
      const res = await fetch(PREDICT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
      console.log(res)
      if (!res.ok) return null
      return (await res.json()) as PredictionResult
    } catch {
      return null
    }
  }
  
  const JOINT_CURRENT_MIN = -3
  const JOINT_CURRENT_MAX = 3
  
  const JOINT_TEMP_MIN = 28
  const JOINT_TEMP_MAX = 45
  
  const TOOL_CURRENT_MIN = 0.07
  const TOOL_CURRENT_MAX = 0.15
  
  /** Merges multiple snapshots into one for assessment (e.g. after filtering). */
  function mergeSnapshots(snapshots: RobotSnapshot[]): RobotSnapshot {
    const nonEmpty = snapshots.filter(
      (s) =>
        s.jointCurrents.length > 0 ||
        s.jointTemperatures.length > 0 ||
        s.toolCurrent != null ||
        s.faultFlags.length > 0,
    )
    if (nonEmpty.length === 0) {
      return {
        jointCurrents: [],
        jointTemperatures: [],
        toolCurrent: null,
        faultFlags: [],
      }
    }
    return {
      jointCurrents: nonEmpty.flatMap((s) => s.jointCurrents),
      jointTemperatures: nonEmpty.flatMap((s) => s.jointTemperatures),
      toolCurrent: nonEmpty.map((s) => s.toolCurrent).filter(Boolean).slice(-1)[0] ?? null,
      faultFlags: nonEmpty.flatMap((s) => s.faultFlags),
    }
  }

  // TODO: use predictOutcome for the robot assessment (e.g. add prediction to recommendation)
  export async function assessRobot(
    robotId: string,
    snapshots: RobotSnapshot[],
  ): Promise<MaintenanceAssessment> {
    const snapshot = mergeSnapshots(snapshots)
    const anomalies: Anomaly[] = []
    const now = new Date().toISOString()
  
    // Joint current checks
    snapshot.jointCurrents.forEach((sample, index) => {
      if (sample.currentA < JOINT_CURRENT_MIN || sample.currentA > JOINT_CURRENT_MAX) {
        anomalies.push({
          id: `joint-current-out-of-range-${sample.jointId}-${index}`,
          sensor: 'joint_current',
          jointId: sample.jointId,
          timestamp: sample.timestamp,
          severity: 'warning',
          message: `Joint ${sample.jointId} current ${sample.currentA.toFixed(
            2,
          )}A is outside the normal range of ${JOINT_CURRENT_MIN}A to ${JOINT_CURRENT_MAX}A.`,
        })
      }
    })
  
    // Joint temperature checks
    snapshot.jointTemperatures.forEach((sample, index) => {
      if (sample.temperatureC < JOINT_TEMP_MIN || sample.temperatureC > JOINT_TEMP_MAX) {
        anomalies.push({
          id: `joint-temp-out-of-range-${sample.jointId}-${index}`,
          sensor: 'joint_temperature',
          jointId: sample.jointId,
          timestamp: sample.timestamp,
          severity: 'warning',
          message: `Joint ${sample.jointId} temperature ${sample.temperatureC}°C is outside the normal range of ${JOINT_TEMP_MIN}°C to ${JOINT_TEMP_MAX}°C.`,
        })
      }
    })
  
    // Tool current checks
    if (snapshot.toolCurrent) {
      const { currentA, timestamp } = snapshot.toolCurrent
      if (currentA < TOOL_CURRENT_MIN || currentA > TOOL_CURRENT_MAX) {
        anomalies.push({
          id: 'tool-current-out-of-range',
          sensor: 'tool_current',
          timestamp,
          severity: 'warning',
          message: `Tool current ${currentA.toFixed(
            3,
          )}A is outside the normal range of ${TOOL_CURRENT_MIN}A to ${TOOL_CURRENT_MAX}A.`,
        })
      }
    }
  
    // Fault flag checks - repeated stops/failures in a short window.
    if (snapshot.faultFlags.length > 0) {
      const safetyStops = snapshot.faultFlags.filter(
        (f) => f.type === 'safety_stop',
      )
      const gripFailures = snapshot.faultFlags.filter(
        (f) => f.type === 'grip_failure',
      )
  
      if (safetyStops.length >= 3) {
        anomalies.push({
          id: 'repeated-safety-stops',
          sensor: 'fault_flag',
          timestamp: safetyStops[safetyStops.length - 1]?.timestamp ?? now,
          severity: 'critical',
          message:
            'Multiple safety stops detected in a short time window. Investigate for root cause before continuing production.',
        })
      }
  
      if (gripFailures.length >= 3) {
        anomalies.push({
          id: 'repeated-grip-failures',
          sensor: 'fault_flag',
          timestamp: gripFailures[gripFailures.length - 1]?.timestamp ?? now,
          severity: 'warning',
          message:
            'Repeated grip failures detected. Check gripper alignment, wear, and part presentation.',
        })
      }
    }
  
    const recommendation =
      anomalies.length === 0
        ? 'No immediate issues detected. Continue normal operation and monitoring.'
        : 'Review detected anomalies and schedule inspection before the next production window if possible. Click an anomaly for detailed recommendations.'

    return {
      robotId,
      generatedAt: now,
      anomalies,
      recommendation,
    }
  }
  

  