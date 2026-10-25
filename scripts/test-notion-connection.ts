// Script de diagnóstico standalone. Reproduce exactamente el mismo flujo y los mismos
// payloads que usa api/notion-proxy.ts + src/notionSync.ts en producción, pero llamando
// directo a api.notion.com (sin pasar por nuestro proxy de Vercel) para poder aislar si un
// fallo está en la lógica/payload que compartimos con el proxy, o en el proxy mismo.
//
// Si además pasás NOTION_PROXY_URL (la URL del deploy de Vercel), al final repite el paso
// de búsqueda PERO a través de ese proxy (igual que hace la app real), para comparar si da
// el mismo resultado que la llamada directa — así se puede aislar un bug específico del
// proxy sin que el token tenga que circular por ningún lado más que tus propias env vars.
//
// Uso:
//   NOTION_TOKEN=xxx NOTION_PAGE_ID=xxx npx tsx scripts/test-notion-connection.ts
//   NOTION_TOKEN=xxx NOTION_PAGE_ID=xxx NOTION_PROXY_URL=https://tu-deploy.vercel.app npx tsx scripts/test-notion-connection.ts
//
// No hardcodea ni pide el token por stdin — si falta alguna env var obligatoria, tira error
// y no hace ningún request.

const NOTION_VERSION = '2026-03-11'
const NOTION_API_BASE = 'https://api.notion.com'
const DATABASE_TITLE = 'S Pen Whiteboard'

const token = process.env.NOTION_TOKEN
const rawPageId = process.env.NOTION_PAGE_ID
const proxyUrl = process.env.NOTION_PROXY_URL

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

  console.log('\n✅ Todo el flujo funcionó de punta a punta (llamando directo a Notion). Revisá la página de Notion.')

  if (proxyUrl) {
    logStep('4. Repetir la búsqueda a través del proxy de Vercel, para comparar')
    const proxyEndpoint = `${proxyUrl.replace(/\/$/, '')}/api/notion-proxy`
    console.log(`Llamando a: ${proxyEndpoint}`)
    const proxyResponse = await fetch(proxyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        method: 'POST',
        path: '/v1/search',
        body: {
          query: DATABASE_TITLE,
          filter: { property: 'object', value: 'data_source', in_trash: false },
        },
      }),
    })
    const proxyText = await proxyResponse.text()
    let proxyBody: unknown
    try {
      proxyBody = JSON.parse(proxyText)
    } catch {
      proxyBody = proxyText
    }
    console.log(`status: ${proxyResponse.status}`)
    console.log(typeof proxyBody === 'string' ? proxyBody : JSON.stringify(proxyBody, null, 2))
    if (proxyResponse.status === 200) {
      console.log('\n✅ El proxy también funciona igual que la llamada directa.')
    } else {
      console.log('\n❌ El proxy dio un resultado distinto al de la llamada directa — el bug está ahí.')
    }
  } else {
    console.log(
      '\n(No se pasó NOTION_PROXY_URL, así que no se probó el proxy de Vercel en esta corrida.)'
    )
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ Error inesperado:', error)
  process.exit(1)
})
