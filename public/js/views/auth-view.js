// Pantallas previas al ingreso: login, activar cuenta, recuperar clave, verificación y estados bloqueados.
import { esc, setCargando, toast, curvasNivel, icono } from "../ui.js";
import {
  iniciarSesion, crearCuenta, recuperarClave, reenviarVerificacion, cerrarSesion, mensajeError,
} from "../services/auth-service.js";
import { APP_CONFIG } from "../firebase-config.js";

// Pantalla de acceso: panel de marca (logo, nombre, curvas de nivel) y el formulario al lado.
function pantalla(root, contenido) {
  root.innerHTML = `
    <main class="auth">
      <aside class="auth-marca">
        ${curvasNivel()}
        <img class="auth-logo" src="img/logo.png" alt="Central Ganadera S.A." width="96" height="96">
        <div class="auth-texto">
          <h1 class="auth-app">Control de<br>Visitas</h1>
          <p class="auth-sub">Programación y seguimiento de las visitas a expendios del equipo comercial.</p>
          <span class="auth-empresa">${esc(APP_CONFIG.nombreEmpresa || "Central Ganadera S.A.")}</span>
        </div>
      </aside>
      <section class="auth-card">${contenido}</section>
    </main>`;
}

export function renderLogin(root, modo = "login") {
  const config = {
    login: { titulo: "Iniciar sesión", boton: "Iniciar sesión", clave: true,
      ayuda: `Entra con tu correo${APP_CONFIG.dominioCorporativo ? " @" + APP_CONFIG.dominioCorporativo : " corporativo"}.` },
    activar: { titulo: "Crear cuenta", boton: "Crear cuenta", clave: true,
      ayuda: `Usa tu correo corporativo${APP_CONFIG.dominioCorporativo ? " (@" + APP_CONFIG.dominioCorporativo + ")" : ""}. Te enviaremos un enlace para verificarlo.` },
    recuperar: { titulo: "Recuperar contraseña", boton: "Enviar enlace", clave: false,
      ayuda: "Te enviaremos un enlace para definir una nueva contraseña." },
  }[modo];

  pantalla(root, `
    <h1 class="auth-titulo">${config.titulo}</h1>
    ${config.ayuda ? `<p class="auth-ayuda">${config.ayuda}</p>` : ""}
    <form id="form-auth" class="form" novalidate>
      ${modo === "activar" ? `
      <label class="campo"><span>Nombre completo</span>
        <input name="nombre" autocomplete="name" required>
      </label>` : ""}
      <label class="campo"><span>Correo corporativo</span>
        <input type="email" name="correo" autocomplete="username" required inputmode="email">
      </label>
      ${config.clave ? `
      <label class="campo"><span>Contraseña</span>
        <input type="password" name="clave" minlength="6" required
          autocomplete="${modo === "activar" ? "new-password" : "current-password"}">
      </label>` : ""}
      ${modo === "activar" ? `
      <label class="campo"><span>Confirmar contraseña</span>
        <input type="password" name="clave2" minlength="6" required autocomplete="new-password">
      </label>` : ""}
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="btn btn-primario btn-bloque" type="submit">${config.boton}</button>
    </form>
    <nav class="auth-links">
      ${modo !== "login" ? `<a href="#" data-modo="login">${icono("back", 16)} Volver a iniciar sesión</a>` : `
        <a href="#" data-modo="recuperar">¿Olvidaste tu contraseña?</a>
        <a href="#" data-modo="activar">Crear cuenta</a>`}
    </nav>`);

  root.querySelectorAll("[data-modo]").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); renderLogin(root, a.dataset.modo); }));

  const form = root.querySelector("#form-auth");
  const error = root.querySelector("#auth-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const { nombre, correo, clave, clave2 } = Object.fromEntries(new FormData(form));
    if (!correo) return (error.textContent = "Escribe tu correo.");
    if (config.clave && (clave || "").length < 6) return (error.textContent = "La contraseña debe tener al menos 6 caracteres.");
    if (modo === "activar" && clave !== clave2) return (error.textContent = "Las contraseñas no coinciden.");

    const boton = form.querySelector("button[type=submit]");
    setCargando(boton, true);
    try {
      if (modo === "login") await iniciarSesion(correo, clave);
      if (modo === "activar") await crearCuenta(nombre, correo, clave);
      if (modo === "recuperar") {
        await recuperarClave(correo);
        toast("Si el correo está registrado, recibirás el enlace en unos minutos.", "ok");
        renderLogin(root, "login");
      }
    } catch (err) {
      // Al crear la cuenta, el cambio de sesión puede reemplazar este formulario; el toast garantiza que el error se vea.
      error.textContent = mensajeError(err);
      if (modo === "activar" && err?.code) toast(mensajeError(err), "error");
      setCargando(boton, false);
    }
  });
}

export function renderVerificacion(root, user, onReintentar) {
  pantalla(root, `
    <h1 class="auth-titulo">Verifica tu correo</h1>
    <p class="auth-ayuda">Enviamos un enlace a <strong>${esc(user.email)}</strong>.
      Ábrelo y luego pulsa "Ya verifiqué". Revisa también la carpeta de spam.</p>
    <div class="form">
      <button class="btn btn-primario btn-bloque" id="btn-verifique">Ya verifiqué</button>
      <button class="btn btn-secundario btn-bloque" id="btn-reenviar">Reenviar correo</button>
    </div>
    <nav class="auth-links"><a href="#" id="btn-salir">Usar otra cuenta</a></nav>`);

  root.querySelector("#btn-verifique").onclick = async (e) => {
    setCargando(e.target, true, "Comprobando…");
    await user.reload();
    if (user.emailVerified) onReintentar();
    else { toast("Aún no aparece verificado. Abre el enlace del correo.", "error"); setCargando(e.target, false); }
  };
  root.querySelector("#btn-reenviar").onclick = async (e) => {
    try { await reenviarVerificacion(); toast("Correo reenviado.", "ok"); }
    catch (err) { toast(mensajeError(err), "error"); }
  };
  root.querySelector("#btn-salir").onclick = (e) => { e.preventDefault(); cerrarSesion(); };
}

export function renderBloqueado(root, titulo, mensaje) {
  pantalla(root, `
    <h1 class="auth-titulo">${esc(titulo)}</h1>
    <p class="auth-ayuda">${esc(mensaje)}</p>
    <div class="form"><button class="btn btn-secundario btn-bloque" id="btn-salir">Cerrar sesión</button></div>`);
  root.querySelector("#btn-salir").onclick = () => cerrarSesion();
}

export function renderCargando(root, texto = "Cargando…") {
  root.innerHTML = `<div class="cargando-pantalla"><img src="img/logo.png" alt="" width="72" height="72"><div class="spinner"></div><p>${esc(texto)}</p></div>`;
}
