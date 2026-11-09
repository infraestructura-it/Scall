// =====================================================================
// claude.js — Llamadas a la API de Claude (desde el navegador).
//   clasificarIntent(): con Haiku, elige cuál intent existente quiso decir
//                       el usuario y extrae slots (cuando no hubo match local).
//   crearIntentConClaude(): diseña un intent nuevo (JSON, sin código).
//   preguntarAClaude(): respuesta corta para leer en voz alta.
// =====================================================================

function getClaudeKey() { return (localStorage.getItem('claudeApiKey') || '').trim(); }
function getModelo()    { return (localStorage.getItem('scall_asistente_modelo') || 'claude-opus-5-5').trim(); }
var MODELO_CLASIFICADOR = 'claude-haiku-5-5';

async function llamarClaude(body) {
  var key = getClaudeKey();
  if (!key) throw new Error('SIN_KEY');
  body.model = body.model || getModelo();
  var headers = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  // Respaldo del servidor si el modelo rechaza la petición (Opus/Sonnet/Fable 5.x; Haiku no lo tiene)
  if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(body.model)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: headers, body: JSON.stringify(body) });
  var data = await r.json().catch(function(){ return {}; });
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + ((data.error && data.error.message) || 'error'));
  if (data.stop_reason === 'refusal') throw new Error('Claude rechazó la petición');
  return data;
}

function _toolInput(data, nombre) {
  var b = (data.content || []).find(function(x){ return x.type === 'tool_use' && x.name === nombre; });
  if (b) return b.input;
  var txt = (data.content || []).filter(function(x){ return x.type === 'text'; }).map(function(x){ return x.text; }).join('');
  var m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// ── Clasificador (el "aprendizaje automático" del diseño) ─────────────
async function clasificarIntent(texto, intents) {
  var nombres = intents.map(function(i){ return i.nombre; });
  var catalogo = intents.map(function(i){
    return '- ' + i.nombre + ' | ejemplos: ' + (i.frases || []).slice(0, 4).join(' / ') +
      ((i.slots || []).length ? ' | slots: ' + i.slots.map(function(s){ return s.nombre + ' (' + s.tipo + ')'; }).join(', ') : '');
  }).join('\n');
  var data = await llamarClaude({
    model: MODELO_CLASIFICADOR,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    tools: [{
      name: 'clasificar',
      description: 'Indica qué intent corresponde a la frase y los valores de slot que contiene.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['intent', 'slots'],
        properties: {
          intent: { type: 'string', enum: nombres.concat(['ninguno']) },
          slots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nombre', 'valor'],
            properties: { nombre: { type: 'string' }, valor: { type: 'string' } } } }
        }
      }
    }],
    tool_choice: { type: 'auto' },
    system: 'Clasificas frases habladas de un asistente de voz en español colombiano. Llama siempre a la herramienta clasificar, una vez. ' +
      'Usa "ninguno" si la frase no pide claramente ninguno de estos intents (no fuerces una coincidencia). ' +
      'En slots incluye solo los valores que la frase dice explícitamente, copiados tal como los dijo.\nIntents:\n' + catalogo,
    messages: [{ role: 'user', content: texto }]
  });
  var r = _toolInput(data, 'clasificar');
  if (!r || r.intent === 'ninguno') return null;
  var intent = intents.find(function(i){ return i.nombre === r.intent; });
  return intent ? { intent: intent, slots: r.slots || [] } : null;
}

// ── Creador de intents ────────────────────────────────────────────────
async function crearIntentConClaude(texto, catalogo, existentes) {
  var acciones = Object.keys(catalogo).map(function(k){ return '- ' + k + ': ' + catalogo[k].desc; }).join('\n');
  var data = await llamarClaude({
    max_tokens: 6000,
    output_config: { effort: 'low' },
    tools: [{
      name: 'crear_intent',
      description: 'Registra un intent de voz nuevo para el asistente Scall.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false,
        required: ['nombre', 'frases', 'slots', 'confirmar', 'tipo', 'valor', 'respuesta'],
        properties: {
          nombre:    { type: 'string', description: 'Nombre en PascalCase, ej. ReservarHotel' },
          frases:    { type: 'array', items: { type: 'string' }, description: '5 a 8 frases en minúsculas sin tildes. Puede llevar {nombre_slot} donde el usuario dice ese dato.' },
          slots:     { type: 'array', items: { type: 'object', additionalProperties: false,
                         required: ['nombre', 'tipo', 'pregunta', 'opciones'],
                         properties: {
                           nombre:   { type: 'string', description: 'snake_case, ej. fecha_llegada' },
                           tipo:     { type: 'string', enum: ['texto', 'numero', 'fecha', 'opcion'] },
                           pregunta: { type: 'string', description: 'Lo que Scall pregunta si falta este dato' },
                           opciones: { type: 'array', items: { type: 'string' }, description: 'Solo para tipo opcion; [] en otro caso' }
                         } } },
          confirmar: { type: 'boolean', description: 'true si la acción guarda datos o es difícil de deshacer' },
          tipo:      { type: 'string', enum: Object.keys(catalogo) },
          valor:     { type: 'string', description: 'Parámetro de la acción. Puede usar {nombre_slot}.' },
          respuesta: { type: 'string', description: 'Lo que Scall dice al terminar. Puede usar {nombre_slot}.' }
        }
      }
    }],
    tool_choice: { type: 'auto' },
    system:
      'Diseñas intents para Scall, un asistente de voz en español colombiano. Un intent tiene frases que lo activan, ' +
      'slots (datos que necesita; Scall los pregunta si faltan) y UNA acción de este catálogo cerrado:\n' + acciones + '\n\n' +
      'Reglas: llama siempre a la herramienta crear_intent, una vez. Las frases cubren maneras comunes de pedir lo mismo, ' +
      'algunas sin datos y otras con {nombre_slot}. Pide en slots solo lo necesario (máx. 4). ' +
      'Si el pedido es guardar o registrar algo (reservas, citas, pedidos, gastos, notas…) usa guardar_registro con valor = nombre de la colección en plural (ej. "reservas"); ' +
      'si es consultar lo guardado, usa consultar_registros con la misma colección. ' +
      'Ejemplo: "quiero reservar un hotel" → ReservarHotel, slots fecha_llegada (fecha), noches (numero), tipo_habitacion (opcion: sencilla, doble, suite), confirmar true, guardar_registro "reservas". ' +
      'Si nada del catálogo encaja, usa preguntar_claude. Intents existentes (no los dupliques; puedes reutilizar sus colecciones): ' + existentes,
    messages: [{ role: 'user', content: 'El usuario dijo: "' + texto + '". Crea el intent.' }]
  });
  return _toolInput(data, 'crear_intent');
}

async function preguntarAClaude(pregunta) {
  var data = await llamarClaude({
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: 'Eres Scall, asistente de voz en español colombiano. Responde en 1 a 3 frases, sin listas ni formato: se va a leer en voz alta.',
    messages: [{ role: 'user', content: pregunta }]
  });
  return (data.content || []).filter(function(b){ return b.type === 'text'; }).map(function(b){ return b.text; }).join(' ').trim();
}
