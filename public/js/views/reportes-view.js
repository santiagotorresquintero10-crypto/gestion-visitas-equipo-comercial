// Reportes (administrador): consolidado del periodo con filtros y exportación a Excel.
// Todos los números salen de services/indicadores.js, igual que el Dashboard.
import { esc, icono, chapeta, estadoVacio, esqueleto, toast, setCargando, iniciales } from "../ui.js";
import { ESTADO_LABEL } from "../constants.js";
import { listarVisitas, estadoVisible } from "../services/visitas-service.js";
import {
  SERIES_ESTADO, resumen, filtrarVisitas, porResponsable, porCategoria, conteoNovedades, clientesVisitados,
  semanasDelRango, lunesDe, formatearPorcentaje,
} from "../services/indicadores.js";
import { exportarReporte } from "../services/exportar-reporte.js";
import { mensajeError } from "../services/auth-service.js";
import { columnasApiladas, barrasApiladas, barrasSimples, activarTooltips } from "../components/graficos.js";
import { irAFicha } from "../utils/navegacion.js";
import { hoyISO, rangoPeriodo, aISO, formatearFecha } from "../utils/fechas.js";

const COLOR_MOTIVO = "#4F6E12";
const COLOR_NOVEDAD = "#86A214";
const MAX_CLIENTES_PANTALLA = 25;
const mesActual = () => hoyISO().slice(0, 7);
const n = (x) => Number(x || 0).toLocaleString("es-CO");

const filtro = { periodo: "mes", mes: mesActual(), desde: "", hasta: "", coordinador: "", zona: "", estado: "" };
let cargadas = { clave: "", visitas: [] }; // visitas del rango consultado (se reutilizan al cambiar otros filtros)

function rangoFiltro() {
  if (filtro.periodo === "mes") {
    const [a, m] = filtro.mes.split("-").map(Number);
    return { desde: aISO(new Date(a, m - 1, 1)), hasta: aISO(new Date(a, m, 0)) };
  }
  if (filtro.periodo === "rango") {
    const desde = filtro.desde || `${hoyISO().slice(0, 8)}01`, hasta = filtro.hasta || hoyISO();
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  }
  return rangoPeriodo("semana");
}

function nombrePeriodo({ desde, hasta }) {
  if (filtro.periodo === "mes") {
    const t = new Date(`${desde}T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const f = (iso) => formatearFecha(iso, { day: "numeric", month: "short", year: "numeric" });
  return filtro.periodo === "semana" ? `Esta semana, ${f(desde)} al ${f(hasta)}` : `${f(desde)} al ${f(hasta)}`;
}

export async function render(cont, ctx) {
  const rango = rangoFiltro();
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <h1>Reportes</h1>
        <p class="texto-suave" id="reporte-periodo">${esc(nombrePeriodo(rango))}</p>
      </div>
      <button class="btn btn-primario btn-grande" id="btn-exportar" disabled>${icono("file", 20)}Exportar a Excel</button>
    </header>
    <div class="barra-filtros barra-reporte">
      <div class="segmentos" role="tablist" aria-label="Periodo">
        ${[["semana", "Semana"], ["mes", "Mes"], ["rango", "Rango"]].map(([id, t]) =>
          `<button role="tab" aria-selected="${filtro.periodo === id}" class="segmento ${filtro.periodo === id ? "activo" : ""}" data-periodo="${id}">${t}</button>`).join("")}
      </div>
      ${filtro.periodo === "mes" ? `<label class="filtro"><span>Mes</span><input type="month" id="f-mes" value="${filtro.mes}"></label>` : ""}
      ${filtro.periodo === "rango" ? `
        <label class="filtro"><span>Desde</span><input type="date" id="f-desde" value="${rango.desde}"></label>
        <label class="filtro"><span>Hasta</span><input type="date" id="f-hasta" value="${rango.hasta}"></label>` : ""}
      <label class="filtro"><span>Responsable</span><select id="f-coord"><option value="">Todos</option></select></label>
      <label class="filtro"><span>Zona</span><select id="f-zona"><option value="">Todas</option></select></label>
      <label class="filtro"><span>Estado</span><select id="f-estado"><option value="">Todos</option>
        ${Object.entries(ESTADO_LABEL).map(([k, t]) => `<option value="${k}" ${filtro.estado === k ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>
    </div>
    <div id="reporte">${esqueleto(1, 120)}${esqueleto(2, 260)}</div>`;

  cont.querySelectorAll("[data-periodo]").forEach((b) => b.onclick = () => {
    const anterior = rangoFiltro();
    filtro.periodo = b.dataset.periodo;
    if (filtro.periodo === "rango" && !filtro.desde) Object.assign(filtro, anterior);
    render(cont, ctx);
  });
  const al = (sel, campo) => { const el = cont.querySelector(sel); if (el) el.onchange = (e) => { filtro[campo] = e.target.value; render(cont, ctx); }; };
  al("#f-mes", "mes"); al("#f-desde", "desde"); al("#f-hasta", "hasta");

  const clave = `${rango.desde}|${rango.hasta}`;
  if (cargadas.clave !== clave) {
    try {
      cargadas = { clave, visitas: await listarVisitas(ctx, rango) };
    } catch (err) {
      console.error(err);
      cont.querySelector("#reporte").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
      return;
    }
  }
  if (!cont.querySelector("#reporte")) return; // la persona ya salió de Reportes

  const todas = cargadas.visitas;
  const responsables = [...new Map(todas.map((v) => [v.coordinadorUid, v.coordinadorNombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const zonas = [...new Set(todas.map((v) => v.zona).filter(Boolean))].sort();
  if (filtro.coordinador && !responsables.some(([uid]) => uid === filtro.coordinador)) filtro.coordinador = "";
  if (filtro.zona && !zonas.includes(filtro.zona)) filtro.zona = "";
  const selC = cont.querySelector("#f-coord"), selZ = cont.querySelector("#f-zona"), selE = cont.querySelector("#f-estado");
  selC.innerHTML += responsables.map(([uid, nom]) => `<option value="${esc(uid)}" ${filtro.coordinador === uid ? "selected" : ""}>${esc(nom)}</option>`).join("");
  selZ.innerHTML += zonas.map((z) => `<option ${filtro.zona === z ? "selected" : ""}>${esc(z)}</option>`).join("");
  const repintar = () => pintar(cont, ctx, rango, responsables);
  selC.onchange = (e) => { filtro.coordinador = e.target.value; repintar(); };
  selZ.onchange = (e) => { filtro.zona = e.target.value; repintar(); };
  selE.onchange = (e) => { filtro.estado = e.target.value; repintar(); };
  repintar();
}

// Calcula todo el reporte una sola vez: lo usan la pantalla y el Excel.
function calcular(rango) {
  const hoy = hoyISO();
  const visitas = filtrarVisitas(cargadas.visitas, { ...rango, coordinador: filtro.coordinador, zona: filtro.zona })
    .filter((v) => !filtro.estado || estadoVisible(v, hoy) === filtro.estado)
    .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada) || (a.horaProgramada || "").localeCompare(b.horaProgramada || ""));
  return {
    hoy, visitas,
    r: resumen(visitas, hoy),
    coordinadores: porResponsable(visitas, hoy).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    semanas: semanasDelRango(visitas, rango.desde, rango.hasta, hoy),
    zonas: porCategoria(visitas, (v) => v.zona, hoy),
    motivos: porCategoria(visitas, (v) => v.motivo, hoy),
    novedades: conteoNovedades(visitas),
    clientes: clientesVisitados(visitas),
  };
}

const valores = (x) => Object.fromEntries(SERIES_ESTADO.map((s) => [s.clave, x[s.clave]]));

function pintar(cont, ctx, rango, responsables) {
  const destino = cont.querySelector("#reporte");
  const d = calcular(rango);
  const { r } = d;
  const btn = cont.querySelector("#btn-exportar");
  btn.disabled = !d.visitas.length;
  btn.onclick = async () => {
    setCargando(btn, true, "Generando Excel…");
    try {
      await exportarReporte({
        ...d,
        filtros: {
          ...rango,
          coordinador: responsables.find(([uid]) => uid === filtro.coordinador)?.[1] || "",
          zona: filtro.zona,
          estado: ESTADO_LABEL[filtro.estado] || "",
        },
      });
      toast("Reporte descargado", "ok");
    } catch (err) {
      console.error(err);
      toast(navigator.onLine ? "No fue posible generar el Excel." : "Sin conexión no se puede generar el Excel.", "error");
    } finally {
      setCargando(btn, false);
    }
  };

  if (!d.visitas.length) {
    destino.innerHTML = `<div class="panel">${estadoVacio({ icono: "chart", titulo: "No hay visitas con estos filtros",
      texto: "Cambia el periodo, el responsable, la zona o el estado." })}</div>`;
    return;
  }

  const kpi = (nombre, valor, color, sub = "") => `
    <div class="kpi">
      <span class="kpi-nombre">${color ? `<i style="background:${color}"></i>` : ""}${nombre}</span>
      <span class="kpi-valor">${valor}</span>
      ${sub ? `<span class="kpi-sub">${sub}</span>` : ""}
    </div>`;
  const color = (k) => SERIES_ESTADO.find((s) => s.clave === k).color;
  const porc = (x) => (r.agendadas ? `${Math.round((x / r.agendadas) * 100)} %` : "");

  destino.innerHTML = `
    ${filtro.estado ? `<p class="aviso-suave aviso-filtro">${icono("info", 16)} Las cifras incluyen solo visitas en estado <strong>${esc(ESTADO_LABEL[filtro.estado])}</strong>.</p>` : ""}
    <section class="kpis">
      ${kpi("Total agendadas", n(r.agendadas))}
      ${kpi("Finalizadas", n(r.FINALIZADA), color("FINALIZADA"), porc(r.FINALIZADA))}
      ${kpi("Programadas", n(r.PROGRAMADA), color("PROGRAMADA"), r.vencidas ? `<span class="texto-alerta">${n(r.vencidas)} vencida${r.vencidas === 1 ? "" : "s"}</span>` : porc(r.PROGRAMADA))}
      ${kpi("Pendientes", n(r.PENDIENTE), color("PENDIENTE"), porc(r.PENDIENTE))}
      ${kpi("Reprogramadas", n(r.REPROGRAMADA), color("REPROGRAMADA"), porc(r.REPROGRAMADA))}
      <div class="kpi kpi-destacado">
        <span class="kpi-nombre">Cumplimiento</span>
        <span class="kpi-valor">${formatearPorcentaje(r.cumplimiento)}</span>
        <span class="kpi-sub">${n(r.realizadas)} de ${n(r.exigibles)} con fecha cumplida</span>
      </div>
      ${kpi("Clientes visitados", n(d.clientes.length), "", "con al menos una visita realizada")}
    </section>

    <section class="panel">
      <div class="panel-titulo-fila"><h2 class="panel-titulo">Visitas por responsable</h2><span class="texto-suave">Orden alfabético</span></div>
      <div class="tabla-scroll">
        <table class="tabla tabla-reporte">
          <thead><tr><th>Responsable</th><th class="num">Agendadas</th><th class="num">Finalizadas</th><th class="num">Pendientes</th><th class="num">Reprogramadas</th><th class="num">Programadas</th><th class="num">Vencidas</th><th>Cumplimiento</th></tr></thead>
          <tbody>${d.coordinadores.map((g) => `
            <tr>
              <td><div class="persona"><span class="avatar">${esc(iniciales(g.nombre))}</span><strong>${esc(g.nombre)}</strong></div></td>
              <td class="num"><strong>${n(g.agendadas)}</strong></td>
              <td class="num">${n(g.FINALIZADA)}</td><td class="num">${n(g.PENDIENTE)}</td><td class="num">${n(g.REPROGRAMADA)}</td><td class="num">${n(g.PROGRAMADA)}</td>
              <td class="num">${g.vencidas ? `<span class="texto-alerta">${n(g.vencidas)}</span>` : "0"}</td>
              <td class="celda-cumplimiento"><div class="cumpl"><span>${formatearPorcentaje(g.cumplimiento)}</span><span class="progreso"><span style="width:${Math.round((g.cumplimiento || 0) * 100)}%"></span></span></div></td>
            </tr>`).join("")}
          </tbody>
          ${d.coordinadores.length > 1 ? `<tfoot><tr><td>Total</td><td class="num">${n(r.agendadas)}</td><td class="num">${n(r.FINALIZADA)}</td><td class="num">${n(r.PENDIENTE)}</td><td class="num">${n(r.REPROGRAMADA)}</td><td class="num">${n(r.PROGRAMADA)}</td><td class="num">${n(r.vencidas)}</td><td class="celda-cumplimiento"><div class="cumpl"><span>${formatearPorcentaje(r.cumplimiento)}</span></div></td></tr></tfoot>` : ""}
        </table>
      </div>
    </section>

    <section class="graficos">
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>Visitas por semana</h3><p>Estado actual de las visitas de cada semana del periodo</p></header>
        ${columnasApiladas(d.semanas.map((s) => ({
          clave: s.desde, total: s.agendadas, valores: valores(s),
          etiqueta: formatearFecha(s.desde, { day: "numeric", month: "short" }).replace(" de ", " "),
          titulo: `Semana del ${formatearFecha(s.desde, { day: "numeric", month: "short" })} al ${formatearFecha(s.hasta, { day: "numeric", month: "short" })}`,
        })), SERIES_ESTADO, { resaltar: lunesDe(d.hoy) })}
      </article>
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>Estados</h3><p>Distribución de las ${n(r.agendadas)} visitas agendadas</p></header>
        ${barrasSimples(SERIES_ESTADO.map((s) => ({ etiqueta: s.nombre, valor: r[s.clave], color: s.color })), r.agendadas)}
        ${r.vencidas ? `<p class="nota-grafico texto-alerta">${icono("alert", 15)} ${n(r.vencidas)} de las programadas ya tienen la fecha vencida.</p>` : ""}
      </article>
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>Visitas por zona</h3><p>Agendadas por zona y su estado actual</p></header>
        ${barrasApiladas(d.zonas.map((z) => ({ etiqueta: z.etiqueta, total: z.agendadas, valores: valores(z) })), SERIES_ESTADO)}
      </article>
      <article class="panel grafico grafico-etiquetas-largas">
        <header class="grafico-cabecera"><h3>Tipo de visita</h3><p>Primer acercamiento, seguimiento y motivos anteriores</p></header>
        ${barrasSimples(d.motivos.map((m) => ({ etiqueta: m.etiqueta, valor: m.agendadas, color: COLOR_MOTIVO })), r.agendadas)}
      </article>
      <article class="panel grafico">
        <header class="grafico-cabecera"><h3>Novedades</h3><p>En ${n(d.novedades.conResultado)} visita${d.novedades.conResultado === 1 ? "" : "s"} realizada${d.novedades.conResultado === 1 ? "" : "s"}. Una visita puede tener varias</p></header>
        ${d.novedades.filas.length ? barrasSimples(d.novedades.filas.map((x) => ({ ...x, color: COLOR_NOVEDAD })), d.novedades.conResultado)
          : `<p class="vacio">Aún no hay novedades registradas en este periodo.</p>`}
      </article>
    </section>

    <section class="panel">
      <div class="panel-titulo-fila">
        <h2 class="panel-titulo">Clientes visitados</h2>
        <span class="texto-suave">${n(d.clientes.length)} cliente${d.clientes.length === 1 ? "" : "s"}${d.clientes.length > MAX_CLIENTES_PANTALLA ? `. Se muestran los primeros ${MAX_CLIENTES_PANTALLA}; el Excel trae todos` : ""}</span>
      </div>
      ${d.clientes.length ? `
      <div class="tabla-scroll">
        <table class="tabla tabla-reporte tabla-clic">
          <thead><tr><th>Código</th><th>Cliente</th><th>Zona</th><th class="num">Realizadas</th><th class="num">Agendadas</th><th>Última visita</th><th>Responsable</th></tr></thead>
          <tbody>${d.clientes.slice(0, MAX_CLIENTES_PANTALLA).map((c) => `
            <tr data-cliente="${esc(c.clienteId)}" tabindex="0" title="Abrir ficha del cliente">
              <td>${chapeta(c.codigo)}</td><td><strong>${esc(c.cliente)}</strong></td><td>${esc(c.zona)}</td>
              <td class="num"><strong>${n(c.realizadas)}</strong></td><td class="num">${n(c.agendadas)}</td>
              <td>${esc(formatearFecha(c.ultima, { day: "numeric", month: "short" }))}</td><td>${esc(c.responsables)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<p class="vacio">Ninguna visita realizada en este periodo.</p>`}
    </section>`;

  const abrir = (e) => { const fila = e.target.closest("[data-cliente]"); if (fila) irAFicha(fila.dataset.cliente); };
  destino.querySelectorAll(".tabla-clic").forEach((t) => {
    t.addEventListener("click", abrir);
    t.addEventListener("keydown", (e) => e.key === "Enter" && abrir(e));
  });
  activarTooltips(destino);
}
