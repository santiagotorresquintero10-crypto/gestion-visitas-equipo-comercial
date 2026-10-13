// Tabla de Despachos Bovinos: una fila por marca, las 16 columnas del Excel, columna Marca fija al desplazarse.
import { esc, chapeta } from "../ui.js";
import { COLUMNAS_DESPACHO } from "../services/despachos-service.js";

const SIN_INFO = '<span class="sin-info">Sin información</span>';
// Cada dato se muestra tal cual viene en el Excel (texto, nombre o número), sin sumar ni reformatear.
const valor = (v) => (v === "" || v == null ? SIN_INFO : esc(String(v)));

// conCodigo: agrega la columna "Código del cliente" (tabla general del módulo).
export function tablaDespachos(registros, { conCodigo = false, onCliente = null } = {}) {
  const columnas = COLUMNAS_DESPACHO.filter((c) => c !== "Marca");
  return `
    <div class="tabla-despachos-scroll" tabindex="0" role="region" aria-label="Despachos bovinos">
      <table class="tabla tabla-despachos ${conCodigo ? "con-codigo" : ""}">
        <thead><tr>
          ${conCodigo ? `<th class="col-fija col-codigo" scope="col">Código</th>` : ""}
          <th class="col-fija col-marca" scope="col">Marca</th>
          ${columnas.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}
        </tr></thead>
        <tbody>${registros.map((r) => `
          <tr data-marca="${esc(r.marcaNorm || String(r.marca || "").toUpperCase())}">
            ${conCodigo ? `<td class="col-fija col-codigo">${r.clienteId ? `<button type="button" class="btn-enlace" data-cliente="${esc(r.clienteId)}">${chapeta(r.codigo)}</button>` : `<span class="chip chip-sin-relacion" title="${esc((r.codigosPosibles || []).join(", "))}">${r.estadoCruce === "AMBIGUA" ? "Ambigua" : "Sin relacionar"}</span>`}</td>` : ""}
            <th class="col-fija col-marca" scope="row">${esc(r.marca)}</th>
            ${columnas.map((c) => `<td>${valor(r.valores?.[c])}</td>`).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}
