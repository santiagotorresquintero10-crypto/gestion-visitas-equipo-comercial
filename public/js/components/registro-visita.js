// Visita en curso: flujo guiado según el tipo de visita.
//   Primer acercamiento:   Novedades → Cliente → Operación → Evidencia y cierre
//   Seguimiento comercial: Conversación → Novedades y PQRS → Evidencia y cierre
// La hora real de inicio ya quedó guardada al presionar "Iniciar visita"; la de fin se guarda al "Finalizar visita".
// El estado (Finalizada / Pendiente / Reprogramar) se pregunta al final. Sistema de diseño v2 (design-system/MASTER.md).
import { esc, icono, chapeta, esqueleto, setCargando, toast } from "../ui.js";
import { ESTADOS_VISITA, NOVEDADES, TIPO_VISITA, TIPOS_EVIDENCIA, TIPO_PROSPECTO, tipoDeVisita } from "../constants.js";
import { camposProspecto, leerProspecto, erroresProspecto, activarCantidades } from "./prospecto.js";
import { htmlFirma, activarFirma } from "./firma.js";
import { registrarResultado, reprogramarVisita, duracionMinutos, textoDuracion, registrarAutorizacionDatos } from "../services/visitas-service.js";
import { obtenerResultadoFinal, guardarResultadoFinal, normalizarResultadoFinal } from "../services/resultado-final-service.js";
import { comprimirFoto } from "../services/fotos-service.js";
import { mensajeError } from "../services/auth-service.js";
import { obtenerUbicacion } from "../utils/ubicacion.js";
import { hoyISO, formatearFechaLarga, formatearHora, formatearFecha } from "../utils/fechas.js";
import { crearCamposCliente, datosClienteCambiaron, textoBeneficio, textoCompra, textoFacturacion, textoCanal, textoSedes, textoTotalDias } from "./campos-cliente.js";
import { crearActualizaciones } from "./actualizaciones.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const { FINALIZADA, PENDIENTE } = ESTADOS_VISITA;
const REPROGRAMAR = "REPROGRAMAR";
const PQRS = "PQRS";
const NOVEDADES_CHIPS = NOVEDADES.filter((n) => n !== PQRS); // la PQRS tiene su propia pregunta (Sí / No)

const FLUJOS = {
  primer_acercamiento: [
    { id: "autorizacion", nombre: "Datos personales" },
    { id: "novedades", nombre: "Novedades" },
    { id: "cliente", nombre: "Cliente" },
    { id: "operacion", nombre: "Operación" },
    { id: "cierre", nombre: "Evidencia y cierre" },
  ],
  seguimiento_comercial: [
    { id: "autorizacion", nombre: "Datos personales" },
    { id: "conversacion", nombre: "Conversación" },
    { id: "novedades", nombre: "Novedades y PQRS" },
    { id: "cierre", nombre: "Evidencia y cierre" },
  ],
  VISITA_CLIENTE_PROSPECTO: [
    { id: "autorizacion", nombre: "Datos personales" },
    { id: "prospecto", nombre: "Prospecto" },
    { id: "cierre", nombre: "Evidencia y cierre" },
  ],
};
// Texto de autorización (Habeas Data, Ley 1581 de 2012). Debe coincidir con la política de la organización.
const TEXTO_HABEAS = "Autorizo de manera libre, previa, expresa e informada el tratamiento de mis datos personales suministrados durante esta visita, de acuerdo con la Política de Tratamiento de Datos Personales de la organización y la normativa colombiana aplicable. Declaro que he sido informado(a) sobre la finalidad del tratamiento de la información y sobre mis derechos a conocer, actualizar, rectificar, solicitar prueba de la autorización, revocar la autorización cuando proceda y solicitar la supresión de mis datos conforme a la ley.";
const LETRA_DIA = { LUN: "L", MAR: "M", MIE: "X", JUE: "J", VIE: "V", SAB: "S" };

const ESTADOS = [
  { valor: FINALIZADA, titulo: "Finalizada", detalle: "La visita se realizó y quedó cerrada", icono: "ok", cta: "Finalizar visita", aviso: "Visita finalizada" },
  { valor: PENDIENTE, titulo: "Pendiente", detalle: "Se realizó, pero quedaron compromisos", icono: "clock", cta: "Finalizar visita", aviso: "Visita finalizada con pendientes" },
  { valor: REPROGRAMAR, titulo: "Reprogramar", detalle: "Debe programarse nuevamente", icono: "repeat", cta: "Reprogramar visita", aviso: "Visita reprogramada" },
];
const ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.valor, e]));
const horaDe = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "");

function avisarEscritura(estado, mensajeOk) {
  if (estado === "pendiente") toast("Guardado en este dispositivo. Se enviará automáticamente cuando haya señal.", "info");
  else toast(mensajeOk, "ok");
}

// Modo foco: mientras se registra, la barra inferior de la app se oculta para dejar el flujo limpio.
function modoFoco(activo) {
  document.body.classList.toggle("modo-registro", activo);
}

const preguntaTexto = (id, titulo, nombre, { ayuda = "", ph = "", filas = 4, max = 1500 } = {}) => `
  <fieldset class="pregunta" data-pregunta="${id}">
    <legend class="pregunta-titulo">${titulo}</legend>
    ${ayuda ? `<p class="pregunta-ayuda">${ayuda}</p>` : ""}
    <p class="pregunta-error" role="alert" hidden></p>
    <label class="campo"><span class="sr-only">${titulo}</span>
      <textarea name="${nombre}" rows="${filas}" maxlength="${max}" placeholder="${esc(ph)}"></textarea>
    </label>
  </fieldset>`;

// nav: { cont, ctx, recargar, cliente, perfil } · v: visita · onVolver: salir sin guardar (la visita sigue en curso)
export function renderRegistroVisita(nav, v, onVolver) {
  const { cont, ctx } = nav;
  const tipo = TIPO_VISITA[tipoDeVisita(v)];
  const PASOS = FLUJOS[tipo.clave];
  const esPrimer = tipo.clave === "primer_acercamiento";
  const esSeguimiento = tipo.clave === "seguimiento_comercial";
  const esProsp = tipo.clave === TIPO_PROSPECTO.clave;
  let foto = null, candidata = null, ubicacion = null;
  let datosCliente = null, guardadoCliente = null, cargaCliente = esPrimer ? "cargando" : "no-aplica";
  let actual = PASOS[0].id;
  const visitados = new Set([actual]);
  let reloj = null;

  const limpiar = () => { modoFoco(false); clearInterval(reloj); window.removeEventListener("hashchange", alNavegar); };
  const salir = () => { limpiar(); onVolver(); };
  const alNavegar = () => limpiar();
  window.addEventListener("hashchange", alNavegar);
  modoFoco(true);
  window.scrollTo(0, 0);

  cont.innerHTML = `
    <div class="reg" id="registro" data-tipo="${tipo.clave}">
      <header class="reg-cabeza">
        <button class="btn-volver" data-volver>${icono("back", 18)}Volver al brief</button>
        <div class="reg-cliente">
          <div class="reg-cliente-id">${chapeta(v.codigo)}${v.marcas?.length ? `<span class="marca-texto">${esc(v.marcas.join(", "))}</span>` : ""}</div>
          <h1>${esc(nombreCliente(v))}</h1>
          <p class="reg-en-curso"><span class="chip en-curso-chip"><i aria-hidden="true"></i>Visita en curso</span>
            <span>${esc(tipo.texto)}${v.inicioVisita ? ` · Inicio: <strong>${esc(horaDe(v.inicioVisita))}</strong>` : ""}</span>
            <span class="reg-reloj" id="reg-reloj"></span></p>
        </div>
        <nav class="ruta" aria-label="Pasos de la visita" style="--n:${PASOS.length}">
          <ol>${PASOS.map((p, i) => `
            <li class="ruta-paso" data-ruta="${p.id}">
              <button type="button" data-ir="${p.id}"><span class="ruta-num"><span>${i + 1}</span>${icono("ok", 14)}</span><span class="ruta-nombre">${p.nombre}</span></button>
            </li>`).join("")}
          </ol>
        </nav>
        <div class="ruta-compacta" aria-hidden="true">
          <div class="ruta-compacta-texto"><strong id="rc-paso"></strong><span id="rc-nombre"></span></div>
          <div class="progreso-paso"><span id="rc-barra"></span></div>
        </div>
      </header>

      <div class="reg-cuerpo">
        <form class="reg-form" id="form-resultado" novalidate>

          <section class="reg-paso" data-paso="autorizacion" aria-labelledby="t-autorizacion">
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-autorizacion">Autorización para el tratamiento de datos personales</h2>
            <div class="habeas-texto">
              <span class="habeas-icono" aria-hidden="true">${icono("file", 22)}</span>
              <p>${esc(TEXTO_HABEAS)}</p>
            </div>
            <fieldset class="pregunta" data-pregunta="autorizacion">
              <legend class="pregunta-titulo">¿Autoriza el tratamiento de sus datos personales?</legend>
              <p class="pregunta-ayuda">Lee el texto a la persona y registra su respuesta.</p>
              <p class="pregunta-error" role="alert" hidden></p>
              <div class="autoriza-opciones">
                <label class="decision autoriza-opcion ao-si"><input type="radio" name="autorizaDatos" value="si" ${v.autorizacionDatos === true ? "checked" : ""}>
                  <span><span class="estado-icono">${icono("ok", 24)}</span><strong>Sí</strong><small>Autoriza el tratamiento</small><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b></span></label>
                <label class="decision autoriza-opcion ao-no"><input type="radio" name="autorizaDatos" value="no" ${v.autorizacionDatos === false ? "checked" : ""}>
                  <span><span class="estado-icono">${icono("close", 24)}</span><strong>No</strong><small>No autoriza el tratamiento</small><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b></span></label>
              </div>
              <p class="habeas-negativa" id="habeas-negativa" hidden>${icono("alert", 16)}<span>Queda registrado que <strong>no autoriza</strong>. Continúa la visita sin recopilar datos personales nuevos (teléfono, nombre de quien firma ni firma).</span></p>
            </fieldset>
          </section>

          ${esProsp ? `
          <section class="reg-paso" data-paso="prospecto" aria-labelledby="t-prospecto">
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-prospecto">¿Cómo le fue con el prospecto?</h2>
            <p class="reg-nota">${icono("info", 16)}<span>Registra los datos del prospecto. Teléfono, temas tratados e interés son necesarios para finalizar.</span></p>
            <div class="prospecto-paso">${camposProspecto(v.prospecto || {}, { titulo: false })}</div>
          </section>` : ""}

          ${!esSeguimiento ? "" : `
          <section class="reg-paso" data-paso="conversacion" aria-labelledby="t-conversacion">
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-conversacion">¿De qué se habló?</h2>
            ${preguntaTexto("temas", "Temas tratados", "temasTratados", { ayuda: "Lo que se conversó durante la visita.", ph: "Ej.: precios de la semana, cupo de beneficio de noviembre, servicio de transporte." })}
            ${preguntaTexto("observaciones", "Observaciones de la visita", "observaciones", { ayuda: "Opcional. Acuerdos, compromisos, próximos pasos o situaciones encontradas.", ph: "Ej.: se acordó enviar la cotización el viernes." })}
          </section>`}

          <section class="reg-paso" data-paso="novedades" aria-labelledby="t-novedades" ${esPrimer ? "" : "hidden"}>
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-novedades">¿Qué ocurrió durante la visita?</h2>
            <fieldset class="pregunta" data-pregunta="novedades">
              <legend class="pregunta-titulo">Novedades</legend>
              <p class="pregunta-ayuda">Marca todas las que apliquen.</p>
              <p class="pregunta-error" role="alert" hidden></p>
              <div class="chips chips-novedad">${NOVEDADES_CHIPS.map((n) => `
                <label class="chip-opcion ${n === "Sin novedad" ? "chip-neutro" : ""}"><input type="checkbox" name="novedad" value="${esc(n)}"><span><b class="marca" aria-hidden="true">${icono("ok", 14)}</b><em>${esc(n)}</em></span></label>`).join("")}
              </div>
            </fieldset>
            <fieldset class="pregunta" data-pregunta="pqrs">
              <legend class="pregunta-titulo">¿Se presentó o trató alguna PQRS?</legend>
              <p class="pregunta-ayuda">Petición, queja, reclamo o sugerencia del cliente.</p>
              <p class="pregunta-error" role="alert" hidden></p>
              <div class="chips chips-2" role="radiogroup">
                <label class="chip-opcion"><input type="radio" name="hayPqrs" value="si"><span><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b><em>Sí</em></span></label>
                <label class="chip-opcion"><input type="radio" name="hayPqrs" value="no"><span><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b><em>No</em></span></label>
              </div>
              <label class="campo condicional" id="campo-pqrs" hidden><span>Descripción de la PQRS</span>
                <textarea name="pqrs" rows="3" maxlength="1500" placeholder="Ej.: reclamo por demora en la entrega de canales del martes."></textarea>
              </label>
            </fieldset>
            ${esPrimer ? preguntaTexto("observaciones", "Observaciones de la visita", "observaciones", { ayuda: "Qué se habló y qué quedó comprometido.", ph: "Ej.: el cliente está interesado; se acordó enviar tarifas." }) : ""}
          </section>

          ${esPrimer ? `
          <section class="reg-paso" data-paso="cliente" aria-labelledby="t-cliente" hidden>
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-cliente">Conozcamos al cliente</h2>
            <p class="reg-nota" data-nota-cliente hidden></p>
            <div id="campos-cliente">${esqueleto(3, 120)}</div>
          </section>

          <section class="reg-paso" data-paso="operacion" aria-labelledby="t-operacion" hidden>
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-operacion">Operación en Central Ganadera</h2>
            <div id="campos-operacion">${esqueleto(2, 120)}</div>
          </section>` : ""}

          <section class="reg-paso" data-paso="cierre" aria-labelledby="t-cierre" hidden>
            <p class="reg-paso-num" data-num></p>
            <h2 class="reg-pregunta" id="t-cierre">Evidencia y cierre</h2>
            <fieldset class="pregunta" data-pregunta="evidencia">
              <legend class="pregunta-titulo">Registrar evidencia</legend>
              <p class="pregunta-ayuda">Opcional. Una foto del soporte de la visita: un documento, el producto, la instalación, un acuerdo…</p>
              <ul class="evidencias">
                <li class="evidencia" id="bloque-foto">
                  <span class="evidencia-icono" id="foto-icono">${icono("camera", 22)}</span>
                  <div class="evidencia-texto">
                    <strong id="foto-titulo">Evidencia</strong>
                    <span id="foto-detalle">Se guarda comprimida, sin gastar datos de más.</span>
                  </div>
                  <div class="evidencia-acciones">
                    <input type="file" accept="image/*" capture="environment" id="input-foto" hidden>
                    <button type="button" class="btn btn-secundario" id="btn-foto">${icono("camera", 18)}Agregar evidencia</button>
                  </div>
                  <div class="evidencia-extra" id="foto-vista"></div>
                  <div class="fila-botones evidencia-extra" id="acciones-foto" hidden>
                    <button type="button" class="btn btn-verde" id="btn-usar-foto">${icono("ok", 18)}Usar foto</button>
                    <button type="button" class="btn btn-secundario" id="btn-repetir-foto">${icono("camera", 18)}Repetir foto</button>
                    <button type="button" class="btn btn-texto" id="btn-quitar-foto" hidden>Quitar</button>
                  </div>
                  <div class="evidencia-extra evidencia-tipo" id="tipo-evidencia" hidden>
                    <span class="evidencia-tipo-titulo">¿Qué muestra?</span>
                    <div class="chips">${TIPOS_EVIDENCIA.map((t, i) => `
                      <label class="chip-opcion chip-sm"><input type="radio" name="tipoEvidencia" value="${esc(t)}" ${i === 0 ? "checked" : ""}><span><em>${esc(t)}</em></span></label>`).join("")}
                    </div>
                  </div>
                </li>
                <li class="evidencia" id="estado-ubicacion" data-estado="cargando">
                  <span class="evidencia-icono">${icono("pin", 22)}</span>
                  <div class="evidencia-texto"><strong>Obteniendo ubicación…</strong><span>Solo se toma ahora, para este registro.</span></div>
                  <div class="evidencia-acciones">
                    <button type="button" class="btn btn-secundario" id="btn-ubicacion" hidden>${icono("repeat", 18)}Intentar de nuevo</button>
                  </div>
                </li>
              </ul>
            </fieldset>

            <fieldset class="pregunta" data-pregunta="estado">
              <legend class="pregunta-titulo">¿Cómo terminó la visita?</legend>
              <p class="pregunta-error" role="alert" hidden></p>
              <div class="estados">${ESTADOS.map((e) => `
                <label class="decision estado-opcion eo-${e.valor.toLowerCase()}">
                  <input type="radio" name="resultado" value="${e.valor}">
                  <span><span class="estado-icono">${icono(e.icono, 26)}</span><strong>${e.titulo}</strong><small>${e.detalle}</small><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b></span>
                </label>`).join("")}
              </div>
            <div class="condicional-bloque" id="bloque-pendiente" hidden>
              ${preguntaTexto("pendiente", "¿Qué quedó pendiente?", "pendiente", { ayuda: "El compromiso queda guardado dentro de la visita.", ph: "Ej.: enviar la cotización de servicio de frío antes del viernes.", filas: 3 })}
            </div>
            <div class="condicional-bloque" id="bloque-reprogramar" hidden>
              <fieldset class="pregunta" data-pregunta="reprogramar">
                <legend class="pregunta-titulo">¿Para cuándo queda la visita?</legend>
                <p class="pregunta-error" role="alert" hidden></p>
                <div class="form-fila">
                  <label class="campo"><span>Nueva fecha</span><input type="date" name="fecha" min="${hoyISO()}"></label>
                  <label class="campo"><span>Nueva hora</span><input type="time" name="hora" value="${esc(v.horaProgramada)}"></label>
                </div>
                <label class="campo"><span>Motivo de la reprogramación</span><input name="motivoReprogramacion" maxlength="200" placeholder="Ej.: el cliente no estaba"></label>
              </fieldset>
            </div>
            </fieldset>
            ${htmlFirma()}
          </section>

          <p class="form-error" id="form-error" role="alert"></p>
          <div class="reg-nav">
            <button type="button" class="btn btn-fantasma" id="btn-atras">${icono("back", 18)}Atrás</button>
            <button type="submit" class="btn btn-accion" id="btn-guardar">Continuar</button>
          </div>
        </form>

        <aside class="guia" aria-label="Guía de la visita">
          <div class="guia-papel" id="guia"></div>
        </aside>
      </div>
    </div>`;

  const raiz = cont.querySelector("#registro");
  raiz.querySelectorAll(".reg-paso").forEach((sec) => { sec.hidden = sec.dataset.paso !== actual; });
  const autoriza = () => { const r = raiz.querySelector("[name=autorizaDatos]:checked")?.value; return r === "si" ? true : r === "no" ? false : null; };
  const negativa = () => autoriza() === false;
  let firma = null; // se activa más abajo (necesita el lienzo en pantalla)
  const form = cont.querySelector("#form-resultado");
  const btnGuardar = cont.querySelector("#btn-guardar");
  const btnAtras = cont.querySelector("#btn-atras");
  const valor = () => form.resultado.value;
  const seReprograma = () => valor() === REPROGRAMAR;
  const aplicables = () => PASOS.map((p) => p.id);
  const pqrsSi = () => form.hayPqrs.value === "si";

  cont.querySelector("[data-volver]").onclick = salir;
  const novedades = () => {
    const lista = [...form.querySelectorAll("[name=novedad]:checked")].map((c) => c.value);
    return pqrsSi() ? [...lista.filter((n) => n !== "Sin novedad"), PQRS] : lista;
  };
  const cliente = () => normalizarResultadoFinal(datosCliente || {});

  // Reportar actualizaciones sin salir de la visita.
  if (nav.cliente) {
    const act = crearActualizaciones({ cont, ctx, cliente: nav.cliente, perfil: nav.perfil, visitaId: v.id, sitio: "registro" });
    act.cargar();
  }

  // Tiempo transcurrido desde el inicio (se actualiza cada 30 s).
  const pintarReloj = () => {
    const el = cont.querySelector("#reg-reloj");
    if (!el || !raiz.isConnected) return clearInterval(reloj);
    const min = duracionMinutos(v.inicioVisita, new Date().toISOString());
    el.textContent = min != null ? `${textoDuracion(min)} transcurridos` : "";
  };
  pintarReloj();
  reloj = setInterval(pintarReloj, 30000);

  // ---------- Perfil del cliente (solo primer acercamiento; precargado si existe) ----------
  let campos = null;
  if (esPrimer) {
    obtenerResultadoFinal(v.clienteId).then((g) => {
      guardadoCliente = g;
      if (!raiz.isConnected) return;
      campos = crearCamposCliente({
        cliente: cont.querySelector("#campos-cliente"),
        operacion: cont.querySelector("#campos-operacion"),
      }, g);
      campos.cambio(() => { datosCliente = campos.leer(); limpiarErroresSiResueltos(); refrescar(); });
      datosCliente = campos.leer();
      cargaCliente = "listo";
      if (g) {
        const f = g.actualizadoEn?.toDate ? formatearFecha(g.actualizadoEn.toDate().toISOString().slice(0, 10), { day: "numeric", month: "long" }) : "";
        const nota = cont.querySelector("[data-nota-cliente]");
        nota.innerHTML = `${icono("info", 16)}<span>Este cliente ya tiene perfil${g.actualizadoNombre ? `, registrado por ${esc(g.actualizadoNombre)}` : ""}${f ? ` el ${esc(f)}` : ""}. Complétalo si falta algo; los cambios posteriores repórtalos con «Reportar actualización».</span>`;
        nota.hidden = false;
      }
      refrescar();
    }).catch((err) => {
      console.error(err);
      cargaCliente = "error";
      ["#campos-cliente", "#campos-operacion"].forEach((s) => {
        const el = cont.querySelector(s);
        if (el) el.innerHTML = `<p class="form-error">No fue posible cargar la información del cliente: ${esc(mensajeError(err))}</p>`;
      });
    });
  }

  // ---------- Validación por paso ----------
  const erroresPaso = (paso) => {
    const lista = [];
    const err = (pregunta, mensaje, foco) => lista.push({ pregunta, mensaje, foco });
    if (paso === "autorizacion" && autoriza() === null) {
      err("autorizacion", "Registra si la persona autoriza o no el tratamiento de sus datos.", "[name=autorizaDatos]");
    }
    if (paso === "prospecto") {
      erroresProspecto(leerProspecto(raiz.querySelector(".prospecto-paso")), { alCerrar: !!valor() && !seReprograma(), sinTelefono: negativa() })
        .forEach(([campo, mensaje]) => err(campo, mensaje, `[name=${campo}]`));
    }
    if (paso === "conversacion" && !form.temasTratados.value.trim()) {
      err("temas", "Escribe los temas que se trataron en la visita.", "[name=temasTratados]");
    }
    if (paso === "novedades") {
      if (!form.querySelectorAll("[name=novedad]:checked").length) err("novedades", "Marca al menos una novedad. Si todo estuvo bien, elige «Sin novedad».", "[name=novedad]");
      if (!form.hayPqrs.value) err("pqrs", "Indica si se presentó o trató alguna PQRS.", "[name=hayPqrs]");
      else if (pqrsSi() && !form.pqrs.value.trim()) err("pqrs", "Describe la PQRS.", "[name=pqrs]");
    }
    if (["cliente", "operacion"].includes(paso)) {
      if (cargaCliente === "cargando") err(null, "Estamos cargando la información del cliente. Intenta de nuevo en un momento.");
      else if (campos) lista.push(...campos.errores(paso));
    }
    if (paso === "cierre") {
      if (!valor()) err("estado", "Indica cómo terminó la visita.", "[name=resultado]");
      else if (valor() === PENDIENTE && !form.pendiente.value.trim()) err("pendiente", "Cuenta qué quedó pendiente.", "[name=pendiente]");
      else if (seReprograma()) {
        if (!form.fecha.value) err("reprogramar", "Elige la nueva fecha de la visita.", "[name=fecha]");
        else if (form.fecha.value < hoyISO()) err("reprogramar", "La nueva fecha no puede ser anterior a hoy.", "[name=fecha]");
        else if (!form.hora.value) err("reprogramar", "Elige la hora de la nueva visita.", "[name=hora]");
        else if (form.fecha.value === v.fechaProgramada && form.hora.value === v.horaProgramada) err("reprogramar", "La nueva fecha y hora son iguales a las actuales.", "[name=fecha]");
        else if (!form.motivoReprogramacion.value.trim()) err("reprogramar", "Cuenta por qué se reprograma la visita.", "[name=motivoReprogramacion]");
      }
    }
    return lista;
  };
  const pasoCompleto = (paso) => visitados.has(paso) && !erroresPaso(paso).length;

  const limpiarErrores = () => {
    raiz.querySelectorAll("[data-pregunta].con-error").forEach((p) => {
      p.classList.remove("con-error");
      const m = p.querySelector(".pregunta-error");
      m.hidden = true;
      m.textContent = "";
    });
    cont.querySelector("#form-error").textContent = "";
  };

  const mostrarErrores = (lista) => {
    limpiarErrores();
    lista.forEach((e) => {
      const p = e.pregunta && raiz.querySelector(`.reg-paso[data-paso="${actual}"] [data-pregunta="${e.pregunta}"]`);
      if (!p) { cont.querySelector("#form-error").textContent = e.mensaje; return; }
      p.classList.add("con-error");
      const m = p.querySelector(".pregunta-error");
      if (!m.textContent) { m.textContent = e.mensaje; m.hidden = false; }
    });
    const primero = lista[0];
    const p = primero.pregunta && raiz.querySelector(`.reg-paso[data-paso="${actual}"] [data-pregunta="${primero.pregunta}"]`);
    if (p) {
      p.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      const foco = primero.foco && p.querySelector(primero.foco);
      foco?.focus({ preventScroll: true });
    }
  };

  // ---------- Navegación entre pasos ----------
  const irA = (paso) => {
    if (!aplicables().includes(paso)) return;
    actual = paso;
    visitados.add(paso);
    limpiarErrores();
    raiz.querySelectorAll(".reg-paso").forEach((s) => {
      const activo = s.dataset.paso === paso;
      s.hidden = !activo;
      s.classList.toggle("entrando", activo);
    });
    refrescar();
    const titulo = raiz.querySelector(`.reg-paso[data-paso="${paso}"] .reg-pregunta`);
    raiz.scrollIntoView({ block: "start" });
    window.scrollTo(0, 0);
    titulo?.setAttribute("tabindex", "-1");
    titulo?.focus({ preventScroll: true });
  };

  const siguiente = () => {
    const errores = erroresPaso(actual);
    if (errores.length) return mostrarErrores(errores);
    if (actual === "autorizacion" && autoriza() !== v.autorizacionDatos) {
      // Se registra de inmediato (con fecha y hora), sin esperar al cierre de la visita.
      const respuesta = autoriza();
      v.autorizacionDatos = respuesta;
      registrarAutorizacionDatos(ctx, v, respuesta)
        .then((e) => { if (e === "pendiente") toast("Respuesta guardada en este dispositivo. Se enviará cuando haya señal.", "info"); })
        .catch((err) => { console.error(err); toast(`No se pudo registrar la autorización: ${mensajeError(err)}`, "error"); });
    }
    const lista = aplicables();
    irA(lista[lista.indexOf(actual) + 1]);
  };
  const anterior = () => {
    const lista = aplicables();
    const i = lista.indexOf(actual);
    if (i > 0) irA(lista[i - 1]);
    else salir();
  };

  // Se puede ir a un paso si todos los anteriores están completos.
  const alcanzable = (paso) => {
    const lista = aplicables();
    const i = lista.indexOf(paso);
    return i >= 0 && lista.slice(0, i).every((p) => visitados.has(p) && !erroresPaso(p).length);
  };

  raiz.querySelectorAll("[data-ir]").forEach((b) => b.onclick = () => {
    const paso = b.dataset.ir;
    if (paso === actual) return;
    if (alcanzable(paso)) irA(paso);
    else mostrarErrores(erroresPaso(actual).length ? erroresPaso(actual) : [{ pregunta: null, mensaje: "Completa los pasos anteriores para avanzar." }]);
  });
  btnAtras.onclick = anterior;

  // ---------- Cambios en el formulario ----------
  form.querySelectorAll("[name=resultado]").forEach((radio) => radio.addEventListener("change", () => {
    cont.querySelector("#bloque-reprogramar").hidden = !seReprograma();
    cont.querySelector("#bloque-pendiente").hidden = valor() !== PENDIENTE;
    if (seReprograma()) setTimeout(() => form.fecha.focus(), 0);
    if (valor() === PENDIENTE) setTimeout(() => form.pendiente.focus(), 0);
    limpiarErrores();
    refrescar();
  }));
  form.querySelectorAll("[name=hayPqrs]").forEach((r) => r.addEventListener("change", () => {
    cont.querySelector("#campo-pqrs").hidden = !pqrsSi();
    if (pqrsSi()) setTimeout(() => form.pqrs.focus(), 0);
  }));

  // "Sin novedad" excluye las demás.
  form.querySelectorAll("[name=novedad]").forEach((cb) => cb.addEventListener("change", () => {
    if (!cb.checked) return;
    form.querySelectorAll("[name=novedad]").forEach((otro) => {
      if (otro !== cb && (cb.value === "Sin novedad" || otro.value === "Sin novedad")) otro.checked = false;
    });
  }));
  form.addEventListener("input", () => { limpiarErroresSiResueltos(); refrescar(); });
  form.addEventListener("change", () => { limpiarErroresSiResueltos(); refrescar(); });
  // Si la persona corrige, el error desaparece sin esperar a "Continuar".
  const limpiarErroresSiResueltos = () => {
    if (!raiz.querySelector("[data-pregunta].con-error")) return;
    const pendientes = new Set(erroresPaso(actual).map((e) => e.pregunta));
    raiz.querySelectorAll("[data-pregunta].con-error").forEach((p) => {
      if (pendientes.has(p.dataset.pregunta)) return;
      p.classList.remove("con-error");
      p.querySelector(".pregunta-error").hidden = true;
      p.querySelector(".pregunta-error").textContent = "";
    });
  };

  // ---------- Evidencia (opcional, una foto) ----------
  const inputFoto = cont.querySelector("#input-foto");
  const vistaFoto = cont.querySelector("#foto-vista");
  const btnFoto = cont.querySelector("#btn-foto");
  const acciones = cont.querySelector("#acciones-foto");
  const btnUsar = cont.querySelector("#btn-usar-foto");
  const btnRepetir = cont.querySelector("#btn-repetir-foto");
  const btnQuitar = cont.querySelector("#btn-quitar-foto");
  const filaFoto = cont.querySelector("#bloque-foto");
  const estadoFoto = (modo) => {
    btnFoto.hidden = modo !== "vacio";
    acciones.hidden = modo === "vacio";
    btnUsar.hidden = modo !== "previa";
    btnQuitar.hidden = modo !== "lista";
    cont.querySelector("#tipo-evidencia").hidden = modo === "vacio";
    btnRepetir.innerHTML = `${icono("camera", 18)}${modo === "lista" ? "Cambiar foto" : "Repetir foto"}`;
    filaFoto.dataset.estado = modo;
    cont.querySelector("#foto-icono").innerHTML = icono(modo === "lista" ? "ok" : "camera", 22);
    cont.querySelector("#foto-titulo").textContent = modo === "lista" ? "Evidencia registrada" : modo === "previa" ? "Revisa la foto" : "Evidencia";
    cont.querySelector("#foto-detalle").textContent = modo === "lista" ? "Se guardará con la visita."
      : modo === "previa" ? "¿Se ve bien? Úsala o tómala de nuevo." : "Se guarda comprimida, sin gastar datos de más.";
    refrescar();
  };
  btnFoto.onclick = () => inputFoto.click();
  btnRepetir.onclick = () => inputFoto.click();
  btnUsar.onclick = () => { foto = candidata; estadoFoto("lista"); };
  btnQuitar.onclick = () => { foto = candidata = null; vistaFoto.innerHTML = ""; estadoFoto("vacio"); };
  inputFoto.onchange = async () => {
    const archivo = inputFoto.files[0];
    inputFoto.value = "";
    if (!archivo) return;
    vistaFoto.innerHTML = esqueleto(1, 200);
    btnFoto.hidden = true;
    try {
      candidata = await comprimirFoto(archivo);
      foto = null;
      vistaFoto.innerHTML = `<img class="evidencia-foto" src="${candidata.datos}" alt="Vista previa de la evidencia">`;
      estadoFoto("previa");
    } catch (err) {
      candidata = null;
      vistaFoto.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
      estadoFoto("vacio");
    }
  };

  // ---------- Ubicación (automática, una sola vez) ----------
  const filaUbic = cont.querySelector("#estado-ubicacion");
  const btnUbic = cont.querySelector("#btn-ubicacion");
  const pintarUbicacion = (estado, titulo, detalle) => {
    filaUbic.dataset.estado = estado;
    filaUbic.querySelector(".evidencia-icono").innerHTML = icono(estado === "ok" ? "ok" : estado === "error" ? "alert" : "pin", 22);
    filaUbic.querySelector(".evidencia-texto").innerHTML = `<strong>${esc(titulo)}</strong><span>${esc(detalle)}</span>`;
    btnUbic.hidden = estado !== "error";
    refrescar();
  };
  const pedirUbicacion = async () => {
    pintarUbicacion("cargando", "Obteniendo ubicación…", "Solo se toma ahora, para este registro.");
    try {
      ubicacion = await obtenerUbicacion();
      if (raiz.isConnected) pintarUbicacion("ok", "Ubicación registrada", "Se guardará con la visita.");
    } catch (err) {
      ubicacion = null;
      if (raiz.isConnected) pintarUbicacion("error", "Sin ubicación", `${err.message} Puedes finalizar la visita sin ella.`);
    }
  };
  btnUbic.onclick = pedirUbicacion;
  pedirUbicacion();

  // ---------- Firma de recibido (opcional) ----------
  firma = activarFirma(raiz);
  firma.alCambiar(() => refrescar());

  // Si NO autoriza: no se recopilan datos personales nuevos (firma y teléfono del prospecto quedan deshabilitados).
  const aplicarAutorizacion = () => {
    const no = negativa();
    raiz.querySelector("#habeas-negativa").hidden = !no;
    const bloqueFirma = raiz.querySelector("[data-pregunta=firma]");
    bloqueFirma.classList.toggle("firma-bloqueada", no);
    bloqueFirma.querySelector(".firma-aviso").hidden = !no;
    bloqueFirma.querySelectorAll("input, button, canvas").forEach((el) => { el.disabled = no; });
    if (no) { firma.limpiar(); bloqueFirma.querySelector("[name=firmaNombre]").value = ""; }
    const tel = raiz.querySelector(".prospecto-paso [name=pTelefono]");
    if (tel) { tel.disabled = no; if (no) tel.value = v.prospecto?.telefono || ""; }
  };
  raiz.querySelectorAll("[name=autorizaDatos]").forEach((r) => r.addEventListener("change", () => { aplicarAutorizacion(); limpiarErroresSiResueltos(); refrescar(); }));
  aplicarAutorizacion();
  if (esProsp) activarCantidades(raiz.querySelector(".prospecto-paso"));

  // ---------- Guía (resumen que se llena solo) ----------
  function progreso() {
    const lista = aplicables();
    return Math.round((lista.filter(pasoCompleto).length / lista.length) * 100);
  }

  function pintarGuia() {
    const e = ESTADO[valor()];
    const c = cliente();
    const fila = (etq, val, extra = "") => `
      <div class="guia-fila ${val ? "" : "vacia"}"><dt>${esc(etq)}</dt><dd>${val ? esc(val) : "—"}${extra}</dd></div>`;
    const dias = c.diasBeneficio.length ? `<span class="guia-dias" aria-hidden="true">${Object.entries(LETRA_DIA).map(([k, l]) =>
      `<i class="${c.diasBeneficio.includes(k) ? "on" : ""}">${l}</i>`).join("")}</span>` : "";
    const pct = progreso();
    const pqrs = form.hayPqrs.value ? (pqrsSi() ? "Sí" : "No") : "";
    cont.querySelector("#guia").innerHTML = `
      <header class="guia-cabeza">
        <h3>Guía de visita</h3>
        ${chapeta(v.codigo)}
      </header>
      <div class="guia-sello ${e ? `sello-${e.valor.toLowerCase()}` : "sin-sello"}">${e ? `${icono(e.icono, 16)}${esc(e.titulo)}` : "En curso"}</div>
      ${seReprograma() && form.fecha.value ? `<p class="guia-nota">Nueva fecha: ${esc(formatearFecha(form.fecha.value, { weekday: "short", day: "numeric", month: "short" }))}${form.hora.value ? `, ${esc(formatearHora(form.hora.value))}` : ""}</p>` : ""}
      <dl class="guia-datos">
        ${fila("Tipo", tipo.texto)}
        ${fila("Datos personales", autoriza() === true ? "Autoriza" : autoriza() === false ? "No autoriza" : "")}
        ${fila("Inicio", horaDe(v.inicioVisita))}
        ${esSeguimiento ? fila("Temas", form.temasTratados.value.trim().slice(0, 80)) : ""}
        ${esProsp ? (() => { const pr = leerProspecto(raiz.querySelector(".prospecto-paso")); return fila("Teléfono", pr.telefono) + fila("Interesado", pr.interesado === true ? "Sí" : pr.interesado === false ? "No" : "") + fila("Temas", pr.temasTratados.slice(0, 80)); })() : ""}
        ${esProsp ? "" : fila("Novedades", novedades().join(", "))}
        ${esProsp ? "" : fila("PQRS", pqrs)}
        ${esPrimer ? `
        ${fila("Beneficio", textoBeneficio(c.tipoBeneficio))}
        ${fila("Compra", textoCompra(c.compraGanado))}
        ${fila("Otras sedes", textoSedes(c))}
        ${fila("Días en CG", textoTotalDias(c.totalDiasBeneficio), dias)}
        ${fila("Facturación", textoFacturacion(c.facturacion))}
        ${fila("Canal", textoCanal(c))}` : ""}
        ${fila("Evidencia", [foto || candidata ? form.tipoEvidencia.value : "", ubicacion ? "Ubicación" : ""].filter(Boolean).join(" y "))}
        ${fila("Firma", firma && !firma.vacia() ? (firma.nombre() || "Firmada") : "")}
      </dl>
      <footer class="guia-pie">
        <div class="guia-progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Avance del registro"><span style="width:${pct}%"></span></div>
        <span><strong>${pct} %</strong> completado</span>
      </footer>`;
  }

  // ---------- Estado visual (ruta, barra, botones) ----------
  function refrescar() {
    if (!raiz.isConnected) return;
    const lista = aplicables();
    const i = lista.indexOf(actual);
    raiz.dataset.paso = actual;
    raiz.querySelectorAll(".ruta-paso").forEach((li) => {
      const id = li.dataset.ruta;
      const esActual = id === actual;
      li.className = `ruta-paso ${esActual ? "actual" : pasoCompleto(id) ? "hecho" : visitados.has(id) ? "visto" : "pendiente"}`;
      const b = li.querySelector("button");
      b.setAttribute("aria-label", `${PASOS.find((p) => p.id === id).nombre}: ${esActual ? "paso actual" : pasoCompleto(id) ? "completo" : "pendiente"}`);
      if (esActual) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    raiz.querySelectorAll("[data-num]").forEach((n) => { n.textContent = `Paso ${i + 1} de ${lista.length}`; });
    cont.querySelector("#rc-paso").textContent = `Paso ${i + 1} de ${lista.length}`;
    cont.querySelector("#rc-nombre").textContent = PASOS.find((p) => p.id === actual).nombre;
    cont.querySelector("#rc-barra").style.width = `${Math.round(((i + 1) / lista.length) * 100)}%`;
    btnAtras.innerHTML = i === 0 ? `${icono("back", 18)}Brief` : `${icono("back", 18)}Atrás`;
    const ultimo = actual === "cierre";
    btnGuardar.classList.toggle("btn-final", ultimo);
    btnGuardar.innerHTML = ultimo ? `${icono(seReprograma() ? "repeat" : "ok", 20)}${esc(ESTADO[valor()]?.cta || "Finalizar visita")}` : "Continuar";
    pintarGuia();
  }

  // ---------- Guardar ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (actual !== "cierre") return siguiente();

    // Revalida todo antes de guardar.
    for (const paso of aplicables()) {
      const errores = erroresPaso(paso);
      if (errores.length) { irA(paso); return mostrarErrores(errores); }
    }
    const val = valor();
    const novs = novedades();
    const observaciones = form.observaciones?.value || "";
    const prospecto = esProsp ? leerProspecto(raiz.querySelector(".prospecto-paso")) : null;
    const firmaDatos = negativa() ? null : firma.leer();
    const datosRF = esPrimer && campos ? campos.leer() : null;
    const guardarRF = datosRF && datosClienteCambiaron(guardadoCliente, datosRF);

    setCargando(btnGuardar, true, "Guardando…");
    btnAtras.disabled = true;
    try {
      // El perfil es del cliente (un solo registro): se crea o se completa solo si cambió.
      if (guardarRF) await guardarResultadoFinal(ctx, v.clienteId, datosRF, { nuevo: !guardadoCliente, conservarVacios: true });
      if (val === REPROGRAMAR) {
        const estado = await reprogramarVisita(ctx, v, {
          fecha: form.fecha.value, hora: form.hora.value, motivo: form.motivoReprogramacion.value.trim(),
          novedades: novs, observaciones, prospecto, firma: firmaDatos,
        });
        avisarEscritura(estado, `Visita reprogramada para el ${formatearFechaLarga(form.fecha.value)}`);
      } else {
        const estado = await registrarResultado(ctx, v, {
          estado: val, novedades: esProsp ? [] : novs, observaciones, ubicacion, foto: foto || candidata, prospecto, firma: firmaDatos,
          tipoEvidencia: form.tipoEvidencia.value,
          temasTratados: esSeguimiento ? form.temasTratados.value : esProsp ? prospecto.temasTratados : "",
          pqrs: pqrsSi() ? form.pqrs.value : "",
          pendiente: val === PENDIENTE ? form.pendiente.value : "",
        });
        const min = duracionMinutos(v.inicioVisita, new Date().toISOString());
        avisarEscritura(estado, `${ESTADO[val].aviso}${min != null ? ` · duración ${textoDuracion(min)}` : ""}${guardarRF ? ". Perfil del cliente guardado" : ""}${firmaDatos ? ". Con firma de recibido" : ""}`);
      }
      limpiar();
      nav.recargar();
    } catch (err) {
      console.error(err);
      cont.querySelector("#form-error").textContent = mensajeError(err);
      setCargando(btnGuardar, false);
      btnAtras.disabled = false;
    }
  });

  refrescar();
}
