// Autenticación y perfil del usuario.
// Registro abierto solo para correos del dominio corporativo; todos entran como coordinador.
// El único administrador inicial es APP_CONFIG.adminPrincipal (puede promover a otros desde Usuarios).
import {
  auth, db,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  sendEmailVerification, signOut, onAuthStateChanged, updateProfile,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "../firebase.js";
import { COLECCIONES, ROLES } from "../constants.js";
import { APP_CONFIG } from "../firebase-config.js";

export const normalizarCorreo = (correo) => (correo || "").trim().toLowerCase();

export const esAdminPrincipal = (correo) =>
  normalizarCorreo(correo) === normalizarCorreo(APP_CONFIG.adminPrincipal?.correo);

function validarDominio(correo) {
  const dominio = APP_CONFIG.dominioCorporativo;
  if (dominio && !esAdminPrincipal(correo) && !correo.endsWith("@" + dominio.toLowerCase())) {
    throw new Error(`Usa tu correo corporativo (@${dominio}).`);
  }
}

export function escucharSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function iniciarSesion(correo, clave) {
  correo = normalizarCorreo(correo);
  validarDominio(correo);
  await signInWithEmailAndPassword(auth, correo, clave);
}

export async function crearCuenta(nombre, correo, clave) {
  correo = normalizarCorreo(correo);
  nombre = (nombre || "").trim();
  if (nombre.length < 3) throw new Error("Escribe tu nombre completo.");
  validarDominio(correo);
  const { user } = await createUserWithEmailAndPassword(auth, correo, clave);
  await updateProfile(user, { displayName: nombre });
  await sendEmailVerification(user);
}

export async function reenviarVerificacion() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function recuperarClave(correo) {
  await sendPasswordResetEmail(auth, normalizarCorreo(correo));
}

export async function cerrarSesion() {
  await signOut(auth);
}

// Devuelve el perfil de usuarios/{uid}; en el primer ingreso lo crea (coordinador, o administrador si es el principal).
export async function obtenerPerfil(user) {
  const ref = doc(db, COLECCIONES.USUARIOS, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const actual = snap.data();
    // Si el administrador principal ya existía como coordinador, se corrige su rol al ingresar.
    if (esAdminPrincipal(user.email) && (actual.rol !== ROLES.ADMIN || !actual.activo)) {
      await updateDoc(ref, { rol: ROLES.ADMIN, activo: true });
      return { uid: user.uid, ...actual, rol: ROLES.ADMIN, activo: true };
    }
    return { uid: user.uid, ...actual };
  }

  await user.getIdToken(true); // refresca email_verified en el token antes de evaluar reglas
  const correo = normalizarCorreo(user.email);
  const admin = esAdminPrincipal(correo);
  const nombre = (user.displayName || (admin ? APP_CONFIG.adminPrincipal.nombre : "") || correo.split("@")[0]).trim();

  await setDoc(ref, {
    nombre,
    correo,
    rol: admin ? ROLES.ADMIN : ROLES.COORDINADOR,
    coordinador: admin ? "" : nombre.toUpperCase(),
    activo: true,
    fechaCreacion: serverTimestamp(),
  });
  return { uid: user.uid, ...(await getDoc(ref)).data() };
}

export function mensajeError(err) {
  const mapa = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/email-already-in-use": "Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
    "permission-denied": "No tienes permiso para esta acción.",
  };
  return mapa[err?.code] || err?.message || "Ocurrió un error inesperado.";
}
