import { useState } from 'react'
import type { NotionConfig } from './notionTypes'
import { connectToNotion } from './notionSync'
import { NotionApiError } from './notionClient'

interface NotionPanelProps {
  config: NotionConfig | null
  onConnected: (config: NotionConfig) => void
  onDisconnect: () => void
  onClose: () => void
}

function extractPageId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/[0-9a-fA-F]{32}/)
  if (match) return match[0]
  const dashed = trimmed.match(/[0-9a-fA-F-]{36}/)
  return dashed ? dashed[0] : trimmed
}

function NotionPanel({ config, onConnected, onDisconnect, onClose }: NotionPanelProps) {
  const [token, setToken] = useState('')
  const [pageInput, setPageInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect(): Promise<void> {
    const parentPageId = extractPageId(pageInput)
    if (!token.trim() || !parentPageId) {
      setError('Pegá el token y el ID (o la URL) de la página padre.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const newConfig = await connectToNotion(token.trim(), parentPageId)
      onConnected(newConfig)
    } catch (err: unknown) {
      if (err instanceof NotionApiError && err.status === 404) {
        setError(
          'Notion no encuentra esa página. Confirmá que compartiste la página con tu integración (menú ••• → Connect to → tu integración).'
        )
      } else if (err instanceof NotionApiError && err.status === 401) {
        setError('El token no es válido. Revisá que lo copiaste completo desde notion.so/my-integrations.')
      } else {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        setError(`No se pudo conectar: ${message}`)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="notion-panel-overlay" onClick={onClose}>
      <div className="notion-panel" onClick={(e) => e.stopPropagation()}>
        <div className="notion-panel-header">
          <h2>Sincronización con Notion</h2>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {config ? (
          <div className="notion-panel-connected">
            <p>Conectado a la database "S Pen Whiteboard" en Notion.</p>
            <button className="notion-disconnect-btn" onClick={onDisconnect}>
              Desconectar
            </button>
          </div>
        ) : (
          <>
            <p className="notion-panel-hint">
              Pegá el Integration Token de tu integración interna de Notion y el ID (o la URL) de la
              página donde querés que se cree la database "S Pen Whiteboard".
            </p>
            <input
              type="password"
              className="notion-input"
              placeholder="Integration Token (ntn_...)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <input
              type="text"
              className="notion-input"
              placeholder="ID o URL de la página padre"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
            />
            {error && <p className="notion-panel-error">{error}</p>}
            <button className="notion-connect-btn" disabled={connecting} onClick={handleConnect}>
              {connecting ? 'Conectando...' : 'Conectar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default NotionPanel
