// Vista rápida del cliente durante la visita: botón flotante «Ver ficha del cliente» que abre la Ficha
// en un panel, sin salir ni volver a dibujar la visita (el formulario, sus respuestas y el scroll quedan intactos).
//   · Computador ancho (≥ 1280 px): panel lateral fijo a la derecha; la visita sigue usable a la izquierda.
//   · Tableta y celular: panel superpuesto a pantalla completa; al cerrarlo se vuelve al mismo punto.
// Reutiliza abrirFicha en modo consulta (solo lectura). Para un prospecto muestra solo los datos guardados en la visita.
import { esc, icono, chapeta } from "../ui.js";
import { abrirFicha } from "./ficha-cliente.js";
import { esProspecto, TIPOS_BENEFICIO } from "../constants.js";
import { formatearFechaLarga, formatearHora } from "../utils/fechas.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const DOCK = "(min-width: 1280px)";

export function crearFichaRapida({ cont, ctx, visita }) {
  const prospecto = esProspecto(visita);

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "fab-ficha";
  fab.setAttribute("aria-haspopup", "dialog");
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-label", "Ver ficha del cliente");
  fab.title = "Ver ficha del cliente";
  fab.innerHTML = `${icono("store", 20)}<span class="fab-texto">Ver ficha del cliente</span>`;

  const panel = document.createElement("aside");
  panel.className = "panel-ficha";
  panel.setAttribute("aria-label", "Ficha del cliente");
  panel.setAttribute("tabindex", "-1");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="panel-ficha-fondo" data-cerrar-ficha></div>
    <section class="panel-ficha-hoja">
      <header class="panel-ficha-cabeza">
        <div class="panel-ficha-titulo">
          <span class="panel-ficha-eyebrow">${icono("store", 15)}${prospecto ? "Cliente prospecto" : "Ficha del cliente"}</span>
          <strong>${prospecto ? "" : chapeta(visita.codigo)} ${esc(nombreCliente(visita))}</strong>
        </div>
        <button type="button" class="btn btn-secundario btn-sm panel-ficha-cerrar" data-cerrar-ficha aria-label="Volver a la visita">
          ${icono("back", 16)}<span class="txt-largo">Volver a la visita</span><span class="txt-corto">Volver</span>
        </button>
      </header>
      <div class="panel-ficha-cuerpo"></div>
    </section>`;

  cont.append(fab, panel);
  const cuerpo = panel.querySelector(".panel-ficha-cuerpo");
  let cargada = false;

  const abierto = () => panel.classList.contains("abierto");
  const modal = () => !window.matchMedia(DOCK).matches;

  function abrir() {
    if (!cargada) {
      cargada = true;
      if (prospecto) cuerpo.innerHTML = fichaProspecto(visita);
      else abrirFicha(cuerpo, ctx, visita.clienteId, { consulta: true });
    }
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("abierto"));
    fab.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", tecla);
    panel.focus({ preventScroll: true });
  }

  function cerrar() {
    if (!abierto()) return;
    panel.classList.remove("abierto");
    fab.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", tecla);
    setTimeout(() => { if (!abierto()) panel.hidden = true; }, 260);
    fab.focus({ preventScroll: true });
  }

  // Escape cierra (salvo que haya una hoja abierta encima, p. ej. el historial de actualizaciones).
  function tecla(e) {
    if (e.key !== "Escape" || document.body.classList.contains("con-hoja")) return;
    cerrar();
  }

  fab.onclick = () => (abierto() ? cerrar() : abrir());
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-cerrar-ficha]")) cerrar(); });
  // En pantalla pequeña el panel es modal: el foco no sale de él con Tab.
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !modal()) return;
    const f = [...panel.querySelectorAll("button:not([disabled]), input, select, textarea, a[href], [tabindex='0']")].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  // Al salir de la visita (cambio de sección) el panel desaparece con la pantalla; se limpia el teclado.
  window.addEventListener("hashchange", () => document.removeEventListener("keydown", tecla), { once: true });

  return { abrir, cerrar };
}

// Prospecto: aún no tiene ficha en la base. Solo lo que ya está guardado en la visita; nada inventado.
function fichaProspecto(v) {
  const p = v.prospecto || {};
  const tipo = TIPOS_BENEFICIO.find((t) => t.clave === p.tipoCliente)?.texto || "";
  const cant = (n) => (n == null || n === "" ? "" : `${Number(n).toLocaleString("es-CO")} por semana`);
  const filas = [
    ["Nombre", p.nombre],
    ["Teléfono", p.telefono],
    ["Tipo de cliente", tipo],
    ["Cantidad semanal bovinos", cant(p.cantidadSemanalBovinos)],
    ["Cantidad semanal porcinos", cant(p.cantidadSemanalPorcinos)],
    ["Temas tratados", p.temasTratados],
    ["¿Está interesado?", p.interesado === true ? "Sí" : p.interesado === false ? "No" : ""],
  ].filter(([, valor]) => valor);
  const visita = [
    ["Programada", `${formatearFechaLarga(v.fechaProgramada)}, ${formatearHora(v.horaProgramada)}`],
    ["Responsable", v.coordinadorNombre],
    ["Observación previa", v.observacionPrevia],
  ].filter(([, valor]) => valor);
  const lista = (items) => `<dl class="lista-datos">${items.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>`;
  return `
    <div class="ficha-prospecto">
      <p class="aviso-suave">${icono("info", 16)} Este prospecto aún no tiene ficha en la base de clientes. Se muestra solo lo registrado en esta visita.</p>
      <section class="panel"><h2 class="panel-titulo">${icono("user", 20)}Datos del prospecto</h2>
        ${filas.length ? lista(filas) : `<p class="texto-suave">Aún no hay más datos registrados.</p>`}</section>
      <section class="panel"><h2 class="panel-titulo">${icono("calendar", 20)}Esta visita</h2>${lista(visita)}</section>
    </div>`;
}
