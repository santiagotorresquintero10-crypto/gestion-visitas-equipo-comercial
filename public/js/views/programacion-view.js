// Programación de visitas: agenda por periodo y flujo PROGRAMAR VISITA:
//   ¿A quién? → Cliente actual: buscar → tipo de visita → fecha/hora  |  Cliente prospecto: datos del prospecto → fecha/hora.
import { rutaPasos, esc, toast, setCargando, enlaceTel, icono, chapeta, badgeEstado, estadoVacio, esqueleto, confirmar, telefonoPrincipal } from "../ui.js";
import { ESTADOS_VISITA, ESTADO_LABEL, ROLES } from "../constants.js";
import { selectorTipoVisita } from "../components/tipo-visita.js";
import { crearBuscador } from "../components/buscador-clientes.js";
import { abrirVisita } from "../components/visita-detalle.js";
import { abrirFicha } from "../components/ficha-cliente.js";
import { tomarClientePendiente, tomarNuevaVisita } from "../utils/navegacion.js";
import { listarVisitas, ordenarVisitas, estadoVisible, sedesDeCliente, crearVisita, crearVisitaProspecto } from "../services/visitas-service.js";
import { camposProspecto, leerProspecto, erroresProspecto } from "../components/prospecto.js";
import { listarUsuarios } from "../services/users-service.js";
import { normalizarTexto } from "../services/excel-clientes.js";
import { mensajeError } from "../services/auth-service.js";
import { hoyISO, etiquetaDia, formatearHora, formatearFechaLarga, sumarDias, deISO, aISO } from "../utils/fechas.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const VISTAS = [["mes", "Mes"], ["semana", "Semana"], ["lista", "Lista"]];
const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MAX_EVENTOS_CELDA = 3;

// Estado del calendario: se conserva mientras la persona navega dentro de la sesión.
const filtro = { vista: "mes", ancla: hoyISO(), dia: hoyISO(), estado: "", coordinador: "" };
let coordinadores = null; // solo admin: personas a las que puede asignar visitas (coordinadores y administradores activos)

export async function render(cont, ctx) {
  if (ctx.esAdmin && !coordinadores) {
    const activos = (await listarUsuarios().catch(() => [])).filter((u) => u.activo);
    if (!activos.some((u) => u.uid === ctx.perfil.uid)) activos.push(ctx.perfil);
    // Coordinadores primero; luego administradores (el administrador también puede hacer visitas).
    coordinadores = activos.sort((a, b) =>
      (a.rol === ROLES.COORDINADOR ? 0 : 1) - (b.rol === ROLES.COORDINADOR ? 0 : 1) || a.nombre.localeCompare(b.nombre, "es"));
  }
  const pendiente = tomarClientePendiente();
  if (pendiente) return renderFormulario(cont, ctx, pendiente);
  if (tomarNuevaVisita()) return renderElegir(cont, ctx);
  renderAgenda(cont, ctx);
}

// ---------- Agenda en calendario ----------

const primeroDelMes = (iso) => `${iso.slice(0, 8)}01`;
const finDelMes = (iso) => { const d = deISO(primeroDelMes(iso)); return aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const lunesDe = (iso) => sumarDias(iso, -((deISO(iso).getDay() + 6) % 7));

// Rango que se consulta y se dibuja según la vista.
function rangoVista() {
  if (filtro.vista === "semana") {
    const desde = lunesDe(filtro.ancla);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const inicioMes = primeroDelMes(filtro.ancla), finMes = finDelMes(filtro.ancla);
  if (filtro.vista === "lista") return { desde: inicioMes, hasta: finMes };
  const desde = lunesDe(inicioMes);
  return { desde, hasta: sumarDias(lunesDe(finMes), 6) };
}

function tituloVista() {
  const d = deISO(filtro.ancla);
  if (filtro.vista === "semana") {
    const { desde, hasta } = rangoVista();
    const a = deISO(desde), b = deISO(hasta);
    const mismoMes = a.getMonth() === b.getMonth();
    return `${a.getDate()}${mismoMes ? "" : " " + a.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")} al ${b.getDate()} de ${b.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`;
  }
  const t = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function moverAncla(paso) {
  if (filtro.vista === "semana") {
    filtro.ancla = sumarDias(filtro.ancla, 7 * paso);
    filtro.dia = filtro.ancla;
    return;
  }
  const d = deISO(primeroDelMes(filtro.ancla));
  filtro.ancla = aISO(new Date(d.getFullYear(), d.getMonth() + paso, 1));
  const hoy = hoyISO();
  filtro.dia = hoy.slice(0, 7) === filtro.ancla.slice(0, 7) ? hoy : filtro.ancla;
}

function renderAgenda(cont, ctx) {
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div><h1>Agenda</h1>
        <p class="texto-suave">${ctx.esAdmin ? "Visitas programadas de todo el equipo" : "Tus visitas programadas"}</p></div>
      <button class="btn btn-primario btn-grande" id="btn-programar">${icono("plus", 20)}Programar visita</button>
    </header>

    <section class="calendario">
      <div class="cal-barra">
        <div class="cal-nav">
          <button type="button" class="btn-icono" data-mover="-1" aria-label="Anterior">${icono("back", 22)}</button>
          <h2 class="cal-titulo">${esc(tituloVista())}</h2>
          <button type="button" class="btn-icono" data-mover="1" aria-label="Siguiente">${icono("next", 22)}</button>
          <button type="button" class="btn btn-sm btn-secundario" id="cal-hoy">Hoy</button>
        </div>
        <div class="barra-filtros">
          <div class="segmentos" role="tablist" aria-label="Vista">
            ${VISTAS.map(([id, t]) => `<button role="tab" aria-selected="${filtro.vista === id}" class="segmento ${filtro.vista === id ? "activo" : ""}" data-vista="${id}">${t}</button>`).join("")}
          </div>
          <label class="filtro"><span>Estado</span>
            <select id="f-estado">
              <option value="">Todos</option>
              ${Object.entries(ESTADO_LABEL).map(([k, t]) => `<option value="${k}" ${filtro.estado === k ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </label>
          ${ctx.esAdmin ? `
          <label class="filtro"><span>Responsable</span>
            <select id="f-coord">
              <option value="">Todos</option>
              ${coordinadores.map((u) => `<option value="${u.uid}" ${filtro.coordinador === u.uid ? "selected" : ""}>${esc(nombreResponsable(u, ctx))}</option>`).join("")}
            </select>
          </label>` : ""}
        </div>
      </div>
      <div id="agenda">${esqueleto(1, 420)}</div>
    </section>`;

  cont.querySelector("#btn-programar").onclick = () => renderElegir(cont, ctx);
  cont.querySelectorAll("[data-vista]").forEach((b) => b.onclick = () => { filtro.vista = b.dataset.vista; filtro.ancla = filtro.dia; renderAgenda(cont, ctx); });
  cont.querySelectorAll("[data-mover]").forEach((b) => b.onclick = () => { moverAncla(Number(b.dataset.mover)); renderAgenda(cont, ctx); });
  cont.querySelector("#cal-hoy").onclick = () => { filtro.ancla = filtro.dia = hoyISO(); renderAgenda(cont, ctx); };
  cont.querySelector("#f-estado").onchange = (e) => { filtro.estado = e.target.value; pintarAgenda(cont, ctx); };
  const fc = cont.querySelector("#f-coord");
  if (fc) fc.onchange = (e) => { filtro.coordinador = e.target.value; pintarAgenda(cont, ctx); };

  const agenda = cont.querySelector("#agenda");
  agenda.addEventListener("click", (e) => {
    const visita = e.target.closest("[data-id]");
    if (visita) return abrirVisita(cont, ctx, visita.dataset.id, { onVolver: () => renderAgenda(cont, ctx), textoVolver: "Volver a la agenda" });
    const dia = e.target.closest("[data-dia]");
    if (dia) {
      filtro.dia = dia.dataset.dia;
      if (filtro.dia.slice(0, 7) !== filtro.ancla.slice(0, 7) && filtro.vista === "mes") { filtro.ancla = filtro.dia; return renderAgenda(cont, ctx); }
      return pintarAgenda(cont, ctx);
    }
    const nueva = e.target.closest("[data-programar-dia]");
    if (nueva) renderElegir(cont, ctx, { fecha: nueva.dataset.programarDia });
  });
  agenda.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-id]")) e.target.closest("[data-id]").click();
  });

  cargarAgenda(cont, ctx);
}

let visitas = [];
async function cargarAgenda(cont, ctx) {
  try {
    visitas = await listarVisitas(ctx, rangoVista());
    pintarAgenda(cont, ctx);
  } catch (err) {
    console.error(err);
    const a = cont.querySelector("#agenda");
    if (a) a.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
  }
}

function visitasFiltradas(hoy) {
  return ordenarVisitas(visitas
    .filter((v) => !filtro.estado || estadoVisible(v, hoy) === filtro.estado)
    .filter((v) => !filtro.coordinador || v.coordinadorUid === filtro.coordinador));
}

function porDia(lista) {
  const grupos = new Map();
  lista.forEach((v) => (grupos.get(v.fechaProgramada) || grupos.set(v.fechaProgramada, []).get(v.fechaProgramada)).push(v));
  return grupos;
}

function pintarAgenda(cont, ctx) {
  const destino = cont.querySelector("#agenda");
  if (!destino) return;
  const hoy = hoyISO();
  const grupos = porDia(visitasFiltradas(hoy));
  if (filtro.vista === "mes") destino.innerHTML = vistaMes(grupos, hoy, ctx);
  else if (filtro.vista === "semana") destino.innerHTML = vistaSemana(grupos, hoy, ctx);
  else destino.innerHTML = vistaLista(grupos, hoy, ctx);
}

function evento(v, hoy) {
  const estado = estadoVisible(v, hoy);
  return `<span class="cal-evento estado-${estado.toLowerCase()}"><b>${esc(formatearHora(v.horaProgramada).replace(" a. m.", "a").replace(" p. m.", "p"))}</b> ${esc(nombreCliente(v))}</span>`;
}

function vistaMes(grupos, hoy, ctx) {
  const { desde } = rangoVista();
  const mes = filtro.ancla.slice(0, 7);
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(desde, i));
  const semanas = celdas[35].slice(0, 7) === mes ? 6 : 5; // 5 o 6 filas según el mes
  return `
    <div class="cal-contenedor">
      <div class="cal-mes" style="--filas:${semanas}">
        ${DIAS_SEMANA.map((d) => `<span class="cal-dia-semana">${d}</span>`).join("")}
        ${celdas.slice(0, semanas * 7).map((iso) => {
          const lista = grupos.get(iso) || [];
          const clases = ["cal-celda", iso.slice(0, 7) !== mes ? "fuera" : "", iso === hoy ? "hoy" : "", iso === filtro.dia ? "sel" : "", lista.length ? "con-visitas" : ""].join(" ");
          return `
            <button type="button" class="${clases}" data-dia="${iso}" aria-label="${esc(formatearFechaLarga(iso))}: ${lista.length} visita${lista.length === 1 ? "" : "s"}">
              <span class="cal-num">${Number(iso.slice(8))}</span>
              <span class="cal-eventos">${lista.slice(0, MAX_EVENTOS_CELDA).map((v) => evento(v, hoy)).join("")}${lista.length > MAX_EVENTOS_CELDA ? `<span class="cal-mas">+${lista.length - MAX_EVENTOS_CELDA} más</span>` : ""}</span>
              <span class="cal-puntos">${lista.slice(0, 4).map((v) => `<i class="punto-${estadoVisible(v, hoy).toLowerCase()}"></i>`).join("")}</span>
            </button>`;
        }).join("")}
      </div>
      ${panelDia(grupos.get(filtro.dia) || [], hoy, ctx)}
    </div>`;
}

function panelDia(lista, hoy, ctx) {
  const titulo = etiquetaDia(filtro.dia);
  return `
    <aside class="cal-panel" aria-live="polite">
      <div class="cal-panel-cabeza">
        <div><h3>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h3>
          <span class="texto-suave">${lista.length ? `${lista.length} visita${lista.length === 1 ? "" : "s"}` : "Sin visitas"}</span></div>
        ${filtro.dia >= hoy ? `<button type="button" class="btn btn-sm btn-secundario" data-programar-dia="${filtro.dia}">${icono("plus", 16)}Programar</button>` : ""}
      </div>
      ${lista.length ? `<ul class="lista-visitas">${lista.map((v) => itemVisita(v, ctx, hoy)).join("")}</ul>`
        : `<p class="cal-panel-vacio">${filtro.dia >= hoy ? "Día libre. Puedes programar una visita para este día." : "No hubo visitas este día."}</p>`}
    </aside>`;
}

function vistaSemana(grupos, hoy, ctx) {
  const { desde } = rangoVista();
  return `
    <div class="cal-semana">
      ${Array.from({ length: 7 }, (_, i) => {
        const iso = sumarDias(desde, i);
        const lista = grupos.get(iso) || [];
        const d = deISO(iso);
        return `
          <section class="cal-col ${iso === hoy ? "hoy" : ""}">
            <header class="cal-col-cabeza">
              <span class="cal-col-dia">${DIAS_SEMANA[i]}</span><strong>${d.getDate()}</strong>
              ${iso >= hoy ? `<button type="button" class="btn-icono btn-mini" data-programar-dia="${iso}" aria-label="Programar el ${esc(formatearFechaLarga(iso))}">${icono("plus", 16)}</button>` : ""}
            </header>
            ${lista.length ? lista.map((v) => {
              const estado = estadoVisible(v, hoy);
              return `
              <button type="button" class="cal-tarjeta estado-borde-${estado.toLowerCase()}" data-id="${v.id}">
                <span class="cal-tarjeta-hora">${esc(formatearHora(v.horaProgramada))}</span>
                <strong>${esc(nombreCliente(v))}</strong>
                <span class="cal-tarjeta-pie">${chapeta(v.codigo)}${ctx.esAdmin ? `<span>${esc(v.coordinadorNombre.split(" ")[0])}</span>` : ""}</span>
              </button>`;
            }).join("") : `<span class="cal-col-vacia">Sin visitas</span>`}
          </section>`;
      }).join("")}
    </div>`;
}

function vistaLista(grupos, hoy, ctx) {
  if (!grupos.size) {
    return `<div class="panel">${estadoVacio({ icono: "calendar", titulo: "No hay visitas este mes",
      texto: filtro.estado || filtro.coordinador ? "Prueba con otro estado o responsable." : "Busca un cliente y agenda la próxima visita.",
      accion: `<button type="button" class="btn btn-primario" data-programar-dia="${hoy}">${icono("plus", 18)}Programar visita</button>` })}</div>`;
  }
  const total = [...grupos.values()].reduce((a, l) => a + l.length, 0);
  return `
    <p class="texto-suave conteo">${total} visita${total === 1 ? "" : "s"} este mes</p>
    ${[...grupos.entries()].map(([fecha, items]) => `
      <div class="grupo-dia">
        <h3 class="grupo-titulo">${esc(etiquetaDia(fecha))}</h3>
        <ul class="lista-visitas">${items.map((v) => itemVisita(v, ctx, hoy)).join("")}</ul>
      </div>`).join("")}`;
}

function itemVisita(v, ctx, hoy) {
  const estado = estadoVisible(v, hoy);
  const marcas = v.marcas || [];
  return `
    <li class="visita visita-clic estado-borde-${estado.toLowerCase()}" data-id="${v.id}" tabindex="0">
      <div class="visita-hora">${esc(formatearHora(v.horaProgramada))}</div>
      <div class="visita-cuerpo">
        <div class="visita-cabeza">${chapeta(v.codigo)}${marcas.length ? `<span class="marca-texto">${esc(marcas.slice(0, 2).join(", "))}${marcas.length > 2 ? ` +${marcas.length - 2}` : ""}</span>` : ""}</div>
        <div class="visita-titulo">${esc(nombreCliente(v))}</div>
        ${expendioSecundario(v) ? `<div class="visita-sub">${esc(expendioSecundario(v))}</div>` : ""}
        <div class="visita-meta">
          <span>${icono("info", 15)}${esc(v.motivo)}</span>
          ${v.zona ? `<span>${icono("pin", 15)}${esc(v.zona)}</span>` : ""}
          ${ctx.esAdmin ? `<span>${icono("user", 15)}${esc(v.coordinadorNombre)}</span>` : ""}
          ${v.vecesReprogramada ? `<span>${icono("repeat", 15)}Reprogramada ${v.vecesReprogramada} ${v.vecesReprogramada === 1 ? "vez" : "veces"}</span>` : ""}
        </div>
      </div>
      <div class="visita-estado">${badgeEstado(estado)}${icono("next", 20)}</div>
    </li>`;
}

// ---------- Programar visita ----------

const PASOS_CLIENTE = ["¿A quién?", "Cliente", "Datos de la visita"];
const PASOS_PROSPECTO = ["¿A quién?", "Agendar visita"];

// Primer paso: cliente de la base o prospecto (antes de mostrar el buscador).
function renderElegir(cont, ctx, preset = {}) {
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" id="btn-volver">${icono("back", 18)}Agenda</button>
        <h1>Programar visita</h1>
        ${preset.fecha ? `<p class="texto-suave">Para el ${esc(formatearFechaLarga(preset.fecha))}.</p>` : ""}
        ${rutaPasos(PASOS_CLIENTE, 0)}
      </div>
    </header>
    <section class="elegir-destinatario" aria-labelledby="t-quien">
      <h2 class="reg-pregunta" id="t-quien">¿A quién vas a visitar?</h2>
      <div class="destinatarios">
        <button type="button" class="destinatario" data-destino="cliente">
          <span class="destinatario-icono">${icono("store", 28)}</span>
          <strong>Cliente actual</strong>
          <span>Cliente registrado en la base</span>
          <em>Buscar en base de clientes ${icono("next", 18)}</em>
        </button>
        <button type="button" class="destinatario destinatario-prospecto" data-destino="prospecto">
          <span class="destinatario-icono">${icono("plus", 28)}</span>
          <strong>Cliente prospecto</strong>
          <span>Posible nuevo cliente, aún sin código</span>
          <em>Registrar prospecto ${icono("next", 18)}</em>
        </button>
      </div>
    </section>`;
  cont.querySelector("#btn-volver").onclick = () => renderAgenda(cont, ctx);
  cont.querySelector("[data-destino=cliente]").onclick = () => renderProgramar(cont, ctx, preset);
  cont.querySelector("[data-destino=prospecto]").onclick = () => renderProspecto(cont, ctx, preset);
}

// Bloque común de programación: responsable (admin), fecha con atajos, hora y observación previa.
function camposProgramacion(ctx, fechaInicial, sugerido) {
  return `
      ${ctx.esAdmin ? `
      <label class="campo"><span>¿Quién hará la visita?</span>
        <select name="coordinador" required>
          ${coordinadores.map((u) => `<option value="${u.uid}" ${sugerido?.uid === u.uid ? "selected" : ""}>${esc(nombreResponsable(u, ctx))}</option>`).join("")}
        </select>
      </label>` : ""}
      <div class="campo">
        <span>Fecha de visita</span>
        <div class="atajos-fecha" role="group" aria-label="Atajos de fecha">
          ${[["Hoy", 0], ["Mañana", 1], ["Pasado mañana", 2]].map(([t, d]) => `<button type="button" class="atajo ${sumarDias(hoyISO(), d) === fechaInicial ? "activo" : ""}" data-dias="${d}">${t}</button>`).join("")}
        </div>
      </div>
      <div class="form-fila">
        <label class="campo"><span>Fecha</span><input type="date" name="fecha" min="${hoyISO()}" value="${fechaInicial}" required></label>
        <label class="campo"><span>Hora</span><input type="time" name="hora" value="09:00" required></label>
      </div>
      <label class="campo"><span>Observación previa <small class="texto-suave">(opcional)</small></span>
        <textarea name="observacion" rows="3" maxlength="500" placeholder="Algo a tener en cuenta antes de la visita"></textarea>
      </label>`;
}

function enlazarFechas(cont, form) {
  cont.querySelectorAll("[data-dias]").forEach((b) => b.onclick = () => {
    form.fecha.value = sumarDias(hoyISO(), Number(b.dataset.dias));
    cont.querySelectorAll("[data-dias]").forEach((x) => x.classList.toggle("activo", x === b));
  });
  form.fecha.addEventListener("change", () => {
    cont.querySelectorAll("[data-dias]").forEach((x) => x.classList.toggle("activo", sumarDias(hoyISO(), Number(x.dataset.dias)) === form.fecha.value));
  });
}

// Cliente prospecto: sin buscador ni código; no se agrega a la base de clientes.
function renderProspecto(cont, ctx, preset = {}) {
  const fechaInicial = preset.fecha && preset.fecha >= hoyISO() ? preset.fecha : hoyISO();
  const sugerido = ctx.esAdmin ? coordinadores.find((u) => u.uid === ctx.perfil.uid) : null;
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" id="btn-volver">${icono("back", 18)}Cambiar a quién visitar</button>
        <h1>Programar visita</h1>
        ${rutaPasos(PASOS_PROSPECTO, 1)}
      </div>
    </header>
    <form class="programar-prospecto" id="form-visita" novalidate>
      <section class="panel form prospecto-datos">
        <p class="aviso-suave">${icono("info", 16)} Aquí solo se agenda la visita. Teléfono, tipo de cliente, cantidad semanal, temas e interés se piden al presionar «Iniciar visita».</p>
        ${camposProspecto(preset.prospecto || {}, { soloNombre: true })}
      </section>
      <section class="panel form prospecto-programacion">
        <h2 class="panel-titulo">${icono("calendar", 20)}Programación</h2>
        ${camposProgramacion(ctx, fechaInicial, sugerido)}
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="btn btn-primario btn-bloque btn-grande" type="submit">${icono("calendar", 20)}Programar visita</button>
      </section>
    </form>`;
  const form = cont.querySelector("#form-visita");
  cont.querySelector("#btn-volver").onclick = () => renderElegir(cont, ctx, preset);
  enlazarFechas(cont, form);
  form.addEventListener("input", (e) => { e.target.closest("[data-pregunta]")?.classList.remove("con-error"); cont.querySelector("#form-error").textContent = ""; });
  form.addEventListener("change", (e) => e.target.closest("[data-pregunta]")?.classList.remove("con-error"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = cont.querySelector("#form-error");
    error.textContent = "";
    form.querySelectorAll(".con-error").forEach((x) => x.classList.remove("con-error"));
    const p = leerProspecto(form);
    const d = Object.fromEntries(new FormData(form));
    const coordinador = ctx.esAdmin ? coordinadores.find((u) => u.uid === d.coordinador) : { uid: ctx.perfil.uid, nombre: ctx.perfil.nombre };
    const errores = erroresProspecto(p, { alProgramar: true });
    if (errores.length) {
      errores.forEach(([n]) => form.querySelector(`[data-pregunta=${n}]`)?.classList.add("con-error"));
      form.querySelector(`[name=${errores[0][0]}]`)?.focus();
      return (error.textContent = errores[0][1]);
    }
    if (!coordinador) return (error.textContent = "Selecciona quién hará la visita.");
    if (!d.fecha) return (error.textContent = "Selecciona la fecha de la visita.");
    if (d.fecha < hoyISO()) return (error.textContent = "La fecha no puede ser anterior a hoy.");
    if (!d.hora) return (error.textContent = "Selecciona la hora.");
    const boton = form.querySelector("button[type=submit]");
    setCargando(boton, true, "Guardando…");
    try {
      const creada = await crearVisitaProspecto(ctx, { prospecto: p, coordinador, fecha: d.fecha, hora: d.hora, observacion: d.observacion });
      toast(creada.estadoEscritura === "pendiente"
        ? "Visita guardada en este dispositivo. Se enviará automáticamente cuando haya señal."
        : `Visita a prospecto programada: ${formatearFechaLarga(d.fecha)}, ${formatearHora(d.hora)}`, creada.estadoEscritura === "pendiente" ? "info" : "ok");
      filtro.estado = "";
      filtro.ancla = filtro.dia = d.fecha;
      if (filtro.vista === "lista") filtro.vista = "mes";
      renderAgenda(cont, ctx);
    } catch (err) {
      console.error(err);
      error.textContent = mensajeError(err);
      setCargando(boton, false);
    }
  });
}

function renderProgramar(cont, ctx, preset = {}) {
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" id="btn-volver">${icono("back", 18)}Cambiar a quién visitar</button>
        <h1>Programar visita</h1>
        <p class="texto-suave">Busca el cliente${preset.fecha ? ` para el ${esc(formatearFechaLarga(preset.fecha))}` : ""}.</p>
        ${rutaPasos(PASOS_CLIENTE, 1)}
      </div>
    </header>
    <section class="paso-buscar" id="paso-buscar"></section>`;
  cont.querySelector("#btn-volver").onclick = () => renderElegir(cont, ctx, preset);
  crearBuscador(cont.querySelector("#paso-buscar"), {
    onSeleccionar: (c) => renderFormulario(cont, ctx, c, preset),
    onVerFicha: (c) => abrirFicha(cont, ctx, c.id, {
      onVolver: () => renderProgramar(cont, ctx, preset), textoVolver: "Volver a la búsqueda",
      onProgramar: () => renderFormulario(cont, ctx, c, preset),
    }),
  });
}

function renderFormulario(cont, ctx, cliente, preset = {}) {
  const fechaInicial = preset.fecha && preset.fecha >= hoyISO() ? preset.fecha : hoyISO();
  const sedes = sedesDeCliente(cliente);
  const sugerido = ctx.esAdmin
    ? coordinadores.find((u) => u.rol === ROLES.COORDINADOR && normalizarTexto(u.coordinador || u.nombre) === normalizarTexto(cliente.coordinador))
      || coordinadores.find((u) => u.uid === ctx.perfil.uid)
    : null;
  const marcas = (cliente.marcas || []).map((m) => m.marca).filter(Boolean);

  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" id="btn-cambiar">${icono("back", 18)}Elegir otro cliente</button>
        <h1>Programar visita</h1>
        ${rutaPasos(PASOS_CLIENTE, 2)}
      </div>
    </header>

    <div class="programar-rejilla">
      <section class="cliente-resumen" aria-label="Cliente seleccionado">
        <div id="datos-cliente"></div>
        ${sedes.length > 1 ? `
        <label class="campo campo-sede"><span>Sede a visitar <small>(${sedes.length} direcciones)</small></span>
          <select name="sede" form="form-visita">${sedes.map((s, i) => `<option value="${i}">${esc(s.direccion || "Sin dirección")}, ${esc(s.ciudad)} (${esc(s.marcas.join(", "))})</option>`).join("")}</select>
        </label>` : ""}
        <button type="button" class="btn btn-secundario btn-sm" id="btn-ver-ficha">${icono("store", 16)}Ver ficha completa</button>
      </section>

    <form class="panel form" id="form-visita" novalidate>
      ${ctx.esAdmin ? `
      <label class="campo"><span>¿Quién hará la visita?</span>
        <select name="coordinador" required>
          ${coordinadores.map((u) => `<option value="${u.uid}" ${sugerido?.uid === u.uid ? "selected" : ""}>${esc(nombreResponsable(u, ctx))}</option>`).join("")}
        </select>
        <small class="texto-suave">Se propone el coordinador asignado en el Excel; si no tiene cuenta en la app, quedas tú.</small>
      </label>` : ""}

      ${selectorTipoVisita()}

      <div class="campo">
        <span>Fecha de visita</span>
        <div class="atajos-fecha" role="group" aria-label="Atajos de fecha">
          ${[["Hoy", 0], ["Mañana", 1], ["Pasado mañana", 2]].map(([t, d]) => `<button type="button" class="atajo ${sumarDias(hoyISO(), d) === fechaInicial ? "activo" : ""}" data-dias="${d}">${t}</button>`).join("")}
        </div>
      </div>
      <div class="form-fila">
        <label class="campo"><span>Fecha</span><input type="date" name="fecha" min="${hoyISO()}" value="${fechaInicial}" required></label>
        <label class="campo"><span>Hora</span><input type="time" name="hora" value="09:00" required></label>
      </div>

      <label class="campo"><span>Observación previa <small class="texto-suave">(opcional)</small></span>
        <textarea name="observacion" rows="3" maxlength="500" placeholder="Algo a tener en cuenta antes de la visita"></textarea>
      </label>

      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn-primario btn-bloque btn-grande" type="submit">${icono("calendar", 20)}Programar visita</button>
    </form>
    </div>`;

  const form = cont.querySelector("#form-visita");
  const selSede = cont.querySelector("select[name=sede]");
  const pintarDatos = () => {
    const sede = sedes[Number(selSede?.value || 0)];
    const marcasSede = marcas.length ? (sedes.length > 1 ? sede.marcas : marcas) : [cliente.marca].filter(Boolean);
    const dato = (ic, etiqueta, valor) => `
      <div class="dato-icono">${icono(ic, 18)}<div><span>${etiqueta}</span><strong>${valor || '<em class="texto-suave">Sin dato</em>'}</strong></div></div>`;
    cont.querySelector("#datos-cliente").innerHTML = `
      <div class="cliente-resumen-cabeza">${chapeta(cliente.codigo)}<span class="marca-texto">${esc(marcasSede.join(", "))}</span></div>
      <h2 class="cliente-resumen-nombre">${esc(nombreCliente(cliente))}</h2>
      ${expendioSecundario(cliente, sede.expendio || cliente.expendio) ? `<p class="texto-suave cliente-resumen-expendio">${icono("store", 15)} ${esc(expendioSecundario(cliente, sede.expendio || cliente.expendio))}</p>` : ""}
      <div class="datos-icono">
        ${dato("user", "Responsable", esc(sede.responsable))}
        ${dato("phone", "Celular", sede.celular ? enlaceTel(sede.celular) : "")}
        ${dato("pin", "Dirección", esc([sede.direccion, sede.barrio, sede.ciudad].filter(Boolean).join(", ")))}
        ${dato("map", "Zona", esc(sede.zona || cliente.zona))}
        ${dato("users", "Coordinador asignado", esc(cliente.coordinador))}
      </div>`;
  };
  pintarDatos();
  selSede?.addEventListener("change", pintarDatos);
  cont.querySelectorAll("[data-dias]").forEach((b) => b.onclick = () => {
    form.fecha.value = sumarDias(hoyISO(), Number(b.dataset.dias));
    cont.querySelectorAll("[data-dias]").forEach((x) => x.classList.toggle("activo", x === b));
  });
  form.fecha.addEventListener("change", () => {
    cont.querySelectorAll("[data-dias]").forEach((x) => x.classList.toggle("activo", sumarDias(hoyISO(), Number(x.dataset.dias)) === form.fecha.value));
  });
  form.addEventListener("change", (e) => { if (e.target.name === "tipoVisita") cont.querySelector("#form-error").textContent = ""; });
  cont.querySelector("#btn-cambiar").onclick = () => renderProgramar(cont, ctx, preset);
  cont.querySelector("#btn-ver-ficha").onclick = () => abrirFicha(cont, ctx, cliente.id, {
    onVolver: () => renderFormulario(cont, ctx, cliente, preset), textoVolver: "Volver a programar",
    onProgramar: () => renderFormulario(cont, ctx, cliente, preset),
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = cont.querySelector("#form-error");
    error.textContent = "";
    const d = Object.fromEntries(new FormData(form));
    const coordinador = ctx.esAdmin
      ? coordinadores.find((u) => u.uid === d.coordinador)
      : { uid: ctx.perfil.uid, nombre: ctx.perfil.nombre };

    if (!coordinador) return (error.textContent = "Selecciona quién hará la visita.");
    if (!d.fecha) return (error.textContent = "Selecciona la fecha de la visita.");
    if (d.fecha < hoyISO()) return (error.textContent = "La fecha no puede ser anterior a hoy.");
    if (!d.hora) return (error.textContent = "Selecciona la hora.");
    if (!d.tipoVisita) {
      cont.querySelector("[name=tipoVisita]").focus();
      return (error.textContent = "Elige si es un primer acercamiento o un seguimiento comercial.");
    }

    const boton = form.querySelector("button[type=submit]");
    setCargando(boton, true, "Guardando…");
    try {
      const yaExiste = (await listarVisitas(ctx, { desde: d.fecha, hasta: d.fecha }))
        .some((v) => v.clienteId === cliente.id && v.coordinadorUid === coordinador.uid);
      if (yaExiste && !(await confirmar({
        titulo: "Ya hay una visita ese día",
        texto: `${cliente.codigo} ya tiene una visita programada para el ${formatearFechaLarga(d.fecha)}. ¿Programar otra de todas formas?`,
        aceptar: "Programar otra",
      }))) {
        return setCargando(boton, false);
      }
      const creada = await crearVisita(ctx, {
        cliente, sede: sedes[Number(d.sede || 0)], coordinador,
        fecha: d.fecha, hora: d.hora, tipoVisita: d.tipoVisita, observacion: d.observacion,
      });
      toast(creada.estadoEscritura === "pendiente"
        ? "Visita guardada en este dispositivo. Se enviará automáticamente cuando haya señal."
        : `Visita programada: ${formatearFechaLarga(d.fecha)}, ${formatearHora(d.hora)}`, creada.estadoEscritura === "pendiente" ? "info" : "ok");
      filtro.estado = "";
      filtro.ancla = filtro.dia = d.fecha; // el calendario se abre en el día de la visita recién programada
      if (filtro.vista === "lista") filtro.vista = "mes";
      renderAgenda(cont, ctx);
    } catch (err) {
      console.error(err);
      error.textContent = mensajeError(err);
      setCargando(boton, false);
    }
  });
}

function nombreResponsable(u, ctx) {
  if (u.uid === ctx.perfil.uid) return `${u.nombre} (yo)`;
  return u.rol === ROLES.ADMIN ? `${u.nombre} (administrador)` : u.nombre;
}


