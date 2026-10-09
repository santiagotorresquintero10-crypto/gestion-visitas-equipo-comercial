// Firma de recibido con HTML Canvas: funciona con dedo, lápiz y mouse (Pointer Events). Siempre opcional.
import { icono } from "../ui.js";

export function htmlFirma() {
  return `
    <fieldset class="pregunta firma" data-pregunta="firma">
      <legend class="pregunta-titulo">Firma de recibido <span class="etiqueta-opcional">Opcional</span></legend>
      <p class="pregunta-ayuda">No es obligatoria: la visita se guarda con o sin firma.</p>
      <p class="firma-aviso" hidden>${icono("alert", 16)}<span>No disponible: la persona no autorizó el tratamiento de sus datos personales.</span></p>
      <label class="campo firma-nombre"><span>Nombre de quien firma</span>
        <input name="firmaNombre" maxlength="120" placeholder="Nombre completo" autocomplete="off"></label>
      <span class="firma-etiqueta">Firma</span>
      <div class="firma-lienzo" data-vacia="true">
        <canvas id="firma-canvas" aria-label="Espacio para firmar con el dedo o el mouse" role="img"></canvas>
        <span class="firma-guia" aria-hidden="true">Firme aquí</span>
        <span class="firma-linea" aria-hidden="true"></span>
      </div>
      <button type="button" class="btn btn-secundario btn-sm" id="btn-limpiar-firma" disabled>${icono("repeat", 16)}Limpiar firma</button>
    </fieldset>`;
}

// raiz: contenedor donde está htmlFirma(). Devuelve { vacia, leer, limpiar, alCambiar }.
export function activarFirma(raiz) {
  const lienzo = raiz.querySelector(".firma-lienzo");
  const canvas = raiz.querySelector("#firma-canvas");
  const btn = raiz.querySelector("#btn-limpiar-firma");
  const ctx2d = canvas.getContext("2d");
  let trazos = [];       // [[{x,y}]] en coordenadas CSS, para redibujar al cambiar el tamaño
  let actual = null;
  const oyentes = [];

  const dibujar = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.lineCap = "round"; ctx2d.lineJoin = "round"; ctx2d.lineWidth = 2.4; ctx2d.strokeStyle = "#1D2617";
    trazos.forEach((t) => {
      ctx2d.beginPath();
      t.forEach((p, i) => (i ? ctx2d.lineTo(p.x, p.y) : ctx2d.moveTo(p.x, p.y)));
      if (t.length === 1) ctx2d.lineTo(t[0].x + .1, t[0].y + .1);
      ctx2d.stroke();
    });
  };
  const estado = () => {
    const vacia = !trazos.length;
    lienzo.dataset.vacia = vacia;
    btn.disabled = vacia;
    oyentes.forEach((f) => f());
  };
  const punto = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (canvas.disabled || lienzo.closest(".firma-bloqueada")) return;
    canvas.setPointerCapture(e.pointerId);
    actual = [punto(e)];
    trazos.push(actual);
    dibujar();
    estado();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!actual) return;
    e.preventDefault();
    const p = punto(e), u = actual[actual.length - 1];
    actual.push(p);
    ctx2d.beginPath(); ctx2d.moveTo(u.x, u.y); ctx2d.lineTo(p.x, p.y); ctx2d.stroke();
  });
  const fin = () => { actual = null; };
  canvas.addEventListener("pointerup", fin);
  canvas.addEventListener("pointercancel", fin);
  btn.onclick = () => { trazos = []; dibujar(); estado(); };
  new ResizeObserver(() => dibujar()).observe(canvas);
  requestAnimationFrame(dibujar);

  return {
    vacia: () => !trazos.length,
    // Firma como PNG con fondo blanco (se ve bien en cualquier visor) y nombre del firmante.
    leer: () => {
      if (!trazos.length) return null;
      const salida = document.createElement("canvas");
      salida.width = canvas.width; salida.height = canvas.height;
      const s = salida.getContext("2d");
      s.fillStyle = "#fff"; s.fillRect(0, 0, salida.width, salida.height);
      s.drawImage(canvas, 0, 0);
      return { id: `firma-${Date.now()}`, nombre: raiz.querySelector("[name=firmaNombre]").value.trim(), datos: salida.toDataURL("image/png") };
    },
    nombre: () => raiz.querySelector("[name=firmaNombre]").value.trim(),
    limpiar: () => { trazos = []; dibujar(); estado(); },
    alCambiar: (f) => oyentes.push(f),
  };
}
