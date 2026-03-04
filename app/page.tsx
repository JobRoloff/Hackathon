import React from 'react'
import { readFile } from 'fs/promises'
import path from 'path'
import { assessRobot } from '../lib/maintenance'
import { getRowByNum, csvRowToRobotSnapshot } from '../lib/csv'
import { ThemeToggle } from './components/ThemeToggle'
import { MaintenanceAssessment } from '../types/robot'

export default async function Page() {
  const csvPath = path.join(process.cwd(), 'data', 'as.csv')
  const csvContent = await readFile(csvPath, 'utf-8')

  const row = getRowByNum(csvContent, 1)
  if (!row) {
    return <h1>No row found for Num=1</h1>
  }

  const snapshot = csvRowToRobotSnapshot(row)
  const {robotId, generatedAt, anomalies, recommendation} : MaintenanceAssessment= assessRobot('robot-1', snapshot)

  return (
    <main className="page">
      {/* <ThemeToggle /> */}
      <h1 className="page__title">Robot maintenance assessment</h1>
      <p className="page__meta">
        <strong>Robot ID:</strong> {robotId} ·{' '}
        <strong>Generated:</strong> {generatedAt}
      </p>
      <div className="card card--primary">
        <p className="card__heading">Recommendation</p>
        <p className="card__body">{recommendation}</p>
      </div>
      {anomalies.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Anomalies ({anomalies.length})
          </h2>
          <ul className="anomaly-list">
            {anomalies.map((a) => (
              <li
                key={a.id}
                className="anomaly-list__item"
                data-severity={a.severity}
              >
                [{a.severity}] {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
