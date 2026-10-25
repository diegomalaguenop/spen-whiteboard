import type { NotionBoardLink, NotionConfig } from './notionTypes'

const CONFIG_KEY = 'spen-whiteboard:notion-config'
const LINKS_KEY = 'spen-whiteboard:notion-links'

export function loadNotionConfig(): NotionConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as NotionConfig) : null
  } catch {
    return null
  }
}

export function saveNotionConfig(config: NotionConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearNotionConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

export function loadNotionLinks(): Record<string, NotionBoardLink> {
  try {
    const raw = localStorage.getItem(LINKS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, NotionBoardLink>) : {}
  } catch {
    return {}
  }
}

export function saveNotionLinks(links: Record<string, NotionBoardLink>): void {
  localStorage.setItem(LINKS_KEY, JSON.stringify(links))
}

export function saveNotionLink(boardId: string, link: NotionBoardLink): void {
  const links = loadNotionLinks()
  links[boardId] = link
  saveNotionLinks(links)
}
