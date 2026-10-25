import type { ExcalidrawElement, ExcalidrawArrowElement } from '@excalidraw/excalidraw/element/types'

type NodeKind = 'database' | 'state' | 'service'
type DiagramType = 'stateDiagram-v2' | 'flowchart'

interface DetectedNode {
  id: string
  label: string
  kind: NodeKind
}

interface DetectedEdge {
  fromNodeId: string
  toNodeId: string
  label: string | null
}

export interface MermaidExportResult {
  code: string
  diagramType: DiagramType
  nodeCount: number
  edgeCount: number
}

const STATE_BACKGROUND_COLOR = '#51cf66'
const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond'])

function sanitizeLabel(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .replace(/[[\]()]/g, '')
    .trim()
}

function boundsOf(el: ExcalidrawElement): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: el.x, y1: el.y, x2: el.x + el.width, y2: el.y + el.height }
}

function contains(outer: ExcalidrawElement, inner: ExcalidrawElement): boolean {
  const o = boundsOf(outer)
  const i = boundsOf(inner)
  return i.x1 >= o.x1 && i.y1 >= o.y1 && i.x2 <= o.x2 && i.y2 <= o.y2
}

function findBoundText(
  el: ExcalidrawElement,
  byId: Map<string, ExcalidrawElement>
): string | null {
  for (const bound of el.boundElements ?? []) {
    if (bound.type !== 'text') continue
    const textEl = byId.get(bound.id)
    if (textEl && textEl.type === 'text' && textEl.text.trim()) return textEl.text.trim()
  }
  return null
}

function findContainedText(
  shape: ExcalidrawElement,
  textElements: ExcalidrawElement[]
): string | null {
  for (const textEl of textElements) {
    if (textEl.type === 'text' && textEl.containerId === null && contains(shape, textEl)) {
      if (textEl.text.trim()) return textEl.text.trim()
    }
  }
  return null
}

export function exportToMermaid(elements: readonly ExcalidrawElement[]): MermaidExportResult | null {
  const live = elements.filter((el) => !el.isDeleted)
  const byId = new Map(live.map((el) => [el.id, el]))
  const textElements = live.filter((el) => el.type === 'text')
  const shapeElements = live.filter((el) => SHAPE_TYPES.has(el.type))
  const arrowElements = live.filter(
    (el): el is ExcalidrawArrowElement => el.type === 'arrow'
  )

  const shapesByGroup = new Map<string, ExcalidrawElement[]>()
  const ungroupedShapes: ExcalidrawElement[] = []
  for (const shape of shapeElements) {
    const groupId = shape.groupIds[0]
    if (!groupId) {
      ungroupedShapes.push(shape)
      continue
    }
    const group = shapesByGroup.get(groupId) ?? []
    group.push(shape)
    shapesByGroup.set(groupId, group)
  }

  const nodes: DetectedNode[] = []
  const elementIdToNodeId = new Map<string, string>()
  let nextIndex = 0

  function registerNode(memberElementIds: string[], label: string, kind: NodeKind): void {
    const nodeId = `n${nextIndex}`
    nextIndex += 1
    nodes.push({ id: nodeId, label, kind })
    for (const id of memberElementIds) elementIdToNodeId.set(id, nodeId)
  }

  for (const [groupId, members] of shapesByGroup) {
    const types = members.map((m) => m.type).sort()
    const isCylinder =
      members.length === 3 && types.join(',') === 'ellipse,ellipse,rectangle'
    if (isCylinder) {
      const labelEl = textElements.find(
        (t) => t.type === 'text' && t.containerId === null && t.groupIds.includes(groupId)
      )
      const label = labelEl?.text.trim() || `Nodo ${nextIndex + 1}`
      const memberIds = members.map((m) => m.id)
      if (labelEl) memberIds.push(labelEl.id)
      registerNode(memberIds, label, 'database')
    } else {
      // Grupo sin el patrón de cilindro: cada forma queda como su propio nodo.
      for (const shape of members) ungroupedShapes.push(shape)
    }
  }

  for (const shape of ungroupedShapes) {
    const label =
      findBoundText(shape, byId) ?? findContainedText(shape, textElements) ?? `Nodo ${nextIndex + 1}`
    const kind: NodeKind = shape.backgroundColor === STATE_BACKGROUND_COLOR ? 'state' : 'service'
    registerNode([shape.id], label, kind)
  }

  if (nodes.length === 0) return null

  const edges: DetectedEdge[] = []
  for (const arrow of arrowElements) {
    const startId = arrow.startBinding?.elementId
    const endId = arrow.endBinding?.elementId
    if (!startId || !endId) continue
    const fromNodeId = elementIdToNodeId.get(startId)
    const toNodeId = elementIdToNodeId.get(endId)
    if (!fromNodeId || !toNodeId) continue
    const label = findBoundText(arrow, byId)
    edges.push({ fromNodeId, toNodeId, label })
  }

  const diagramType: DiagramType = nodes.some((n) => n.kind === 'state')
    ? 'stateDiagram-v2'
    : 'flowchart'

  const code =
    diagramType === 'stateDiagram-v2'
      ? generateStateDiagram(nodes, edges)
      : generateFlowchart(nodes, edges)

  return { code, diagramType, nodeCount: nodes.length, edgeCount: edges.length }
}

function generateStateDiagram(nodes: DetectedNode[], edges: DetectedEdge[]): string {
  const lines = ['stateDiagram-v2']
  for (const node of nodes) {
    lines.push(`    state "${sanitizeLabel(node.label)}" as ${node.id}`)
  }
  for (const edge of edges) {
    const label = edge.label ? ` : ${sanitizeLabel(edge.label)}` : ''
    lines.push(`    ${edge.fromNodeId} --> ${edge.toNodeId}${label}`)
  }
  return lines.join('\n')
}

function generateFlowchart(nodes: DetectedNode[], edges: DetectedEdge[]): string {
  const lines = ['flowchart TD']
  for (const node of nodes) {
    const label = sanitizeLabel(node.label)
    lines.push(node.kind === 'database' ? `    ${node.id}[("${label}")]` : `    ${node.id}["${label}"]`)
  }
  for (const edge of edges) {
    const label = edge.label ? `|${sanitizeLabel(edge.label)}|` : ''
    lines.push(`    ${edge.fromNodeId} -->${label} ${edge.toNodeId}`)
  }
  return lines.join('\n')
}
