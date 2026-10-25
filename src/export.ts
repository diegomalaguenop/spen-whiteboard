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

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'pizarra'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen del canvas'))
    }, 'image/png')
  })
}

async function renderBoardToCanvas(api: ExcalidrawImperativeAPI): Promise<HTMLCanvasElement> {
  const elements = api.getSceneElements()
  const appState = api.getAppState()
  const files = api.getFiles()
  return exportToCanvas(elements, appState, files, {
    exportBackground: true,
    viewBackgroundColor: appState.viewBackgroundColor,
  })
}

export async function exportBoardAsPng(api: ExcalidrawImperativeAPI, boardName: string): Promise<void> {
  const canvas = await renderBoardToCanvas(api)
  const blob = await canvasToBlob(canvas)
  downloadBlob(blob, `${sanitizeFilename(boardName)}.png`)
}

export async function exportBoardAsSvg(api: ExcalidrawImperativeAPI, boardName: string): Promise<void> {
  const elements = api.getSceneElements()
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
