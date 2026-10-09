// Fotos de visita. Módulo desacoplado: hoy guarda la imagen comprimida en Firestore
// (visitas/{id}/fotos/principal); para migrar a un almacenamiento de archivos solo cambian
// agregarFotoALote y obtenerFoto, sin tocar el resto del módulo de visitas.
import { db, doc, getDoc, setDoc } from "../firebase.js";
import { COLECCIONES } from "../constants.js";

// Fotos pequeñas (~80-120 KB) para que el 1 GB del plan gratuito alcance para años de visitas.
const LADO_MAXIMO = [800, 640];          // se prueba en orden hasta cumplir el tamaño objetivo
const CALIDADES = [0.7, 0.6, 0.5, 0.4];
const TAMANO_OBJETIVO = 160_000;         // caracteres del data URL (~120 KB)
export const TAMANO_MAXIMO = 600_000;    // tope absoluto (~450 KB); las reglas rechazan > 700.000

const refFoto = (visitaId) => doc(db, COLECCIONES.VISITAS, visitaId, "fotos", "principal");

async function cargarImagen(archivo) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(archivo, { imageOrientation: "from-image" }); } catch { /* sigue */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Redimensiona y comprime en el navegador. Nunca se guarda la foto original.
export async function comprimirFoto(archivo) {
  if (!archivo?.type?.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  const imagen = await cargarImagen(archivo);
  const anchoOriginal = imagen.width, altoOriginal = imagen.height;

  let mejor = null;
  for (const lado of LADO_MAXIMO) {
    const escala = Math.min(1, lado / Math.max(anchoOriginal, altoOriginal));
    const ancho = Math.round(anchoOriginal * escala), alto = Math.round(altoOriginal * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    canvas.getContext("2d").drawImage(imagen, 0, 0, ancho, alto);
    for (const calidad of CALIDADES) {
      const datos = canvas.toDataURL("image/jpeg", calidad);
      if (!mejor || datos.length < mejor.datos.length) mejor = { datos, ancho, alto };
      if (datos.length <= TAMANO_OBJETIVO) break;
    }
    if (mejor.datos.length <= TAMANO_OBJETIVO) break;
  }
  imagen.close?.();
  if (!mejor || mejor.datos.length > TAMANO_MAXIMO) {
    throw new Error("La foto es demasiado grande incluso comprimida. Intenta tomarla de nuevo.");
  }
  return { ...mejor, bytes: Math.round((mejor.datos.length * 3) / 4), pesoOriginal: archivo.size };
}

export function agregarFotoALote(lote, visitaId, foto, ctx) {
  if (foto.datos.length > TAMANO_MAXIMO) throw new Error("La foto supera el tamaño permitido.");
  lote.set(refFoto(visitaId), {
    datos: foto.datos,
    ancho: foto.ancho,
    alto: foto.alto,
    bytes: foto.bytes,
    fechaHora: new Date().toISOString(),
    usuario: ctx.perfil.correo,
  });
}

// Firma de recibido (opcional): imagen PNG pequeña en la misma subcolección, con id propio (firma-<fecha>)
// para no reemplazar la firma de un intento anterior (por ejemplo, si la visita se reprogramó).
export function agregarFirmaALote(lote, visitaId, firma, ctx) {
  if (!firma?.datos || firma.datos.length > TAMANO_MAXIMO) throw new Error("La firma no es válida.");
  lote.set(doc(db, COLECCIONES.VISITAS, visitaId, "fotos", firma.id), {
    datos: firma.datos, nombreFirmante: firma.nombre, tipo: "firma",
    fechaHora: new Date().toISOString(), usuario: ctx.perfil.correo,
  });
}

export async function obtenerArchivoVisita(visitaId, id) {
  const snap = await getDoc(doc(db, COLECCIONES.VISITAS, visitaId, "fotos", id));
  return snap.exists() ? snap.data() : null;
}

export async function obtenerFoto(visitaId) {
  const snap = await getDoc(refFoto(visitaId));
  return snap.exists() ? snap.data() : null;
}

// ---------- Foto de fachada del cliente (clientes/{id}/fotos/fachada) ----------
// Una sola foto por cliente; tomar otra la reemplaza. Va aparte del cliente para no descargarla al cargar la base.
const refFachada = (clienteId) => doc(db, COLECCIONES.CLIENTES, clienteId, "fotos", "fachada");

export async function guardarFotoFachada(clienteId, foto, ctx) {
  if (foto.datos.length > TAMANO_MAXIMO) throw new Error("La foto supera el tamaño permitido.");
  const escritura = setDoc(refFachada(clienteId), {
    datos: foto.datos, ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes,
    fechaHora: new Date().toISOString(), usuario: ctx.perfil.correo, nombre: ctx.perfil.nombre,
  });
  escritura.catch((err) => console.error("Error al sincronizar la foto de fachada:", err));
  // Sin señal, Firestore la guarda en el dispositivo y la envía después: no se deja la pantalla esperando.
  if (!navigator.onLine) return "pendiente";
  return Promise.race([escritura.then(() => "ok"), new Promise((r) => setTimeout(() => r("pendiente"), 8000))]);
}

export async function obtenerFotoFachada(clienteId) {
  const snap = await getDoc(refFachada(clienteId));
  return snap.exists() ? snap.data() : null;
}
