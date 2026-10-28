// Gráficos sencillos en HTML/CSS (sin librerías). Cada marca lleva data-tip para el tooltip;
// siempre hay leyenda cuando hay más de una serie, y los valores también están en la tabla del dashboard.
import { esc } from "../ui.js";

const fmt = (n) => Number(n || 0).toLocaleString("es-CO");

export function leyenda(series) {
  return `<ul class="leyenda">${series.map((s) =>
    `<li><span class="leyenda-muestra" style="background:${s.color}"></span>${esc(s.nombre)}</li>`).join("")}</ul>`;
}

function tipSegmentos(titulo, valores, series, total) {
  const filas = series.filter((s) => valores[s.clave]).map((s) => `${s.nombre}: ${fmt(valores[s.clave])}`);
  return `${titulo}: ${fmt(total)} en total${filas.length ? "\n" + filas.join("\n") : ""}`;
}

// Barras horizontales apiladas: una fila por categoría (ej. responsable), segmentos por serie.
export function barrasApiladas(filas, series) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  if (!filas.length) return `<p class="vacio">Sin datos en este periodo.</p>`;
  return `
    ${leyenda(series)}
    <div class="barras">${filas.map((f) => `
      <div class="barra-fila" data-tip="${esc(tipSegmentos(f.etiqueta, f.valores, series, f.total))}">
        <span class="barra-etiqueta">${esc(f.etiqueta)}</span>
        <span class="barra-pista">
          <span class="barra-relleno" style="width:${(f.total / max) * 100}%">
            ${series.filter((s) => f.valores[s.clave]).map((s) =>
              `<span class="segmento-barra" style="flex:${f.valores[s.clave]};background:${s.color}"></span>`).join("")}
          </span>
          <span class="barra-valor">${fmt(f.total)}</span>
        </span>
      </div>`).join("")}
    </div>`;
}

// Barras horizontales simples (una serie por fila, cada una con su color): distribución por estado.
export function barrasSimples(filas, total) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  if (!total) return `<p class="vacio">Sin datos en este periodo.</p>`;
  return `<div class="barras">${filas.map((f) => {
    const pct = total ? Math.round((f.valor / total) * 100) : 0;
    return `
      <div class="barra-fila" data-tip="${esc(`${f.etiqueta}: ${fmt(f.valor)} (${pct} %)`)}">
        <span class="barra-etiqueta"><span class="leyenda-muestra" style="background:${f.color}"></span>${esc(f.etiqueta)}</span>
        <span class="barra-pista">
          <span class="barra-relleno" style="width:${(f.valor / max) * 100}%"><span class="segmento-barra" style="flex:1;background:${f.color}"></span></span>
          <span class="barra-valor">${fmt(f.valor)} <span class="texto-suave">· ${pct} %</span></span>
        </span>
      </div>`;
  }).join("")}</div>`;
}

// Columnas verticales apiladas: una columna por periodo (ej. semana).
export function columnasApiladas(columnas, series, { resaltar = null } = {}) {
  const max = Math.max(1, ...columnas.map((c) => c.total));
  const tope = escalaLimpia(max);
  return `
    ${leyenda(series)}
    <div class="columnas" style="--n:${columnas.length}">
      <div class="columnas-eje"><span>${fmt(tope)}</span><span>${fmt(tope / 2)}</span><span>0</span></div>
      <div class="columnas-area">
        <div class="columnas-grilla"><span></span><span></span><span></span></div>
        ${columnas.map((c) => `
          <div class="columna ${c.clave === resaltar ? "columna-actual" : ""}" data-tip="${esc(tipSegmentos(c.titulo || c.etiqueta, c.valores, series, c.total))}">
            <span class="columna-valor">${c.total ? fmt(c.total) : ""}</span>
            <span class="columna-pila" style="height:${(c.total / tope) * 100}%">
              ${[...series].reverse().filter((s) => c.valores[s.clave]).map((s) =>
                `<span class="segmento-columna" style="flex:${c.valores[s.clave]};background:${s.color}"></span>`).join("")}
            </span>
          </div>`).join("")}
      </div>
      <div class="columnas-etiquetas">${columnas.map((c) => `<span>${esc(c.etiqueta)}</span>`).join("")}</div>
    </div>`;
}

// Columnas agrupadas (dos series lado a lado por periodo), un solo eje.
export function columnasAgrupadas(columnas, series) {
  const max = Math.max(1, ...columnas.flatMap((c) => series.map((s) => c.valores[s.clave] || 0)));
  const tope = escalaLimpia(max);
  return `
    ${leyenda(series)}
    <div class="columnas" style="--n:${columnas.length}">
      <div class="columnas-eje"><span>${fmt(tope)}</span><span>${fmt(tope / 2)}</span><span>0</span></div>
      <div class="columnas-area">
        <div class="columnas-grilla"><span></span><span></span><span></span></div>
        ${columnas.map((c) => `
          <div class="columna columna-grupo" data-tip="${esc(`${c.titulo || c.etiqueta}\n${series.map((s) => `${s.nombre}: ${fmt(c.valores[s.clave])}`).join("\n")}${c.nota ? "\n" + c.nota : ""}`)}">
            ${series.map((s) => `
              <span class="columna-sub">
                <span class="columna-valor">${c.valores[s.clave] ? fmt(c.valores[s.clave]) : ""}</span>
                <span class="columna-pila" style="height:${((c.valores[s.clave] || 0) / tope) * 100}%"><span class="segmento-columna" style="flex:1;background:${s.color}"></span></span>
              </span>`).join("")}
          </div>`).join("")}
      </div>
      <div class="columnas-etiquetas">${columnas.map((c) => `<span>${esc(c.etiqueta)}</span>`).join("")}</div>
    </div>`;
}

// Columnas de una sola serie (sin leyenda: el título del panel dice qué se grafica).
// valor null = mes sin dato. `referencia` dibuja una línea horizontal (ej. el promedio).
export function columnasSimples(columnas, { color, referencia = null, etiquetaReferencia = "", unidad = "" } = {}) {
  const max = Math.max(1, ...columnas.map((c) => c.valor || 0), referencia || 0);
  const tope = escalaLimpia(max);
  return `
    ${referencia != null ? `<ul class="leyenda"><li><span class="leyenda-linea"></span>${esc(etiquetaReferencia)}</li></ul>` : ""}
    <div class="columnas" style="--n:${columnas.length}">
      <div class="columnas-eje"><span>${fmt(tope)}</span><span>${fmt(tope / 2)}</span><span>0</span></div>
      <div class="columnas-area">
        <div class="columnas-grilla"><span></span><span></span><span></span></div>
        ${referencia != null ? `<div class="linea-referencia" style="bottom:${(referencia / tope) * 100}%"></div>` : ""}
        ${columnas.map((c) => `
          <div class="columna" data-tip="${esc(`${c.titulo || c.etiqueta}: ${c.valor == null ? "sin dato" : `${fmt(c.valor)}${unidad ? " " + unidad : ""}`}`)}">
            <span class="columna-valor">${c.valor == null ? '<span class="texto-suave">s/d</span>' : fmt(c.valor)}</span>
            ${c.valor == null ? "" : `<span class="columna-pila" style="height:${(c.valor / tope) * 100}%"><span class="segmento-columna" style="flex:1;background:${color}"></span></span>`}
          </div>`).join("")}
      </div>
      <div class="columnas-etiquetas">${columnas.map((c) => `<span>${esc(c.etiqueta)}</span>`).join("")}</div>
    </div>`;
}

// Redondea el máximo del eje a un número limpio y par (2, 4, 6, 8, 10, 20, 40…) para que la marca media sea entera.
function escalaLimpia(max) {
  const pot = 10 ** Math.floor(Math.log10(max));
  return [2, 4, 6, 8, 10].find((m) => m * pot >= max) * pot;
}

// Tooltip único para todos los gráficos de un contenedor (ratón y toque).
export function activarTooltips(cont) {
  let tip = document.getElementById("tooltip-grafico");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tooltip-grafico";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  const mostrar = (e) => {
    const marca = e.target.closest("[data-tip]");
    if (!marca || !cont.contains(marca)) return ocultar();
    tip.textContent = marca.dataset.tip;
    tip.classList.add("visible");
    const r = marca.getBoundingClientRect();
    const x = Math.min(Math.max(8, (e.clientX ?? r.left + r.width / 2) - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8);
    const y = (e.clientY ?? r.top) - tip.offsetHeight - 14;
    tip.style.transform = `translate(${x}px, ${Math.max(8, y)}px)`;
  };
  const ocultar = () => tip.classList.remove("visible");
  cont.addEventListener("pointermove", mostrar);
  cont.addEventListener("pointerdown", mostrar);
  cont.addEventListener("pointerleave", ocultar);
  window.addEventListener("scroll", ocultar, { passive: true, once: true });
}
