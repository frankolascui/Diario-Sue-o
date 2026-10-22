# Diario de Sueño

Web para registrar cada noche lo que crees que dormiste, lo que dice el Apple Watch (horas y fases) y unas preguntas sobre la noche. Exporta todo a JSON o CSV para analizarlo. Usa el mismo estilo que Excelsior (tema Poseidón).

## Cómo se usa

1. Cada mañana, abre **Registrar**.
2. Apunta las horas que *crees* (sin mirar el reloj).
3. Copia de la app Salud → Sueño la hora real de dormirte y despertarte y los minutos de cada fase.
4. Responde a las preguntas y pulsa **Guardar noche**.
5. Con 7 noches o más, ve a **Datos → Descargar JSON** y pásaselo a Claude para analizarlo.

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
