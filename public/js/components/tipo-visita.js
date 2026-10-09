// Selector del tipo de visita (Primer acercamiento / Seguimiento comercial) como tarjetas de decisión.
import { esc, icono } from "../ui.js";
import { TIPOS_VISITA } from "../constants.js";

export function selectorTipoVisita(actual = "") {
  return `
    <fieldset class="campo tipo-visita">
      <legend>Tipo de visita</legend>
      <div class="tipos-visita">${TIPOS_VISITA.map((t) => `
        <label class="decision tipo-opcion">
          <input type="radio" name="tipoVisita" value="${t.clave}" ${t.clave === actual ? "checked" : ""} required>
          <span><span class="tipo-icono">${icono(t.icono, 22)}</span><strong>${esc(t.texto)}</strong><small>${esc(t.detalle)}</small><b class="marca marca-redonda" aria-hidden="true">${icono("ok", 14)}</b></span>
        </label>`).join("")}
      </div>
    </fieldset>`;
}
