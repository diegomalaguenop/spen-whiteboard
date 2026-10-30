import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { exportBoardAsPdf, exportBoardAsPng, exportBoardAsSvg, getBoardPngBlob } from './export'

const excalidrawMocks = vi.hoisted(() => ({
  exportToCanvas: vi.fn<(...args: unknown[]) => Promise<HTMLCanvasElement>>(),
  exportToSvg: vi.fn<(...args: unknown[]) => Promise<SVGSVGElement>>(),
}))

vi.mock('@excalidraw/excalidraw', () => excalidrawMocks)

const EMPTY_BOARD_ERROR = 'La pizarra está vacía: no hay nada para exportar'
const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const FAKE_OBJECT_URL = 'blob:fake-url'

const SAMPLE_ELEMENTS = [{ id: 'rect-1', type: 'rectangle' }] as unknown as NonDeletedExcalidrawElement[]

function createFakeApi(elements: readonly NonDeletedExcalidrawElement[]): ExcalidrawImperativeAPI {
  const fakeApi = {
    getSceneElements: (): readonly NonDeletedExcalidrawElement[] => elements,
    getAppState: (): Partial<AppState> => ({ viewBackgroundColor: '#ffffff' }),
    getFiles: (): BinaryFiles => ({}),
  }
  return fakeApi as unknown as ExcalidrawImperativeAPI
}

function createFakeCanvas(blob: Blob | null): HTMLCanvasElement {
  const fakeCanvas = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    toBlob: (callback: BlobCallback): void => callback(blob),
    toDataURL: (): string => 'data:image/png;base64,',
  }
  return fakeCanvas as unknown as HTMLCanvasElement
}

function createPngBlob(): Blob {
  return new Blob(['fake-png-bytes'], { type: 'image/png' })
}

let downloadedFilenames: string[]
let createObjectUrlMock: ReturnType<typeof vi.fn<(blob: Blob) => string>>

beforeEach(() => {
  downloadedFilenames = []
  createObjectUrlMock = vi.fn<(blob: Blob) => string>(() => FAKE_OBJECT_URL)
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrlMock, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedFilenames.push(this.download)
  })
  excalidrawMocks.exportToCanvas.mockResolvedValue(createFakeCanvas(createPngBlob()))
})

afterEach(() => {
  vi.restoreAllMocks()
  excalidrawMocks.exportToCanvas.mockReset()
  excalidrawMocks.exportToSvg.mockReset()
})

describe('getBoardPngBlob', () => {
  test('returns a PNG blob when the scene has elements', async () => {
    // Arrange
    const api = createFakeApi(SAMPLE_ELEMENTS)

    // Act
    const blob = await getBoardPngBlob(api)

    // Assert
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(excalidrawMocks.exportToCanvas).toHaveBeenCalledWith(SAMPLE_ELEMENTS, expect.anything(), {}, {
      exportBackground: true,
      viewBackgroundColor: '#ffffff',
    })
  })

  test('throws the empty-board error when the scene has no elements', async () => {
    // Arrange
    const api = createFakeApi([])

    // Act
    const result = getBoardPngBlob(api)

    // Assert
    await expect(result).rejects.toThrow(EMPTY_BOARD_ERROR)
    expect(excalidrawMocks.exportToCanvas).not.toHaveBeenCalled()
  })

  test('rejects with the canvas dimensions when the canvas cannot produce a blob', async () => {
    // Arrange
    excalidrawMocks.exportToCanvas.mockResolvedValue(createFakeCanvas(null))
    const api = createFakeApi(SAMPLE_ELEMENTS)

    // Act
    const result = getBoardPngBlob(api)

    // Assert
    await expect(result).rejects.toThrow(`${CANVAS_WIDTH}x${CANVAS_HEIGHT}px`)
  })
})

describe('exportBoardAsPng', () => {
  test('downloads the PNG blob using the board name as filename', async () => {
    // Arrange
    const api = createFakeApi(SAMPLE_ELEMENTS)

    // Act
    await exportBoardAsPng(api, 'Arquitectura')

    // Assert
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1)
    const downloadedBlob = createObjectUrlMock.mock.calls[0][0]
    expect(downloadedBlob.type).toBe('image/png')
    expect(downloadedFilenames).toEqual(['Arquitectura.png'])
  })

  test('throws the empty-board error and downloads nothing when the scene is empty', async () => {
    // Arrange
    const api = createFakeApi([])

    // Act
    const result = exportBoardAsPng(api, 'Vacía')

    // Assert
    await expect(result).rejects.toThrow(EMPTY_BOARD_ERROR)
    expect(downloadedFilenames).toEqual([])
  })

  test.each<[string, string, string]>([
    ['trims surrounding whitespace', '  Mi pizarra  ', 'Mi pizarra.png'],
    ['replaces reserved filesystem characters with underscores', 'a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j.png'],
    ['strips control characters', 'a\u0007b\u007fc', 'abc.png'],
    ['removes trailing dots', 'informe...', 'informe.png'],
    ['falls back to "pizarra" for an empty name', '', 'pizarra.png'],
    ['falls back to "pizarra" for a whitespace-only name', '   ', 'pizarra.png'],
  ])('sanitizes the filename: %s', async (_description, boardName, expectedFilename) => {
    // Arrange
    const api = createFakeApi(SAMPLE_ELEMENTS)

    // Act
    await exportBoardAsPng(api, boardName)

    // Assert
    expect(downloadedFilenames).toEqual([expectedFilename])
  })

  test('truncates names longer than 100 characters', async () => {
    // Arrange
    const api = createFakeApi(SAMPLE_ELEMENTS)
    const longName = 'a'.repeat(150)

    // Act
    await exportBoardAsPng(api, longName)

    // Assert
    expect(downloadedFilenames).toEqual([`${'a'.repeat(100)}.png`])
  })

  test('drops trailing whitespace left over after truncation', async () => {
    // Arrange
    const api = createFakeApi(SAMPLE_ELEMENTS)
    const longName = `${'a'.repeat(99)} bcdef`

    // Act
    await exportBoardAsPng(api, longName)

    // Assert
    expect(downloadedFilenames).toEqual([`${'a'.repeat(99)}.png`])
  })
})

describe('exportBoardAsSvg', () => {
  test('downloads an SVG blob when the scene has elements', async () => {
    // Arrange
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    excalidrawMocks.exportToSvg.mockResolvedValue(svg)
    const api = createFakeApi(SAMPLE_ELEMENTS)

    // Act
    await exportBoardAsSvg(api, 'Diagrama')

    // Assert
    const downloadedBlob = createObjectUrlMock.mock.calls[0][0]
    expect(downloadedBlob.type).toBe('image/svg+xml;charset=utf-8')
    expect(downloadedFilenames).toEqual(['Diagrama.svg'])
  })

  test('throws the empty-board error when the scene has no elements', async () => {
    // Arrange
    const api = createFakeApi([])

    // Act
    const result = exportBoardAsSvg(api, 'Vacía')

    // Assert
    await expect(result).rejects.toThrow(EMPTY_BOARD_ERROR)
    expect(excalidrawMocks.exportToSvg).not.toHaveBeenCalled()
  })
})

describe('exportBoardAsPdf', () => {
  test('throws the empty-board error when the scene has no elements', async () => {
    // Arrange
    const api = createFakeApi([])

    // Act
    const result = exportBoardAsPdf(api, 'Vacía')

    // Assert
    await expect(result).rejects.toThrow(EMPTY_BOARD_ERROR)
    expect(excalidrawMocks.exportToCanvas).not.toHaveBeenCalled()
  })
})
