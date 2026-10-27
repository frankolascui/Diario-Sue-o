# Diario de Sueño

Web para registrar cada noche lo que crees que dormiste, lo que dice el Apple Watch (horas y fases) y unas preguntas sobre la noche. Exporta todo a JSON o CSV para analizarlo. Usa el mismo estilo que Excelsior (tema Poseidón).

## Cómo se usa

1. Cada mañana, pésate y pulsa **Registrar noche** en el reloj de Hoy.
2. Rellena «Lo esencial»: peso, hora de cama y de levantarte, las horas del reloj y el total dormido de Salud → Sueño, descanso y entrenos de ayer. Menos de un minuto.
3. Si quieres, abre «Más detalles»: fases, lo que crees (solo las primeras 14 noches) y hábitos.
4. Pulsa **Guardar noche**.
5. Con 7 noches o más, ve a **Datos → Descargar JSON** y pásaselo a Claude para analizarlo.

## Qué calcula

- **Sueño real**: el total de Salud si lo apuntas; si no, REM + ligero + profundo.
- **Eficiencia**: sueño real ÷ tiempo en la cama («me metí en la cama» → «me levanté»). Meta ≥85 %.
- **Latencia**: de «me metí en la cama» a «me dormí» del reloj. Meta ≤30 min.
- **Avisos**: si las fases no suman lo mismo que la ventana del reloj (±15 min), si el total de Salud no cuadra con las fases o si las horas están desordenadas. Al guardar con avisos hay que pulsar «Guardar» dos veces, y los avisos se exportan.
- **Objetivos del plan** (pantalla Hoy): las últimas 7 noches contra las metas (hora de acostarte y de levantarte ±15 min, latencia, eficiencia, 8 h de sueño real y descanso), con el horario que pongas en Datos.
- **Peso**: el de cada mañana, con una casilla para marcar si fue en las condiciones de siempre (misma hora, misma ropa, misma báscula, después de ir al baño y antes de comer). La tarjeta muestra la media de 7 días y su cambio por semana, sin contar los pesajes hechos en otras condiciones. Avisa si el peso cambia más de 2 kg respecto al anterior.
- **Entrenos**: cada mañana apuntas los entrenos del día anterior. La app suma los de la semana (lunes a domingo) y los compara con los planeados y el mínimo que pongas en Datos.

Lo que escribes en Registrar se guarda como borrador, así que puedes ir a la app Salud y volver sin perderlo.

- **Reloj** (pantalla Hoy): la hora, un anillo con lo que falta para acostarte (o para levantarte, de noche) y el consejo del plan que toca a esa hora.
- **Resumen semanal**: esta semana frente a la anterior (sueño, hora de cama, eficiencia, descanso, entrenos y peso).
- **Novedades**: se abren una vez por versión; también desde Datos.
- **Gráfico de 14 días**: sueño real de cada noche con la meta de 8 h.

## Dónde se guardan los datos

En el `localStorage` del navegador donde la uses. No hay servidor ni cuenta:

- Si la usas en el iPhone y en el PC, son dos diarios distintos. Pasa los datos con **Exportar JSON** → **Importar JSON**.
- Si borras los datos de Safari, se borran las noches. Descarga el JSON de vez en cuando como copia.

En el iPhone: Safari → Compartir → **Añadir a pantalla de inicio** para abrirla como una app.

## Publicar en Netlify

Es un sitio estático (HTML, CSS y JS), sin compilación.

1. En Netlify: **Add new site → Import an existing project → GitHub** y elige este repositorio.
2. Deja vacío el comando de build. El directorio de publicación es `.` (ya está en `netlify.toml`).
3. **Deploy**.

## Archivos

- `index.html`: estructura de las pantallas (Hoy, Registrar, Historial, Datos).
- `styles.css`: estilo.
- `app.js`: lógica, cálculos, almacenamiento y exportación.
- `tests/pruebas.mjs`: 104 pruebas automáticas (cálculos, avisos, formulario, plan, reloj, exportación e importación, diseño). Necesita Playwright.
- `icon.png`: icono para la pantalla de inicio del iPhone (el mismo logo que en la app).
