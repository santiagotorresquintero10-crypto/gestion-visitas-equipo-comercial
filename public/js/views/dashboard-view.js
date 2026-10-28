// Dashboard: estado de la operación del periodo según el rol. Todas las cifras salen de services/indicadores.js.
import { esc, icono, iniciales, chapeta, badgeEstado, estadoVacio, esqueleto, telefonoPrincipal } from "../ui.js";
import { listarVisitas, ordenarVisitas, sinResultado, estadoVisible, puedeRegistrar, visitaEnCurso } from "../services/visitas-service.js";
import {
  SERIES_ESTADO, resumen, filtrarVisitas, porResponsable, porSemana, porMes, lunesDe, formatearPorcentaje,
} from "../services/indicadores.js";
import { mensajeError } from "../services/auth-service.js";
import { abrirVisita } from "../components/visita-detalle.js";
import { columnasApiladas, columnasAgrupadas, activarTooltips } from "../components/graficos.js";
import { irANuevaVisita } from "../utils/navegacion.js";
import { abrirFicha } from "../components/ficha-cliente.js";
import { ESTADOS_VISITA, TIPO_VISITA, tipoDeVisita } from "../constants.js";
import { hoyISO, rangoPeriodo, sumarDias, deISO, aISO, formatearFecha, formatearHora, etiquetaDia } from "../utils/fechas.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const DIAS_VENCIDAS = 180;
const SEMANAS = 8;
const MESES = 6;
const mesActual = () => hoyISO().slice(0, 7);
const filtro = { periodo: "mes", mes: mesActual(), desde: "", hasta: "", coordinador: "", zona: "" };
const n = (x) => Number(x || 0).toLocaleString("es-CO");

export async function render(cont, ctx) {
  if (ctx.esAdmin) return renderAdmin(cont, ctx);
  return renderCoordinador(cont, ctx);
}

// ---------- Periodos ----------

function rangoFiltro() {
  if (filtro.periodo === "mes") {
    const [a, m] = filtro.mes.split("-").map(Number);
    return { desde: aISO(new Date(a, m - 1, 1)), hasta: aISO(new Date(a, m, 0)) };
  }
  if (filtro.periodo === "rango") {
    const desde = filtro.desde || hoyISO().slice(0, 8) + "01", hasta = filtro.hasta || hoyISO();
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  }
  return rangoPeriodo(filtro.periodo);
}

// Periodo anterior equivalente: mes anterior, semana anterior, ayer, o un rango de igual duración justo antes.
function rangoAnterior({ desde, hasta }) {
  if (filtro.periodo === "mes") {
    const d = deISO(desde);
    return { desde: aISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), hasta: aISO(new Date(d.getFullYear(), d.getMonth(), 0)) };
  }
  const dias = Math.round((deISO(hasta) - deISO(desde)) / 86400000) + 1;
  return { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) };
}

function nombrePeriodo({ desde, hasta }, corto = false) {
  if (filtro.periodo === "mes") {
    const t = deISO(desde).toLocaleDateString("es-CO", { month: "long", year: corto ? undefined : "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (filtro.periodo === "hoy") return corto ? "ayer" : "Hoy";
  if (filtro.periodo === "semana") return corto ? "la semana anterior" : "Esta semana";
  if (desde === hasta) return formatearFecha(desde, { day: "numeric", month: "long" });
  return `${formatearFecha(desde, { day: "numeric", month: "short" })} al ${formatearFecha(hasta, { day: "numeric", month: "short" })}`;
}

function textoAnterior(rangoAnt) {
  if (filtro.periodo === "mes") return `en ${nombrePeriodo(rangoAnt, true).toLowerCase()}`;
  if (filtro.periodo === "hoy") return "ayer";
  if (filtro.periodo === "semana") return "la semana anterior";
  return "en el periodo anterior";
}

function selectorPeriodo(conRango) {
  return `
    <div class="segmentos" role="tablist" aria-label="Periodo">
      ${[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ...(conRango ? [["rango", "Rango"]] : [])]
        .map(([id, t]) => `<button role="tab" aria-selected="${filtro.periodo === id}" class="segmento ${filtro.periodo === id ? "activo" : ""}" data-periodo="${id}">${t}</button>`).join("")}
    </div>`;
}

function enlazarPeriodo(cont, ctx) {
  cont.querySelectorAll("[data-periodo]").forEach((b) => b.onclick = () => {
    const anterior = rangoFiltro();
    filtro.periodo = b.dataset.periodo;
    if (filtro.periodo === "mes") filtro.mes = filtro.mes || mesActual();
    if (filtro.periodo === "rango" && !filtro.desde) Object.assign(filtro, { desde: anterior.desde, hasta: anterior.hasta });
    render(cont, ctx);
  });
}

// ---------- Piezas visuales ----------

function variacion(actual, previo, { unidad = "", puntos = false, contexto }) {
  if (previo == null || actual == null) return "";
  const dif = puntos ? Math.round((actual - previo) * 100) : actual - previo;
  if (!dif) return `<span class="variacion">Igual que ${esc(contexto)}</span>`;
  const valor = puntos ? `${Math.abs(dif)} punto${Math.abs(dif) === 1 ? "" : "s"}` : `${n(Math.abs(dif))}${unidad}`;
  return `<span class="variacion">${icono(dif > 0 ? "up" : "down", 14)}${valor} ${dif > 0 ? "más" : "menos"} que ${esc(contexto)}</span>`;
}

function barraEstados(r, alto = "") {
  if (!r.agendadas) return `<div class="barra-estados ${alto}"><span style="flex:1;background:var(--linea)"></span></div>`;
  return `<div class="barra-estados ${alto}" role="img" aria-label="${SERIES_ESTADO.map((s) => `${s.nombre}: ${r[s.clave]}`).join(", ")}">${
    SERIES_ESTADO.filter((s) => r[s.clave]).map((s) =>
      `<span style="flex:${r[s.clave]};background:${s.color}" data-tip="${esc(`${s.nombre}: ${n(r[s.clave])}`)}"></span>`).join("")}</div>`;
}

function heroe(r, previo, rangoAnt, { tituloTotal }) {
  const contexto = textoAnterior(rangoAnt);
  return `
    <section class="heroe">
      <div class="heroe-total">
        <span class="heroe-etiqueta">${esc(tituloTotal)}</span>
        <span class="cifra-xl">${n(r.agendadas)}</span>
        ${variacion(r.agendadas, previo?.agendadas, { contexto })}
      </div>
      <div class="heroe-estados">
        <span class="heroe-etiqueta">Estado actual de esas visitas</span>
        ${barraEstados(r, "barra-estados-lg")}
        <div class="metricas-estado">
          ${SERIES_ESTADO.map((s) => `
            <div class="metrica">
              <span class="metrica-nombre"><i style="background:${s.color}"></i>${s.nombre}</span>
              <span class="metrica-valor">${n(r[s.clave])}</span>
              <span class="metrica-sub">${s.clave === "PROGRAMADA" && r.vencidas
                ? `<span class="texto-alerta">${n(r.vencidas)} vencida${r.vencidas === 1 ? "" : "s"}</span>`
                : r.agendadas ? `${Math.round((r[s.clave] / r.agendadas) * 100)} %` : "&nbsp;"}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="heroe-cumplimiento">
        <span class="heroe-etiqueta">Cumplimiento</span>
        ${r.cumplimiento == null ? `<span class="cifra-vacia">Sin datos aún</span>` : `<span class="cifra-lg">${formatearPorcentaje(r.cumplimiento)}</span>`}
        <div class="progreso progreso-oscuro"><span style="width:${Math.round((r.cumplimiento || 0) * 100)}%"></span></div>
        <span class="heroe-nota">${r.exigibles ? `${n(r.realizadas)} realizada${r.realizadas === 1 ? "" : "s"} de ${n(r.exigibles)} con fecha cumplida` : "Aún no hay visitas con fecha cumplida"}</span>
        ${previo?.cumplimiento != null ? `<span class="heroe-nota tenue">${esc(contexto.charAt(0).toUpperCase() + contexto.slice(1))}: ${formatearPorcentaje(previo.cumplimiento)}</span>` : ""}
      </div>
    </section>`;
}

// ---------- Administrador ----------

async function renderAdmin(cont, ctx) {
  const rango = rangoFiltro();
  const rangoAnt = rangoAnterior(rango);
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <h1 class="titulo-periodo">${esc(nombrePeriodo(rango))}</h1>
        <p class="texto-suave">Gestión de visitas de todo el equipo</p>
      </div>
      <div class="barra-filtros">
        ${selectorPeriodo(true)}
        ${filtro.periodo === "mes" ? `<label class="filtro"><span>Mes</span><input type="month" id="f-mes" value="${filtro.mes}"></label>` : ""}
        ${filtro.periodo === "rango" ? `
          <label class="filtro"><span>Desde</span><input type="date" id="f-desde" value="${filtro.desde || rango.desde}"></label>
          <label class="filtro"><span>Hasta</span><input type="date" id="f-hasta" value="${filtro.hasta || rango.hasta}"></label>` : ""}
        <label class="filtro"><span>Responsable</span><select id="f-coord"><option value="">Todos</option></select></label>
        <label class="filtro"><span>Zona</span><select id="f-zona"><option value="">Todas</option></select></label>
      </div>
    </header>
    <div id="tablero">${esqueleto(1, 220)}${esqueleto(1, 240)}</div>`;

  enlazarPeriodo(cont, ctx);
  const on = (id, campo) => {
    const el = cont.querySelector(id);
    if (el) el.onchange = (e) => { filtro[campo] = e.target.value; render(cont, ctx); };
  };
  on("#f-mes", "mes"); on("#f-desde", "desde"); on("#f-hasta", "hasta");

  // Una sola consulta cubre el periodo, el anterior y el contexto de los gráficos.
  const inicioMeses = aISO(new Date(deISO(rango.hasta).getFullYear(), deISO(rango.hasta).getMonth() - (MESES - 1), 1));
  const inicioSemanas = sumarDias(lunesDe(rango.hasta), -7 * (SEMANAS - 1));
  const desdeCarga = [rango.desde, rangoAnt.desde, inicioMeses, inicioSemanas].sort()[0];

  let todas;
  try {
    todas = await listarVisitas(ctx, { desde: desdeCarga, hasta: rango.hasta });
  } catch (err) {
    console.error(err);
    cont.querySelector("#tablero").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cont.querySelector("#tablero")) return; // la persona ya cambió de pantalla

  const responsables = [...new Map(todas.map((v) => [v.coordinadorUid, v.coordinadorNombre])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es"));
  const zonas = [...new Set(todas.map((v) => v.zona).filter(Boolean))].sort();
  const selC = cont.querySelector("#f-coord"), selZ = cont.querySelector("#f-zona");
  selC.innerHTML += responsables.map(([uid, nom]) => `<option value="${uid}" ${filtro.coordinador === uid ? "selected" : ""}>${esc(nom)}</option>`).join("");
  selZ.innerHTML += zonas.map((z) => `<option ${filtro.zona === z ? "selected" : ""}>${esc(z)}</option>`).join("");
  selC.onchange = (e) => { filtro.coordinador = e.target.value; pintarAdmin(cont, ctx, todas, rango, rangoAnt); };
  selZ.onchange = (e) => { filtro.zona = e.target.value; pintarAdmin(cont, ctx, todas, rango, rangoAnt); };

  pintarAdmin(cont, ctx, todas, rango, rangoAnt);
}

function pintarAdmin(cont, ctx, todas, rango, rangoAnt) {
  const hoy = hoyISO();
  const base = filtrarVisitas(todas, { coordinador: filtro.coordinador, zona: filtro.zona });
  const r = resumen(filtrarVisitas(base, rango), hoy);
  const previo = resumen(filtrarVisitas(base, rangoAnt), hoy);
  // Tarjetas del equipo en orden alfabético: es una herramienta de gestión, no un ranking.
  const equipo = porResponsable(filtrarVisitas(base, rango), hoy).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const semanas = porSemana(base, rango.hasta, SEMANAS, hoy);
  const meses = porMes(base, rango.hasta, MESES, hoy);
  const valores = (x) => Object.fromEntries(SERIES_ESTADO.map((s) => [s.clave, x[s.clave]]));

  cont.querySelector("#tablero").innerHTML = `
    ${heroe(r, previo.agendadas || previo.exigibles ? previo : null, rangoAnt, { tituloTotal: "Visitas agendadas" })}

    <section class="seccion">
      <div class="seccion-cabecera">
        <h2>Equipo</h2>
        <span class="texto-suave">Orden alfabético</span>
      </div>
      ${equipo.length ? `
        <div class="equipo-lista" role="table" aria-label="Gestión por responsable">
          <div class="equipo-fila equipo-encabezado" role="row">
            <span role="columnheader">Responsable</span><span role="columnheader">Agendadas</span>
            <span role="columnheader">Estado actual</span><span role="columnheader">Cumplimiento</span><span role="columnheader">Vencidas</span>
          </div>
          ${equipo.map(filaResponsable).join("")}
        </div>`
        : `<div class="panel">${estadoVacio({ icono: "calendar", titulo: "No hay visitas en este periodo", texto: "Cuando el equipo programe visitas, aquí verás el avance de cada persona." })}</div>`}
    </section>

    <section class="graficos">
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>¿Cómo avanzan las semanas?</h3><p>Visitas por semana y su estado actual, últimas ${SEMANAS}</p></header>
        ${columnasApiladas(semanas.map((s) => ({
          clave: s.desde, total: s.agendadas, valores: valores(s),
          etiqueta: s.desde === lunesDe(hoy) ? "Esta" : formatearFecha(s.desde, { day: "numeric", month: "short" }).replace(" de ", " "),
          titulo: `Semana del ${formatearFecha(s.desde, { day: "numeric", month: "short" })} al ${formatearFecha(s.hasta, { day: "numeric", month: "short" })}`,
        })), SERIES_ESTADO, { resaltar: lunesDe(hoy) })}
      </article>
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>¿Se cumple lo que se agenda?</h3><p>Agendadas frente a realizadas, últimos ${MESES} meses</p></header>
        ${columnasAgrupadas(meses.map((m) => ({
          etiqueta: m.mes.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""),
          titulo: m.mes.toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
          valores: { agendadas: m.agendadas, realizadas: m.realizadas },
          nota: `Cumplimiento: ${formatearPorcentaje(m.cumplimiento)}`,
        })), [
          { clave: "agendadas", nombre: "Agendadas", color: "#E8701F" },
          { clave: "realizadas", nombre: "Realizadas (finalizadas y pendientes)", color: "#4F6E12" },
        ])}
      </article>
    </section>`;
  activarTooltips(cont.querySelector("#tablero"));
}

function filaResponsable(g) {
  const pct = g.cumplimiento == null ? null : Math.round(g.cumplimiento * 100);
  const detalle = SERIES_ESTADO.map((x) => `${x.nombre}: ${n(g[x.clave])}`).join("\n");
  return `
    <div class="equipo-fila" role="row">
      <span class="equipo-persona" role="cell"><span class="avatar">${esc(iniciales(g.nombre))}</span><strong>${esc(g.nombre)}</strong></span>
      <span class="equipo-num" role="cell" data-etiqueta="Agendadas">${n(g.agendadas)}</span>
      <span class="equipo-estado" role="cell" data-tip="${esc(detalle)}">${barraEstados(g)}<small><span class="solo-movil-texto">${n(g.agendadas)} agendadas: </span>${n(g.FINALIZADA)} finalizadas, ${n(g.PROGRAMADA)} programadas</small></span>
      <span class="equipo-cumplimiento" role="cell">${pct == null
        ? `<span class="texto-suave">Sin fecha cumplida</span>`
        : `<strong>${pct} %</strong><span class="progreso"><span style="width:${pct}%"></span></span>`}</span>
      <span class="equipo-vencidas ${g.vencidas ? "texto-alerta" : "texto-suave"}" role="cell" data-etiqueta="Vencidas">${g.vencidas ? `${icono("alert", 15)}${n(g.vencidas)}` : "0"}</span>
    </div>`;
}

// ---------- Coordinador: Centro de gestión comercial ----------
// Responde, en este orden: ¿qué tengo hoy?, ¿cuál sigue?, ¿qué tengo pendiente?, ¿cómo va mi gestión?
// Solo lectura: consulta las visitas del coordinador (listarVisitas ya limita a las suyas) y no cambia nada.

const estadoCoord = { kpi: "" }; // tarjeta de indicador activa (filtro de la lista)
const TOPE_PENDIENTES = 6;
const TOPE_RECIENTES = 5;
const TOPE_FILTRO = 30;

async function renderCoordinador(cont, ctx) {
  if (filtro.periodo === "rango") filtro.periodo = "mes";
  const rango = rangoFiltro();
  const rangoAnt = rangoAnterior(rango);
  const primerNombre = (ctx.perfil.nombre || "").split(" ")[0];
  const hoy = hoyISO();
  const fechaHoy = formatearFecha(hoy, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  cont.innerHTML = `
    <div class="centro">
      <header class="centro-cabecera">
        <div><h1>Hola, ${esc(primerNombre)}</h1><p class="texto-suave inicio-fecha">${esc(fechaHoy)}</p></div>
        <button type="button" class="btn btn-primario centro-programar" data-nueva>${icono("plus", 18)}Programar visita</button>
      </header>
      <div id="tablero">${esqueleto(1, 96)}${esqueleto(1, 180)}${esqueleto(3, 56)}</div>
    </div>`;
  cont.querySelector("[data-nueva]").onclick = () => irANuevaVisita();

  let todas;
  try {
    // Periodo actual y anterior, 6 meses atrás (vencidas y pendientes) y todo lo que viene.
    const desde = [rango.desde, rangoAnt.desde, sumarDias(hoy, -DIAS_VENCIDAS)].filter(Boolean).sort()[0];
    todas = await listarVisitas(ctx, { desde });
  } catch (err) {
    console.error(err);
    cont.querySelector("#tablero").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cont.querySelector("#tablero")) return;
  pintarCentro(cont, ctx, todas, rango, rangoAnt, hoy);
}

// Próxima visita según la programación real (no el primer registro):
// 1) la que está en curso; 2) la primera de hoy sin resultado, por hora; 3) la siguiente futura sin resultado.
function proximaVisita(todas, hoy) {
  const abiertas = ordenarVisitas(todas.filter((v) => sinResultado(v) && v.fechaProgramada >= hoy));
  const enCurso = abiertas.find(visitaEnCurso) || todas.find((v) => visitaEnCurso(v));
  if (enCurso) return { v: enCurso, etiqueta: "En curso" };
  const deHoy = abiertas.find((v) => v.fechaProgramada === hoy);
  if (deHoy) return { v: deHoy, etiqueta: "Siguiente" };
  const futura = abiertas[0];
  return futura ? { v: futura, etiqueta: etiquetaDia(futura.fechaProgramada) } : null;
}

const tipoTexto = (v) => TIPO_VISITA[tipoDeVisita(v)]?.texto || v.motivo || "";
const direccion = (v) => [v.sede?.direccion, v.sede?.barrio, v.ciudad || v.sede?.ciudad].filter(Boolean).join(", ");

function pintarCentro(cont, ctx, todas, rango, rangoAnt, hoy) {
  const enPeriodo = filtrarVisitas(todas, rango);
  const r = resumen(enPeriodo, hoy);
  const previo = resumen(filtrarVisitas(todas, rangoAnt), hoy);
  const deHoy = ordenarVisitas(todas.filter((v) => v.fechaProgramada === hoy));
  const prox = proximaVisita(todas, hoy);
  const registradasHoy = deHoy.filter((v) => v.resultado).length;

  // Pendientes por gestionar (sin modificar nada): vencidas sin resultado, pendientes con compromisos,
  // y reprogramadas que vienen.
  const vencidas = ordenarVisitas(todas.filter((v) => sinResultado(v) && v.fechaProgramada < hoy), true);
  const conCompromisos = todas.filter((v) => v.estado === ESTADOS_VISITA.PENDIENTE)
    .sort((a, b) => (b.resultado?.fechaHora || "").localeCompare(a.resultado?.fechaHora || ""));
  const reprogramadas = ordenarVisitas(todas.filter((v) => v.estado === ESTADOS_VISITA.REPROGRAMADA && v.fechaProgramada >= hoy));
  const totalPendientes = vencidas.length + conCompromisos.length + reprogramadas.length;
  const pendientes = [
    ...vencidas.map((v) => ({ v, tipo: "vencida", texto: `Sin resultado desde ${etiquetaDia(v.fechaProgramada)}` })),
    ...conCompromisos.map((v) => ({ v, tipo: "pendiente", texto: v.resultado?.pendiente ? `Compromiso: ${v.resultado.pendiente}` : "Quedaron compromisos por cumplir" })),
    ...reprogramadas.map((v) => ({ v, tipo: "reprogramada", texto: `Nueva fecha: ${etiquetaDia(v.fechaProgramada)}, ${formatearHora(v.horaProgramada)}${v.ultimaReprogramacion?.motivo ? ` · Motivo: ${v.ultimaReprogramacion.motivo}` : ""}` })),
  ];

  const recientes = todas.filter((v) => v.resultado?.fechaHora)
    .sort((a, b) => b.resultado.fechaHora.localeCompare(a.resultado.fechaHora)).slice(0, TOPE_RECIENTES);

  const etiquetaPeriodo = { hoy: "hoy", semana: "esta semana" }[filtro.periodo] || `en ${nombrePeriodo(rango).toLowerCase()}`;
  const kpis = [
    { clave: ESTADOS_VISITA.PROGRAMADA, nombre: "Programadas", sub: r.vencidas ? `<span class="texto-alerta">${n(r.vencidas)} vencida${r.vencidas === 1 ? "" : "s"}</span>` : "Por realizar" },
    { clave: ESTADOS_VISITA.FINALIZADA, nombre: "Finalizadas", sub: "Realizadas y cerradas" },
    { clave: ESTADOS_VISITA.PENDIENTE, nombre: "Pendientes", sub: "Realizadas con compromisos" },
    { clave: ESTADOS_VISITA.REPROGRAMADA, nombre: "Reprogramadas", sub: "Con nueva fecha" },
  ].map((k) => ({ ...k, color: SERIES_ESTADO.find((s) => s.clave === k.clave).color, valor: r[k.clave] }));
  if (estadoCoord.kpi && !kpis.some((k) => k.clave === estadoCoord.kpi)) estadoCoord.kpi = "";

  // Gestión del periodo, sin resultados engañosos:
  // · Hoy: avance del día = visitas de hoy con resultado ÷ visitas de hoy.
  // · Semana / Mes: cumplimiento = realizadas (finalizadas + pendientes) ÷ visitas cuya fecha ya pasó o que ya
  //   tienen resultado. Las de hoy sin registrar aún no cuentan (el día no ha terminado) y las futuras tampoco.
  const hecha = (v) => v.estado === ESTADOS_VISITA.FINALIZADA || v.estado === ESTADOS_VISITA.PENDIENTE;
  const esHoy = filtro.periodo === "hoy";
  const g = esHoy
    ? { hechas: enPeriodo.filter(hecha).length, base: enPeriodo.length }
    : { hechas: enPeriodo.filter(hecha).length, base: enPeriodo.filter((v) => hecha(v) || v.fechaProgramada < hoy).length };
  const pct = g.base ? Math.round((g.hechas / g.base) * 100) : null;
  const porVenir = enPeriodo.filter((v) => !hecha(v) && v.fechaProgramada >= hoy).length;

  // Tres bloques numerados, igual que la Ficha de cliente: 1. Mi día · 2. Por gestionar · 3. Mi gestión.
  cont.querySelector("#tablero").innerHTML = `
    <section class="ficha-bloque centro-bloque" aria-labelledby="cb-dia">
      <h2 class="ficha-bloque-titulo" id="cb-dia">${icono("calendar", 18)}<span class="fb-num">1</span>Mi día</h2>
      <div class="ficha-bloque-rejilla cb-dia">
        ${tarjetaProxima(prox, hoy)}
        <section class="panel centro-panel" aria-labelledby="t-agenda">
          <div class="centro-panel-cabeza">
            <h3 id="t-agenda">${icono("calendar", 18)}Agenda de hoy</h3>
            <span class="texto-suave">${deHoy.length ? `${registradasHoy} de ${deHoy.length} registrada${deHoy.length === 1 ? "" : "s"}` : ""}</span>
          </div>
          ${deHoy.length ? `
          <ol class="agenda-hoy">${deHoy.map((v) => filaAgenda(v, hoy, prox?.v?.id === v.id)).join("")}</ol>`
          : `<div class="centro-vacio">${icono("calendar", 20)}<div><strong>No tienes visitas programadas para hoy</strong><span>Programa las de los próximos días desde aquí o desde la Agenda.</span></div>
              <button type="button" class="btn btn-secundario btn-sm" data-nueva>${icono("plus", 16)}Programar</button></div>`}
        </section>
      </div>
    </section>

    <section class="ficha-bloque centro-bloque" aria-labelledby="cb-pend">
      <h2 class="ficha-bloque-titulo" id="cb-pend">${icono("alert", 18)}<span class="fb-num">2</span>Por gestionar</h2>
      <section class="panel centro-panel" aria-labelledby="t-pend">
          <div class="centro-panel-cabeza">
            <h3 id="t-pend">Visitas que requieren atención</h3>
            ${totalPendientes ? `<span class="centro-cuenta">${n(totalPendientes)}</span>` : ""}
          </div>
          ${totalPendientes ? `
          <div class="pend-resumen">
            ${vencidas.length ? `<span class="pend-chip pend-vencida">${n(vencidas.length)} sin resultado</span>` : ""}
            ${conCompromisos.length ? `<span class="pend-chip pend-pendiente">${n(conCompromisos.length)} con compromisos</span>` : ""}
            ${reprogramadas.length ? `<span class="pend-chip pend-reprogramada">${n(reprogramadas.length)} reprogramada${reprogramadas.length === 1 ? "" : "s"}</span>` : ""}
          </div>
          <ul class="pend-lista">${pendientes.slice(0, TOPE_PENDIENTES).map(({ v, tipo, texto }) => `
            <li class="pend-item pend-${tipo}" data-id="${v.id}" tabindex="0">
              <span class="pend-marca" aria-hidden="true"></span>
              <div><div class="pend-cabeza">${chapeta(v.codigo)}<strong>${esc(nombreCliente(v))}</strong></div>
                <span class="pend-texto">${esc(texto)}</span></div>
              ${icono("next", 18)}
            </li>`).join("")}</ul>
          ${totalPendientes > TOPE_PENDIENTES ? `<a class="btn btn-texto btn-sm centro-mas" href="#/visitas">Ver todas en Visitas ${icono("next", 16)}</a>` : ""}`
          : `<div class="centro-vacio centro-ok">${icono("ok", 20)}<div><strong>Todo al día</strong><span>No tienes visitas vencidas, con compromisos ni reprogramadas.</span></div></div>`}
        </section>
    </section>

    <section class="ficha-bloque centro-bloque centro-kpis" aria-labelledby="cb-gestion">
      <div class="centro-bloque-cabeza">
        <h2 class="ficha-bloque-titulo" id="cb-gestion">${icono("chart", 18)}<span class="fb-num">3</span>Mi gestión <span class="cb-periodo">${esc(etiquetaPeriodo)}</span></h2>
        ${selectorPeriodo(false)}
      </div>
      <div class="kpis" role="group" aria-label="Filtrar por estado">
        ${kpis.map((k) => `
        <button type="button" class="kpi ${estadoCoord.kpi === k.clave ? "activo" : ""}" data-kpi="${k.clave}" aria-pressed="${estadoCoord.kpi === k.clave}" style="--kpi:${k.color}">
          <span class="kpi-nombre"><i aria-hidden="true"></i>${k.nombre}</span>
          <strong class="kpi-valor">${n(k.valor)}</strong>
          <span class="kpi-sub">${k.sub}</span>
        </button>`).join("")}
      </div>
      <div id="kpi-lista">${estadoCoord.kpi ? listaKpi(enPeriodo, estadoCoord.kpi, kpis, etiquetaPeriodo, hoy) : ""}</div>
      <div class="ficha-bloque-rejilla cb-gestion">
        <section class="panel centro-panel centro-desempeno" aria-labelledby="t-desempeno">
          <div class="centro-panel-cabeza">
            <h3 id="t-desempeno">${icono("chart", 18)}${esHoy ? "Avance del día" : "Cumplimiento"}</h3>
          </div>
          <div class="desempeno-cifra">
            <strong>${pct == null ? "—" : `${pct} %`}</strong>
            <span>${esHoy ? "del día" : "de cumplimiento"}</span>
          </div>
          <div class="progreso"><span style="width:${pct || 0}%"></span></div>
          <p class="desempeno-detalle">${esHoy
            ? (g.base ? `Registraste ${n(g.hechas)} de ${n(g.base)} visita${g.base === 1 ? "" : "s"} de hoy.` : "No tienes visitas programadas para hoy.")
            : (g.base ? `${n(g.hechas)} realizada${g.hechas === 1 ? "" : "s"} de ${n(g.base)} visita${g.base === 1 ? "" : "s"} con fecha cumplida.` : "Aún no hay visitas con fecha cumplida en este periodo.")}
            ${!esHoy && porVenir ? ` ${n(porVenir)} por realizar desde hoy (aún no cuentan).` : ""}</p>
          ${variacion(r.agendadas, (previo.agendadas || previo.exigibles) ? previo.agendadas : null, { contexto: textoAnterior(rangoAnt) })
            ? `<p class="desempeno-variacion">${n(r.agendadas)} agendadas · ${variacion(r.agendadas, previo.agendadas, { contexto: textoAnterior(rangoAnt) })}</p>` : ""}
          <details class="desempeno-ayuda">
            <summary>¿Cómo se calcula?</summary>
            <p><b>Hoy:</b> visitas de hoy con resultado ÷ visitas programadas para hoy.</p>
            <p><b>Semana y mes:</b> visitas realizadas (finalizadas + pendientes) ÷ visitas del periodo cuya fecha ya pasó o que ya tienen resultado. Las de hoy aún sin registrar y las de días futuros no cuentan, para que el porcentaje no baje solo porque el día o el periodo no han terminado. Una visita reprogramada cuenta una sola vez, en su fecha actual.</p>
          </details>
        </section>
        <section class="panel centro-panel" aria-labelledby="t-recientes">
          <div class="centro-panel-cabeza"><h3 id="t-recientes">${icono("clock", 18)}Actividad reciente</h3></div>
          ${recientes.length ? `<ul class="reciente-lista">${recientes.map((v) => `
            <li class="reciente" data-id="${v.id}" tabindex="0">
              <div class="reciente-cuerpo"><strong>${esc(nombreCliente(v))}</strong>
                <span>${v.codigo ? `${esc(v.codigo)} · ` : ""}${esc(formatearFecha(v.resultado.fechaHora.slice(0, 10), { day: "numeric", month: "short" }))}</span></div>
              ${badgeEstado(estadoVisible(v, hoy))}
            </li>`).join("")}</ul>`
          : `<p class="texto-suave centro-nada">Cuando registres el resultado de una visita aparecerá aquí.</p>`}
        </section>
      </div>
    </section>`;

  enlazarPeriodo(cont, ctx);
  const tablero = cont.querySelector("#tablero");
  tablero.querySelectorAll("[data-nueva]").forEach((b) => b.addEventListener("click", () => irANuevaVisita()));
  // Indicadores como filtro: un clic muestra esas visitas del periodo; otro clic en la misma tarjeta las oculta.
  tablero.querySelectorAll("[data-kpi]").forEach((b) => b.onclick = () => {
    estadoCoord.kpi = estadoCoord.kpi === b.dataset.kpi ? "" : b.dataset.kpi;
    tablero.querySelectorAll("[data-kpi]").forEach((x) => {
      const on = x.dataset.kpi === estadoCoord.kpi;
      x.classList.toggle("activo", on); x.setAttribute("aria-pressed", String(on));
    });
    tablero.querySelector("#kpi-lista").innerHTML = estadoCoord.kpi ? listaKpi(enPeriodo, estadoCoord.kpi, kpis, etiquetaPeriodo, hoy) : "";
  });

  const volver = { onVolver: () => render(cont, ctx), textoVolver: "Volver al inicio" };
  const abrir = (e) => {
    if (e.target.closest("a[href^='tel:'], a[href^='#']")) return;
    if (e.target.closest("[data-cerrar-kpi]")) {
      estadoCoord.kpi = "";
      tablero.querySelectorAll("[data-kpi]").forEach((x) => { x.classList.remove("activo"); x.setAttribute("aria-pressed", "false"); });
      tablero.querySelector("#kpi-lista").innerHTML = "";
      return;
    }
    const ficha = e.target.closest("[data-ficha]");
    if (ficha) return abrirFicha(cont, ctx, ficha.dataset.ficha, volver);
    const reg = e.target.closest("[data-registrar]");
    if (reg) return abrirVisita(cont, ctx, reg.dataset.registrar, { ...volver, accion: "resultado" });
    const brief = e.target.closest("[data-brief]");
    if (brief) return abrirVisita(cont, ctx, brief.dataset.brief, volver);
    const fila = e.target.closest("[data-id]");
    if (fila) abrirVisita(cont, ctx, fila.dataset.id, volver);
  };
  tablero.addEventListener("click", abrir);
  tablero.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-id]")) abrir(e);
  });
}

function tarjetaProxima(prox, hoy) {
  if (!prox) {
    return `
    <section class="proxima-v2 proxima-vacia" aria-label="Próxima visita">
      <div class="centro-vacio">${icono("calendar", 20)}<div><strong>No tienes visitas próximas</strong><span>Cuando programes visitas, aquí verás cuál sigue.</span></div>
        <button type="button" class="btn btn-primario btn-sm" data-nueva>${icono("plus", 16)}Programar visita</button></div>
    </section>`;
  }
  const { v, etiqueta } = prox;
  const tel = telefonoPrincipal(v.sede?.celular) || telefonoPrincipal(v.sede?.telefono);
  const enCurso = visitaEnCurso(v);
  const establecimiento = [v.marcas?.length ? v.marcas.join(", ") : "", expendioSecundario(v)].filter(Boolean).join(" · ");
  const esHoy = v.fechaProgramada === hoy;
  return `
    <section class="proxima-v2 ${enCurso ? "en-curso" : ""}" aria-labelledby="t-proxima">
      <div class="proxima-v2-hora">
        <span class="proxima-v2-etiqueta">${esc(etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1))}</span>
        <strong>${esc(formatearHora(v.horaProgramada))}</strong>
        ${esHoy ? "" : `<small>${esc(formatearFecha(v.fechaProgramada, { weekday: "short", day: "numeric", month: "short" }))}</small>`}
      </div>
      <div class="proxima-v2-cuerpo">
        <div class="proxima-v2-cabeza">${chapeta(v.codigo)}${badgeVisita(v, hoy)}</div>
        <h2 id="t-proxima">${esc(nombreCliente(v))}</h2>
        <ul class="proxima-v2-datos">
          ${establecimiento ? `<li>${icono("store", 16)}<span>${esc(establecimiento)}</span></li>` : ""}
          ${direccion(v) ? `<li>${icono("pin", 16)}<span>${esc(direccion(v))}</span></li>` : ""}
          <li>${icono("route", 16)}<span>${esc(tipoTexto(v))}</span></li>
        </ul>
        <div class="proxima-v2-acciones">
          ${enCurso
            ? `<button type="button" class="btn btn-primario" data-registrar="${v.id}">${icono("next", 18)}Continuar visita</button>`
            : `<button type="button" class="btn btn-primario" data-brief="${v.id}">${icono("clock", 18)}Preparar visita</button>`}
          ${tel ? `<a class="btn btn-secundario" href="tel:${tel}">${icono("phone", 18)}Llamar</a>` : ""}
          ${v.clienteId ? `<button type="button" class="btn btn-secundario" data-ficha="${esc(v.clienteId)}">${icono("store", 18)}Ver ficha</button>` : ""}
        </div>
      </div>
    </section>`;
}

function filaAgenda(v, hoy, esSiguiente) {
  return `
    <li class="agenda-fila ${v.resultado ? "hecha" : ""} ${esSiguiente ? "siguiente" : ""}" data-id="${v.id}" tabindex="0">
      <span class="agenda-hora">${esc(formatearHora(v.horaProgramada))}</span>
      <span class="agenda-punto" aria-hidden="true">${v.resultado ? icono("ok", 12) : ""}</span>
      <span class="agenda-cliente">
        <strong>${esc(nombreCliente(v))}</strong>
        <span>${v.codigo ? `${esc(v.codigo)} · ` : ""}${esc(tipoTexto(v))}${esSiguiente ? ` · <b class="agenda-sigue">Sigue</b>` : ""}</span>
      </span>
      ${badgeVisita(v, hoy)}
      ${icono("next", 18)}
    </li>`;
}

// Estado visible; una visita iniciada y sin resultado se muestra «En curso» (no es un estado guardado).
function badgeVisita(v, hoy) {
  if (visitaEnCurso(v)) return `<span class="chip chip-estado estado-en-curso"><i class="punto-vivo" aria-hidden="true"></i>En curso</span>`;
  return badgeEstado(estadoVisible(v, hoy));
}

// Lista filtrada por la tarjeta de indicador: estado guardado de la visita en el periodo (sin mezclar estados).
function listaKpi(enPeriodo, clave, kpis, etiquetaPeriodo, hoy) {
  const k = kpis.find((x) => x.clave === clave);
  const lista = ordenarVisitas(enPeriodo.filter((v) => v.estado === clave), clave !== ESTADOS_VISITA.PROGRAMADA && clave !== ESTADOS_VISITA.REPROGRAMADA);
  return `
    <div class="kpi-detalle" style="--kpi:${k.color}">
      <div class="kpi-detalle-cabeza">
        <h3>${esc(k.nombre)} ${esc(etiquetaPeriodo)} <span class="texto-suave">(${n(lista.length)})</span></h3>
        <button type="button" class="btn-icono btn-mini" data-cerrar-kpi aria-label="Cerrar lista">${icono("close", 16)}</button>
      </div>
      ${lista.length ? `<ul class="kpi-detalle-lista">${lista.slice(0, TOPE_FILTRO).map((v) => `
        <li class="reciente" data-id="${v.id}" tabindex="0">
          <span class="kpi-fecha">${esc(formatearFecha(v.fechaProgramada, { weekday: "short", day: "numeric", month: "short" }))}<small>${esc(formatearHora(v.horaProgramada))}</small></span>
          <div class="reciente-cuerpo"><strong>${esc(nombreCliente(v))}</strong><span>${v.codigo ? `${esc(v.codigo)} · ` : ""}${esc(tipoTexto(v))}</span></div>
          ${badgeEstado(estadoVisible(v, hoy))}
        </li>`).join("")}</ul>
        ${lista.length > TOPE_FILTRO ? `<p class="texto-suave centro-nada">Se muestran ${TOPE_FILTRO} de ${n(lista.length)}. Consulta todas en <a href="#/visitas">Visitas</a>.</p>` : ""}`
      : `<p class="texto-suave centro-nada">No hay visitas en este estado ${esc(etiquetaPeriodo)}.</p>`}
    </div>`;
}
