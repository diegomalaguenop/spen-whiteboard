import { notionRequest, notionUploadFile } from './notionClient'
import type { NotionBoardLink, NotionConfig } from './notionTypes'
import type { Board } from './types'
import type { StoredCanvasData } from './canvasStorage'
import { DATABASE_TITLE, PROP_NAME, PROP_PROJECT, PROP_UPDATED_AT, PROP_BOARD_ID, normalizeId } from '../shared/notionSchema'

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
  // "code" solo aparece en bloques creados por versiones viejas de esta app, antes de que el
  // JSON del canvas se subiera como archivo adjunto (ver readCanvasDataFromBlock). Se mantiene
  // para poder seguir leyendo pizarras ya sincronizadas con ese formato.
  code?: { rich_text: NotionRichText[] }
  file?: { type?: string; file?: { url?: string }; external?: { url?: string } }
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

function canvasDataToJsonBlob(canvasData: StoredCanvasData | null): Blob {
  const json = JSON.stringify(canvasData ?? { elements: [], appState: {} })
  return new Blob([json], { type: 'application/json' })
}

function parseCanvasJson(json: string): StoredCanvasData | null {
  try {
    return JSON.parse(json) as StoredCanvasData
  } catch {
    return null
  }
}

// Lee el JSON del canvas desde el bloque que lo guarda, sea un bloque "file" (formato actual,
// sin límite práctico de tamaño) o uno "code" (formato viejo, antes del fix del truncado a
// ~200KB en notionSync.ts — ver chunkRichText en el historial de git).
async function readCanvasDataFromBlock(block: NotionBlockObject): Promise<StoredCanvasData | null> {
  if (block.type === 'file') {
    const url = block.file?.file?.url ?? block.file?.external?.url
    if (!url) return null
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      return parseCanvasJson(await response.text())
    } catch {
      return null
    }
  }
  if (block.type === 'code') {
    return parseCanvasJson(joinRichText(block.code?.rich_text ?? []))
  }
  return null
}

async function fetchBlockChildren(token: string, parentId: string): Promise<NotionBlockObject[]> {
  const response = await notionRequest<NotionBlockChildrenResponse>(token, 'GET', `/v1/blocks/${parentId}/children`)
  return response.results
}

// El bloque de datos (JSON del canvas) es "file" en pizarras pusheadas con la versión actual de
// la app, o "code" en una sincronizada antes del fix del truncado — ver readCanvasDataFromBlock.
function findDataAndImageBlocks(
  blocks: NotionBlockObject[]
): { dataBlock: NotionBlockObject; imageBlock: NotionBlockObject } | null {
  const dataBlock = blocks.find((b) => b.type === 'file' || b.type === 'code')
  const imageBlock = blocks.find((b) => b.type === 'image')
  if (!dataBlock || !imageBlock) return null
  return { dataBlock, imageBlock }
}

// PATCH no permite cambiarle el tipo a un bloque existente, así que una pizarra sincronizada
// antes de este fix (con un bloque "code") no se puede actualizar in-place a "file": hay que
// borrar el bloque viejo y agregar uno nuevo. Devuelve el id del bloque que quedó con los datos.
async function replaceDataBlock(
  token: string,
  pageId: string,
  existingBlockId: string,
  fileUploadId: string
): Promise<string> {
  try {
    await notionRequest(token, 'PATCH', `/v1/blocks/${existingBlockId}`, {
      file: { file_upload: { id: fileUploadId } },
    })
    return existingBlockId
  } catch {
    await notionRequest(token, 'DELETE', `/v1/blocks/${existingBlockId}`)
    const appended = await notionRequest<NotionBlockChildrenResponse>(
      token,
      'PATCH',
      `/v1/blocks/${pageId}/children`,
      { children: [{ object: 'block', type: 'file', file: { file_upload: { id: fileUploadId } } }] }
    )
    const newBlock = appended.results.find((b) => b.type === 'file')
    if (!newBlock) throw new Error('No se pudo reemplazar el bloque de datos en Notion')
    return newBlock.id
  }
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

function joinRichText(parts: NotionRichText[]): string {
  return parts.map((p) => p.plain_text ?? p.text.content).join('')
}

// Las properties que pushBoardToNotion manda tanto al crear una página como al actualizarla
// (Board ID solo se manda al crear: no tiene sentido re-mandarlo en cada PATCH).
function boardProperties(board: Board, { includeBoardId }: { includeBoardId: boolean }): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [PROP_NAME]: titleProperty(board.name),
    [PROP_PROJECT]: selectProperty(board.project),
    [PROP_UPDATED_AT]: dateProperty(board.updatedAt),
  }
  if (includeBoardId) properties[PROP_BOARD_ID] = richTextProperty(board.id)
  return properties
}

function plainTextFromProperty(properties: Record<string, unknown>, key: string): string {
  const prop = properties[key] as { title?: NotionRichText[]; rich_text?: NotionRichText[] } | undefined
  return joinRichText(prop?.title ?? prop?.rich_text ?? [])
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
        [PROP_NAME]: { title: {} },
        [PROP_PROJECT]: { select: { options: [] } },
        [PROP_UPDATED_AT]: { date: {} },
        [PROP_BOARD_ID]: { rich_text: {} },
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
  const canvasBlob = canvasDataToJsonBlob(canvasData)

  // Un link guardado con codeBlockId/imageBlockId vacíos (ej. de una versión vieja de
  // pullBoardsFromNotion que los dejaba en '' cuando no encontraba los bloques) no sirve para
  // actualizar nada — se trata como si no existiera y se crea una página nueva en vez de
  // armar un PATCH a una URL rota.
  const hasUsableLink = !!existingLink && !!existingLink.codeBlockId && !!existingLink.imageBlockId

  if (!hasUsableLink) {
    const canvasFileUploadId = await notionUploadFile(config.token, canvasBlob, `${board.id}.json`)
    const fileUploadId = await notionUploadFile(config.token, pngBlob, `${board.id}.png`)
    const page = await notionRequest<NotionPageObject>(config.token, 'POST', '/v1/pages', {
      parent: { type: 'data_source_id', data_source_id: config.dataSourceId },
      properties: boardProperties(board, { includeBoardId: true }),
      children: [
        { object: 'block', type: 'file', file: { file_upload: { id: canvasFileUploadId } } },
        {
          object: 'block',
          type: 'image',
          image: { file_upload: { id: fileUploadId } },
        },
      ],
    })
    const blocks = await fetchBlockChildren(config.token, page.id)
    const found = findDataAndImageBlocks(blocks)
    if (!found) {
      throw new Error('No se pudieron ubicar los bloques recién creados en Notion')
    }
    return {
      notionPageId: page.id,
      codeBlockId: found.dataBlock.id,
      imageBlockId: found.imageBlock.id,
      remoteUpdatedAt: board.updatedAt,
    }
  }

  await notionRequest(config.token, 'PATCH', `/v1/pages/${existingLink.notionPageId}`, {
    properties: boardProperties(board, { includeBoardId: false }),
  })
  const canvasFileUploadId = await notionUploadFile(config.token, canvasBlob, `${board.id}.json`)
  const dataBlockId = await replaceDataBlock(
    config.token,
    existingLink.notionPageId,
    existingLink.codeBlockId,
    canvasFileUploadId
  )
  const fileUploadId = await notionUploadFile(config.token, pngBlob, `${board.id}.png`)
  await notionRequest(config.token, 'PATCH', `/v1/blocks/${existingLink.imageBlockId}`, {
    image: { file_upload: { id: fileUploadId } },
  })

  return { ...existingLink, codeBlockId: dataBlockId, remoteUpdatedAt: board.updatedAt }
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
    const boardId = plainTextFromProperty(page.properties, PROP_BOARD_ID)
    if (!boardId || localBoardIds.has(boardId)) continue

    const name = plainTextFromProperty(page.properties, PROP_NAME) || 'Sin título'
    const project = selectNameFromProperty(page.properties, PROP_PROJECT)
    const remoteUpdatedAt = dateFromProperty(page.properties, PROP_UPDATED_AT)

    const blocks = await fetchBlockChildren(config.token, page.id)
    const found = findDataAndImageBlocks(blocks)
    if (!found) {
      // No tiene la estructura que arma pushBoardToNotion (datos + imagen) — no es una
      // pizarra real de la app (ej. una página de prueba creada a mano en la database), así
      // que no se trae como board local: hacerlo guardaría un link con codeBlockId/imageBlockId
      // vacíos, y la próxima sync intentaría un PATCH a "/v1/blocks/" sin id, que Notion rechaza.
      continue
    }

    const canvasData = await readCanvasDataFromBlock(found.dataBlock)

    pulled.push({
      board: { id: boardId, name, project, createdAt: remoteUpdatedAt, updatedAt: remoteUpdatedAt },
      canvasData,
      link: {
        notionPageId: page.id,
        codeBlockId: found.dataBlock.id,
        imageBlockId: found.imageBlock.id,
        remoteUpdatedAt,
      },
    })
  }

  return pulled
}

export async function getRemoteUpdatedAt(config: NotionConfig, notionPageId: string): Promise<number> {
  const page = await notionRequest<NotionPageObject>(config.token, 'GET', `/v1/pages/${notionPageId}`)
  return dateFromProperty(page.properties, PROP_UPDATED_AT)
}

export async function fetchRemoteCanvasData(
  config: NotionConfig,
  link: NotionBoardLink
): Promise<StoredCanvasData | null> {
  const dataBlock = await notionRequest<NotionBlockObject>(
    config.token,
    'GET',
    `/v1/blocks/${link.codeBlockId}`
  )
  return readCanvasDataFromBlock(dataBlock)
}

// Notion no tiene un "delete" físico para páginas vía API pública: archivarla es el equivalente
// a mandarla a la papelera, que es lo que hace la UI de Notion al borrar.
export async function deleteBoardFromNotion(config: NotionConfig, notionPageId: string): Promise<void> {
  await notionRequest(config.token, 'PATCH', `/v1/pages/${notionPageId}`, { archived: true })
}

