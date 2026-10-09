// Utilidades de fecha en hora local. Las fechas de visita se guardan como "AAAA-MM-DD" y las horas como "HH:MM",
// lo que permite ordenarlas y filtrarlas como texto sin problemas de zona horaria.

const pad = (n) => String(n).padStart(2, "0");

export const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deISO = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};
export const hoyISO = () => aISO(new Date());

export function sumarDias(iso, dias) {
  const d = deISO(iso);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

// Rango de un periodo: "hoy", "semana" (lunes a domingo), "mes" o "todas" (sin límites).
export function rangoPeriodo(periodo, base = hoyISO()) {
  const d = deISO(base);
  if (periodo === "hoy") return { desde: base, hasta: base };
  if (periodo === "semana") {
    const lunes = sumarDias(base, -((d.getDay() + 6) % 7));
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (periodo === "mes") {
    return { desde: aISO(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  return { desde: null, hasta: null };
}

export function formatearFecha(iso, opciones = { weekday: "short", day: "numeric", month: "short" }) {
  if (!iso) return "";
  return deISO(iso).toLocaleDateString("es-CO", opciones).replace(/\./g, "");
}

export function formatearFechaLarga(iso) {
  return formatearFecha(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatearHora(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const sufijo = h < 12 ? "a. m." : "p. m.";
  return `${((h + 11) % 12) + 1}:${pad(m)} ${sufijo}`;
}

export function etiquetaDia(iso) {
  const hoy = hoyISO();
  if (iso === hoy) return `Hoy, ${formatearFecha(iso)}`;
  if (iso === sumarDias(hoy, 1)) return `Mañana, ${formatearFecha(iso)}`;
  if (iso === sumarDias(hoy, -1)) return `Ayer, ${formatearFecha(iso)}`;
  return formatearFecha(iso, { weekday: "long", day: "numeric", month: "long" });
}
