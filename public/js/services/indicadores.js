// Cálculo único de indicadores. Dashboard y Reportes usan SOLO estas funciones, así nunca muestran cifras distintas.
//
// Definiciones:
// - Agendadas: visitas cuya fecha programada (actual) cae en el periodo. Cada visita cuenta una sola vez,
//   aunque se haya reprogramado (la reprogramación mueve la fecha, no crea otra visita).
// - Finalizadas / Pendientes / Reprogramadas / Programadas: estado ACTUAL. Son excluyentes y suman Agendadas.
// - Vencidas: programadas o reprogramadas cuya fecha ya pasó sin resultado (subconjunto, no se suma aparte).
// - Realizadas: finalizadas + pendientes (en ambas la visita se hizo).
// - % cumplimiento: realizadas ÷ exigibles. Exigibles = visitas cuya fecha ya llegó (o que ya tienen resultado),
//   para que las visitas futuras del periodo no castiguen el indicador.
import { ESTADOS_VISITA } from "../constants.js";
import { aISO, deISO, sumarDias } from "../utils/fechas.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const { FINALIZADA, PENDIENTE, REPROGRAMADA, PROGRAMADA } = ESTADOS_VISITA;

// Orden fijo de los estados en gráficos y tablas (el color sigue al estado, nunca a su posición).
export const SERIES_ESTADO = Object.freeze([
  { clave: FINALIZADA, nombre: "Finalizadas", color: "#1f9d55" },
  { clave: PENDIENTE, nombre: "Pendientes", color: "#b8770c" },
  { clave: REPROGRAMADA, nombre: "Reprogramadas", color: "#c2468f" },
  { clave: PROGRAMADA, nombre: "Programadas", color: "#3b74d1" },
]);

const realizada = (v) => v.estado === FINALIZADA || v.estado === PENDIENTE;

export function resumen(visitas, hoy) {
  const r = {
    agendadas: visitas.length,
    [FINALIZADA]: 0, [PENDIENTE]: 0, [REPROGRAMADA]: 0, [PROGRAMADA]: 0,
    vencidas: 0, realizadas: 0, exigibles: 0, conReprogramacion: 0, cumplimiento: null,
  };
  for (const v of visitas) {
    if (r[v.estado] !== undefined) r[v.estado]++;
    const hecha = realizada(v);
    if (hecha) r.realizadas++;
    if (!hecha && (v.estado === PROGRAMADA || v.estado === REPROGRAMADA) && v.fechaProgramada < hoy) r.vencidas++;
    if (hecha || v.fechaProgramada <= hoy) r.exigibles++;
    if (v.vecesReprogramada > 0) r.conReprogramacion++;
  }
  r.cumplimiento = r.exigibles ? r.realizadas / r.exigibles : null;
  return r;
}

export function filtrarVisitas(visitas, { desde = null, hasta = null, coordinador = "", zona = "" } = {}) {
  return visitas.filter((v) =>
    (!desde || v.fechaProgramada >= desde) &&
    (!hasta || v.fechaProgramada <= hasta) &&
    (!coordinador || v.coordinadorUid === coordinador) &&
    (!zona || v.zona === zona));
}

// Gestión por responsable, ordenada por cantidad de visitas agendadas.
export function porResponsable(visitas, hoy) {
  const grupos = new Map();
  for (const v of visitas) {
    if (!grupos.has(v.coordinadorUid)) grupos.set(v.coordinadorUid, { uid: v.coordinadorUid, nombre: v.coordinadorNombre, visitas: [] });
    grupos.get(v.coordinadorUid).visitas.push(v);
  }
  return [...grupos.values()]
    .map((g) => ({ uid: g.uid, nombre: g.nombre, ...resumen(g.visitas, hoy) }))
    .sort((a, b) => b.agendadas - a.agendadas || a.nombre.localeCompare(b.nombre, "es"));
}

export function lunesDe(iso) {
  return sumarDias(iso, -((deISO(iso).getDay() + 6) % 7));
}

// Últimas n semanas (lunes a domingo) que terminan en la semana de `hasta`.
export function porSemana(visitas, hasta, n, hoy) {
  const ultima = lunesDe(hasta);
  return Array.from({ length: n }, (_, i) => {
    const desde = sumarDias(ultima, -7 * (n - 1 - i));
    const fin = sumarDias(desde, 6);
    return { desde, hasta: fin, ...resumen(filtrarVisitas(visitas, { desde, hasta: fin }), hoy) };
  });
}

// Últimos n meses que terminan en el mes de `hasta`.
export function porMes(visitas, hasta, n, hoy) {
  const base = deISO(hasta);
  return Array.from({ length: n }, (_, i) => {
    const inicio = new Date(base.getFullYear(), base.getMonth() - (n - 1 - i), 1);
    const desde = aISO(inicio);
    const fin = aISO(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0));
    return { desde, hasta: fin, mes: inicio, ...resumen(filtrarVisitas(visitas, { desde, hasta: fin }), hoy) };
  });
}

export function formatearPorcentaje(valor) {
  return valor == null ? "—" : `${Math.round(valor * 100)} %`;
}

// ---------- Desgloses para Reportes (usan resumen(), así cuadran con el Dashboard) ----------

// Agrupa por una categoría (zona, motivo…). Las visitas sin valor van a "Sin dato".
export function porCategoria(visitas, obtener, hoy) {
  const grupos = new Map();
  for (const v of visitas) {
    const clave = String(obtener(v) || "").trim() || "Sin dato";
    (grupos.get(clave) || grupos.set(clave, []).get(clave)).push(v);
  }
  return [...grupos.entries()]
    .map(([etiqueta, lista]) => ({ etiqueta, ...resumen(lista, hoy) }))
    .sort((a, b) => b.agendadas - a.agendadas || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

// Novedades marcadas en las visitas realizadas. Una visita puede tener varias, por eso no suman 100 %.
export function conteoNovedades(visitas) {
  const conteo = new Map();
  let conResultado = 0;
  for (const v of visitas) {
    if (!realizada(v)) continue;
    conResultado++;
    for (const n of v.resultado?.novedades || []) conteo.set(n, (conteo.get(n) || 0) + 1);
  }
  return {
    conResultado,
    filas: [...conteo.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor),
  };
}

// Clientes con al menos una visita realizada en el periodo.
export function clientesVisitados(visitas) {
  const grupos = new Map();
  for (const v of visitas) {
    if (!v.clienteId) continue; // prospectos: no son clientes de la base
    if (!grupos.has(v.clienteId)) {
      grupos.set(v.clienteId, {
        clienteId: v.clienteId, codigo: v.codigo, cliente: nombreCliente(v),
        zona: v.zona || "", ciudad: v.ciudad || "", agendadas: 0, realizadas: 0, ultima: "", responsables: new Set(),
      });
    }
    const g = grupos.get(v.clienteId);
    g.agendadas++;
    g.responsables.add(v.coordinadorNombre);
    if (realizada(v)) {
      g.realizadas++;
      if (v.fechaProgramada > g.ultima) g.ultima = v.fechaProgramada;
    }
  }
  return [...grupos.values()]
    .filter((g) => g.realizadas)
    .map((g) => ({ ...g, responsables: [...g.responsables].sort().join(", ") }))
    .sort((a, b) => b.realizadas - a.realizadas || b.ultima.localeCompare(a.ultima));
}

// Semanas (lunes a domingo) que tocan el rango, para graficar el periodo completo.
export function semanasDelRango(visitas, desde, hasta, hoy, maximo = 26) {
  const n = Math.min(maximo, Math.floor((deISO(lunesDe(hasta)) - deISO(lunesDe(desde))) / (7 * 86400000)) + 1);
  return porSemana(visitas, hasta, Math.max(1, n), hoy);
}
