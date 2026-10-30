import { useEffect, useRef, useState } from 'react'

export type ExportFormat = 'png' | 'svg' | 'pdf'

interface ExportMenuProps {
  exporting: boolean
  onExport: (format: ExportFormat) => void
  onMermaidExport: () => void
}

export default function ExportMenu({ exporting, onExport, onMermaidExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent): void {
      const menu = menuRef.current
      if (menu && event.target instanceof Node && menu.contains(event.target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function pick(format: ExportFormat): void {
    setOpen(false)
    onExport(format)
  }

  function pickMermaid(): void {
    setOpen(false)
    onMermaidExport()
  }

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="export-menu-btn"
        disabled={exporting}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="export-menu-dropdown"
        aria-busy={exporting}
        aria-label={exporting ? 'Exportando pizarra…' : 'Exportar pizarra'}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⬇</span> Exportar
      </button>
      {open && (
        <div id="export-menu-dropdown" className="export-menu-dropdown" role="menu" aria-label="Formatos de exportación">
          <button className="export-menu-item" role="menuitem" aria-label="Exportar como PNG" onClick={() => pick('png')}>
            PNG
          </button>
          <button className="export-menu-item" role="menuitem" aria-label="Exportar como SVG" onClick={() => pick('svg')}>
            SVG
          </button>
          <button className="export-menu-item" role="menuitem" aria-label="Exportar como PDF" onClick={() => pick('pdf')}>
            PDF
          </button>
          <button
            className="export-menu-item"
            role="menuitem"
            aria-label="Exportar como diagrama Mermaid"
            onClick={pickMermaid}
          >
            Mermaid
          </button>
        </div>
      )}
    </div>
  )
}
