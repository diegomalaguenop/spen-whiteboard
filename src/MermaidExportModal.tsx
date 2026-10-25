import { useEffect, useRef, useState } from 'react'
import type { MermaidExportResult } from './mermaidExport'

type Mermaid = typeof import('mermaid').default

interface MermaidExportModalProps {
  result: MermaidExportResult | null
  onClose: () => void
}

let mermaidModulePromise: Promise<Mermaid> | null = null
let mermaidInitialized = false

function loadMermaid(): Promise<Mermaid> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      if (!mermaidInitialized) {
        mermaid.initialize({ theme: 'dark', startOnLoad: false })
        mermaidInitialized = true
      }
      return mermaid
    })
  }
  return mermaidModulePromise
}

function MermaidExportModal({ result, onClose }: MermaidExportModalProps) {
  const [copied, setCopied] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!result) return
    let cancelled = false
    setPreviewError(null)
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-preview-${Date.now()}`, result.code))
      .then(({ svg }) => {
        if (!cancelled && previewRef.current) previewRef.current.innerHTML = svg
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Error desconocido'
          setPreviewError(message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [result])

  async function handleCopy(): Promise<void> {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('No se pudo copiar al portapapeles')
    }
  }

  return (
    <div className="mermaid-modal-overlay" onClick={onClose}>
      <div className="mermaid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mermaid-modal-header">
          <h2>Exportar a Mermaid</h2>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {!result ? (
          <p className="mermaid-modal-empty">
            No se pudo detectar ningún nodo reconocible en esta pizarra. El export a Mermaid
            funciona mejor con los stencils técnicos de la biblioteca (Servicio, Base de datos,
            Estado, Transición, Cola) — probá armar el diagrama con esas formas y volvé a
            intentarlo.
          </p>
        ) : (
          <>
            <p className="mermaid-modal-summary">
              {result.diagramType === 'stateDiagram-v2' ? 'Diagrama de estados' : 'Flowchart'} —{' '}
              {result.nodeCount} nodo{result.nodeCount === 1 ? '' : 's'}, {result.edgeCount} conexión
              {result.edgeCount === 1 ? '' : 'es'}
            </p>

            <div className="mermaid-preview" ref={previewRef} />
            {previewError && (
              <p className="mermaid-preview-error">
                No se pudo renderizar el preview ({previewError}), pero el código sigue siendo
                válido para copiar.
              </p>
            )}

            <pre className="mermaid-code">
              <code>{result.code}</code>
            </pre>

            <button className="mermaid-copy-btn" onClick={handleCopy}>
              {copied ? '✓ Copiado' : '📋 Copiar al portapapeles'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default MermaidExportModal
