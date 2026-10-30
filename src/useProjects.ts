import { useCallback, useEffect, useState } from 'react'
import type { Board, Project } from './types'

const PROJECTS_KEY = 'spen-whiteboard:projects'
export const DEFAULT_PROJECT_NAMES = ['FIN700', 'AdaptFit', 'UNAB', 'MTG', 'General']

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    if (raw) return JSON.parse(raw) as Project[]
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

export interface UseProjectsResult {
  projects: Project[]
  addProject: (name: string) => void
  /** No borra el proyecto "General"/default ni uno que todavía tenga pizarras; confirma con el usuario. */
  deleteProject: (id: string, boards: Board[]) => void
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>(loadProjects)

  useEffect(() => {
    saveProjects(projects)
  }, [projects])

  const addProject = useCallback(
    (name: string): void => {
      const trimmed = name.trim()
      if (!trimmed) return
      setProjects((prev) => {
        if (prev.some((p) => normalize(p.name) === normalize(trimmed))) return prev
        return [...prev, { id: crypto.randomUUID(), name: trimmed }]
      })
    },
    []
  )

  const deleteProject = useCallback(
    (id: string, boards: Board[]): void => {
      const project = projects.find((p) => p.id === id)
      if (!project) return
      if (DEFAULT_PROJECT_NAMES.includes(project.name)) return
      if (boards.some((b) => b.project === project.name)) return
      if (!confirm(`¿Borrar el proyecto "${project.name}"?`)) return
      setProjects((prev) => prev.filter((p) => p.id !== id))
    },
    [projects]
  )

  return { projects, addProject, deleteProject }
}
