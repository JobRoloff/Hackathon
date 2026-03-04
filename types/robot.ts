export type JointId = 1 | 2 | 3 | 4 | 5 | 6

export interface JointCurrentSample {
  jointId: JointId
  /**
   * Electrical current drawn by the joint in Amperes.
   * Normal range: approximately -6A to +6A.
   */
  currentA: number
  /**
   * ISO 8601 timestamp for when this sample was recorded.
   */
  timestamp: string
}

export interface JointTemperatureSample {
  jointId: JointId
  /**
   * Joint temperature in degrees Celsius.
   * Normal range: 28°C to 45°C.
   */
  temperatureC: number
  timestamp: string
}

export interface ToolCurrentSample {
  /**
   * Electrical current drawn by the end-effector in Amperes.
   * Normal range: 0.07A to 0.15A.
   */
  currentA: number
  timestamp: string
}

export type FaultFlagType = 'safety_stop' | 'grip_failure'

export interface FaultFlagSample {
  type: FaultFlagType
  timestamp: string
}

/**
 * Snapshot of all relevant telemetry for a single robot
 * over a short window of time.
 */
export interface RobotSnapshot {
  jointCurrents: JointCurrentSample[]
  jointTemperatures: JointTemperatureSample[]
  toolCurrent: ToolCurrentSample | null
  faultFlags: FaultFlagSample[]
}

export type AnomalySensor =
  | 'joint_current'
  | 'joint_temperature'
  | 'tool_current'
  | 'fault_flag'

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface Anomaly {
  id: string
  sensor: AnomalySensor
  jointId?: JointId
  timestamp: string
  severity: AnomalySeverity
  message: string
}

export interface MaintenanceAssessment {
  robotId: string
  generatedAt: string
  anomalies: Anomaly[]
  /**
   * High-level recommendation for the maintenance team.
   */
  recommendation: string
}

