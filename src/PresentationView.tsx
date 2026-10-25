import { useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { Board } from './types'
import { loadCanvasData } from './canvasStorage'

interface PresentationViewProps {
  boards: Board[]
  initialIndex: number
  onExit: () => void
}

function PresentationView({ boards, initialIndex, onExit }: PresentationViewProps) {
  const [index, setIndex] = useState(initialIndex)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const board = boards[index]
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    const el = containerRef.current
    el?.requestFullscreen().catch(() => {
      // El navegador puede rechazar fullscreen (ej. sin gesto de usuario); seguimos igual en modo overlay normal.
    })

    function handleFullscreenChange(): void {
      if (!document.fullscreenElement) onExitRef.current()
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExitRef.current()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((i) => Math.min(i + 1, boards.length - 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [boards.length])

  if (!board) return null

  return (
    <div className="presentation-overlay" ref={containerRef}>
      <button className="presentation-exit-btn" onClick={onExit} title="Salir (Esc)">
        ✕ Salir
      </button>

      {boards.length > 1 && (
        <>
          <button
            className="presentation-nav-btn presentation-nav-prev"
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            title="Pizarra anterior"
          >
            ‹
          </button>
          <button
            className="presentation-nav-btn presentation-nav-next"
            onClick={() => setIndex((i) => Math.min(i + 1, boards.length - 1))}
            disabled={index === boards.length - 1}
            title="Siguiente pizarra"
          >
            ›
          </button>
          <div className="presentation-indicator">
            {index + 1} / {boards.length} — {board.name}
          </div>
        </>
      )}

      <div className="presentation-canvas-wrapper">
        <Excalidraw
          key={board.id}
          initialData={loadCanvasData(board.id) ?? undefined}
          viewModeEnabled
          zenModeEnabled
          theme="dark"
          excalidrawAPI={(api) => {
            requestAnimationFrame(() => {
              api.scrollToContent(undefined, {
                fitToViewport: true,
                viewportZoomFactor: 0.9,
                animate: false,
              })
            })
          }}
        />
      </div>
    </div>
  )
}

export default PresentationView
