// Gestión de usuarios (solo administrador; las reglas lo hacen cumplir).
import { db, collection, doc, getDocs, updateDoc, query, orderBy } from "../firebase.js";
import { COLECCIONES } from "../constants.js";

export async function listarUsuarios() {
  const snap = await getDocs(query(collection(db, COLECCIONES.USUARIOS), orderBy("nombre")));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function actualizarUsuario(uid, cambios) {
  const permitidos = ["nombre", "rol", "coordinador", "activo"];
  const data = Object.fromEntries(Object.entries(cambios).filter(([k]) => permitidos.includes(k)));
  await updateDoc(doc(db, COLECCIONES.USUARIOS, uid), data);
}
