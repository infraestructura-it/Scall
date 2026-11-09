# Scall — Guía para Claude Code

Asistente de voz estático (GitHub Pages, rama `main`, raíz del repo). Sucesor
limpio de `automatizacion-it/my-skills` (SCALL), que quedó congelado.

## Principios (lecciones de my-skills)
- **Un solo flujo**: voz → `buscarIntent()` en `localStorage['scall_asistente_intents']`
  → `ejecutarIntent()`. Si no hay match → ofrecer crearlo con Claude → confirmar
  → guardar → ejecutar. Nada de pipelines paralelos ni funciones que se pisan.
- **Intents = datos, no código.** Solo pueden apuntar a una acción del `CATALOGO`
  en `index.html`. Para una capacidad nueva, agregar una entrada al catálogo.
- **Matching**: normaliza tildes, compara palabras completas, gana la frase más
  específica (no la primera).
- Estado entre turnos (`pendiente`) se limpia ANTES de resolver; nunca se atasca.
- Claude: `fetch` directo con `anthropic-dangerous-direct-browser-access`,
  modelo por defecto `claude-opus-5-5`, `effort: low`, tool `crear_intent`
  con `strict: true` y `tool_choice: auto` (los modelos 5.x rechazan forzarla).
- Las keys solo en localStorage (origen `infraestructura-it.com`, no se
  comparte con la app vieja de `automatizacion-it.github.io`).
