import React from 'react'
import { readFile } from 'fs/promises'
import path from 'path'
import { assessRobot } from '../lib/maintenance'
import { getRowByNum, csvRowToRobotSnapshot } from '../lib/csv'
import { ThemeToggle } from './components/ThemeToggle'
import { AnomalyList } from './components/AnomalyList'
import { MaintenanceAssessment } from '../types/robot'

export default async function Page() {
  const csvPath = path.join(process.cwd(), 'data', 'actual_data.csv')
  const csvContent = await readFile(csvPath, 'utf-8')

  // TODO - Step: Get single robot snapshot: current and temp for each joing 
  const row = getRowByNum(csvContent, 1)
  if (!row) {
    return <h1>No row found for Num=1</h1>
  }

  const snapshot = csvRowToRobotSnapshot(row)
  
  const { robotId, generatedAt, anomalies, recommendation }: MaintenanceAssessment = await assessRobot('robot-1', [snapshot])

  return (
    <main className="page">
      <h1 className="page__title">Robot maintenance assessment</h1>
      {anomalies.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Anomalies ({anomalies.length})
          </h2>
          <AnomalyList anomalies={anomalies} snapshot={snapshot} />
        </section>
      )}
    </main>
  )
}
