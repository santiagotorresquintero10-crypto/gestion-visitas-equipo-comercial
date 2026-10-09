// Nombre que se muestra junto al código del cliente. ÚNICA regla para toda la app.
//   1. Si el código tiene un nombre agrupado (tabla de abajo), se usa ese.
//   2. Si no, se usa la columna del Excel «REPRESENTANTE LEGAL / RAZÓN SOCIAL» (campo razonSocial).
//   3. Solo si esa columna viene vacía: el nombre del expendio y, por último, el código.
// Agrupar NO modifica datos: los registros, marcas, sedes, beneficio e historial del Excel se conservan tal cual.

// Códigos con varios nombres en la base → nombre único que debe mostrarse.
// Para agregar una equivalencia: añadir una línea "CÓDIGO": "NOMBRE" y volver a publicar.
export const NOMBRES_AGRUPADOS = Object.freeze({
  "COD-0067": "ALIMENTOS LA ARRIERA S.A.S",
  "COD-0104": "INVERSIONES CAMPO GRANDE SAS",
  "COD-0123": "SUPER CARNES JH",
  "COD-0126": "CARNICOS Y LACTEOS BARILOCHE SAS",
  "COD-0337": "CARNES Y FILETES",
  "COD-0349": "INVERSIONES POSADA CORREA S.A.S.",
  "COD-0357": "ISRAEL DE JESUS MOLINA CARDONA",
  "COD-0403": "MIGUEL ANGEL BUILES MUNERA",
  "COD-0599": "YADIRA CRISTINA MUÑOZ LOPEZ",
  "COD-0661": "CARNES JP S.A.S",
  "COD-0767": "MARIA JULIETA CARDONA SALAZAR",
  "COD-1072": "HERNAN DARIO VARGAS VALENCIA",
  "COD-1304": "GUSTAVO ALBERTO VARGAS MARIN",
  "COD-1355": "CARNES LAS INCOMPARABLES",
  "COD-1356": "CARNES MAYORITARIO",
  "COD-1370": "JUAN CAMILO LOPERA GONZALEZ",
});

const clave = (codigo) => String(codigo ?? "").trim().toUpperCase();

export function obtenerNombreCliente(codigo, representanteRazonSocial) {
  return NOMBRES_AGRUPADOS[clave(codigo)] || String(representanteRazonSocial ?? "").trim();
}

// Acepta un cliente o una visita (ambos guardan codigo y razonSocial).
export function nombreCliente(x) {
  if (!x) return "";
  return obtenerNombreCliente(x.codigo || x.clienteId, x.razonSocial) || x.expendio || x.codigo || "";
}

// Nombre del expendio como dato secundario (solo si aporta algo distinto al nombre principal).
export function expendioSecundario(x, expendio = x?.expendio) {
  const e = String(expendio || "").trim();
  return e && e.toUpperCase() !== nombreCliente(x).toUpperCase() ? e : "";
}
