/**
 * Gráficos SVG puros (cero dependencias externas) para ChapaAlToque PE:
 *  - renderSparkline(values, options): mini-gráfico de tendencia para tabla/tarjetas
 *  - renderHistoryChart(container, history, stats): gráfico interactivo estilo SteamDB
 */

export function formatPen(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return (
    'S/ ' +
    Number(value).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

export function renderSparkline(values = [], width = 88, height = 26) {
  const pts = Array.isArray(values) && values.length ? values.map(Number) : [0];
  if (pts.length === 1) {
    // Single-day baseline indicator
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg" aria-label="1 día registrado">
        <line x1="6" y1="${height / 2}" x2="${width - 6}" y2="${height / 2}" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="3 3" />
        <circle cx="${width - 6}" cy="${height / 2}" r="3.2" fill="var(--accent)" />
      </svg>
    `;
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const isFlat = max - min < 0.01;
  const span = max - min || 1;
  const padX = 4;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = pts.map((val, i) => {
    const x = padX + (i / (pts.length - 1)) * innerW;
    const y = isFlat ? height / 2 : padY + innerH - ((val - min) / span) * innerH;
    return [x, y];
  });

  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const first = pts[0];
  const stroke = last < first ? 'var(--emerald)' : last > first ? 'var(--crimson)' : 'var(--sky)';
  const [lx, ly] = coords[coords.length - 1];

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg" aria-label="Tendencia de precio">
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.8" fill="${stroke}" />
    </svg>
  `;
}

export function renderHistoryChart(container, history = [], stats = {}, rangeDays = 'all') {
  container.innerHTML = '';

  let data = [...history]
    .filter((h) => h && h.date && Number(h.price) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rangeDays !== 'all') {
    const days = Number(rangeDays);
    if (days > 0 && data.length > days) {
      data = data.slice(-days);
    }
  }

  if (!data.length) {
    container.innerHTML = '<p class="muted small">Sin observaciones históricas aún.</p>';
    return;
  }

  const W = 540;
  const H = 215;
  const pad = { top: 18, right: 16, bottom: 30, left: 68 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const realVals = [];
  const listVals = [];
  for (const d of data) {
    realVals.push(Number(d.price));
    if (d.cardPrice && Number(d.cardPrice) > 0) realVals.push(Number(d.cardPrice));
    if (d.listPrice && Number(d.listPrice) > 0) listVals.push(Number(d.listPrice));
  }

  const realMin = Math.min(...realVals);
  const realMax = Math.max(...realVals);
  const maxList = listVals.length ? Math.max(...listVals) : realMax;
  const hasRealVariation = realMax - realMin >= 0.01;

  // Include listPrice in Y scale ONLY if it does not squash real price variation (< 30% of chart height)
  const listSquashesChart =
    data.length > 1 &&
    hasRealVariation &&
    maxList > realMax &&
    (realMax - realMin) / (maxList - realMin) < 0.3;

  const scaleVals = [...realVals];
  if (!listSquashesChart && data.length === 1 && maxList > realMax) {
    scaleVals.push(maxList);
  } else if (!listSquashesChart && hasRealVariation && maxList > realMax) {
    scaleVals.push(maxList);
  } else if (!hasRealVariation && maxList > realMax && maxList <= realMax * 1.5) {
    scaleVals.push(maxList);
  }
  if (stats?.minPrice && hasRealVariation) scaleVals.push(Number(stats.minPrice));

  let yMin = Math.min(...scaleVals);
  let yMax = Math.max(...scaleVals);
  if (yMin === yMax) {
    yMin = Math.max(0, yMin * 0.9);
    yMax = yMax * 1.1;
  } else {
    const margin = (yMax - yMin) * 0.16;
    yMin = Math.max(0, yMin - margin);
    yMax = yMax + margin;
  }

  const xAt = (idx) => {
    if (data.length === 1) return pad.left + plotW * 0.5;
    return pad.left + (idx / (data.length - 1)) * plotW;
  };
  const yAt = (val) => pad.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Build SVG
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.display = 'block';

  // Horizontal grid + Y labels (4 ticks)
  const ticks = 4;
  const useDecimals = yMax - yMin < 20;
  for (let i = 0; i <= ticks; i++) {
    const frac = i / ticks;
    const val = yMin + (yMax - yMin) * (1 - frac);
    const y = pad.top + plotH * frac;

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', pad.left);
    line.setAttribute('x2', W - pad.right);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'var(--border-hairline)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', pad.left - 8);
    lbl.setAttribute('y', y + 3.5);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('fill', 'var(--ink-muted)');
    lbl.setAttribute('font-size', '10');
    lbl.setAttribute('font-family', 'var(--font-mono)');
    lbl.textContent = useDecimals
      ? `S/${val.toFixed(2)}`
      : `S/${Math.round(val).toLocaleString('es-PE')}`;
    svg.appendChild(lbl);
  }

  // Min price reference line (only when real price actually varied)
  if (stats?.minPrice && data.length > 1 && hasRealVariation) {
    const minY = yAt(Number(stats.minPrice));
    const minLine = document.createElementNS(ns, 'line');
    minLine.setAttribute('x1', pad.left);
    minLine.setAttribute('x2', W - pad.right);
    minLine.setAttribute('y1', minY);
    minLine.setAttribute('y2', minY);
    minLine.setAttribute('stroke', 'var(--emerald)');
    minLine.setAttribute('stroke-width', '1.2');
    minLine.setAttribute('stroke-dasharray', '4 4');
    minLine.setAttribute('opacity', '0.75');
    svg.appendChild(minLine);
  }

  if (data.length === 1) {
    // Crisp Day-1 visual comparing Precio Lista vs Precio Hoy
    const d = data[0];
    const cx = xAt(0);
    const py = yAt(d.price);

    if (d.listPrice > d.price && d.listPrice <= yMax) {
      const ly = yAt(d.listPrice);
      const dropLine = document.createElementNS(ns, 'line');
      dropLine.setAttribute('x1', cx);
      dropLine.setAttribute('x2', cx);
      dropLine.setAttribute('y1', ly);
      dropLine.setAttribute('y2', py);
      dropLine.setAttribute('stroke', 'var(--border-strong)');
      dropLine.setAttribute('stroke-dasharray', '3 3');
      dropLine.setAttribute('stroke-width', '1.5');
      svg.appendChild(dropLine);

      const listDot = document.createElementNS(ns, 'circle');
      listDot.setAttribute('cx', cx);
      listDot.setAttribute('cy', ly);
      listDot.setAttribute('r', '4.5');
      listDot.setAttribute('fill', 'var(--ink-muted)');
      svg.appendChild(listDot);

      const listTxt = document.createElementNS(ns, 'text');
      listTxt.setAttribute('x', cx + 10);
      listTxt.setAttribute('y', ly + 4);
      listTxt.setAttribute('fill', 'var(--ink-muted)');
      listTxt.setAttribute('font-size', '10.5');
      listTxt.setAttribute('font-family', 'var(--font-mono)');
      listTxt.textContent = `Lista: ${formatPen(d.listPrice)}`;
      svg.appendChild(listTxt);
    }

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', py);
    dot.setAttribute('r', '6');
    dot.setAttribute('fill', 'var(--accent)');
    dot.setAttribute('stroke', 'var(--bg-surface)');
    dot.setAttribute('stroke-width', '2');
    svg.appendChild(dot);

    const priceTxt = document.createElementNS(ns, 'text');
    priceTxt.setAttribute('x', cx + 12);
    priceTxt.setAttribute('y', py + 4);
    priceTxt.setAttribute('fill', 'var(--ink-primary)');
    priceTxt.setAttribute('font-weight', '700');
    priceTxt.setAttribute('font-size', '11');
    priceTxt.setAttribute('font-family', 'var(--font-mono)');
    priceTxt.textContent = `Hoy: ${formatPen(d.price)}`;
    svg.appendChild(priceTxt);

    const dateTxt = document.createElementNS(ns, 'text');
    dateTxt.setAttribute('x', cx);
    dateTxt.setAttribute('y', H - 8);
    dateTxt.setAttribute('text-anchor', 'middle');
    dateTxt.setAttribute('fill', 'var(--ink-muted)');
    dateTxt.setAttribute('font-size', '10');
    dateTxt.setAttribute('font-family', 'var(--font-mono)');
    dateTxt.textContent = `${d.date} (Día 1 · se irá completando cada día)`;
    svg.appendChild(dateTxt);

    container.appendChild(svg);
    return;
  }

  // Multi-day paths: List price (dashed) only when within Y scale; otherwise show clean note
  if (!listSquashesChart && maxList <= yMax && maxList > realMin) {
    const listPathD = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d.listPrice || d.price).toFixed(1)}`)
      .join(' ');
    const listPath = document.createElementNS(ns, 'path');
    listPath.setAttribute('d', listPathD);
    listPath.setAttribute('fill', 'none');
    listPath.setAttribute('stroke', 'var(--ink-muted)');
    listPath.setAttribute('stroke-width', '1.3');
    listPath.setAttribute('stroke-dasharray', '4 3');
    listPath.setAttribute('opacity', '0.65');
    svg.appendChild(listPath);
  } else if (maxList > yMax) {
    const note = document.createElementNS(ns, 'text');
    note.setAttribute('x', W - pad.right);
    note.setAttribute('y', pad.top - 5);
    note.setAttribute('text-anchor', 'end');
    note.setAttribute('fill', 'var(--ink-muted)');
    note.setAttribute('font-size', '9.5');
    note.setAttribute('font-family', 'var(--font-mono)');
    note.textContent = `Precio lista tienda: ${formatPen(maxList)} (fuera de escala)`;
    svg.appendChild(note);
  }

  // Subtle fill under internet price
  const pricePoints = data.map((d, i) => [xAt(i), yAt(d.price)]);
  const priceLineD = pricePoints
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const areaD = `${priceLineD} L${pricePoints[pricePoints.length - 1][0].toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pricePoints[0][0].toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'var(--accent)');
  area.setAttribute('opacity', '0.09');
  svg.appendChild(area);

  const pricePath = document.createElementNS(ns, 'path');
  pricePath.setAttribute('d', priceLineD);
  pricePath.setAttribute('fill', 'none');
  pricePath.setAttribute('stroke', 'var(--accent)');
  pricePath.setAttribute('stroke-width', '2.4');
  pricePath.setAttribute('stroke-linejoin', 'round');
  pricePath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pricePath);

  // Visible markers per day (highlights real changes at a glance)
  if (data.length <= 31) {
    data.forEach((d, i) => {
      const [cx, cy] = pricePoints[i];
      const isMinPt = hasRealVariation && Number(d.price) <= realMin;
      const pt = document.createElementNS(ns, 'circle');
      pt.setAttribute('cx', cx.toFixed(1));
      pt.setAttribute('cy', cy.toFixed(1));
      pt.setAttribute('r', isMinPt ? '4' : '3');
      pt.setAttribute('fill', isMinPt ? 'var(--emerald)' : 'var(--accent)');
      pt.setAttribute('stroke', 'var(--bg-surface)');
      pt.setAttribute('stroke-width', '1.5');
      svg.appendChild(pt);
    });
  }

  // Direct value labels on first and last points when price changed (immediately readable on mobile/desktop)
  if (hasRealVariation && data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    const [fx, fy] = pricePoints[0];
    const [lx, ly] = pricePoints[pricePoints.length - 1];

    const addValTag = (x, y, text, anchor, color, above) => {
      const ty = above ? Math.max(pad.top + 11, y - 9) : Math.min(pad.top + plotH - 4, y + 15);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x.toFixed(1));
      t.setAttribute('y', ty.toFixed(1));
      t.setAttribute('text-anchor', anchor);
      t.setAttribute('fill', color);
      t.setAttribute('font-size', '10.5');
      t.setAttribute('font-weight', '700');
      t.setAttribute('font-family', 'var(--font-mono)');
      t.textContent = text;
      svg.appendChild(t);
    };

    const lastLower = Number(last.price) < Number(first.price);
    addValTag(fx + 4, fy, formatPen(first.price), 'start', 'var(--ink-secondary)', lastLower);
    addValTag(
      lx - 4,
      ly,
      formatPen(last.price),
      'end',
      lastLower ? 'var(--emerald)' : 'var(--accent)',
      !lastLower
    );
  }

  if (!hasRealVariation) {
    const flatTxt = document.createElementNS(ns, 'text');
    flatTxt.setAttribute('x', pad.left + plotW / 2);
    flatTxt.setAttribute('y', pad.top + 16);
    flatTxt.setAttribute('text-anchor', 'middle');
    flatTxt.setAttribute('fill', 'var(--ink-muted)');
    flatTxt.setAttribute('font-size', '10.5');
    flatTxt.setAttribute('font-family', 'var(--font-mono)');
    flatTxt.textContent = `Sin variación de precio en ${data.length} días registrados`;
    svg.appendChild(flatTxt);
  }

  // X-axis labels (show every date when <= 6 days so drop day is never hidden)
  const xLabelIndices =
    data.length <= 6
      ? data.map((_, i) => i)
      : [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];
  for (const idx of xLabelIndices) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', xAt(idx));
    t.setAttribute('y', H - 8);
    t.setAttribute('text-anchor', idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle');
    t.setAttribute('fill', 'var(--ink-muted)');
    t.setAttribute('font-size', '10');
    t.setAttribute('font-family', 'var(--font-mono)');
    t.textContent = data[idx].date;
    svg.appendChild(t);
  }

  // Interactive hover & touch crosshair + tooltip
  const hoverLine = document.createElementNS(ns, 'line');
  hoverLine.setAttribute('y1', pad.top);
  hoverLine.setAttribute('y2', pad.top + plotH);
  hoverLine.setAttribute('stroke', 'var(--border-strong)');
  hoverLine.setAttribute('stroke-width', '1');
  hoverLine.style.display = 'none';
  svg.appendChild(hoverLine);

  const hoverDot = document.createElementNS(ns, 'circle');
  hoverDot.setAttribute('r', '5');
  hoverDot.setAttribute('fill', 'var(--accent)');
  hoverDot.setAttribute('stroke', 'var(--bg-surface)');
  hoverDot.setAttribute('stroke-width', '2');
  hoverDot.style.display = 'none';
  svg.appendChild(hoverDot);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip mono';
  tooltip.hidden = true;
  container.appendChild(svg);
  container.appendChild(tooltip);

  const overlay = document.createElementNS(ns, 'rect');
  overlay.setAttribute('x', pad.left);
  overlay.setAttribute('y', pad.top);
  overlay.setAttribute('width', plotW);
  overlay.setAttribute('height', plotH);
  overlay.setAttribute('fill', 'transparent');
  overlay.style.cursor = 'crosshair';
  svg.appendChild(overlay);

  const showTooltipAtClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const frac = Math.max(0, Math.min(1, (relX - pad.left) / plotW));
    const idx = Math.round(frac * (data.length - 1));
    const d = data[idx];
    const cx = xAt(idx);
    const cy = yAt(d.price);

    hoverLine.setAttribute('x1', cx);
    hoverLine.setAttribute('x2', cx);
    hoverLine.style.display = '';

    hoverDot.setAttribute('cx', cx);
    hoverDot.setAttribute('cy', cy);
    hoverDot.style.display = '';

    tooltip.hidden = false;
    tooltip.innerHTML = `
      <div><strong>${d.date}</strong></div>
      <div>Internet: <strong>${formatPen(d.price)}</strong></div>
      ${d.cardPrice ? `<div>Tarjeta: ${formatPen(d.cardPrice)}</div>` : ''}
      ${d.listPrice > d.price ? `<div>Lista: ${formatPen(d.listPrice)}</div>` : ''}
    `;

    const leftPx = (cx / W) * rect.width;
    const tipWidth = tooltip.offsetWidth || 150;
    const clampedLeft = Math.min(rect.width - tipWidth - 8, Math.max(8, leftPx - tipWidth / 2));
    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.top = '8px';
  };

  overlay.addEventListener('mousemove', (e) => showTooltipAtClientX(e.clientX));
  overlay.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches?.[0]) showTooltipAtClientX(e.touches[0].clientX);
    },
    { passive: true }
  );
  overlay.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches?.[0]) showTooltipAtClientX(e.touches[0].clientX);
    },
    { passive: true }
  );

  overlay.addEventListener('mouseleave', () => {
    hoverLine.style.display = 'none';
    hoverDot.style.display = 'none';
    tooltip.hidden = true;
  });
}
