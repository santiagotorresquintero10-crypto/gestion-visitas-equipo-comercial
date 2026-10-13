// Preguntas del perfil del cliente (Primer acercamiento: pasos Cliente y Operación).
// Los datos son del cliente (un único registro en clientes/{codigo}/perfil/resultadoFinal): se llenan una vez
// y quedan en el cliente; si ya existen, llegan precargados.
import { esc, icono } from "../ui.js";
import { COMPRA_GANADO, TIPOS_BENEFICIO, DIAS_BENEFICIO, FACTURADORES, CORTES_CANAL } from "../constants.js";
import { normalizarResultadoFinal } from "../services/resultado-final-service.js";
import { formatearHora } from "../utils/fechas.js";

const MAX_SEDES = 20;

const VACIO = {
  otrasSedes: null, sedes: [], compraGanado: [], tipoBeneficio: null, diasBeneficio: [],
  horaIngreso: "", horaSalida: "", facturacion: [], preferenciaCanal: null, preferenciaCanalOtro: "", observaciones: "",
};

// ---------- Ilustraciones de especie ----------

const VACA = `<svg class="especie-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M22 15.5C17.5 13.5 15 9.5 15 4.5c3.8 1.8 6.8 4.6 8.8 8.3"/>
  <path d="M42 15.5c4.5-2 7-6 7-11-3.8 1.8-6.8 4.6-8.8 8.3"/>
  <path d="M19.6 23.2c-4.6 1-8.8 0-11.6-3.2 3.2-2.8 8-3.4 12.2-1.6"/>
  <path d="M44.4 23.2c4.6 1 8.8 0 11.6-3.2-3.2-2.8-8-3.4-12.2-1.6"/>
  <path d="M19.5 17c3-3.4 7.4-5 12.5-5s9.5 1.6 12.5 5c1.6 5.2 1.4 11.2-.6 17.2L41.6 40H22.4l-2.3-5.8c-2-6-2.2-12-.6-17.2z"/>
  <rect x="18.5" y="37.5" width="27" height="16.5" rx="8.25" class="especie-relleno"/>
  <circle cx="26.5" cy="45.8" r="1.9" fill="currentColor" stroke="none"/><circle cx="37.5" cy="45.8" r="1.9" fill="currentColor" stroke="none"/>
  <circle cx="25.6" cy="26.5" r="2.1" fill="currentColor" stroke="none"/><circle cx="38.4" cy="26.5" r="2.1" fill="currentColor" stroke="none"/>
</svg>`;

const CERDO = `<svg class="especie-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M17.5 20.5 13 8.5c5 0 10 3 12.5 7.5"/>
  <path d="M46.5 20.5 51 8.5c-5 0-10 3-12.5 7.5"/>
  <path d="M32 13c11.6 0 20 8 20 19 0 11.5-8.6 20-20 20S12 43.5 12 32c0-11 8.4-19 20-19z"/>
  <ellipse cx="32" cy="38" rx="9" ry="6.5" class="especie-relleno"/>
  <ellipse cx="28.8" cy="38" rx="1.6" ry="2.4" fill="currentColor" stroke="none"/><ellipse cx="35.2" cy="38" rx="1.6" ry="2.4" fill="currentColor" stroke="none"/>
  <circle cx="24" cy="27.5" r="2" fill="currentColor" stroke="none"/><circle cx="40" cy="27.5" r="2" fill="currentColor" stroke="none"/>
</svg>`;

export const ILUSTRACION_ESPECIE = {
  BOVINO: `<span class="especie-arte">${VACA}</span>`,
  PORCINO: `<span class="especie-arte">${CERDO}</span>`,
  AMBOS: `<span class="especie-arte especie-arte-doble">${VACA}${CERDO}</span>`,
};
const DETALLE_ESPECIE = { BOVINO: "Ganado vacuno", PORCINO: "Cerdos", AMBOS: "Bovinos y porcinos" };
const ICONO_COMPRA = { FERIA: "carpa", FINCA: "granero" };

// ---------- Textos para el resumen ----------

const texto = (lista, k) => lista.find((x) => x.clave === k)?.texto || "";
export const textoBeneficio = (k) => texto(TIPOS_BENEFICIO, k);
export const textoCompra = (l = []) => l.map((k) => texto(COMPRA_GANADO, k)).join(" + ");
export const textoFacturacion = (l = []) => l.map((k) => texto(FACTURADORES, k)).join(", ");
export const textoCanal = (d) => !d?.preferenciaCanal ? ""
  : d.preferenciaCanal === "OTRO" ? (d.preferenciaCanalOtro ? `Otro: ${d.preferenciaCanalOtro}` : "Otro") : texto(CORTES_CANAL, d.preferenciaCanal);
export const textoSedes = (d) => d?.otrasSedes == null ? "" : !d.otrasSedes ? "No"
  : `Sí, ${d.sedes?.length || 0} ${d.sedes?.length === 1 ? "sede" : "sedes"}`;
export const textoTotalDias = (n) => (n ? `${n} ${n === 1 ? "día" : "días"} por semana` : "");
export const textoHorario = (d) => (d.horaIngreso || d.horaSalida)
  ? `${d.horaIngreso ? formatearHora(d.horaIngreso) : "—"} → ${d.horaSalida ? formatearHora(d.horaSalida) : "—"}` : "";
export const diasCortos = (dias = []) => DIAS_BENEFICIO.filter((x) => dias.includes(x.clave)).map((x) => x.corto.toUpperCase());

// ---------- Piezas ----------

const check = (redondo = false) => `<b class="marca ${redondo ? "marca-redonda" : ""}" aria-hidden="true">${icono("ok", 14)}</b>`;

const chip = (tipo, nombre, x, activo, ic = "") => `
  <label class="chip-opcion">
    <input type="${tipo}" name="${nombre}" value="${x.clave}" ${activo ? "checked" : ""}>
    <span>${check(tipo === "radio")}${ic ? icono(ic, 18) : ""}<em>${esc(x.texto)}</em></span>
  </label>`;

const pregunta = (id, titulo, contenido, ayuda = "") => `
  <fieldset class="pregunta" data-pregunta="${id}">
    <legend class="pregunta-titulo">${titulo}</legend>
    ${ayuda ? `<p class="pregunta-ayuda">${ayuda}</p>` : ""}
    <p class="pregunta-error" role="alert" hidden></p>
    ${contenido}
  </fieldset>`;

const filaSede = (s = {}, i = 0) => `
  <div class="sede-fila" data-sede>
    <span class="sede-num" aria-hidden="true">${i + 1}</span>
    <label class="campo"><span>Nombre de la sede</span><input name="rfSedeNombre" maxlength="120" value="${esc(s.nombre || "")}" placeholder="Ej.: Carnicería La Perica #2"></label>
    <label class="campo"><span>Ciudad o municipio</span><input name="rfSedeCiudad" maxlength="80" value="${esc(s.ciudad || "")}" placeholder="Ej.: Itagüí"></label>
    <button type="button" class="btn-icono sede-quitar" data-quitar-sede aria-label="Eliminar esta sede">${icono("trash", 18)}</button>
  </div>`;

// ---------- Preguntas ----------
// destinos: { cliente, operacion, comercial } (elementos donde va cada grupo).
// Devuelve { leer, errores(paso), cambio(fn) }. errores(paso) lista [{ pregunta, mensaje, foco }].
// opciones.sinSedes: no muestra la pregunta de otras sedes y conserva lo guardado (edición desde la ficha).
export function crearCamposCliente(destinos, guardado, { sinSedes = false } = {}) {
  const d = { ...VACIO, ...(guardado || {}) };

  destinos.cliente.innerHTML = `
    ${pregunta("especie", "¿Qué tipo de cliente de beneficio es?", `
      <div class="especies">${TIPOS_BENEFICIO.map((x) => `
        <label class="decision especie">
          <input type="radio" name="rfBeneficio" value="${x.clave}" ${d.tipoBeneficio === x.clave ? "checked" : ""}>
          <span>${ILUSTRACION_ESPECIE[x.clave]}<strong>${esc(x.texto)}</strong><small>${DETALLE_ESPECIE[x.clave]}</small>${check(true)}</span>
        </label>`).join("")}
      </div>`)}
    ${pregunta("compra", "¿Dónde compra el ganado?", `
      <div class="chips chips-2">${COMPRA_GANADO.map((x) => chip("checkbox", "rfCompra", x, d.compraGanado.includes(x.clave), ICONO_COMPRA[x.clave])).join("")}</div>`,
      "Puede elegir las dos.")}
    ${sinSedes ? "" : pregunta("sedes", "¿Cuenta con otras sedes?", `
      <div class="chips chips-2" role="radiogroup">
        ${chip("radio", "rfOtrasSedes", { clave: "si", texto: "Sí" }, d.otrasSedes === true)}
        ${chip("radio", "rfOtrasSedes", { clave: "no", texto: "No" }, d.otrasSedes === false)}
      </div>
      <div class="sedes" data-rf="sedes" ${d.otrasSedes ? "" : "hidden"}>
        <div class="sedes-lista" data-rf="lista">${(d.sedes.length ? d.sedes : [{}]).map(filaSede).join("")}</div>
        <button type="button" class="btn btn-secundario btn-sm" data-rf="agregar">${icono("plus", 16)}Agregar sede</button>
      </div>`)}`;

  destinos.operacion.innerHTML = `
    ${pregunta("dias", "¿Qué días beneficia en Central Ganadera?", `
      <div class="dias">${DIAS_BENEFICIO.map((x) => `
        <label class="dia">
          <input type="checkbox" name="rfDias" value="${x.clave}" ${d.diasBeneficio.includes(x.clave) ? "checked" : ""}>
          <span><b>${esc(x.corto.toUpperCase())}</b><i aria-hidden="true">${icono("ok", 14)}</i><span class="sr-only">${esc(x.texto)}</span></span>
        </label>`).join("")}
      </div>
      <p class="total-dias" data-rf="total" aria-live="polite"></p>`, "Marca todos los que apliquen, de lunes a sábado.")}
`;

  // Facturación y canal van en el mismo paso que los días (destino "comercial" opcional).
  (destinos.comercial || destinos.operacion).insertAdjacentHTML("beforeend", `
    ${pregunta("facturacion", "¿Por medio de quién factura?", `
      <div class="chips chips-3">${FACTURADORES.map((x) => chip("checkbox", "rfFacturacion", x, d.facturacion.includes(x.clave))).join("")}</div>`,
      "Puede ser más de uno.")}
    ${pregunta("canal", "¿Cómo le gusta la canal?", `
      <div class="chips chips-canal">${CORTES_CANAL.map((x) => chip("radio", "rfCanal", x, d.preferenciaCanal === x.clave)).join("")}</div>
      <label class="campo condicional" data-rf="otro" ${d.preferenciaCanal === "OTRO" ? "" : "hidden"}>
        <span>¿Cuál?</span>
        <input name="rfCanalOtro" maxlength="120" value="${esc(d.preferenciaCanalOtro)}" placeholder="Ej.: canal en cuartos">
      </label>`)}
    ${pregunta("obsCliente", "Observaciones del cliente", `
      <label class="campo"><span class="sr-only">Observaciones del cliente</span>
        <textarea name="rfObservaciones" rows="3" maxlength="2000" placeholder="Ej.: prefiere que lo llamen antes de las 10 a. m.; maneja crédito a 15 días.">${esc(d.observaciones)}</textarea>
      </label>`, "Opcional. Lo que conviene recordar en las próximas visitas.")}`);

  const raices = [destinos.cliente, destinos.operacion, destinos.comercial].filter(Boolean);
  const $r = (sel) => raices.map((r) => r.querySelector(sel)).find(Boolean);
  const $$r = (sel) => raices.flatMap((r) => [...r.querySelectorAll(sel)]);
  const marcados = (n) => $$r(`[name=${n}]:checked`).map((c) => c.value);
  const uno = (n) => $r(`[name=${n}]:checked`)?.value || "";
  const lista = $r("[data-rf=lista]");
  const oyentes = [];

  const leer = () => ({
    otrasSedes: !lista ? d.otrasSedes : uno("rfOtrasSedes") === "si" ? true : uno("rfOtrasSedes") === "no" ? false : null,
    sedes: !lista ? d.sedes : [...lista.querySelectorAll("[data-sede]")].map((f) => ({ nombre: f.querySelector("[name=rfSedeNombre]").value, ciudad: f.querySelector("[name=rfSedeCiudad]").value })),
    compraGanado: marcados("rfCompra"),
    tipoBeneficio: uno("rfBeneficio") || null,
    diasBeneficio: marcados("rfDias"),
    horaIngreso: d.horaIngreso, // ya no se pregunta: se conserva lo guardado
    horaSalida: d.horaSalida,
    facturacion: marcados("rfFacturacion"),
    preferenciaCanal: uno("rfCanal") || null,
    preferenciaCanalOtro: $r("[name=rfCanalOtro]").value,
    observaciones: $r("[name=rfObservaciones]").value,
  });

  const numerarSedes = () => {
    if (!lista) return;
    lista.querySelectorAll(".sede-num").forEach((n, i) => { n.textContent = i + 1; });
    $r("[data-rf=agregar]").disabled = lista.children.length >= MAX_SEDES;
  };

  const actualizar = () => {
    const actual = normalizarResultadoFinal(leer());
    if (lista) $r("[data-rf=sedes]").hidden = actual.otrasSedes !== true;
    $r("[data-rf=otro]").hidden = uno("rfCanal") !== "OTRO";
    const total = actual.totalDiasBeneficio;
    $r("[data-rf=total]").innerHTML = total
      ? `<strong>${total}</strong><span>${total === 1 ? "día" : "días"} por semana</span>`
      : `<span class="texto-suave">Aún no hay días marcados.</span>`;
    oyentes.forEach((f) => f());
  };

  raices.forEach((raiz) => {
    raiz.addEventListener("input", actualizar);
    raiz.addEventListener("change", (e) => {
      // Al responder "Sí" por primera vez se deja lista una fila para escribir la sede.
      if (lista && e.target.name === "rfOtrasSedes" && e.target.value === "si" && !lista.children.length) {
        lista.insertAdjacentHTML("beforeend", filaSede({}, 0));
      }
      if (lista && e.target.name === "rfOtrasSedes" && e.target.value === "si") setTimeout(() => lista.querySelector("input")?.focus(), 0);
      if (e.target.name === "rfCanal" && e.target.value === "OTRO") setTimeout(() => $r("[name=rfCanalOtro]").focus(), 0);
      actualizar();
    });
  });
  if (lista) $r("[data-rf=agregar]").onclick = () => {
    lista.insertAdjacentHTML("beforeend", filaSede({}, lista.children.length));
    numerarSedes();
    lista.lastElementChild.querySelector("input").focus();
    actualizar();
  };
  lista?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar-sede]");
    if (!b) return;
    b.closest("[data-sede]").remove();
    numerarSedes();
    actualizar();
  });

  // Validación por paso, con mensajes específicos.
  const errores = (paso) => {
    const a = normalizarResultadoFinal(leer());
    const lista = [];
    const err = (preg, mensaje, foco) => lista.push({ pregunta: preg, mensaje, foco });
    if (paso === "cliente") {
      if (!a.tipoBeneficio) err("especie", "Indica si el cliente beneficia bovinos, porcinos o ambos.", "[name=rfBeneficio]");
      if (!a.compraGanado.length) err("compra", "Indica dónde compra el ganado: feria, finca o ambas.", "[name=rfCompra]");
      if (a.otrasSedes == null) err("sedes", "Responde si el cliente tiene otras sedes.", "[name=rfOtrasSedes]");
      else if (a.otrasSedes && !a.sedes.length) err("sedes", "Escribe el nombre de al menos una sede o marca «No».", "[name=rfSedeNombre]");
    }
    if (paso === "operacion") {
      if (!a.diasBeneficio.length) err("dias", "Selecciona al menos un día en el que el cliente beneficia en Central Ganadera.", "[name=rfDias]");
    }
    if (paso === "operacion" || paso === "comercial") {
      if (!a.facturacion.length) err("facturacion", "Selecciona al menos un medio de facturación.", "[name=rfFacturacion]");
      if (!a.preferenciaCanal) err("canal", "Indica cómo le gusta la canal al cliente.", "[name=rfCanal]");
      else if (a.preferenciaCanal === "OTRO" && !a.preferenciaCanalOtro) err("canal", "Escribe qué tipo de corte prefiere.", "[name=rfCanalOtro]");
    }
    return lista;
  };

  numerarSedes();
  actualizar();
  return { leer, errores, cambio: (f) => oyentes.push(f) };
}

// ¿Cambió algo frente a lo guardado? (si no, no se reescribe el registro)
export function datosClienteCambiaron(guardado, datos) {
  return JSON.stringify(normalizarResultadoFinal(guardado || VACIO)) !== JSON.stringify(normalizarResultadoFinal(datos));
}
