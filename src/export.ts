import {
  exportToCanvas as exportToCanvasUntyped,
  exportToSvg as exportToSvgUntyped,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { jsPDF } from 'jspdf'

// The installed @excalidraw/excalidraw version re-exports these from an internal
// "@excalidraw/utils/export" path that doesn't resolve to a real module, so TypeScript
// silently types them as `any` (only caught because skipLibCheck hides the underlying
// "cannot find module" error). Re-declaring the real signatures here (confirmed against
// node_modules/@excalidraw/excalidraw/dist/types/excalidraw/scene/export.d.ts) keeps our
// own call sites type-safe.
type ExportToCanvasFn = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  opts: { exportBackground: boolean; exportPadding?: number; viewBackgroundColor: string }
) => Promise<HTMLCanvasElement>

type ExportToSvgFn = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: { exportBackground: boolean; exportPadding?: number; viewBackgroundColor: string },
  files: BinaryFiles | null
) => Promise<SVGSVGElement>

const exportToCanvas = exportToCanvasUntyped as ExportToCanvasFn
const exportToSvg = exportToSvgUntyped as ExportToSvgFn

const DEFAULT_FILENAME = 'pizarra'
const MAX_FILENAME_LENGTH = 100
// Some browsers (older Safari/Firefox) abort the download if the blob URL is revoked
// synchronously right after click(), so revocation is deferred.
const REVOKE_URL_DELAY_MS = 1000

const EMPTY_BOARD_ERROR_MESSAGE = 'La pizarra está vacía: no hay nada para exportar'

function isPrintableChar(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 0x20 && code !== 0x7f
}

function sanitizeFilename(name: string): string {
  const replaced = Array.from(name)
    .filter(isPrintableChar)
    .join('')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
  const truncated = Array.from(replaced).slice(0, MAX_FILENAME_LENGTH).join('')
  const cleaned = truncated.replace(/[\s.]+$/, '')
  return cleaned || DEFAULT_FILENAME
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_URL_DELAY_MS)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else
        reject(
          new Error(`No se pudo generar la imagen PNG del canvas (${canvas.width}x${canvas.height}px)`)
        )
    }, 'image/png')
  })
}

function getExportableElements(api: ExcalidrawImperativeAPI): readonly NonDeletedExcalidrawElement[] {
  const elements = api.getSceneElements()
  if (elements.length === 0) throw new Error(EMPTY_BOARD_ERROR_MESSAGE)
  return elements
}

async function renderBoardToCanvas(api: ExcalidrawImperativeAPI): Promise<HTMLCanvasElement> {
  const elements = getExportableElements(api)
  const appState = api.getAppState()
  const files = api.getFiles()
  return exportToCanvas(elements, appState, files, {
    exportBackground: true,
    viewBackgroundColor: appState.viewBackgroundColor,
  })
}

export async function exportBoardAsPng(api: ExcalidrawImperativeAPI, boardName: string): Promise<void> {
  const blob = await getBoardPngBlob(api)
  downloadBlob(blob, `${sanitizeFilename(boardName)}.png`)
}

export async function getBoardPngBlob(api: ExcalidrawImperativeAPI): Promise<Blob> {
  const canvas = await renderBoardToCanvas(api)
  return canvasToBlob(canvas)
}

export async function exportBoardAsSvg(api: ExcalidrawImperativeAPI, boardName: string): Promise<void> {
  const elements = getExportableElements(api)
  const appState = api.getAppState()
  const files = api.getFiles()
  const svg = await exportToSvg(
    elements,
    { exportBackground: true, viewBackgroundColor: appState.viewBackgroundColor },
    files
  )
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, `${sanitizeFilename(boardName)}.svg`)
}

export async function exportBoardAsPdf(api: ExcalidrawImperativeAPI, boardName: string): Promise<void> {
  const canvas = await renderBoardToCanvas(api)
  const dataUrl = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save(`${sanitizeFilename(boardName)}.pdf`)
}
