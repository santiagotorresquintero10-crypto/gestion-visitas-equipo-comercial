// Buscador de clientes reutilizable (Programación y Ficha del cliente).
// Muestra coincidencias mientras se escribe y entrega el cliente elegido a onSeleccionar.
import { esc, icono, chapeta, resaltar, estadoVacio, esqueleto } from "../ui.js";
import { obtenerClientes, buscarEn } from "../services/clientes-service.js";
import { normalizarTexto } from "../services/excel-clientes.js";
import { mensajeError } from "../services/auth-service.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const MAX_RESULTADOS = 15;
let ultimoTexto = ""; // se conserva al volver de una ficha

export async function crearBuscador(cont, { onSeleccionar, onVerFicha = null, placeholder = "Buscar por código, nombre, marca o expendio…" }) {
  cont.innerHTML = `
    <div class="buscador">
      <label class="buscador-campo">
        ${icono("search", 22)}
        <input type="search" class="input-buscar" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off" enterkeyhint="search" value="${esc(ultimoTexto)}">
      </label>
      <div class="buscador-resultados" aria-live="polite">${esqueleto(3, 112)}</div>
    </div>`;
  const input = cont.querySelector("input");
  const resultados = cont.querySelector(".buscador-resultados");

  let lista;
  try {
    lista = await obtenerClientes();
  } catch (err) {
    resultados.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
    return;
  }

  let encontrados = [];
  const pintar = () => {
    const texto = input.value.trim();
    ultimoTexto = input.value;
    if (!lista.length) {
      resultados.innerHTML = estadoVacio({ icono: "database", titulo: "La base de clientes está vacía", texto: "El administrador debe importar el Excel de clientes." });
      return;
    }
    if (!texto) {
      resultados.innerHTML = `<p class="buscador-ayuda">Escribe el código, una marca o el nombre del expendio. Por ejemplo: <em>COD-0003</em>, <em>AMA</em> o <em>Perica</em>.</p>`;
      return;
    }
    encontrados = buscarEn(lista, texto, { max: MAX_RESULTADOS });
    if (!encontrados.length) {
      resultados.innerHTML = estadoVacio({ icono: "search", titulo: `No encontramos clientes con «${texto}»`, texto: "Intenta buscar por código, marca o expendio." });
      return;
    }
    const terminos = normalizarTexto(texto).split(" ").filter(Boolean);
    resultados.innerHTML = `<p class="buscador-conteo">${encontrados.length === MAX_RESULTADOS ? `Primeros ${MAX_RESULTADOS} resultados` : `${encontrados.length} cliente${encontrados.length === 1 ? "" : "s"}`}</p>` +
      encontrados.map((c, i) => tarjeta(c, i, terminos, !!onVerFicha)).join("");
  };

  let espera;
  input.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(pintar, 120); });
  resultados.addEventListener("click", (e) => {
    const ficha = e.target.closest("[data-ficha]");
    if (ficha) return onVerFicha(encontrados[Number(ficha.dataset.ficha)]);
    const item = e.target.closest("[data-i]");
    if (item) onSeleccionar(encontrados[Number(item.dataset.i)]);
  });
  pintar();
  input.focus();
}

function tarjeta(c, i, terminos, conFicha) {
  const marcas = (c.marcas || []).map((m) => m.marca).filter(Boolean);
  // Si se buscó por una marca secundaria, mostrarla primero para que se entienda la coincidencia.
  const coincide = marcas.find((m) => terminos.some((t) => normalizarTexto(m).includes(t)));
  const ordenadas = coincide ? [coincide, ...marcas.filter((m) => m !== coincide)] : marcas;
  const visibles = ordenadas.slice(0, 3);
  const zona = c.zona || c.marcas?.[0]?.zona || "";
  const lugar = [c.marcas?.[0]?.barrio, c.ciudad].filter(Boolean).join(", ");
  return `
    <div class="resultado">
      <button type="button" class="resultado-principal" data-i="${i}">
        <span class="resultado-cabeza">${chapeta(c.codigo)}<span class="resultado-marca">${visibles.map((m) => resaltar(m, terminos)).join(", ")}${ordenadas.length > 3 ? ` +${ordenadas.length - 3}` : ""}</span></span>
        <span class="resultado-nombre">${resaltar(nombreCliente(c) || "Sin nombre", terminos)}</span>
        ${expendioSecundario(c) ? `<span class="resultado-expendio">${resaltar(expendioSecundario(c), terminos)}</span>` : ""}
        <span class="resultado-meta">
          ${lugar ? `<span>${icono("pin", 15)}${esc(lugar)}${zona ? `. Zona ${esc(zona.charAt(0) + zona.slice(1).toLowerCase())}` : ""}</span>` : ""}
          ${c.coordinador ? `<span>${icono("user", 15)}${esc(c.coordinador)}</span>` : ""}
        </span>
      </button>
      <div class="resultado-acciones">
        ${conFicha ? `<button type="button" class="btn btn-sm btn-secundario" data-ficha="${i}">${icono("store", 16)}Ficha</button>` : ""}
        <button type="button" class="btn btn-sm btn-verde" data-i="${i}">Seleccionar</button>
      </div>
    </div>`;
}
