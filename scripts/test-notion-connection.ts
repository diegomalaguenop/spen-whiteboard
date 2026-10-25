// Script de diagnóstico standalone. Reproduce exactamente el mismo flujo y los mismos
// payloads que usa api/notion-proxy.ts + src/notionSync.ts en producción, pero llamando
// directo a api.notion.com (sin pasar por nuestro proxy de Vercel) para poder aislar si un
// fallo está en la lógica/payload que compartimos con el proxy, o en el proxy mismo.
//
// Uso:
//   NOTION_TOKEN=xxx NOTION_PAGE_ID=xxx npx tsx scripts/test-notion-connection.ts
//
// No hardcodea ni pide el token por stdin — si falta alguna env var, tira error y no hace
// ningún request.

const NOTION_VERSION = '2026-03-11'
const NOTION_API_BASE = 'https://api.notion.com'
const DATABASE_TITLE = 'S Pen Whiteboard'

const token = process.env.NOTION_TOKEN
const rawPageId = process.env.NOTION_PAGE_ID

if (!token) {
  console.error('Falta la variable de entorno NOTION_TOKEN. Corré:')
  console.error('  NOTION_TOKEN=xxx NOTION_PAGE_ID=xxx npx tsx scripts/test-notion-connection.ts')
  process.exit(1)
}
if (!rawPageId) {
  console.error('Falta la variable de entorno NOTION_PAGE_ID. Corré:')
  console.error('  NOTION_TOKEN=xxx NOTION_PAGE_ID=xxx npx tsx scripts/test-notion-connection.ts')
  process.exit(1)
}

function normalizeId(id: string): string {
  return id.replace(/-/g, '')
}

function extractPageId(input: string): string {
  const match = input.match(/[0-9a-fA-F]{32}/)
  return match ? match[0] : normalizeId(input)
}

const pageId = extractPageId(rawPageId)

interface StepResult {
  status: number
  body: unknown
}

async function callNotion(method: string, path: string, body?: unknown): Promise<StepResult> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed }
}

function logStep(title: string): void {
  console.log(`\n=== ${title} ===`)
}

function logResult(result: StepResult): void {
  console.log(`status: ${result.status}`)
  console.log(JSON.stringify(result.body, null, 2))
}

function fail(step: string, result: StepResult): never {
  console.error(`\n❌ Falló en: ${step} (status ${result.status})`)
  process.exit(1)
}

async function main(): Promise<void> {
  console.log(`Page ID normalizado: ${pageId}`)

  logStep('1. Buscar una database "S Pen Whiteboard" existente bajo la página')
  const search = await callNotion('POST', '/v1/search', {
    query: DATABASE_TITLE,
    filter: { property: 'object', value: 'data_source', in_trash: false },
  })
  logResult(search)
  if (search.status !== 200) fail('búsqueda (POST /v1/search)', search)

  const results = (search.body as { results?: unknown[] }).results ?? []
  const match = results.find((r) => {
    const item = r as { database_parent?: { type?: string; page_id?: string }; parent?: { database_id?: string } }
    return (
      item.database_parent?.type === 'page_id' &&
      normalizeId(item.database_parent.page_id ?? '') === normalizeId(pageId)
    )
  }) as { id: string; parent?: { database_id?: string } } | undefined

  let databaseId: string
  let dataSourceId: string

  if (match?.parent?.database_id) {
    databaseId = match.parent.database_id
    dataSourceId = match.id
    console.log(`\n✅ Database existente encontrada: databaseId=${databaseId} dataSourceId=${dataSourceId}`)
  } else {
    logStep('2. No se encontró database existente — creándola')
    const created = await callNotion('POST', '/v1/databases', {
      parent: { type: 'page_id', page_id: pageId },
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
    logResult(created)
    if (created.status !== 200) fail('crear database (POST /v1/databases)', created)

    const body = created.body as { id: string; data_sources?: { id: string }[] }
    databaseId = body.id
    const foundDataSourceId = body.data_sources?.[0]?.id
    if (!foundDataSourceId) {
      console.error('\n❌ La respuesta no trajo data_sources[0].id')
      process.exit(1)
    }
    dataSourceId = foundDataSourceId
    console.log(`\n✅ Database creada: databaseId=${databaseId} dataSourceId=${dataSourceId}`)
  }

  logStep('3. Crear una página de prueba en la database')
  const testPage = await callNotion('POST', '/v1/pages', {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      Nombre: { title: [{ text: { content: 'Prueba de conexión' } }] },
      Proyecto: { select: { name: 'Test' } },
      'Última edición': { date: { start: new Date().toISOString() } },
      'Board ID': { rich_text: [{ text: { content: 'test-connection-script' } }] },
    },
    children: [
      {
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{ type: 'text', text: { content: '{"ok":true}' } }],
          language: 'json',
        },
      },
    ],
  })
  logResult(testPage)
  if (testPage.status !== 200) fail('crear página de prueba (POST /v1/pages)', testPage)

  console.log('\n✅ Todo el flujo funcionó de punta a punta. Revisá la página de Notion.')
}

main().catch((error: unknown) => {
  console.error('\n❌ Error inesperado:', error)
  process.exit(1)
})
