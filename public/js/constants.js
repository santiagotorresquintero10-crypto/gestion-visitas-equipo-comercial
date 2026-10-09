// Constantes centrales de la aplicación. Toda lógica de estados, roles y menú debe leer de aquí.

export const ROLES = Object.freeze({
  ADMIN: "administrador",
  COORDINADOR: "coordinador",
});

export const ROL_LABEL = Object.freeze({
  [ROLES.ADMIN]: "Administrador",
  [ROLES.COORDINADOR]: "Coordinador",
});

export const COLECCIONES = Object.freeze({
  USUARIOS: "usuarios",
  CLIENTES: "clientes",
  VISITAS: "visitas",
  IMPORTACIONES: "importaciones",
  CONFIG: "config",
  PERFIL_CLIENTE: "perfil", // subcolección de clientes/{codigo}; documento único "resultadoFinal"
  ACTUALIZACIONES: "actualizacionesCliente", // cambios reportados por coordinadores (no tocan la ficha)
});

// Estados de visita (se usarán desde la Etapa 3).
export const ESTADOS_VISITA = Object.freeze({
  PROGRAMADA: "PROGRAMADA",
  FINALIZADA: "FINALIZADA",
  PENDIENTE: "PENDIENTE",
  REPROGRAMADA: "REPROGRAMADA",
});

export const NOVEDADES = Object.freeze([
  "Sin novedad",
  "Precio",
  "Servicio",
  "Competencia",
  "Cartera",
  "Disminución de beneficio",
  "PQRS",
  "Otro",
]);

export const ESTADO_LABEL = Object.freeze({
  PROGRAMADA: "Programada",
  FINALIZADA: "Finalizada",
  PENDIENTE: "Pendiente",
  REPROGRAMADA: "Reprogramada",
  VENCIDA: "Vencida", // no se guarda: programada o reprogramada con fecha ya pasada y sin resultado
});

// Tipo de visita: decide qué flujo se abre al iniciarla. Se guarda la clave en `tipoVisita` y el texto en `motivo`
// (así los reportes de motivo siguen funcionando con las visitas anteriores).
export const TIPOS_VISITA = Object.freeze([
  { clave: "primer_acercamiento", texto: "Primer acercamiento", detalle: "Conocer al cliente y dejar su perfil registrado", icono: "store" },
  { clave: "seguimiento_comercial", texto: "Seguimiento comercial", detalle: "Visita rápida: temas tratados, PQRS y evidencia", icono: "route" },
]);
// Visita a un posible cliente que aún no está en la base (sin código). No se elige como tipo: se define al
// escoger "Cliente prospecto" antes del buscador.
export const TIPO_PROSPECTO = Object.freeze({ clave: "VISITA_CLIENTE_PROSPECTO", texto: "Visita a cliente prospecto", detalle: "Posible nuevo cliente", icono: "plus" });
export const DESTINATARIO = Object.freeze({ CLIENTE: "CLIENTE", PROSPECTO: "PROSPECTO" });
export const TIPO_VISITA = Object.freeze({ ...Object.fromEntries(TIPOS_VISITA.map((t) => [t.clave, t])), [TIPO_PROSPECTO.clave]: TIPO_PROSPECTO });
export const esProspecto = (v) => v?.tipoDestinatario === DESTINATARIO.PROSPECTO;

// Visitas anteriores a los tipos: se deducen del motivo guardado.
export function tipoDeVisita(v) {
  if (v?.tipoVisita && TIPO_VISITA[v.tipoVisita]) return v.tipoVisita;
  return /primer acercamiento|presentaci[oó]n de servicios/i.test(v?.motivo || "") ? "primer_acercamiento" : "seguimiento_comercial";
}

// Evidencia de la visita: una foto, con el tipo de soporte que muestra.
export const TIPOS_EVIDENCIA = Object.freeze([
  "Fotografía", "Documento", "Instalación", "Producto", "Situación encontrada", "Acuerdo", "Material", "Otro",
]);

// Motivos anteriores (solo para mostrar visitas antiguas; ya no se ofrecen al programar).
export const MOTIVOS_VISITA = Object.freeze([
  "Seguimiento comercial",
  "Presentación de servicios",
  "Cartera",
  "Atención de novedad o reclamo",
  "Disminución de beneficio",
  "Otro",
]);

// Definición del menú. `roles` controla la visibilidad; la seguridad real está en firestore.rules.
export const MENU = Object.freeze([
  { id: "dashboard",    label: "Dashboard",        icon: "grid",     roles: [ROLES.ADMIN, ROLES.COORDINADOR] },
  { id: "programacion", label: "Programación",     icon: "calendar", roles: [ROLES.ADMIN, ROLES.COORDINADOR] },
  { id: "visitas",      label: "Visitas",          icon: "check",    roles: [ROLES.ADMIN, ROLES.COORDINADOR] },
  { id: "ficha",        label: "Ficha de cliente", icon: "store",    roles: [ROLES.ADMIN, ROLES.COORDINADOR] },
  { id: "reportes",     label: "Reportes",         icon: "chart",    roles: [ROLES.ADMIN] },
  { seccion: "Administración", roles: [ROLES.ADMIN] },
  { id: "clientes",     label: "Base de clientes", icon: "database", roles: [ROLES.ADMIN] },
  { id: "usuarios",     label: "Usuarios",         icon: "users",    roles: [ROLES.ADMIN] },
]);

export const RUTA_INICIAL = "dashboard";

// false: en la ficha del cliente, el coordinador ve solo SUS visitas a ese cliente.
// true: ve todas las visitas del cliente (de cualquier responsable). Si se cambia, cambiar también
// historialCompartido() en firestore.rules.
export const HISTORIAL_COMPARTIDO = true;

// ---------- Resultado final del cliente (perfil operativo y comercial) ----------
// Se guardan las claves (no los textos) para poder filtrar y reportar después sin depender de la redacción.
export const COMPRA_GANADO = Object.freeze([
  { clave: "FERIA", texto: "Feria" },
  { clave: "FINCA", texto: "Finca" },
]);
export const TIPOS_BENEFICIO = Object.freeze([
  { clave: "BOVINO", texto: "Bovino" },
  { clave: "PORCINO", texto: "Porcino" },
  { clave: "AMBOS", texto: "Ambos" },
]);
export const DIAS_BENEFICIO = Object.freeze([
  { clave: "LUN", texto: "Lunes", corto: "Lun" },
  { clave: "MAR", texto: "Martes", corto: "Mar" },
  { clave: "MIE", texto: "Miércoles", corto: "Mié" },
  { clave: "JUE", texto: "Jueves", corto: "Jue" },
  { clave: "VIE", texto: "Viernes", corto: "Vie" },
  { clave: "SAB", texto: "Sábado", corto: "Sáb" },
]);
export const FACTURADORES = Object.freeze([
  { clave: "GUIAS_SERVICIOS", texto: "Guías y Servicios" },
  { clave: "CENTRAL_GANADERA", texto: "Central Ganadera" },
  { clave: "AGROFAR", texto: "Agrofar" },
]);
export const CORTES_CANAL = Object.freeze([
  { clave: "REGIONAL", texto: "Regional" },
  { clave: "PISTOLA", texto: "Pistola" },
  { clave: "SEMI_PISTOLA", texto: "Semi pistola" },
  { clave: "CORTE_AMERICANO", texto: "Corte americano" },
  { clave: "OTRO", texto: "Otro" },
]);

// ---------- Actualizaciones del cliente ----------
// Lo que un coordinador reporta que cambió. Se guarda como "reportada" con el valor anterior y el nuevo;
// nunca modifica la ficha. El administrador la revisa y la aplica en la base maestra.
export const TIPOS_ACTUALIZACION = Object.freeze([
  { clave: "NUEVA_SEDE", texto: "Nueva sede", icono: "plus" },
  { clave: "SEDE_CERRADA", texto: "Sede cerrada", icono: "store" },
  { clave: "DIRECCION", texto: "Cambio de dirección", icono: "pin" },
  { clave: "TELEFONO", texto: "Cambio de teléfono", icono: "phone" },
  { clave: "RESPONSABLE", texto: "Cambio de responsable", icono: "user" },
  { clave: "NUEVA_MARCA", texto: "Nueva marca", icono: "tag" },
  { clave: "MARCA", texto: "Actualización de marca", icono: "tag" },
  { clave: "DIAS_BENEFICIO", texto: "Días de beneficio", icono: "calendar" },
  { clave: "TIPO_BENEFICIO", texto: "Tipo de beneficio", icono: "layers" },
  { clave: "COMERCIAL", texto: "Información comercial", icono: "receipt" },
  { clave: "CORRECCION", texto: "Corrección de datos", icono: "edit" },
  { clave: "OTRO", texto: "Otro", icono: "info" },
]);
export const TIPO_ACTUALIZACION = Object.freeze(Object.fromEntries(TIPOS_ACTUALIZACION.map((t) => [t.clave, t])));

export const ESTADOS_ACTUALIZACION = Object.freeze({ REPORTADA: "reportada", REVISADA: "revisada", APLICADA: "aplicada" });
export const ESTADO_ACTUALIZACION_LABEL = Object.freeze({ reportada: "Reportada", revisada: "Revisada", aplicada: "Aplicada" });
