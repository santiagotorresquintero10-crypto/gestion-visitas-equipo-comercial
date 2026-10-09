// Vista Visitas: lo que hay que hacer y lo que ya se hizo, en lista simple.
// "Por hacer" agrupa en curso → vencidas → con pendientes → por día; "Realizadas" va de la más reciente a la más antigua.
// Cada fila tiene UNA acción clara (Iniciar, Continuar, Completar o Ver).
import { esc, icono, chapeta, badgeEstado, estadoVacio, esqueleto } from "../ui.js";
import { ESTADOS_VISITA, TIPO_VISITA, tipoDeVisita } from "../constants.js";
import {
  listarVisitas, ordenarVisitas, estadoVisible, puedeRegistrar, visitaEnCurso, sinResultado, textoDuracion,
} from "../services/visitas-service.js";
import { listarUsuarios } from "../services/users-service.js";
import { normalizarTexto } from "../services/excel-clientes.js";
import { mensajeError } from "../services/auth-service.js";
import { abrirVisita } from "../components/visita-detalle.js";
import { hoyISO, rangoPeriodo, sumarDias, formatearHora, formatearFecha, etiquetaDia } from "../utils/fechas.js";
import { irANuevaVisita } from "../utils/navegacion.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const { FINALIZADA, PENDIENTE } = ESTADOS_VISITA;
const VISTAS = [["hacer", "Por hacer"], ["hechas", "Realizadas"], ["todas", "Todas"]];
const PERIODOS = [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["todas", "Todo"]];
const DIAS_VENCIDAS = 60; // las vencidas recientes siempre aparecen en "Por hacer", aunque sean de otro periodo

const filtro = { vista: "hacer", periodo: "mes", fecha: "", coordinador: "", zona: "", texto: "" };
let responsables = null;
let visitas = [];

export async function render(cont, ctx) {
  if (ctx.esAdmin && !responsables) responsables = (await listarUsuarios().catch(() => [])).filter((u) => u.activo);
  renderLista(cont, ctx);
}


function renderLista(cont, ctx) {
  const extras = [filtro.fecha, filtro.coordinador, filtro.zona].filter(Boolean).length;
  cont.innerHTML = `
    <header class="vista-cabecera visitas-cabecera">
      <div><h1>Visitas</h1>
        <p class="texto-suave">${ctx.esAdmin ? "La ejecución de todo el equipo" : "Lo que tienes por hacer y lo que ya hiciste"}</p></div>
      <div class="segmentos periodo-visitas" role="group" aria-label="Periodo">
        ${PERIODOS.map(([id, t]) => `<button type="button" class="segmento ${filtro.periodo === id && !filtro.fecha ? "activo" : ""}" data-periodo="${id}" aria-pressed="${filtro.periodo === id && !filtro.fecha}">${t}</button>`).join("")}
      </div>
    </header>

    <div class="vistas-visitas" role="tablist" aria-label="Qué ver">
      ${VISTAS.map(([id, t]) => `<button type="button" role="tab" class="vista-tab ${filtro.vista === id ? "activo" : ""}" aria-selected="${filtro.vista === id}" data-vista="${id}"><span>${t}</span><b data-cifra="${id}"></b></button>`).join("")}
    </div>

    <div class="buscar-visitas">
      <label class="filtro filtro-buscar">${icono("search", 18)}
        <input type="search" id="f-texto" placeholder="Buscar por cliente, código o marca" aria-label="Buscar cliente" value="${esc(filtro.texto)}">
      </label>
      <button type="button" class="btn btn-secundario btn-filtros ${extras ? "con-activos" : ""}" id="btn-filtros" aria-expanded="false" aria-controls="panel-filtros">
        ${icono("menu", 18)}<span>Filtros</span>${extras ? `<b>${extras}</b>` : ""}</button>
    </div>
    <div class="panel-filtros" id="panel-filtros" hidden>
      <label class="filtro"><span>Fecha exacta</span><input type="date" id="f-fecha" value="${filtro.fecha}"></label>
      ${ctx.esAdmin ? `
      <label class="filtro"><span>Responsable</span>
        <select id="f-coord"><option value="">Todos</option>
          ${responsables.map((u) => `<option value="${u.uid}" ${filtro.coordinador === u.uid ? "selected" : ""}>${esc(u.nombre)}</option>`).join("")}</select>
      </label>` : ""}
      <label class="filtro"><span>Zona</span><select id="f-zona"><option value="">Todas</option></select></label>
    </div>
    <div class="filtros-activos" id="filtros-activos"></div>

    <section id="lista" aria-live="polite">${esqueleto(5, 72)}</section>`;

  cont.querySelectorAll("[data-vista]").forEach((b) => b.onclick = () => {
    filtro.vista = b.dataset.vista;
    cont.querySelectorAll("[data-vista]").forEach((x) => { x.classList.toggle("activo", x === b); x.setAttribute("aria-selected", x === b); });
    pintar(cont, ctx);
  });
  cont.querySelectorAll("[data-periodo]").forEach((b) => b.onclick = () => { filtro.periodo = b.dataset.periodo; filtro.fecha = ""; renderLista(cont, ctx); });
  const btnF = cont.querySelector("#btn-filtros");
  btnF.onclick = () => {
    const abrir = btnF.getAttribute("aria-expanded") !== "true";
    btnF.setAttribute("aria-expanded", abrir);
    cont.querySelector("#panel-filtros").hidden = !abrir;
  };
  cont.querySelector("#f-fecha").onchange = (e) => { filtro.fecha = e.target.value; renderLista(cont, ctx); };
  cont.querySelector("#f-zona").onchange = (e) => { filtro.zona = e.target.value; renderLista(cont, ctx); };
  const fc = cont.querySelector("#f-coord");
  if (fc) fc.onchange = (e) => { filtro.coordinador = e.target.value; renderLista(cont, ctx); };
  let espera;
  cont.querySelector("#f-texto").oninput = (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtro.texto = e.target.value; pintar(cont, ctx); }, 150);
  };
  pintarActivos(cont, ctx);

  const lista = cont.querySelector("#lista");
  lista.addEventListener("click", (e) => {
    if (e.target.closest("[data-nueva]")) return irANuevaVisita();
    const fila = e.target.closest("[data-id]");
    if (!fila) return;
    const accion = fila.dataset.accion === "continuar" ? "resultado" : null;
    abrirVisita(cont, ctx, fila.dataset.id, { onVolver: () => renderLista(cont, ctx), textoVolver: "Volver a visitas", accion });
  });
  lista.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-id]")) e.target.click(); });

  cargar(cont, ctx);
}

// Chips con los filtros aplicados (se quitan con un toque).
function pintarActivos(cont, ctx) {
  const caja = cont.querySelector("#filtros-activos");
  const chips = [];
  if (filtro.fecha) chips.push(["fecha", `Fecha: ${formatearFecha(filtro.fecha, { day: "numeric", month: "short" })}`]);
  if (filtro.coordinador) chips.push(["coordinador", `Responsable: ${responsables?.find((u) => u.uid === filtro.coordinador)?.nombre || ""}`]);
  if (filtro.zona) chips.push(["zona", `Zona: ${filtro.zona}`]);
  caja.innerHTML = chips.map(([k, t]) => `<button type="button" class="filtro-chip" data-quitar="${k}">${esc(t)}${icono("close", 14)}</button>`).join("");
  caja.hidden = !chips.length;
  caja.querySelectorAll("[data-quitar]").forEach((b) => b.onclick = () => { filtro[b.dataset.quitar] = ""; renderLista(cont, ctx); });
}

async function cargar(cont, ctx) {
  const hoy = hoyISO();
  const rango = filtro.fecha ? { desde: filtro.fecha, hasta: filtro.fecha } : rangoPeriodo(filtro.periodo);
  // Se traen también las vencidas recientes para no perderlas al cambiar de periodo.
  const desde = filtro.fecha || !rango.desde ? rango.desde : [rango.desde, sumarDias(hoy, -DIAS_VENCIDAS)].sort()[0];
  try {
    const todas = await listarVisitas(ctx, { desde, hasta: rango.hasta });
    const dentro = (v) => (!rango.desde || v.fechaProgramada >= rango.desde) && (!rango.hasta || v.fechaProgramada <= rango.hasta);
    visitas = todas.filter((v) => dentro(v) || (!filtro.fecha && sinResultado(v) && v.fechaProgramada < hoy));
    const zonas = [...new Set(visitas.map((v) => v.zona).filter(Boolean))].sort();
    const sel = cont.querySelector("#f-zona");
    if (!sel) return;
    if (filtro.zona && !zonas.includes(filtro.zona)) zonas.push(filtro.zona);
    sel.innerHTML = `<option value="">Todas</option>` + zonas.map((z) => `<option ${z === filtro.zona ? "selected" : ""}>${esc(z)}</option>`).join("");
    pintar(cont, ctx);
  } catch (err) {
    console.error(err);
    const l = cont.querySelector("#lista");
    if (l) l.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
  }
}

// Acción única de cada visita.
function accionDe(v, ctx) {
  const propia = ctx.esAdmin || v.coordinadorUid === ctx.perfil.uid;
  if (propia && visitaEnCurso(v)) return { id: "continuar", texto: "Continuar", clase: "accion-fuerte" };
  if (propia && v.estado === PENDIENTE) return { id: "completar", texto: "Completar", clase: "accion-media" };
  if (propia && puedeRegistrar(v)) return { id: "iniciar", texto: "Iniciar", clase: "accion-media" };
  return { id: "ver", texto: "Ver", clase: "accion-suave" };
}

const horaPartida = (hhmm) => {
  const [hora, sufijo] = formatearHora(hhmm).split(" ").reduce((a, p, i) => (i === 0 ? [p, ""] : [a[0], `${a[1]} ${p}`.trim()]), ["", ""]);
  return `<strong>${esc(hora)}</strong><span>${esc(sufijo)}</span>`;
};

function fila(v, ctx, hoy) {
  const enCurso = visitaEnCurso(v);
  const estado = estadoVisible(v, hoy);
  const a = accionDe(v, ctx);
  const r = v.resultado;
  const tipo = TIPO_VISITA[tipoDeVisita(v)];
  const detalle = [
    expendioSecundario(v),
    (v.marcas || []).slice(0, 2).join(", ") + ((v.marcas || []).length > 2 ? ` +${v.marcas.length - 2}` : ""),
    v.zona,
    ctx.esAdmin ? v.coordinadorNombre : "",
  ].filter(Boolean);
  const extras = r ? [
    r.duracionMin != null ? `${icono("clock", 14)}${esc(textoDuracion(r.duracionMin))}` : "",
    r.ubicacion ? `${icono("pin", 14)}Ubicación` : "",
    r.tieneFoto ? `${icono("camera", 14)}Evidencia` : "",
  ].filter(Boolean) : [];
  return `
    <li class="vfila vf-${enCurso ? "en-curso" : estado.toLowerCase()}" data-id="${v.id}" data-accion="${a.id}" tabindex="0" role="button"
      aria-label="${esc(`${nombreCliente(v)}, ${formatearHora(v.horaProgramada)}. ${a.texto}`)}">
      <div class="vfila-hora">${horaPartida(v.horaProgramada)}</div>
      <div class="vfila-cuerpo">
        <strong class="vfila-nombre">${esc(nombreCliente(v))}</strong>
        <span class="vfila-datos">${chapeta(v.codigo)}<span class="vfila-tipo">${esc(tipo.texto)}</span>${detalle.length ? `<span>${esc(detalle.join(" · "))}</span>` : ""}</span>
        ${extras.length ? `<span class="vfila-extras">${extras.join("")}</span>` : ""}
      </div>
      <div class="vfila-estado">${enCurso ? `<span class="chip en-curso-chip"><i aria-hidden="true"></i>En curso</span>` : badgeEstado(estado)}</div>
      <span class="vfila-accion ${a.clase}">${esc(a.texto)}${icono("next", 16)}</span>
    </li>`;
}

function grupo(titulo, items, ctx, hoy, { clase = "", nota = "" } = {}) {
  if (!items.length) return "";
  return `
    <section class="vgrupo ${clase}">
      <h2 class="vgrupo-titulo"><span>${titulo}</span><small>${nota || `${items.length} visita${items.length === 1 ? "" : "s"}`}</small></h2>
      <ul class="vlista">${items.map((v) => fila(v, ctx, hoy)).join("")}</ul>
    </section>`;
}

const porDia = (lista, ctx, hoy, opciones = {}) => {
  const grupos = new Map();
  lista.forEach((v) => grupos.set(v.fechaProgramada, [...(grupos.get(v.fechaProgramada) || []), v]));
  return [...grupos.entries()].map(([f, items]) =>
    grupo(esc(etiquetaDia(f).replace(/^./, (c) => c.toUpperCase())), items, ctx, hoy, { clase: f === hoy ? "es-hoy" : "", ...opciones })).join("");
};

function pintar(cont, ctx) {
  const destino = cont.querySelector("#lista");
  if (!destino) return;
  const hoy = hoyISO();
  const terminos = normalizarTexto(filtro.texto).split(" ").filter(Boolean);
  const base = visitas.filter((v) =>
    (!filtro.coordinador || v.coordinadorUid === filtro.coordinador) &&
    (!filtro.zona || v.zona === filtro.zona) &&
    (!terminos.length || terminos.every((t) => normalizarTexto([v.codigo, nombreCliente(v), v.expendio, v.razonSocial, ...(v.marcas || [])].join(" ")).includes(t))));
  const porHacer = base.filter((v) => !(v.estado === FINALIZADA));
  const hechas = base.filter((v) => v.estado === FINALIZADA);
  const cifras = { hacer: porHacer.length, hechas: hechas.length, todas: base.length };
  cont.querySelectorAll("[data-cifra]").forEach((c) => { c.textContent = cifras[c.dataset.cifra]; });

  let html = "";
  if (filtro.vista === "hacer") {
    const asc = ordenarVisitas(porHacer);
    const enCurso = asc.filter(visitaEnCurso);
    const vencidas = asc.filter((v) => !visitaEnCurso(v) && sinResultado(v) && v.fechaProgramada < hoy);
    const pendientes = asc.filter((v) => v.estado === PENDIENTE);
    const proximas = asc.filter((v) => !enCurso.includes(v) && !vencidas.includes(v) && !pendientes.includes(v));
    html = grupo("En curso", enCurso, ctx, hoy, { clase: "g-en-curso", nota: "Termina lo que empezaste" })
      + grupo("Vencidas", vencidas, ctx, hoy, { clase: "g-vencidas", nota: `${vencidas.length} sin resultado` })
      + grupo("Con pendientes", pendientes, ctx, hoy, { clase: "g-pendientes", nota: "Quedaron compromisos" })
      + porDia(proximas, ctx, hoy);
    if (!html) html = vacio("¡Todo al día!", "No tienes visitas por hacer en este periodo.", true);
  } else if (filtro.vista === "hechas") {
    html = porDia(ordenarVisitas(hechas, true), ctx, hoy) || vacio("Aún no hay visitas finalizadas", "Cuando finalices una visita aparecerá aquí.");
  } else {
    const asc = ordenarVisitas(base);
    html = porDia(asc.filter((v) => v.fechaProgramada === hoy), ctx, hoy)
      + (asc.some((v) => v.fechaProgramada > hoy) ? `<p class="vseparador">Próximas</p>${porDia(asc.filter((v) => v.fechaProgramada > hoy), ctx, hoy)}` : "")
      + (asc.some((v) => v.fechaProgramada < hoy) ? `<p class="vseparador">Anteriores</p>${porDia(ordenarVisitas(asc.filter((v) => v.fechaProgramada < hoy), true), ctx, hoy)}` : "");
    if (!html) html = vacio("No hay visitas con estos filtros", "Prueba con otro periodo o búsqueda.", true);
  }
  destino.innerHTML = html;
}

function vacio(titulo, texto, conAccion = false) {
  return `<div class="panel">${estadoVacio({
    icono: "check", titulo, texto,
    accion: conAccion ? `<button type="button" class="btn btn-primario" data-nueva>${icono("plus", 18)}Programar visita</button>` : "",
  })}</div>`;
}
