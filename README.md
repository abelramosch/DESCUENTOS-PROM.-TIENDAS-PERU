# ChapaAlToque PE — Radar Diario de Precios Históricos y Ofertas Reales en Perú

[![Demo en Vivo](https://img.shields.io/badge/Demo%20en%20Vivo-ChapaAlToque%20PE-D92638?style=for-the-badge)](https://abelramosch.github.io/chapaaltoque/)
[![Actualización Diaria](https://github.com/abelramosch/chapaaltoque/actions/workflows/daily-scrape.yml/badge.svg)](https://github.com/abelramosch/chapaaltoque/actions/workflows/daily-scrape.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Derechos de Autor](https://img.shields.io/badge/Derechos-Reservados-slate.svg)](#derechos-de-autor)

Aplicación web estilo **SteamDB + Compy.pe** que registra diariamente el **historial de precios en más de 20 tiendas del Perú** y calcula automáticamente **qué productos en verdad conviene comprar**, diferenciando mínimos históricos reales de descuentos inflados.

> **Pruébala ahora mismo (sin instalar nada):**  
> 👉 **https://abelramosch.github.io/chapaaltoque/**

---

## Características principales

- **29 tiendas peruanas monitoreadas diariamente**:
  - **Retail, supermercados y mayoristas**: Falabella, Tottus, PlazaVea, Oechsle, Promart, Wong, Metro, Makro, Coolbox, Carsa, Shopstar, Estilos, Hiraoka y Tai Loy (con detección de precios **BCP / CMR / Tarjeta Oh! / Interbank / BBVA / Cencosud**).
  - **Tiendas oficiales, hogar, moda y especializadas**: Sony Store PE, Xiaomi Perú, Oster Perú, Electrolux Perú, Paraíso Perú, Cassinelli, Topitop, Renzo Costa, Miniso Perú, Triathlon Sport, Footloose, Casaideas y Aruma.
  - **Tecnología / PC Perú**: Infotec Perú y CyC Computer (conversión automática **USD → S/** con tipo de cambio actualizado).
- **Motor de veredicto "¿Conviene comprar?" (Deal Score 0–100)**:
  - Calcula **Mínimo Histórico (ATL)**, **Máximo Histórico (ATH)**, **Mediana habitual**, **Promedio 30 días** y **variación 24h**.
  - **Detector de descuentos inflados y Base Inflada**: alerta cuando una tienda muestra un gran porcentaje tachado pero el precio real no ha bajado respecto a su historial o al precio de mercado en otras tiendas.
  - **Gráficos SVG interactivos** sin librerías pesadas + mini sparklines en la tabla.
- **Filtros precisos por Tienda, Marca, Categoría (11 categorías), Tarjeta y Veredicto**:
  - Clasificación automática de **marcas reconocidas** y agrupación ordenada de marcas menos conocidas bajo **Marcas genéricas**.
  - Vista **Tabla densa (SteamDB)** y vista **Tarjetas (Compy)**, en modo claro y oscuro.
- **Mi Lista privada y alertas de precio objetivo**:
  - Guarda productos en tu navegador (`localStorage`), define un precio meta en soles (`S/`) y añade o quita productos desde el buscador rápido.
- **Actualización diaria 100% automatizada + disparo manual**:
  - **GitHub Actions** actualiza los precios 3 veces al día (**7:00 AM, 1:00 PM y 8:00 PM hora de Lima**), guarda el histórico en `data/history.json` y despliega en **GitHub Pages**.
  - Botón **«Actualizar hoy»** con estado en vivo, recarga sin caché y disparo en 1 clic vía GitHub Actions API (o escaneo en vivo por SSE al correrlo localmente).
- **Modo servidor local completo (`npm start`)**:
  - Comparador multi-tienda en tiempo real en todas las tiendas conectadas y seguimiento de cualquier URL de tienda peruana (VTEX, Falabella SSR, Schema.org JSON-LD y OpenGraph).

---

## Arquitectura del proyecto

```text
chapaaltoque/
├── .github/workflows/daily-scrape.yml   # Cron 3x/día (Lima) + despliegue automático en Pages
├── config/
│   ├── stores.js                        # Registro de 29 tiendas peruanas activas y sus motores
│   └── watch-queries.json               # 11 categorías y 56 búsquedas monitoreadas diariamente
├── scraper/
│   ├── adapters/                        # Motores VTEX, Falabella SSR, PrestaShop, Magento y URL universal
│   ├── analyzer.js                      # Inteligencia de precios (ATL, mediana, Deal Score, inflados)
│   ├── live-search.js                   # Comparador multi-tienda concurrente
│   ├── storage.js                       # Persistencia atómica JSON + sincronización compacta
│   └── run-daily.js                     # Pipeline CLI diario
├── server/index.js                      # Servidor HTTP nativo Node 22 (API + SSE en vivo)
├── public/                              # Frontend Vanilla HTML/CSS/JS + gráficos SVG puros
├── data/                                # Base histórica diaria (catalog.json, history.json, meta.json)
└── tests/analyzer.test.js               # Pruebas unitarias (node:test)
```

---

## Ejecutar localmente

Requisitos: **Node.js 20+** (probado en Node 22).

```bash
git clone https://github.com/abelramosch/chapaaltoque.git
cd chapaaltoque
npm install
npm start
```

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia la app y API local en `http://localhost:3000` |
| `npm run scrape` | Actualiza el catálogo completo de las 29 tiendas peruanas |
| `npm run scrape:quick` | Actualización rápida (1 consulta por categoría, ~15s) |
| `npm test` | Ejecuta las pruebas unitarias del analizador y parsers |

---

## Evaluar, opinar o contribuir

¿Probaste **ChapaAlToque PE** y tienes feedback, ideas o quieres sugerir una tienda peruana?

- **Deja tu evaluación o comentario** en [GitHub Discussions](https://github.com/abelramosch/chapaaltoque/discussions).
- **Sugiere una tienda o reporta un error** abriendo un [Issue](https://github.com/abelramosch/chapaaltoque/issues/new/choose).
- Si te pareció útil, una ⭐ en el repositorio ayuda a que más personas lo descubran.

---

## Derechos de autor

© 2026 **abelramosch** — **Todos los derechos reservados.**

El código de este repositorio es público únicamente con fines de consulta, demostración y evaluación técnica. No se autoriza su copia, redistribución, modificación ni uso comercial sin permiso expreso del autor.
