// Visita programada como BRIEF COMERCIAL del cliente: antes de iniciar, el coordinador ve quién es el cliente
// (beneficio, meses, marcas, días en CG, sedes, contacto), reporta actualizaciones y presiona "Iniciar visita".
// Acciones: Iniciar / Continuar visita, Reprogramar y Editar programación. Se usa desde Programación, Visitas,
// Dashboard y la ficha del cliente.
import { esc, toast, setCargando, enlaceTel, icono, chapeta, badgeEstado, esqueleto, telefonoPrincipal, confirmar } from "../ui.js";
import { ESTADOS_VISITA, ESTADO_LABEL, ROLES, TIPO_VISITA, tipoDeVisita, esProspecto } from "../constants.js";
import { resumenProspecto } from "./prospecto.js";
import {
  obtenerVisita, estadoVisible, sedesDeCliente, puedeRegistrar, puedeEditar, visitaEnCurso, iniciarVisita, puedeEliminar, eliminarVisita,
  reprogramarVisita, editarVisita, listarVisitasCliente, textoDuracion, duracionMinutos,
} from "../services/visitas-service.js";
import { obtenerCliente } from "../services/clientes-service.js";
import { obtenerResultadoFinal } from "../services/resultado-final-service.js";
import { actualizacionPendiente } from "../services/actualizaciones-service.js";
import { analizarBeneficio } from "../services/excel-clientes.js";
import { listarUsuarios } from "../services/users-service.js";
import { obtenerFoto, obtenerArchivoVisita } from "../services/fotos-service.js";
import { mensajeError } from "../services/auth-service.js";
import { hoyISO, formatearFechaLarga, formatearFecha, formatearHora } from "../utils/fechas.js";
import { abrirFicha } from "./ficha-cliente.js";
import { renderRegistroVisita } from "./registro-visita.js";
import { crearActualizaciones } from "./actualizaciones.js";
import { selectorTipoVisita } from "./tipo-visita.js";
import {
  ILUSTRACION_ESPECIE, textoBeneficio, textoCompra, textoFacturacion, textoCanal, diasCortos,
} from "./campos-cliente.js";
import { DIAS_BENEFICIO } from "../constants.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const { FINALIZADA, PENDIENTE, REPROGRAMADA } = ESTADOS_VISITA;
let responsables = null; // admin: personas a las que puede reasignar

const titulo = (t) => String(t || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const horaDe = (iso) => iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "";
const num = (n) => Number(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });

// visita: objeto o id. onVolver: regresa a la pantalla que abrió el detalle.
// accion: "resultado" abre directamente el registro si la visita ya está en curso o quedó pendiente.
export async function abrirVisita(cont, ctx, visita, { onVolver, textoVolver = "Volver", accion = null }) {
  cont.innerHTML = esqueleto(4, 90);
  window.scrollTo(0, 0);
  let v;
  try {
    v = typeof visita === "string" ? await obtenerVisita(visita) : await obtenerVisita(visita.id) || visita;
  } catch (err) {
    cont.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!v) {
    cont.innerHTML = `<p class="form-error">La visita no existe o no tienes acceso a ella.</p>`;
    return;
  }
  const nav = { cont, ctx, onVolver, textoVolver, recargar: () => abrirVisita(cont, ctx, v.id, { onVolver, textoVolver }) };
  // Contexto del cliente (la base de clientes viene de la copia local; el perfil es un documento).
  // Un prospecto no está en la base: no hay cliente ni perfil que consultar.
  const [cliente, perfil] = esProspecto(v) ? [null, null] : await Promise.all([
    obtenerCliente(v.clienteId).catch(() => null),
    obtenerResultadoFinal(v.clienteId).catch(() => null),
  ]);
  nav.cliente = cliente;
  nav.perfil = perfil;
  const propia = ctx.esAdmin || v.coordinadorUid === ctx.perfil.uid;
  if (accion === "resultado" && propia && (visitaEnCurso(v) || v.estado === PENDIENTE)) return renderResultado(nav, v);
  renderDetalle(nav, v);
}

function cabecera(textoVolver, titulo, subtitulo = "") {
  return `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" data-volver>${icono("back", 18)}${esc(textoVolver)}</button>
        <h1>${esc(titulo)}</h1>
        ${subtitulo ? `<div class="subtitulo">${subtitulo}</div>` : ""}
      </div>
    </header>`;
}

const cabezaCliente = (v) => `${chapeta(v.codigo)}${v.marcas?.length ? `<span class="marca-texto">${esc(v.marcas.join(", "))}</span>` : ""}`;

// ---------- Brief ----------

function renderDetalle(nav, v) {
  const { cont, ctx, cliente, perfil } = nav;
  const estado = estadoVisible(v);
  const r = v.resultado;
  const fecha = new Date(`${v.fechaProgramada}T12:00:00`);
  const celular = esProspecto(v) ? v.prospecto?.telefono || v.sede?.celular : v.sede?.celular;
  const tel = telefonoPrincipal(celular);
  const tipo = TIPO_VISITA[tipoDeVisita(v)];
  const enCurso = visitaEnCurso(v);

  const puedeActuar = puedeRegistrar(v) && (ctx.esAdmin || v.coordinadorUid === ctx.perfil.uid);
  const cuando = formatearFechaLarga(v.fechaProgramada).replace(/^./, (c) => c.toUpperCase());
  const sedes = cliente ? sedesDeCliente(cliente) : [];
  const ctaPrincipal = enCurso
    ? `<button class="btn btn-primario btn-grande" data-accion="continuar">${icono("next", 20)}Continuar visita</button>`
    : v.estado === PENDIENTE
      ? `<button class="btn btn-primario btn-grande" data-accion="continuar">${icono("ok", 20)}Completar pendiente</button>`
      : `<button class="btn btn-primario btn-grande" data-accion="iniciar">${icono("clock", 20)}Iniciar visita</button>`;

  cont.innerHTML = `
    <header class="vista-cabecera detalle-cabecera">
      <div>
        <button class="btn-volver" data-volver>${icono("back", 18)}${esc(nav.textoVolver)}</button>
        <div class="reg-cliente-id">${cabezaCliente(v)}</div>
        <h1>${esc(nombreCliente(cliente || v))}</h1>
        ${expendioSecundario(cliente || v, v.expendio) ? `<p class="brief-razon">${icono("store", 15)} ${esc(expendioSecundario(cliente || v, v.expendio))}</p>` : ""}
      </div>
    </header>

    <section class="cita-banda ${puedeActuar ? "con-acciones" : ""}" aria-label="Cita">
      <div class="cita-fecha">
        <span class="cita-dia">${fecha.getDate()}</span>
        <span class="cita-mes">${esc(fecha.toLocaleDateString("es-CO", { month: "short", year: "numeric" }).replace(".", ""))}</span>
      </div>
      <div class="cita-info">
        <div class="estado-barra">
          ${enCurso ? `<span class="chip en-curso-chip"><i aria-hidden="true"></i>Visita en curso</span>` : badgeEstado(estado)}
          <span class="chip tipo-chip tipo-${tipo.clave}">${icono(tipo.icono, 14)}${esc(tipo.texto)}</span>
          ${v.vecesReprogramada ? `<span class="texto-suave">${icono("repeat", 15)} Reprogramada ${v.vecesReprogramada} ${v.vecesReprogramada === 1 ? "vez" : "veces"}</span>` : ""}
        </div>
        <strong class="cita-cuando">${esc(cuando)}, ${esc(formatearHora(v.horaProgramada))}</strong>
        <ul class="cita-meta">
          <li>${icono("user", 16)}${esc(v.coordinadorNombre)}</li>
          ${v.fechaOriginal !== v.fechaProgramada ? `<li>${icono("calendar", 16)}Fecha original: ${esc(formatearFecha(v.fechaOriginal, { day: "numeric", month: "long" }))}</li>` : ""}
          ${enCurso ? `<li class="en-curso-hora">${icono("clock", 16)}Inicio: ${esc(horaDe(v.inicioVisita))}</li>` : ""}
        </ul>
        ${v.observacionPrevia ? `<p class="observacion">${esc(v.observacionPrevia)}</p>` : ""}
      </div>
      ${puedeActuar ? `
      <div class="barra-acciones cita-acciones">
        ${ctaPrincipal}
        <button class="btn btn-secundario" data-accion="reprogramar" aria-label="Reprogramar">${icono("repeat", 18)}<span class="btn-txt">Reprogramar</span></button>
        ${puedeEditar(v) && !enCurso ? `<button class="btn btn-secundario" data-accion="editar" aria-label="Editar programación">${icono("edit", 18)}<span class="btn-txt">Editar programación</span></button>` : ""}
        ${puedeEliminar(ctx, v) ? `<button class="btn btn-texto btn-sm btn-eliminar" data-accion="eliminar">${icono("trash", 16)}Eliminar visita</button>` : ""}
      </div>` : ""}
    </section>

    <div class="detalle-cuerpo brief">
      <div class="detalle-principal">
        ${r ? panelResultado(v) : ""}
        ${esProspecto(v) ? seccionProspecto(v) : perfilComercial(cliente, perfil, v)}
        ${esProspecto(v) ? "" : seccionSedes(sedes, perfil, cliente)}
        <section class="detalle-seccion brief-historial">
          <div class="panel-titulo-fila">
            <h2 class="detalle-titulo">Historial</h2>
            <button type="button" class="btn btn-texto btn-sm" data-historial="todo">Ver historial completo${icono("next", 16)}</button>
          </div>
          ${esProspecto(v) ? "" : `<div id="historial-breve">${esqueleto(2, 52)}</div>`}
          <details class="detalle desplegable historial-visita">
            <summary>Movimientos de esta visita <span class="texto-suave">(${(v.historial || []).length})</span></summary>
            <ol class="linea-tiempo">${[...(v.historial || [])].reverse().map(itemHistorial).join("")}</ol>
          </details>
        </section>
      </div>

      <aside class="detalle-lateral">
        <h2 class="detalle-titulo">${esProspecto(v) ? "Contacto del prospecto" : "Información del cliente"}</h2>
        <div class="datos-icono">
          <div class="dato-icono">${icono("user", 18)}<div><span>${esProspecto(v) ? "Nombre" : "Responsable"}</span><strong>${esc(titulo(v.sede?.responsable)) || "Sin dato"}</strong></div></div>
          <div class="dato-icono">${icono("phone", 18)}<div><span>Celular</span><strong>${celular ? enlaceTel(celular) : esProspecto(v) ? "Se registra al iniciar la visita" : "Sin dato"}</strong></div></div>
          ${esProspecto(v) ? "" : `
          <div class="dato-icono">${icono("pin", 18)}<div><span>Dirección de la visita</span><strong>${esc([v.sede?.direccion, v.sede?.barrio, v.ciudad].filter(Boolean).join(", ")) || "Sin dato"}</strong></div></div>
          <div class="dato-icono">${icono("map", 18)}<div><span>Zona</span><strong>${esc(v.zona) || "Sin dato"}</strong></div></div>`}
          ${cliente?.coordinador ? `<div class="dato-icono">${icono("users", 18)}<div><span>Coordinador asignado</span><strong>${esc(titulo(cliente.coordinador))}</strong></div></div>` : ""}
        </div>
        <div class="fila-botones">
          ${tel ? `<a class="btn btn-secundario" href="tel:${tel}">${icono("phone", 18)}Llamar</a>` : ""}
          ${esProspecto(v) ? "" : `<button class="btn btn-secundario btn-ficha" data-ficha>${icono("store", 18)}Ficha del cliente</button>`}
        </div>
        <section class="actualizaciones-resumen" id="act-resumen" aria-live="polite">
          <h3>Actualizaciones</h3>
          <p class="act-estado cargando">${icono("clock", 18)}<span>Consultando…</span></p>
          <button type="button" class="btn btn-texto btn-sm" data-historial="actualizaciones">Ver historial de actualizaciones</button>
        </section>
      </aside>
    </div>`;

  cont.querySelector("[data-volver]").onclick = nav.onVolver;
  if (cont.querySelector("[data-ficha]")) cont.querySelector("[data-ficha]").onclick = () => abrirFicha(cont, ctx, v.clienteId, {
    onVolver: () => renderDetalle(nav, v), textoVolver: "Volver a la visita",
  });
  cont.querySelectorAll("[data-accion]").forEach((b) => b.onclick = async () => {
    const accion = b.dataset.accion;
    if (accion === "iniciar") {
      setCargando(b, true, "Iniciando…");
      try {
        const { inicioVisita } = await iniciarVisita(ctx, v);
        v.inicioVisita = inicioVisita;
        toast(`Visita iniciada a las ${horaDe(inicioVisita)}`, "ok");
        renderResultado(nav, v);
      } catch (err) {
        console.error(err);
        toast(mensajeError(err), "error");
        setCargando(b, false);
      }
    }
    if (accion === "continuar") renderResultado(nav, v);
    if (accion === "reprogramar") renderReprogramar(nav, v);
    if (accion === "editar") renderEditar(nav, v);
    if (accion === "eliminar") pedirEliminar(nav, v, b);
  });

  // Actualizaciones: botón flotante + resumen en el lateral.
  if (cliente) {
    const act = crearActualizaciones({
      cont, ctx, cliente, perfil, visitaId: v.id, sitio: puedeActuar ? "brief" : "ficha",
      onCambio: (lista) => pintarResumenActualizaciones(cont, lista),
    });
    act.cargar();
    cont.querySelectorAll("[data-historial]").forEach((b) => b.onclick = () => act.abrirHistorial(b.dataset.historial, {
      onAbrirVisita: (id) => abrirVisita(cont, ctx, id, { onVolver: () => renderDetalle(nav, v), textoVolver: "Volver a la visita" }),
    }));
  } else {
    cont.querySelector("#act-resumen").hidden = true;
    cont.querySelectorAll("[data-historial]").forEach((b) => b.hidden = true);
  }
  if (!esProspecto(v)) cargarHistorialBreve(nav, v);

  if (r?.firma?.id) {
    obtenerArchivoVisita(v.id, r.firma.id).then((f) => {
      const caja = cont.querySelector("#firma-detalle");
      if (caja) caja.innerHTML = f ? `<img src="${f.datos}" alt="Firma de ${esc(r.firma.nombre || "quien recibió")}">` : `<p class="texto-suave">La firma aún no se ha sincronizado.</p>`;
    }).catch(() => { const caja = cont.querySelector("#firma-detalle"); if (caja) caja.innerHTML = ""; });
  }

  if (r?.tieneFoto) {
    obtenerFoto(v.id).then((f) => {
      const caja = cont.querySelector("#foto-detalle");
      if (!caja) return;
      caja.innerHTML = f
        ? `<img src="${f.datos}" alt="Evidencia de la visita" loading="lazy"><span class="texto-suave">${icono("camera", 15)} Evidencia: ${esc(r.tipoEvidencia || "Fotografía")}</span>`
        : `<p class="texto-suave">La evidencia aún no se ha sincronizado.</p>`;
    }).catch(() => {
      const caja = cont.querySelector("#foto-detalle");
      if (caja) caja.innerHTML = `<p class="texto-suave">No fue posible cargar la evidencia.</p>`;
    });
  }
}

// Borra la visita por completo (solo si no se ha iniciado). Se pide confirmación porque no se puede deshacer.
async function pedirEliminar(nav, v, boton) {
  const ok = await confirmar({
    titulo: "¿Eliminar esta visita?",
    texto: `Se borrará por completo la visita a ${nombreCliente(v)} del ${formatearFechaLarga(v.fechaProgramada)}, ${formatearHora(v.horaProgramada)}. No se puede deshacer.`,
    aceptar: "Eliminar visita",
    peligro: true,
  });
  if (!ok) return;
  setCargando(boton, true, "Eliminando…");
  try {
    const estado = await eliminarVisita(nav.ctx, v);
    toast(estado === "pendiente" ? "Visita eliminada en este dispositivo. Se sincronizará cuando haya señal." : "Visita eliminada", estado === "pendiente" ? "info" : "ok");
    nav.onVolver();
  } catch (err) {
    console.error(err);
    toast(mensajeError(err), "error");
    setCargando(boton, false);
  }
}

function pintarResumenActualizaciones(cont, lista) {
  const caja = cont.querySelector("#act-resumen .act-estado");
  if (!caja) return;
  const n = lista.filter(actualizacionPendiente).length;
  caja.classList.remove("cargando");
  caja.classList.toggle("al-dia", !n);
  caja.classList.toggle("con-pendientes", !!n);
  caja.innerHTML = n
    ? `<b>${n}</b><span>${n === 1 ? "actualización pendiente" : "actualizaciones pendientes"} de aplicar</span>`
    : `${icono("ok", 18)}<span>Información al día</span>`;
}

function panelResultado(v) {
  const r = v.resultado;
  const inicio = r.inicioVisita || v.inicioVisita;
  const fin = r.finVisita || v.finVisita;
  const dur = r.duracionMin ?? duracionMinutos(inicio, fin);
  return `
    <section class="detalle-seccion resultado-panel">
      <div class="panel-titulo-fila"><h2 class="detalle-titulo">Resultado</h2>${badgeEstado(r.estado)}</div>
      <p class="texto-suave resultado-quien">Registrado el ${esc(formatearFecha(r.fechaHora.slice(0, 10), { day: "numeric", month: "long" }))} a las ${esc(horaDe(r.fechaHora))} por ${esc(r.nombre)}</p>
      ${inicio || fin ? `
      <dl class="tiempos">
        <div><dt>Inicio</dt><dd>${inicio ? esc(horaDe(inicio)) : "—"}</dd></div>
        <div><dt>Fin</dt><dd>${fin ? esc(horaDe(fin)) : "—"}</dd></div>
        <div><dt>Duración</dt><dd>${dur != null ? esc(textoDuracion(dur)) : "—"}</dd></div>
      </dl>` : ""}
      ${r.temasTratados && !esProspecto(v) ? `<h3 class="resultado-sub">Temas tratados</h3><p class="observacion">${esc(r.temasTratados)}</p>` : ""}
      ${(r.novedades || []).length ? `<div class="chips">${r.novedades.map((nv) => `<span class="chip chip-neutro">${esc(nv)}</span>`).join("")}</div>` : ""}
      ${r.pqrs ? `<h3 class="resultado-sub">PQRS</h3><p class="observacion">${esc(r.pqrs)}</p>` : ""}
      ${r.observaciones ? `<h3 class="resultado-sub">Observaciones</h3><p class="observacion">${esc(r.observaciones)}</p>` : ""}
      ${r.pendiente ? `<div class="resultado-pendiente">${icono("clock", 18)}<div><strong>Qué quedó pendiente</strong><p>${esc(r.pendiente)}</p></div></div>` : ""}
      ${typeof (r.autorizacionDatos ?? v.autorizacionDatos) === "boolean" ? `
      <p class="habeas-resultado ${(r.autorizacionDatos ?? v.autorizacionDatos) ? "si" : "no"}">${icono("file", 16)}<span>Tratamiento de datos personales: <strong>${(r.autorizacionDatos ?? v.autorizacionDatos) ? "Autorizó" : "No autorizó"}</strong>${v.autorizacionDatosFecha ? ` · ${esc(new Date(v.autorizacionDatosFecha).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}` : ""}</span></p>` : ""}
      ${tarjetaUbicacion(r.ubicacion)}
      ${r.tieneFoto ? `<div class="foto-detalle" id="foto-detalle">${esqueleto(1, 220)}</div>` : ""}
      ${r.firma?.id ? `
      <div class="firma-detalle">
        <h3 class="resultado-sub">Firma de recibido</h3>
        <div class="firma-imagen" id="firma-detalle">${esqueleto(1, 90)}</div>
        <span class="firma-quien">${icono("edit", 15)}${esc(r.firma.nombre || "Sin nombre")}</span>
      </div>` : ""}
    </section>`;
}

// Prospecto: los datos registrados al programar (y completados al realizar la visita).
function seccionProspecto(v) {
  return `
    <section class="detalle-seccion prospecto-brief" aria-labelledby="t-prosp">
      <h2 class="detalle-titulo" id="t-prosp">Datos del prospecto</h2>
      <p class="perfil-nota prospecto-nota">${icono("info", 16)}<span>Posible nuevo cliente: no tiene código ni está en la base de clientes.</span></p>
      ${v.resultado || v.inicioVisita
        ? resumenProspecto(v.prospecto || {})
        : `<p class="texto-suave">Teléfono, tipo de cliente, cantidad semanal, temas tratados e interés se registran al presionar <strong>Iniciar visita</strong>.</p>`}
    </section>`;
}

// Perfil comercial: lo que hay que saber del cliente de un vistazo.
function perfilComercial(cliente, perfil, v) {
  const b = cliente ? analizarBeneficio(cliente.beneficio) : null;
  const meses = (b?.meses || []).filter((m) => m.valor !== null);
  const marcas = cliente ? (cliente.marcas || []).map((m) => m.marca).filter(Boolean) : (v.marcas || []);
  const dias = perfil?.diasBeneficio || [];
  const opera = perfil ? [
    perfil.tipoBeneficio ? `<span class="opera-especie">${ILUSTRACION_ESPECIE[perfil.tipoBeneficio]}${esc(textoBeneficio(perfil.tipoBeneficio))}</span>` : "",
    perfil.compraGanado?.length ? `<span><small>Compra</small>${esc(textoCompra(perfil.compraGanado))}</span>` : "",
    perfil.facturacion?.length ? `<span><small>Factura</small>${esc(textoFacturacion(perfil.facturacion))}</span>` : "",
    perfil.preferenciaCanal ? `<span><small>Canal</small>${esc(textoCanal(perfil))}</span>` : "",
  ].filter(Boolean) : [];
  return `
    <section class="detalle-seccion perfil-comercial" aria-labelledby="t-perfil">
      <h2 class="detalle-titulo" id="t-perfil">Perfil comercial</h2>
      <div class="perfil-rejilla">
        <div class="perfil-dato perfil-beneficio">
          <span class="perfil-etiqueta">Beneficio</span>
          ${b?.promedio != null ? `<strong class="perfil-cifra">${num(Math.round(b.promedio))}</strong><small>animales al mes · promedio ${esc(b.anio)}</small>`
            : `<strong class="perfil-vacio">Sin dato</strong>`}
        </div>
        <div class="perfil-dato">
          <span class="perfil-etiqueta">Beneficio por mes${b?.anio ? ` · ${esc(b.anio)}` : ""}</span>
          ${meses.length ? `<div class="meses-chips">${meses.map((m) => `<span class="${m.valor ? "" : "sin"}" title="${esc(num(m.valor))} animales"><b>${esc(m.corto)}</b><em>${esc(num(m.valor))}</em></span>`).join("")}</div>` : `<strong class="perfil-vacio">Sin meses registrados</strong>`}
        </div>
        <div class="perfil-dato">
          <span class="perfil-etiqueta">Marcas${marcas.length > 1 ? ` · ${marcas.length}` : ""}</span>
          ${marcas.length ? `<div class="marcas-lista">${marcas.slice(0, 6).map((m) => `<span>${esc(m)}</span>`).join("")}${marcas.length > 6 ? `<span class="texto-suave">+${marcas.length - 6}</span>` : ""}</div>` : `<strong class="perfil-vacio">Sin marcas</strong>`}
        </div>
        <div class="perfil-dato">
          <span class="perfil-etiqueta">Días en CG</span>
          ${dias.length ? `<div class="dias-cg">${DIAS_BENEFICIO.map((d) => `<i class="${dias.includes(d.clave) ? "on" : ""}" title="${esc(d.texto)}">${esc(d.corto.slice(0, 1))}</i>`).join("")}</div><small>${esc(diasCortos(dias).join(" · "))}</small>`
            : `<strong class="perfil-vacio">Sin registrar</strong>`}
        </div>
      </div>
      ${opera.length ? `<div class="perfil-opera">${opera.join("")}</div>`
        : `<p class="perfil-nota">${icono("info", 16)}<span>${perfil ? "El perfil operativo está incompleto." : "Aún no tiene perfil operativo registrado (especie, compra, días, facturación y canal)."}</span></p>`}
    </section>`;
}

function seccionSedes(sedes, perfil, cliente) {
  const otras = perfil?.sedes || [];
  const total = sedes.length + otras.length;
  if (!total) return "";
  return `
    <details class="detalle-seccion sedes-acordeon">
      <summary>
        <span class="sedes-titulo">${icono("store", 18)}Sedes del cliente <b>${total}</b></span>
        <span class="sedes-ver"><span class="ver">Ver sedes</span><span class="ocultar">Ocultar sedes</span>${icono("down", 16)}</span>
      </summary>
      <ol class="sedes-lista-brief">
        ${sedes.map((s, i) => `
          <li>
            <strong>${i === 0 ? "Sede principal" : `Sede ${i + 1}`}${s.marcas.length ? ` <span class="marca-texto">${esc(s.marcas.join(", "))}</span>` : ""}</strong>
            <span>${esc(s.direccion || "Sin dirección")}</span>
            <small>${esc([s.barrio, s.ciudad].filter(Boolean).join(" · "))}${s.responsable ? ` · ${esc(titulo(s.responsable))}` : ""}</small>
          </li>`).join("")}
        ${otras.map((s) => `
          <li class="sede-perfil">
            <strong>${esc(s.nombre || "Otra sede")} <span class="texto-suave">· registrada en primer acercamiento</span></strong>
            <small>${esc(s.ciudad || "")}</small>
          </li>`).join("")}
      </ol>
    </details>`;
}

async function cargarHistorialBreve(nav, v) {
  const { cont, ctx } = nav;
  const caja = cont.querySelector("#historial-breve");
  let visitas = [];
  try {
    visitas = (await listarVisitasCliente(ctx, v.clienteId)).filter((x) => x.id !== v.id).slice(0, 3);
  } catch (err) {
    console.error(err);
  }
  if (!cont.contains(caja)) return;
  if (!visitas.length) {
    caja.innerHTML = `<p class="texto-suave historial-vacio">Es la primera visita registrada a este cliente.</p>`;
    return;
  }
  caja.innerHTML = `<ul class="historial-breve">${visitas.map((x) => {
    const est = estadoVisible(x);
    return `
      <li><button type="button" data-otra="${x.id}">
        <span class="hb-fecha">${esc(formatearFecha(x.fechaProgramada, { day: "numeric", month: "short", year: "2-digit" }))}</span>
        <span class="hb-tipo">${esc(TIPO_VISITA[tipoDeVisita(x)].texto)}<small>${esc(x.coordinadorNombre)}</small></span>
        ${badgeEstado(est)}
      </button></li>`;
  }).join("")}</ul>`;
  caja.querySelectorAll("[data-otra]").forEach((b) => b.onclick = () => abrirVisita(cont, ctx, b.dataset.otra, {
    onVolver: () => renderDetalle(nav, v), textoVolver: "Volver a la visita",
  }));
}

// Ubicación donde se cerró la visita: se muestra y se puede abrir en Google Maps (enlace gratuito, sin API).
function tarjetaUbicacion(u) {
  if (!u) return `<div class="ubicacion-tarjeta ubicacion-no">${icono("pin", 20)}<div><strong>Sin ubicación</strong><span>No se registró la ubicación en esta visita.</span></div></div>`;
  const cuando = u.fechaHora ? new Date(u.fechaHora).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  const tieneCoords = Number.isFinite(u.latitud) && Number.isFinite(u.longitud);
  const mapa = tieneCoords ? `https://www.google.com/maps/search/?api=1&query=${u.latitud.toFixed(6)},${u.longitud.toFixed(6)}` : "";
  return `
    <div class="ubicacion-tarjeta ubic-ok">
      <span class="ubic-pin" aria-hidden="true">${icono("pin", 22)}<i></i></span>
      <div class="ubic-texto">
        <strong>Ubicación registrada</strong>
        ${cuando ? `<span>${esc(cuando)}</span>` : ""}
      </div>
      ${mapa ? `<a class="btn btn-secundario btn-sm ubic-mapa" href="${mapa}" target="_blank" rel="noopener">${icono("map", 16)}Ver ubicación</a>` : ""}
    </div>`;
}

const ICONO_ACCION = { PROGRAMADA: "calendar", REPROGRAMADA: "repeat", EDITADA: "edit", FINALIZADA: "ok", PENDIENTE: "clock", INICIADA: "clock", AUTORIZACION_DATOS: "file" };

function itemHistorial(h) {
  const cuando = new Date(h.fechaHora);
  let titulo = "", detalle = "";
  const duracion = h.duracionMin != null ? ` · ${textoDuracion(h.duracionMin)}` : "";
  if (h.accion === "PROGRAMADA") { titulo = "Programada"; detalle = `Para el ${formatearFechaLarga(h.fecha)}, ${formatearHora(h.hora)}`; }
  else if (h.accion === REPROGRAMADA) { titulo = "Reprogramada"; detalle = `Del ${formatearFecha(h.fechaAnterior, { day: "numeric", month: "short" })} (${formatearHora(h.horaAnterior)}) al ${formatearFecha(h.fecha, { day: "numeric", month: "short" })} (${formatearHora(h.hora)}). Motivo: ${h.motivo}`; }
  else if (h.accion === "EDITADA") { titulo = "Editada"; detalle = `Cambió: ${(h.campos || []).join(", ").toLowerCase()}`; }
  else if (h.accion === "INICIADA") { titulo = "Visita iniciada"; detalle = ""; }
  else if (h.accion === "AUTORIZACION_DATOS") { titulo = "Tratamiento de datos personales"; detalle = h.autoriza ? "Autorizó" : "No autorizó"; }
  else { titulo = (ESTADO_LABEL[h.accion] || h.accion) + duracion; detalle = (h.novedades || []).join(", "); }
  return `
    <li class="lt-item lt-${String(h.accion).toLowerCase()}">
      <div class="lt-fecha"><strong>${cuando.getDate()}</strong><span>${esc(cuando.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""))}</span></div>
      <div class="lt-eje"><span class="lt-punto">${icono(ICONO_ACCION[h.accion] || "info", 13)}</span></div>
      <div class="lt-cuerpo">
        <strong>${esc(titulo)}</strong>
        ${detalle ? `<span>${esc(detalle)}</span>` : ""}
        ${h.observaciones ? `<p>${esc(h.observaciones)}</p>` : ""}
        ${h.firmaId ? `<span class="lt-meta">${icono("edit", 14)}Firma de recibido${h.firmaNombre ? `: ${esc(h.firmaNombre)}` : ""}</span>` : ""}
        <span class="lt-meta">${esc(cuando.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }))}, ${esc(h.nombre || h.usuario)}</span>
      </div>
    </li>`;
}

function avisarEscritura(estado, mensajeOk) {
  if (estado === "pendiente") toast("Guardado en este dispositivo. Se enviará automáticamente cuando haya señal.", "info");
  else toast(mensajeOk, "ok");
}

// ---------- Registrar resultado ----------
// El registro es un flujo guiado por pasos (components/registro-visita.js).

function renderResultado(nav, v) {
  renderRegistroVisita(nav, v, () => renderDetalle(nav, v));
}

// ---------- Reprogramar (sin registrar resultado) ----------

function renderReprogramar(nav, v) {
  const { cont, ctx } = nav;
  cont.innerHTML = `
    ${cabecera("Volver a la visita", "Reprogramar visita",
      `<span class="texto-suave">${esc(nombreCliente(v))}. Hoy está para el ${esc(formatearFechaLarga(v.fechaProgramada))}, ${esc(formatearHora(v.horaProgramada))}</span>`)}
    <form class="panel form" id="form-reprogramar" novalidate>
      <div class="form-fila">
        <label class="campo"><span>Nueva fecha</span><input type="date" name="fecha" min="${hoyISO()}" required></label>
        <label class="campo"><span>Nueva hora</span><input type="time" name="hora" value="${esc(v.horaProgramada)}" required></label>
      </div>
      <label class="campo"><span>Motivo de la reprogramación</span>
        <input name="motivo" maxlength="200" required placeholder="Ej.: el cliente pidió cambiar la fecha">
      </label>
      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn-primario btn-bloque btn-grande" type="submit">Reprogramar visita</button>
    </form>`;
  cont.querySelector("[data-volver]").onclick = () => renderDetalle(nav, v);

  const form = cont.querySelector("#form-reprogramar");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = cont.querySelector("#form-error");
    const { fecha, hora, motivo } = Object.fromEntries(new FormData(form));
    if (!fecha) return (error.textContent = "Elige la nueva fecha.");
    if (fecha < hoyISO()) return (error.textContent = "La nueva fecha no puede ser anterior a hoy.");
    if (!hora) return (error.textContent = "Elige la nueva hora.");
    if (fecha === v.fechaProgramada && hora === v.horaProgramada) return (error.textContent = "La nueva fecha y hora son iguales a las actuales.");
    if (!motivo.trim()) return (error.textContent = "Escribe el motivo de la reprogramación.");

    const boton = form.querySelector("button[type=submit]");
    setCargando(boton, true, "Guardando…");
    try {
      const estado = await reprogramarVisita(ctx, v, { fecha, hora, motivo: motivo.trim() });
      avisarEscritura(estado, `Visita reprogramada para el ${formatearFechaLarga(fecha)}`);
      nav.recargar();
    } catch (err) {
      console.error(err);
      error.textContent = mensajeError(err);
      setCargando(boton, false);
    }
  });
}

// ---------- Editar ----------

async function renderEditar(nav, v) {
  const { cont, ctx } = nav;
  cont.innerHTML = esqueleto(4, 70);
  const cliente = await obtenerCliente(v.clienteId).catch(() => null);
  const sedes = cliente ? sedesDeCliente(cliente) : [];
  const sedeActual = Math.max(0, sedes.findIndex((s) => s.direccion === v.sede?.direccion && s.ciudad === v.sede?.ciudad));
  if (ctx.esAdmin && !responsables) {
    responsables = (await listarUsuarios().catch(() => [])).filter((u) => u.activo);
  }

  cont.innerHTML = `
    ${cabecera("Volver a la visita", "Editar programación", `${cabezaCliente(v)}<span class="texto-suave">${esc(nombreCliente(v))}</span>`)}
    <form class="panel form" id="form-editar" novalidate>
      <p class="aviso-suave">Para cambiar la fecha usa <button type="button" class="btn-enlace" id="ir-reprogramar">Reprogramar</button>, así queda registrada la fecha original.</p>

      ${sedes.length > 1 ? `
      <label class="campo"><span>Sede</span>
        <select name="sede">${sedes.map((s, i) => `<option value="${i}" ${i === sedeActual ? "selected" : ""}>${esc(s.direccion || "Sin dirección")}, ${esc(s.ciudad)} (${esc(s.marcas.join(", "))})</option>`).join("")}</select>
      </label>` : ""}

      ${ctx.esAdmin ? `
      <label class="campo"><span>¿Quién hará la visita?</span>
        <select name="coordinador">
          ${(responsables.some((u) => u.uid === v.coordinadorUid) ? responsables : [{ uid: v.coordinadorUid, nombre: v.coordinadorNombre }, ...responsables])
            .map((u) => `<option value="${u.uid}" ${u.uid === v.coordinadorUid ? "selected" : ""}>${esc(u.nombre)}${u.rol === ROLES.ADMIN ? " (administrador)" : ""}</option>`).join("")}
        </select>
      </label>` : ""}

      <label class="campo"><span>Hora</span><input type="time" name="hora" value="${esc(v.horaProgramada)}" required></label>
      ${esProspecto(v) ? "" : selectorTipoVisita(tipoDeVisita(v))}
      <label class="campo"><span>Observación previa</span>
        <textarea name="observacionPrevia" rows="3" maxlength="500">${esc(v.observacionPrevia)}</textarea>
      </label>
      <p class="form-error" id="form-error" role="alert"></p>
      <button class="btn btn-primario btn-bloque btn-grande" type="submit">Guardar cambios</button>
    </form>
    ${puedeEliminar(ctx, v) ? `
    <section class="zona-eliminar">
      <div><strong>¿Agendaste el cliente equivocado?</strong><span>Elimina la visita; se borra por completo y no se puede deshacer.</span></div>
      <button type="button" class="btn btn-peligro-borde" id="btn-eliminar">${icono("trash", 18)}Eliminar visita</button>
    </section>` : ""}`;

  cont.querySelector("[data-volver]").onclick = () => renderDetalle(nav, v);
  cont.querySelector("#ir-reprogramar").onclick = () => renderReprogramar(nav, v);
  cont.querySelector("#btn-eliminar")?.addEventListener("click", (e) => pedirEliminar(nav, v, e.currentTarget));
  const form = cont.querySelector("#form-editar");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = cont.querySelector("#form-error");
    const d = Object.fromEntries(new FormData(form));
    if (!d.hora) return (error.textContent = "Elige la hora.");
    const coordinador = ctx.esAdmin
      ? (responsables.find((u) => u.uid === d.coordinador) || { uid: v.coordinadorUid, nombre: v.coordinadorNombre })
      : null;

    const boton = form.querySelector("button[type=submit]");
    setCargando(boton, true, "Guardando…");
    try {
      const estado = await editarVisita(ctx, v, {
        cliente, sede: sedes.length > 1 ? sedes[Number(d.sede)] : null,
        hora: d.hora, tipoVisita: d.tipoVisita, observacionPrevia: d.observacionPrevia, coordinador,
      });
      if (estado === "sin-cambios") toast("No hiciste cambios.", "info");
      else avisarEscritura(estado, "Cambios guardados");
      nav.recargar();
    } catch (err) {
      console.error(err);
      error.textContent = mensajeError(err);
      setCargando(boton, false);
    }
  });
}
