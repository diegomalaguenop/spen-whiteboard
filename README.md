# S Pen Whiteboard — MVP (Fase 1)

Whiteboard con dibujo a mano alzada, pensado para la Galaxy Tab S9 FE+ y el S Pen.
Basado en [Excalidraw](https://excalidraw.com/) como canvas (MIT, sin watermark), con pizarras
organizadas por proyecto y guardado local (`localStorage`) — nada sale de tu laptop por ahora.

## Requisitos

- Node.js 18 o superior instalado en tu laptop
- Laptop y tablet conectadas a la **misma red Wi-Fi**

## Cómo correrlo

```bash
npm install
npm run dev -- --host
```

La terminal te va a mostrar algo como:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.XX:5173/
```

Abrí la URL de **Network** en el navegador de la tablet (Chrome o Samsung Internet).

## Instalarla como app en la tablet

Una vez abierta la URL en el navegador de la tablet:

1. Tocá el menú (⋮) del navegador
2. "Agregar a pantalla de inicio" o "Instalar app"
3. Se abre en modo standalone (sin barra de navegador), como una app nativa

## Qué probar

- Dibujar con el S Pen: la presión debería cambiar el grosor del trazo automáticamente
- Crear una pizarra nueva por proyecto (ej. "FIN700", "AdaptFit")
- Cerrar y volver a abrir la app: el dibujo debe seguir ahí (guardado local)
- Borrar una pizarra desde el panel izquierdo

## Qué falta (próximas fases, ver el plan)

- Sync con Google Drive / Notion
- Stencils de diagramas técnicos (arquitectura, máquinas de estado)
- Reconocimiento de escritura a mano
- Asistente de IA (a elegir después)

## Build de producción (opcional)

```bash
npm run build
npm run preview -- --host
```

Para algo más permanente (acceso desde cualquier red, no solo tu Wi-Fi), se puede
desplegar a Vercel o Netlify más adelante — lo vemos cuando quieras.
