'use client'

import { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  content: string
}

/** Strip markdown list markers (*, -, •) and numbered prefixes (1. 2) etc.) from a line */
function toListItem(line: string): string {
  const trimmed = line.trim()
  const withoutBullets = trimmed.replace(/^[\s*\-•]+\s*/, '')
  const withoutNumber = withoutBullets.replace(/^\d+[.)]\s*/, '')
  return withoutNumber.trim() || trimmed
}

function contentToListItems(content: string): string[] {
  const lines = content.split(/\n/).map((line) => toListItem(line)).filter(Boolean)
  return lines
}

export function Modal({ isOpen, onClose, content }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const items = contentToListItems(content)
  const showAsList = items.length > 0

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Modal"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__content">
          {showAsList ? (
            <ul className="modal__list">
              {items.map((item, i) => (
                <li key={i} className="modal__list-item">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p>{content || '\u00a0'}</p>
          )}
        </div>
        <button type="button" className="modal__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
