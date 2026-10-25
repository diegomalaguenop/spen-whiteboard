import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'S Pen Whiteboard',
        short_name: 'Whiteboard',
        description: 'Whiteboard de diagramas y notas con S Pen',
        theme_color: '#1a1a1e',
        background_color: '#1a1a1e',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Excalidraw's bundled chunks (fonts, mermaid/katex support) can be large; raise the default 2MB precache limit
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // There are two independent mermaid installs in this project: our own (for the
        // Mermaid export modal) and the one nested inside @excalidraw/mermaid-to-excalidraw
        // (a dependency of @excalidraw/excalidraw itself, used by its own "paste a Mermaid
        // diagram" menu feature). Both ship every mermaid diagram type as separate lazy
        // chunks, but this app only ever generates flowchart/stateDiagram-v2, so the rest
        // (gantt, pie, c4, class, er, sequence, journey, sankey, xychart, railroad, venn,
        // wardley, cynefin, usecase, radar, treemap, ishikawa, kanban, timeline, mindmap,
        // block, packet, abnf/ebnf/peg) plus the heavy libs only those use (elk, cytoscape,
        // katex) are excluded from the precache manifest to keep it from ballooning. This is
        // a hand-maintained list matched against the chunk names mermaid emits today — if a
        // future mermaid/mermaid-to-excalidraw upgrade renames internal chunks, an unmatched
        // one would just end up back in the precache (fails safe, nothing breaks) until this
        // list is refreshed. flowDiagram-*, stateDiagram-v2-*, dagre-* and
        // mermaid-parser.core-* are deliberately NOT excluded since they're needed.
        globIgnores: [
          '**/c4Diagram-*.js',
          '**/classDiagram-*.js',
          '**/classDiagram-v2-*.js',
          '**/sequenceDiagram-*.js',
          '**/erDiagram-*.js',
          '**/ganttDiagram-*.js',
          '**/journeyDiagram-*.js',
          '**/quadrantDiagram-*.js',
          '**/sankeyDiagram-*.js',
          '**/packet-*.js',
          '**/xychartDiagram-*.js',
          '**/blockDiagram-*.js',
          '**/gitGraph-*.js',
          '**/gitGraphDiagram-*.js',
          '**/architecture-*.js',
          '**/architectureDiagram-*.js',
          '**/kanban-definition-*.js',
          '**/timeline-definition-*.js',
          '**/mindmap-definition-*.js',
          '**/requirementDiagram-*.js',
          '**/usecaseDiagram-*.js',
          '**/radar-*.js',
          '**/treemap-*.js',
          '**/ishikawaDiagram-*.js',
          '**/railroad-*.js',
          '**/railroadDiagram-*.js',
          '**/vennDiagram-*.js',
          '**/venn.esm-*.js',
          '**/wardley-*.js',
          '**/wardleyDiagram-*.js',
          '**/cynefin-*.js',
          '**/cynefinDiagram-*.js',
          '**/pie-*.js',
          '**/pieDiagram-*.js',
          '**/info-*.js',
          '**/infoDiagram-*.js',
          '**/swimlanes-*.js',
          '**/swimlanesDiagram-*.js',
          '**/eventmodeling-*.js',
          '**/abnfDiagram-*.js',
          '**/ebnfDiagram-*.js',
          '**/pegDiagram-*.js',
          '**/stateDiagram-[!v]*.js',
          '**/elk-*.js',
          '**/cytoscape*.js',
          '**/katex-*.js',
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
})
