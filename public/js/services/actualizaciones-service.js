// Actualizaciones del cliente: lo que un coordinador reporta que cambió (nueva sede, dirección, teléfono…).
// Cada cambio es un documento en actualizacionesCliente con el valor anterior y el nuevo. NUNCA modifica la ficha
// ni el perfil del cliente: queda "reportada" hasta que el administrador la revise y la aplique en la base maestra.
import {
  db, collection, doc, getDocs, query, where, updateDoc, writeBatch, serverTimestamp,
} from "../firebase.js";
import { COLECCIONES, ESTADOS_ACTUALIZACION, TIPO_ACTUALIZACION } from "../constants.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const { REPORTADA, REVISADA, APLICADA } = ESTADOS_ACTUALIZACION;
const ESPERA_CONFIRMACION_MS = 8000;
const MAX_TEXTO = 1000;

async function escribir(promesa) {
  promesa.catch((err) => console.error("Error al sincronizar la actualización:", err));
  if (!navigator.onLine) return "pendiente";
  return Promise.race([
    promesa.then(() => "ok"),
    new Promise((res) => setTimeout(() => res("pendiente"), ESPERA_CONFIRMACION_MS)),
  ]);
}

const texto = (t, max = MAX_TEXTO) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const limpiarMapa = (m = {}) => Object.fromEntries(Object.entries(m)
  .map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => texto(x, 120)).filter(Boolean).slice(0, 20) : texto(v, 300)])
  .filter(([, v]) => (Array.isArray(v) ? v.length : v)));

// Pendiente = aún no aplicada en la base maestra.
export const actualizacionPendiente = (a) => a.estado !== APLICADA;

// cambios: [{ tipo, campo, anterior, nuevo, detalle }] (anterior/nuevo son textos para mostrar; detalle, los campos).
// Todos los cambios de un mismo envío comparten `lote` para poder verlos juntos.
export async function reportarActualizaciones(ctx, { cliente, visitaId = null, cambios, observacion }) {
  if (!cambios?.length) throw new Error("Selecciona qué información cambió.");
  const lote = writeBatch(db);
  const idLote = doc(collection(db, COLECCIONES.ACTUALIZACIONES)).id;
  const ahora = new Date().toISOString();
  const creados = cambios.map((c) => {
    const tipo = TIPO_ACTUALIZACION[c.tipo];
    if (!tipo) throw new Error("Tipo de actualización no válido.");
    const ref = doc(collection(db, COLECCIONES.ACTUALIZACIONES));
    const datos = {
      clienteId: cliente.id,
      codigo: cliente.codigo || cliente.id,
      clienteNombre: texto(nombreCliente(cliente), 160),
      visitaId: visitaId || null,
      lote: idLote,
      tipoActualizacion: tipo.clave,
      tipoTexto: tipo.texto,
      campoAfectado: texto(c.campo || tipo.texto, 120),
      valorAnterior: texto(c.anterior),
      valorNuevo: texto(c.nuevo),
      detalle: limpiarMapa(c.detalle),
      observacion: texto(observacion, 2000),
      estado: REPORTADA,
      reportadoPorUid: ctx.perfil.uid,
      reportadoPor: ctx.perfil.correo,
      reportadoNombre: ctx.perfil.nombre,
      fechaReporte: serverTimestamp(),
      fechaReporteLocal: ahora,
    };
    lote.set(ref, datos);
    return { id: ref.id, ...datos, fechaReporte: null };
  });
  const estado = await escribir(lote.commit());
  return { estado, creados };
}

export async function listarActualizacionesCliente(clienteId) {
  const snap = await getDocs(query(collection(db, COLECCIONES.ACTUALIZACIONES), where("clienteId", "==", clienteId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.fechaReporteLocal || "").localeCompare(a.fechaReporteLocal || ""));
}

// Solo administrador (lo exigen las reglas): Revisada → ya se validó; Aplicada → ya está en la base maestra.
export async function cambiarEstadoActualizacion(ctx, a, estado) {
  if (![REVISADA, APLICADA, REPORTADA].includes(estado)) throw new Error("Estado no válido.");
  const cambios = { estado };
  if (estado === REVISADA) Object.assign(cambios, { revisadoPor: ctx.perfil.correo, revisadoNombre: ctx.perfil.nombre, revisadoEn: serverTimestamp() });
  if (estado === APLICADA) Object.assign(cambios, { aplicadoPor: ctx.perfil.correo, aplicadoNombre: ctx.perfil.nombre, aplicadoEn: serverTimestamp() });
  return escribir(updateDoc(doc(db, COLECCIONES.ACTUALIZACIONES, a.id), cambios));
}
