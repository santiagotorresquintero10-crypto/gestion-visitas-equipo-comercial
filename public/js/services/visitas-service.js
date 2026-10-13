// Visitas: creación, consulta y cambios de estado. El acceso real lo limitan las reglas
// (el coordinador solo ve y modifica las suyas). Ningún cambio borra información: todo queda en `historial`.
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit,
  serverTimestamp, arrayUnion, increment,
} from "../firebase.js";
import { COLECCIONES, ESTADOS_VISITA, HISTORIAL_COMPARTIDO, TIPO_VISITA, TIPO_PROSPECTO, DESTINATARIO, TIPOS_BENEFICIO, tipoDeVisita } from "../constants.js";
import { normalizarTexto } from "./excel-clientes.js";
import { agregarFotoALote, agregarFirmaALote } from "./fotos-service.js";
import { hoyISO } from "../utils/fechas.js";

const { PROGRAMADA, REPROGRAMADA, PENDIENTE, FINALIZADA } = ESTADOS_VISITA;
const LIMITE_ADMIN_SIN_FECHA = 500;
const ESPERA_CONFIRMACION_MS = 8000;

// Sin señal, Firestore guarda el cambio en el dispositivo y lo envía al recuperar conexión, pero la promesa
// no se resuelve hasta entonces. Para no dejar la pantalla esperando, tras unos segundos se informa "pendiente".
async function escribir(promesa) {
  promesa.catch((err) => console.error("Error al sincronizar:", err));
  if (!navigator.onLine) return "pendiente";
  return Promise.race([
    promesa.then(() => "ok"),
    new Promise((res) => setTimeout(() => res("pendiente"), ESPERA_CONFIRMACION_MS)),
  ]);
}

const refVisita = (id) => doc(db, COLECCIONES.VISITAS, id);
const entradaHistorial = (ctx, datos) => ({
  ...datos, usuario: ctx.perfil.correo, nombre: ctx.perfil.nombre, fechaHora: new Date().toISOString(),
});

// ---------- Reglas de negocio ----------

export const sinResultado = (v) => v.estado === PROGRAMADA || v.estado === REPROGRAMADA;
export const puedeRegistrar = (v) => sinResultado(v) || v.estado === PENDIENTE;
export const puedeReprogramar = puedeRegistrar;
export const puedeEditar = sinResultado;

// Borrar (visita agendada por error): solo si no se ha iniciado ni tiene resultado. La borra el responsable de la
// visita (cada coordinador solo ve las suyas) o el administrador.
export const puedeEliminar = (ctx, v) => sinResultado(v) && !v.inicioVisita && !v.resultado
  && (ctx.esAdmin || v.coordinadorUid === ctx.perfil.uid);

export async function eliminarVisita(ctx, v) {
  if (!puedeEliminar(ctx, v)) throw new Error("Esta visita ya se inició o no la puedes eliminar.");
  return escribir(deleteDoc(refVisita(v.id)));
}

// Visita en curso: se presionó "Iniciar visita" y aún no se ha finalizado.
export const visitaEnCurso = (v) => !!v.inicioVisita && sinResultado(v);

// Minutos entre dos fechas ISO (null si falta alguna o el orden no tiene sentido).
export function duracionMinutos(inicio, fin) {
  if (!inicio || !fin) return null;
  const min = Math.round((new Date(fin) - new Date(inicio)) / 60000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}
export function textoDuracion(min) {
  if (min == null) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Estado que se muestra: una visita sin resultado con fecha pasada aparece como "Vencida".
export function estadoVisible(v, hoy = hoyISO()) {
  return sinResultado(v) && v.fechaProgramada < hoy ? "VENCIDA" : v.estado;
}

// Sedes de un cliente: sus marcas agrupadas por dirección (un cliente puede tener expendios en varias direcciones).
export function sedesDeCliente(cliente) {
  const marcas = cliente.marcas?.length ? cliente.marcas : [cliente];
  const sedes = new Map();
  for (const m of marcas) {
    const clave = normalizarTexto(`${m.direccion}|${m.ciudad}`);
    if (!sedes.has(clave)) {
      sedes.set(clave, {
        clave,
        direccion: m.direccion || "", ciudad: m.ciudad || "", barrio: m.barrio || "", zona: m.zona || "",
        expendio: m.expendio || "", responsable: m.responsable || "", celular: m.celular || "", telefono: m.telefono || "",
        estrato: m.estrato || "", correo: m.correo || "",
        marcas: [],
      });
    }
    if (m.marca) sedes.get(clave).marcas.push(m.marca);
  }
  return [...sedes.values()];
}

function datosSede(cliente, sede) {
  return {
    expendio: sede.expendio || cliente.expendio || "",
    marcas: sede.marcas.length ? sede.marcas : (cliente.marcas || []).map((m) => m.marca).filter(Boolean),
    sede: {
      direccion: sede.direccion, ciudad: sede.ciudad, barrio: sede.barrio,
      responsable: sede.responsable, celular: sede.celular,
    },
    ciudad: sede.ciudad || cliente.ciudad || "",
    zona: sede.zona || cliente.zona || "",
  };
}

// ---------- Consultas ----------

// Admin: consulta por rango de fechas. Coordinador: sus visitas (las reglas exigen filtrar por su uid).
export async function listarVisitas(ctx, { desde = null, hasta = null } = {}) {
  const ref = collection(db, COLECCIONES.VISITAS);
  if (ctx.esAdmin) {
    const condiciones = [];
    if (desde) condiciones.push(where("fechaProgramada", ">=", desde));
    if (hasta) condiciones.push(where("fechaProgramada", "<=", hasta));
    const q = query(ref, ...condiciones, orderBy("fechaProgramada", "desc"),
      ...(desde || hasta ? [] : [limit(LIMITE_ADMIN_SIN_FECHA)]));
    return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const propias = where("coordinadorUid", "==", ctx.perfil.uid);
  const dentro = (v) => (!desde || v.fechaProgramada >= desde) && (!hasta || v.fechaProgramada <= hasta);
  if ((desde || hasta) && indiceCoordinador !== false) {
    // Solo trae el periodo pedido (requiere el índice compuesto coordinadorUid + fechaProgramada).
    const rango = [];
    if (desde) rango.push(where("fechaProgramada", ">=", desde));
    if (hasta) rango.push(where("fechaProgramada", "<=", hasta));
    try {
      const snap = await getDocs(query(ref, propias, ...rango));
      indiceCoordinador = true;
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      if (err?.code !== "failed-precondition") throw err;
      indiceCoordinador = false;
      console.warn("Falta el índice compuesto de visitas (coordinadorUid + fechaProgramada). Créalo con el enlace:", err.message);
    }
  }
  return (await getDocs(query(ref, propias))).docs.map((d) => ({ id: d.id, ...d.data() })).filter(dentro);
}

// null: aún no se sabe si existe el índice; false: no existe y se usa la consulta completa en esta sesión.
let indiceCoordinador = null;

// Historial de un cliente. El coordinador solo consulta sus visitas salvo que el historial sea compartido.
export async function listarVisitasCliente(ctx, clienteId) {
  const condiciones = [where("clienteId", "==", clienteId)];
  if (!ctx.esAdmin && !HISTORIAL_COMPARTIDO) condiciones.push(where("coordinadorUid", "==", ctx.perfil.uid));
  const snap = await getDocs(query(collection(db, COLECCIONES.VISITAS), ...condiciones));
  return ordenarVisitas(snap.docs.map((d) => ({ id: d.id, ...d.data() })), true);
}

export async function obtenerVisita(id) {
  const snap = await getDoc(refVisita(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function ordenarVisitas(lista, descendente = false) {
  const signo = descendente ? -1 : 1;
  return [...lista].sort((a, b) =>
    signo * (a.fechaProgramada.localeCompare(b.fechaProgramada) || (a.horaProgramada || "").localeCompare(b.horaProgramada || "")));
}

// ---------- Cambios ----------

// Guarda una visita PROGRAMADA. Copia los datos del cliente para mostrar listas sin consultas extra;
// la relación real es clienteId (el CODIGO), que no cambia aunque cambien nombre o marcas.
export async function crearVisita(ctx, { cliente, sede, coordinador, fecha, hora, tipoVisita, observacion }) {
  const tipo = TIPO_VISITA[tipoVisita];
  if (!tipo) throw new Error("Selecciona el tipo de visita.");
  const ref = doc(collection(db, COLECCIONES.VISITAS));
  const visita = {
    clienteId: cliente.id,
    codigo: cliente.codigo,
    razonSocial: cliente.razonSocial || "",
    ...datosSede(cliente, sede),
    coordinadorUid: coordinador.uid,
    coordinadorNombre: coordinador.nombre,
    fechaProgramada: fecha,
    horaProgramada: hora,
    fechaOriginal: fecha,
    horaOriginal: hora,
    tipoVisita: tipo.clave,
    motivo: tipo.texto,
    observacionPrevia: (observacion || "").trim(),
    estado: PROGRAMADA,
    vecesReprogramada: 0,
    historial: [entradaHistorial(ctx, { accion: PROGRAMADA, fecha, hora })],
    creadoPorUid: ctx.perfil.uid,
    creadoPorNombre: ctx.perfil.nombre,
    fechaCreacion: serverTimestamp(),
  };
  const estado = await escribir(setDoc(ref, visita));
  return { id: ref.id, ...visita, estadoEscritura: estado };
}

// ---------- Prospectos (posibles clientes, sin código ni registro en la base) ----------
export function normalizarProspecto(p = {}) {
  const num = (x) => {
    const t = String(x ?? "").trim();
    const n = Number(t.replace(/[^\d]/g, ""));
    return t === "" || !Number.isFinite(n) ? null : n;
  };
  const tipoCliente = TIPOS_BENEFICIO.some((t) => t.clave === p.tipoCliente) ? p.tipoCliente : null;
  // Cantidad por especie según el tipo: Bovino → bovinos; Porcino → porcinos; Ambos → las dos.
  const bov = tipoCliente === "BOVINO" || tipoCliente === "AMBOS" ? num(p.cantidadSemanalBovinos) : null;
  const por = tipoCliente === "PORCINO" || tipoCliente === "AMBOS" ? num(p.cantidadSemanalPorcinos) : null;
  return {
    nombre: String(p.nombre || "").replace(/\s+/g, " ").trim().slice(0, 160),
    telefono: String(p.telefono || "").trim().slice(0, 40),
    tipoCliente,
    cantidadSemanalBovinos: bov,
    cantidadSemanalPorcinos: por,
    // Total (compatibilidad con los prospectos registrados antes de separar por especie).
    cantidadSemanal: bov == null && por == null ? num(p.cantidadSemanal) : (bov || 0) + (por || 0),
    temasTratados: String(p.temasTratados || "").trim().slice(0, 2000),
    interesado: p.interesado === true ? true : p.interesado === false ? false : null,
  };
}

// Autorización de tratamiento de datos personales (Habeas Data), respondida al iniciar la visita.
// Se guarda de inmediato con fecha y hora; si se cambia, queda cada respuesta en el historial.
export async function registrarAutorizacionDatos(ctx, v, autoriza) {
  if (typeof autoriza !== "boolean") throw new Error("Respuesta no válida.");
  const fechaHora = new Date().toISOString();
  return escribir(updateDoc(refVisita(v.id), {
    autorizacionDatos: autoriza,
    autorizacionDatosFecha: fechaHora,
    autorizacionDatosRegistradaEn: serverTimestamp(),
    autorizacionDatosPor: ctx.perfil.correo,
    historial: arrayUnion(entradaHistorial(ctx, { accion: "AUTORIZACION_DATOS", autoriza })),
    fechaActualizacion: serverTimestamp(),
  }));
}

// Programa una visita a prospecto. Usa la misma colección y los mismos campos de una visita normal;
// clienteId queda en null y los datos del prospecto van en `prospecto`.
export async function crearVisitaProspecto(ctx, { prospecto, coordinador, fecha, hora, observacion }) {
  const p = normalizarProspecto(prospecto);
  if (!p.nombre) throw new Error("Escribe el nombre del prospecto.");
  const ref = doc(collection(db, COLECCIONES.VISITAS));
  const visita = {
    tipoDestinatario: DESTINATARIO.PROSPECTO,
    clienteId: null,
    codigo: "",
    razonSocial: p.nombre,
    expendio: "",
    marcas: [],
    sede: { direccion: "", ciudad: "", barrio: "", responsable: p.nombre, celular: p.telefono },
    ciudad: "",
    zona: "",
    prospecto: p,
    coordinadorUid: coordinador.uid,
    coordinadorNombre: coordinador.nombre,
    fechaProgramada: fecha,
    horaProgramada: hora,
    fechaOriginal: fecha,
    horaOriginal: hora,
    tipoVisita: TIPO_PROSPECTO.clave,
    motivo: TIPO_PROSPECTO.texto,
    observacionPrevia: (observacion || "").trim(),
    estado: PROGRAMADA,
    vecesReprogramada: 0,
    historial: [entradaHistorial(ctx, { accion: PROGRAMADA, fecha, hora })],
    creadoPorUid: ctx.perfil.uid,
    creadoPorNombre: ctx.perfil.nombre,
    fechaCreacion: serverTimestamp(),
  };
  const estado = await escribir(setDoc(ref, visita));
  return { id: ref.id, ...visita, estadoEscritura: estado };
}

// Editar antes del resultado: hora, motivo, observación previa, sede y (admin) responsable. La fecha se reprograma.
export async function editarVisita(ctx, v, { cliente, sede, hora, tipoVisita, observacionPrevia, coordinador }) {
  const cambios = {};
  if (hora !== v.horaProgramada) cambios.horaProgramada = hora;
  const tipo = TIPO_VISITA[tipoVisita];
  if (tipo && (tipo.clave !== v.tipoVisita || tipo.texto !== v.motivo)) {
    cambios.tipoVisita = tipo.clave;
    cambios.motivo = tipo.texto;
  }
  if ((observacionPrevia || "").trim() !== (v.observacionPrevia || "")) cambios.observacionPrevia = (observacionPrevia || "").trim();
  if (sede && cliente) {
    const nueva = datosSede(cliente, sede);
    if (nueva.sede.direccion !== v.sede?.direccion || nueva.sede.ciudad !== v.sede?.ciudad) Object.assign(cambios, nueva);
  }
  if (coordinador && coordinador.uid !== v.coordinadorUid) {
    cambios.coordinadorUid = coordinador.uid;
    cambios.coordinadorNombre = coordinador.nombre;
  }
  const campos = Object.keys(cambios).filter((k) => !["marcas", "ciudad", "zona", "expendio", "tipoVisita"].includes(k));
  if (!campos.length) return "sin-cambios";

  return escribir(updateDoc(refVisita(v.id), {
    ...cambios,
    historial: arrayUnion(entradaHistorial(ctx, {
      accion: "EDITADA",
      campos: campos.map((c) => ({ horaProgramada: "Hora", motivo: "Tipo de visita", observacionPrevia: "Observación previa",
        sede: "Sede", coordinadorUid: "Responsable", coordinadorNombre: null }[c])).filter(Boolean),
    })),
    fechaActualizacion: serverTimestamp(),
  }));
}

// Si la visita ya se había iniciado, el intento queda en el historial (inicio y fin) y la nueva cita empieza en cero.
export async function reprogramarVisita(ctx, v, { fecha, hora, motivo, novedades = [], observaciones = "", prospecto = null, firma = null }) {
  const intento = v.inicioVisita
    ? { inicioVisita: v.inicioVisita, finVisita: v.finVisita || new Date().toISOString() } : {};
  const lote = writeBatch(db);
  if (firma) agregarFirmaALote(lote, v.id, firma, ctx);
  lote.update(refVisita(v.id), {
    estado: REPROGRAMADA,
    ...(prospecto ? { prospecto: normalizarProspecto(prospecto) } : {}),
    ...(intento.inicioVisita ? { inicioVisita: null, finVisita: null } : {}),
    fechaProgramada: fecha,
    horaProgramada: hora,
    vecesReprogramada: increment(1),
    ultimaReprogramacion: { fechaAnterior: v.fechaProgramada, horaAnterior: v.horaProgramada, motivo },
    historial: arrayUnion(entradaHistorial(ctx, {
      accion: REPROGRAMADA, fechaAnterior: v.fechaProgramada, horaAnterior: v.horaProgramada,
      fecha, hora, motivo, novedades, observaciones: observaciones.trim(), ...intento,
      ...(firma ? { firmaNombre: firma.nombre, firmaId: firma.id } : {}),
    })),
    fechaActualizacion: serverTimestamp(),
  });
  return escribir(lote.commit());
}

// "Iniciar visita": guarda la hora real de inicio una sola vez (si ya existe, no se toca).
export async function iniciarVisita(ctx, v) {
  if (v.inicioVisita) return { estado: "ya-iniciada", inicioVisita: v.inicioVisita };
  const inicioVisita = new Date().toISOString();
  const estado = await escribir(updateDoc(refVisita(v.id), {
    inicioVisita,
    inicioRegistradoEn: serverTimestamp(),
    historial: arrayUnion(entradaHistorial(ctx, { accion: "INICIADA" })),
    fechaActualizacion: serverTimestamp(),
  }));
  return { estado, inicioVisita };
}

// Resultado FINALIZADA o PENDIENTE, con novedades, observaciones, ubicación y foto opcionales.
// La hora de finalización se toma al presionar "Finalizar visita". Si la visita ya tenía una hora de fin
// (por ejemplo, un pendiente que se cierra después), se conserva la primera y se guarda el cierre aparte.
export async function registrarResultado(ctx, v, {
  estado, novedades, observaciones, ubicacion, foto, tipoEvidencia = "", temasTratados = "", pqrs = "", pendiente = "",
  prospecto = null, firma = null,
}) {
  if (![FINALIZADA, PENDIENTE].includes(estado)) throw new Error("Resultado no válido.");
  const ahora = new Date().toISOString();
  const inicio = v.inicioVisita || v.resultado?.inicioVisita || null;
  const fin = v.finVisita || ahora;
  const resultado = {
    estado,
    tipoVisita: tipoDeVisita(v),
    novedades,
    observaciones: (observaciones || "").trim(),
    temasTratados: (temasTratados || "").trim(),
    pqrs: (pqrs || "").trim(),
    pendiente: estado === PENDIENTE ? (pendiente || "").trim() : "",
    ubicacion: ubicacion || null,
    tieneFoto: !!foto,
    tipoEvidencia: foto ? tipoEvidencia || "Fotografía" : "",
    firma: firma ? { nombre: firma.nombre, id: firma.id } : null,
    autorizacionDatos: typeof v.autorizacionDatos === "boolean" ? v.autorizacionDatos : null,
    inicioVisita: inicio,
    finVisita: fin,
    duracionMin: duracionMinutos(inicio, fin),
    fechaHora: ahora,
    usuario: ctx.perfil.correo,
    nombre: ctx.perfil.nombre,
  };
  const lote = writeBatch(db);
  lote.update(refVisita(v.id), {
    estado,
    resultado,
    finVisita: fin,
    ...(v.finVisita ? { cierreFinal: ahora } : {}),
    ...(prospecto ? { prospecto: normalizarProspecto(prospecto) } : {}),
    duracionMin: resultado.duracionMin,
    fechaResultado: serverTimestamp(),
    historial: arrayUnion(entradaHistorial(ctx, {
      accion: estado, novedades, observaciones: resultado.observaciones, pendiente: resultado.pendiente,
      conUbicacion: !!ubicacion, conFoto: !!foto, duracionMin: resultado.duracionMin,
      ...(firma ? { firmaNombre: firma.nombre, firmaId: firma.id } : {}),
    })),
    fechaActualizacion: serverTimestamp(),
  });
  if (foto) agregarFotoALote(lote, v.id, foto, ctx);
  if (firma) agregarFirmaALote(lote, v.id, firma, ctx);
  return escribir(lote.commit());
}
