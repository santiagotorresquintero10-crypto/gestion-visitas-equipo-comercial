// Acceso a la base de clientes en Firestore: carga en memoria, búsqueda e importación desde Excel.
import {
  db, collection, doc, getDoc, getDocs, getDocFromCache, getDocsFromCache, setDoc, writeBatch, addDoc, query, orderBy,
  limit, serverTimestamp,
} from "../firebase.js";
import { COLECCIONES } from "../constants.js";
import { procesarFilas, compararConBase, normalizarTexto, textoBusqueda } from "./excel-clientes.js";

const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const TAMANO_LOTE = 400; // Firestore admite hasta 500 escrituras por lote

const CLAVE_VERSION = "cv-clientes-version";
let cache = null; // { lista, porId }
let puedeMarcarVersion = false; // solo el administrador escribe config/clientes

// El administrador crea la marca de versión si aún no existe (bases importadas antes de esta optimización).
export function configurarClientes({ esAdmin }) {
  puedeMarcarVersion = !!esAdmin;
}

const refVersion = () => doc(db, COLECCIONES.CONFIG, "clientes");
const leerVersionLocal = () => { try { return localStorage.getItem(CLAVE_VERSION); } catch { return null; } };
const guardarVersionLocal = (v) => { try { localStorage.setItem(CLAVE_VERSION, String(v)); } catch { /* sin almacenamiento local */ } };

async function leerVersion() {
  try {
    const snap = await getDoc(refVersion());
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    // Sin señal: se usa la última versión conocida en este dispositivo.
    try {
      const snap = await getDocFromCache(refVersion());
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  }
}

// La base de clientes solo cambia cuando el administrador importa un Excel; cada importación cambia la versión
// en config/clientes. Si este dispositivo ya tiene esa versión guardada, la lista se toma de la caché local de
// Firestore (0 lecturas facturables) en vez de volver a leer los ~900 documentos.
export async function obtenerClientes({ forzar = false } = {}) {
  if (cache && !forzar) return cache.lista;
  const meta = await leerVersion();
  let docs = null;
  if (!forzar && meta && String(meta.version) === leerVersionLocal()) {
    try {
      const snap = await getDocsFromCache(collection(db, COLECCIONES.CLIENTES));
      if (snap.size >= (meta.total || 1)) docs = snap.docs;
    } catch { /* caché no disponible: se lee del servidor */ }
  }
  if (!docs) {
    const snap = await getDocs(collection(db, COLECCIONES.CLIENTES));
    docs = snap.docs;
    if (meta) guardarVersionLocal(meta.version);
    else if (puedeMarcarVersion && docs.length) {
      const version = Date.now();
      setDoc(refVersion(), { version, total: docs.length, actualizadoEn: serverTimestamp() })
        .then(() => guardarVersionLocal(version))
        .catch((err) => console.warn("No se pudo crear la versión de clientes:", err));
    }
  }
  const lista = docs.map((d) => {
    const c = { id: d.id, ...d.data() };
    c._busqueda = textoBusqueda(c);
    return c;
  }).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  cache = { lista, porId: new Map(lista.map((c) => [c.id, c])) };
  return lista;
}

export async function obtenerCliente(id) {
  await obtenerClientes();
  return cache.porId.get(id) || null;
}

// Coincide si todas las palabras escritas aparecen en código, marca, expendio, razón social o ciudad.
export function buscarEn(lista, texto, { max = 20, incluirInactivos = false } = {}) {
  const terminos = normalizarTexto(texto).split(" ").filter(Boolean);
  const base = incluirInactivos ? lista : lista.filter((c) => c.activo !== false);
  if (!terminos.length) return base.slice(0, max);
  const q = terminos.join(" ");
  return base
    .filter((c) => terminos.every((t) => c._busqueda.includes(t)))
    .map((c) => {
      const cod = normalizarTexto(c.codigo);
      const marcas = (c.marcas || []).map((m) => normalizarTexto(m.marca));
      const rango = cod === q || marcas.includes(q) ? 0 : cod.startsWith(q) ? 1 : marcas.some((m) => m.startsWith(q)) ? 2 : 3;
      return { c, rango };
    })
    .sort((a, b) => a.rango - b.rango)
    .slice(0, max)
    .map((x) => x.c);
}

export async function buscarClientes(texto, opciones) {
  return buscarEn(await obtenerClientes(), texto, opciones);
}

// ---------- Importación ----------

async function leerExcel(archivo) {
  const XLSX = await import(SHEETJS_URL);
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  // Usa la primera hoja que tenga columna CODIGO.
  for (const nombre of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "", blankrows: true });
    const resultado = procesarFilas(filas);
    if (resultado.ok) return { ...resultado, hoja: nombre, hojas: libro.SheetNames };
  }
  return { ok: false, error: "Ninguna hoja del archivo tiene una columna CODIGO." };
}

// Lee el archivo y lo compara con la base actual. No escribe nada.
export async function analizarImportacion(archivo, onEtapa = () => {}) {
  onEtapa("leer");
  const lectura = await leerExcel(archivo);
  if (!lectura.ok) return lectura;
  onEtapa("analizar", lectura.registros.length);
  const existentes = new Map((await obtenerClientes({ forzar: true })).map((c) => [c.id, c]));
  onEtapa("comparar");
  await new Promise((r) => setTimeout(r, 0)); // deja pintar la etapa antes de comparar
  return { ...lectura, archivo: archivo.name, ...compararConBase(lectura.registros, existentes) };
}

// Escribe solo lo que cambió: nuevos, actualizados e inactivados. Nunca borra clientes.
export async function aplicarImportacion(analisis, perfil, onProgreso = () => {}) {
  const auditoria = {
    fechaUltimaActualizacion: serverTimestamp(),
    archivoOrigen: analisis.archivo,
    usuarioActualizacion: perfil.correo,
  };
  const operaciones = [
    ...analisis.nuevos.map((r) => (b) => b.set(doc(db, COLECCIONES.CLIENTES, r.id),
      { ...r.data, activo: true, fechaCreacion: serverTimestamp(), ...auditoria })),
    // merge: conserva coordenadas guardadas y meses de beneficio que ya no vengan en el archivo.
    ...analisis.actualizados.map((r) => (b) => b.set(doc(db, COLECCIONES.CLIENTES, r.id),
      { ...r.data, activo: true, ...auditoria }, { merge: true })),
    ...analisis.noAparecen.map((r) => (b) => b.update(doc(db, COLECCIONES.CLIENTES, r.id),
      { activo: false, fechaInactivacion: serverTimestamp(), ...auditoria })),
  ];

  for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    operaciones.slice(i, i + TAMANO_LOTE).forEach((op) => op(lote));
    await lote.commit();
    onProgreso(Math.min(i + TAMANO_LOTE, operaciones.length), operaciones.length);
  }

  await addDoc(collection(db, COLECCIONES.IMPORTACIONES), {
    fecha: serverTimestamp(),
    archivo: analisis.archivo,
    hoja: analisis.hoja,
    usuario: perfil.correo,
    registros: analisis.registros.length,
    filas: analisis.totalFilas,
    nuevos: analisis.nuevos.length,
    actualizados: analisis.actualizados.length,
    sinCambios: analisis.sinCambios.length,
    inactivados: analisis.noAparecen.length,
    errores: analisis.errores.length,
    meses: analisis.mapeo.meses.map((m) => m.clave),
  });
  // Nueva versión: los demás dispositivos vuelven a leer la base una vez.
  const total = analisis.registros.length + analisis.noAparecen.length;
  await setDoc(refVersion(), { version: Date.now(), total, actualizadoEn: serverTimestamp() });
  cache = null;
}

export async function ultimaImportacion() {
  const snap = await getDocs(query(collection(db, COLECCIONES.IMPORTACIONES), orderBy("fecha", "desc"), limit(1)));
  return snap.empty ? null : snap.docs[0].data();
}
