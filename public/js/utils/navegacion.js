// Navegación entre pantallas que necesita llevar datos (ej.: programar una visita desde la ficha del cliente).
let clientePendiente = null;

export function irAProgramar(cliente) {
  clientePendiente = cliente;
  if (location.hash === "#/programacion") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#/programacion";
}

let nuevaVisita = false;

export function irANuevaVisita() {
  nuevaVisita = true;
  if (location.hash === "#/programacion") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#/programacion";
}

export function tomarNuevaVisita() {
  const v = nuevaVisita;
  nuevaVisita = false;
  return v;
}

export function tomarClientePendiente() {
  const c = clientePendiente;
  clientePendiente = null;
  return c;
}

// Abrir la ficha de un cliente en la sección "Ficha de cliente" (ej.: desde Reportes).
let fichaPendiente = null;

export function irAFicha(clienteId) {
  fichaPendiente = clienteId;
  if (location.hash === "#/ficha") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#/ficha";
}

export function tomarFichaPendiente() {
  const id = fichaPendiente;
  fichaPendiente = null;
  return id;
}
