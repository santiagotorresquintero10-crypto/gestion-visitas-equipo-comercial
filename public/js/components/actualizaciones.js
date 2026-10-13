// Actualizaciones del cliente: botón flotante + hoja lateral (o inferior en celular) para reportar cambios sin salir
// de la visita, y la línea de tiempo del cliente (visitas + actualizaciones).
// Lo reportado NO modifica la ficha: queda como "Reportada" con el valor anterior y el nuevo (ver actualizaciones-service).
import { esc, icono, toast, setCargando, chapeta, esqueleto } from "../ui.js";
import {
  TIPOS_ACTUALIZACION, TIPO_ACTUALIZACION, ESTADOS_ACTUALIZACION, ESTADO_ACTUALIZACION_LABEL,
  TIPOS_BENEFICIO, DIAS_BENEFICIO, ESTADO_LABEL, tipoDeVisita, TIPO_VISITA,
} from "../constants.js";
import {
  reportarActualizaciones, listarActualizacionesCliente, cambiarEstadoActualizacion, actualizacionPendiente,
} from "../services/actualizaciones-service.js";
import { listarVisitasCliente, sedesDeCliente, estadoVisible } from "../services/visitas-service.js";
import { mensajeError } from "../services/auth-service.js";
import { textoBeneficio, textoCompra, textoFacturacion, textoCanal, diasCortos, ILUSTRACION_ESPECIE } from "./campos-cliente.js";
import { formatearFecha, formatearHora } from "../utils/fechas.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const { REPORTADA, REVISADA, APLICADA } = ESTADOS_ACTUALIZACION;
const titulo = (t) => String(t || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const CAMPOS_CORRECCION = [
  { clave: "expendio", texto: "Nombre del expendio" },
  { clave: "razonSocial", texto: "Razón social" },
  { clave: "representante", texto: "Representante legal" },
  { clave: "nit", texto: "NIT / Cédula" },
  { clave: "correo", texto: "Correo" },
  { clave: "barrio", texto: "Barrio" },
  { clave: "zona", texto: "Zona" },
  { clave: "otro", texto: "Otro dato" },
];

// ---------- Datos actuales del cliente (lo que se muestra como "Actual") ----------

function datosActuales(cliente, perfil) {
  const sedes = sedesDeCliente(cliente);
  const principal = sedes[0] || {};
  const sedesPerfil = (perfil?.sedes || []).map((s) => ({ etiqueta: [s.nombre, s.ciudad].filter(Boolean).join(", "), direccion: "", ciudad: s.ciudad || "" }));
  const sedesTodas = [
    ...sedes.map((s, i) => ({
      etiqueta: `${i === 0 ? "Sede principal" : `Sede ${i + 1}`}: ${[s.direccion, s.ciudad].filter(Boolean).join(", ") || "Sin dirección"}`,
      direccion: s.direccion, ciudad: s.ciudad, barrio: s.barrio,
    })),
    ...sedesPerfil.map((s) => ({ ...s, etiqueta: `Otra sede: ${s.etiqueta}` })),
  ];
  return {
    sedes: sedesTodas,
    telefono: principal.celular || principal.telefono || "",
    responsable: principal.responsable || "",
    marcas: (cliente.marcas || []).map((m) => m.marca).filter(Boolean),
    dias: perfil?.diasBeneficio || [],
    especie: perfil?.tipoBeneficio || null,
    comercial: perfil ? [
      perfil.compraGanado?.length ? `Compra: ${textoCompra(perfil.compraGanado)}` : "",
      perfil.facturacion?.length ? `Factura: ${textoFacturacion(perfil.facturacion)}` : "",
      perfil.preferenciaCanal ? `Canal: ${textoCanal(perfil)}` : "",
    ].filter(Boolean).join(" · ") : "",
    valor: (campo) => campo === "zona" ? cliente.zona || principal.zona || ""
      : campo === "barrio" ? principal.barrio || "" : cliente[campo] || "",
  };
}

// ---------- Formularios por tipo ----------

const campo = (nombre, etiqueta, { valor = "", tipo = "text", req = false, ph = "", max = 160, ancho = "" } = {}) => `
  <label class="campo ${ancho}"><span>${esc(etiqueta)}${req ? "" : ' <small class="texto-suave">(opcional)</small>'}</span>
    <input type="${tipo}" name="${nombre}" maxlength="${max}" value="${esc(valor)}" placeholder="${esc(ph)}" ${tipo === "tel" ? 'inputmode="tel"' : ""}></label>`;
const area = (nombre, etiqueta, { req = true, ph = "", filas = 3 } = {}) => `
  <label class="campo"><span>${esc(etiqueta)}${req ? "" : ' <small class="texto-suave">(opcional)</small>'}</span>
    <textarea name="${nombre}" rows="${filas}" maxlength="1000" placeholder="${esc(ph)}"></textarea></label>`;
const actual = (etiqueta, valor) => `
  <div class="cambio-actual"><span>${esc(etiqueta)}</span><strong>${valor ? esc(valor) : '<em class="texto-suave">Sin registrar</em>'}</strong></div>`;
const selector = (nombre, etiqueta, opciones) => `
  <label class="campo"><span>${esc(etiqueta)}</span>
    <select name="${nombre}"><option value="">Selecciona…</option>${opciones.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join("")}</select></label>`;
const diasVista = (dias) => `<span class="dias-actuales">${DIAS_BENEFICIO.map((d) => `<i class="${dias.includes(d.clave) ? "on" : ""}">${dias.includes(d.clave) ? "✓" : "—"} ${esc(d.corto.toUpperCase())}</i>`).join("")}</span>`;

function formularioTipo(tipo, a) {
  switch (tipo) {
    case "NUEVA_SEDE": return `
      <div class="form-fila">${campo("sedeNombre", "Nombre o identificación de la sede", { ph: "Ej.: La Perica #3" })}${campo("sedeZona", "Zona", { ph: "Ej.: Sur", max: 60 })}</div>
      ${campo("sedeDireccion", "Dirección", { req: true, ph: "Ej.: CRA 80 45 22" })}
      <div class="form-fila">${campo("sedeCiudad", "Ciudad o municipio", { req: true, ph: "Ej.: Medellín", max: 80 })}${campo("sedeResponsable", "Responsable", { ph: "Nombre" })}</div>
      ${campo("sedeTelefono", "Teléfono", { tipo: "tel", max: 30 })}`;
    case "SEDE_CERRADA": return a.sedes.length
      ? selector("sedeCerrada", "¿Qué sede cerró?", a.sedes.map((s) => s.etiqueta))
      : `<p class="texto-suave">No hay sedes registradas. Descríbela en la observación.</p>${campo("sedeCerradaTexto", "Sede que cerró", { req: true })}`;
    case "DIRECCION": return `
      ${a.sedes.length > 1 ? selector("dirSede", "¿De qué sede?", a.sedes.map((s) => s.etiqueta)) : ""}
      <div data-dir-actual>${actual("Dirección actual", a.sedes[0] ? [a.sedes[0].direccion, a.sedes[0].ciudad].filter(Boolean).join(", ") : "")}</div>
      ${campo("dirNueva", "Nueva dirección", { req: true, ph: "Ej.: CRA 80 45 22" })}
      <div class="form-fila">${campo("dirBarrio", "Barrio", { max: 80 })}${campo("dirCiudad", "Ciudad o municipio", { max: 80 })}</div>`;
    case "TELEFONO": return `
      ${actual("Teléfono actual", a.telefono)}
      ${campo("telNuevo", "Nuevo teléfono", { tipo: "tel", req: true, max: 30, ph: "Ej.: 3001234567" })}`;
    case "RESPONSABLE": return `
      ${actual("Responsable actual", titulo(a.responsable))}
      ${campo("respNombre", "Nuevo responsable", { req: true, ph: "Nombre completo" })}
      <div class="form-fila">${campo("respTelefono", "Teléfono", { tipo: "tel", max: 30 })}${campo("respCargo", "Cargo", { max: 80, ph: "Ej.: administrador" })}</div>`;
    case "NUEVA_MARCA": return `
      <div class="cambio-actual"><span>Marcas actuales</span><div class="chips">${a.marcas.length ? a.marcas.map((m) => `<span class="chip chip-neutro">${esc(m)}</span>`).join("") : '<em class="texto-suave">Sin marcas registradas</em>'}</div></div>
      <div class="marcas-nuevas" data-marcas>${campo("marcaNueva", "Nueva marca", { req: true, ph: "Nombre de la marca" })}</div>
      <button type="button" class="btn btn-secundario btn-sm" data-agregar-marca>${icono("plus", 16)}Agregar otra marca</button>`;
    case "MARCA": return `
      ${a.marcas.length ? selector("marcaSel", "¿Qué marca?", a.marcas) : campo("marcaTexto", "Marca", { req: true })}
      ${area("marcaCambio", "¿Qué cambió?", { ph: "Ej.: cambió el nombre a Montecristo Gourmet" })}`;
    case "DIAS_BENEFICIO": return `
      <div class="cambio-actual"><span>Días actuales</span>${a.dias.length ? diasVista(a.dias) : '<strong><em class="texto-suave">Sin registrar</em></strong>'}</div>
      <fieldset class="cambio-sub"><legend>Nuevos días</legend>
        <div class="dias dias-compactos">${DIAS_BENEFICIO.map((x) => `
          <label class="dia"><input type="checkbox" name="diasNuevos" value="${x.clave}" ${a.dias.includes(x.clave) ? "checked" : ""}>
            <span><b>${esc(x.corto.toUpperCase())}</b><i aria-hidden="true">${icono("ok", 12)}</i><span class="sr-only">${esc(x.texto)}</span></span></label>`).join("")}
        </div></fieldset>`;
    case "TIPO_BENEFICIO": return `
      ${actual("Tipo actual", textoBeneficio(a.especie))}
      <fieldset class="cambio-sub"><legend>Nuevo tipo</legend>
        <div class="especies especies-compactas">${TIPOS_BENEFICIO.map((x) => `
          <label class="decision especie"><input type="radio" name="especieNueva" value="${x.clave}" ${a.especie === x.clave ? "checked" : ""}>
            <span>${ILUSTRACION_ESPECIE[x.clave]}<strong>${esc(x.texto)}</strong><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b></span></label>`).join("")}
        </div></fieldset>`;
    case "COMERCIAL": return `
      ${actual("Información actual", a.comercial)}
      ${area("comercialCambio", "¿Qué cambió?", { ph: "Ej.: ahora factura también por Agrofar; prefiere canal semi pistola" })}`;
    case "CORRECCION": return `
      ${selector("corrCampo", "¿Qué dato hay que corregir?", CAMPOS_CORRECCION.map((c) => c.texto))}
      <div data-corr-actual></div>
      ${campo("corrValor", "Dato correcto", { req: true })}`;
    case "OTRO": return area("otroTexto", "Describe la actualización", { filas: 4, ph: "Ej.: el cliente informa que desde noviembre beneficia solo los martes." });
    default: return "";
  }
}

// Lee y valida un tipo. Devuelve { cambio } o { error, foco }.
function leerTipo(tipo, el, a) {
  const v = (n) => el.querySelector(`[name=${n}]`)?.value.trim() || "";
  const err = (error, foco) => ({ error, foco });
  switch (tipo) {
    case "NUEVA_SEDE": {
      if (!v("sedeDireccion")) return err("Escribe la dirección de la nueva sede.", "sedeDireccion");
      if (!v("sedeCiudad")) return err("Indica la ciudad o municipio de la nueva sede.", "sedeCiudad");
      const d = { nombre: v("sedeNombre"), direccion: v("sedeDireccion"), ciudad: v("sedeCiudad"), zona: v("sedeZona"), responsable: v("sedeResponsable"), telefono: v("sedeTelefono") };
      return { cambio: { campo: "Sedes", anterior: "", nuevo: [d.nombre, d.direccion, d.ciudad].filter(Boolean).join(", "), detalle: d } };
    }
    case "SEDE_CERRADA": {
      if (a.sedes.length) {
        const i = v("sedeCerrada");
        if (i === "") return err("Selecciona la sede que cerró.", "sedeCerrada");
        return { cambio: { campo: "Sedes", anterior: a.sedes[i].etiqueta, nuevo: "Cerrada", detalle: { sede: a.sedes[i].etiqueta } } };
      }
      if (!v("sedeCerradaTexto")) return err("Escribe qué sede cerró.", "sedeCerradaTexto");
      return { cambio: { campo: "Sedes", anterior: v("sedeCerradaTexto"), nuevo: "Cerrada", detalle: { sede: v("sedeCerradaTexto") } } };
    }
    case "DIRECCION": {
      const i = a.sedes.length > 1 ? v("dirSede") : "0";
      if (a.sedes.length > 1 && i === "") return err("Selecciona la sede que cambió de dirección.", "dirSede");
      if (!v("dirNueva")) return err("Escribe la nueva dirección.", "dirNueva");
      const sede = a.sedes[i] || {};
      const anterior = [sede.direccion, sede.ciudad].filter(Boolean).join(", ");
      const nuevo = [v("dirNueva"), v("dirBarrio"), v("dirCiudad")].filter(Boolean).join(", ");
      return { cambio: { campo: a.sedes.length > 1 ? `Dirección (${sede.etiqueta?.split(":")[0]})` : "Dirección", anterior, nuevo, detalle: { sede: sede.etiqueta || "", direccion: v("dirNueva"), barrio: v("dirBarrio"), ciudad: v("dirCiudad") } } };
    }
    case "TELEFONO": {
      const t = v("telNuevo");
      if (t.replace(/\D/g, "").length < 7) return err("Escribe un teléfono válido (al menos 7 dígitos).", "telNuevo");
      if (t.replace(/\D/g, "") === a.telefono.replace(/\D/g, "")) return err("El teléfono nuevo es igual al actual.", "telNuevo");
      return { cambio: { campo: "Teléfono", anterior: a.telefono, nuevo: t, detalle: { telefono: t } } };
    }
    case "RESPONSABLE": {
      if (!v("respNombre")) return err("Escribe el nombre del nuevo responsable.", "respNombre");
      const nuevo = [v("respNombre"), v("respCargo"), v("respTelefono")].filter(Boolean).join(", ");
      return { cambio: { campo: "Responsable", anterior: titulo(a.responsable), nuevo, detalle: { nombre: v("respNombre"), telefono: v("respTelefono"), cargo: v("respCargo") } } };
    }
    case "NUEVA_MARCA": {
      const marcas = [...el.querySelectorAll("[name=marcaNueva]")].map((i) => i.value.trim()).filter(Boolean);
      if (!marcas.length) return err("Escribe el nombre de la nueva marca.", "marcaNueva");
      return { cambio: { campo: "Marcas", anterior: a.marcas.join(", "), nuevo: marcas.join(", "), detalle: { marcas } } };
    }
    case "MARCA": {
      const marca = a.marcas.length ? a.marcas[v("marcaSel")] : v("marcaTexto");
      if (!marca) return err("Selecciona la marca que cambió.", a.marcas.length ? "marcaSel" : "marcaTexto");
      if (!v("marcaCambio")) return err("Cuenta qué cambió en la marca.", "marcaCambio");
      return { cambio: { campo: `Marca ${marca}`, anterior: marca, nuevo: v("marcaCambio"), detalle: { marca, cambio: v("marcaCambio") } } };
    }
    case "DIAS_BENEFICIO": {
      const dias = [...el.querySelectorAll("[name=diasNuevos]:checked")].map((c) => c.value);
      if (!dias.length) return err("Marca los días en que beneficia ahora.", "diasNuevos");
      if (dias.join() === DIAS_BENEFICIO.map((d) => d.clave).filter((k) => a.dias.includes(k)).join()) return err("Los días marcados son iguales a los actuales.", "diasNuevos");
      return { cambio: { campo: "Días de beneficio", anterior: diasCortos(a.dias).join(" · "), nuevo: diasCortos(dias).join(" · "), detalle: { dias } } };
    }
    case "TIPO_BENEFICIO": {
      const e = el.querySelector("[name=especieNueva]:checked")?.value;
      if (!e) return err("Selecciona el nuevo tipo de beneficio.", "especieNueva");
      if (e === a.especie) return err("Es el mismo tipo que ya tiene registrado.", "especieNueva");
      return { cambio: { campo: "Tipo de beneficio", anterior: textoBeneficio(a.especie), nuevo: textoBeneficio(e), detalle: { tipoBeneficio: e } } };
    }
    case "COMERCIAL":
      if (!v("comercialCambio")) return err("Cuenta qué cambió en la información comercial.", "comercialCambio");
      return { cambio: { campo: "Información comercial", anterior: a.comercial, nuevo: v("comercialCambio"), detalle: {} } };
    case "CORRECCION": {
      const i = v("corrCampo");
      if (i === "") return err("Selecciona el dato que hay que corregir.", "corrCampo");
      if (!v("corrValor")) return err("Escribe el dato correcto.", "corrValor");
      const c = CAMPOS_CORRECCION[i];
      return { cambio: { campo: c.texto, anterior: c.clave === "otro" ? "" : a.valor(c.clave), nuevo: v("corrValor"), detalle: { campo: c.clave } } };
    }
    case "OTRO":
      if (!v("otroTexto")) return err("Describe la actualización.", "otroTexto");
      return { cambio: { campo: "Otro", anterior: "", nuevo: v("otroTexto"), detalle: {} } };
    default: return err("Tipo no válido.");
  }
}

// ---------- Hoja (panel lateral / inferior) ----------

export function abrirHoja({ titulo: t, subtitulo = "", cuerpo, pie = "", clase = "" }) {
  const previo = document.activeElement;
  const capa = document.createElement("div");
  capa.className = "hoja-capa";
  capa.innerHTML = `
    <section class="hoja ${clase}" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
      <header class="hoja-cabeza">
        <span class="hoja-asa" aria-hidden="true"></span>
        <div><h2 id="hoja-titulo" tabindex="-1">${t}</h2>${subtitulo ? `<p>${subtitulo}</p>` : ""}</div>
        <button type="button" class="btn-icono hoja-cerrar" data-cerrar aria-label="Cerrar">${icono("close", 22)}</button>
      </header>
      <div class="hoja-cuerpo">${cuerpo}</div>
      ${pie ? `<footer class="hoja-pie">${pie}</footer>` : ""}
    </section>`;
  document.body.appendChild(capa);
  document.body.classList.add("con-hoja");
  requestAnimationFrame(() => capa.classList.add("abierta"));
  const cerrar = () => {
    capa.classList.remove("abierta");
    document.body.classList.remove("con-hoja");
    window.removeEventListener("hashchange", cerrar);
    document.removeEventListener("keydown", tecla);
    setTimeout(() => capa.remove(), 220);
    previo?.focus?.({ preventScroll: true });
  };
  const tecla = (e) => {
    if (e.key === "Escape") cerrar();
    if (e.key === "Tab") { // el foco no sale de la hoja
      const f = [...capa.querySelectorAll("button:not([disabled]), input, select, textarea, a[href]")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  capa.addEventListener("click", (e) => { if (e.target === capa || e.target.closest("[data-cerrar]")) cerrar(); });
  document.addEventListener("keydown", tecla);
  window.addEventListener("hashchange", cerrar);
  setTimeout(() => capa.querySelector(".hoja-cabeza h2")?.focus?.(), 50);
  return { capa, hoja: capa.querySelector(".hoja"), cerrar };
}

// ---------- API ----------
// sitio: "brief" | "registro" | "ficha" (ubica el botón flotante sobre las barras fijas de cada pantalla).
export function crearActualizaciones({ cont, ctx, cliente, perfil = null, visitaId = null, sitio = "brief", onCambio = () => {} }) {
  let lista = null;
  const a = datosActuales(cliente, perfil);

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "fab-actualizar";
  fab.dataset.sitio = sitio;
  fab.innerHTML = `${icono("edit", 20)}<span class="fab-texto">Reportar actualización</span><span class="fab-cifra" hidden></span>`;
  fab.setAttribute("aria-label", "Reportar actualización del cliente");
  fab.onclick = () => abrirReporte();
  cont.appendChild(fab);

  const pintarCifra = () => {
    const n = (lista || []).filter(actualizacionPendiente).length;
    const c = fab.querySelector(".fab-cifra");
    c.hidden = !n;
    c.textContent = n;
    fab.setAttribute("aria-label", `Reportar actualización del cliente${n ? `. ${n} pendientes de aplicar` : ""}`);
  };

  async function cargar() {
    try {
      lista = await listarActualizacionesCliente(cliente.id);
    } catch (err) {
      console.error(err);
      lista = [];
    }
    pintarCifra();
    onCambio(lista);
    return lista;
  }

  function abrirReporte(tipoInicial = null) {
    const { hoja, cerrar } = abrirHoja({
      titulo: "Actualizar información",
      subtitulo: `${chapeta(cliente.codigo)}<span>${esc(nombreCliente(cliente))}</span>`,
      clase: "hoja-reporte",
      cuerpo: `
        <p class="hoja-intro">${icono("info", 16)}<span>Lo que reportes no cambia la ficha: queda registrado para revisión, con el dato anterior y el nuevo.</span></p>
        <fieldset class="pregunta" data-pregunta="tipos">
          <legend class="pregunta-titulo">¿Qué información cambió?</legend>
          <p class="pregunta-ayuda">Puedes marcar varias.</p>
          <p class="pregunta-error" role="alert" hidden></p>
          <div class="chips tipos-actualizacion">${TIPOS_ACTUALIZACION.map((t) => `
            <label class="chip-opcion"><input type="checkbox" name="tipoAct" value="${t.clave}" ${t.clave === tipoInicial ? "checked" : ""}>
              <span>${icono(t.icono, 17)}<em>${esc(t.texto)}</em></span></label>`).join("")}
          </div>
        </fieldset>
        <div class="cambios" data-cambios></div>
        <fieldset class="pregunta" data-pregunta="observacion">
          <legend class="pregunta-titulo">Observación de la actualización</legend>
          <p class="pregunta-ayuda">El contexto: quién lo informó, desde cuándo aplica.</p>
          <label class="campo"><span class="sr-only">Observación</span>
            <textarea name="obsAct" rows="3" maxlength="2000" placeholder="Ej.: el cliente informa que desde octubre la sede de San Javier se trasladó."></textarea></label>
        </fieldset>
        <p class="form-error" data-error role="alert"></p>`,
      pie: `
        <button type="button" class="btn btn-fantasma" data-cerrar>Cancelar</button>
        <button type="button" class="btn btn-accion" data-enviar disabled>${icono("upload", 18)}Enviar actualización</button>`,
    });
    const cambiosEl = hoja.querySelector("[data-cambios]");
    const enviar = hoja.querySelector("[data-enviar]");
    const seleccion = () => [...hoja.querySelectorAll("[name=tipoAct]:checked")].map((c) => c.value);

    const pintarCambios = () => {
      const tipos = seleccion();
      // Conserva lo escrito en los bloques que siguen marcados.
      cambiosEl.querySelectorAll("[data-tipo]").forEach((b) => { if (!tipos.includes(b.dataset.tipo)) b.remove(); });
      tipos.forEach((t) => {
        if (cambiosEl.querySelector(`[data-tipo="${t}"]`)) return;
        const tipo = TIPO_ACTUALIZACION[t];
        const orden = TIPOS_ACTUALIZACION.findIndex((x) => x.clave === t);
        const bloque = document.createElement("section");
        bloque.className = "cambio";
        bloque.dataset.tipo = t;
        bloque.style.order = orden;
        bloque.innerHTML = `
          <header class="cambio-cabeza"><span class="cambio-icono">${icono(tipo.icono, 18)}</span><h3>${esc(tipo.texto)}</h3>
            <button type="button" class="btn-icono" data-quitar="${t}" aria-label="Quitar ${esc(tipo.texto)}">${icono("close", 18)}</button></header>
          <p class="pregunta-error" role="alert" hidden></p>
          <div class="cambio-campos">${formularioTipo(t, a)}</div>`;
        cambiosEl.appendChild(bloque);
      });
      const n = tipos.length;
      enviar.disabled = !n;
      enviar.innerHTML = `${icono("upload", 18)}${n > 1 ? `Enviar ${n} actualizaciones` : "Enviar actualización"}`;
    };

    hoja.addEventListener("change", (e) => {
      if (e.target.name === "tipoAct") {
        pintarCambios();
        if (e.target.checked) setTimeout(() => cambiosEl.querySelector(`[data-tipo="${e.target.value}"] input:not([type=checkbox]):not([type=radio]), [data-tipo="${e.target.value}"] select, [data-tipo="${e.target.value}"] textarea`)?.focus(), 0);
      }
      if (e.target.name === "dirSede") {
        const s = a.sedes[e.target.value];
        hoja.querySelector("[data-dir-actual]").innerHTML = actual("Dirección actual", s ? [s.direccion, s.ciudad].filter(Boolean).join(", ") : "");
      }
      if (e.target.name === "corrCampo") {
        const c = CAMPOS_CORRECCION[e.target.value];
        hoja.querySelector("[data-corr-actual]").innerHTML = c && c.clave !== "otro" ? actual("Dato actual", a.valor(c.clave)) : "";
      }
      const bloque = e.target.closest(".cambio");
      if (bloque) { const m = bloque.querySelector(":scope > .pregunta-error"); m.hidden = true; bloque.classList.remove("con-error"); }
    });
    hoja.addEventListener("input", (e) => {
      const bloque = e.target.closest(".cambio");
      if (bloque?.classList.contains("con-error")) { bloque.querySelector(":scope > .pregunta-error").hidden = true; bloque.classList.remove("con-error"); }
    });
    hoja.addEventListener("click", (e) => {
      const q = e.target.closest("[data-quitar]");
      if (q) { hoja.querySelector(`[name=tipoAct][value="${q.dataset.quitar}"]`).checked = false; pintarCambios(); }
      if (e.target.closest("[data-agregar-marca]")) {
        const cont2 = hoja.querySelector("[data-marcas]");
        cont2.insertAdjacentHTML("beforeend", campo("marcaNueva", "Otra marca", { req: true, ph: "Nombre de la marca" }));
        cont2.lastElementChild.querySelector("input").focus();
      }
    });

    enviar.onclick = async () => {
      const errorEl = hoja.querySelector("[data-error]");
      errorEl.textContent = "";
      const tipos = seleccion();
      const cambios = [];
      let primero = null;
      for (const t of tipos) {
        const bloque = cambiosEl.querySelector(`[data-tipo="${t}"]`);
        const r = leerTipo(t, bloque, a);
        const m = bloque.querySelector(":scope > .pregunta-error");
        if (r.error) {
          m.textContent = r.error;
          m.hidden = false;
          bloque.classList.add("con-error");
          primero ||= { bloque, foco: r.foco };
        } else {
          m.hidden = true;
          bloque.classList.remove("con-error");
          cambios.push({ tipo: t, ...r.cambio });
        }
      }
      if (primero) {
        primero.bloque.scrollIntoView({ block: "center", behavior: "smooth" });
        primero.bloque.querySelector(`[name=${primero.foco}]`)?.focus({ preventScroll: true });
        return;
      }
      setCargando(enviar, true, "Enviando…");
      try {
        const { estado, creados } = await reportarActualizaciones(ctx, {
          cliente, visitaId, cambios, observacion: hoja.querySelector("[name=obsAct]").value,
        });
        lista = [...creados, ...(lista || [])];
        pintarCifra();
        onCambio(lista);
        cerrar();
        toast(estado === "pendiente"
          ? "Actualización guardada en este dispositivo. Se enviará cuando haya señal."
          : `${cambios.length > 1 ? `${cambios.length} actualizaciones reportadas` : "Actualización reportada"}. Queda pendiente de revisión.`, estado === "pendiente" ? "info" : "ok");
      } catch (err) {
        console.error(err);
        errorEl.textContent = mensajeError(err);
        setCargando(enviar, false);
      }
    };
    pintarCambios();
  }

  // Línea de tiempo del cliente: visitas y actualizaciones juntas. filtro: "todo" | "visitas" | "actualizaciones".
  async function abrirHistorial(filtro = "todo", { onAbrirVisita } = {}) {
    const { hoja, cerrar } = abrirHoja({
      titulo: "Historial del cliente",
      subtitulo: `${chapeta(cliente.codigo)}<span>${esc(nombreCliente(cliente))}</span>`,
      clase: "hoja-historial",
      cuerpo: `
        <div class="segmentos hoja-filtro" role="tablist">
          ${[["todo", "Todo"], ["visitas", "Visitas"], ["actualizaciones", "Actualizaciones"]].map(([k, t]) =>
            `<button type="button" role="tab" data-filtro="${k}" class="segmento ${k === filtro ? "activo" : ""}" aria-selected="${k === filtro}">${t}</button>`).join("")}
        </div>
        <div data-linea>${esqueleto(4, 64)}</div>`,
    });
    let visitas = [];
    try {
      [visitas] = await Promise.all([listarVisitasCliente(ctx, cliente.id), lista ? Promise.resolve(lista) : cargar()]);
    } catch (err) {
      hoja.querySelector("[data-linea]").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
      return;
    }
    const pintar = () => {
      const eventos = [
        ...(filtro === "actualizaciones" ? [] : visitas.map((v) => ({ tipo: "visita", fecha: v.resultado?.fechaHora || `${v.fechaProgramada}T${v.horaProgramada || "00:00"}:00`, v }))),
        ...(filtro === "visitas" ? [] : (lista || []).map((x) => ({ tipo: "act", fecha: x.fechaReporteLocal || "", x }))),
      ].sort((p, q) => q.fecha.localeCompare(p.fecha));
      const linea = hoja.querySelector("[data-linea]");
      if (!eventos.length) {
        linea.innerHTML = `<p class="hoja-vacio">${filtro === "actualizaciones" ? "Aún no hay actualizaciones reportadas para este cliente." : "Aún no hay movimientos para este cliente."}</p>`;
        return;
      }
      linea.innerHTML = `<ol class="historial-cliente">${eventos.map((e) => e.tipo === "visita" ? itemVisita(e.v) : itemActualizacion(e.x, ctx)).join("")}</ol>`;
    };
    pintar();
    hoja.addEventListener("click", async (e) => {
      const f = e.target.closest("[data-filtro]");
      if (f) {
        filtro = f.dataset.filtro;
        hoja.querySelectorAll("[data-filtro]").forEach((b) => { b.classList.toggle("activo", b === f); b.setAttribute("aria-selected", b === f); });
        return pintar();
      }
      const iv = e.target.closest("[data-abrir-visita]");
      if (iv && onAbrirVisita) { cerrar(); return onAbrirVisita(iv.dataset.abrirVisita); }
      const est = e.target.closest("[data-estado-act]");
      if (est && ctx.esAdmin) {
        const x = lista.find((y) => y.id === est.dataset.id);
        setCargando(est, true, "Guardando…");
        try {
          await cambiarEstadoActualizacion(ctx, x, est.dataset.estadoAct);
          x.estado = est.dataset.estadoAct;
          if (x.estado === REVISADA) x.revisadoNombre = ctx.perfil.nombre;
          if (x.estado === APLICADA) x.aplicadoNombre = ctx.perfil.nombre;
          pintarCifra();
          onCambio(lista);
          pintar();
          toast(`Actualización marcada como ${ESTADO_ACTUALIZACION_LABEL[x.estado].toLowerCase()}`, "ok");
        } catch (err) {
          console.error(err);
          toast(mensajeError(err), "error");
          setCargando(est, false);
        }
      }
    });
  }

  return { abrirReporte, abrirHistorial, cargar, lista: () => lista, quitar: () => fab.remove() };
}

// ---------- Elementos de la línea de tiempo ----------

const fechaCorta = (iso) => {
  if (!iso) return { dia: "", mes: "", hora: "" };
  const d = new Date(iso);
  return { dia: d.getDate(), mes: d.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""), hora: d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) };
};

function itemVisita(v) {
  const estado = estadoVisible(v);
  const f = v.resultado?.fechaHora ? fechaCorta(v.resultado.fechaHora) : fechaCorta(`${v.fechaProgramada}T12:00:00`);
  return `
    <li class="hc-item hc-visita" >
      <div class="hc-fecha"><strong>${f.dia}</strong><span>${esc(f.mes)}</span></div>
      <button type="button" class="hc-cuerpo" data-abrir-visita="${v.id}">
        <span class="hc-tipo">${icono("calendar", 14)}Visita</span>
        <strong>${esc(TIPO_VISITA[tipoDeVisita(v)].texto)}</strong>
        <span class="hc-linea"><span class="chip chip-estado estado-${estado.toLowerCase()}">${esc(ESTADO_LABEL[estado] || estado)}</span><span class="texto-suave">${esc(v.coordinadorNombre)}, ${esc(formatearHora(v.horaProgramada))}</span></span>
      </button>
    </li>`;
}

function itemActualizacion(x, ctx) {
  const f = fechaCorta(x.fechaReporteLocal);
  const acciones = ctx.esAdmin && x.estado !== APLICADA ? `
    <div class="hc-acciones">
      ${x.estado === REPORTADA ? `<button type="button" class="btn btn-secundario btn-sm" data-estado-act="${REVISADA}" data-id="${x.id}">Marcar revisada</button>` : ""}
      <button type="button" class="btn btn-verde btn-sm" data-estado-act="${APLICADA}" data-id="${x.id}">${icono("ok", 16)}Marcar aplicada</button>
    </div>` : "";
  return `
    <li class="hc-item hc-act">
      <div class="hc-fecha"><strong>${f.dia}</strong><span>${esc(f.mes)}</span></div>
      <div class="hc-cuerpo">
        <span class="hc-tipo">${icono(TIPO_ACTUALIZACION[x.tipoActualizacion]?.icono || "edit", 14)}Actualización</span>
        <strong>${esc(x.tipoTexto || TIPO_ACTUALIZACION[x.tipoActualizacion]?.texto || "")}</strong>
        ${x.valorAnterior || x.valorNuevo ? `
        <div class="hc-cambio">
          ${x.valorAnterior ? `<span class="hc-antes"><small>Anterior</small>${esc(x.valorAnterior)}</span>` : ""}
          ${x.valorNuevo ? `<span class="hc-despues"><small>${x.valorAnterior ? "Nuevo" : "Reportado"}</small>${esc(x.valorNuevo)}</span>` : ""}
        </div>` : ""}
        ${x.observacion ? `<p class="hc-obs">“${esc(x.observacion)}”</p>` : ""}
        <span class="hc-linea"><span class="chip-act act-${x.estado}">${esc(ESTADO_ACTUALIZACION_LABEL[x.estado] || x.estado)}</span><span class="texto-suave">Reportada por ${esc(x.reportadoNombre)}${f.hora ? `, ${esc(f.hora)}` : ""}${x.estado === APLICADA && x.aplicadoNombre ? `. Aplicada por ${esc(x.aplicadoNombre)}` : ""}</span></span>
        ${acciones}
      </div>
    </li>`;
}
