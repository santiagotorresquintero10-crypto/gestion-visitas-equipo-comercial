// Administración → Base de clientes: importar/actualizar desde Excel y consultar la base.
import { esc, toast, setCargando, icono, chapeta, estadoVacio, esqueleto } from "../ui.js";
import { CAMPOS, etiquetaMes } from "../services/excel-clientes.js";
import {
  obtenerClientes, buscarEn, analizarImportacion, aplicarImportacion, ultimaImportacion,
} from "../services/clientes-service.js";
import { mensajeError } from "../services/auth-service.js";
import { abrirFicha } from "../components/ficha-cliente.js";
import { nombreCliente, expendioSecundario } from "../utils/nombre-cliente.js";

const estadoVista = { texto: "", inactivos: false };

const MAX_FILAS = 50;
const MAX_DETALLE = 100;
// Cada fila del Excel es una marca; las filas con el mismo CODIGO forman un cliente.

export async function render(cont, ctx) {
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div><h1>Base de clientes</h1><p class="texto-suave">La base maestra que usa todo el equipo, cargada desde Excel</p></div>
    </header>

    <section class="base-actual">
      <div class="base-actual-cifra">
        <span class="heroe-etiqueta">Base actual</span>
        <span class="cifra-lg" id="cifra-activos">—</span>
        <span class="heroe-nota" id="cifra-inactivos">&nbsp;</span>
      </div>
      <dl class="base-actual-datos" id="info-actualizacion">${esqueleto(1, 60)}</dl>
      <label class="btn btn-primario btn-grande btn-actualizar">
        ${icono("upload", 20)}Actualizar base
        <input type="file" id="input-excel" accept=".xlsx,.xls,.csv" hidden>
      </label>
    </section>

    <section id="zona-importacion"></section>

    <section class="panel panel-tabla">
      <div class="barra-herramientas">
        <label class="filtro filtro-buscar">${icono("search", 18)}
          <input type="search" id="buscar" placeholder="Buscar por código, marca o expendio" aria-label="Buscar cliente" autocomplete="off" value="${esc(estadoVista.texto)}">
        </label>
        <label class="check"><input type="checkbox" id="ver-inactivos" ${estadoVista.inactivos ? "checked" : ""}> Ver inactivos</label>
      </div>
      <p class="texto-suave" id="resumen-base"></p>
      <div id="tabla-clientes">${esqueleto(6, 48)}</div>
    </section>`;

  cont.querySelector("#input-excel").addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (archivo) previsualizar(archivo, cont, ctx);
  });
  cont.querySelector("#buscar").addEventListener("input", (e) => { estadoVista.texto = e.target.value; pintarTabla(cont); });
  cont.querySelector("#ver-inactivos").addEventListener("change", (e) => { estadoVista.inactivos = e.target.checked; pintarTabla(cont); });
  cont.querySelector("#tabla-clientes").addEventListener("click", (e) => {
    const fila = e.target.closest("[data-id]");
    if (fila) abrirFicha(cont, ctx, fila.dataset.id, { onVolver: () => render(cont, ctx), textoVolver: "Volver a la base" });
  });

  await Promise.all([cargarInfo(cont), cargarBase(cont)]);
}

async function cargarInfo(cont) {
  const info = cont.querySelector("#info-actualizacion");
  try {
    const u = await ultimaImportacion();
    info.innerHTML = u ? `
      <div><dt>Última actualización</dt><dd>${esc(formatearFecha(u.fecha))}</dd></div>
      <div><dt>Archivo</dt><dd>${icono("file", 16)}${esc(u.archivo)}</dd></div>
      <div><dt>Actualizó</dt><dd>${esc(u.usuario)}</dd></div>`
      : `<div><dt>Última actualización</dt><dd>Aún no se ha importado ningún archivo</dd></div>`;
  } catch {
    info.innerHTML = "";
  }
}

let lista = [];
async function cargarBase(cont, forzar = false) {
  try {
    lista = await obtenerClientes({ forzar });
    pintarTabla(cont);
  } catch (err) {
    cont.querySelector("#tabla-clientes").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
  }
}

function pintarTabla(cont) {
  const texto = cont.querySelector("#buscar").value;
  const incluirInactivos = cont.querySelector("#ver-inactivos").checked;
  const activos = lista.filter((c) => c.activo !== false).length;
  const resultados = buscarEn(lista, texto, { max: MAX_FILAS, incluirInactivos });

  const ca = cont.querySelector("#cifra-activos"), ci = cont.querySelector("#cifra-inactivos");
  if (ca) ca.textContent = activos.toLocaleString("es-CO");
  if (ci) ci.textContent = `clientes activos${lista.length - activos ? `, ${(lista.length - activos).toLocaleString("es-CO")} inactivos` : ""}`;
  cont.querySelector("#resumen-base").textContent = lista.length
    ? (resultados.length === MAX_FILAS ? `Se muestran los primeros ${MAX_FILAS}. Usa el buscador para encontrar otros.` : `${resultados.length} cliente${resultados.length === 1 ? "" : "s"}`)
    : "";

  const destino = cont.querySelector("#tabla-clientes");
  if (!lista.length) {
    destino.innerHTML = estadoVacio({ icono: "database", titulo: "La base está vacía", texto: "Pulsa «Actualizar base» y elige el Excel de clientes para empezar." });
    return;
  }
  if (!resultados.length) {
    destino.innerHTML = estadoVacio({ icono: "search", titulo: `No encontramos clientes con «${texto}»`, texto: "Intenta buscar por código, marca o expendio." });
    return;
  }
  destino.innerHTML = `
    <table class="tabla tabla-clientes">
      <thead><tr><th>Código</th><th>Cliente</th><th class="celda-marca">Marcas</th><th>Ciudad</th><th>Coordinador</th><th>Zona</th><th>Estado</th></tr></thead>
      <tbody>${resultados.map((c) => `
        <tr class="fila-clic" data-id="${esc(c.id)}" tabindex="0">
          <td class="celda-codigo">${chapeta(c.codigo)}</td>
          <td class="celda-cliente"><strong>${esc(nombreCliente(c))}</strong>${expendioSecundario(c) ? `<span class="texto-suave celda-sub">${esc(expendioSecundario(c))}</span>` : ""}<span class="texto-suave solo-movil-bloque">${marcasTexto(c)}</span></td>
          <td class="celda-marca">${marcasTexto(c)}</td>
          <td class="celda-zona">${esc(c.ciudad)}</td>
          <td class="celda-resp">${esc(c.coordinador)}</td>
          <td class="celda-zona">${esc(c.zona)}</td>
          <td class="celda-estado"><span class="chip ${c.activo === false ? "chip-off" : "chip-ok"}">${c.activo === false ? "Inactivo" : "Activo"}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function marcasTexto(c) {
  const marcas = (c.marcas || []).map((m) => m.marca).filter(Boolean);
  if (!marcas.length) return esc(c.marca);
  const visibles = marcas.slice(0, 3).map(esc).join(", ");
  return marcas.length > 3 ? `${visibles} <span class="texto-suave">+${marcas.length - 3}</span>` : visibles;
}

// ---------- Importación ----------

async function previsualizar(archivo, cont, ctx) {
  const zona = cont.querySelector("#zona-importacion");
  const ETAPAS = [["leer", "Leyendo archivo…"], ["analizar", "Analizando clientes…"], ["comparar", "Comparando con la base actual…"]];
  zona.innerHTML = `
    <div class="panel panel-importacion">
      <h2 class="panel-titulo">${icono("file", 20)} ${esc(archivo.name)}</h2>
      <ol class="etapas">${ETAPAS.map(([id, t]) => `<li data-etapa="${id}"><span class="etapa-marca"></span>${t}</li>`).join("")}</ol>
    </div>`;
  zona.scrollIntoView({ behavior: "smooth", block: "start" });
  const marcarEtapa = (id, n) => {
    let pasada = true;
    zona.querySelectorAll("[data-etapa]").forEach((li) => {
      const actual = li.dataset.etapa === id;
      if (actual) pasada = false;
      li.className = actual ? "activa" : pasada ? "hecha" : "";
      if (actual && id === "analizar" && n) li.lastChild.textContent = `Analizando ${n.toLocaleString("es-CO")} clientes…`;
    });
  };

  let analisis;
  try {
    analisis = await analizarImportacion(archivo, marcarEtapa);
  } catch (err) {
    console.error(err);
    zona.innerHTML = panelError(`No se pudo leer el archivo: ${mensajeError(err)}`);
    return;
  }
  if (!analisis.ok) {
    zona.innerHTML = panelError(analisis.error);
    return;
  }

  const { mapeo, registros, totalFilas, nuevos, actualizados, sinCambios, noAparecen, errores, avisos = [] } = analisis;
  const cifras = [
    ["Clientes nuevos", nuevos.length, "cifra-ok"],
    ["Actualizados", actualizados.length, "cifra-info"],
    ["No encontrados", noAparecen.length, noAparecen.length ? "cifra-alerta" : ""],
    ["Errores", errores.length, errores.length ? "cifra-error" : ""],
  ];
  const faltantes = mapeo.faltantes.map((c) => CAMPOS[c].etiqueta);
  const hayCambios = nuevos.length + actualizados.length + noAparecen.length > 0;

  zona.innerHTML = `
    <div class="panel panel-importacion">
      <div class="panel-cabecera">
        <div>
          <h2 class="panel-titulo">Vista previa de la actualización</h2>
          <p class="texto-suave">${esc(analisis.archivo)}, hoja «${esc(analisis.hoja)}». ${registros.length.toLocaleString("es-CO")} clientes en ${totalFilas.toLocaleString("es-CO")} filas (una por marca); ${sinCambios.length.toLocaleString("es-CO")} sin cambios.</p>
        </div>
      </div>

      <div class="cifras">${cifras.map(([t, n, cls]) => `
        <div class="cifra ${cls}"><span class="cifra-valor">${n.toLocaleString("es-CO")}</span><span class="cifra-titulo">${t}</span></div>`).join("")}
      </div>

      <div class="avisos">
        <p><strong>Meses de beneficio detectados:</strong>
          ${mapeo.meses.length ? mapeo.meses.map((m) => `<span class="chip chip-ok">${esc(etiquetaMes(m.clave))}</span>`).join(" ") : '<span class="texto-suave">ninguno</span>'}</p>
        ${faltantes.length ? `<p class="aviso">No se encontraron estas columnas (quedarán vacías): <strong>${esc(faltantes.join(", "))}</strong></p>` : ""}
        ${mapeo.ignoradas.length ? `<p class="texto-suave">Columnas no usadas: ${esc(mapeo.ignoradas.join(", "))}</p>` : ""}
      </div>

      ${detalle("Clientes nuevos", nuevos, (r) => `${chapeta(r.data.codigo)} ${esc(nombreCliente(r.data))} <span class="texto-suave">(${r.data.totalMarcas} marca${r.data.totalMarcas === 1 ? "" : "s"})</span>`)}
      ${detalle("Clientes actualizados", actualizados, (r) => `${chapeta(r.data.codigo)} ${esc(nombreCliente(r.data))} <span class="texto-suave">(${esc(r.cambios.join(", "))})</span>`)}
      ${detalle("No encontrados en el archivo", noAparecen, (r) => `${chapeta(r.data.codigo)} ${esc(nombreCliente(r.data))}`,
        "Se marcarán como inactivos. No se borran ni pierden su historial de visitas; si vuelven a aparecer en un archivo se reactivan.")}
      ${detalle("Avisos", avisos, (e) => `Fila ${e.fila}: ${esc(e.mensaje)}`, "Se importan, pero conviene revisarlos en el Excel.")}
      ${detalle("Errores", errores, (e) => `Fila ${e.fila}: ${esc(e.mensaje)}`, "Estas filas no se importan. Corrígelas en el Excel y vuelve a cargarlo.", errores.length > 0)}

      <div class="form-acciones acciones-importacion">
        <button class="btn btn-secundario" id="btn-cancelar">Cancelar</button>
        <button class="btn btn-primario" id="btn-confirmar" ${hayCambios ? "" : "disabled"}>
          ${hayCambios ? "Confirmar actualización" : "No hay cambios para aplicar"}
        </button>
      </div>
      <p class="texto-suave" id="progreso"></p>
    </div>`;

  zona.querySelector("#btn-cancelar").onclick = () => (zona.innerHTML = "");
  zona.querySelector("#btn-confirmar").onclick = async (e) => {
    const boton = e.target;
    setCargando(boton, true, "Actualizando…");
    zona.querySelector("#btn-cancelar").disabled = true;
    const progreso = zona.querySelector("#progreso");
    try {
      await aplicarImportacion(analisis, ctx.perfil, (hechos, total) => {
        progreso.textContent = `Guardando… ${hechos.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")}`;
      });
      toast(`Base actualizada: ${nuevos.length} nuevos, ${actualizados.length} actualizados, ${noAparecen.length} inactivados.`, "ok");
      zona.innerHTML = "";
      await Promise.all([cargarInfo(cont), cargarBase(cont, true)]);
    } catch (err) {
      console.error(err);
      progreso.textContent = "";
      toast(`La actualización se detuvo: ${mensajeError(err)}. Puedes volver a cargar el archivo; lo ya guardado no se duplica.`, "error");
      setCargando(boton, false);
      zona.querySelector("#btn-cancelar").disabled = false;
    }
  };
}

function detalle(titulo, items, fila, nota = "", abierto = false) {
  if (!items.length) return "";
  const visibles = items.slice(0, MAX_DETALLE);
  return `
    <details class="detalle" ${abierto ? "open" : ""}>
      <summary>${esc(titulo)} <span class="texto-suave">(${items.length.toLocaleString("es-CO")})</span></summary>
      ${nota ? `<p class="texto-suave">${esc(nota)}</p>` : ""}
      <ul class="lista-detalle">${visibles.map((x) => `<li>${fila(x)}</li>`).join("")}</ul>
      ${items.length > MAX_DETALLE ? `<p class="texto-suave">…y ${(items.length - MAX_DETALLE).toLocaleString("es-CO")} más.</p>` : ""}
    </details>`;
}

function panelError(mensaje) {
  return `<div class="panel"><p class="form-error">${esc(mensaje)}</p></div>`;
}

function formatearFecha(ts) {
  const fecha = ts?.toDate ? ts.toDate() : null;
  return fecha ? fecha.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
