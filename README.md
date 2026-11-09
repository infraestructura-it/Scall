# Scall

Asistente de voz en el navegador. Entra la voz, se busca un intent en la base
local (localStorage) y se responde con una acción. Si no existe un intent para
lo que pediste, Scall ofrece crearlo con ayuda de la API de Claude, lo guarda
y lo ejecuta. La próxima vez ya responde solo, sin llamar a la IA.

**En vivo:** https://infraestructura-it.github.io/Scall/

## Uso
1. Abre la página en Chrome y entra a ⚙ para pegar tu API Key de Claude
   (opcional: YouTube y voz ElevenLabs/Gemini).
2. Toca el orbe 🎤 y di, por ejemplo, "escuchar música".
3. Si responde que no lo conoce, di "sí" para crearlo con Claude, y "sí" otra
   vez para guardarlo.

## Cómo está hecho
- `index.html`: toda la app (UI + lógica de intents).
- `js/tts_elevenlabs.js`: motor de voz (navegador / ElevenLabs / Gemini TTS).
- Un intent es JSON, nunca código:
  ```json
  {"nombre":"Escuchar música","frases":["pon musica","pon musica de {x}"],
   "tipo":"musica","valor":"{x}","respuesta":"Va, pongo {x}"}
  ```
  `tipo` solo puede ser una acción del `CATALOGO` en `index.html`
  (musica, detener_musica, responder, abrir_url, buscar_web, hora, fecha,
  temporizador, preguntar_claude). `{x}` captura la parte variable de la frase.

Las keys viven solo en el localStorage de tu navegador; nada se sube al repo.
