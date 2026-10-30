import { NOTION_VERSION } from '../shared/notionSchema'

export const config = { runtime: 'edge' }

const NOTION_API_BASE = 'https://api.notion.com'

interface ProxyRequestBody {
  token: string
  method: string
  path: string
  body?: unknown
  fileBase64?: string
  filename?: string
  contentType?: string
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let payload: ProxyRequestBody
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { token, method, path, body, fileBase64, filename, contentType } = payload
  if (!token || !method || !path || !path.startsWith('/v1/')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid token/method/path' }), {
      status: 400,
    })
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
  }

  let notionResponse: Response
  try {
    if (fileBase64) {
      const bytes = base64ToUint8Array(fileBase64)
      const form = new FormData()
      form.append(
        'file',
        new Blob([bytes.buffer as ArrayBuffer], { type: contentType || 'application/octet-stream' }),
        filename || 'upload'
      )
      notionResponse = await fetch(`${NOTION_API_BASE}${path}`, { method, headers, body: form })
    } else {
      headers['Content-Type'] = 'application/json'
      notionResponse = await fetch(`${NOTION_API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error reaching Notion'
    return new Response(JSON.stringify({ error: message }), { status: 502 })
  }

  const responseText = await notionResponse.text()
  return new Response(responseText, {
    status: notionResponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
