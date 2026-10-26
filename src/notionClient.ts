const PROXY_URL = '/api/notion-proxy'

export class NotionApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function notionRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, method, path, body }),
  })
  const data = await response.json()
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Notion respondió con error ${response.status}`
    throw new NotionApiError(response.status, message)
  }
  return data as T
}

export async function notionUploadFile(token: string, blob: Blob, filename: string): Promise<string> {
  const created = await notionRequest<{ id: string }>(token, 'POST', '/v1/file_uploads', {
    filename,
    content_type: blob.type || 'image/png',
  })
  const fileBase64 = await blobToBase64(blob)
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      method: 'POST',
      path: `/v1/file_uploads/${created.id}/send`,
      fileBase64,
      filename,
      contentType: blob.type || 'image/png',
    }),
  })
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : `No se pudo subir la imagen a Notion (error ${response.status})`
    throw new NotionApiError(response.status, message)
  }
  return created.id
}
