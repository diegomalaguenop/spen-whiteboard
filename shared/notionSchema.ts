// Esquema de Notion compartido entre src/notionSync.ts (la app), api/notion-proxy.ts (el proxy
// de Vercel) y scripts/test-notion-connection.ts (el script de diagnóstico standalone). Vive
// fuera de src/ porque los tres lo importan y ninguno es "dueño" de los otros dos.
//
// Cambiar un nombre de property acá rompe la compatibilidad con pizarras ya sincronizadas en
// Notion (notionSync.ts las busca por estos nombres exactos) — no es un rename inocuo.

export const NOTION_VERSION = '2026-03-11'
export const DATABASE_TITLE = 'S Pen Whiteboard'

export const PROP_NAME = 'Nombre'
export const PROP_PROJECT = 'Proyecto'
export const PROP_UPDATED_AT = 'Última edición'
export const PROP_BOARD_ID = 'Board ID'

export function normalizeId(id: string): string {
  return id.replace(/-/g, '')
}

// Acepta un id de página pegado tal cual, o una URL de Notion de la que colgarlo.
export function extractPageId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/[0-9a-fA-F]{32}/)
  if (match) return match[0]
  const dashed = trimmed.match(/[0-9a-fA-F-]{36}/)
  return dashed ? dashed[0] : trimmed
}
