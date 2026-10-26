import { notionRequest, notionUploadFile } from './notionClient'
import type { NotionBoardLink, NotionConfig } from './notionTypes'
import type { Board } from './types'
import type { StoredCanvasData } from './canvasStorage'

const DATABASE_TITLE = 'S Pen Whiteboard'
const RICH_TEXT_CHUNK_SIZE = 2000

interface NotionRichText {
  type: 'text'
  text: { content: string }
  plain_text?: string
}

interface NotionDataSourceRef {
  id: string
  name: string
}

interface NotionDatabaseObject {
  id: string
  data_sources?: NotionDataSourceRef[]
}

interface NotionSearchResult {
  id: string
  object: string
  parent?: { type: string; database_id?: string }
  database_parent?: { type: string; page_id?: string }
}

interface NotionSearchResponse {
  results: NotionSearchResult[]
}

interface NotionBlockObject {
  id: string
  type: string
  code?: { rich_text: NotionRichText[] }
  image?: unknown
}

interface NotionBlockChildrenResponse {
  results: NotionBlockObject[]
}

interface NotionPageObject {
  id: string
  properties: Record<string, unknown>
}

interface NotionQueryResponse {
  results: NotionPageObject[]
}

function normalizeId(id: string): string {
  return id.replace(/-/g, '')
}

function chunkRichText(text: string): NotionRichText[] {
  const chunks: NotionRichText[] = []
  for (let i = 0; i < text.length; i += RICH_TEXT_CHUNK_SIZE) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + RICH_TEXT_CHUNK_SIZE) } })
  }
  return chunks.length > 0 ? chunks.slice(0, 100) : [{ type: 'text', text: { content: '' } }]
}

function titleProperty(name: string): unknown {
  return { title: [{ text: { content: name } }] }
}

function selectProperty(name: string): unknown {
  return { select: { name } }
}

function dateProperty(timestamp: number): unknown {
  return { date: { start: new Date(timestamp).toISOString() } }
}

function richTextProperty(text: string): unknown {
  return { rich_text: [{ text: { content: text } }] }
}

function plainTextFromProperty(properties: Record<string, unknown>, key: string): string {
  const prop = properties[key] as { title?: NotionRichText[]; rich_text?: NotionRichText[] } | undefined
  const parts = prop?.title ?? prop?.rich_text ?? []
  return parts.map((p) => p.plain_text ?? p.text.content).join('')
}

function selectNameFromProperty(properties: Record<string, unknown>, key: string): string {
  const prop = properties[key] as { select?: { name?: string } } | undefined
  return prop?.select?.name ?? 'General'
}

function dateFromProperty(properties: Record<string, unknown>, key: string): number {
  const prop = properties[key] as { date?: { start?: string } } | undefined
  return prop?.date?.start ? new Date(prop.date.start).getTime() : 0
}

async function findExistingDatabase(
  token: string,
  parentPageId: string
): Promise<{ databaseId: string; dataSourceId: string } | null> {
  const search = await notionRequest<NotionSearchResponse>(token, 'POST', '/v1/search', {
    query: DATABASE_TITLE,
    filter: { property: 'object', value: 'data_source', in_trash: false },
  })
  const match = search.results.find(
    (r) =>
      r.database_parent?.type === 'page_id' &&
      normalizeId(r.database_parent.page_id ?? '') === normalizeId(parentPageId)
  )
  if (!match?.parent?.database_id) return null
  return { databaseId: match.parent.database_id, dataSourceId: match.id }
}

async function createDatabase(
  token: string,
  parentPageId: string
): Promise<{ databaseId: string; dataSourceId: string }> {
  const database = await notionRequest<NotionDatabaseObject>(token, 'POST', '/v1/databases', {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: DATABASE_TITLE } }],
    initial_data_source: {
      properties: {
        Nombre: { title: {} },
        Proyecto: { select: { options: [] } },
        'Última edición': { date: {} },
        'Board ID': { rich_text: {} },
      },
    },
  })
  const dataSourceId = database.data_sources?.[0]?.id
  if (!dataSourceId) throw new Error('Notion no devolvió un data source para la database creada')
  return { databaseId: database.id, dataSourceId }
}

export async function connectToNotion(token: string, parentPageId: string): Promise<NotionConfig> {
  const id = normalizeId(parentPageId)
  const existing = await findExistingDatabase(token, id)
  const { databaseId, dataSourceId } = existing ?? (await createDatabase(token, id))
  return { token, parentPageId: id, databaseId, dataSourceId }
}

export async function pushBoardToNotion(
  config: NotionConfig,
  board: Board,
  canvasData: StoredCanvasData | null,
  pngBlob: Blob,
  existingLink: NotionBoardLink | null
): Promise<NotionBoardLink> {
  const json = JSON.stringify(canvasData ?? { elements: [], appState: {} })
  const codeRichText = chunkRichText(json)

  // Un link guardado con codeBlockId/imageBlockId vacíos (ej. de una versión vieja de
  // pullBoardsFromNotion que los dejaba en '' cuando no encontraba los bloques) no sirve para
  // actualizar nada — se trata como si no existiera y se crea una página nueva en vez de
  // armar un PATCH a una URL rota.
  const hasUsableLink = !!existingLink && !!existingLink.codeBlockId && !!existingLink.imageBlockId

  if (!hasUsableLink) {
    const fileUploadId = await notionUploadFile(config.token, pngBlob, `${board.id}.png`)
    const page = await notionRequest<NotionPageObject>(config.token, 'POST', '/v1/pages', {
      parent: { type: 'data_source_id', data_source_id: config.dataSourceId },
      properties: {
        Nombre: titleProperty(board.name),
        Proyecto: selectProperty(board.project),
        'Última edición': dateProperty(board.updatedAt),
        'Board ID': richTextProperty(board.id),
      },
      children: [
        { object: 'block', type: 'code', code: { rich_text: codeRichText, language: 'json' } },
        {
          object: 'block',
          type: 'image',
          image: { type: 'file_upload', file_upload: { id: fileUploadId } },
        },
      ],
    })
    const children = await notionRequest<NotionBlockChildrenResponse>(
      config.token,
      'GET',
      `/v1/blocks/${page.id}/children`
    )
    const codeBlock = children.results.find((b) => b.type === 'code')
    const imageBlock = children.results.find((b) => b.type === 'image')
    if (!codeBlock || !imageBlock) {
      throw new Error('No se pudieron ubicar los bloques recién creados en Notion')
    }
    return {
      notionPageId: page.id,
      codeBlockId: codeBlock.id,
      imageBlockId: imageBlock.id,
      remoteUpdatedAt: board.updatedAt,
    }
  }

  await notionRequest(config.token, 'PATCH', `/v1/pages/${existingLink.notionPageId}`, {
    properties: {
      Nombre: titleProperty(board.name),
      Proyecto: selectProperty(board.project),
      'Última edición': dateProperty(board.updatedAt),
    },
  })
  await notionRequest(config.token, 'PATCH', `/v1/blocks/${existingLink.codeBlockId}`, {
    code: { rich_text: codeRichText, language: 'json' },
  })
  const fileUploadId = await notionUploadFile(config.token, pngBlob, `${board.id}.png`)
  await notionRequest(config.token, 'PATCH', `/v1/blocks/${existingLink.imageBlockId}`, {
    image: { type: 'file_upload', file_upload: { id: fileUploadId } },
  })

  return { ...existingLink, remoteUpdatedAt: board.updatedAt }
}

export interface PulledBoard {
  board: Board
  canvasData: StoredCanvasData | null
  link: NotionBoardLink
}

export async function pullBoardsFromNotion(
  config: NotionConfig,
  localBoardIds: Set<string>
): Promise<PulledBoard[]> {
  const query = await notionRequest<NotionQueryResponse>(
    config.token,
    'POST',
    `/v1/data_sources/${config.dataSourceId}/query`,
    {}
  )
  const pulled: PulledBoard[] = []

  for (const page of query.results) {
    const boardId = plainTextFromProperty(page.properties, 'Board ID')
    if (!boardId || localBoardIds.has(boardId)) continue

    const name = plainTextFromProperty(page.properties, 'Nombre') || 'Sin título'
    const project = selectNameFromProperty(page.properties, 'Proyecto')
    const remoteUpdatedAt = dateFromProperty(page.properties, 'Última edición')

    const children = await notionRequest<NotionBlockChildrenResponse>(
      config.token,
      'GET',
      `/v1/blocks/${page.id}/children`
    )
    const codeBlock = children.results.find((b) => b.type === 'code')
    const imageBlock = children.results.find((b) => b.type === 'image')
    if (!codeBlock || !imageBlock) {
      // No tiene la estructura que arma pushBoardToNotion (código + imagen) — no es una
      // pizarra real de la app (ej. una página de prueba creada a mano en la database), así
      // que no se trae como board local: hacerlo guardaría un link con codeBlockId/imageBlockId
      // vacíos, y la próxima sync intentaría un PATCH a "/v1/blocks/" sin id, que Notion rechaza.
      continue
    }

    const json = codeBlock.code?.rich_text.map((rt) => rt.plain_text ?? rt.text.content).join('') ?? ''
    let canvasData: StoredCanvasData | null = null
    try {
      canvasData = JSON.parse(json) as StoredCanvasData
    } catch {
      canvasData = null
    }

    pulled.push({
      board: { id: boardId, name, project, createdAt: remoteUpdatedAt, updatedAt: remoteUpdatedAt },
      canvasData,
      link: {
        notionPageId: page.id,
        codeBlockId: codeBlock.id,
        imageBlockId: imageBlock.id,
        remoteUpdatedAt,
      },
    })
  }

  return pulled
}

export async function getRemoteUpdatedAt(config: NotionConfig, notionPageId: string): Promise<number> {
  const page = await notionRequest<NotionPageObject>(config.token, 'GET', `/v1/pages/${notionPageId}`)
  return dateFromProperty(page.properties, 'Última edición')
}

export async function fetchRemoteCanvasData(
  config: NotionConfig,
  link: NotionBoardLink
): Promise<StoredCanvasData | null> {
  const codeBlock = await notionRequest<{ code?: { rich_text: NotionRichText[] } }>(
    config.token,
    'GET',
    `/v1/blocks/${link.codeBlockId}`
  )
  if (!codeBlock.code) return null
  const json = codeBlock.code.rich_text.map((rt) => rt.plain_text ?? rt.text.content).join('')
  try {
    return JSON.parse(json) as StoredCanvasData
  } catch {
    return null
  }
}

