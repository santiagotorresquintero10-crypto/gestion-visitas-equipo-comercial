// Administración → Despachos Bovinos (solo administrador): subir la base de despachos en Excel.
// La app relaciona cada marca con su código y la información se consulta en la Ficha de cliente.
// Ver services/despachos-service.js.
import { esc, toast, icono, estadoVacio, esqueleto } from "../ui.js";
import {
  leerExcelDespachos, cruzarConClientes, aplicarDespachos, obtenerResumenDespachos, listarDespachos, ESTADO_CRUCE,
} from "../services/despachos-service.js";
import { obtenerClientes } from "../services/clientes-service.js";
import { mensajeError } from "../services/auth-service.js";
import { tablaDespachos } from "../components/tabla-despachos.js";

export async function render(cont, ctx) {
  if (!ctx.esAdmin) {
    cont.innerHTML = `<div class="panel">${estadoVacio({ icono: "alert", titulo: "Solo el administrador", texto: "Los despachos se consultan en la Ficha de cliente." })}</div>`;
    return;
  }
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div><h1>Despachos Bovinos</h1>
        <p class="texto-suave">Sube la base de despachos. Cada marca aparece en la Ficha de su cliente con todos sus datos.</p></div>
      <label class="btn btn-primario btn-grande">
        ${icono("upload", 20)}Subir / Actualizar Excel
        <input type="file" id="input-despachos" accept=".xlsx,.xls" hidden>
      </label>
    </header>
    <section id="despachos-importacion"></section>
    <section id="despachos-base">${esqueleto(1, 70)}</section>
    <section id="despachos-sin-relacion"></section>`;

  const input = cont.querySelector("#input-despachos");
  input.onchange = () => { const f = input.files[0]; input.value = ""; if (f) importar(cont, ctx, f); };
  await cargar(cont);
}

async function cargar(cont) {
  try {
    const [resumen, lista] = await Promise.all([obtenerResumenDespachos(), listarDespachos()]);
    pintarBase(cont, resumen);
    pintarSinRelacion(cont, lista.filter((r) => r.estadoCruce !== ESTADO_CRUCE.RELACIONADA));
  } catch (err) {
    console.error(err);
    cont.querySelector("#despachos-base").innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
  }
}

function pintarBase(cont, r) {
  const caja = cont.querySelector("#despachos-base");
  if (!caja) return;
  if (!r) {
    caja.innerHTML = `<div class="panel">${estadoVacio({ icono: "camion", titulo: "Aún no se ha subido la base de despachos", texto: "Sube el Excel y la app relacionará cada marca con su cliente." })}</div>`;
    return;
  }
  const fecha = r.fecha?.toDate ? r.fecha.toDate() : r.fechaLocal ? new Date(r.fechaLocal) : null;
  caja.innerHTML = `
    <div class="panel despachos-base">
      <span class="despachos-base-icono">${icono("file", 22)}</span>
      <div>
        <span class="texto-suave">Base actual</span>
        <strong>${esc(r.archivo || "Excel de despachos")}</strong>
        <small class="texto-suave">Actualizada ${fecha ? esc(fecha.toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })) : "—"}${r.usuarioNombre ? ` por ${esc(r.usuarioNombre)}` : ""}</small>
      </div>
    </div>`;
}

function pintarSinRelacion(cont, lista) {
  const caja = cont.querySelector("#despachos-sin-relacion");
  if (!caja) return;
  if (!lista.length) { caja.innerHTML = ""; return; }
  caja.innerHTML = `
    <div class="panel despachos-sin-relacion">
      <h2 class="panel-titulo">${icono("alert", 20)}Marcas sin relacionar</h2>
      <p class="texto-suave">Estas marcas del Excel no están en la base de clientes o aparecen en varios códigos, por eso no se muestran en ninguna ficha. Corrige la marca en la Base de clientes y vuelve a subir este Excel.</p>
      ${tablaDespachos(lista, { conCodigo: true })}
    </div>`;
}

// Subir: leer → validar → relacionar → guardar, todo automático.
async function importar(cont, ctx, archivo) {
  const caja = cont.querySelector("#despachos-importacion");
  const estado = (texto) => {
    caja.innerHTML = `<div class="panel importacion-despachos"><p class="texto-suave">${icono("upload", 18)} ${esc(texto)}</p>${esqueleto(1, 8)}</div>`;
  };
  estado(`Leyendo ${archivo.name}…`);
  try {
    const lectura = await leerExcelDespachos(archivo);
    if (!lectura.ok) {
      caja.innerHTML = `
        <div class="panel importacion-error">
          <h2 class="panel-titulo">${icono("alert", 20)}No se pudo subir el archivo</h2>
          <p>${esc(lectura.error)}</p>
          ${lectura.erroresFormulas?.length ? `<ul class="lista-errores">${lectura.erroresFormulas.slice(0, 30).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>${lectura.erroresFormulas.length > 30 ? `<p class="texto-suave">y ${lectura.erroresFormulas.length - 30} más…</p>` : ""}` : ""}
          <p class="texto-suave">No se cambió nada. La base anterior sigue igual.</p>
          <button type="button" class="btn btn-secundario" data-cerrar-imp>Cerrar</button>
        </div>`;
      caja.querySelector("[data-cerrar-imp]").onclick = () => { caja.innerHTML = ""; };
      return;
    }
    estado("Relacionando marcas con los códigos de la base de clientes…");
    const cruce = cruzarConClientes(lectura, await obtenerClientes());
    estado("Guardando…");
    await aplicarDespachos(ctx, cruce, { archivo: archivo.name, duplicadas: lectura.duplicadas },
      (hechas, total) => estado(`Guardando ${hechas} de ${total}…`));
    caja.innerHTML = `
      <div class="panel importacion-ok" role="status">
        <p>${icono("check", 20)} <strong>Base de despachos actualizada.</strong> Ya se ve en la Ficha de cada cliente.</p>
        <button type="button" class="btn btn-secundario" data-cerrar-imp>Cerrar</button>
      </div>`;
    caja.querySelector("[data-cerrar-imp]").onclick = () => { caja.innerHTML = ""; };
    toast("Base de despachos actualizada", "ok");
    await cargar(cont);
  } catch (err) {
    console.error(err);
    caja.innerHTML = `<div class="panel importacion-error"><p class="form-error">${esc(mensajeError(err))}</p><p class="texto-suave">Vuelve a subir el archivo.</p></div>`;
  }
}
