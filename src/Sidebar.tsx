import { useState } from 'react'
import type { Board, Project } from './types'
import type { NotionStatus } from './useNotionSync'
import { DEFAULT_PROJECT_NAMES } from './useProjects'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

interface SidebarProps {
  boards: Board[]
  projects: Project[]
  activeId: string | null
  notionStatus: NotionStatus
  notionError: string | null
  onOpenNotionPanel: () => void
  onClose: () => void
  onCreateBoard: (name: string, project: string) => void
  onAddProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onSelectBoard: (board: Board) => void
  onDeleteBoard: (id: string) => void
  onRenameBoard: (id: string, name: string) => void
  onStartPresentation: (boards: Board[]) => void
}

export default function Sidebar({
  boards,
  projects,
  activeId,
  notionStatus,
  notionError,
  onOpenNotionPanel,
  onClose,
  onCreateBoard,
  onAddProject,
  onDeleteProject,
  onSelectBoard,
  onDeleteBoard,
  onRenameBoard,
  onStartPresentation,
}: SidebarProps) {
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardProject, setNewBoardProject] = useState(projects[0]?.name ?? '')
  const [newProjectName, setNewProjectName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const visibleBoards = boards.filter((b) => normalize(b.name).includes(normalize(searchQuery)))

  function createBoard(): void {
    onCreateBoard(newBoardName, newBoardProject || projects[0]?.name || '')
    setNewBoardName('')
  }

  function addProject(): void {
    if (!newProjectName.trim()) return
    onAddProject(newProjectName)
    setNewProjectName('')
  }

  function commitRename(id: string): void {
    onRenameBoard(id, editingName)
    setEditingBoardId(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Pizarras</h1>
        <button className="icon-btn" onClick={onClose} title="Ocultar panel">
          ⮜
        </button>
      </div>

      <button
        className={`notion-status notion-status-${notionStatus}`}
        onClick={onOpenNotionPanel}
        title={notionError ?? undefined}
      >
        <span className="notion-status-dot" />
        {notionStatus === 'disconnected' && 'No conectado'}
        {notionStatus === 'syncing' && 'Sincronizando...'}
        {notionStatus === 'synced' && 'Sincronizado con Notion'}
        {notionStatus === 'error' && 'Error de sync'}
      </button>
      {notionStatus === 'error' && notionError && <p className="notion-error-text">{notionError}</p>}

      <div className="new-board">
        <select value={newBoardProject} onChange={(e) => setNewBoardProject(e.target.value)}>
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
                      onStartPresentation(projectBoards)
                    }}
                    title="Presentar proyecto"
                  >
                    ▶
                  </button>
                )}
                {!isDefault && projectBoards.length === 0 && (
                  <button
                    className="delete-project-btn"
                    onClick={() => onDeleteProject(project.id)}
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
                    onClick={() => onSelectBoard(b)}
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
                        onDeleteBoard(b.id)
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
        {boards.length === 0 && <p className="empty-hint">Creá tu primera pizarra arriba.</p>}
      </div>
    </aside>
  )
}
