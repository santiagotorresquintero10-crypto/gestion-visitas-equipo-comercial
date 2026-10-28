// Ficha del cliente: foto de fachada como encabezado, beneficio mensual, datos comerciales y de contacto,
// sedes e historial de visitas en línea de tiempo.
// Se abre desde Base de clientes, el buscador, el formulario de programación y el detalle de visita.
import {
  esc, enlaceTel, icono, toast, setCargando, chapeta, badgeEstado, estadoVacio, esqueleto, curvasNivel, telefonoPrincipal,
} from "../ui.js";
import { HISTORIAL_COMPARTIDO } from "../constants.js";
import { comprimirFoto, guardarFotoFachada, obtenerFotoFachada } from "../services/fotos-service.js";
import { obtenerCliente } from "../services/clientes-service.js";
import { listarVisitasCliente, estadoVisible, sedesDeCliente } from "../services/visitas-service.js";
import { analizarBeneficio } from "../services/excel-clientes.js";
import { mensajeError } from "../services/auth-service.js";
import { columnasSimples, activarTooltips } from "./graficos.js";
import { abrirVisita } from "./visita-detalle.js";
import { irAProgramar } from "../utils/navegacion.js";
import { formatearFecha, formatearHora } from "../utils/fechas.js";
import { obtenerResultadoFinal, guardarResultadoFinal, normalizarResultadoFinal } from "../services/resultado-final-service.js";
import { actualizacionPendiente } from "../services/actualizaciones-service.js";
import { crearActualizaciones, abrirHoja } from "./actualizaciones.js";
import { listarDespachosCliente, normalizarMarca } from "../services/despachos-service.js";
import { tablaDespachos } from "./tabla-despachos.js";
import { ILUSTRACION_ESPECIE, textoBeneficio, textoCompra, textoFacturacion, textoCanal, diasCortos, crearCamposCliente } from "./campos-cliente.js";
import { TIPO_VISITA, tipoDeVisita, TIPO_ACTUALIZACION, ESTADO_ACTUALIZACION_LABEL } from "../constants.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const COLOR_BENEFICIO = "#4F6E12";
const UNIDAD = "animales";
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const num = (n, dec = 0) => Number(n).toLocaleString("es-CO", { maximumFractionDigits: dec });
const titulo = (t) => String(t || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const fila = (k, v) => `<dt>${esc(k)}</dt><dd>${v || '<span class="sin-dato">Sin registrar</span>'}</dd>`;
const mesLargo = (clave) => MESES_LARGOS[Number(clave.slice(5)) - 1];

// opciones: { onVolver, textoVolver, onProgramar, consulta }
// consulta: solo lectura dentro de otra pantalla (vista rápida durante la visita): sin volver, programar,
// foto de fachada, editar perfil, reportar ni abrir otras visitas, y sin mover el scroll de la página.
export async function abrirFicha(cont, ctx, clienteId, opciones = {}) {
  const consulta = !!opciones.consulta;
  cont.innerHTML = esqueleto(1, 240) + esqueleto(3, 80);
  if (!consulta) window.scrollTo(0, 0);
  const volver = opciones.onVolver || (() => history.back());

  let cliente;
  try {
    cliente = await obtenerCliente(clienteId);
  } catch (err) {
    cont.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cliente) {
    cont.innerHTML = `
      ${consulta ? "" : `<button class="btn-volver" data-volver>${icono("back", 18)}${esc(opciones.textoVolver || "Volver")}</button>`}
      <div class="panel">${estadoVacio({ icono: "database", titulo: "Este cliente ya no está en la base", texto: `El código ${clienteId} no aparece en la base de clientes.` })}</div>`;
    cont.querySelector("[data-volver]")?.addEventListener("click", volver);
    return;
  }

  const sedes = sedesDeCliente(cliente);
  const marcas = cliente.marcas?.length ? cliente.marcas : [];
  const nombresMarca = marcas.map((m) => m.marca).filter(Boolean);
  const b = analizarBeneficio(cliente.beneficio);
  const inactivo = cliente.activo === false;
  const principal = sedes[0] || {};
  const tel = telefonoPrincipal(principal.celular) || telefonoPrincipal(principal.telefono);
  const reabrir = () => abrirFicha(cont, ctx, clienteId, opciones);
  const solo = { consulta };
  const programar = opciones.onProgramar ? () => opciones.onProgramar(cliente) : () => irAProgramar(cliente);

  cont.innerHTML = `
    <div class="ficha ${consulta ? "ficha-consulta" : ""}">
      <section class="ficha-heroe">
        <div class="fachada cargando" id="fachada">${curvasNivel()}</div>
        ${consulta ? "" : `<button class="btn-flotante btn-volver-flotante" data-volver aria-label="${esc(opciones.textoVolver || "Volver")}">${icono("back", 20)}<span>${esc(opciones.textoVolver || "Volver")}</span></button>`}
      </section>

      <section class="ficha-cabecera">
        <div class="ficha-identidad">
          <div class="ficha-codigo">${chapeta(cliente.codigo)}${nombresMarca.length ? `<span class="marca-texto">${esc(nombresMarca.slice(0, 4).join(", "))}${nombresMarca.length > 4 ? ` +${nombresMarca.length - 4}` : ""}</span>` : ""}</div>
          <h1>${esc(nombreCliente(cliente))}</h1>
          ${expendioSecundario(cliente) ? `<p class="ficha-expendio">${icono("store", 16)}${esc(expendioSecundario(cliente))}</p>` : ""}
          <ul class="ficha-hechos">
            <li>${icono("pin", 18)}<span>${esc([principal.direccion, principal.barrio, principal.ciudad].filter(Boolean).join(", ")) || "Sin dirección"}${sedes.length > 1 ? ` <span class="texto-suave">y ${sedes.length - 1} sede${sedes.length > 2 ? "s" : ""} más</span>` : ""}</span></li>
            ${cliente.zona ? `<li>${icono("map", 18)}<span>Zona ${esc(titulo(cliente.zona))}</span></li>` : ""}
            ${cliente.coordinador ? `<li>${icono("user", 18)}<span>Coordinador asignado: ${esc(titulo(cliente.coordinador))}</span></li>` : ""}
          </ul>
          ${inactivo ? `<p class="aviso">${icono("info", 18)}Este cliente ya no aparece en el último Excel importado. Se conserva con su historial.</p>` : ""}
        </div>
        <div class="acciones-ficha">
          ${inactivo || consulta ? "" : `<button class="btn btn-primario btn-grande" id="btn-programar">${icono("plus", 20)}Programar visita</button>`}
          ${tel ? `<a class="btn btn-secundario" href="tel:${tel}">${icono("phone", 18)}Llamar</a>` : ""}
        </div>
      </section>

      <section class="ficha-bloque" aria-labelledby="fb-cliente">
        <h2 class="ficha-bloque-titulo" id="fb-cliente">${icono("user", 18)}<span class="fb-num">1</span>Información del cliente</h2>
        <div class="ficha-bloque-rejilla fb-cliente">
          <section class="panel">
            <h2 class="panel-titulo">Contacto</h2>
            <dl class="lista-datos">
              ${fila("Responsable", esc(titulo(principal.responsable)))}
              ${fila("Celular", principal.celular ? enlaceTel(principal.celular) : "")}
              ${fila("Teléfono", principal.telefono ? enlaceTel(principal.telefono) : "")}
              ${fila("Correo", cliente.correo ? `<a href="mailto:${esc(cliente.correo)}">${esc(cliente.correo)}</a>` : "")}
            </dl>
          </section>

          <section class="panel" id="perfil-operativo">${esqueleto(2, 40)}</section>

          ${sedes.length > 1 ? `
          <section class="panel sedes-panel">
            <h2 class="panel-titulo sedes-titulo">
              <button type="button" class="sedes-toggle" aria-expanded="false" aria-controls="sedes-lista">
                <span>Sedes <span class="sedes-n">(${sedes.length})</span></span>
                <span class="sedes-accion"><span data-texto-sedes>Ver sedes</span>${icono("chevron", 18)}</span>
              </button>
            </h2>
            <div class="sedes-plegable" id="sedes-lista">
              <div class="sedes-interior" inert>
                <div class="sedes">${sedes.map((s) => `
                  <article class="sede">
                    <div class="sede-cabeza"><strong>${esc(s.expendio || cliente.expendio)}</strong>${s.marcas.length ? `<span class="marca-texto">${esc(s.marcas.join(", "))}</span>` : ""}</div>
                    <span class="sede-linea">${icono("pin", 16)}${esc([s.direccion, s.barrio, s.ciudad].filter(Boolean).join(", ")) || "Sin dirección"}</span>
                    ${s.responsable || s.celular ? `<span class="sede-linea">${icono("user", 16)}${esc(titulo(s.responsable) || "Sin responsable")}${s.celular ? `, ${enlaceTel(s.celular)}` : ""}</span>` : ""}
                  </article>`).join("")}
                </div>
              </div>
            </div>
          </section>` : ""}
        </div>
      </section>

      <section class="ficha-bloque" aria-labelledby="fb-beneficio">
        <h2 class="ficha-bloque-titulo" id="fb-beneficio">${icono("chart", 18)}<span class="fb-num">2</span>Información de beneficio y despachos</h2>
        <div class="ficha-bloque-rejilla fb-beneficio">
          ${panelBeneficio(b, marcas)}
          ${panelMarcas(b, marcas, cliente)}
        </div>
        <section class="panel despachos-ficha" id="despachos-ficha" aria-labelledby="t-despachos">
          <div class="panel-titulo-fila">
            <h2 class="panel-titulo" id="t-despachos">${icono("camion", 20)}Despachos Bovinos</h2>
            <span class="texto-suave" id="despachos-ficha-nota"></span>
          </div>
          <div id="despachos-ficha-tabla">${esqueleto(2, 44)}</div>
        </section>
      </section>

      <section class="ficha-bloque" aria-labelledby="fb-seguimiento">
        <h2 class="ficha-bloque-titulo" id="fb-seguimiento">${icono("check", 18)}<span class="fb-num">3</span>Seguimiento comercial</h2>
        <div class="ficha-bloque-rejilla fb-seguimiento">
          <section class="panel">
            <div class="panel-titulo-fila">
              <h2 class="panel-titulo">Historial de visitas</h2>
              <span class="texto-suave" id="resumen-historial"></span>
            </div>
            ${!ctx.esAdmin && !HISTORIAL_COMPARTIDO ? `<p class="texto-suave nota-historial">Se muestran solo tus visitas a este cliente.</p>` : ""}
            <div id="historial-cliente">${esqueleto(3, 70)}</div>
          </section>

          <section class="panel actualizaciones-resumen" id="act-resumen">
            <h2 class="panel-titulo">Actualizaciones</h2>
            <p class="act-estado cargando">${icono("clock", 18)}<span>Consultando…</span></p>
            <ul class="act-ultimas" id="act-ultimas"></ul>
            <div class="fila-botones">
              <button type="button" class="btn btn-texto btn-sm" data-historial-act>Ver historial</button>
            </div>
          </section>
        </div>
      </section>
    </div>`;

  // Sedes: contraídas al abrir la ficha; el botón las despliega o las oculta.
  const btnSedes = cont.querySelector(".sedes-toggle");
  if (btnSedes) btnSedes.onclick = () => {
    const abrir = btnSedes.getAttribute("aria-expanded") !== "true";
    btnSedes.setAttribute("aria-expanded", String(abrir));
    btnSedes.closest(".sedes-panel").classList.toggle("abierto", abrir);
    cont.querySelector(".sedes-interior").inert = !abrir;
    btnSedes.querySelector("[data-texto-sedes]").textContent = abrir ? "Ocultar" : "Ver sedes";
  };
  cont.querySelector("[data-volver]")?.addEventListener("click", volver);
  cont.querySelector("#btn-programar")?.addEventListener("click", programar);
  activarTooltips(cont);
  cargarFachada(cont, ctx, cliente, solo);
  cargarHistorial(cont, ctx, cliente, reabrir, solo);
  cargarDespachos(cont, cliente);
  cargarPerfilYActualizaciones(cont, ctx, cliente, reabrir, solo);
}

// Perfil operativo (primer acercamiento) y actualizaciones reportadas.
async function cargarPerfilYActualizaciones(cont, ctx, cliente, reabrir, { consulta = false } = {}) {
  let perfil = await obtenerResultadoFinal(cliente.id).catch(() => null);
  const caja = cont.querySelector("#perfil-operativo");
  if (!cont.contains(caja)) return;
  const fila2 = (k, v) => `<dt>${esc(k)}</dt><dd>${v || '<span class="sin-dato">Sin registrar</span>'}</dd>`;
  // El perfil es información vigente del cliente: no depende de que haya visitas ni de un primer acercamiento.
  const pintarPerfil = () => {
  caja.innerHTML = `
    <div class="panel-titulo-fila perfil-cabeza">
      <h2 class="panel-titulo">Perfil operativo</h2>
      ${ctx.esAdmin && !consulta ? `<button type="button" class="btn btn-texto btn-sm" id="btn-editar-perfil">${icono("edit", 16)}Editar perfil</button>` : ""}
    </div>
    ${perfil ? `
    <dl class="lista-datos">
      ${fila2("Tipo de beneficio", perfil.tipoBeneficio ? `<span class="opera-especie">${ILUSTRACION_ESPECIE[perfil.tipoBeneficio]}${esc(textoBeneficio(perfil.tipoBeneficio))}</span>` : "")}
      ${fila2("Compra de ganado", esc(textoCompra(perfil.compraGanado)))}
      ${fila2("Días en CG", esc(diasCortos(perfil.diasBeneficio).join(" · ")))}
      ${fila2("Facturación", esc(textoFacturacion(perfil.facturacion)))}
      ${fila2("Canal", esc(textoCanal(perfil)))}
      ${perfil.otrasSedes && perfil.sedes?.length ? fila2("Otras sedes", esc(perfil.sedes.map((x) => [x.nombre, x.ciudad].filter(Boolean).join(", ")).join(" · "))) : ""}
      ${perfil.observaciones ? fila2("Observaciones", esc(perfil.observaciones)) : ""}
    </dl>
    ${perfil.actualizadoNombre ? `<p class="perfil-actualizado">Actualizado por ${esc(perfil.actualizadoNombre)}${perfil.actualizadoEn?.toDate ? ` el ${esc(formatearFecha(perfil.actualizadoEn.toDate().toISOString().slice(0, 10), { day: "numeric", month: "short", year: "numeric" }))}` : ""}</p>` : ""}` : `
    <p class="texto-suave">Sin perfil operativo registrado.${ctx.esAdmin ? " Puedes completarlo con «Editar perfil», sin necesidad de una visita." : ""}</p>`}`;
  caja.querySelector("#btn-editar-perfil")?.addEventListener("click", editarPerfil);
  };

  // Edición directa (solo administrador; las reglas de Firestore también lo exigen).
  const editarPerfil = () => {
    const { hoja, cerrar } = abrirHoja({
      titulo: "Editar perfil operativo",
      subtitulo: `${chapeta(cliente.codigo)}<span>${esc(nombreCliente(cliente))}</span>`,
      clase: "hoja-perfil",
      cuerpo: `
        <div class="perfil-edicion" id="perfil-ed-cliente"></div>
        <div class="perfil-edicion" id="perfil-ed-operacion"></div>
        <p class="form-error" data-error role="alert"></p>`,
      pie: `
        <button type="button" class="btn btn-fantasma" data-cerrar>Cancelar</button>
        <button type="button" class="btn btn-accion" data-guardar>${icono("ok", 18)}Guardar cambios</button>`,
    });
    const campos = crearCamposCliente({ cliente: hoja.querySelector("#perfil-ed-cliente"), operacion: hoja.querySelector("#perfil-ed-operacion") }, perfil, { sinSedes: true });
    const btn = hoja.querySelector("[data-guardar]");
    hoja.addEventListener("input", () => { hoja.querySelector("[data-error]").textContent = ""; });
    hoja.addEventListener("change", () => { hoja.querySelector("[data-error]").textContent = ""; });
    btn.onclick = async () => {
      const errorEl = hoja.querySelector("[data-error]");
      errorEl.textContent = "";
      const datos = campos.leer();
      if (datos.preferenciaCanal === "OTRO" && !datos.preferenciaCanalOtro.trim()) {
        hoja.querySelector("[name=rfCanalOtro]")?.focus();
        return (errorEl.textContent = "Escribe qué tipo de corte prefiere (canal «Otro»).");
      }
      setCargando(btn, true, "Guardando…");
      try {
        const estado = await guardarResultadoFinal(ctx, cliente.id, datos, { nuevo: !perfil, sinSedes: true, origen: "FICHA" });
        perfil = { ...(perfil || {}), ...normalizarResultadoFinal({ ...(perfil || {}), ...datos }), actualizadoNombre: ctx.perfil.nombre, actualizadoEn: { toDate: () => new Date() } };
        pintarPerfil();
        cerrar();
        toast(estado === "pendiente" ? "Perfil guardado en este dispositivo. Se enviará cuando haya señal." : "Perfil operativo actualizado", estado === "pendiente" ? "info" : "ok");
      } catch (err) {
        console.error(err);
        errorEl.textContent = mensajeError(err);
        setCargando(btn, false);
      }
    };
  };
  pintarPerfil();

  const act = crearActualizaciones({
    cont, ctx, cliente, perfil, sitio: "ficha", conBoton: !consulta,
    onCambio: (lista) => {
      const e = cont.querySelector("#act-resumen .act-estado");
      if (!e) return;
      const n = lista.filter(actualizacionPendiente).length;
      e.className = `act-estado ${n ? "con-pendientes" : "al-dia"}`;
      e.innerHTML = n ? `<b>${n}</b><span>${n === 1 ? "actualización pendiente" : "actualizaciones pendientes"} de aplicar</span>` : `${icono("ok", 18)}<span>Información al día</span>`;
      // Últimas reportadas (solo lectura; el detalle y el cambio de estado siguen en «Ver historial»).
      const ul = cont.querySelector("#act-ultimas");
      if (ul) {
        const ultimas = [...lista].sort((x, y) => (y.fechaReporteLocal || "").localeCompare(x.fechaReporteLocal || "")).slice(0, 3);
        ul.innerHTML = ultimas.map((x) => `
          <li><span class="act-ultima-tipo">${icono(TIPO_ACTUALIZACION[x.tipoActualizacion]?.icono || "edit", 15)}${esc(x.tipoTexto || TIPO_ACTUALIZACION[x.tipoActualizacion]?.texto || "Actualización")}</span>
            <span class="act-ultima-meta">${x.fechaReporteLocal ? esc(formatearFecha(x.fechaReporteLocal.slice(0, 10), { day: "numeric", month: "short" })) : ""}<span class="chip-act act-${esc(x.estado)}">${esc(ESTADO_ACTUALIZACION_LABEL[x.estado] || x.estado)}</span></span></li>`).join("");
      }
    },
  });
  act.cargar();
  cont.querySelector("[data-historial-act]").onclick = () => act.abrirHistorial("todo", consulta ? {} : {
    onAbrirVisita: (id) => abrirVisita(cont, ctx, id, { onVolver: reabrir, textoVolver: "Volver a la ficha" }),
  });
}

// ---------- Foto de fachada (encabezado de la ficha) ----------

async function cargarFachada(cont, ctx, cliente, { consulta = false } = {}) {
  const caja = cont.querySelector("#fachada");
  let foto = null;
  try {
    foto = await obtenerFotoFachada(cliente.id);
  } catch (err) {
    console.error(err);
  }
  if (!cont.contains(caja)) return;
  if (consulta) return pintarFachadaConsulta(caja, cliente, foto);
  pintarFachada(caja, ctx, cliente, foto);
}

// Vista rápida: la foto (o su ausencia), sin tomar ni cambiar la foto.
function pintarFachadaConsulta(caja, cliente, foto) {
  caja.classList.remove("cargando");
  caja.classList.toggle("con-foto", !!foto);
  const fecha = foto?.fechaHora ? formatearFecha(foto.fechaHora.slice(0, 10), { day: "numeric", month: "long", year: "numeric" }) : "";
  caja.innerHTML = foto ? `
    <img class="fachada-img" src="${foto.datos}" alt="Fachada de ${esc(nombreCliente(cliente))}">
    <div class="fachada-pie"><span>Fachada, ${esc(fecha)}${foto.nombre ? `. ${esc(foto.nombre)}` : ""}</span></div>` : `
    ${curvasNivel()}
    <div class="fachada-vacia">
      <span class="fachada-icono">${icono("camera", 28)}</span>
      <strong>Sin foto de la fachada</strong>
    </div>`;
}

function pintarFachada(caja, ctx, cliente, foto) {
  caja.classList.remove("cargando");
  caja.classList.toggle("con-foto", !!foto);
  const fecha = foto?.fechaHora ? formatearFecha(foto.fechaHora.slice(0, 10), { day: "numeric", month: "long", year: "numeric" }) : "";
  caja.innerHTML = foto ? `
    <img class="fachada-img" src="${foto.datos}" alt="Fachada de ${esc(nombreCliente(cliente))}">
    <div class="fachada-pie">
      <span>Fachada, ${esc(fecha)}${foto.nombre ? `. ${esc(foto.nombre)}` : ""}</span>
      <button type="button" class="btn-flotante" data-tomar>${icono("camera", 18)}<span>Cambiar foto</span></button>
    </div>` : `
    ${curvasNivel()}
    <div class="fachada-vacia">
      <span class="fachada-icono">${icono("camera", 28)}</span>
      <strong>Sin foto de la fachada</strong>
      <span>Tómala en la próxima visita para reconocer el establecimiento.</span>
      <button type="button" class="btn btn-claro" data-tomar>${icono("camera", 18)}Tomar foto de la fachada</button>
    </div>`;
  caja.insertAdjacentHTML("beforeend", `<input type="file" accept="image/*" capture="environment" hidden data-input-foto>`);
  const input = caja.querySelector("[data-input-foto]");
  caja.querySelector("[data-tomar]").onclick = () => input.click();
  input.onchange = async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    caja.classList.add("cargando");
    caja.innerHTML = `${curvasNivel()}<div class="fachada-vacia"><span class="spinner"></span><span>Procesando foto…</span></div>`;
    try {
      previsualizarFachada(caja, ctx, cliente, foto, await comprimirFoto(archivo));
    } catch (err) {
      toast(err.message, "error");
      pintarFachada(caja, ctx, cliente, foto);
    }
  };
}

function previsualizarFachada(caja, ctx, cliente, anterior, nueva) {
  caja.classList.remove("cargando");
  caja.classList.add("con-foto");
  caja.innerHTML = `
    <img class="fachada-img" src="${nueva.datos}" alt="Vista previa de la fachada">
    <div class="fachada-pie fachada-confirmar">
      <span>¿Se ve bien la fachada?</span>
      <div class="fila-botones">
        <button type="button" class="btn-flotante" data-cancelar>Cancelar</button>
        <button type="button" class="btn-flotante" data-repetir>${icono("camera", 18)}<span>Repetir</span></button>
        <button type="button" class="btn btn-verde" data-usar>${icono("ok", 18)}Usar foto</button>
      </div>
    </div>
    <input type="file" accept="image/*" capture="environment" hidden data-input-foto>`;
  const input = caja.querySelector("[data-input-foto]");
  caja.querySelector("[data-cancelar]").onclick = () => pintarFachada(caja, ctx, cliente, anterior);
  caja.querySelector("[data-repetir]").onclick = () => input.click();
  input.onchange = async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    try {
      previsualizarFachada(caja, ctx, cliente, anterior, await comprimirFoto(archivo));
    } catch (err) {
      toast(err.message, "error");
    }
  };
  caja.querySelector("[data-usar]").onclick = async (e) => {
    setCargando(e.currentTarget, true, "Guardando…");
    try {
      const estado = await guardarFotoFachada(cliente.id, nueva, ctx);
      toast(estado === "pendiente" ? "Foto guardada en este dispositivo. Se enviará cuando haya señal." : "Foto de la fachada guardada", estado === "pendiente" ? "info" : "ok");
      pintarFachada(caja, ctx, cliente, { ...nueva, fechaHora: new Date().toISOString(), nombre: ctx.perfil.nombre });
    } catch (err) {
      console.error(err);
      toast(mensajeError(err), "error");
      setCargando(e.currentTarget, false);
    }
  };
}

// ---------- Beneficio ----------

function panelBeneficio(b, marcas) {
  if (!b || !b.mesesConDato) {
    return `<section class="panel">${estadoVacio({ icono: "chart", titulo: "Sin datos de beneficio", texto: "Este cliente no tiene meses de beneficio en el Excel." })}</section>`;
  }
  return `
    <section class="panel beneficio">
      <span class="beneficio-etiqueta">Beneficio promedio ${esc(b.anio)}</span>
      <div class="beneficio-principal">
        <span class="beneficio-valor">${num(Math.round(b.promedio))}</span>
        <span class="beneficio-unidad">${UNIDAD} al mes</span>
      </div>
      <span class="texto-suave">${b.mesesConDato} ${b.mesesConDato === 1 ? "mes" : "meses"} con dato${marcas.length > 1 ? `, suma de ${marcas.length} marcas` : ""}</span>
      <div class="grafico-beneficio">
        ${columnasSimples(b.meses.map((x) => ({ etiqueta: x.corto.toLowerCase(), titulo: `${mesLargo(x.clave)} de ${b.anio}`, valor: x.valor })), {
          color: COLOR_BENEFICIO, referencia: b.promedio, etiquetaReferencia: `Promedio del año: ${num(Math.round(b.promedio))}`, unidad: UNIDAD,
        })}
      </div>
      <div class="beneficio-datos">
        <div><span>Último mes</span><strong>${num(b.ultimo.valor)}</strong><small>${mesLargo(b.ultimo.clave)}</small></div>
        <div><span>Máximo</span><strong>${num(b.maximo.valor)}</strong><small>${mesLargo(b.maximo.clave)}</small></div>
        <div><span>Mínimo</span><strong>${num(b.minimo.valor)}</strong><small>${mesLargo(b.minimo.clave)}</small></div>
        <div><span>Total del año</span><strong>${num(b.total)}</strong><small>${UNIDAD}</small></div>
      </div>
    </section>`;
}

// Marcas asociadas al código, con su beneficio (promedio del año y último mes) y segmento.
// Mismo cálculo de antes (analizarBeneficio por marca); solo cambió de lugar.
function panelMarcas(b, marcas, cliente) {
  const filas = marcas.length
    ? marcas.map((m) => ({ m, a: b?.anio ? analizarBeneficio(m.beneficio, b.anio) : null }))
        .sort((x, y) => (y.a?.promedio ?? -1) - (x.a?.promedio ?? -1))
    : (cliente.marca ? [{ m: { marca: cliente.marca }, a: null }] : []);
  return `
    <section class="panel marcas-panel" aria-labelledby="t-marcas">
      <div class="panel-titulo-fila">
        <h2 class="panel-titulo" id="t-marcas">${icono("tag", 20)}Marcas <span class="texto-suave">(${filas.length})</span></h2>
        ${b?.anio ? `<span class="texto-suave">Beneficio ${esc(b.anio)}</span>` : ""}
      </div>
      ${filas.length ? `
      <div class="tabla-scroll marcas-scroll">
        <table class="tabla tabla-marcas">
          <thead><tr><th>Marca</th><th>Promedio</th><th>Último mes</th><th>Segmento</th></tr></thead>
          <tbody>${filas.map(({ m, a }) => `
            <tr>
              <td><strong>${esc(m.marca)}</strong>${m.expendio && marcas[0] && m.expendio !== marcas[0].expendio ? `<div class="texto-suave">${esc(m.expendio)}</div>` : ""}</td>
              <td>${a?.promedio != null ? num(Math.round(a.promedio)) : "—"}</td>
              <td>${a?.ultimo ? `${num(a.ultimo.valor)} <span class="texto-suave">${a.ultimo.corto.toLowerCase()}</span>` : "—"}</td>
              <td>${esc(titulo(m.segmento)) || "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<p class="texto-suave">Este cliente no tiene marcas registradas.</p>`}
    </section>`;
}

// ---------- Historial (línea de tiempo) ----------

async function cargarHistorial(cont, ctx, cliente, reabrir, { consulta = false } = {}) {
  const destino = cont.querySelector("#historial-cliente");
  let visitas;
  try {
    visitas = await listarVisitasCliente(ctx, cliente.id);
  } catch (err) {
    console.error(err);
    if (destino) destino.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cont.contains(destino)) return; // la persona ya salió de la ficha

  if (!visitas.length) {
    destino.innerHTML = estadoVacio({ icono: "calendar", titulo: "Aún no hay visitas a este cliente", texto: "Cuando se registren visitas aparecerán aquí, de la más reciente a la más antigua." });
    return;
  }
  const realizadas = visitas.filter((v) => v.resultado);
  const ultima = realizadas[0];
  cont.querySelector("#resumen-historial").textContent =
    `${visitas.length} visita${visitas.length === 1 ? "" : "s"}` +
    (ultima ? `. Última realizada el ${formatearFecha(ultima.fechaProgramada, { day: "numeric", month: "short", year: "numeric" })}` : "");

  destino.innerHTML = `<ol class="linea-tiempo">${visitas.map((v) => {
    const estado = estadoVisible(v);
    const r = v.resultado;
    const fecha = new Date(`${v.fechaProgramada}T12:00:00`);
    return `
      <li class="lt-item lt-${estado.toLowerCase()}${consulta ? "" : " lt-clic"}" ${consulta ? "" : `data-id="${v.id}" tabindex="0"`}>
        <div class="lt-fecha"><strong>${fecha.getDate()}</strong><span>${esc(fecha.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""))}</span><small>${fecha.getFullYear()}</small></div>
        <div class="lt-eje"><span class="lt-punto"></span></div>
        <div class="lt-cuerpo">
          ${badgeEstado(estado)}
          <strong>${esc(TIPO_VISITA[tipoDeVisita(v)].texto)}</strong>
          ${r?.novedades?.length ? `<div class="chips">${r.novedades.map((n) => `<span class="chip chip-neutro">${esc(n)}</span>`).join("")}</div>` : ""}
          ${r?.observaciones ? `<p>${esc(r.observaciones)}</p>` : ""}
          <span class="lt-meta">${icono("user", 14)}${esc(v.coordinadorNombre)}, ${esc(formatearHora(v.horaProgramada))}${r?.tieneFoto ? `<span class="lt-foto">${icono("camera", 14)}Con foto</span>` : ""}</span>
        </div>
      </li>`;
  }).join("")}</ol>`;

  const abrir = (e) => {
    const item = e.target.closest("[data-id]");
    if (item) abrirVisita(cont, ctx, item.dataset.id, { onVolver: reabrir, textoVolver: "Volver a la ficha" });
  };
  destino.addEventListener("click", abrir);
  destino.addEventListener("keydown", (e) => e.key === "Enter" && abrir(e));
}

// ---------- Despachos Bovinos del cliente (todas sus marcas; una fila por marca, sin sumar valores) ----------
async function cargarDespachos(cont, cliente) {
  const caja = cont.querySelector("#despachos-ficha-tabla");
  let lista = [];
  try {
    lista = await listarDespachosCliente(cliente.id);
  } catch (err) {
    console.error(err);
    if (caja) caja.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }
  if (!cont.contains(caja)) return;
  if (!lista.length) {
    caja.innerHTML = `<p class="texto-suave despachos-vacio">No hay despachos bovinos registrados para las marcas de este cliente.</p>`;
    return;
  }
  cont.querySelector("#despachos-ficha-nota").textContent = cliente.codigo;
  caja.innerHTML = `
    <div class="despachos-buscador">
      <label class="filtro filtro-buscar">${icono("search", 18)}
        <input type="search" placeholder="Buscar marca..." aria-label="Buscar marca de este cliente" autocomplete="off" spellcheck="false">
        <button type="button" class="btn-limpiar-busqueda" aria-label="Limpiar búsqueda" hidden>${icono("close", 16)}</button>
      </label>
    </div>
    <div data-tabla-despachos>${tablaDespachos(lista)}</div>
    <p class="despachos-sin-resultado" role="status" hidden>No se encontraron marcas con ese criterio.</p>`;
  // Solo filtra las filas ya cargadas de este código: no consulta otros clientes ni escribe en Firebase.
  const input = caja.querySelector("input[type=search]");
  const limpiar = caja.querySelector(".btn-limpiar-busqueda");
  const filas = [...caja.querySelectorAll("tbody tr")];
  const filtrar = () => {
    const q = normalizarMarca(input.value);
    let visibles = 0;
    filas.forEach((tr) => { const ok = !q || tr.dataset.marca.includes(q); tr.hidden = !ok; if (ok) visibles++; });
    caja.querySelector("[data-tabla-despachos]").hidden = !visibles;
    caja.querySelector(".despachos-sin-resultado").hidden = !!visibles;
    limpiar.hidden = !input.value;
  };
  input.addEventListener("input", filtrar);
  limpiar.onclick = () => { input.value = ""; filtrar(); input.focus(); };
}
