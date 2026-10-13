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

// ---------- Coordinador ----------

async function renderCoordinador(cont, ctx) {
  if (filtro.periodo === "rango") filtro.periodo = "mes";
  const rango = rangoFiltro();
  const rangoAnt = rangoAnterior(rango);
  const primerNombre = (ctx.perfil.nombre || "").split(" ")[0];
  const hoy = hoyISO();
  const fechaHoy = formatearFecha(hoy, { weekday: "long", day: "numeric", month: "long" });
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div><h1>Hola, ${esc(primerNombre)}</h1><p class="texto-suave inicio-fecha">${esc(fechaHoy)}</p></div>
    </header>
    <div id="tablero">${esqueleto(1, 220)}${esqueleto(3, 64)}</div>`;

  let todas;
  try {
    // Periodo actual y anterior, más 6 meses atrás para las vencidas y lo que viene en adelante.
    const desde = [rango.desde, rangoAnt.desde, sumarDias(hoy, -DIAS_VENCIDAS)].filter(Boolean).sort()[0];
    todas = await listarVisitas(ctx, { desde });
  } catch (err) {
    console.error(err);
    cont.querySelector("#tablero").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cont.querySelector("#tablero")) return;

  const r = resumen(filtrarVisitas(todas, rango), hoy);
  const previo = resumen(filtrarVisitas(todas, rangoAnt), hoy);
  const deHoy = ordenarVisitas(todas.filter((v) => v.fechaProgramada === hoy));
  const siguiente = deHoy.find((v) => puedeRegistrar(v));
  const vencidas = ordenarVisitas(todas.filter((v) => sinResultado(v) && v.fechaProgramada < hoy));
  const proximas = ordenarVisitas(todas.filter((v) => sinResultado(v) && v.fechaProgramada > hoy)).slice(0, 5);
  const recientes = todas.filter((v) => v.resultado?.fechaHora)
    .sort((a, b) => b.resultado.fechaHora.localeCompare(a.resultado.fechaHora)).slice(0, 4);
  const realizadasHoy = deHoy.filter((v) => v.resultado).length;

  const item = (v, detalle, estado = null) => `
    <li class="mini-visita" data-id="${v.id}" tabindex="0">
      <div class="mini-visita-cuerpo">
        <div class="mini-visita-cabeza">${chapeta(v.codigo)}${estado ? badgeEstado(estado) : ""}</div>
        <strong>${esc(nombreCliente(v))}</strong>
        <span class="texto-suave">${detalle}</span>
      </div>
      ${icono("next", 20)}
    </li>`;

  const tel = siguiente ? telefonoPrincipal(siguiente.sede?.celular) : "";
  const destacada = siguiente ? `
    <article class="proxima" data-id="${siguiente.id}">
      <div class="proxima-hora">
        <span>Siguiente</span>
        <strong>${esc(formatearHora(siguiente.horaProgramada))}</strong>
      </div>
      <div class="proxima-cuerpo">
        <div class="mini-visita-cabeza">${chapeta(siguiente.codigo)}${siguiente.marcas?.length ? `<span class="marca-texto">${esc(siguiente.marcas.join(", "))}</span>` : ""}</div>
        <h3>${esc(nombreCliente(siguiente))}</h3>
        ${expendioSecundario(siguiente) ? `<p class="proxima-expendio">${esc(expendioSecundario(siguiente))}</p>` : ""}
        <ul class="proxima-datos">
          ${siguiente.sede?.direccion ? `<li>${icono("pin", 16)}${esc([siguiente.sede.direccion, siguiente.ciudad].filter(Boolean).join(", "))}</li>` : ""}
          <li>${icono("info", 16)}${esc(siguiente.motivo)}</li>
        </ul>
        <div class="proxima-acciones">
          ${visitaEnCurso(siguiente)
            ? `<button type="button" class="btn btn-primario btn-grande" data-registrar="${siguiente.id}">${icono("next", 20)}Continuar visita</button>`
            : `<button type="button" class="btn btn-primario btn-grande" data-brief="${siguiente.id}">${icono("clock", 20)}Preparar visita</button>`}
          ${tel ? `<a class="btn btn-secundario" href="tel:${tel}">${icono("phone", 18)}Llamar</a>` : ""}
        </div>
      </div>
    </article>` : "";

  const recorrido = deHoy.length > (siguiente ? 1 : 0) ? `
    <ol class="recorrido">${deHoy.filter((v) => v !== siguiente).map((v) => {
      const estado = estadoVisible(v, hoy);
      return `
      <li class="recorrido-item ${v.resultado ? "hecho" : ""}" data-id="${v.id}" tabindex="0">
        <span class="recorrido-hora">${esc(formatearHora(v.horaProgramada))}</span>
        <span class="recorrido-punto" aria-hidden="true">${v.resultado ? icono("ok", 12) : ""}</span>
        <span class="recorrido-cliente"><strong>${esc(nombreCliente(v))}</strong><span>${esc(v.codigo)}</span></span>
        ${badgeEstado(estado)}
      </li>`;
    }).join("")}</ol>` : "";

  const valores = SERIES_ESTADO.map((s) => `
    <div><span><i style="background:${s.color}"></i>${s.nombre}</span><strong>${n(r[s.clave])}</strong></div>`).join("");

  cont.querySelector("#tablero").innerHTML = `
    <div class="inicio">
      <section class="inicio-hoy" aria-labelledby="t-hoy">
        <div class="seccion-cabecera">
          <h2 id="t-hoy">Hoy</h2>
          <span class="texto-suave">${deHoy.length ? `${realizadasHoy} de ${deHoy.length} visita${deHoy.length === 1 ? "" : "s"} registrada${realizadasHoy === 1 ? "" : "s"}` : "Sin visitas programadas"}</span>
        </div>
        ${destacada}
        ${!siguiente && deHoy.length ? `<p class="inicio-listo">${icono("ok", 20)}Registraste todas las visitas de hoy.</p>` : ""}
        ${!deHoy.length ? `<div class="inicio-libre">${estadoVacio({ icono: "calendar", titulo: "No tienes visitas para hoy", texto: "Aprovecha para programar las de esta semana.", accion: `<button type="button" class="btn btn-primario" data-nueva>${icono("plus", 18)}Programar visita</button>` })}</div>` : ""}
        ${recorrido}
      </section>

      ${vencidas.length ? `
      <section class="inicio-vencidas" aria-labelledby="t-vencidas">
        <div class="vencidas-cabeza">${icono("alert", 22)}<div>
          <h2 id="t-vencidas">${vencidas.length} visita${vencidas.length === 1 ? "" : "s"} sin resultado</h2>
          <p>Su fecha ya pasó. Registra el resultado o reprográmalas.</p></div></div>
        <ul class="mini-lista">${vencidas.slice(0, 4).map((v) => item(v, esc(etiquetaDia(v.fechaProgramada)))).join("")}</ul>
      </section>` : ""}

      <aside class="inicio-gestion" aria-labelledby="t-gestion">
        <div class="gestion-cabeza">
          <h2 id="t-gestion">Tu gestión</h2>
          ${selectorPeriodo(false)}
        </div>
        <div class="gestion-cumplimiento">
          <span>Cumplimiento</span>
          <strong>${r.cumplimiento == null ? "—" : formatearPorcentaje(r.cumplimiento)}</strong>
          <div class="progreso progreso-oscuro"><span style="width:${Math.round((r.cumplimiento || 0) * 100)}%"></span></div>
          <small>${r.exigibles ? `${n(r.realizadas)} realizadas de ${n(r.exigibles)} con fecha cumplida` : "Aún no hay visitas con fecha cumplida"}</small>
        </div>
        <div class="gestion-total">
          <strong>${n(r.agendadas)}</strong><span>visitas agendadas ${esc({ hoy: "hoy", semana: "esta semana" }[filtro.periodo] || `en ${nombrePeriodo(rango).toLowerCase()}`)}</span>
          ${variacion(r.agendadas, (previo.agendadas || previo.exigibles) ? previo.agendadas : null, { contexto: textoAnterior(rangoAnt) })}
        </div>
        ${barraEstados(r)}
        <div class="gestion-estados">${valores}</div>
      </aside>

      <section class="inicio-proximas" aria-labelledby="t-proximas">
        <h2 class="inicio-subtitulo" id="t-proximas">Próximos días</h2>
        ${proximas.length ? `<ul class="mini-lista">${proximas.map((v) => item(v, `${esc(etiquetaDia(v.fechaProgramada))}, ${esc(formatearHora(v.horaProgramada))}`)).join("")}</ul>`
          : `<p class="texto-suave inicio-nada">No tienes visitas programadas después de hoy.</p>`}
      </section>

      <section class="inicio-recientes" aria-labelledby="t-recientes">
        <h2 class="inicio-subtitulo" id="t-recientes">Registradas recientemente</h2>
        ${recientes.length ? `<ul class="mini-lista">${recientes.map((v) => item(v,
          esc(formatearFecha(v.resultado.fechaHora.slice(0, 10), { day: "numeric", month: "long" })), estadoVisible(v))).join("")}</ul>`
          : `<p class="texto-suave inicio-nada">Cuando registres el resultado de una visita aparecerá aquí.</p>`}
      </section>
    </div>`;

  enlazarPeriodo(cont, ctx);
  const tablero = cont.querySelector("#tablero");
  activarTooltips(tablero);
  tablero.querySelector("[data-nueva]")?.addEventListener("click", () => irANuevaVisita());
  const volver = { onVolver: () => render(cont, ctx), textoVolver: "Volver al inicio" };
  const abrir = (e) => {
    if (e.target.closest("a[href^='tel:']")) return;
    const reg = e.target.closest("[data-registrar]");
    if (reg) return abrirVisita(cont, ctx, reg.dataset.registrar, { ...volver, accion: "resultado" });
    const brief = e.target.closest("[data-brief]");
    if (brief) return abrirVisita(cont, ctx, brief.dataset.brief, volver);
    const fila = e.target.closest("[data-id]");
    if (fila && !fila.classList.contains("proxima")) abrirVisita(cont, ctx, fila.dataset.id, volver);
  };
  tablero.addEventListener("click", abrir);
  tablero.addEventListener("keydown", (e) => e.key === "Enter" && abrir(e));
}
