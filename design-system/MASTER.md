# Sistema de diseño v2 — Control de Visitas · Central Ganadera

Piloto: **Programación → Registrar visita** (`public/js/components/registro-visita.js`).
Cuando el piloto se apruebe, este documento es la referencia para rediseñar las demás vistas.

Método: (1) UI UX Pro Max para UX, arquitectura y sistema; (2) Frontend Design para quitar lo genérico
y dar identidad; (3) Canvas Design para composición, ritmo y contraste; (4) construcción y validación
en 375, 768, 1024 y 1440 px.

---

## 1. Diagnóstico de la pantalla anterior

| # | Pregunta | Hallazgo |
|---|----------|----------|
| 1 | Mal distribuido | 13 bloques en un solo scroll; la información del cliente quedaba debajo de foto y ubicación, lejos de la decisión principal. |
| 2 | Compite visualmente | Todas las secciones eran tarjetas blancas idénticas con el mismo peso; "Tomar foto" (opcional) era el bloque más grande de la pantalla. |
| 3 | Debe tener más jerarquía | El estado de la visita (decide todo el flujo) y el botón de cierre. |
| 4 | Debe aparecer progresivamente | Reprogramación (solo si se reprograma), sedes (solo si "Sí"), "¿Cuál?" del canal (solo si "Otro"), y todo el bloque del cliente (solo si la visita se hizo). |
| 5 | Acción principal | Finalizar y guardar la visita. |
| 6 | Acciones secundarias | Tomar/cambiar foto, reintentar ubicación, agregar/quitar sede, volver. |
| 7 | Campos dependientes | Estado → reprogramación / novedades obligatorias / pasos del cliente; Otras sedes → lista; Canal "Otro" → texto; Días → total automático; Horario → vista "ingreso → salida". |
| 8 | Se puede simplificar | Etiquetas repetidas, ayudas largas, cajas dentro de cajas, la palabra "opcional" en tamaño diminuto. |
| 9 | Se conserva | IDs y nombres que usa el JavaScript, la lógica de foto y ubicación, la exclusión de "Sin novedad", el guardado en Firebase y las ilustraciones de especie. |
| 10 | Rediseño completo | Estructura (flujo guiado por pasos), navegación, resumen, evidencias y validaciones. |

## 2. Arquitectura del flujo

Siete pasos, cada uno es **una pregunta o un grupo lógico**:

| Paso | Nombre corto | Pregunta / grupo | Obligatorio |
|------|--------------|------------------|-------------|
| 1 | Visita | ¿Cómo terminó la visita? (+ nueva fecha si se reprograma) | Sí |
| 2 | Novedades | ¿Qué ocurrió durante la visita? + observaciones | Sí (opcional al reprogramar) |
| 3 | Cliente | Tipo de beneficio · Compra de ganado · Otras sedes | Sí |
| 4 | Operación | Días que beneficia en CG · Horario habitual | Días sí, horario no |
| 5 | Comercial | Facturación · Preferencia de canal · Observaciones del cliente | Facturación y canal sí |
| 6 | Evidencias | Foto (opcional) · Ubicación (automática) | No |
| 7 | Cierre | Revisión completa y "Finalizar y guardar visita" | — |

- **Reprogramar** salta Cliente, Operación, Comercial y Evidencias (la visita no se hizo): quedan
  marcados como "No aplica" y el flujo es Visita → Novedades → Cierre.
- Desde el Cierre, "Editar" lleva al paso y el botón cambia a "Volver al resumen".
- Solo se puede saltar hacia adelante si los pasos anteriores están completos.
- Los datos del cliente ya registrados llegan precargados: en clientes conocidos los pasos 3–5 se confirman con un toque.

## 3. Composición por tamaño

```
1440 / 1280+                                     1024 (961–1279)
┌ ← Volver a la visita ───────────────────────┐  ┌ ← Volver ────────────────────┐
│ [COD] AGUALINDA S.A.   Visita del lun 5 oct  │  │ [COD] AGUALINDA S.A.          │
│ ●───●───◉───○───○───○───○   (ruta)          │  │ ●──●──◉──○──○──○──○ (ruta)    │
├─────────────────────────────┬───────────────┤  ├───────────────────────────────┤
│ Paso 3 de 7                 │ GUÍA DE VISITA│  │ Paso 3 de 7                   │
│ Perfil del cliente          │ (ticket verde │  │ Perfil del cliente            │
│                             │  oscuro, se   │  │ …preguntas…                   │
│ ¿Qué tipo de cliente…?      │  llena sola)  │  │                               │
│ [vaca] [cerdo] [ambos]      │               │  │ [Atrás]          [Continuar]  │
│ …                           │  ▓▓▓▓░░ 43 %  │  └───────────────────────────────┘
│ [Atrás]          [Continuar]│               │   La guía aparece completa en Cierre.
└─────────────────────────────┴───────────────┘

768 / 375 (≤960)
┌ ← Volver          Paso 3 de 7 ┐
│ ▓▓▓▓▓▓░░░░░░  Cliente         │  ← barra de progreso naranja + nombre del paso
│ Perfil del cliente            │
│ ¿Qué tipo de cliente…?        │
│ [vaca][cerdo][ambos]          │
│ …                             │
├───────────────────────────────┤
│ [Atrás]        [ Continuar ]  │  ← barra fija; la barra inferior de la app se oculta (modo foco)
└───────────────────────────────┘
```

Alineación: todo a la izquierda (lectura en F); el contenido del paso tiene un ancho máximo de ~680 px
para que las preguntas no se estiren. La guía se pega arriba (sticky) mientras se avanza.

## 4. Color

| Token | HEX | Uso |
|-------|-----|-----|
| `--monte` | `#23360F` | Verde oscuro: guía, identidad, texto sobre claro de alto peso |
| `--pasto` | `#4F6E12` | Verde principal: completado, selección confirmada, enlaces |
| `--brote` | `#86A214` | Verde del logo: detalles sobre oscuro |
| `--verde-suave` | `#E7EFD6` | Fondo de opción seleccionada |
| `--naranja` | `#B84D0B` | **Acción**: botón principal (blanco encima = 5.12:1) |
| `--naranja-hover` | `#9F420A` | Hover/active del botón principal |
| `--naranja-vivo` | `#E8701F` | Paso actual, barra de progreso, sello (solo gráfico, nunca texto pequeño) |
| `--naranja-texto` | `#9A3F08` | Texto naranja sobre claro (6.8:1) |
| `--naranja-suave` | `#FDEEE2` | Fondo de atención suave |
| `--naranja-sobre-monte` | `#F28A3C` | Naranja sobre la guía verde (5.28:1) |
| `--fondo` | `#F3F6F0` | Lienzo (gris verdoso, no crema) |
| `--superficie` | `#FFFFFF` | Controles y opciones |
| `--linea` | `#E3E8DD` | Divisores |
| `--linea-fuerte` | `#D4DCCB` | Bordes de controles |
| `--tinta` | `#1D2617` | Texto principal (14.4:1) |
| `--suave` | `#5B6853` | Texto secundario (5.5:1) |
| Éxito | `#1F9D55` / fondo `#E4F4EA` | Evidencia registrada |
| Advertencia | `#B8770C` / fondo `#FBF0DC` | Ubicación no disponible |
| Error | `#B42318` / fondo `#FBE7E4` | Validaciones |

Reglas: verde = identidad y "hecho"; naranja = "lo que toca ahora" (paso actual, botón principal,
progreso). Nunca más de un botón naranja visible a la vez. El estado nunca depende solo del color:
siempre va con icono de check, número o texto.

## 5. Tipografía (Archivo variable, una sola familia)

| Rol | Tamaño / interlineado | Peso / ancho | Uso |
|-----|----------------------|--------------|-----|
| Display | 34/1.08 (26 en móvil) | 800 / 118 % | Pregunta principal del paso |
| H1 | 26/1.15 (21 móvil) | 800 / 118 % | Nombre del cliente |
| H2 | 19/1.3 | 700 / 105 % | Pregunta secundaria dentro del paso |
| H3 | 16/1.35 | 650 | Títulos de la guía y del resumen |
| Body | 16/1.5 | 400–500 | Texto e inputs (16 px evita zoom en iOS) |
| Small | 14/1.45 | 500 | Ayudas |
| Caption | 12.5/1.4 | 600 | Metadatos, "Paso 3 de 7" |

Números en `tabular-nums`. El ancho extendido (118 %) es la voz de la marca y se reserva para preguntas y nombres.

## 6. Espaciado, radios y sombras

- Escala de 4: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Entre preguntas 40 px; entre título y controles 16 px.
- Radios con jerarquía (no uno para todo): `8` controles, chips e inputs · `14` tarjetas de decisión
  (estado y especie) · `22` la guía · `999` solo barras de progreso e insignias.
- Sombras solo con función: la guía (elevación 2), la barra de navegación fija (sombra superior) y el
  hover de las tarjetas de decisión. Las preguntas no van en cajas: se separan por espacio y divisores.

## 7. Componentes

- **Ruta (stepper)**: estaciones numeradas unidas por una línea. Hecho = verde con check; actual =
  anillo naranja y nombre en negrita; pendiente = contorno; no aplica = atenuado y tachado. Las
  estaciones alcanzables son botones (teclado y lector de pantalla: `aria-current="step"`).
- **Progreso**: barra naranja de 6 px y "Paso N de M"; en la guía, porcentaje de pasos completos.
- **Tarjeta de decisión** (estado, especie): icono/ilustración + título + explicación + check animado.
  Seleccionada: fondo verde suave y borde de 2 px; el estado de la visita usa su color de estado.
- **Chip** (novedades, compra, facturación, canal, días): alto mínimo 48 px, check dentro del chip.
  Selección múltiple = cuadrado con check; única = círculo.
- **Día**: botón cuadrado de 6 en fila; seleccionado = verde lleno con check. En < 360 px pasa a 3×2.
- **Evidencia**: fila de estado (icono de estado + título + detalle + acción), no un input.
- **Botones**: Primario (naranja) · Secundario (contorno verde) · Fantasma (solo texto) · Peligro (rojo).
  Alto 48 px (52 en la barra fija). El texto dice lo que pasa: "Continuar", "Finalizar y guardar visita".
- **Error de pregunta**: borde izquierdo rojo de 3 px en la pregunta + mensaje específico debajo del
  título; foco y desplazamiento a la pregunta; el resto de la interfaz no se mueve.
- **Guía de visita**: "ticket" verde oscuro con borde perforado (referencia a la guía ganadera), sello
  naranja con el estado y filas que se llenan solas. Es el único elemento "audaz" de la pantalla.

## 8. Estados e interacción

Normal · Hover (borde verde) · Focus (anillo de 3 px verde, siempre visible) · Active (escala .98) ·
Seleccionado (fondo + borde + check que aparece con un trazo de 180 ms) · Deshabilitado (40 % y sin
puntero) · Error (rojo con mensaje) · Éxito (verde con check).
Transición entre pasos: 180 ms de opacidad y 8 px de desplazamiento; con `prefers-reduced-motion` no hay animación.

## 9. Accesibilidad

Contraste mínimo 4.5:1 en texto (verificado arriba), objetivos táctiles ≥ 48 px, foco visible,
controles nativos (radio/checkbox) bajo el diseño, `fieldset/legend` por pregunta, `role="alert"` en
errores, estados con icono y texto además del color, sin desplazamiento horizontal en 375 px, texto ≥ 14 px.

## 10. Antipatrones a evitar en las demás vistas

Tarjeta dentro de tarjeta · todo blanco con la misma sombra · un mismo radio para todo · etiquetas en
mayúsculas sobre cada título · iconos decorativos sin función · emojis como iconos · formularios de un
solo scroll con más de 6 preguntas · "Campo requerido" como mensaje de error · más de un botón naranja visible.

## 11. Aplicación en toda la app (v2 global)

| Elemento | Verde | Naranja |
|----------|-------|---------|
| Botón principal de cada pantalla (`.btn-primario`) | | `--naranja`; uno solo visible |
| Acciones repetidas o de confirmación (`.btn-verde`): "Seleccionar", "Usar foto", "Abrir ficha" del resultado | `--pasto` | |
| Menú lateral | fondo `--monte`, activo `--monte-2` | barra lateral e icono del activo |
| Barra inferior (celular) | | marca superior e icono del activo; botón "+" naranja |
| Segmentos y pestañas | | subrayado del activo |
| Calendario | día seleccionado (borde verde) | día de hoy (círculo naranja) |
| Progreso (cumplimiento, pasos, importación) | | relleno `--naranja-vivo` |
| Semana actual en gráficos | | fondo `--naranja-suave` |
| Gráfico "¿Se cumple lo que se agenda?" | Realizadas | Agendadas |
| Paneles de identidad (cumplimiento, base actual, búsqueda de ficha, login) | fondo `--monte` | acción o acento sobre el verde |
| Estados de visita, enlaces, foco | sin cambios (colores de estado, verde) | |

Excepción: en la vista previa de importación, "Actualizar base" pasa a segundo plano para que "Confirmar actualización" sea el único naranja.

## 12. Diagnóstico y decisiones por vista (aplicación de las tres capas)

| Vista | Problema principal | Decisión |
|-------|-------------------|----------|
| Inicio del coordinador | Abre con estadísticas del mes; lo que el coordinador necesita al llegar es "¿qué me toca hoy?". Próximas y recientes compiten con el mismo peso. | **Hoy primero**: la próxima visita es el elemento protagonista con "Registrar resultado"; luego el resto del día como recorrido, las vencidas como alerta y la gestión del periodo en una columna lateral. |
| Inicio del administrador | El equipo son tarjetas idénticas (card-kit); comparar personas exige saltar de caja en caja. | **Equipo como lista** alineada en columnas (agendadas, estado, cumplimiento, vencidas): se compara leyendo hacia abajo. Orden alfabético, no ranking. |
| Detalle de visita | La acción principal ("Registrar resultado") estaba al final, después del historial. Dos tarjetas (cita y sede) con el mismo peso. | **Acción arriba**, junto a la cita; la cita es una franja con la fecha como ancla visual; sede e historial como información secundaria sin cajas extra. En celular la acción queda fija abajo. |
| Visitas | Pestañas sin cifras: no se sabe cuántas hay de cada estado sin entrar. Fecha repetida en cada fila. En celular 4 filtros empujan la lista fuera de la pantalla. | **Cifras en las pestañas**, filas **agrupadas por día**, y en celular los filtros secundarios se pliegan en "Más filtros". |
| Programar visita | "Paso 1 de 2" como texto suelto. | **Ruta de 2 pasos** con el mismo componente del registro. |
| Reportes | Siete tarjetas de cifras separadas (card-kit). | **Una sola franja** de cifras con divisores; el cumplimiento resalta en verde oscuro. |
| Ficha, Base de clientes, Usuarios, Acceso | Estructura correcta tras el rediseño anterior. | Se mantienen; heredan botones, radios, progreso y navegación del sistema v2. |

## 13. Brief comercial, visita en curso y actualizaciones

- **Brief:** la cita conserva la franja con fecha ancla. Debajo, el *perfil comercial* es una sola franja de 4 datos (Beneficio en cifra grande, Meses como chips verdes, Marcas, Días en CG como L M X J V S) y una línea "cómo opera" (especie, compra, factura, canal). Sedes e historial son plegables; nada se apila en tarjetas.
- **CTA:** "Iniciar visita" (naranja, único). Si está en curso, "Continuar visita"; si quedó pendiente, "Completar pendiente". En celular, una sola fila: Iniciar + iconos de Reprogramar y Editar.
- **En curso:** chip naranja con punto que late + hora de inicio + tiempo transcurrido.
- **Botón flotante "Reportar actualización":** verde monte (no compite con el CTA naranja), con cifra naranja de pendientes. En celular, solo icono sobre la barra fija.
- **Hoja de actualización:** panel lateral (escritorio) / hoja inferior con asa (celular). Chips de "¿Qué cambió?" abren un bloque por tipo con "Actual" (gris) y el campo nuevo. Envío naranja con número de cambios.
- **Historial del cliente:** línea de tiempo con filtros Todo / Visitas / Actualizaciones; las actualizaciones llevan borde naranja y "Anterior ↓ Nuevo".
- **Estados de actualización:** Reportada (naranja suave), Revisada (azul), Aplicada (verde).
