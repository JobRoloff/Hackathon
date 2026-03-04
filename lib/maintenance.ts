/**
 * 1. define max / min ranges for each robot parameter
 * 2. define a function to look at a given set of parameters in a time series to see if anything is outtside of the defined normal ranges
 */
import {
    Anomaly,
    MaintenanceAssessment,
    RobotSnapshot,
  } from '../types/robot'
  
  const JOINT_CURRENT_MIN = -6
  const JOINT_CURRENT_MAX = 6
  
  const JOINT_TEMP_MIN = 28
  const JOINT_TEMP_MAX = 45
  
  const TOOL_CURRENT_MIN = 0.07
  const TOOL_CURRENT_MAX = 0.15
  
  function predictOutcome(){
    // TODO: use the python model
  }

  // TODO: use prredictOutcome for the robot assessment
  export function assessRobot(
    robotId: string,
    snapshot: RobotSnapshot,
  ): MaintenanceAssessment {
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
        : 'Review detected anomalies and schedule inspection before the next production window if possible.'
  
    return {
      robotId,
      generatedAt: now,
      anomalies,
      recommendation,
    }
  }
  
  