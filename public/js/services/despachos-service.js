// Despachos Bovinos: lectura del Excel, cruce de cada marca con su código en la base de clientes existente
// y guardado en Firestore. No crea clientes ni modifica la base de clientes, las visitas ni otros módulos.
//   despachosBovinos/{id}  → una marca (id estable por marca: reimportar actualiza, no duplica)
//   config/despachos       → resumen de la última importación
import {
  db, collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp,
} from "../firebase.js";
import { COLECCIONES } from "../constants.js";
import { normalizarEncabezado } from "./excel-clientes.js";

const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const TAMANO_LOTE = 400;

// Las 16 columnas del archivo, en su orden y con su nombre exacto.
export const COLUMNAS_DESPACHO = Object.freeze([
  "Marca", "FechaModificación", "Canales", "Pieles", "Entresijos", "Mondongos", "Librillos", "Cuajo", "Cabezas",
  "Despacho", "Viscerasrojas", "ENTRESIJOSDESTINOS", "MONDONGOSDESTINOS", "LIBRILLOSDESTINOS", "CUAJOSDESTINOS", "CABEZASDESTINOS",
]);
export const ESTADO_CRUCE = Object.freeze({ RELACIONADA: "RELACIONADA", SIN_RELACIONAR: "SIN_RELACIONAR", AMBIGUA: "AMBIGUA" });

const clave = (t) => normalizarEncabezado(t).replace(/_/g, "");
// Comparación de marcas: sin distinguir mayúsculas ni espacios sobrantes (el valor original se conserva).
export const normalizarMarca = (m) => String(m ?? "").replace(/\s+/g, " ").trim().toUpperCase();
// Id de documento estable por marca ("/" no es válido en Firestore).
const idMarca = (marcaNorm) => `M_${marcaNorm.replace(/\//g, "∕").replace(/\s/g, "_")}`.slice(0, 700);

// ---------- Fechas: serial de Excel o texto dd/mm/aaaa [hh:mm] → "aaaa-mm-ddThh:mm:ss" (hora local, sin zona) ----------
const pad = (n) => String(n).padStart(2, "0");
function fechaDesde(valor, XLSX) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const p = XLSX.SSF.parse_date_code(valor);
    if (p) return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.H)}:${pad(p.M)}:${pad(Math.floor(p.S))}`;
  }
  const t = String(valor ?? "").trim();
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}`;
  return "";
}
export function textoFecha(iso, original) {
  if (!iso) return original == null ? "" : String(original);
  const [f, h = "00:00:00"] = iso.split("T");
  const [a, me, d] = f.split("-");
  return `${d}/${me}/${a}${h.startsWith("00:00") ? "" : ` ${h.slice(0, 5)}`}`;
}

// ---------- 1. Leer y validar el archivo ----------
// Devuelve { ok, error, hoja, filas:[{fila, valores, marca, marcaNorm, fechaISO}], erroresFormulas, duplicadas, vacias }.
export async function leerExcelDespachos(archivo) {
  const XLSX = await import(SHEETJS_URL);
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellFormula: true, cellNF: true, sheetStubs: true });
  const esperadas = COLUMNAS_DESPACHO.map(clave);

  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "", blankrows: false });
    // Texto tal como lo muestra Excel (nombres, cantidades, fechas): es lo que se guarda y se muestra.
    const textos = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "", blankrows: false });
    const iEnc = filas.findIndex((f, i) => i < 20 && f.some((c) => clave(c) === "MARCA"));
    if (iEnc < 0) continue;

    const encabezado = filas[iEnc].map(clave);
    const indices = esperadas.map((k) => encabezado.indexOf(k));
    const faltantes = COLUMNAS_DESPACHO.filter((_, i) => indices[i] < 0);
    if (faltantes.length) {
      return { ok: false, error: `Al archivo le faltan estas columnas: ${faltantes.join(", ")}. Revisa que los encabezados tengan exactamente estos nombres.` };
    }

    // Fórmulas: se usa el resultado guardado; si hay errores (#N/A, #¡REF!…) o fórmulas sin resultado, no se importa.
    const erroresFormulas = [];
    const rango = XLSX.utils.decode_range(hoja["!ref"]);
    for (let r = iEnc + 1; r <= rango.e.r; r++) {
      for (let k = 0; k < indices.length; k++) {
        const celda = hoja[XLSX.utils.encode_cell({ r, c: indices[k] })];
        if (!celda) continue;
        if (celda.t === "e") erroresFormulas.push(`Fila ${r + 1}, ${COLUMNAS_DESPACHO[k]}: ${celda.w || "error de fórmula"}`);
        else if (celda.f && (celda.v === undefined || celda.t === "z")) erroresFormulas.push(`Fila ${r + 1}, ${COLUMNAS_DESPACHO[k]}: fórmula sin resultado guardado`);
      }
    }
    if (erroresFormulas.length) {
      return { ok: false, error: "El archivo tiene fórmulas con error. Corrígelas en Excel, guarda y vuelve a subirlo.", erroresFormulas, hoja: nombre };
    }

    // Filas → registros; con marcas repetidas se conserva la de FechaModificación más reciente.
    const porMarca = new Map();
    let duplicadas = 0, vacias = 0;
    filas.slice(iEnc + 1).forEach((f, i) => {
      const t = textos[iEnc + 1 + i] || [];
      const valores = {};
      COLUMNAS_DESPACHO.forEach((col, k) => {
        const v = t[indices[k]];
        valores[col] = v == null ? "" : String(v).trim();
      });
      const marcaNorm = normalizarMarca(valores.Marca);
      if (!marcaNorm) { vacias++; return; }
      // La fecha real (serial o texto) solo se usa para elegir el registro más reciente si una marca se repite.
      const fechaISO = fechaDesde(f[indices[1]], XLSX) || fechaDesde(valores["FechaModificación"], XLSX);
      const registro = { fila: iEnc + i + 2, marca: String(valores.Marca).trim(), marcaNorm, fechaISO, valores };
      const previo = porMarca.get(marcaNorm);
      if (previo) {
        duplicadas++;
        if ((registro.fechaISO || "") >= (previo.fechaISO || "")) porMarca.set(marcaNorm, registro);
      } else porMarca.set(marcaNorm, registro);
    });
    if (!porMarca.size) return { ok: false, error: "El archivo no tiene filas con marca." };
    return { ok: true, hoja: nombre, filas: [...porMarca.values()], duplicadas, vacias, erroresFormulas: [] };
  }
  return { ok: false, error: "Ninguna hoja del archivo tiene la columna «Marca»." };
}

// ---------- 2. Cruzar cada marca con la base de clientes ----------
// Una marca relacionada pertenece a un solo código; si aparece en varios códigos es ambigua (no se asigna).
export function cruzarConClientes(lectura, clientes) {
  const indice = new Map(); // marcaNorm → Set(clienteId)
  for (const c of clientes) {
    for (const m of c.marcas || []) {
      const k = normalizarMarca(m.marca);
      if (!k) continue;
      if (!indice.has(k)) indice.set(k, new Set());
      indice.get(k).add(c.id);
    }
  }
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const registros = lectura.filas.map((r) => {
    const ids = [...(indice.get(r.marcaNorm) || [])];
    const estado = ids.length === 1 ? ESTADO_CRUCE.RELACIONADA : ids.length > 1 ? ESTADO_CRUCE.AMBIGUA : ESTADO_CRUCE.SIN_RELACIONAR;
    const cliente = ids.length === 1 ? porId.get(ids[0]) : null;
    return { ...r, estado, clienteId: cliente?.id || null, codigo: cliente?.codigo || "", codigosPosibles: ids.map((id) => porId.get(id)?.codigo || id) };
  });
  const cuenta = (e) => registros.filter((r) => r.estado === e).length;
  return {
    registros,
    relacionadas: cuenta(ESTADO_CRUCE.RELACIONADA),
    sinRelacionar: cuenta(ESTADO_CRUCE.SIN_RELACIONAR),
    ambiguas: cuenta(ESTADO_CRUCE.AMBIGUA),
    clientes: new Set(registros.filter((r) => r.clienteId).map((r) => r.clienteId)).size,
  };
}

// ---------- 3. Guardar (solo administrador; las reglas de Firestore lo exigen) ----------
// Reimportar: cada marca se actualiza en su mismo documento; las que ya no vengan quedan como no vigentes.
export async function aplicarDespachos(ctx, cruce, { archivo, duplicadas = 0 }, onProgreso = () => {}) {
  const ahora = new Date().toISOString();
  const importacion = `imp-${Date.now()}`;
  const nuevos = new Set();
  const ops = cruce.registros.map((r) => {
    const id = idMarca(r.marcaNorm);
    nuevos.add(id);
    return (b) => b.set(doc(db, COLECCIONES.DESPACHOS, id), {
      marca: r.marca,
      marcaNorm: r.marcaNorm,
      clienteId: r.clienteId,
      codigo: r.codigo,
      estadoCruce: r.estado,
      codigosPosibles: r.codigosPosibles,
      fechaModificacion: r.fechaISO || "",
      valores: r.valores,
      vigente: true,
      importacion,
      filaArchivo: r.fila,
      actualizadoEn: serverTimestamp(),
      actualizadoLocal: ahora,
      actualizadoPor: ctx.perfil.correo,
    });
  });
  const anteriores = await getDocs(query(collection(db, COLECCIONES.DESPACHOS), where("vigente", "==", true)));
  anteriores.docs.filter((d) => !nuevos.has(d.id)).forEach((d) => ops.push((b) => b.update(doc(db, COLECCIONES.DESPACHOS, d.id), {
    vigente: false, retiradoEn: serverTimestamp(), retiradoPor: ctx.perfil.correo,
  })));
  const retiradas = ops.length - cruce.registros.length;

  for (let i = 0; i < ops.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    ops.slice(i, i + TAMANO_LOTE).forEach((op) => op(lote));
    await lote.commit();
    onProgreso(Math.min(i + TAMANO_LOTE, ops.length), ops.length);
  }
  const resumen = {
    archivo: archivo || "", fecha: serverTimestamp(), fechaLocal: ahora, usuario: ctx.perfil.correo, usuarioNombre: ctx.perfil.nombre,
    total: cruce.registros.length, relacionadas: cruce.relacionadas, sinRelacionar: cruce.sinRelacionar, ambiguas: cruce.ambiguas,
    clientes: cruce.clientes, duplicadas, retiradas, importacion,
  };
  const lote = writeBatch(db);
  lote.set(doc(db, COLECCIONES.CONFIG, "despachos"), resumen);
  await lote.commit();
  return { ...resumen, fecha: null };
}

// ---------- Consultas ----------
export async function obtenerResumenDespachos() {
  const snap = await getDoc(doc(db, COLECCIONES.CONFIG, "despachos"));
  return snap.exists() ? snap.data() : null;
}

export async function listarDespachos() {
  const snap = await getDocs(query(collection(db, COLECCIONES.DESPACHOS), where("vigente", "==", true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.codigo || "~").localeCompare(String(b.codigo || "~"), "es", { numeric: true }) || a.marca.localeCompare(b.marca, "es", { numeric: true }));
}

// Marcas vigentes de un cliente (una fila por marca; no se suman ni combinan valores).
export async function listarDespachosCliente(clienteId) {
  const snap = await getDocs(query(collection(db, COLECCIONES.DESPACHOS), where("clienteId", "==", clienteId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.vigente)
    .sort((a, b) => a.marca.localeCompare(b.marca, "es", { numeric: true }));
}
