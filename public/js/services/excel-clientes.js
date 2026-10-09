// Lógica pura de importación de clientes (sin Firebase): lectura de filas, mapeo de columnas,
// validación y comparación con la base existente. Se puede probar de forma aislada.
import { nombreCliente } from "../utils/nombre-cliente.js";

export const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];
export const MESES_CORTOS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

// Campo interno → nombres de columna aceptados (ya normalizados).
export const CAMPOS = Object.freeze({
  codigo:        { etiqueta: "Código",               alias: ["CODIGO", "COD", "CODIGO_CLIENTE"] },
  marca:         { etiqueta: "Marca",                alias: ["MARCA"] },
  razonSocial:   { etiqueta: "Razón social",         alias: ["RAZON_SOCIAL", "REPRESENTANTE_LEGAL_RAZON_SOCIAL"] },
  expendio:      { etiqueta: "Expendio",             alias: ["NOMBRE_DEL_EXPENDIO", "NOMBRE_EXPENDIO", "EXPENDIO"] },
  representante: { etiqueta: "Representante legal",  alias: ["REPRESENTANTE_LEGAL", "REPRESENTANTE", "REPRESENTANTE_LEGAL_RAZON_SOCIAL"] },
  responsable:   { etiqueta: "Responsable",          alias: ["RESPONSABLE"] },
  telefono:      { etiqueta: "Teléfono",             alias: ["TELEFONO", "TEL"] },
  celular:       { etiqueta: "Celular",              alias: ["CELULAR", "CEL"] },
  direccion:     { etiqueta: "Dirección",            alias: ["DIRECCION"] },
  ciudad:        { etiqueta: "Ciudad",               alias: ["CIUDAD", "MUNICIPIO"] },
  barrio:        { etiqueta: "Barrio",               alias: ["BARRIO"] },
  correo:        { etiqueta: "Correo",               alias: ["CORREO", "EMAIL", "E_MAIL", "CORREO_ELECTRONICO"] },
  nit:           { etiqueta: "NIT / Cédula",         alias: ["NIT_CEDULA_CIUDADANIA", "NIT_CEDULA", "NIT", "CEDULA"] },
  estrato:       { etiqueta: "Estrato",              alias: ["ESTRATO"] },
  // "SEG 2025", "SEG 2026"…: el año cambia, por eso se reconoce por patrón.
  segmento:      { etiqueta: "Segmento",             alias: ["SEGMENTO"], patron: /^SEG(MENTO)?_?\d{4}$/ },
  facturacion:   { etiqueta: "Facturación",          alias: ["FACTURACION"] },
  coordinador:   { etiqueta: "Coordinador",          alias: ["COORDINADOR"] },
  zona:          { etiqueta: "Zona",                 alias: ["ZONA"] },
});
export const CAMPOS_TEXTO = Object.keys(CAMPOS);

// Campos propios de cada marca (una fila del Excel). El cliente (CODIGO) toma los suyos de la primera fila.
export const CAMPOS_MARCA = [
  "marca", "expendio", "razonSocial", "representante", "responsable", "telefono", "celular",
  "direccion", "ciudad", "barrio", "correo", "zona", "nit", "estrato", "segmento", "facturacion",
];

export function normalizarTexto(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function normalizarEncabezado(valor) {
  return normalizarTexto(valor).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const RE_MES = new RegExp(`^(${MESES.join("|")})_?(\\d{4})$`);

// "SEPTIEMBRE_2026" → "2026-09" (clave ordenable). Devuelve null si no es columna mensual.
export function claveMes(encabezadoNormalizado) {
  const m = encabezadoNormalizado.match(RE_MES);
  return m ? `${m[2]}-${String(MESES.indexOf(m[1]) + 1).padStart(2, "0")}` : null;
}

export function etiquetaMes(clave) {
  const [anio, mes] = clave.split("-");
  return `${MESES_CORTOS[Number(mes) - 1]} ${anio}`;
}

// El código es el identificador estable; "/" no es válido como ID de documento en Firestore.
export function idCliente(codigo) {
  return String(codigo).trim().replace(/\//g, "-");
}

function texto(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isInteger(valor) ? String(valor) : String(valor);
  return String(valor).replace(/\s+/g, " ").trim();
}

// Convierte "1.250", "1,250", "12,5", 12 → número. Vacío o "-" → null.
export function numero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let s = String(valor ?? "").trim().replace(/\s/g, "");
  if (!s || s === "-") return null;
  if (/[^\d.,\-$%]/.test(s.replace(/^\$/, ""))) return null; // contiene letras u otros símbolos: no es un número
  s = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const ultimoPunto = s.lastIndexOf("."), ultimaComa = s.lastIndexOf(",");
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    s = s.split(miles).join("").replace(decimal, ".");
  } else if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Busca la fila de encabezados dentro de las primeras filas (algunos Excel traen títulos arriba).
export function detectarEncabezado(filas) {
  const aliasCodigo = CAMPOS.codigo.alias;
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    if ((filas[i] || []).some((c) => aliasCodigo.includes(normalizarEncabezado(c)))) return i;
  }
  return -1;
}

export function mapearColumnas(encabezado) {
  const campos = {}, meses = [], ignoradas = [];
  encabezado.forEach((original, idx) => {
    const norm = normalizarEncabezado(original);
    if (!norm) return;
    // Una columna puede alimentar varios campos (ej. "REPRESENTANTE LEGAL / RAZÓN SOCIAL").
    const coinciden = CAMPOS_TEXTO.filter((c) =>
      campos[c] === undefined && (CAMPOS[c].alias.includes(norm) || CAMPOS[c].patron?.test(norm)));
    if (coinciden.length) return coinciden.forEach((c) => (campos[c] = idx));
    const clave = claveMes(norm);
    if (clave) return meses.push({ clave, idx, original: texto(original) });
    ignoradas.push(texto(original));
  });
  meses.sort((a, b) => a.clave.localeCompare(b.clave));
  const faltantes = CAMPOS_TEXTO.filter((c) => campos[c] === undefined);
  return { campos, meses, ignoradas, faltantes };
}

// Suma mes a mes el beneficio de varias marcas.
export function sumarBeneficio(marcas) {
  const total = {};
  for (const m of marcas) {
    for (const [k, v] of Object.entries(m.beneficio || {})) total[k] = (total[k] || 0) + v;
  }
  return total;
}

// filas: arreglo de arreglos (como lo entrega SheetJS con header: 1).
// Cada fila es una MARCA; las filas con el mismo CODIGO forman un cliente.
export function procesarFilas(filas) {
  const filaEncabezado = detectarEncabezado(filas);
  if (filaEncabezado < 0) {
    return { ok: false, error: "No se encontró la columna CODIGO en las primeras filas del archivo." };
  }
  const mapeo = mapearColumnas(filas[filaEncabezado]);
  const errores = [], avisos = [];
  const clientes = new Map(); // id → { id, fila, data, marcasVistas }
  let totalFilas = 0;
  const valor = (fila, campo) => (mapeo.campos[campo] === undefined ? "" : texto(fila[mapeo.campos[campo]]));

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const numeroFila = i + 1; // como se ve en Excel
    if (fila.every((c) => texto(c) === "")) continue;

    const codigo = valor(fila, "codigo");
    if (!codigo) {
      errores.push({ fila: numeroFila, mensaje: "Fila sin CODIGO. No se importa." });
      continue;
    }
    totalFilas++;

    const beneficio = {};
    for (const { clave, idx, original } of mapeo.meses) {
      const v = fila[idx];
      if (texto(v) === "") continue;
      const n = numero(v);
      if (n === null) errores.push({ fila: numeroFila, mensaje: `Valor no numérico en ${original}: "${texto(v)}". Se omite ese mes.` });
      else beneficio[clave] = n;
    }
    const marca = Object.fromEntries(CAMPOS_MARCA.map((c) => [c, valor(fila, c)]));
    marca.beneficio = beneficio;

    const id = idCliente(codigo);
    let cliente = clientes.get(id);
    if (!cliente) {
      const data = Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, valor(fila, c)]));
      data.codigo = codigo;
      cliente = { id, fila: numeroFila, data: { ...data, marcas: [] }, marcasVistas: new Map() };
      clientes.set(id, cliente);
    } else {
      const coord = valor(fila, "coordinador");
      if (coord && coord !== cliente.data.coordinador) {
        avisos.push({ fila: numeroFila, mensaje: `El código ${codigo} tiene otro coordinador (${coord}); se usa ${cliente.data.coordinador || "el de la primera fila"}.` });
      }
    }

    const claveMarca = normalizarTexto(marca.marca);
    if (claveMarca && cliente.marcasVistas.has(claveMarca)) {
      errores.push({ fila: numeroFila, mensaje: `La marca ${marca.marca} ya aparece en el código ${codigo} (fila ${cliente.marcasVistas.get(claveMarca)}). Se usa la primera.` });
      continue;
    }
    if (claveMarca) cliente.marcasVistas.set(claveMarca, numeroFila);
    cliente.data.marcas.push(marca);
  }

  const registros = [...clientes.values()].map(({ id, fila, data }) => {
    data.beneficio = sumarBeneficio(data.marcas);
    data.totalMarcas = data.marcas.length;
    return { id, fila, data };
  });
  return { ok: true, filaEncabezado: filaEncabezado + 1, mapeo, registros, totalFilas, errores, avisos };
}

const firmaMarcas = (marcas = []) => JSON.stringify(marcas.map((m) =>
  [...CAMPOS_MARCA.map((c) => m[c] ?? ""), Object.entries(m.beneficio || {}).sort()]));

// Compara con la base actual. existentes: Map(id → datos del documento en Firestore).
export function compararConBase(registros, existentes) {
  const nuevos = [], actualizados = [], sinCambios = [];
  const enArchivo = new Set();

  for (const reg of registros) {
    enArchivo.add(reg.id);
    const actual = existentes.get(reg.id);
    if (!actual) { nuevos.push(reg); continue; }

    const cambios = CAMPOS_TEXTO.filter((c) => (actual[c] ?? "") !== reg.data[c]).map((c) => CAMPOS[c].etiqueta);

    const antes = new Set((actual.marcas || []).map((m) => normalizarTexto(m.marca)));
    const ahora = new Set(reg.data.marcas.map((m) => normalizarTexto(m.marca)));
    const agregadas = [...ahora].filter((m) => !antes.has(m)).length;
    const quitadas = [...antes].filter((m) => !ahora.has(m)).length;
    if (agregadas || quitadas) {
      cambios.push(`Marcas (${[agregadas && `+${agregadas}`, quitadas && `−${quitadas}`].filter(Boolean).join(" / ")})`);
    }

    const mesesCambiados = Object.entries(reg.data.beneficio)
      .filter(([k, v]) => actual.beneficio?.[k] !== v).map(([k]) => etiquetaMes(k));
    if (mesesCambiados.length) cambios.push(`Beneficio (${mesesCambiados.join(", ")})`);

    if (!agregadas && !quitadas && !mesesCambiados.length && firmaMarcas(actual.marcas) !== firmaMarcas(reg.data.marcas)) {
      cambios.push("Datos de marcas");
    }
    if (actual.activo === false) cambios.push("Reactivado");

    if (cambios.length) actualizados.push({ ...reg, cambios });
    else sinCambios.push(reg);
  }

  const noAparecen = [...existentes.entries()]
    .filter(([id, d]) => !enArchivo.has(id) && d.activo !== false)
    .map(([id, d]) => ({ id, data: d }));

  return { nuevos, actualizados, sinCambios, noAparecen };
}

// Texto de búsqueda normalizado: código, razón social, ciudad y todas las marcas y expendios del cliente.
export function textoBusqueda(c) {
  const marcas = (c.marcas || []).flatMap((m) => [m.marca, m.expendio, m.razonSocial, m.ciudad]);
  return normalizarTexto([c.codigo, nombreCliente(c), c.expendio, c.razonSocial, c.ciudad, ...marcas].join(" "));
}

// Promedio de los meses con dato de un año (se usará en la ficha del cliente, Etapa 6). Los ceros cuentan.
export function promedioBeneficio(beneficio = {}, anio) {
  const valores = Object.entries(beneficio)
    .filter(([k, v]) => (!anio || k.startsWith(`${anio}-`)) && typeof v === "number")
    .map(([, v]) => v);
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

// Resumen objetivo del beneficio de un año (por defecto, el año del último mes con dato).
// Los meses sin dato entre el primero y el último quedan como null; los ceros sí cuentan en el promedio.
export function analizarBeneficio(beneficio = {}, anio = null) {
  const claves = Object.keys(beneficio).filter((k) => typeof beneficio[k] === "number").sort();
  if (!claves.length) return null;
  anio = anio || claves[claves.length - 1].slice(0, 4);
  const delAnio = claves.filter((k) => k.startsWith(`${anio}-`));
  if (!delAnio.length) return { anio, meses: [], promedio: null, mesesConDato: 0 };
  const primero = Number(delAnio[0].slice(5)), ultimo = Number(delAnio[delAnio.length - 1].slice(5));
  const meses = [];
  for (let m = primero; m <= ultimo; m++) {
    const clave = `${anio}-${String(m).padStart(2, "0")}`;
    meses.push({ clave, corto: MESES_CORTOS[m - 1], valor: typeof beneficio[clave] === "number" ? beneficio[clave] : null });
  }
  const conDato = meses.filter((x) => x.valor !== null);
  const total = conDato.reduce((a, x) => a + x.valor, 0);
  const maximo = conDato.reduce((a, x) => (x.valor > a.valor ? x : a), conDato[0]);
  const minimo = conDato.reduce((a, x) => (x.valor < a.valor ? x : a), conDato[0]);
  return {
    anio, meses, mesesConDato: conDato.length, total,
    promedio: total / conDato.length, maximo, minimo, ultimo: conDato[conDato.length - 1],
  };
}
