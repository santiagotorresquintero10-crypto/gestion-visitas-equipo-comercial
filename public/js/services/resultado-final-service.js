// Perfil permanente del cliente (especie, compra, sedes, días en CG, facturación y canal). Se diligencia en el
// Primer acercamiento y queda en un único documento (clientes/{codigo}/perfil/resultadoFinal). Los cambios
// posteriores que reporten los coordinadores van a actualizacionesCliente y no lo sobrescriben.
import { db, doc, getDoc, setDoc, serverTimestamp, increment } from "../firebase.js";
import {
  COLECCIONES, COMPRA_GANADO, TIPOS_BENEFICIO, DIAS_BENEFICIO, FACTURADORES, CORTES_CANAL,
} from "../constants.js";

const ID_DOCUMENTO = "resultadoFinal";
const ESPERA_CONFIRMACION_MS = 8000;
const claves = (lista) => lista.map((x) => x.clave);

const ref = (clienteId) => doc(db, COLECCIONES.CLIENTES, clienteId, COLECCIONES.PERFIL_CLIENTE, ID_DOCUMENTO);

export async function obtenerResultadoFinal(clienteId) {
  const snap = await getDoc(ref(clienteId));
  return snap.exists() ? snap.data() : null;
}

// Deja solo valores válidos y en el orden del catálogo (así los filtros futuros son confiables).
export function normalizarResultadoFinal(d) {
  const solo = (valores, lista) => claves(lista).filter((k) => (valores || []).includes(k));
  const otrasSedes = d.otrasSedes === true ? true : d.otrasSedes === false ? false : null;
  const sedes = otrasSedes
    ? (d.sedes || []).map((s) => ({ nombre: String(s.nombre || "").trim().slice(0, 120), ciudad: String(s.ciudad || "").trim().slice(0, 80) }))
        .filter((s) => s.nombre || s.ciudad)
    : [];
  const diasBeneficio = solo(d.diasBeneficio, DIAS_BENEFICIO);
  const corte = claves(CORTES_CANAL).includes(d.preferenciaCanal) ? d.preferenciaCanal : null;
  const hora = (h) => (/^\d{2}:\d{2}$/.test(h || "") ? h : "");
  return {
    otrasSedes,
    sedes,
    compraGanado: solo(d.compraGanado, COMPRA_GANADO),
    tipoBeneficio: claves(TIPOS_BENEFICIO).includes(d.tipoBeneficio) ? d.tipoBeneficio : null,
    diasBeneficio,
    totalDiasBeneficio: diasBeneficio.length,
    horaIngreso: hora(d.horaIngreso),
    horaSalida: hora(d.horaSalida),
    facturacion: solo(d.facturacion, FACTURADORES),
    preferenciaCanal: corte,
    preferenciaCanalOtro: corte === "OTRO" ? String(d.preferenciaCanalOtro || "").trim().slice(0, 120) : "",
    observaciones: String(d.observaciones || "").trim().slice(0, 2000),
  };
}

// Crea o actualiza el documento (merge). Sin señal queda guardado en el dispositivo: devuelve "pendiente".
// opciones:
//   conservarVacios: no sobrescribe con vacío lo que ya está guardado (lo usan las visitas).
//   sinSedes: no toca otrasSedes/sedes (la edición desde la ficha no las muestra).
//   origen: "VISITA" (primer acercamiento) o "FICHA" (edición directa del administrador).
export async function guardarResultadoFinal(ctx, clienteId, datos, { nuevo, conservarVacios = false, sinSedes = false, origen = "VISITA" } = {}) {
  const limpio = normalizarResultadoFinal(datos);
  if (!nuevo && conservarVacios) {
    const vacio = (x) => x == null || x === "" || (Array.isArray(x) && !x.length);
    for (const k of Object.keys(limpio)) if (vacio(limpio[k])) delete limpio[k];
    if ("diasBeneficio" in limpio === false) delete limpio.totalDiasBeneficio;
    if ("preferenciaCanal" in limpio === false) delete limpio.preferenciaCanalOtro;
    else limpio.preferenciaCanalOtro = normalizarResultadoFinal(datos).preferenciaCanalOtro;
  }
  if (sinSedes && !nuevo) { delete limpio.otrasSedes; delete limpio.sedes; }
  limpio.ultimaEdicionOrigen = origen;
  // El horario habitual ya no se pregunta: se conserva lo que hubiera y solo se inicializa al crear.
  delete limpio.horaIngreso;
  delete limpio.horaSalida;
  if (nuevo) Object.assign(limpio, { horaIngreso: "", horaSalida: "" });
  const escritura = setDoc(ref(clienteId), {
    ...limpio,
    clienteId,
    actualizadoPor: ctx.perfil.correo,
    actualizadoNombre: ctx.perfil.nombre,
    actualizadoEn: serverTimestamp(),
    ediciones: increment(1),
    ...(nuevo ? { creadoPor: ctx.perfil.correo, creadoNombre: ctx.perfil.nombre, creadoEn: serverTimestamp() } : {}),
  }, { merge: true });
  escritura.catch((err) => console.error("Error al sincronizar el resultado final:", err));
  if (!navigator.onLine) return "pendiente";
  return Promise.race([
    escritura.then(() => "ok"),
    new Promise((res) => setTimeout(() => res("pendiente"), ESPERA_CONFIRMACION_MS)),
  ]);
}

// ---------- Textos para mostrar ----------

export function textoDias(dias = []) {
  return dias.map((k) => DIAS_BENEFICIO.find((d) => d.clave === k)?.texto).filter(Boolean).join(" · ");
}
