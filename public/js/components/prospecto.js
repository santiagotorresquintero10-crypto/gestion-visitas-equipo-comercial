// Datos del cliente prospecto (posible nuevo cliente, sin código). Se usan al programar y al realizar la visita.
// Campos: nombre, teléfono, tipo de cliente, cantidad semanal, temas tratados e interés (sí / no).
import { esc, icono } from "../ui.js";
import { TIPOS_BENEFICIO } from "../constants.js";
import { ILUSTRACION_ESPECIE } from "./campos-cliente.js";

const check = (redondo = true) => `<b class="marca ${redondo ? "marca-redonda" : ""}" aria-hidden="true">${icono("ok", 14)}</b>`;

// soloNombre: al programar solo se agenda (nombre para identificarlo); el resto se pide al iniciar la visita.
export function camposProspecto(p = {}, { titulo = true, soloNombre = false } = {}) {
  if (soloNombre) return `
    ${titulo ? `<h2 class="panel-titulo prospecto-titulo">${icono("user", 20)}Prospecto</h2>` : ""}
    <label class="campo" data-pregunta="pNombre"><span>Nombre</span><p class="pregunta-error" role="alert" hidden></p>
      <input name="pNombre" maxlength="160" value="${esc(p.nombre || "")}" placeholder="Persona o negocio" autocomplete="off"></label>`;
  return `
    ${titulo ? `<h2 class="panel-titulo prospecto-titulo">${icono("user", 20)}Datos del prospecto</h2>` : ""}
    <div class="form-fila">
      <label class="campo" data-pregunta="pNombre"><span>Nombre</span><p class="pregunta-error" role="alert" hidden></p>
        <input name="pNombre" maxlength="160" value="${esc(p.nombre || "")}" placeholder="Persona o negocio" autocomplete="off"></label>
      <label class="campo" data-pregunta="pTelefono"><span>Teléfono</span><p class="pregunta-error" role="alert" hidden></p>
        <input name="pTelefono" type="tel" inputmode="tel" maxlength="40" value="${esc(p.telefono || "")}" placeholder="Ej.: 3001234567"></label>
    </div>
    <fieldset class="campo campo-grupo" data-pregunta="pTipo">
      <legend>Tipo de cliente</legend><p class="pregunta-error" role="alert" hidden></p>
      <div class="especies especies-compactas">${TIPOS_BENEFICIO.map((t) => `
        <label class="decision especie"><input type="radio" name="pTipo" value="${t.clave}" ${p.tipoCliente === t.clave ? "checked" : ""}>
          <span>${ILUSTRACION_ESPECIE[t.clave]}<strong>${esc(t.texto)}</strong>${check()}</span></label>`).join("")}
      </div>
    </fieldset>
    <div class="cantidades" data-pregunta="pCantidad" data-tipo="${esc(p.tipoCliente || "")}">
      <p class="pregunta-error" role="alert" hidden></p>
      <p class="cantidades-ayuda texto-suave">Elige el tipo de cliente para registrar la cantidad semanal.</p>
      <label class="campo campo-cantidad" data-especie="BOVINO"><span>Cantidad semanal Bovinos</span>
        <input name="pCantBov" type="number" inputmode="numeric" min="0" step="1" value="${p.cantidadSemanalBovinos ?? (p.tipoCliente === "BOVINO" ? p.cantidadSemanal ?? "" : "")}" placeholder="Ej.: 20"></label>
      <label class="campo campo-cantidad" data-especie="PORCINO"><span>Cantidad semanal Porcinos</span>
        <input name="pCantPor" type="number" inputmode="numeric" min="0" step="1" value="${p.cantidadSemanalPorcinos ?? (p.tipoCliente === "PORCINO" ? p.cantidadSemanal ?? "" : "")}" placeholder="Ej.: 80"></label>
    </div>
    <label class="campo" data-pregunta="pTemas"><span>Temas tratados</span><p class="pregunta-error" role="alert" hidden></p>
      <textarea name="pTemas" rows="4" maxlength="2000" placeholder="Escribe aquí…">${esc(p.temasTratados || "")}</textarea></label>
    <fieldset class="campo campo-grupo" data-pregunta="pInteresado">
      <legend>¿Está interesado?</legend><p class="pregunta-error" role="alert" hidden></p>
      <div class="chips chips-2">
        <label class="chip-opcion"><input type="radio" name="pInteresado" value="si" ${p.interesado === true ? "checked" : ""}><span>${check()}<em>Sí</em></span></label>
        <label class="chip-opcion"><input type="radio" name="pInteresado" value="no" ${p.interesado === false ? "checked" : ""}><span>${check()}<em>No</em></span></label>
      </div>
    </fieldset>`;
}

export function leerProspecto(raiz) {
  const v = (n) => raiz.querySelector(`[name=${n}]`)?.value ?? "";
  const r = (n) => raiz.querySelector(`[name=${n}]:checked`)?.value || "";
  return {
    nombre: v("pNombre").trim(),
    telefono: v("pTelefono").trim(),
    tipoCliente: r("pTipo") || null,
    cantidadSemanalBovinos: v("pCantBov"),
    cantidadSemanalPorcinos: v("pCantPor"),
    temasTratados: v("pTemas").trim(),
    interesado: r("pInteresado") === "si" ? true : r("pInteresado") === "no" ? false : null,
  };
}

// alProgramar: solo el nombre. Durante la visita: el teléfono si se escribe debe ser válido.
// alCerrar (finalizar la visita): también se exigen teléfono, temas tratados e interés.
// sinTelefono: la persona no autorizó el tratamiento de datos; no se exige ni se pide el teléfono.
export function erroresProspecto(p, { alCerrar = false, alProgramar = false, sinTelefono = false } = {}) {
  const e = [];
  if (!p.nombre) e.push(["pNombre", "Escribe el nombre del prospecto."]);
  if (alProgramar) return e;
  const digitos = p.telefono.replace(/\D/g, "").length;
  if (!sinTelefono && (alCerrar || digitos) && digitos < 7) e.push(["pTelefono", "Escribe un teléfono válido (al menos 7 dígitos)."]);
  const malNumero = (x) => x !== "" && x != null && !(Number(x) >= 0);
  if (malNumero(p.cantidadSemanalBovinos) || malNumero(p.cantidadSemanalPorcinos)) e.push(["pCantidad", "La cantidad semanal debe ser un número."]);
  if (alCerrar && !p.temasTratados) e.push(["pTemas", "Escribe los temas que se trataron."]);
  if (alCerrar && p.interesado === null) e.push(["pInteresado", "Indica si el prospecto está interesado."]);
  return e;
}

// Resumen de solo lectura (brief y resultado).
export function resumenProspecto(p = {}) {
  const tipo = TIPOS_BENEFICIO.find((t) => t.clave === p.tipoCliente);
  const fila = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v || '<span class="texto-suave">Sin registrar</span>'}</dd></div>`;
  return `
    <dl class="prospecto-resumen">
      ${fila("Teléfono", p.telefono ? `<a href="tel:${esc(p.telefono.replace(/[^\d+]/g, ""))}">${esc(p.telefono)}</a>` : "")}
      ${fila("Tipo de cliente", tipo ? `<span class="opera-especie">${ILUSTRACION_ESPECIE[tipo.clave]}${esc(tipo.texto)}</span>` : "")}
      ${fila("Cantidad semanal", textoCantidades(p))}
      ${fila("¿Está interesado?", p.interesado === true ? '<span class="interes interes-si">Sí</span>' : p.interesado === false ? '<span class="interes interes-no">No</span>' : "")}
    </dl>
    ${p.temasTratados ? `<h3 class="resultado-sub">Temas tratados</h3><p class="observacion">${esc(p.temasTratados)}</p>` : ""}`;
}

// "Bovinos: 20 · Porcinos: 80" (o el total, en prospectos registrados antes de separar por especie).
export function textoCantidades(p = {}) {
  const n = (x) => Number(x).toLocaleString("es-CO");
  const partes = [];
  if (p.cantidadSemanalBovinos != null) partes.push(`Bovinos: ${n(p.cantidadSemanalBovinos)}`);
  if (p.cantidadSemanalPorcinos != null) partes.push(`Porcinos: ${n(p.cantidadSemanalPorcinos)}`);
  if (partes.length) return esc(partes.join(" · "));
  return p.cantidadSemanal != null ? esc(n(p.cantidadSemanal)) : "";
}

// Muestra solo las cantidades de la especie elegida (Ambos → las dos), sin recargar.
export function activarCantidades(raiz) {
  const caja = raiz.querySelector(".cantidades");
  if (!caja) return;
  const pintar = () => { caja.dataset.tipo = raiz.querySelector("[name=pTipo]:checked")?.value || ""; };
  raiz.querySelectorAll("[name=pTipo]").forEach((r) => r.addEventListener("change", pintar));
  pintar();
}
