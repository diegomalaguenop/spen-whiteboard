import { useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import './App.css'

interface Board {
  id: string
  name: string
  project: string
  createdAt: number
}

const BOARDS_KEY = 'spen-whiteboard:boards'
const CANVAS_KEY_PREFIX = 'spen-whiteboard:canvas:'
const CANVAS_SAVE_DEBOUNCE_MS = 500

interface StoredCanvasData {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
}

function loadBoards(): Board[] {
  try {
    const raw = localStorage.getItem(BOARDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveBoards(boards: Board[]) {
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards))
}

function canvasKey(boardId: string): string {
  return `${CANVAS_KEY_PREFIX}${boardId}`
}

function loadCanvasData(boardId: string): StoredCanvasData | null {
  try {
    const raw = localStorage.getItem(canvasKey(boardId))
    return raw ? (JSON.parse(raw) as StoredCanvasData) : null
  } catch {
    return null
  }
}

function saveCanvasData(
  boardId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState
): void {
  const curatedAppState: Partial<AppState> = {
    viewBackgroundColor: appState.viewBackgroundColor,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  }
  localStorage.setItem(
    canvasKey(boardId),
    JSON.stringify({ elements, appState: curatedAppState })
  )
}

const DEFAULT_PROJECTS = [
  'FIN700',
  'AdaptFit',
  'UNAB',
  'MTG',
  'General',
]

function App() {
  const [boards, setBoards] = useState<Board[]>(loadBoards)
  const [activeId, setActiveId] = useState<string | null>(
    boards[0]?.id ?? null
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardProject, setNewBoardProject] = useState(DEFAULT_PROJECTS[0])
  const saveTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    saveBoards(boards)
  }, [boards])

  const activeBoard = boards.find((b) => b.id === activeId) ?? null

  function createBoard() {
    const name = newBoardName.trim() || 'Sin título'
    const board: Board = {
      id: crypto.randomUUID(),
      name,
      project: newBoardProject,
      createdAt: Date.now(),
    }
    setBoards((prev) => [board, ...prev])
    setActiveId(board.id)
    setNewBoardName('')
  }

  function deleteBoard(id: string) {
    if (!confirm('¿Borrar esta pizarra? Esta acción no se puede deshacer.')) return
    setBoards((prev) => prev.filter((b) => b.id !== id))
    localStorage.removeItem(canvasKey(id))
    if (activeId === id) setActiveId(null)
  }

  function handleCanvasChange(elements: readonly ExcalidrawElement[], appState: AppState): void {
    if (!activeBoard) return
    const boardId = activeBoard.id
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      saveCanvasData(boardId, elements, appState)
    }, CANVAS_SAVE_DEBOUNCE_MS)
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>Pizarras</h1>
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen(false)}
              title="Ocultar panel"
            >
              ⮜
            </button>
          </div>

          <div className="new-board">
            <select
              value={newBoardProject}
              onChange={(e) => setNewBoardProject(e.target.value)}
            >
              {DEFAULT_PROJECTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Nombre de la pizarra"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createBoard()}
            />
            <button onClick={createBoard}>+ Nueva pizarra</button>
          </div>

          <div className="board-list">
            {DEFAULT_PROJECTS.map((project) => {
              const projectBoards = boards.filter((b) => b.project === project)
              if (projectBoards.length === 0) return null
              return (
                <div key={project} className="project-group">
                  <div className="project-label">{project}</div>
                  {projectBoards.map((b) => (
                    <div
                      key={b.id}
                      className={`board-item ${b.id === activeId ? 'active' : ''}`}
                      onClick={() => setActiveId(b.id)}
                    >
                      <span className="board-name">{b.name}</span>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteBoard(b.id)
                        }}
                        title="Borrar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
            {boards.length === 0 && (
              <p className="empty-hint">Creá tu primera pizarra arriba.</p>
            )}
          </div>
        </aside>
      )}

      <main className="canvas-area">
        {!sidebarOpen && (
          <button
            className="icon-btn open-sidebar"
            onClick={() => setSidebarOpen(true)}
            title="Mostrar panel"
          >
            ⮞
          </button>
        )}

        {activeBoard ? (
          <div className="excalidraw-wrapper">
            <Excalidraw
              key={activeBoard.id}
              initialData={loadCanvasData(activeBoard.id) ?? undefined}
              onChange={handleCanvasChange}
              theme="dark"
            />
          </div>
        ) : (
          <div className="empty-state">
            <h2>Sin pizarra seleccionada</h2>
            <p>Creá o elegí una pizarra en el panel de la izquierda para empezar a dibujar.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
