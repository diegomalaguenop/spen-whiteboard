import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Board } from './types'
import { canvasKey } from './canvasStorage'
import type { PulledBoard } from './notionSync'

const BOARDS_KEY = 'spen-whiteboard:boards'

function loadBoards(): Board[] {
  try {
    const raw = localStorage.getItem(BOARDS_KEY)
    return raw ? (JSON.parse(raw) as Board[]) : []
  } catch {
    return []
  }
}

function saveBoards(boards: Board[]): void {
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards))
}

export interface UseBoardsResult {
  boards: Board[]
  /** Snapshot síncrono de `boards`, para leer desde callbacks que no deben cambiar de identidad. */
  boardsRef: MutableRefObject<Board[]>
  activeId: string | null
  /** Snapshot síncrono de `activeId`, mismo propósito que `boardsRef`. */
  activeIdRef: MutableRefObject<string | null>
  activeBoard: Board | null
  createBoard: (name: string, project: string) => Board
  deleteBoard: (id: string) => void
  renameBoard: (id: string, name: string) => void
  setActiveBoardId: (id: string | null) => void
  /** Actualiza `updatedAt` de una pizarra (tras guardar el canvas local o aplicar un timestamp remoto). */
  touchBoard: (id: string, updatedAt?: number) => void
  /** Suma al principio de la lista las pizarras traídas de Notion que no existían localmente. */
  addPulledBoards: (pulled: PulledBoard[]) => void
}

export function useBoards(): UseBoardsResult {
  const [boards, setBoards] = useState<Board[]>(loadBoards)
  const [activeId, setActiveId] = useState<string | null>(boards[0]?.id ?? null)
  const boardsRef = useRef<Board[]>(boards)
  const activeIdRef = useRef<string | null>(activeId)

  useEffect(() => {
    saveBoards(boards)
    boardsRef.current = boards
  }, [boards])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const activeBoard = boards.find((b) => b.id === activeId) ?? null

  const createBoard = useCallback((name: string, project: string): Board => {
    const now = Date.now()
    const board: Board = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Sin título',
      project,
      createdAt: now,
      updatedAt: now,
    }
    setBoards((prev) => [board, ...prev])
    setActiveId(board.id)
    return board
  }, [])

  const deleteBoard = useCallback((id: string): void => {
    setBoards((prev) => prev.filter((b) => b.id !== id))
    localStorage.removeItem(canvasKey(id))
    setActiveId((current) => (current === id ? null : current))
  }, [])

  const renameBoard = useCallback((id: string, name: string): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name: trimmed, updatedAt: Date.now() } : b)))
  }, [])

  const touchBoard = useCallback((id: string, updatedAt: number = Date.now()): void => {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, updatedAt } : b)))
  }, [])

  const addPulledBoards = useCallback((pulled: PulledBoard[]): void => {
    setBoards((prev) => [...pulled.map((p) => p.board), ...prev])
  }, [])

  return {
    boards,
    boardsRef,
    activeId,
    activeIdRef,
    activeBoard,
    createBoard,
    deleteBoard,
    renameBoard,
    setActiveBoardId: setActiveId,
    touchBoard,
    addPulledBoards,
  }
}
