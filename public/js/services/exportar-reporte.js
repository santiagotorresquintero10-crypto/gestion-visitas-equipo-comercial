// Exportación del reporte a Excel (SheetJS). Toma exactamente los mismos cálculos que se ven en pantalla.
import { ESTADO_LABEL } from "../constants.js";
import { estadoVisible } from "./visitas-service.js";
import { nombreCliente } from "../utils/nombre-cliente.js";

const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
// Fechas "AAAA-MM-DD" como fecha real de Excel (se pueden ordenar y filtrar por fecha).
// Se escribe como número de serie de Excel para evitar desfases de zona horaria.
const fecha = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};
const F_FECHA = "dd/mm/yyyy";
const pct = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// filas: array de objetos con las mismas claves (encabezados). anchos: ancho de columna en caracteres.
function hoja(XLSX, filas, anchos = [], formatos = {}) {
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = Object.keys(filas[0] || {}).map((k, i) => ({ wch: anchos[i] || Math.max(10, k.length + 2) }));
  // Formato de porcentaje / fecha por nombre de columna.
  const rango = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const claves = Object.keys(filas[0] || {});
  claves.forEach((k, c) => {
    if (!formatos[k]) return;
    for (let r = 1; r <= rango.e.r; r++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && typeof celda.v === "number") celda.z = formatos[k];
    }
  });
  return ws;
}

const filaResumen = (etiqueta, r) => ({
  [etiqueta.titulo]: etiqueta.valor,
  Agendadas: r.agendadas,
  Finalizadas: r.FINALIZADA,
  Pendientes: r.PENDIENTE,
  Reprogramadas: r.REPROGRAMADA,
  Programadas: r.PROGRAMADA,
  "Vencidas (de las programadas)": r.vencidas,
  Realizadas: r.realizadas,
  "Con fecha cumplida": r.exigibles,
  "% cumplimiento": pct(r.cumplimiento),
});

export async function exportarReporte(datos) {
  const XLSX = await import(SHEETJS_URL);
  const { filtros, r, coordinadores, semanas, zonas, motivos, novedades, clientes, visitas, hoy } = datos;
  const libro = XLSX.utils.book_new();
  const fPct = { "% cumplimiento": "0%", "% de visitas realizadas": "0%" };

  const resumenFilas = [
    { Concepto: "Periodo", Valor: `${filtros.desde} a ${filtros.hasta}` },
    { Concepto: "Responsable", Valor: filtros.coordinador || "Todos" },
    { Concepto: "Zona", Valor: filtros.zona || "Todas" },
    { Concepto: "Estado", Valor: filtros.estado || "Todos" },
    { Concepto: "Generado", Valor: new Date().toLocaleString("es-CO") },
    { Concepto: "", Valor: "" },
    { Concepto: "Total agendadas", Valor: r.agendadas },
    { Concepto: "Finalizadas", Valor: r.FINALIZADA },
    { Concepto: "Programadas", Valor: r.PROGRAMADA },
    { Concepto: "Vencidas (programadas con fecha pasada)", Valor: r.vencidas },
    { Concepto: "Pendientes", Valor: r.PENDIENTE },
    { Concepto: "Reprogramadas", Valor: r.REPROGRAMADA },
    { Concepto: "Realizadas (finalizadas + pendientes)", Valor: r.realizadas },
    { Concepto: "Con fecha cumplida", Valor: r.exigibles },
    { Concepto: "% cumplimiento", Valor: pct(r.cumplimiento) },
    { Concepto: "Clientes visitados", Valor: clientes.length },
  ];
  const wsResumen = hoja(XLSX, resumenFilas, [42, 28]);
  const filaPct = resumenFilas.findIndex((f) => f.Concepto === "% cumplimiento") + 1;
  const celdaPct = wsResumen[XLSX.utils.encode_cell({ r: filaPct, c: 1 })];
  if (celdaPct && typeof celdaPct.v === "number") celdaPct.z = "0%";
  XLSX.utils.book_append_sheet(libro, wsResumen, "Resumen");

  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, visitas.map((v) => ({
    Fecha: fecha(v.fechaProgramada),
    Hora: v.horaProgramada,
    "Código": v.codigo,
    Cliente: nombreCliente(v),
    Expendio: v.expendio || "",
    Marcas: (v.marcas || []).join(", "),
    Zona: v.zona || "",
    Ciudad: v.ciudad || "",
    Responsable: v.coordinadorNombre,
    Destinatario: v.tipoDestinatario === "PROSPECTO" ? "Prospecto" : "Cliente actual",
    "Tipo de visita": v.motivo,
    Estado: ESTADO_LABEL[estadoVisible(v, hoy)] || v.estado,
    "Fecha original": fecha(v.fechaOriginal),
    "Veces reprogramada": v.vecesReprogramada || 0,
    Inicio: hora(v.resultado?.inicioVisita || v.inicioVisita),
    Fin: hora(v.resultado?.finVisita || v.finVisita),
    "Duración (min)": v.resultado?.duracionMin ?? null,
    "Temas tratados": v.resultado?.temasTratados || "",
    Novedades: (v.resultado?.novedades || []).join(", "),
    PQRS: v.resultado?.pqrs || "",
    Observaciones: v.resultado?.observaciones || "",
    "Qué quedó pendiente": v.resultado?.pendiente || "",
    "Registrado por": v.resultado?.nombre || "",
    "Fecha de registro": v.resultado?.fechaHora ? new Date(v.resultado.fechaHora).toLocaleString("es-CO") : "",
    Evidencia: v.resultado ? (v.resultado.tieneFoto ? v.resultado.tipoEvidencia || "Fotografía" : "No") : "",
    "Autoriza tratamiento de datos": v.autorizacionDatos === true ? "Sí" : v.autorizacionDatos === false ? "No" : "",
    "Firma de recibido": v.resultado?.firma ? v.resultado.firma.nombre || "Sí" : "",
    "Prospecto: teléfono": v.prospecto?.telefono || "",
    "Prospecto: tipo de cliente": v.prospecto?.tipoCliente ? v.prospecto.tipoCliente.charAt(0) + v.prospecto.tipoCliente.slice(1).toLowerCase() : "",
    "Prospecto: cantidad semanal bovinos": v.prospecto?.cantidadSemanalBovinos ?? null,
    "Prospecto: cantidad semanal porcinos": v.prospecto?.cantidadSemanalPorcinos ?? null,
    "Prospecto: interesado": v.prospecto ? (v.prospecto.interesado === true ? "Sí" : v.prospecto.interesado === false ? "No" : "") : "",
    "Con ubicación": v.resultado ? (v.resultado.ubicacion ? "Sí" : "No") : "",
  })), [11, 7, 11, 34, 26, 18, 12, 14, 20, 14, 24, 13, 13, 10, 9, 9, 10, 36, 28, 36, 40, 36, 20, 20, 14, 14, 20, 16, 14, 12, 12, 12, 12], { Fecha: F_FECHA, "Fecha original": F_FECHA }), "Visitas");

  XLSX.utils.book_append_sheet(libro, hoja(XLSX, coordinadores.map((g) => filaResumen({ titulo: "Responsable", valor: g.nombre }, g)), [24], fPct), "Por responsable");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, semanas.map((s) => filaResumen({ titulo: "Semana", valor: `${s.desde} a ${s.hasta}` }, s)), [24], fPct), "Por semana");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, zonas.map((z) => filaResumen({ titulo: "Zona", valor: z.etiqueta }, z)), [18], fPct), "Por zona");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, motivos.map((m) => filaResumen({ titulo: "Tipo de visita", valor: m.etiqueta }, m)), [30], fPct), "Tipo de visita");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, novedades.filas.length ? novedades.filas.map((n) => ({
    Novedad: n.etiqueta, Visitas: n.valor, "% de visitas realizadas": novedades.conResultado ? pct(n.valor / novedades.conResultado) : null,
  })) : [{ Novedad: "Sin novedades registradas", Visitas: 0, "% de visitas realizadas": null }], [30, 10, 22], fPct), "Novedades");
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, clientes.length ? clientes.map((c) => ({
    "Código": c.codigo, Cliente: c.cliente, Zona: c.zona, Ciudad: c.ciudad,
    "Visitas agendadas": c.agendadas, "Visitas realizadas": c.realizadas, "Última visita realizada": fecha(c.ultima), Responsables: c.responsables,
  })) : [{ "Código": "", Cliente: "Sin clientes visitados en el periodo" }], [11, 36, 12, 14, 10, 10, 14, 28], { "Última visita realizada": F_FECHA }), "Clientes visitados");

  XLSX.writeFile(libro, `Reporte de visitas ${filtros.desde} a ${filtros.hasta}.xlsx`, { compression: true });
}
