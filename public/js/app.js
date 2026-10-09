// Punto de entrada: controla la sesión, el menú según rol y el enrutamiento por hash (#/vista).
import { MENU, ROLES, ROL_LABEL, RUTA_INICIAL } from "./constants.js";
import { $, esc, icono, iniciales, toast, esqueleto } from "./ui.js";
import { irANuevaVisita } from "./utils/navegacion.js";
import { configurarClientes } from "./services/clientes-service.js";
import { escucharSesion, obtenerPerfil, cerrarSesion, mensajeError, esAdminPrincipal } from "./services/auth-service.js";
import { renderLogin, renderVerificacion, renderBloqueado, renderCargando } from "./views/auth-view.js";
import * as dashboardView from "./views/dashboard-view.js";
import * as usuariosView from "./views/usuarios-view.js";
import * as clientesView from "./views/clientes-view.js";
import * as programacionView from "./views/programacion-view.js";
import * as visitasView from "./views/visitas-view.js";
import * as fichaView from "./views/ficha-view.js";
import * as reportesView from "./views/reportes-view.js";

const VISTAS = {
  dashboard: dashboardView,
  programacion: programacionView,
  visitas: visitasView,
  ficha: fichaView,
  reportes: reportesView,
  clientes: clientesView,
  usuarios: usuariosView,
};

const root = $("#app");
let ctx = null;

const menuDelRol = (rol) => MENU.filter((m) => m.roles.includes(rol));
const puedeVer = (id, rol) => menuDelRol(rol).some((m) => m.id === id);

escucharSesion(async (user) => {
  ctx = null;
  if (!user) return renderLogin(root);
  if (!user.emailVerified && !esAdminPrincipal(user.email)) return renderVerificacion(root, user, () => iniciar(user));
  iniciar(user);
});

async function iniciar(user) {
  renderCargando(root, "Cargando tu perfil…");
  try {
    const perfil = await obtenerPerfil(user);
    if (!perfil) return renderBloqueado(root, "Cuenta no habilitada",
      "Tu correo no está registrado en la aplicación. Pide al administrador que lo habilite.");
    if (!perfil.activo) return renderBloqueado(root, "Cuenta desactivada",
      "Tu acceso fue desactivado. Comunícate con el administrador.");
    ctx = { user, perfil, esAdmin: perfil.rol === ROLES.ADMIN };
    configurarClientes(ctx);
    renderShell();
    navegar();
  } catch (err) {
    renderBloqueado(root, "No fue posible ingresar", mensajeError(err));
  }
}

// Barra inferior en celular: lo que se usa en campo, con "Programar visita" al centro.
const TABS = [
  { id: "dashboard", label: "Inicio", icon: "grid" },
  { id: "programacion", label: "Agenda", icon: "calendar" },
  { id: "+", label: "Programar visita", icon: "plus" },
  { id: "visitas", label: "Visitas", icon: "check" },
  { id: "ficha", label: "Ficha", icon: "store" },
];

function renderShell() {
  const { perfil } = ctx;
  const items = menuDelRol(perfil.rol).map((m) => m.seccion
    ? `<li class="menu-seccion">${esc(m.seccion)}</li>`
    : `<li><a href="#/${m.id}" class="menu-item" data-ruta="${m.id}">${icono(m.icon)}<span>${esc(m.label)}</span></a></li>`
  ).join("");

  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-marca">
          <img class="logo" src="img/logo.png" alt="Central Ganadera S.A." width="44" height="44">
          <div class="sidebar-nombre"><strong>Control de Visitas</strong><span>Central Ganadera</span></div>
          <button class="btn-icono solo-movil" id="btn-cerrar-menu" aria-label="Cerrar menú">${icono("close")}</button>
        </div>
        <nav aria-label="Principal"><ul class="menu">${items}</ul></nav>
        <div class="sidebar-pie">
          <div class="usuario">
            <div class="avatar">${esc(iniciales(perfil.nombre))}</div>
            <div class="usuario-datos">
              <strong>${esc(perfil.nombre)}</strong>
              <span>${esc(ROL_LABEL[perfil.rol] || perfil.rol)}</span>
            </div>
            <button class="btn-icono btn-salir" id="btn-salir" aria-label="Cerrar sesión" title="Cerrar sesión">${icono("logout")}</button>
          </div>
        </div>
      </aside>
      <div class="velo" id="velo"></div>
      <div class="principal">
        <header class="topbar solo-movil">
          <a href="#/dashboard" class="topbar-inicio" aria-label="Ir al inicio"><img class="logo logo-sm" src="img/logo.png" alt="" width="34" height="34"></a>
          <span class="topbar-titulo" id="topbar-titulo"></span>
          <button class="btn-icono" id="btn-menu" aria-label="Abrir menú">${icono("menu", 22)}</button>
        </header>
        <main class="contenido" id="contenido"></main>
      </div>
      <nav class="tabbar solo-movil" aria-label="Accesos rápidos">
        ${TABS.map((t) => t.id === "+"
          ? `<button type="button" class="tab-programar" id="tab-programar" aria-label="${t.label}">${icono("plus", 26)}</button>`
          : `<a href="#/${t.id}" class="tab" data-tab="${t.id}">${icono(t.icon, 22)}<span>${t.label}</span></a>`).join("")}
      </nav>
    </div>`;

  const abrir = (si) => document.body.classList.toggle("menu-abierto", si);
  $("#btn-menu").onclick = () => abrir(true);
  $("#btn-cerrar-menu").onclick = () => abrir(false);
  $("#velo").onclick = () => abrir(false);
  $("#btn-salir").onclick = () => cerrarSesion();
  $("#tab-programar").onclick = () => irANuevaVisita();
}

async function navegar() {
  if (!ctx) return;
  let ruta = location.hash.replace(/^#\/?/, "") || RUTA_INICIAL;
  if (!VISTAS[ruta] || !puedeVer(ruta, ctx.perfil.rol)) {
    ruta = RUTA_INICIAL;
    history.replaceState(null, "", `#/${ruta}`);
  }
  document.body.classList.remove("menu-abierto");
  document.querySelectorAll(".menu-item[data-ruta]").forEach((a) =>
    a.classList.toggle("activo", a.dataset.ruta === ruta));
  document.querySelectorAll(".tab[data-tab]").forEach((a) => {
    a.classList.toggle("activo", a.dataset.tab === ruta);
    if (a.dataset.tab === ruta) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const item = MENU.find((m) => m.id === ruta);
  $("#topbar-titulo").textContent = item?.label || "";
  document.title = `${item?.label || ""} | Control de Visitas`;
  window.scrollTo(0, 0);

  const cont = $("#contenido");
  cont.innerHTML = esqueleto(3, 96);
  try {
    await VISTAS[ruta].render(cont, ctx);
  } catch (err) {
    console.error(err);
    cont.innerHTML = "";
    toast(mensajeError(err), "error");
  }
}

window.addEventListener("hashchange", navegar);
