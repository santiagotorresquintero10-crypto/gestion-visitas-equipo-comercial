// Componentes de interfaz reutilizables. Toda pieza visual repetida (iconos, estados, chapeta, vacíos, cargas,
// confirmaciones) sale de aquí para que todas las vistas se vean como el mismo producto.
import { ESTADO_LABEL } from "./constants.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Iconos: una sola familia de trazo (1,75 px, puntas redondas) ----------
const ICONOS = {
  carpa: '<path d="M3 20 12 4l9 16z"/><path d="M12 4v16M9 20l3-5 3 5"/>',
  granero: '<path d="M3 10l9-6 9 6v10H3z"/><path d="M9 20v-6h6v6M9 14l6 6M15 14l-6 6"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  knife: '<path d="M3 21 15.5 8.5a3 3 0 0 0 0-4.2L14 3 3 14z"/><path d="m14 10 7 7-2 2-7-7"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  map: '<path d="M14.1 6.3 9.9 4.1a2 2 0 0 0-1.8 0L3.6 6.4A1 1 0 0 0 3 7.3v12.1a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.2a2 2 0 0 0 1.8 0l4.5-2.3a1 1 0 0 0 .6-.9V4.6a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0z"/><path d="M15 6.8v14M9 3.2v14"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 3.1a4 4 0 0 1 0 7.8M22 21c0-3.2-2-5.9-5-6.7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  ok: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repeat: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13.5V21h14v-7.5M10 21v-5h4v5"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  up: '<path d="m5 12 7-7 7 7M12 19V5"/>',
  down: '<path d="m19 12-7 7-7-7M12 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
};

export function icono(nombre, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ""}</svg>`;
}

// ---------- Estados de visita: color suave + icono + nombre, nunca solo color ----------
const ICONO_ESTADO = { PROGRAMADA: "calendar", FINALIZADA: "ok", PENDIENTE: "clock", REPROGRAMADA: "repeat", VENCIDA: "alert" };

export function badgeEstado(estado) {
  return `<span class="chip chip-estado estado-${String(estado).toLowerCase()}">${icono(ICONO_ESTADO[estado] || "info", 14)}${esc(ESTADO_LABEL[estado] || estado)}</span>`;
}

// ---------- Chapeta: el código del cliente con forma de placa de oreja ----------
export function chapeta(codigo) {
  // Sin código = prospecto (posible cliente que aún no está en la base).
  if (!String(codigo ?? "").trim()) return `<span class="chapeta chapeta-prospecto">Prospecto</span>`;
  return `<span class="chapeta">${esc(codigo)}</span>`;
}

// Resalta (con <mark>) las palabras buscadas dentro de un texto, sin importar tildes ni mayúsculas.
export function resaltar(texto, terminos = []) {
  const original = String(texto ?? "");
  const plano = original.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (plano.length !== original.length) return esc(original); // caracteres compuestos: no arriesgar posiciones
  const marcas = new Array(original.length).fill(false);
  for (const t of terminos.filter(Boolean)) {
    let i = plano.indexOf(t);
    while (i >= 0) { marcas.fill(true, i, i + t.length); i = plano.indexOf(t, i + t.length); }
  }
  let html = "", abierto = false;
  for (let i = 0; i < original.length; i++) {
    if (marcas[i] && !abierto) { html += "<mark>"; abierto = true; }
    if (!marcas[i] && abierto) { html += "</mark>"; abierto = false; }
    html += esc(original[i]);
  }
  return abierto ? html + "</mark>" : html;
}

// ---------- Estados vacíos y de carga ----------
export function estadoVacio({ icono: ic = "info", titulo, texto = "", accion = "" }) {
  return `
    <div class="vacio-bloque">
      <span class="vacio-icono">${icono(ic, 26)}</span>
      <strong>${esc(titulo)}</strong>
      ${texto ? `<p>${esc(texto)}</p>` : ""}
      ${accion}
    </div>`;
}

// Esqueleto de carga: filas grises que anuncian la forma del contenido mientras responde Firebase.
export function esqueleto(filas = 3, alto = 64) {
  return `<div class="esqueleto" aria-busy="true" aria-label="Cargando">${
    Array.from({ length: filas }, () => `<span style="height:${alto}px"></span>`).join("")}</div>`;
}

// ---------- Avisos breves ----------
export function toast(mensaje, tipo = "info") {
  let cont = $("#toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    cont.setAttribute("role", "status");
    document.body.appendChild(cont);
  }
  cont.replaceChildren(); // un aviso a la vez: en celular no deben tapar la pantalla
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.innerHTML = `${icono(tipo === "error" ? "alert" : tipo === "ok" ? "ok" : "info", 18)}<span></span>`;
  t.querySelector("span").textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.classList.add("salir"), 3800);
  setTimeout(() => t.remove(), 4200);
}

// ---------- Confirmación (reemplaza el confirm() del navegador) ----------
export function confirmar({ titulo, texto = "", aceptar = "Continuar", cancelar = "Cancelar", peligro = false }) {
  return new Promise((resolve) => {
    const capa = document.createElement("div");
    capa.className = "modal-capa";
    capa.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
        <h2 id="modal-titulo">${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ""}
        <div class="modal-acciones">
          <button type="button" class="btn btn-secundario" data-r="0">${esc(cancelar)}</button>
          <button type="button" class="btn ${peligro ? "btn-peligro" : "btn-primario"}" data-r="1">${esc(aceptar)}</button>
        </div>
      </div>`;
    const cerrar = (r) => {
      capa.classList.add("salir");
      document.removeEventListener("keydown", tecla);
      setTimeout(() => capa.remove(), 160);
      resolve(r);
    };
    const tecla = (e) => e.key === "Escape" && cerrar(false);
    capa.addEventListener("click", (e) => {
      if (e.target === capa) return cerrar(false);
      const b = e.target.closest("[data-r]");
      if (b) cerrar(b.dataset.r === "1");
    });
    document.addEventListener("keydown", tecla);
    document.body.appendChild(capa);
    capa.querySelector('[data-r="1"]').focus();
  });
}

export function setCargando(boton, cargando, texto) {
  if (!boton) return;
  if (cargando) {
    boton.dataset.html = boton.innerHTML;
    boton.innerHTML = `<span class="spinner-btn"></span>${esc(texto || "Procesando…")}`;
    boton.disabled = true;
  } else {
    if (boton.dataset.html) boton.innerHTML = boton.dataset.html;
    boton.disabled = false;
  }
}

export function iniciales(nombre) {
  return (nombre || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// Convierte "3136142707 3128669692" en un enlace que llama al primer número válido.
export function telefonoPrincipal(valor) {
  return String(valor || "").split(/[^\d]+/).find((n) => n.length >= 7) || "";
}

export function enlaceTel(celular) {
  const numero = telefonoPrincipal(celular);
  return numero ? `<a href="tel:${numero}">${esc(celular)}</a>` : esc(celular);
}

// Patrón de curvas de nivel (terreno) para fondos de marca.
export function curvasNivel(cx = 78, cy = 72) {
  const anillos = Array.from({ length: 8 }, (_, i) => {
    const rx = 8 + i * 13, ry = 5 + i * 9;
    return `<ellipse cx="${cx - i * 1.2}" cy="${cy - i * 1.4}" rx="${rx}" ry="${ry}" transform="rotate(${-16 + i * 1.6} ${cx} ${cy})"/>`;
  }).join("");
  return `<svg class="curvas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${anillos}</svg>`;
}

// Ruta de pasos (mismo componente del registro de visita), solo informativa.
// pasos: ["Cliente", "Datos de la visita"]; actual: índice del paso en curso.
export function rutaPasos(pasos, actual) {
  return `
    <nav class="ruta ruta-corta" aria-label="Pasos" style="--n:${pasos.length}">
      <ol>${pasos.map((p, i) => `
        <li class="ruta-paso ${i < actual ? "hecho" : i === actual ? "actual" : "pendiente"}">
          <button type="button" disabled ${i === actual ? 'aria-current="step"' : ""}><span class="ruta-num"><span>${i + 1}</span>${icono("ok", 14)}</span><span class="ruta-nombre">${esc(p)}</span></button>
        </li>`).join("")}
      </ol>
    </nav>`;
}
