// Gestión de usuarios: cada persona se registra sola; aquí el administrador ajusta rol y acceso.
import { esc, toast, iniciales, confirmar, estadoVacio, esqueleto } from "../ui.js";
import { ROLES, ROL_LABEL } from "../constants.js";
import { listarUsuarios, actualizarUsuario } from "../services/users-service.js";
import { mensajeError } from "../services/auth-service.js";
import { APP_CONFIG } from "../firebase-config.js";

export async function render(cont, ctx) {
  const dominio = APP_CONFIG.dominioCorporativo;
  cont.innerHTML = `
    <header class="vista-cabecera">
      <div><h1>Usuarios</h1>
        <p class="texto-suave">Cada persona crea su cuenta${dominio ? ` con su correo @${esc(dominio)}` : ""} y entra como coordinador.
        Aquí puedes cambiar su rol o retirarle el acceso.</p>
      </div>
    </header>
    <section class="panel panel-tabla">
      <div id="tabla-usuarios">${esqueleto(4, 56)}</div>
    </section>`;
  await cargarTabla(cont, ctx);
}

async function cargarTabla(cont, ctx) {
  const destino = cont.querySelector("#tabla-usuarios");
  try {
    const usuarios = await listarUsuarios();
    destino.innerHTML = usuarios.length ? `
      <table class="tabla tabla-responsive">
        <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>${usuarios.map((u) => {
          const propio = u.uid === ctx.perfil.uid;
          return `
          <tr>
            <td data-label="Nombre"><div class="persona"><span class="avatar">${esc(iniciales(u.nombre))}</span><div><strong>${esc(u.nombre)}</strong><span class="texto-suave">${esc(u.correo)}</span></div></div></td>
            <td data-label="Rol">
              <select class="input-sm" data-accion="rol" data-uid="${u.uid}" ${propio ? "disabled" : ""}>
                ${Object.values(ROLES).map((r) => `<option value="${r}" ${r === u.rol ? "selected" : ""}>${ROL_LABEL[r]}</option>`).join("")}
              </select>
            </td>
            <td data-label="Estado"><span class="chip ${u.activo ? "chip-ok" : "chip-off"}">${u.activo ? "Activo" : "Inactivo"}</span></td>
            <td data-label="" class="celda-acciones">
              ${propio ? '<span class="texto-suave">Tu cuenta</span>' : `
                <button class="btn btn-sm btn-secundario" data-accion="activo" data-uid="${u.uid}" data-valor="${!u.activo}">
                  ${u.activo ? "Desactivar" : "Activar"}
                </button>`}
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table>` : estadoVacio({ icono: "users", titulo: "Aún no hay usuarios", texto: "Cuando el equipo cree su cuenta aparecerá aquí." });

    destino.querySelectorAll("[data-accion]").forEach((elem) => {
      const evento = elem.tagName === "SELECT" ? "change" : "click";
      elem.addEventListener(evento, () => ejecutarAccion(elem, cont, ctx));
    });
  } catch (err) {
    destino.innerHTML = `<p class="form-error">${esc(mensajeError(err))}</p>`;
  }
}

async function ejecutarAccion(elem, cont, ctx) {
  const { accion, uid, valor } = elem.dataset;
  try {
    if (accion === "rol") {
      if (elem.value === ROLES.ADMIN && !(await confirmar({
        titulo: "¿Dar rol de administrador?",
        texto: "Un administrador ve la gestión de todo el equipo, administra la base de clientes y los usuarios.",
        aceptar: "Hacer administrador",
      }))) {
        return cargarTabla(cont, ctx);
      }
      await actualizarUsuario(uid, { rol: elem.value });
    }
    if (accion === "activo") {
      if (valor === "false" && !(await confirmar({
        titulo: "¿Desactivar este usuario?",
        texto: "No podrá volver a entrar a la aplicación. Su historial de visitas se conserva y puedes activarlo de nuevo cuando quieras.",
        aceptar: "Desactivar", peligro: true,
      }))) return;
      await actualizarUsuario(uid, { activo: valor === "true" });
    }
    toast("Cambios guardados", "ok");
  } catch (err) {
    toast(mensajeError(err), "error");
  }
  await cargarTabla(cont, ctx);
}
