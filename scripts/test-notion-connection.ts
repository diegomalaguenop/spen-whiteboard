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

import {
  NOTION_VERSION,
  DATABASE_TITLE,
  PROP_NAME,
  PROP_PROJECT,
  PROP_UPDATED_AT,
  PROP_BOARD_ID,
  normalizeId,
  extractPageId,
} from '../shared/notionSchema'

const NOTION_API_BASE = 'https://api.notion.com'

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

const pageId = normalizeId(extractPageId(rawPageId))

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
          [PROP_NAME]: { title: {} },
          [PROP_PROJECT]: { select: { options: [] } },
          [PROP_UPDATED_AT]: { date: {} },
          [PROP_BOARD_ID]: { rich_text: {} },
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
      [PROP_NAME]: { title: [{ text: { content: 'Prueba de conexión' } }] },
      [PROP_PROJECT]: { select: { name: 'Test' } },
      [PROP_UPDATED_AT]: { date: { start: new Date().toISOString() } },
      [PROP_BOARD_ID]: { rich_text: [{ text: { content: 'test-connection-script' } }] },
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

  logStep('4. Subir una imagen de prueba (como hace notionUploadFile) y crear una página con bloque de imagen')
  const fileUploadCreated = await callNotion('POST', '/v1/file_uploads', {
    filename: 'test.png',
    content_type: 'image/png',
  })
  logResult(fileUploadCreated)
  if (fileUploadCreated.status !== 200) fail('crear file upload (POST /v1/file_uploads)', fileUploadCreated)
  const fileUploadId = (fileUploadCreated.body as { id: string }).id

  console.log(`\nMandando los bytes a /v1/file_uploads/${fileUploadId}/send ...`)
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
  const form = new FormData()
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test.png')
  const sendResponse = await fetch(`${NOTION_API_BASE}/v1/file_uploads/${fileUploadId}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
    body: form,
  })
  const sendText = await sendResponse.text()
  let sendBody: unknown
  try {
    sendBody = JSON.parse(sendText)
  } catch {
    sendBody = sendText
  }
  console.log(`status: ${sendResponse.status}`)
  console.log(JSON.stringify(sendBody, null, 2))
  if (sendResponse.status !== 200) fail('mandar bytes (POST /v1/file_uploads/{id}/send)', { status: sendResponse.status, body: sendBody })

  const imagePage = await callNotion('POST', '/v1/pages', {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      [PROP_NAME]: { title: [{ text: { content: 'Prueba de conexión (con imagen)' } }] },
      [PROP_PROJECT]: { select: { name: 'Test' } },
      [PROP_UPDATED_AT]: { date: { start: new Date().toISOString() } },
      [PROP_BOARD_ID]: { rich_text: [{ text: { content: 'test-connection-script-image' } }] },
    },
    children: [
      {
        object: 'block',
        type: 'image',
        image: { file_upload: { id: fileUploadId } },
      },
    ],
  })
  logResult(imagePage)
  if (imagePage.status !== 200) fail('crear página con imagen (POST /v1/pages)', imagePage)

  console.log('\n✅ Todo el flujo funcionó de punta a punta, incluida la subida de imagen (llamando directo a Notion). Revisá la página de Notion.')

  logStep('5. Actualizar (PATCH) ese mismo bloque de imagen con un segundo upload — la rama que nunca se había probado')
  const imagePageId = (imagePage.body as { id: string }).id
  const imagePageChildren = await callNotion('GET', `/v1/blocks/${imagePageId}/children`)
  const imageBlockId = (imagePageChildren.body as { results?: { id: string; type: string }[] }).results?.find(
    (b) => b.type === 'image'
  )?.id
  if (!imageBlockId) {
    console.log('⚠️  No se pudo leer el id del bloque de imagen recién creado desde la respuesta, se omite este paso.')
  } else {
    const secondUpload = await callNotion('POST', '/v1/file_uploads', {
      filename: 'test2.png',
      content_type: 'image/png',
    })
    if (secondUpload.status !== 200) fail('crear segundo file upload', secondUpload)
    const secondUploadId = (secondUpload.body as { id: string }).id
    const secondForm = new FormData()
    secondForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test2.png')
    const secondSend = await fetch(`${NOTION_API_BASE}/v1/file_uploads/${secondUploadId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
      body: secondForm,
    })
    if (secondSend.status !== 200) fail('mandar bytes del segundo upload', { status: secondSend.status, body: await secondSend.text() })

    const patchResult = await callNotion('PATCH', `/v1/blocks/${imageBlockId}`, {
      image: { file_upload: { id: secondUploadId } },
    })
    logResult(patchResult)
    if (patchResult.status !== 200) fail('actualizar bloque de imagen (PATCH /v1/blocks/{id})', patchResult)
    console.log('\n✅ El PATCH al bloque de imagen existente también funcionó.')
  }

  if (proxyUrl) {
    logStep('6. Repetir la búsqueda a través del proxy de Vercel, para comparar')
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
