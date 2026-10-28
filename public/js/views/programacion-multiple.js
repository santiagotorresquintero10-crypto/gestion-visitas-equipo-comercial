// Programar varias visitas en una sola operación (solo clientes de la base).
// Se buscan y agregan clientes a una lista; fecha, hora, tipo y responsable son comunes, y cada cliente puede
// ajustar su fecha, hora y tipo. Al guardar se crea UNA visita independiente por cliente con crearVisita
// (la misma función y las mismas reglas de Firestore de la programación individual). Nada se inicia.
import { esc, toast, setCargando, icono, chapeta, confirmar } from "../ui.js";
import { TIPOS_VISITA, TIPO_VISITA } from "../constants.js";
import { crearBuscador } from "../components/buscador-clientes.js";
import { listarVisitas, sedesDeCliente, crearVisita } from "../services/visitas-service.js";
import { mensajeError } from "../services/auth-service.js";
import { hoyISO, sumarDias, formatearFecha, formatearFechaLarga, formatearHora } from "../utils/fechas.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

// opciones: { preset: { fecha }, coordinadores, nombreResponsable, onVolver, onTerminar(fecha) }
export function renderProgramarVarias(cont, ctx, { preset = {}, coordinadores = [], nombreResponsable, onVolver, onTerminar }) {
  const hoy = hoyISO();
  const comun = {
    fecha: preset.fecha && preset.fecha >= hoy ? preset.fecha : hoy,
    hora: "09:00",
    tipo: "",
    coordinadorUid: ctx.esAdmin ? "" : ctx.perfil.uid,
    observacion: "",
  };
  // { cliente, sede, propio: { fecha?, hora?, tipo? } (solo lo que difiere de lo común), aviso }
  const items = [];
  let guardando = false;

  cont.innerHTML = `
    <header class="vista-cabecera">
      <div>
        <button class="btn-volver" id="btn-volver">${icono("back", 18)}Programar visita</button>
        <h1>Programar varias visitas</h1>
        <p class="texto-suave">Busca y agrega los clientes. Se crea una visita por cliente con los datos comunes.</p>
      </div>
    </header>
    <div class="multi-rejilla">
      <section class="multi-buscar" aria-label="Buscar clientes">
        <h2 class="multi-subtitulo">${icono("search", 18)}Agregar clientes</h2>
        <div id="multi-buscador"></div>
      </section>
      <form class="panel multi-resumen" id="form-multi" novalidate>
        <h2 class="multi-subtitulo">${icono("calendar", 18)}Datos comunes</h2>
        ${ctx.esAdmin ? `
        <label class="campo"><span>¿Quién hará las visitas?</span>
          <select name="coordinador" required>
            <option value="">Selecciona el responsable</option>
            ${coordinadores.map((u) => `<option value="${u.uid}">${esc(nombreResponsable(u, ctx))}</option>`).join("")}
          </select>
        </label>` : ""}
        <fieldset class="campo multi-tipo">
          <legend>Tipo de visita</legend>
          <div class="segmentos" role="radiogroup">${TIPOS_VISITA.map((t) => `
            <label class="segmento-opcion"><input type="radio" name="tipoComun" value="${t.clave}"><span>${esc(t.texto)}</span></label>`).join("")}
          </div>
        </fieldset>
        <div class="campo">
          <span>Fecha</span>
          <div class="atajos-fecha" role="group" aria-label="Atajos de fecha">
            ${[["Hoy", 0], ["Mañana", 1], ["Pasado mañana", 2]].map(([t, d]) => `<button type="button" class="atajo" data-dias="${d}">${t}</button>`).join("")}
          </div>
        </div>
        <div class="form-fila">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" min="${hoy}" value="${comun.fecha}" required></label>
          <label class="campo"><span>Hora</span><input type="time" name="hora" value="${comun.hora}" required></label>
        </div>
        <label class="campo"><span>Observación previa <small class="texto-suave">(opcional, para todas)</small></span>
          <textarea name="observacion" rows="2" maxlength="500" placeholder="Algo a tener en cuenta antes de las visitas"></textarea>
        </label>

        <div class="multi-lista-cabeza">
          <h2 class="multi-subtitulo">${icono("store", 18)}Clientes por programar <span class="multi-n" id="multi-n">0</span></h2>
        </div>
        <ul class="multi-lista" id="multi-lista"></ul>

        <p class="form-error" id="form-error" role="alert"></p>
        <div class="multi-pie">
          <button class="btn btn-primario btn-bloque btn-grande" type="submit" id="btn-multi" disabled>${icono("calendar", 20)}<span>Programar visitas</span></button>
        </div>
      </form>
    </div>
    <div class="multi-barra" id="multi-barra" hidden>
      <span><b id="multi-barra-n">0</b> seleccionados</span>
      <button type="button" class="btn btn-primario btn-sm" id="multi-revisar">Revisar y programar ${icono("down", 16)}</button>
    </div>`;

  const form = cont.querySelector("#form-multi");
  const lista = cont.querySelector("#multi-lista");
  const error = cont.querySelector("#form-error");
  const boton = cont.querySelector("#btn-multi");

  cont.querySelector("#btn-volver").onclick = onVolver;
  // Celular: barra con el número de clientes elegidos que lleva a la lista y al botón de programar.
  cont.querySelector("#multi-revisar").onclick = () => cont.querySelector(".multi-lista-cabeza").scrollIntoView({ behavior: "smooth", block: "start" });
  if ("IntersectionObserver" in window) {
    const barra = cont.querySelector("#multi-barra");
    const visibles = new Set();
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => (e.isIntersecting ? visibles.add(e.target) : visibles.delete(e.target)));
      barra.classList.toggle("lejos", !visibles.size); // la barra solo aparece si la lista y el botón no se ven
    });
    [".multi-lista-cabeza", "#multi-lista", ".multi-pie"].forEach((q) => io.observe(cont.querySelector(q)));
  }

  // ----- Datos comunes -----
  const marcarAtajos = () => cont.querySelectorAll("[data-dias]").forEach((x) =>
    x.classList.toggle("activo", sumarDias(hoy, Number(x.dataset.dias)) === form.fecha.value));
  marcarAtajos();
  cont.querySelectorAll("[data-dias]").forEach((b) => b.onclick = () => {
    form.fecha.value = sumarDias(hoy, Number(b.dataset.dias));
    form.fecha.dispatchEvent(new Event("change", { bubbles: true }));
  });
  form.addEventListener("change", (e) => {
    const n = e.target.name;
    if (n === "fecha") { comun.fecha = form.fecha.value; marcarAtajos(); }
    if (n === "hora") comun.hora = form.hora.value;
    if (n === "tipoComun") comun.tipo = e.target.value;
    if (n === "coordinador") comun.coordinadorUid = e.target.value;
    if (["fecha", "hora", "tipoComun", "coordinador"].includes(n)) { items.forEach((it) => { it.aviso = ""; }); pintarLista(); }
    error.textContent = "";
  });

  // ----- Buscador: cada cliente elegido se agrega a la lista sin salir de la pantalla -----
  crearBuscador(cont.querySelector("#multi-buscador"), {
    placeholder: "Buscar por código o marca…",
    onSeleccionar: (c) => {
      const input = cont.querySelector("#multi-buscador input");
      if (items.some((it) => it.cliente.id === c.id)) {
        toast(`${c.codigo} ya está en la lista`, "info");
        destacar(c.id);
        if (input) { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); }
        return;
      }
      items.push({ cliente: c, sede: 0, propio: {}, aviso: "" });
      pintarLista();
      destacar(c.id);
      toast(`${c.codigo} agregado`, "ok");
      if (input) { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); }
    },
  });

  function destacar(id) {
    const fila = lista.querySelector(`[data-cliente="${CSS.escape(id)}"]`);
    if (!fila) return;
    fila.classList.remove("destacada"); void fila.offsetWidth; fila.classList.add("destacada");
  }

  const efectivo = (it) => ({
    fecha: it.propio.fecha || comun.fecha,
    hora: it.propio.hora || comun.hora,
    tipo: it.propio.tipo || comun.tipo,
  });
  const ajustada = (it) => Object.keys(it.propio).length > 0;

  function pintarLista() {
    cont.querySelector("#multi-n").textContent = items.length;
    cont.querySelector("#multi-barra-n").textContent = items.length;
    cont.querySelector("#multi-barra").hidden = !items.length;
    if (!guardando) {
      const texto = items.length === 1 ? "Programar 1 visita" : `Programar ${items.length} visitas`;
      boton.querySelector("span").textContent = items.length ? texto : "Programar visitas";
      boton.disabled = !items.length;
    }
    if (!items.length) {
      lista.innerHTML = `<li class="multi-vacia">${icono("search", 18)}<span>Aún no hay clientes. Búscalos a la ${window.matchMedia("(max-width: 960px)").matches ? "arriba" : "izquierda"} y tócalos para agregarlos.</span></li>`;
      return;
    }
    lista.innerHTML = items.map((it, i) => {
      const c = it.cliente;
      const sedes = sedesDeCliente(c);
      const e = efectivo(it);
      const propia = ajustada(it);
      return `
      <li class="multi-item ${propia ? "ajustada" : ""} ${it.aviso ? "con-aviso" : ""}" data-cliente="${esc(c.id)}" data-i="${i}">
        <div class="multi-item-cabeza">
          <div class="multi-item-id">${chapeta(c.codigo)}<strong>${esc(nombreCliente(c))}</strong></div>
          <button type="button" class="btn-icono btn-mini" data-quitar aria-label="Quitar ${esc(c.codigo)} de la lista">${icono("close", 16)}</button>
        </div>
        ${sedes.length > 1 ? `
        <label class="multi-sede"><span class="sr-only">Sede</span>
          <select data-sede>${sedes.map((s, k) => `<option value="${k}" ${k === it.sede ? "selected" : ""}>${esc(s.direccion || "Sin dirección")}${s.marcas.length ? ` (${esc(s.marcas.slice(0, 3).join(", "))})` : ""}</option>`).join("")}</select>
        </label>` : ""}
        <div class="multi-item-campos">
          <label class="campo"><span>Fecha</span><input type="date" data-propio="fecha" min="${hoy}" value="${e.fecha}" aria-label="Fecha de ${esc(c.codigo)}"></label>
          <label class="campo"><span>Hora</span><input type="time" data-propio="hora" value="${e.hora}" aria-label="Hora de ${esc(c.codigo)}"></label>
          <label class="campo"><span>Tipo</span>
            <select data-propio="tipo" aria-label="Tipo de visita de ${esc(c.codigo)}"><option value="">Sin definir</option>
              ${TIPOS_VISITA.map((t) => `<option value="${t.clave}" ${e.tipo === t.clave ? "selected" : ""}>${esc(t.texto)}</option>`).join("")}</select>
          </label>
        </div>
        <div class="multi-item-pie" ${propia ? "" : "hidden"}>
          <em class="multi-propia">${icono("edit", 14)}Datos propios</em>
          <button type="button" class="btn btn-texto btn-sm" data-restablecer>Usar los datos comunes</button>
        </div>
        ${it.aviso ? `<p class="multi-aviso">${icono("alert", 15)}${esc(it.aviso)}</p>` : ""}
      </li>`;
    }).join("");
  }
  pintarLista();

  // Cambio en una fila: se actualiza solo esa fila, sin volver a dibujar la lista (así el campo de hora o
  // fecha que se está editando no pierde el foco y se pueden poner horas distintas a cada cliente).
  function refrescarFila(fila, it) {
    const propia = ajustada(it);
    fila.classList.toggle("ajustada", propia);
    fila.classList.remove("con-aviso");
    fila.querySelector(".multi-aviso")?.remove();
    fila.querySelector(".multi-item-pie").hidden = !propia;
  }

  lista.addEventListener("click", (e) => {
    const fila = e.target.closest("[data-i]");
    if (!fila) return;
    const it = items[Number(fila.dataset.i)];
    if (e.target.closest("[data-quitar]")) { items.splice(items.indexOf(it), 1); pintarLista(); return; }
    if (e.target.closest("[data-restablecer]")) { it.propio = {}; it.aviso = ""; pintarLista(); }
  });
  lista.addEventListener("change", (e) => {
    const fila = e.target.closest("[data-i]");
    if (!fila) return;
    e.stopPropagation(); // no es un dato común
    const it = items[Number(fila.dataset.i)];
    if (e.target.matches("[data-sede]")) { it.sede = Number(e.target.value); return; }
    const campo = e.target.dataset.propio;
    if (!campo) return;
    const valor = e.target.value;
    const comunCampo = { fecha: comun.fecha, hora: comun.hora, tipo: comun.tipo }[campo];
    // Solo se guarda como propio lo que difiere de los datos comunes.
    if (valor && valor !== comunCampo) it.propio[campo] = valor;
    else delete it.propio[campo];
    it.aviso = "";
    refrescarFila(fila, it);
  });

  // ----- Guardar: una visita por cliente -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    if (!items.length) return (error.textContent = "Agrega al menos un cliente.");
    const coordinador = ctx.esAdmin
      ? coordinadores.find((u) => u.uid === comun.coordinadorUid)
      : { uid: ctx.perfil.uid, nombre: ctx.perfil.nombre };
    if (!coordinador) { form.coordinador?.focus(); return (error.textContent = "Selecciona quién hará las visitas."); }

    let invalida = false;
    items.forEach((it) => {
      const x = efectivo(it);
      it.aviso = !x.fecha ? "Falta la fecha." : x.fecha < hoy ? "La fecha no puede ser anterior a hoy." : !x.hora ? "Falta la hora." : !x.tipo ? "Elige el tipo de visita." : "";
      if (it.aviso) invalida = true;
    });
    if (invalida) {
      pintarLista();
      return (error.textContent = !comun.tipo && items.some((it) => !it.propio.tipo)
        ? "Elige el tipo de visita (primer acercamiento o seguimiento comercial)."
        : "Revisa los clientes marcados en la lista.");
    }

    const terminar = () => { guardando = false; setCargando(boton, false); pintarLista(); };
    guardando = true;
    setCargando(boton, true, "Guardando…");
    try {
      // No duplicar sin avisar: misma persona, mismo cliente, mismo día.
      const fechas = items.map((it) => efectivo(it).fecha).sort();
      const existentes = await listarVisitas(ctx, { desde: fechas[0], hasta: fechas[fechas.length - 1] });
      const repetidos = items.filter((it) => existentes.some((v) =>
        v.clienteId === it.cliente.id && v.coordinadorUid === coordinador.uid && v.fechaProgramada === efectivo(it).fecha));
      if (repetidos.length) {
        repetidos.forEach((it) => { it.aviso = `Ya tiene una visita el ${formatearFechaLarga(efectivo(it).fecha)}.`; });
        pintarLista();
        const seguir = await confirmar({
          titulo: repetidos.length === 1 ? "Un cliente ya tiene visita ese día" : `${repetidos.length} clientes ya tienen visita ese día`,
          texto: `${repetidos.map((it) => it.cliente.codigo).join(", ")}. ¿Programar otra visita de todas formas? Puedes cancelar y quitarlos de la lista.`,
          aceptar: "Programar de todas formas",
        });
        if (!seguir) return terminar();
      }

      const observacion = form.observacion.value;
      const resultados = await Promise.allSettled(items.map((it) => {
        const x = efectivo(it);
        return crearVisita(ctx, {
          cliente: it.cliente, sede: sedesDeCliente(it.cliente)[it.sede], coordinador,
          fecha: x.fecha, hora: x.hora, tipoVisita: x.tipo, observacion,
        });
      }));
      const fallidas = [];
      let pendientes = 0;
      resultados.forEach((r, i) => {
        if (r.status === "fulfilled") { if (r.value.estadoEscritura === "pendiente") pendientes++; }
        else { console.error(r.reason); items[i].aviso = mensajeError(r.reason); fallidas.push(items[i]); }
      });
      const creadas = resultados.length - fallidas.length;
      if (!fallidas.length) {
        toast(pendientes
          ? `${creadas} visitas guardadas en este dispositivo. Se enviarán automáticamente cuando haya señal.`
          : `${creadas === 1 ? "1 visita programada" : `${creadas} visitas programadas`}`, pendientes ? "info" : "ok");
        return onTerminar(fechas[0]);
      }
      // Quedan en la lista solo las que no se pudieron guardar.
      items.splice(0, items.length, ...fallidas);
      terminar();
      error.textContent = `${creadas ? `Se programaron ${creadas}. ` : ""}${fallidas.length === 1 ? "Una visita no se pudo guardar" : `${fallidas.length} visitas no se pudieron guardar`}; quedan en la lista para intentar de nuevo.`;
    } catch (err) {
      console.error(err);
      error.textContent = mensajeError(err);
      terminar();
    }
  });
}
