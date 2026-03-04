import type { RobotSnapshot } from '../types/robot'

/**
 * Parses CSV content into an array of row objects keyed by column name.
 */
export function parseCsvRows(csvContent: string): Record<string, string>[] {
  const lines = csvContent.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    header.forEach((key, j) => {
      if (key) row[key] = values[j] ?? ''
    })
    rows.push(row)
  }

  return rows
}

/**
 * Returns the first row where the Num column equals the given value.
 */
export function getRowByNum(csvContent: string, num: number): Record<string, string> | null {
  const rows = parseCsvRows(csvContent)
  return rows.find((r) => Number(r.Num) === num) ?? null
}

const JOINT_CURRENT_KEYS = ['Current_J0', 'Current_J1', 'Current_J2', 'Current_J3', 'Current_J4', 'Current_J5'] as const
const JOINT_TEMP_KEYS = ['Temperature_T0', 'Temperature_J1', 'Temperature_J2', 'Temperature_J3', 'Temperature_J4', 'Temperature_J5'] as const

/**
 * Converts a CSV row (from getRowByNum) into a RobotSnapshot for assessRobot.
 */
export function csvRowToRobotSnapshot(row: Record<string, string>): RobotSnapshot {
  const timestamp = row.Timestamp ?? new Date().toISOString()

  const jointCurrents = JOINT_CURRENT_KEYS.map((key, i) => ({
    jointId: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    currentA: Number(row[key]) || 0,
    timestamp,
  }))

  const jointTemperatures = JOINT_TEMP_KEYS.map((key, i) => ({
    jointId: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    temperatureC: Number(row[key]) || 0,
    timestamp,
  }))

  const toolCurrentRaw = row.Tool_current
  const toolCurrent =
    toolCurrentRaw !== undefined && toolCurrentRaw !== ''
      ? { currentA: Number(toolCurrentRaw) || 0, timestamp }
      : null

  const faultFlags: RobotSnapshot['faultFlags'] = []
  if (row.Robot_ProtectiveStop === 'True') {
    faultFlags.push({ type: 'safety_stop', timestamp })
  }
  if (row.grip_lost === 'True') {
    faultFlags.push({ type: 'grip_failure', timestamp })
  }

  return {
    jointCurrents,
    jointTemperatures,
    toolCurrent,
    faultFlags,
  }
}
