# Control de Visitas — Etapa 1

Login, roles, estructura general y reglas de seguridad.

## Estructura

```
control-visitas/
├── firebase.json            Configuración de Hosting y Firestore
├── firestore.rules          Reglas de seguridad (la protección real de los datos)
├── firestore.indexes.json
└── public/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── firebase-config.js   ← pegar aquí la configuración de tu proyecto
        ├── firebase.js          Inicialización (Auth + Firestore con caché sin conexión)
        ├── constants.js         Roles, estados, novedades, menú
        ├── ui.js                Utilidades de interfaz
        ├── app.js               Sesión, menú por rol y enrutador
        ├── services/            Acceso a datos (auth, usuarios)
        └── views/               Pantallas
```

## Puesta en marcha (una sola vez)

1. **Crear el proyecto** en https://console.firebase.google.com (plan gratuito Spark es suficiente).
2. **Authentication → Método de acceso →** habilitar *Correo electrónico/contraseña*.
3. **Firestore Database →** crear base de datos (modo producción, región `southamerica-east1` o `us-east1`).
4. **Configuración del proyecto → Tus apps → Web (`</>`)** → registrar la app y copiar el objeto `firebaseConfig`
   en `public/js/firebase-config.js`. Opcional: definir `dominioCorporativo` (ej. `"empresa.com"`).
5. **Publicar las reglas:** copiar el contenido de `firestore.rules` en *Firestore → Reglas → Publicar*
   (o con la CLI: `firebase deploy --only firestore:rules`).
6. **Crear tu usuario administrador:** *Authentication → Usuarios → Agregar usuario* con el correo definido en
   `adminPrincipal` (firebase-config.js y firestore.rules) y la contraseña que quieras.
7. Abrir la app e **Iniciar sesión**. Entras directo como administrador.

Los coordinadores entran a la app → **"¿No tienes cuenta? Créala aquí"** con su correo @centralganadera.com, verifican el correo y quedan como coordinadores.
El administrador puede cambiar roles o desactivar cuentas en **Administración → Usuarios**.

## Ejecutar

La app usa módulos de JavaScript, así que **no funciona abriendo `index.html` con doble clic**; necesita un servidor:

- Local: `npx serve public` o la extensión *Live Server* de VS Code.
- Producción: `npm i -g firebase-tools`, `firebase login`, `firebase use --add` y `firebase deploy`.

Si usas un dominio propio, agrégalo en *Authentication → Configuración → Dominios autorizados*.

## Flujo de acceso

- **Coordinadores:** se registran solos con correo @centralganadera.com y deben verificarlo. Siempre entran como coordinador; las reglas impiden que alguien se asigne el rol de administrador.
- **Administrador:** el correo definido en `adminPrincipal` entra directo como administrador. Puede promover a otros desde *Usuarios*.
- **Retirar acceso:** el administrador desactiva al usuario (nunca se borra).

## Modelo de datos (definido en las reglas)

| Colección | Uso | Escribe |
|---|---|---|
| `usuarios/{uid}` | Perfil, rol y estado | El propio usuario al registrarse (solo como coordinador) / Admin |
| `clientes/{codigo}` | Un cliente por CODIGO, con sus marcas (`marcas[]`) y el beneficio mensual sumado | Admin; coordinador solo coordenadas |
| `importaciones/{id}` | Bitácora de cargas de Excel | Admin |
| `visitas/{id}` | Visitas; vinculadas por `coordinadorUid` | Admin o el coordinador dueño |
| `visitas/{id}/fotos/{id}` | Foto comprimida, separada de la visita | Admin o el coordinador dueño |

Nada se borra desde la aplicación: clientes, visitas y usuarios se desactivan o conservan.

## Etapa 8 — Reportes y optimización

- **Reportes** (administrador): filtros de periodo (semana, mes, rango), responsable, zona y estado. Totales,
  % de cumplimiento, visitas por responsable, por semana, por zona, estados, motivos, novedades y clientes visitados.
  Todo sale de `services/indicadores.js`, igual que el Dashboard.
- **Exportar a Excel**: un archivo con las hojas Resumen, Visitas (detalle), Por responsable, Por semana, Por zona,
  Motivos, Novedades y Clientes visitados.
- **Base de clientes con versión** (`config/clientes`): cada importación cambia la versión. Si el dispositivo ya
  tiene esa versión, la lista se toma de la caché local en lugar de volver a leer todos los clientes.
- **Visitas del coordinador por rango de fechas**: requiere el índice compuesto de `firestore.indexes.json`
  (visitas: `coordinadorUid` ascendente + `fechaProgramada` ascendente). Si no existe, la app sigue funcionando
  con la consulta anterior y deja en la consola el enlace para crearlo.
- Se retiró el módulo de mapa.

## Información del cliente en "Registrar resultado"

- Al registrar el resultado de una visita se diligencia también: cliente de beneficio (bovino/porcino/ambos),
  compra de ganado (feria/finca), días que beneficia en Central Ganadera (total automático), horario habitual,
  facturación, preferencia de canal, otras sedes y observaciones del cliente.
- Es información del cliente: un único documento `clientes/{codigo}/perfil/resultadoFinal`. En la siguiente visita
  aparece cargada y, si se cambia algo, se actualiza ese mismo documento (nunca se duplica).
- Se guardan claves (`BOVINO`, `LUN`, `GUIAS_SERVICIOS`…) para filtros y reportes futuros.
- Reglas: `match /perfil/{perfilId}` con validación de estructura. Publicar `firestore.rules`.

## Registro de visita guiado (piloto del sistema de diseño v2)

- "Registrar resultado" es ahora un flujo de 7 pasos: Visita, Novedades, Cliente, Operación, Comercial,
  Evidencias y Cierre (revisión). Al reprogramar se salta a Cierre después de Novedades.
- Código: `public/js/components/registro-visita.js` (flujo) y `campos-cliente.js` (preguntas del cliente).
- Sistema de diseño: `design-system/MASTER.md`. Estilos en la sección 18 de `styles.css`.
- Sin cambios en Firebase ni en las reglas.

## Sistema de diseño v2 en todas las vistas

- Inicio del coordinador centrado en "Hoy": próxima visita con "Registrar resultado", recorrido del día, vencidas y "Tu gestión".
- Inicio del administrador: equipo como lista alineada (sin tarjetas).
- Detalle de visita: la cita como franja con la acción principal al lado (fija abajo en celular).
- Visitas: cifras en las pestañas, filas agrupadas por día y "Más filtros" plegable en celular.
- Programar visita: ruta de 2 pasos. Reportes: cifras en una sola franja.
- Detalle de decisiones por vista en `design-system/MASTER.md`, sección 12. Sin cambios en Firebase.

## Reestructuración: brief comercial, visita en curso y actualizaciones del cliente

Separación de responsabilidades:

| Qué | Dónde se guarda | Quién lo cambia |
|---|---|---|
| Ficha (datos del Excel) | `clientes/{codigo}` | Solo la importación del Excel (admin) |
| Perfil permanente (especie, compra, sedes, días CG, facturación, canal) | `clientes/{codigo}/perfil/resultadoFinal` | Se llena en el **Primer acercamiento** y queda fijo |
| Actualizaciones reportadas | `actualizacionesCliente/{id}` (nueva) | Coordinador reporta; admin marca revisada / aplicada |
| Lo ocurrido en la visita | `visitas/{id}` | Coordinador de la visita |

- **Programar:** el motivo se reemplazó por el tipo de visita: `tipoVisita` = `primer_acercamiento` | `seguimiento_comercial` (y `motivo` guarda el texto, para que reportes y visitas antiguas sigan funcionando). Las visitas anteriores se clasifican por su motivo: "Presentación de servicios" → primer acercamiento; el resto → seguimiento.
- **Brief:** la visita muestra beneficio promedio, meses con beneficio, marcas, días en CG, perfil operativo, sedes plegables, contacto, estado de actualizaciones e historial (visitas + actualizaciones).
- **Iniciar visita:** guarda `inicioVisita` (una sola vez; la regla lo impide sobrescribir salvo al reprogramar). La visita queda "en curso" y se puede salir y volver.
- **Finalizar visita:** guarda `finVisita` y `duracionMin`. Estados al final: Finalizada, Pendiente (con "qué quedó pendiente") o Reprogramar.
- **Primer acercamiento:** Novedades + PQRS → Cliente → Operación → Evidencia y cierre. Sin horario habitual.
- **Seguimiento comercial:** Conversación (temas tratados, observaciones) → Novedades y PQRS → Evidencia y cierre.
- **Evidencia:** una foto con su tipo (`resultado.tipoEvidencia`).
- **Actualizaciones:** botón flotante en el brief, durante la visita y en la ficha. Cada cambio guarda tipo, valor anterior, valor nuevo, observación, coordinador, fecha y visita. **Nunca modifican la ficha ni el perfil.**

### Pasos para publicar
1. Publicar `firestore.rules` (nuevas reglas de `actualizacionesCliente` y protección de `inicioVisita`).
2. Desplegar `public` como siempre y recargar con Ctrl+Shift+R.
3. No requiere índices nuevos (la consulta por `clienteId` usa el índice automático).

### Ajustes
- **Beneficio por mes:** el brief muestra la cantidad de cada mes (no solo el nombre del mes).
- **Eliminar visita agendada por error:** se borra por completo de Firebase. Solo si la visita no se ha iniciado ni tiene resultado. Puede borrarla el admin o el coordinador responsable de la visita. Está en el brief (escritorio) y en "Editar programación" (todas las pantallas), con confirmación. **Requiere publicar `firestore.rules`.**

### Vista Visitas simplificada y ubicación
- **Visitas:** tres pestañas: *Por hacer* (en curso → vencidas → con pendientes → por día), *Realizadas* (finalizadas, de la más reciente a la más antigua) y *Todas* (hoy, próximas y anteriores). Periodo con botones Hoy / Semana / Mes / Todo. Búsqueda y un botón *Filtros* (fecha, responsable, zona) con chips que se quitan con un toque. Cada fila tiene una sola acción: Iniciar, Continuar (abre la visita en curso directo), Completar o Ver. Las vencidas de los últimos 60 días siempre aparecen en *Por hacer*.
- **Ubicación:** se capta al cerrar la visita. En el resultado se ve "Ubicación registrada" con la hora y el botón "Ver ubicación" (abre Google Maps, gratis, sin API). En la lista de realizadas aparecen duración, ubicación y evidencia.

### Nombre del cliente y marca de agua
- **Nombre mostrado:** una sola regla en `public/js/utils/nombre-cliente.js` → `obtenerNombreCliente(codigo, razonSocial)`: primero el nombre agrupado de la tabla `NOMBRES_AGRUPADOS`; si el código no está, la columna del Excel «REPRESENTANTE LEGAL / RAZÓN SOCIAL». El nombre del expendio queda como dato secundario. Se usa en búsqueda, programación, agenda, visitas, brief, registro, dashboard, ficha, base de clientes, actualizaciones, reportes y Excel exportado (nueva columna "Expendio").
- **Agregar equivalencias:** añadir una línea `"COD-XXXX": "NOMBRE"` en `NOMBRES_AGRUPADOS` y volver a publicar. No cambia datos en Firebase ni del Excel.
- **Marca de agua:** `img/logo-marca-agua.png` es el logo oficial con el fondo blanco transparente (mismas proporciones). Va fija detrás del contenido (abajo a la derecha), en el login y en los estados vacíos.

### Cliente prospecto y firma de recibido
- **Programar visita** empieza con *¿A quién vas a visitar?*: **Cliente actual** (buscador → tipo de visita → fecha, igual que antes) o **Cliente prospecto** (sin buscador ni código).
- **Prospecto:** al PROGRAMAR solo se pide el nombre (para identificarlo) y la fecha/hora. Al presionar **Iniciar visita** se piden nombre, teléfono, tipo de cliente (Bovino/Porcino/Ambos), cantidad semanal, temas tratados e interés (Sí/No); teléfono, temas e interés son obligatorios para finalizar (no al reprogramar). Se guarda en la misma colección `visitas` con `tipoDestinatario: "PROSPECTO"`, `tipoVisita: "VISITA_CLIENTE_PROSPECTO"`, `clienteId: null` y el objeto `prospecto`. No se agrega a la base de clientes ni se convierte automáticamente.
- **Firma de recibido (opcional):** al cerrar cualquier visita (primer acercamiento, seguimiento o prospecto; finalizada, pendiente o reprogramada). Nombre + firma en canvas (dedo, lápiz o mouse). La imagen va en `visitas/{id}/fotos/firma-<fecha>`; la visita guarda `resultado.firma` (o `firmaNombre`/`firmaId` en el historial si se reprograma). Nunca bloquea el guardado.
- **Ubicación:** se toma automáticamente al cerrar, igual que en las demás visitas.
- **Requiere publicar `firestore.rules`** (las visitas de prospecto no tienen cliente en la base).

### Tratamiento de datos, cantidad por especie y firma separada
- **Autorización de tratamiento de datos (Habeas Data):** primer paso al presionar *Iniciar visita* en primer acercamiento, seguimiento comercial y prospecto. Nada viene marcado; hay que responder Sí o No. La respuesta se guarda de inmediato en la visita (`autorizacionDatos: true|false`, `autorizacionDatosFecha`, `autorizacionDatosRegistradaEn`, `autorizacionDatosPor`), en el historial (`AUTORIZACION_DATOS`) y en `resultado.autorizacionDatos`. Si responde **No**: se registra la negativa, la visita continúa, y no se recopilan datos personales nuevos (firma y teléfono del prospecto quedan deshabilitados). La firma sigue siendo independiente y opcional.
- **Prospecto — cantidad semanal por especie:** Bovino → `cantidadSemanalBovinos`; Porcino → `cantidadSemanalPorcinos`; Ambos → los dos. Los campos cambian al instante. Se conserva `cantidadSemanal` como total.
- **Cierre:** "¿Cómo terminó la visita?" y "Firma de recibido" son dos tarjetas separadas.
- El Excel exportado incluye "Autoriza tratamiento de datos" y la cantidad de bovinos y porcinos del prospecto por separado.

### Perfil operativo editable desde la ficha
- En **Ficha de cliente → Perfil operativo**, el administrador tiene el botón **Editar perfil** (hoja lateral; inferior en celular): tipo de beneficio, compra de ganado, días en CG, facturación, canal y observaciones, con los valores actuales precargados. No requiere visitas ni primer acercamiento.
- Se guarda en el mismo documento `clientes/{codigo}/perfil/resultadoFinal` con `ultimaEdicionOrigen: "FICHA"`. Las otras sedes registradas en visitas se conservan.
- **Reglas:** una edición con origen `FICHA` solo la acepta Firestore si viene de un administrador.
- **Visitas posteriores:** el primer acercamiento ya no sobrescribe con campos vacíos lo que esté guardado.
- **Importación de Excel:** solo escribe `clientes/{codigo}`; el perfil está en una subcolección y no se toca.

### Despachos Bovinos
- **Administración → Despachos Bovinos (solo administrador):** botón **Subir / Actualizar Excel**, la base actual (archivo, fecha, quién la subió) y la lista de marcas sin relacionar. No hay tabla general ni conteos: la información se consulta en la Ficha de cliente.
- **Al subir:** valida las 16 columnas exactas (Marca, FechaModificación, Canales, Pieles, Entresijos, Mondongos, Librillos, Cuajo, Cabezas, Despacho, Viscerasrojas, ENTRESIJOSDESTINOS, MONDONGOSDESTINOS, LIBRILLOSDESTINOS, CUAJOSDESTINOS, CABEZASDESTINOS), relaciona y guarda automáticamente. Si faltan columnas o hay fórmulas con error/sin resultado guardado, no se guarda nada y se listan las celdas.
- **Datos tal cual:** cada celda se guarda y se muestra como la muestra Excel (p. ej. Canales: "Sergio Londoño"). No se suma, no se cuenta, no se reformatea. Vacío → "Sin información".
- **Cruce:** la marca del Excel se compara con `clientes/{codigo}.marcas` ignorando mayúsculas y espacios. Una coincidencia → ese código. Ninguna o varios códigos → *Sin relacionar* (no se asigna). No se crean clientes ni se modifican códigos.
- **Marcas repetidas en el Excel:** se conserva la de FechaModificación más reciente.
- **Firestore:** `despachosBovinos/M_<MARCA>` (ID estable: re-subir actualiza, no duplica) y `config/despachos`. Las marcas que ya no vienen quedan `vigente: false`. No toca clientes, perfiles, visitas ni beneficios.
- **Ficha de cliente → Despachos Bovinos:** admin y coordinadores; una fila por marca del código, las 16 columnas, columna Marca fija al desplazarse.
- **Permisos (reglas):** leer: usuarios activos (para la ficha); crear/actualizar: solo administrador; borrar: nadie. **Requiere publicar `firestore.rules`.** Sin sincronización con JUPITER.

### Ficha de cliente: sedes plegables y buscador de marcas
- **Sedes (N):** la sección aparece contraída; el botón *Ver sedes / Ocultar* la despliega con transición suave. Las tarjetas y sus datos no cambian. Mientras está contraída, su contenido no recibe foco de teclado.
- **Despachos Bovinos → Buscar marca...:** filtra al instante (parcial, sin distinguir mayúsculas) solo las filas ya cargadas del código consultado; botón para limpiar y mensaje "No se encontraron marcas con ese criterio." No consulta otros clientes ni escribe en Firebase. En computador la tabla tiene alto máximo con encabezado fijo.
- **Ajustes visuales:** en celular el gráfico de beneficio ya no desborda la pantalla (antes generaba desplazamiento horizontal de toda la página), celdas de la tabla centradas verticalmente, "Ver historial" alineado.

### Programación múltiple, Inicio, ficha durante la visita y agenda
- **Menú:** "Dashboard" ahora se llama **Inicio** (solo el nombre; la sección y la ruta `#/dashboard` no cambian).
- **Programar visita → Una visita / Varias visitas.** *Una visita* es el flujo de siempre (cliente actual o prospecto). *Varias visitas* (`views/programacion-multiple.js`): buscador por código o marca; cada cliente tocado se agrega a la lista (no se repite); se puede quitar. Datos comunes: responsable (admin), tipo de visita, fecha, hora y observación. Cada cliente puede **Ajustar** su fecha, hora y tipo, y elegir sede si tiene varias. Al guardar se crea **una visita independiente por cliente** con `crearVisita` (mismos campos, mismas reglas de Firestore); quedan PROGRAMADAS, nada se inicia. Si un cliente ya tiene visita ese día con el mismo responsable, se avisa antes (como en la individual). Si alguna falla, solo esas quedan en la lista para reintentar.
- **Ver ficha del cliente durante la visita** (`components/ficha-rapida.js`): botón flotante encima de "Reportar actualización". Abre la Ficha existente en modo consulta (`abrirFicha(..., { consulta: true })`: sin programar, foto, editar perfil, reportar ni abrir otras visitas). Computador ≥ 1280 px: panel lateral y la visita se corre a la izquierda (se puede seguir escribiendo). Tableta/celular: panel a pantalla completa con "Volver a la visita". El formulario no se vuelve a dibujar: respuestas, evidencias, paso y scroll quedan iguales; no cambia la hora de inicio ni guarda nada. Prospecto: solo los datos guardados en la visita.
- **Agenda:** panel del día más angosto (más ancho para el calendario); día sin visitas = estado vacío de una línea + "Próximas visitas" (hasta 4, clic para ir al día). Mes, Semana y Lista sin cambios.
- No requiere cambios en `firestore.rules`.

### Ajustes (v15)
- **Agenda:** se quitó el botón «Programar» del panel del día; queda solo «Programar visita» arriba, que empieza en el día seleccionado si es hoy o futuro.
- **Cierre de la visita:** solo *Finalizada* o *Pendiente*. Para cambiar la fecha se usa **Reprogramar** en el brief de la visita (sin cambios). El código de reprogramación al cierre se conserva pero ya no se muestra.
- **Programar varias visitas:** cada cliente muestra directamente su Fecha, Hora y Tipo (prellenados con los comunes). Corrección: antes, al cambiar la hora de un cliente la lista se volvía a dibujar y el campo perdía el foco, por eso no se podía poner otra hora. Ahora solo se actualiza esa fila. «Usar los datos comunes» devuelve la fila a lo común.

### Inicio del coordinador: centro de gestión (v16)
Solo el Inicio del rol coordinador (`renderCoordinador` en `views/dashboard-view.js`); el del administrador no cambia. Solo lectura sobre las visitas del coordinador (`listarVisitas` ya limita a las suyas).
- **Indicadores** (Programadas, Finalizadas, Pendientes, Reprogramadas) del periodo Hoy / Semana / Mes: estado guardado de cada visita, excluyentes (suman las agendadas del periodo). En Programadas se indica cuántas están vencidas. Cada tarjeta filtra: muestra esas visitas del periodo debajo (otro clic la cierra).
- **Próxima visita:** la que está en curso; si no, la primera de hoy sin resultado por hora; si no, la siguiente futura sin resultado. Acciones: Preparar / Continuar visita, Llamar (si hay teléfono), Ver ficha (Ficha existente).
- **Agenda de hoy:** todas las visitas de hoy por hora, con estado; la siguiente se resalta.
- **Por gestionar:** vencidas sin resultado, pendientes con su compromiso y reprogramadas que vienen (con nueva fecha y motivo). Hasta 6; el resto en Visitas.
- **Tu gestión:** Hoy = registradas ÷ programadas de hoy. Semana/Mes = realizadas (finalizadas + pendientes) ÷ visitas con fecha ya pasada o con resultado (las de hoy sin registrar y las futuras no cuentan). Explicado en «¿Cómo se calcula?». Nota: Reportes y el Inicio del administrador usan su propia definición (cuentan también las de hoy).
- **Actividad reciente:** últimas 5 registradas.
- Sin marca de agua en esta pantalla. Celular: próxima visita y agenda primero, luego indicadores.

### Ficha de cliente en tres bloques (v17)
Encabezado sin cambios (fachada, código, nombre, marcas, dirección, zona, coordinador, Programar visita y Llamar). Debajo:
1. **Información del cliente:** Contacto y Perfil operativo lado a lado; Sedes (plegable) en fila completa.
2. **Información de beneficio y despachos:** Beneficio promedio (gráfica y datos) y **Marcas** (antes «Beneficio por marca» dentro del beneficio; mismo cálculo, ahora tabla propia con todas las marcas del código); Despachos Bovinos a todo el ancho, con buscador y desplazamiento horizontal.
3. **Seguimiento comercial:** Historial de visitas y Actualizaciones (estado, últimas 3 reportadas y «Ver historial»). El botón flotante «Reportar actualización» se mantiene.
Solo cambió la ubicación y el diseño; no hay cambios en datos, cálculos ni Firebase. En celular todo va en una columna en el mismo orden; en la vista rápida durante la visita, la ficha se adapta al ancho del panel.

### Inicio del coordinador en bloques (v18)
Mismo orden visual que la Ficha de cliente (títulos numerados, mismas clases `ficha-bloque`):
1. **Mi día:** próxima visita y agenda de hoy lado a lado (una debajo de otra en tableta y celular).
2. **Por gestionar:** visitas vencidas, con compromisos y reprogramadas, en tarjetas a dos columnas.
3. **Mi gestión:** selector Hoy / Semana / Mes, las cuatro tarjetas de estado (siguen filtrando), cumplimiento y actividad reciente.
Solo cambió la organización visual; los cálculos y datos son los mismos de v16.
