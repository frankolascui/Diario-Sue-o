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

Siempre en el `localStorage` del navegador, para que la app funcione al instante y sin conexión.

**Con cuenta (Datos → Cuenta y nube):** entras con el mismo email y código que en Excelsior RPG (es la misma cuenta). Las noches y el horario se copian al Supabase común de Excelsior, en el esquema `health`, y se ven en todos tus dispositivos:

- Al entrar por primera vez en un navegador, se suben las noches que ya tenía. Si había un diario en cada dispositivo, se juntan noche a noche y gana la última edición.
- Cada cambio (guardar, borrar, importar, horario) se sube unos segundos después. Sin conexión queda pendiente y se sube en la siguiente sincronía.
- La app trae lo nuevo al abrirse y al volver a ella (como mucho cada 2 minutos), y solo pide las filas que cambiaron.
- Si entra otra cuenta en el mismo navegador, sus noches no se mezclan con las de la anterior.
- El SQL de las tablas está en `docs/supabase-health.sql`.

**Sin cuenta:** todo se queda en ese navegador, como antes. Pasa los datos con **Exportar JSON** → **Importar JSON**, y descarga el JSON de vez en cuando como copia.

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
- `nube.js`: cuenta (email + código) y sincronía con Supabase.
- `vendor/supabase-2.117.2.js`: librería oficial de Supabase (MIT), copiada para no depender de un CDN. Solo se carga si hay sesión.
- `docs/supabase-health.sql`: esquema `health` (tablas, RLS y permisos).
- `tests/pruebas.mjs`: 131 pruebas automáticas (cálculos, avisos, formulario, plan, reloj, exportación e importación, nube simulada, diseño). Necesita Playwright.
- `icon.png`: icono para la pantalla de inicio del iPhone (el mismo logo que en la app).
