import { readFile } from 'fs/promises'
import path from 'path'
import { parseCsvRows, csvRowToRobotSnapshot } from '../../lib/csv'
import { predictOutcome } from '../../lib/maintenance'

const CSV_PATH = path.join(process.cwd(), 'data', 'actual_data.csv')

const outcomeStyles: Record<string, { bg: string; color: string }> = {
  ok: { bg: 'var(--md-sys-color-tertiary-container)', color: 'var(--md-sys-color-on-tertiary-container)' },
  warning: { bg: '#fef3c7', color: '#92400e' },
  critical: { bg: '#fee2e2', color: '#991b1b' },
}

export default async function PredictPage() {
  const csvContent = await readFile(CSV_PATH, 'utf-8')
  const rows = parseCsvRows(csvContent)
  const rowIndex = 11
  const row = rows[rowIndex] ?? rows[0] ?? null

  if (!row) {
    return (
      <main className="page">
        <h1 className="page__title">Predict</h1>
        <p>No rows found in data CSV.</p>
      </main>
    )
  }

  const snapshot = csvRowToRobotSnapshot(row)
  const result = await predictOutcome(snapshot)

  const outcomeStyle = outcomeStyles[result?.predictedOutcome ?? 'ok'] ?? outcomeStyles.ok
  const rowNum = row.Num ?? rowIndex + 1
  const timestamp = row.Timestamp ?? ''

  // Which joints have an issue (current and/or temperature) from the predicted outcome
  const jointsWithCurrentIssue = new Set(result?.jointsExceedingCurrent ?? [])
  const jointsWithTempIssue = new Set(result?.jointsExceedingTemperature ?? [])
  const allJointsWithIssues = new Set([...jointsWithCurrentIssue, ...jointsWithTempIssue])
  const jointIssuesList = result?.joints?.map((j) => ({
    jointId: j.jointId,
    currentIssue: jointsWithCurrentIssue.has(j.jointId),
    tempIssue: jointsWithTempIssue.has(j.jointId),
    currentA: j.currentA,
    temperatureC: j.temperatureC,
    currentStatus: j.currentStatus,
    temperatureStatus: j.temperatureStatus,
  })).filter((x) => x.currentIssue || x.tempIssue) ?? []

  // When model says warning/critical but no joint exceeds: show joints of concern (from API or derived)
  const isConcernOutcome = result?.predictedOutcome === 'warning' || result?.predictedOutcome === 'critical'
  const jointsOfConcern = result?.jointsOfConcern ?? (isConcernOutcome && result?.joints
    ? [...result.joints]
        .sort((a, b) => Math.abs(b.currentA) - Math.abs(a.currentA))
        .slice(0, 3)
        .map((j) => j.jointId)
    : [])
  const concernJointDetails = result?.joints?.filter((j) => jointsOfConcern.includes(j.jointId)) ?? []

  return (
    <main className="page">
      <h1 className="page__title">Predict</h1>

      {result ? (
        <>
          {/* Input context */}
          <section className="section">
            <h2 className="section__title">Input</h2>
            <div className="card">
              <dl style={{ display: 'grid', gap: '0.5rem', margin: 0 }}>
                <div>
                  <dt style={{ fontWeight: 600, margin: 0 }}>CSV row</dt>
                  <dd style={{ margin: '0.25rem 0 0' }}>Row index {rowIndex}, Num = {rowNum}</dd>
                </div>
                {timestamp && (
                  <div>
                    <dt style={{ fontWeight: 600, margin: 0 }}>Timestamp</dt>
                    <dd style={{ margin: '0.25rem 0 0' }}>{timestamp}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {/* Prediction summary */}
          <section className="section">
            <h2 className="section__title">Prediction</h2>
            <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem 1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Outcome</div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.35rem 0.75rem',
                      borderRadius: 8,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      ...outcomeStyle,
                    }}
                  >
                    {result.predictedOutcome}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Risk score</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{(result.riskScore * 100).toFixed(1)}%</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '0.125rem' }}>
                    Probability that any joint current is outside normal range (-3 to 3 A).
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Which of the 6 joints are an issue (from predicted outcome) */}
          <section className="section">
            <h2 className="section__title">Joints with issues (from prediction)</h2>
            <div className="card">
              {allJointsWithIssues.size > 0 ? (
                <>
                  <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600 }}>
                    Joints flagged (outside limits): {Array.from(allJointsWithIssues).sort((a, b) => a - b).join(', ')}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {jointIssuesList.map((j) => (
                      <li key={j.jointId} style={{ marginBottom: '0.5rem' }}>
                        <strong>Joint {j.jointId}</strong>
                        {j.currentIssue && j.tempIssue && ' — current and temperature out of range'}
                        {j.currentIssue && !j.tempIssue && ` — current out of range (${j.currentA.toFixed(3)} A, ${j.currentStatus})`}
                        {!j.currentIssue && j.tempIssue && ` — temperature out of range (${j.temperatureC.toFixed(1)} °C, ${j.temperatureStatus})`}
                      </li>
                    ))}
                  </ul>
                </>
              ) : isConcernOutcome && jointsOfConcern.length > 0 ? (
                <>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                    Overall prediction is {result.predictedOutcome}, but no joint exceeds the current (-3 to 3 A) or temperature (28–45 °C) limits.
                  </p>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9375rem' }}>
                    The model may be reacting to the combination of values. Joints with current nearest to the ±3 A limit (joints of concern):
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {concernJointDetails.map((j) => (
                      <li key={j.jointId} style={{ marginBottom: '0.35rem' }}>
                        <strong>Joint {j.jointId}</strong> — {j.currentA.toFixed(3)} A
                      </li>
                    ))}
                  </ul>
                </>
              ) : isConcernOutcome ? (
                <p style={{ margin: 0 }}>
                  Overall prediction is <strong>{result.predictedOutcome}</strong>. No single joint exceeds the current or temperature limits; the model is likely reacting to the combination of features (e.g. time, tool current, or pattern of values).
                </p>
              ) : (
                <p style={{ margin: 0 }}>None of the 6 joints are outside normal range for this row.</p>
              )}
            </div>
          </section>

          {/* Joints exceeding thresholds (summary) */}
          <section className="section">
            <h2 className="section__title">Threshold summary</h2>
            <div className="card">
              <dl style={{ display: 'grid', gap: '0.75rem', margin: 0 }}>
                <div>
                  <dt style={{ fontWeight: 600, margin: 0 }}>Current (outside -3 to 3 A)</dt>
                  <dd style={{ margin: '0.25rem 0 0' }}>
                    {result.jointsExceedingCurrent?.length
                      ? `Joint(s) ${result.jointsExceedingCurrent.join(', ')}`
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, margin: 0 }}>Temperature (outside 28–45 °C)</dt>
                  <dd style={{ margin: '0.25rem 0 0' }}>
                    {result.jointsExceedingTemperature?.length
                      ? `Joint(s) ${result.jointsExceedingTemperature.join(', ')}`
                      : 'None'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Per-joint table */}
          {result.joints?.length > 0 && (
            <section className="section">
              <h2 className="section__title">All 6 joints</h2>
              <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>Joint</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>Current (A)</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>Current status</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>Temp (°C)</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>Temp status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.joints.map((j) => {
                      const hasIssue = j.currentStatus !== 'ok' || j.temperatureStatus !== 'ok'
                      return (
                        <tr
                          key={j.jointId}
                          style={{
                            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                            ...(hasIssue ? { backgroundColor: 'rgba(254, 226, 226, 0.35)' } : {}),
                          }}
                        >
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            Joint {j.jointId}
                            {hasIssue && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-error)' }}>
                                issue
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.5rem 0.75rem' }}>{j.currentA.toFixed(3)}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <span
                              style={{
                                textTransform: 'capitalize',
                                ...(j.currentStatus !== 'ok' ? outcomeStyles[j.currentStatus] ?? {} : {}),
                                ...(j.currentStatus === 'ok' ? {} : { padding: '0.125rem 0.5rem', borderRadius: 4 }),
                              }}
                            >
                              {j.currentStatus}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.5rem 0.75rem' }}>{j.temperatureC.toFixed(1)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>{j.temperatureStatus}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="card">
          <p style={{ margin: 0 }}>
            Prediction failed. FastAPI may be down or returned an error. Ensure{' '}
            <code>uvicorn api:app --host 0.0.0.0 --port 5000</code> is running.
          </p>
        </div>
      )}
    </main>
  )
}
