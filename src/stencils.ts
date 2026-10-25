import { convertToExcalidrawElements, ROUNDNESS } from '@excalidraw/excalidraw'
import type { LibraryItems } from '@excalidraw/excalidraw/types'

// Fijo (no Date.now()) para que updateLibrary({ merge: true }) sea idempotente
// entre recargas: los mismos ids con el mismo `created` no generan duplicados.
const STENCIL_CREATED_AT = 1700000000000

const STROKE = '#e9ecef'

function libraryItem(
  id: string,
  name: string,
  elements: ReturnType<typeof convertToExcalidrawElements>
): LibraryItems[number] {
  return { id, status: 'unpublished', elements, created: STENCIL_CREATED_AT, name }
}

const servicio = libraryItem(
  'stencil-servicio',
  'Servicio',
  convertToExcalidrawElements(
    [
      {
        id: 'stencil-servicio-rect',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 160,
        height: 80,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        strokeColor: STROKE,
        backgroundColor: '#4c6ef5',
        fillStyle: 'solid',
        opacity: 30,
        label: { text: 'Servicio' },
      },
    ],
    { regenerateIds: false }
  )
)

const baseDeDatos = libraryItem(
  'stencil-base-de-datos',
  'Base de datos',
  convertToExcalidrawElements(
    [
      {
        id: 'stencil-db-top',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 140,
        height: 24,
        strokeColor: STROKE,
        backgroundColor: '#4c6ef5',
        fillStyle: 'solid',
        opacity: 30,
        groupIds: ['stencil-db-group'],
      },
      {
        id: 'stencil-db-body',
        type: 'rectangle',
        x: 0,
        y: 12,
        width: 140,
        height: 70,
        strokeColor: STROKE,
        backgroundColor: '#4c6ef5',
        fillStyle: 'solid',
        opacity: 30,
        groupIds: ['stencil-db-group'],
      },
      {
        id: 'stencil-db-bottom',
        type: 'ellipse',
        x: 0,
        y: 70,
        width: 140,
        height: 24,
        strokeColor: STROKE,
        backgroundColor: '#4c6ef5',
        fillStyle: 'solid',
        opacity: 30,
        groupIds: ['stencil-db-group'],
      },
      {
        id: 'stencil-db-label',
        type: 'text',
        x: 12,
        y: 48,
        text: 'Base de datos',
        fontSize: 16,
        strokeColor: STROKE,
        groupIds: ['stencil-db-group'],
      },
    ],
    { regenerateIds: false }
  )
)

const estado = libraryItem(
  'stencil-estado',
  'Estado',
  convertToExcalidrawElements(
    [
      {
        id: 'stencil-estado-rect',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 140,
        height: 70,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        strokeColor: STROKE,
        backgroundColor: '#51cf66',
        fillStyle: 'solid',
        opacity: 30,
        label: { text: 'Estado' },
      },
    ],
    { regenerateIds: false }
  )
)

const transicion = libraryItem(
  'stencil-transicion',
  'Transición',
  convertToExcalidrawElements(
    [
      {
        id: 'stencil-transicion-arrow',
        type: 'arrow',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [140, 0],
        ],
        strokeColor: STROKE,
        label: { text: 'evento' },
      },
    ],
    { regenerateIds: false }
  )
)

const cola = libraryItem(
  'stencil-cola',
  'Cola',
  convertToExcalidrawElements(
    [
      {
        id: 'stencil-cola-rect',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 160,
        height: 70,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        strokeColor: STROKE,
        strokeStyle: 'dashed',
        backgroundColor: '#f59f00',
        fillStyle: 'solid',
        opacity: 30,
        label: { text: 'Cola' },
      },
    ],
    { regenerateIds: false }
  )
)

export const TECHNICAL_STENCILS: LibraryItems = [servicio, baseDeDatos, estado, transicion, cola]
