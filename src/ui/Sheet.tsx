import type { ReactNode } from 'react'

export function Sheet({
  title,
  hint,
  onClose,
  children,
}: {
  title: string
  hint?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </div>
  )
}
