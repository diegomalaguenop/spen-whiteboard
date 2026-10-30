import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board } from './types'
import App from './App'

// Excalidraw does not render in jsdom (needs a real canvas), so it is replaced by an inert stub.
// The export menu under test lives in App's header and does not depend on the canvas.
vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: () => <div data-testid="excalidraw-stub" />,
  exportToCanvas: vi.fn(),
  exportToSvg: vi.fn(),
}))

// stencils.ts calls Excalidraw helpers at module load; the menu does not need the library.
vi.mock('./stencils', () => ({ TECHNICAL_STENCILS: [] }))

const BOARDS_KEY = 'spen-whiteboard:boards'

const ACTIVE_BOARD: Board = {
  id: 'board-1',
  name: 'Arquitectura',
  project: 'General',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}

const EXPECTED_MENU_ITEMS = [
  'Exportar como PNG',
  'Exportar como SVG',
  'Exportar como PDF',
  'Exportar como diagrama Mermaid',
]

function renderAppWithActiveBoard(): void {
  localStorage.setItem(BOARDS_KEY, JSON.stringify([ACTIVE_BOARD]))
  render(<App />)
}

function getExportButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Exportar pizarra' })
}

beforeEach(() => {
  localStorage.clear()
})

describe('App export menu', () => {
  test('renders the export button as a menu trigger', () => {
    // Arrange
    renderAppWithActiveBoard()

    // Act
    const exportButton = getExportButton()

    // Assert
    expect(exportButton).toHaveAttribute('aria-haspopup', 'menu')
    expect(exportButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('opens the menu with PNG, SVG, PDF and Mermaid options when clicked', async () => {
    // Arrange
    const user = userEvent.setup()
    renderAppWithActiveBoard()

    // Act
    await user.click(getExportButton())

    // Assert
    expect(screen.getByRole('menu')).toBeInTheDocument()
    const itemNames = screen.getAllByRole('menuitem').map((item) => item.getAttribute('aria-label'))
    expect(itemNames).toEqual(EXPECTED_MENU_ITEMS)
    expect(getExportButton()).toHaveAttribute('aria-expanded', 'true')
  })

  test('closes the menu on Escape and returns focus to the export button', async () => {
    // Arrange
    const user = userEvent.setup()
    renderAppWithActiveBoard()
    await user.click(getExportButton())
    screen.getByRole('menuitem', { name: 'Exportar como PNG' }).focus()

    // Act
    await user.keyboard('{Escape}')

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(getExportButton()).toHaveFocus()
  })

  test('closes the menu when clicking outside of it', async () => {
    // Arrange
    const user = userEvent.setup()
    renderAppWithActiveBoard()
    await user.click(getExportButton())

    // Act
    await user.click(screen.getByRole('heading', { name: 'Pizarras' }))

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
