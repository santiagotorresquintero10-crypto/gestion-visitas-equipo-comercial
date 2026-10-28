// Inicialización única de Firebase. El resto de módulos importa `auth` y `db` desde aquí.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Caché local: permite consultar y registrar sin señal; se sincroniza al recuperar conexión.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export * from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
