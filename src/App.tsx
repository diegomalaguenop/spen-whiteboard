import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { exportBoardAsPdf, exportBoardAsPng, exportBoardAsSvg } from './export'
import { TECHNICAL_STENCILS } from './stencils'
import type { Board } from './types'
import { canvasKey, loadCanvasData, saveCanvasData } from './canvasStorage'
import PresentationView from './PresentationView'
import { exportToMermaid, type MermaidExportResult } from './mermaidExport'
import MermaidExportModal from './MermaidExportModal'
import type { NotionConfig } from './notionTypes'
import { loadNotionConfig, saveNotionConfig, clearNotionConfig, loadNotionLinks, saveNotionLinks } from './notionStorage'
import { getRemoteUpdatedAt, fetchRemoteCanvasData, type PulledBoard } from './notionSync'
import { useNotionSync } from './useNotionSync'
import { useBoards } from './useBoards'
import { useProjects } from './useProjects'
import Sidebar from './Sidebar'
import ExportMenu, { type ExportFormat } from './ExportMenu'
import NotionPanel from './NotionPanel'
import './App.css'

const CANVAS_SAVE_DEBOUNCE_MS = 500
const CANVAS_NOT_READY_MESSAGE = 'La pizarra todavía se está cargando. Intentá exportar de nuevo en un momento.'

function App() {
  const boardsApi = useBoards()
  const projectsApi = useProjects()
  const { boards, boardsRef, activeId, activeIdRef, activeBoard } = boardsApi
  const { projects } = projectsApi

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [presentation, setPresentation] = useState<{ boards: Board[]; index: number } | null>(null)
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false)
  const [mermaidResult, setMermaidResult] = useState<MermaidExportResult | null>(null)
  const [notionConfig, setNotionConfig] = useState<NotionConfig | null>(loadNotionConfig)
  const [notionPanelOpen, setNotionPanelOpen] = useState(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)

  const handleBoardsPulled = useCallback(
    (pulled: PulledBoard[]): void => {
      boardsApi.addPulledBoards(pulled)
      const links = loadNotionLinks()
      for (const p of pulled) {
        if (p.canvasData) {
          localStorage.setItem(canvasKey(p.board.id), JSON.stringify(p.canvasData))
        }
        links[p.board.id] = p.link
      }
      saveNotionLinks(links)
    },
    [boardsApi.addPulledBoards]
  )

  const notionSync = useNotionSync({
    notionConfig,
    boardsRef,
    excalidrawAPIRef,
    onBoardsPulled: handleBoardsPulled,
  })

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') notionSync.flushPending()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handleVisibilityChange)
    }
  }, [notionSync.flushPending])

  function createBoard(name: string, project: string): void {
    // Flush antes de cambiar de pizarra activa: si no, el push pendiente de la pizarra anterior
    // se dispararía después del remount del canvas y subiría el PNG de esta pizarra nueva con
    // el id de la vieja.
    notionSync.flushPending()
    boardsApi.createBoard(name, project)
  }

  function deleteBoard(id: string): void {
    if (!confirm('¿Borrar esta pizarra? Esta acción no se puede deshacer.')) return
    // Si había un push agendado para esta pizarra, se cancela en vez de flushearlo: ya se va a
    // borrar, no tiene sentido subirla a Notion.
    notionSync.cancelPendingFor(id)
    // Best-effort: si falla (sin red, token vencido), queda reflejado en notionSync.error, pero
    // no bloqueamos el borrado local por eso.
    void notionSync.deleteRemoteBoard(id)
    boardsApi.deleteBoard(id)
  }

  function deleteProject(id: string): void {
    projectsApi.deleteProject(id, boards)
  }

  async function selectBoard(board: Board): Promise<void> {
    if (board.id === activeId) return
    notionSync.flushPending()
    if (notionConfig) {
      const link = loadNotionLinks()[board.id]
      if (link) {
        try {
          const remoteUpdatedAt = await getRemoteUpdatedAt(notionConfig, link.notionPageId)
          if (remoteUpdatedAt > board.updatedAt) {
            const downloadRemote = confirm(
              `Esta pizarra tiene cambios más nuevos en Notion (${new Date(remoteUpdatedAt).toLocaleString()}). ¿Descargarlos y sobreescribir lo local?`
            )
            if (downloadRemote) {
              const canvasData = await fetchRemoteCanvasData(notionConfig, link)
              if (canvasData) {
                localStorage.setItem(canvasKey(board.id), JSON.stringify(canvasData))
              }
              boardsApi.touchBoard(board.id, remoteUpdatedAt)
            }
          }
        } catch {
          // si falla el chequeo de conflicto, no bloqueamos la apertura de la pizarra
        }
      }
    }
    boardsApi.setActiveBoardId(board.id)
  }

  function handleNotionConnected(config: NotionConfig): void {
    setNotionConfig(config)
    saveNotionConfig(config)
    setNotionPanelOpen(false)
  }

  function handleNotionDisconnect(): void {
    clearNotionConfig()
    setNotionConfig(null)
    setNotionPanelOpen(false)
  }

  async function handleExport(format: ExportFormat): Promise<void> {
    const api = excalidrawAPIRef.current
    if (!api || !activeBoard) {
      alert(CANVAS_NOT_READY_MESSAGE)
      return
    }
    setExporting(true)
    try {
      if (format === 'png') await exportBoardAsPng(api, activeBoard.name)
      else if (format === 'svg') await exportBoardAsSvg(api, activeBoard.name)
      else await exportBoardAsPdf(api, activeBoard.name)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      alert(`No se pudo exportar: ${message}`)
    } finally {
      setExporting(false)
    }
  }

  function handleMermaidExport(): void {
    const api = excalidrawAPIRef.current
    if (!api) {
      alert(CANVAS_NOT_READY_MESSAGE)
      return
    }
    setMermaidResult(exportToMermaid(api.getSceneElements()))
    setMermaidModalOpen(true)
  }

  function startPresentation(presentBoards: Board[]): void {
    if (presentBoards.length === 0) return
    setPresentation({ boards: presentBoards, index: 0 })
  }

  const handleCanvasChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState): void => {
      const boardId = activeIdRef.current
      if (!boardId) return
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(() => {
        saveCanvasData(boardId, elements, appState)
        boardsApi.touchBoard(boardId)
      }, CANVAS_SAVE_DEBOUNCE_MS)

      notionSync.scheduleSync(boardId)
    },
    [activeIdRef, boardsApi.touchBoard, notionSync.scheduleSync]
  )

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPIRef.current = api
    void api.updateLibrary({ libraryItems: TECHNICAL_STENCILS, merge: true })
  }, [])

  return (
    <>
    <div className="app-shell">
      {sidebarOpen && (
        <Sidebar
          boards={boards}
          projects={projects}
          activeId={activeId}
          notionStatus={notionSync.status}
          notionError={notionSync.error}
          onOpenNotionPanel={() => setNotionPanelOpen(true)}
          onClose={() => setSidebarOpen(false)}
          onCreateBoard={createBoard}
          onAddProject={projectsApi.addProject}
          onDeleteProject={deleteProject}
          onSelectBoard={(board) => void selectBoard(board)}
          onDeleteBoard={deleteBoard}
          onRenameBoard={boardsApi.renameBoard}
          onStartPresentation={startPresentation}
        />
      )}

      <main className="canvas-area">
        {!sidebarOpen && !activeBoard && (
          <button
            className="icon-btn open-sidebar"
            onClick={() => setSidebarOpen(true)}
            title="Mostrar panel"
          >
            ⮞
          </button>
        )}

        {activeBoard ? (
          <>
            <div className="canvas-header">
              {!sidebarOpen && (
                <button
                  className="icon-btn"
                  onClick={() => setSidebarOpen(true)}
                  title="Mostrar panel"
                >
                  ⮞
                </button>
              )}
              <span className="canvas-header-title">{activeBoard.name}</span>
              <button
                className="present-btn"
                onClick={() => startPresentation([activeBoard])}
              >
                ▶ Presentar
              </button>
              <ExportMenu exporting={exporting} onExport={(f) => void handleExport(f)} onMermaidExport={handleMermaidExport} />
            </div>
            <div className="excalidraw-wrapper">
              <Excalidraw
                key={activeBoard.id}
                initialData={loadCanvasData(activeBoard.id) ?? undefined}
                onChange={handleCanvasChange}
                excalidrawAPI={handleExcalidrawAPI}
                theme="dark"
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>Sin pizarra seleccionada</h2>
            <p>Creá o elegí una pizarra en el panel de la izquierda para empezar a dibujar.</p>
          </div>
        )}
      </main>
    </div>
    {presentation && (
      <PresentationView
        boards={presentation.boards}
        initialIndex={presentation.index}
        onExit={() => setPresentation(null)}
      />
    )}
    {mermaidModalOpen && (
      <MermaidExportModal result={mermaidResult} onClose={() => setMermaidModalOpen(false)} />
    )}
    {notionPanelOpen && (
      <NotionPanel
        config={notionConfig}
        onConnected={handleNotionConnected}
        onDisconnect={handleNotionDisconnect}
        onClose={() => setNotionPanelOpen(false)}
      />
    )}
    </>
  )
}

export default App
