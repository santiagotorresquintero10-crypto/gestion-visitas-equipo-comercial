// Ubicación del dispositivo solo en el momento del registro (sin seguimiento permanente).

export function obtenerUbicacion({ tiempoMaximo = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Este dispositivo no permite obtener la ubicación."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        precisionMetros: Math.round(pos.coords.accuracy),
        fechaHora: new Date(pos.timestamp).toISOString(),
      }),
      (err) => reject(new Error({
        1: "Permiso de ubicación denegado. Actívalo en el navegador para registrarla.",
        2: "No fue posible determinar la ubicación.",
        3: "La ubicación tardó demasiado. Intenta de nuevo.",
      }[err.code] || "No fue posible obtener la ubicación.")),
      { enableHighAccuracy: true, timeout: tiempoMaximo, maximumAge: 60000 },
    );
  });
}
