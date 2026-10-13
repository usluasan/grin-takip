import { type ReactNode } from 'react'
import { stateLabel, uiState, type UiState } from '../util'
import type { MachineState } from '../types'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function StatePill({ state, lastSeen, extra }: { state: MachineState | 'offline' | undefined; lastSeen?: string | null; extra?: string }) {
  const s: UiState = uiState(state, lastSeen)
  return (
    <span className={`pill ${s}`}>
      <i className="dot" style={{ background: 'currentColor' }} />
      {stateLabel[s]}{extra ? ` · ${extra}` : ''}
    </span>
  )
}

/** Düz SVG çubuk grafik (recharts'a gerek kalmadan tasarımla birebir) */
export function Bars({ data, highlightLast = true, labelTop = false, height = 200 }: { data: Array<{ label: string; value: number; display?: string }>; highlightLast?: boolean; labelTop?: boolean; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className={`bar ${highlightLast && i === data.length - 1 ? 'hi' : ''}`}>
          {labelTop && <b>{d.display ?? d.value}</b>}
          <i style={{ height: `${Math.max(2, (d.value / max) * (labelTop ? 80 : 100))}%` }} title={`${d.label}: ${d.display ?? d.value}`} />
          <em>{d.label}</em>
        </div>
      ))}
    </div>
  )
}

export function Loading({ text = 'Yükleniyor…' }: { text?: string }) {
  return <div style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>{text}</div>
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="error" style={{ padding: 12 }}>{error instanceof Error ? error.message : String(error)}</div>
}
