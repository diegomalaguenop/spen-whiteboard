import { useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { exportBoardAsPdf, exportBoardAsPng, exportBoardAsSvg } from './export'
import { TECHNICAL_STENCILS } from './stencils'
import type { Board, Project } from './types'
import { canvasKey, loadCanvasData, saveCanvasData } from './canvasStorage'
import PresentationView from './PresentationView'
import { exportToMermaid, type MermaidExportResult } from './mermaidExport'
import MermaidExportModal from './MermaidExportModal'
import './App.css'

const BOARDS_KEY = 'spen-whiteboard:boards'
const PROJECTS_KEY = 'spen-whiteboard:projects'
const CANVAS_SAVE_DEBOUNCE_MS = 500
const DEFAULT_PROJECT_NAMES = ['FIN700', 'AdaptFit', 'UNAB', 'MTG', 'General']

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

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignorar y recrear los proyectos default
  }
  return DEFAULT_PROJECT_NAMES.map((name) => ({ id: crypto.randomUUID(), name }))
}

function saveProjects(projects: Project[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function App() {
  const [boards, setBoards] = useState<Board[]>(loadBoards)
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [activeId, setActiveId] = useState<string | null>(
    boards[0]?.id ?? null
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardProject, setNewBoardProject] = useState(projects[0]?.name ?? '')
  const [newProjectName, setNewProjectName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [presentation, setPresentation] = useState<{ boards: Board[]; index: number } | null>(null)
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false)
  const [mermaidResult, setMermaidResult] = useState<MermaidExportResult | null>(null)
  const saveTimeoutRef = useRef<number | null>(null)
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)

  useEffect(() => {
    saveBoards(boards)
  }, [boards])

  useEffect(() => {
    saveProjects(projects)
  }, [projects])

  const activeBoard = boards.find((b) => b.id === activeId) ?? null
  const visibleBoards = boards.filter((b) => normalize(b.name).includes(normalize(searchQuery)))

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

  function commitRename(id: string): void {
    const name = editingName.trim()
    if (name) {
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)))
    }
    setEditingBoardId(null)
  }

  function addProject(): void {
    const name = newProjectName.trim()
    if (!name) return
    if (projects.some((p) => normalize(p.name) === normalize(name))) return
    setProjects((prev) => [...prev, { id: crypto.randomUUID(), name }])
    setNewProjectName('')
  }

  function deleteProject(id: string): void {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    if (DEFAULT_PROJECT_NAMES.includes(project.name)) return
    if (boards.some((b) => b.project === project.name)) return
    if (!confirm(`¿Borrar el proyecto "${project.name}"?`)) return
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleExport(format: 'png' | 'svg' | 'pdf'): Promise<void> {
    const api = excalidrawAPIRef.current
    if (!api || !activeBoard) return
    setExportMenuOpen(false)
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
    if (!api) return
    setExportMenuOpen(false)
    setMermaidResult(exportToMermaid(api.getSceneElements()))
    setMermaidModalOpen(true)
  }

  function startPresentation(presentBoards: Board[]): void {
    if (presentBoards.length === 0) return
    setPresentation({ boards: presentBoards, index: 0 })
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
    <>
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
              {projects.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
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

          <div className="add-project">
            <input
              type="text"
              placeholder="Nombre del proyecto"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProject()}
            />
            <button onClick={addProject}>+ Agregar proyecto</button>
          </div>

          <input
            type="text"
            className="search-input"
            placeholder="Buscar pizarra..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="board-list">
            {projects.map((project) => {
              const projectBoards = visibleBoards.filter((b) => b.project === project.name)
              const isDefault = DEFAULT_PROJECT_NAMES.includes(project.name)
              if (projectBoards.length === 0 && (isDefault || searchQuery)) return null
              return (
                <div key={project.id} className="project-group">
                  <div className="project-label-row">
                    <span className="project-label">{project.name}</span>
                    {projectBoards.length > 0 && (
                      <button
                        className="present-project-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          startPresentation(projectBoards)
                        }}
                        title="Presentar proyecto"
                      >
                        ▶
                      </button>
                    )}
                    {!isDefault && projectBoards.length === 0 && (
                      <button
                        className="delete-project-btn"
                        onClick={() => deleteProject(project.id)}
                        title="Borrar proyecto"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {projectBoards.length === 0 ? (
                    <p className="empty-hint">Sin pizarras</p>
                  ) : (
                    projectBoards.map((b) => (
                      <div
                        key={b.id}
                        className={`board-item ${b.id === activeId ? 'active' : ''}`}
                        onClick={() => setActiveId(b.id)}
                      >
                        {b.id === editingBoardId ? (
                          <input
                            className="board-name-input"
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => commitRename(b.id)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(b.id)
                              else if (e.key === 'Escape') setEditingBoardId(null)
                            }}
                          />
                        ) : (
                          <span
                            className="board-name"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              setEditingBoardId(b.id)
                              setEditingName(b.name)
                            }}
                          >
                            {b.name}
                          </span>
                        )}
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
                    ))
                  )}
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
              <div className="export-menu">
                <button
                  className="export-menu-btn"
                  disabled={exporting}
                  onClick={() => setExportMenuOpen((open) => !open)}
                >
                  ⬇ Exportar
                </button>
                {exportMenuOpen && (
                  <div className="export-menu-dropdown">
                    <button className="export-menu-item" onClick={() => handleExport('png')}>
                      PNG
                    </button>
                    <button className="export-menu-item" onClick={() => handleExport('svg')}>
                      SVG
                    </button>
                    <button className="export-menu-item" onClick={() => handleExport('pdf')}>
                      PDF
                    </button>
                    <button className="export-menu-item" onClick={handleMermaidExport}>
                      Mermaid
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="excalidraw-wrapper">
              <Excalidraw
                key={activeBoard.id}
                initialData={loadCanvasData(activeBoard.id) ?? undefined}
                onChange={handleCanvasChange}
                excalidrawAPI={(api) => {
                  excalidrawAPIRef.current = api
                  void api.updateLibrary({ libraryItems: TECHNICAL_STENCILS, merge: true })
                }}
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
    </>
  )
}

export default App
