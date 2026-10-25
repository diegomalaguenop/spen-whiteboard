import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'

const CANVAS_KEY_PREFIX = 'spen-whiteboard:canvas:'

export interface StoredCanvasData {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
}

export function canvasKey(boardId: string): string {
  return `${CANVAS_KEY_PREFIX}${boardId}`
}

export function loadCanvasData(boardId: string): StoredCanvasData | null {
  try {
    const raw = localStorage.getItem(canvasKey(boardId))
    return raw ? (JSON.parse(raw) as StoredCanvasData) : null
  } catch {
    return null
  }
}

export function saveCanvasData(
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
