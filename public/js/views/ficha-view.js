// Sección "Ficha de cliente": se busca por código y se abre toda la información del cliente.
// Si lo escrito tiene letras, también muestra coincidencias por marca o expendio, separadas.
import { esc, icono, chapeta, resaltar, estadoVacio, esqueleto, curvasNivel } from "../ui.js";
import { obtenerClientes, buscarEn } from "../services/clientes-service.js";
import { normalizarTexto } from "../services/excel-clientes.js";
import { mensajeError } from "../services/auth-service.js";
import { abrirFicha } from "../components/ficha-cliente.js";
import { tomarFichaPendiente } from "../utils/navegacion.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const MAX_CODIGOS = 8;
const MAX_OTROS = 6;
const MAX_RECIENTES = 6;
const CLAVE_RECIENTES = "cv-fichas-recientes";

let ultimoTexto = "";

const digitos = (t) => String(t ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");

function leerRecientes() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || "[]"); } catch { return []; }
}
function guardarReciente(id) {
  try {
    const lista = [id, ...leerRecientes().filter((x) => x !== id)].slice(0, MAX_RECIENTES);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch { /* sin almacenamiento local: no pasa nada */ }
}

export async function render(cont, ctx) {
  const pendiente = tomarFichaPendiente();
  if (pendiente) return mostrarFicha(cont, ctx, pendiente);
  renderBusqueda(cont, ctx);
}

function mostrarFicha(cont, ctx, id) {
  guardarReciente(id);
  abrirFicha(cont, ctx, id, {
    textoVolver: "Buscar otro cliente",
    onVolver: () => renderBusqueda(cont, ctx),
  });
}

async function renderBusqueda(cont, ctx) {
  window.scrollTo(0, 0);
  cont.innerHTML = `
    <section class="ficha-buscar">
      ${curvasNivel(86, 40)}
      <div class="ficha-buscar-texto">
        <span class="eyebrow">Ficha de cliente</span>
        <h1>¿Qué cliente quieres consultar?</h1>
        <p>Escribe el código y verás datos comerciales, contacto, beneficio, ubicación e historial de visitas.</p>
      </div>
      <form class="ficha-buscar-campo" id="form-ficha" autocomplete="off">
        ${icono("search", 24)}
        <input type="search" id="input-codigo" placeholder="Código del cliente, ej.: 3 o COD-0003" aria-label="Código del cliente"
          enterkeyhint="search" value="${esc(ultimoTexto)}">
        <button type="submit" class="btn btn-primario">Abrir ficha</button>
      </form>
    </section>
    <div id="ficha-resultados" class="ficha-resultados" aria-live="polite">${esqueleto(2, 88)}</div>`;

  const input = cont.querySelector("#input-codigo");
  const destino = cont.querySelector("#ficha-resultados");
  let lista;
  try {
    lista = await obtenerClientes();
  } catch (err) {
    destino.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!lista.length) {
    destino.innerHTML = `<div class="panel">${estadoVacio({ icono: "database", titulo: "La base de clientes está vacía", texto: "El administrador debe importar el Excel de clientes." })}</div>`;
    return;
  }

  let exacto = null;
  const pintar = () => {
    ultimoTexto = input.value;
    const r = buscar(lista, input.value);
    exacto = r.exacto;
    destino.innerHTML = r.vacio ? recientes(lista) : resultados(r, input.value);
  };

  let espera;
  input.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(pintar, 100); });
  cont.querySelector("#form-ficha").addEventListener("submit", (e) => {
    e.preventDefault();
    pintar();
    if (exacto) mostrarFicha(cont, ctx, exacto.id);
    else input.focus();
  });
  destino.addEventListener("click", (e) => {
    const item = e.target.closest("[data-cliente]");
    if (item) mostrarFicha(cont, ctx, item.dataset.cliente);
  });
  pintar();
  if (matchMedia("(min-width: 961px)").matches) input.focus();
}

// Código exacto primero; luego códigos que empiezan por los números escritos; luego marca o nombre.
function buscar(lista, texto) {
  const t = texto.trim();
  if (!t) return { vacio: true };
  const num = digitos(t);
  const normal = normalizarTexto(t);
  const conLetras = /[a-z]/i.test(t.replace(/^\s*cod\b[-\s]*/i, ""));
  let porCodigo = [];
  let exacto = null;
  if (num) {
    exacto = lista.find((c) => digitos(c.codigo) === num && (!conLetras || normalizarTexto(c.codigo) === normal)) || null;
    porCodigo = lista.filter((c) => c !== exacto && digitos(c.codigo).startsWith(num)).slice(0, MAX_CODIGOS);
  }
  if (!exacto) exacto = lista.find((c) => normalizarTexto(c.codigo) === normal) || null;
  const ya = new Set([exacto, ...porCodigo].filter(Boolean).map((c) => c.id));
  const otros = conLetras || !num
    ? buscarEn(lista, t, { max: MAX_OTROS + ya.size, incluirInactivos: true }).filter((c) => !ya.has(c.id)).slice(0, MAX_OTROS)
    : [];
  return { exacto, porCodigo, otros };
}

function resultados({ exacto, porCodigo, otros }, texto) {
  if (!exacto && !porCodigo.length && !otros.length) {
    return `<div class="panel">${estadoVacio({ icono: "search", titulo: `No hay clientes con «${texto.trim()}»`, texto: "Revisa el código. También puedes escribir la marca o el nombre del expendio." })}</div>`;
  }
  const terminos = normalizarTexto(texto).split(" ").filter(Boolean);
  return `
    ${exacto ? `<h2 class="ficha-grupo">Código exacto</h2>${tarjeta(exacto, terminos, true)}` : ""}
    ${porCodigo.length ? `<h2 class="ficha-grupo">${exacto ? "Otros códigos parecidos" : "Códigos que empiezan así"}</h2>
      <div class="ficha-lista">${porCodigo.map((c) => tarjeta(c, terminos)).join("")}</div>` : ""}
    ${otros.length ? `<h2 class="ficha-grupo">Por marca o nombre</h2>
      <div class="ficha-lista">${otros.map((c) => tarjeta(c, terminos)).join("")}</div>` : ""}`;
}

function recientes(lista) {
  const porId = new Map(lista.map((c) => [c.id, c]));
  const items = leerRecientes().map((id) => porId.get(id)).filter(Boolean);
  if (!items.length) {
    return `<p class="buscador-ayuda">Puedes escribir solo el número: <em>3</em> abre <em>COD-0003</em>. Presiona Enter para abrir la ficha.</p>`;
  }
  return `<h2 class="ficha-grupo">Consultados recientemente</h2>
    <div class="ficha-lista">${items.map((c) => tarjeta(c, [])).join("")}</div>`;
}

function tarjeta(c, terminos, destacado = false) {
  const marcas = (c.marcas || []).map((m) => m.marca).filter(Boolean);
  const lugar = [c.marcas?.[0]?.barrio, c.ciudad || c.marcas?.[0]?.ciudad].filter(Boolean).join(", ");
  return `
    <button type="button" class="ficha-item ${destacado ? "destacado" : ""}" data-cliente="${esc(c.id)}">
      <span class="ficha-item-cabeza">${chapeta(c.codigo)}${marcas.length ? `<span class="resultado-marca">${marcas.slice(0, 3).map((m) => resaltar(m, terminos)).join(", ")}${marcas.length > 3 ? ` +${marcas.length - 3}` : ""}</span>` : ""}
        ${c.activo === false ? `<span class="chip chip-off">Inactivo</span>` : ""}</span>
      <strong class="ficha-item-nombre">${resaltar(nombreCliente(c) || "Sin nombre", terminos)}</strong>
      ${expendioSecundario(c) ? `<span class="ficha-item-expendio">${resaltar(expendioSecundario(c), terminos)}</span>` : ""}
      ${lugar ? `<span class="ficha-item-meta">${icono("pin", 15)}${esc(lugar)}</span>` : ""}
      <span class="ficha-item-ir">${destacado ? "Abrir ficha" : ""}${icono("next", 18)}</span>
    </button>`;
}
