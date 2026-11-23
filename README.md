# PrecioReal Perú — Radar Diario de Precios Históricos y Ofertas Reales

Web App estilo **SteamDB + Compy.pe** diseñada para rastrear el **historial diario de precios** en tiendas del Perú y detectar **qué productos en verdad conviene comprar** (separando verdaderos mínimos históricos de descuentos inflados).

## Funcionalidades principales

- **21 tiendas peruanas conectadas en vivo**:
  - **Retail & Supermercados**: Falabella, Tottus, PlazaVea, Oechsle, Promart, Wong, Metro, Coolbox, Carsa, Shopstar, Estilos, Hiraoka, Tai Loy.
  - **Tiendas Oficiales y Especializadas**: Sony Store PE, Xiaomi Perú, Triathlon Sport, Footloose, Casaideas, Aruma.
  - **Tecnología / PC Perú**: Infotec Perú, CyC Computer (con conversión automática USD → S/ usando tipo de cambio del día).
- **Seguimiento de cualquier tienda por URL**: Pega el enlace de cualquier producto de Perú y el extractor universal (VTEX / Falabella SSR / Schema.org JSON-LD / OpenGraph) guarda su precio y construye su curva histórica día a día.
- **Motor de Veredicto "¿Conviene comprar?" (Deal Score 0–100)**:
  - Calcula **Mínimo Histórico (ATL)**, **Máximo Histórico (ATH)**, **Mediana Habitual**, **Promedio 30 días** y **caída en 24h**.
  - **Detector de descuentos inflados**: alerta cuando una tienda muestra un gran porcentaje tachado, pero el precio real no bajó respecto a su mediana histórica.
  - Captura precios con **Tarjeta CMR / Tarjeta Oh!** cuando están disponibles.
- **Actualización al entrar + Automatización diaria gratis**:
  - Botón **«Actualizar hoy»** en vivo con barra de progreso en tiempo real (Server-Sent Events) al ejecutarlo con `npm start`.
  - **GitHub Actions** (`.github/workflows/daily-scrape.yml`) configurado para actualizar automáticamente todos los días a las **7:00 AM (hora Lima)**, guardar el historial en `data/history.json` y desplegar la web en **GitHub Pages**.
- **Comparador Multi-Tienda en Vivo**: busca cualquier producto en tiempo real en todas las tiendas conectadas, ordena de menor a mayor precio en soles (S/) y permite seguir su historial con un clic.
- **Mi Lista & Alertas de Precio Objetivo**: guarda productos con estrella, define tu precio meta (ej. *"avísame si baja de S/ 1,200"*) y añade búsquedas automáticas diarias.

## Inicio rápido local

Requisitos: **Node.js 20+** (probado en Node 22).

```bash
npm install
npm start
```

Abre `http://localhost:3000` en tu navegador.

### Comandos útiles

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia la Web App y API local en `http://localhost:3000` |
| `npm run scrape` | Ejecuta la actualización completa diaria de las 21 tiendas peruanas |
| `npm run scrape:quick` | Actualización rápida (1 consulta por categoría, ~10 segundos) |
| `npm test` | Ejecuta las pruebas unitarias del analizador histórico y parsers |

## Activar actualización diaria automática en GitHub Pages

1. En tu repositorio de GitHub ve a **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. En **Settings → Actions → General → Workflow permissions**, activa **Read and write permissions** (para que el bot pueda guardar el historial diario en `data/`).
4. Ve a la pestaña **Actions → Actualización Diaria de Precios Perú** y haz clic en **Run workflow** (luego correrá automáticamente cada mañana a las 7:00 AM hora de Lima).
