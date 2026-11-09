# Scall

Asistente de voz en el navegador, basado en **intents + slots**:

1. **Intent**: identifica qué quieres. Primero busca en las frases guardadas
   (gratis, local). Si no coincide, Claude Haiku elige entre tus intents
   existentes.
2. **Slots**: saca los datos de tu frase ("reservar habitación para el 15 de
   diciembre" → `fecha_llegada`).
3. **Diálogo y validación**: pregunta lo que falte ("¿Cuántas noches?"), valida
   la respuesta (fecha, número, opción) y la vuelve a pedir si no sirve.
4. **Ejecución**: si el intent lo pide, confirma primero y luego ejecuta la
   acción (por ejemplo, guardar la reserva).
5. **Fallback**: la primera vez que no entiende, pide que repitas. La segunda
   vez ofrece crear el intent con ayuda de Claude.

**En vivo:** https://infraestructura-it.com/Scall/

## Uso
1. Abre la página en Chrome y entra a ⚙ para pegar tu API Key de Claude (solo para crear intents).
2. Entra a 🎙 Voz y graba cada frase 3 veces (Scall reconoce con su propio código, sin keys).
3. Toca el orbe 🎤 y di una frase grabada, por ejemplo "qué más pues".
4. Si no lo conoce, acepta crearlo con Claude, y desde ahí responde las
   preguntas.
5. 📦 Datos muestra lo guardado; 📚 Intents muestra los intents creados.

## Estructura
| Archivo | Qué hace |
|---|---|
| `js/motor.js` | Motor de diálogo: intent → slots → validación → confirmar → ejecutar → fallback. Catálogo de acciones. |
| `js/slots.js` | Tipos de slot y validadores (`texto`, `numero`, `fecha`, `opcion`). |
| `js/herramientas.js` | Capa de datos con forma de MCP (`guardar_registro`, `consultar_registros`). Hoy usa localStorage. |
| `js/claude.js` | Llamadas a Claude: clasificar (Haiku), crear intents (Opus), preguntas libres. |
| `js/voz_propia.js` | Reconocimiento propio: captura de micrófono → preprocesado → MFCC (FFT propia) → DTW contra patrones grabados. Panel 🎙 Voz. |
| `js/intents_bogota.js` | Frases comunes de Bogotá como intents (se siembran solos). |
| `js/ui.js` | Voz, micrófono, chat, paneles y configuración. |
| `js/tts_elevenlabs.js` | Motor de voz (navegador / ElevenLabs / Gemini TTS). |

## Voz propia (pasos 1-4 sin terceros)
1. **Audio Input**: `getUserMedia` + detección de inicio/fin de frase.
2. **Preprocessing**: preénfasis, recorte de silencio, normalización de volumen.
3. **Feature Extraction**: MFCC con FFT propia.
4. **Pattern Recognition**: DTW contra tus grabaciones (se rechaza lo dudoso).
5. **Language Processing**: `procesar()` en `motor.js`.

Es un reconocedor de **frases cerradas** dependiente del hablante: solo entiende
lo que grabaste. Las frases con `{hueco}` se escriben, no se dicen.

## Un intent
```json
{
  "nombre": "ReservarHotel",
  "frases": ["quiero reservar un hotel", "reservar habitacion para {fecha_llegada}"],
  "slots": [
    {"nombre": "fecha_llegada", "tipo": "fecha", "pregunta": "¿Para qué fecha deseas la reserva?", "opciones": []},
    {"nombre": "noches", "tipo": "numero", "pregunta": "¿Cuántas noches?", "opciones": []},
    {"nombre": "tipo_habitacion", "tipo": "opcion", "pregunta": "¿Sencilla, doble o suite?", "opciones": ["sencilla", "doble", "suite"]}
  ],
  "confirmar": true,
  "tipo": "guardar_registro",
  "valor": "reservas",
  "respuesta": "Listo, reservé {noches} noches desde el {fecha_llegada}, habitación {tipo_habitacion}."
}
```
Un intent es solo datos: `tipo` tiene que ser una acción del `CATALOGO` de
`js/motor.js`. Ningún código generado por la IA se ejecuta.

## Hacia MCP
Las acciones de datos pasan por `ejecutarHerramienta(nombre, args)` en
`js/herramientas.js`. Cuando exista un servidor MCP, solo se reemplaza esa
función por un `tools/call` real. Los intents y el motor no cambian.

Las keys y los datos viven solo en el localStorage de tu navegador; nada se
sube al repo.
