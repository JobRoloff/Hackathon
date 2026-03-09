'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Modal } from './Modal'
import type { Anomaly, RobotSnapshot } from '../../types/robot'

interface AnomalyListProps {
  anomalies: Anomaly[]
  snapshot?: RobotSnapshot | null
}

export function AnomalyList({ anomalies, snapshot }: AnomalyListProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState('')
  const [loading, setLoading] = useState(false)

  const openModal = async (anomaly: Anomaly) => {
    setModalOpen(true)
    setModalContent('')
    setLoading(true)
    try {
      const body = snapshot
        ? { anomaly, snapshot }
        : anomaly
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok && typeof data?.content === 'string') {
        setModalContent(data.content)
      } else {
        setModalContent(data?.error ?? 'Could not load recommendation.')
      }
    } catch {
      setModalContent('Failed to load recommendation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <ul className="anomaly-list">
        {anomalies.map((a) => (
          <li
            key={a.id}
            className="anomaly-list__item"
            data-severity={a.severity}
            // data-severity='critical'
          >
            <span className="anomaly-list__text">
              [{a.severity}] {a.message}
            </span>
            <button
              type="button"
              className="anomaly-list__icon-btn"
              onClick={() => openModal(a)}
              aria-label="Get recommendation"
              disabled={loading}
            >
              <Info size={18} />
            </button>
          </li>
        ))}
      </ul>
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        content={loading ? 'Loading recommendation…' : modalContent}
      />
    </>
  )
}
