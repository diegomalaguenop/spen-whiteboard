import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { Board } from './types'
import type { NotionConfig } from './notionTypes'
import { loadNotionLinks, saveNotionLink, removeNotionLink } from './notionStorage'
import { getBoardPngBlob } from './export'
import { loadCanvasData } from './canvasStorage'
import { pullBoardsFromNotion, pushBoardToNotion, deleteBoardFromNotion, type PulledBoard } from './notionSync'

const NOTION_SYNC_DEBOUNCE_MS = 4000

export type NotionStatus = 'disconnected' | 'syncing' | 'synced' | 'error'

interface UseNotionSyncOptions {
  notionConfig: NotionConfig | null
  boardsRef: MutableRefObject<Board[]>
  excalidrawAPIRef: MutableRefObject<ExcalidrawImperativeAPI | null>
  onBoardsPulled: (pulled: PulledBoard[]) => void
}

export interface UseNotionSyncResult {
  status: NotionStatus
  error: string | null
  /** Agenda un push para `boardId` después del debounce. No hace nada si no hay Notion conectado. */
  scheduleSync: (boardId: string) => void
  /** Si hay un push agendado, lo dispara ya mismo. Llamar siempre antes de cambiar de pizarra activa. */
  flushPending: () => void
  /** Si hay un push agendado para `boardId`, lo cancela sin disparar (para cuando esa pizarra se borra). */
  cancelPendingFor: (boardId: string) => void
  /**
   * Archiva la página de Notion de `boardId` (si hay una) y borra el link guardado. Best-effort:
   * no tira si falla, pero deja el error visible en `status`/`error`. Llamar al borrar una
   * pizarra localmente — si no, la próxima vez que se conecte sigue estando en Notion y el pull
   * la vuelve a traer como si nunca se hubiera borrado.
   */
  deleteRemoteBoard: (boardId: string) => Promise<void>
}

/**
 * Centraliza la sincronización con Notion: el debounce de 4s tras cada cambio de canvas, el
 * flush al cambiar de pizarra activa, un lock por pizarra para que dos pushes de la misma
 * pizarra no corran en paralelo (evita páginas duplicadas), la cancelación del pull inicial si
 * `notionConfig` cambia o el componente se desmonta antes de que responda, y la limpieza de
 * timers pendientes al desconectar.
 */
export function useNotionSync({
  notionConfig,
  boardsRef,
  excalidrawAPIRef,
  onBoardsPulled,
}: UseNotionSyncOptions): UseNotionSyncResult {
  const [status, setStatus] = useState<NotionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const configRef = useRef<NotionConfig | null>(notionConfig)
  const timeoutRef = useRef<number | null>(null)
  const pendingBoardIdRef = useRef<string | null>(null)
  // Pizarras con un push en curso ahora mismo: evita que dos llamadas a syncNow para la misma
  // pizarra corran en paralelo y creen dos páginas en Notion (HIGH: "pushes simultáneos").
  const syncingBoardIdsRef = useRef<Set<string>>(new Set())
  // Si llega un pedido de sync para una pizarra que ya está sincronizando, se marca acá en vez
  // de lanzarse en paralelo; al terminar el push en curso, se reintenta una sola vez con los
  // datos más recientes del canvas.
  const retryQueuedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    configRef.current = notionConfig
  }, [notionConfig])

  const syncNow = useCallback(
    async (boardId: string): Promise<void> => {
      const config = configRef.current
      if (!config) return

      if (syncingBoardIdsRef.current.has(boardId)) {
        retryQueuedRef.current.add(boardId)
        return
      }

      const api = excalidrawAPIRef.current
      const board = boardsRef.current.find((b) => b.id === boardId)
      if (!api || !board) return

      syncingBoardIdsRef.current.add(boardId)
      setStatus('syncing')
      setError(null)
      try {
        const canvasData = loadCanvasData(boardId)
        const pngBlob = await getBoardPngBlob(api)
        const existingLink = loadNotionLinks()[boardId] ?? null
        const newLink = await pushBoardToNotion(config, board, canvasData, pngBlob, existingLink)
        saveNotionLink(boardId, newLink)
        setStatus('synced')
      } catch (syncError: unknown) {
        setStatus('error')
        setError(syncError instanceof Error ? syncError.message : 'Error desconocido al sincronizar')
      } finally {
        syncingBoardIdsRef.current.delete(boardId)
        if (retryQueuedRef.current.delete(boardId)) {
          void syncNow(boardId)
        }
      }
    },
    [boardsRef, excalidrawAPIRef]
  )

  const scheduleSync = useCallback(
    (boardId: string): void => {
      if (!configRef.current) return
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      pendingBoardIdRef.current = boardId
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null
        pendingBoardIdRef.current = null
        void syncNow(boardId)
      }, NOTION_SYNC_DEBOUNCE_MS)
    },
    [syncNow]
  )

  const flushPending = useCallback((): void => {
    if (!timeoutRef.current || !pendingBoardIdRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    const boardId = pendingBoardIdRef.current
    pendingBoardIdRef.current = null
    void syncNow(boardId)
  }, [syncNow])

  const cancelPendingFor = useCallback((boardId: string): void => {
    if (pendingBoardIdRef.current !== boardId) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    pendingBoardIdRef.current = null
  }, [])

  const deleteRemoteBoard = useCallback(async (boardId: string): Promise<void> => {
    const config = configRef.current
    if (!config) return
    const link = loadNotionLinks()[boardId]
    if (!link) return
    try {
      await deleteBoardFromNotion(config, link.notionPageId)
      removeNotionLink(boardId)
    } catch (deleteError: unknown) {
      setStatus('error')
      setError(
        deleteError instanceof Error ? deleteError.message : 'No se pudo borrar la pizarra en Notion'
      )
    }
  }, [])

  useEffect(() => {
    if (!notionConfig) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      pendingBoardIdRef.current = null
      setStatus('disconnected')
      setError(null)
      return
    }

    let cancelled = false
    setStatus('syncing')
    setError(null)
    const localIds = new Set(boardsRef.current.map((b) => b.id))
    pullBoardsFromNotion(notionConfig, localIds)
      .then((pulled) => {
        if (cancelled) return
        if (pulled.length > 0) onBoardsPulled(pulled)
        setStatus('synced')
      })
      .catch((pullError: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(pullError instanceof Error ? pullError.message : 'Error desconocido al conectar con Notion')
      })

    return () => {
      cancelled = true
    }
  }, [notionConfig, boardsRef, onBoardsPulled])

  return { status, error, scheduleSync, flushPending, cancelPendingFor, deleteRemoteBoard }
}
