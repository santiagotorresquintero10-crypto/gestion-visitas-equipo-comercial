// Reemplaza estos valores con los de tu proyecto:
// Firebase Console → Configuración del proyecto → Tus apps → App web → Configuración del SDK.
export const firebaseConfig = {
  apiKey: "AIzaSyCOSV-ckqxOz_w3m0AiEAps2mY890iOtqI",
  authDomain: "control-visitas-92db8.firebaseapp.com",
  projectId: "control-visitas-92db8",
  storageBucket: "control-visitas-92db8.firebasestorage.app",
  messagingSenderId: "747346166309",
  appId: "1:747346166309:web:990d24bce4ecf0510235cc",
};

export const APP_CONFIG = {
  nombreApp: "Control de Visitas",
  nombreEmpresa: "Central Ganadera S.A.",
  // Si se define (ej. "empresa.com"), solo se aceptan correos de ese dominio.
  dominioCorporativo: "centralganadera.com",
  // Administrador principal: entra directo como administrador, sin verificación de correo ni restricción de dominio.
  // Debe coincidir con ADMIN_PRINCIPAL en firestore.rules.
  adminPrincipal: { correo: "comercialdata@centralganadera.com", nombre: "Administrador" },
};
