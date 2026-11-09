# Scall — Guía para Claude Code

Asistente de voz estático (GitHub Pages, rama `main`, raíz del repo →
https://infraestructura-it.com/Scall/). Sucesor limpio de
`automatizacion-it/my-skills` (SCALL), que quedó congelado.

## Arquitectura (ver README para la tabla de archivos)
Orden de carga en `index.html`: ui → tts_elevenlabs → slots → herramientas →
claude → motor → voz_propia → intents_bogota. Todo son scripts clásicos con scope global compartido:
**antes de crear una función, verifica que el nombre no exista**:
`grep -ho "^\(async \)\?function [A-Za-z_]*" js/*.js | sed 's/async //' | sort | uniq -d`
(vacío = sin duplicados).

## Reglas
- **Voz propia, sin terceros**: el reconocimiento (`js/voz_propia.js`) es código
  nuestro: captura → preprocesado → MFCC → DTW contra patrones grabados por el
  usuario. NO usar Web Speech API ni STT externo. El navegador solo da micrófono
  y cálculo. Las funciones `vp*` puras (sin DOM) se prueban en Node.
- **Un solo flujo** en `procesar()` (motor.js): pendiente → comandos de sistema
  → match local → clasificador Haiku → fallback (1º repetir, 2º crear con Claude).
- **Intents = datos.** `tipo` solo puede ser una clave de `CATALOGO`. Capacidad
  nueva = entrada nueva en `CATALOGO` (y en `herramientas.js` si toca datos).
- **Slots**: tipos `texto|numero|fecha|opcion` en `slots.js`. Los `fecha` y
  `opcion` también se detectan en cualquier parte de la frase. Máx. 2 intentos
  por slot, luego sale con un mensaje amable. "cancela"/"ya no" siempre sale.
- **Matching**: normaliza tildes, palabras completas, gana la frase más específica.
- `pendiente` se limpia ANTES de resolverlo; el diálogo nunca se atasca.
- **Datos**: siempre por `ejecutarHerramienta()`. Es el punto donde entra MCP.
- Claude: `fetch` directo con `anthropic-dangerous-direct-browser-access`.
  Crear intents: modelo configurable (default `claude-opus-5-5`). Clasificar:
  `claude-haiku-5-5`. Ambos con `effort: low`, tools `strict: true`,
  `tool_choice: auto` (los modelos 5.x rechazan forzar la tool).
- Keys y datos solo en localStorage (origen `infraestructura-it.com`, no se
  comparte con la app vieja de `automatizacion-it.github.io`).

## Pruebas
No hay navegador en las pruebas: se carga `js/*.js` en Node con un DOM y un
`fetch` simulados (respuesta de Claude falsa). Micrófono y audio real solo se
prueban a mano en Chrome.
