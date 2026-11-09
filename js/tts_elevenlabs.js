// =====================================================================
// TTS ELEVENLABS — SCALL
// Voz expresiva colombiana via ElevenLabs API
// Fallback automático a Web Speech API si no hay key o falla la red
// =====================================================================

if (window._SCALL_TTS_LOADED) {
  console.warn('[TTS] Módulo ya cargado');
} else {
window._SCALL_TTS_LOADED = true;

// ── Configuración de voces ────────────────────────────────────────────
// IDs de ElevenLabs — voces en español colombiano/latino
// Para encontrar más: https://api.elevenlabs.io/v1/voices
var ELEVENLABS_VOICES = {
  // Voz principal SCALL — personalizada por el usuario
  'scall_principal': {
    id:          'VmejBeYhbrcTPwDniox7', // Voz personalizada SCALL
    name:        'SCALL Voice',
    description: 'Voz principal configurada para SCALL'
  },
  // Voces femeninas — disponibles en plan gratuito
  'ligia': {
    id:          'Xb7hH8MSUJpSbSDYk0k2',
    name:        'Ligia Mendez (Española)',
    description: 'Mujer madura, clara y calmada'
  },
  'lourdes': {
    id:          'pFZP5JQG7iQjIQuC4Bku',
    name:        'Lourdes (Latina)',
    description: 'Femenina, cálida y natural'
  },
  // Alejandro colombiano como segunda opción
  'alejandro_co': {
    id:          'pqHfZKP75CvOlQylNhV4', // Alejandro - Colombian-Latino male
    name:        'Alejandro (Colombia)',
    description: '35 años, colombiano, cálido y expresivo'
  },
  // Alternativa: voz latina neutra
  'horacio': {
    id:          'SOYHLrjzK2X1ezoPC6cr', // Horacio - Safe & Reliable
    name:        'Horacio (Latino)',
    description: 'Autoritario y amigable, español neutro'
  },
  // Alternativa masculina deep
  'eleguar': {
    id:          'onwK4e9ZLuTAKqWW03F9', // Daniel - profunda y expresiva
    name:        'Eleguar (Latino)',
    description: 'Voz dinámica y expresiva'
  }
};

// Modelo de ElevenLabs — eleven_multilingual_v2 es el mejor para español
var EL_MODEL    = 'eleven_multilingual_v2';
var EL_VOICE_ID = ELEVENLABS_VOICES['scall_principal'].id;
var EL_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech/';

// Configuración de voz — ajustar a gusto
var EL_SETTINGS = {
  stability:         0.45,  // 0-1: más bajo = más expresivo, más variado
  similarity_boost:  0.80,  // 0-1: fidelidad a la voz original
  style:             0.35,  // 0-1: estilo expresivo (0 = neutro, 1 = dramático)
  use_speaker_boost: true   // mejora la claridad
};

// ── Estado ────────────────────────────────────────────────────────────
var audioActual    = null;   // Audio element en reproducción
var colaVoz        = [];     // Cola de mensajes pendientes
var reproduciendo  = false;
var usarElevenLabs = false;  // se activa si hay key configurada
var _vocBloqueada  = false;  // bloquea voz mientras ruta narra

// ── Control de cola ───────────────────────────────────────────────────
function bloquearVoz()    { _vocBloqueada = true;  _ttsLog('[TTS] Voz bloqueada — narración activa'); }
function desbloquearVoz() { _vocBloqueada = false; _ttsLog('[TTS] Voz desbloqueada'); }

function encolarVoz(mensaje) {
  colaVoz.push(mensaje);
  if (!reproduciendo) procesarCola();
}

async function procesarCola() {
  if (reproduciendo || colaVoz.length === 0) return;
  reproduciendo = true;
  var msg = colaVoz.shift();
  var proveedor = getTtsProveedor();
  try {
    if (proveedor === 'navegador') {
      await hablarConWebSpeechPromise(msg);
    } else if (proveedor === 'gemini') {
      var geminiKey = (typeof getApiKey === 'function') ? getApiKey() : '';
      if (geminiKey) {
        await hablarConGeminiTTS(msg, geminiKey);
      } else {
        await hablarConWebSpeechPromise(msg);
      }
    } else {
      var key = getElevenLabsKey();
      if (key && key.length > 10) {
        await hablarConElevenLabs(msg, key);
      } else {
        await hablarConWebSpeechPromise(msg);
      }
    }
  } catch(e) {
    var claro = (proveedor === 'elevenlabs') ? interpretarErrorEL(e.message) : e.message;
    _ttsLog('[TTS] ⚠️ ' + proveedor + ' falló (' + claro + ') — usando voz nativa de respaldo');
    if (typeof registrarError === 'function') registrarError('TTS/' + proveedor, claro);
    await hablarConWebSpeechPromise(msg);
  }
  reproduciendo = false;
  if (colaVoz.length > 0) procesarCola();
}

// ── Obtener API Key ───────────────────────────────────────────────────
function getElevenLabsKey() {
  return localStorage.getItem('scall_elevenlabs_key') || '';
}

function setElevenLabsKey(key) {
  localStorage.setItem('scall_elevenlabs_key', key.trim());
  usarElevenLabs = key.trim().length > 10;
  _ttsLog('[TTS] ElevenLabs ' + (usarElevenLabs ? 'activado ✅' : 'desactivado'));
}

function getVozActual() {
  return localStorage.getItem('scall_el_voice') || EL_VOICE_ID;
}

function setVozActual(voiceId) {
  if (!voiceId || voiceId.length < 10) {
    _ttsLog('[TTS] ⚠️ Voice ID inválido: ' + voiceId);
    return;
  }
  localStorage.setItem('scall_el_voice', voiceId);
  EL_VOICE_ID = voiceId;
  // Actualizar también el select si está visible
  var sel = document.getElementById('elVoiceSelect');
  if (sel) sel.value = voiceId;
  // Buscar nombre de la voz
  var nombreVoz = 'Desconocida';
  Object.keys(ELEVENLABS_VOICES).forEach(function(k) {
    if (ELEVENLABS_VOICES[k].id === voiceId) nombreVoz = ELEVENLABS_VOICES[k].name;
  });
  _ttsLog('[TTS] ✅ Voz seleccionada: ' + nombreVoz + ' | ID: ' + voiceId);
  // Actualizar status en UI
  var st = document.getElementById('elStatus');
  if (st) st.textContent = '🎙 Voz: ' + nombreVoz;
}

// ── Función principal — reemplaza responderVoz ────────────────────────
async function responderVozEL(mensaje) {
  if (!mensaje || mensaje.trim().length === 0) return;

  // Si voz bloqueada por narración de ruta — ignorar duplicados de Claude
  if (_vocBloqueada) {
    _ttsLog('[TTS] Voz bloqueada — ignorando: "' + mensaje.substring(0,40) + '..."');
    return;
  }

  // Mostrar en pantalla
  var transcriptEl = document.getElementById('transcriptText');
  if (transcriptEl) transcriptEl.innerText = mensaje;

  if (typeof logMessage === 'function') logMessage('[VOZ] "' + mensaje + '"');
  if (window.scallOrb) window.scallOrb.setState('speaking');

  // Encolar en lugar de disparar directo
  encolarVoz(mensaje);
}

// ── Gemini TTS — alternativa a ElevenLabs, misma API Key de Gemini ────
var GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function getTtsProveedor() {
  return localStorage.getItem('scall_tts_proveedor') || 'elevenlabs';
}
function setTtsProveedor(p) {
  localStorage.setItem('scall_tts_proveedor', p);
  _ttsLog('[TTS] Proveedor cambiado a: ' + p);
}
function getGeminiVoiceName() {
  return localStorage.getItem('scall_gemini_voice') || 'Kore';
}
function setGeminiVoiceName(v) {
  localStorage.setItem('scall_gemini_voice', v);
}

// Gemini devuelve PCM crudo (16-bit, mono, 24kHz) en base64, sin encabezado
// de archivo — hay que envolverlo en un WAV mínimo para que <audio> lo
// pueda reproducir.
function pcmBase64AWav(base64Pcm, sampleRate, numChannels, bitsPerSample) {
  sampleRate     = sampleRate     || 24000;
  numChannels    = numChannels    || 1;
  bitsPerSample  = bitsPerSample  || 16;

  var binario   = atob(base64Pcm);
  var pcmBytes  = new Uint8Array(binario.length);
  for (var i = 0; i < binario.length; i++) pcmBytes[i] = binario.charCodeAt(i);

  var byteRate    = sampleRate * numChannels * bitsPerSample / 8;
  var blockAlign  = numChannels * bitsPerSample / 8;
  var dataSize    = pcmBytes.length;
  var buffer      = new ArrayBuffer(44 + dataSize);
  var view        = new DataView(buffer);

  function escribirStr(offset, str) {
    for (var j = 0; j < str.length; j++) view.setUint8(offset + j, str.charCodeAt(j));
  }

  escribirStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  escribirStr(8, 'WAVE');
  escribirStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  escribirStr(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: 'audio/wav' });
}

async function hablarConGeminiTTS(texto, apiKey) {
  if (audioActual) {
    audioActual.pause();
    audioActual.src = '';
    audioActual = null;
  }

  var voiceName = getGeminiVoiceName();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TTS_MODEL + ':generateContent';

  _ttsLog('[TTS] Gemini TTS → voz: ' + voiceName + ' (' + texto.length + ' chars)');

  var response = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: texto }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } }
      }
    })
  });

  if (!response.ok) {
    var errorData = await response.json().catch(function() { return {}; });
    var detalle = (errorData.error && errorData.error.message) ? errorData.error.message : ('HTTP ' + response.status);
    throw new Error(detalle);
  }

  var data   = await response.json();
  var parte  = data.candidates && data.candidates[0] && data.candidates[0].content &&
               data.candidates[0].content.parts && data.candidates[0].content.parts[0];
  var base64Pcm = parte && parte.inlineData && parte.inlineData.data;
  if (!base64Pcm) throw new Error('Gemini no devolvió audio (revisa el prompt o el modelo)');

  var blob    = pcmBase64AWav(base64Pcm, 24000, 1, 16);
  var blobUrl = URL.createObjectURL(blob);

  audioActual = new Audio(blobUrl);

  if (window._scallAudioCtx && window._scallGainNode) {
    try {
      var source = window._scallAudioCtx.createMediaElementSource(audioActual);
      source.connect(window._scallGainNode);
    } catch(e) {}
  }

  return new Promise(function(resolve, reject) {
    audioActual.onended = function() {
      URL.revokeObjectURL(blobUrl);
      audioActual = null;
      if (window.scallOrb) window.scallOrb.setState('idle');
      _ttsLog('[ORBE] 🟢 Voz Gemini terminada → idle');
      resolve();
    };
    audioActual.onerror = function() {
      URL.revokeObjectURL(blobUrl);
      audioActual = null;
      if (window.scallOrb) window.scallOrb.setState('idle');
      reject(new Error('Error reproduciendo audio de Gemini'));
    };
    audioActual.play().catch(reject);
  });
}

// ── Traduce errores comunes de ElevenLabs a mensajes claros y accionables ──
function interpretarErrorEL(mensaje) {
  if (!mensaje) return mensaje;
  if (mensaje.indexOf('library voices') !== -1 || mensaje.indexOf('upgrade your subscription') !== -1) {
    return 'Esta voz es de la Voice Library de pago — tu plan gratis no puede usarla por API. Prueba con otra voz (ej. "Lourdes"), o consigue el Voice ID de una voz gratuita/propia en tu cuenta.';
  }
  if (mensaje.indexOf('API key ID used as API key') !== -1) {
    return 'Pegaste el Key ID, no la API Key real. En ElevenLabs → Developers → API Keys, copia el valor que empieza con "sk_" (solo se muestra una vez al crearla o rotarla).';
  }
  if (mensaje.toLowerCase().indexOf('invalid api key') !== -1 || mensaje.toLowerCase().indexOf('invalid_api_key') !== -1) {
    return 'La API Key no es válida. Verifica que la copiaste completa y sin espacios.';
  }
  return mensaje;
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────
async function hablarConElevenLabs(texto, apiKey) {
  // Cancelar audio anterior
  if (audioActual) {
    audioActual.pause();
    audioActual.src = '';
    audioActual = null;
  }

  var voiceId = getVozActual();
  var url     = EL_BASE_URL + voiceId + '/stream';

  _ttsLog('[TTS] ElevenLabs → voiceId: ' + voiceId + ' (' + texto.length + ' chars)');

  var response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg'
    },
    body: JSON.stringify({
      text:           texto,
      model_id:       EL_MODEL,
      voice_settings: EL_SETTINGS
    })
  });

  if (!response.ok) {
    var errorData = await response.json().catch(function() { return {}; });
    var detalle = errorData.detail;
    var detalleTexto;
    if (detalle && typeof detalle === 'object') {
      detalleTexto = detalle.message || detalle.status || JSON.stringify(detalle);
    } else {
      detalleTexto = detalle || 'Error desconocido';
    }
    throw new Error('HTTP ' + response.status + ': ' + detalleTexto);
  }

  // Convertir respuesta a blob y reproducir
  var blob    = await response.blob();
  var blobUrl = URL.createObjectURL(blob);

  audioActual = new Audio(blobUrl);

  // Aplicar amplificador Web Audio si existe
  if (window._scallAudioCtx && window._scallGainNode) {
    try {
      var source = window._scallAudioCtx.createMediaElementSource(audioActual);
      source.connect(window._scallGainNode);
    } catch(e) {
      // Si ya está conectado, ignorar
    }
  }

  return new Promise(function(resolve, reject) {
    audioActual.onended = function() {
      URL.revokeObjectURL(blobUrl);
      audioActual = null;
      if (window.scallOrb) window.scallOrb.setState('idle');
      _ttsLog('[ORBE] 🟢 Voz ElevenLabs terminada → idle');
      resolve();
    };
    audioActual.onerror = function(e) {
      URL.revokeObjectURL(blobUrl);
      audioActual = null;
      if (window.scallOrb) window.scallOrb.setState('idle');
      reject(new Error('Error reproduciendo audio'));
    };
    audioActual.play().catch(reject);
  });
}

// ── Fallback Web Speech API ───────────────────────────────────────────
var VOCES_ES = ['Microsoft Pablo','Microsoft Jorge','Google español','Diego','Carlos','Jorge'];

function hablarConWebSpeech(mensaje) {
  hablarConWebSpeechPromise(mensaje);
}

function hablarConWebSpeechPromise(mensaje) {
  return new Promise(function(resolve) {
    window.speechSynthesis.cancel();
    var speech   = new SpeechSynthesisUtterance(mensaje);
    speech.lang  = 'es-ES';
    speech.rate  = 1.0;
    speech.pitch = 0.85;

    speech.onend = function() {
      if (window.scallOrb) window.scallOrb.setState('idle');
      _ttsLog('[ORBE] Voz Web terminada → idle');
      resolve();
    };
    speech.onerror = function() { resolve(); };

    var voces   = window.speechSynthesis.getVoices();
    var asignar = function() {
      var voz = null;
      for (var n of VOCES_ES) {
        voz = voces.find(function(v) { return v.name.toLowerCase().includes(n.toLowerCase()); });
        if (voz) break;
      }
      if (!voz) voz = voces.find(function(v) { return v.lang.startsWith('es'); }) || voces[0];
      if (voz) { speech.voice = voz; _ttsLog('[VOZ] Usando: ' + voz.name); }
      window.speechSynthesis.speak(speech);
    };

    if (voces.length > 0) asignar();
    else window.speechSynthesis.onvoiceschanged = asignar;
  });
}

// ── Detener voz actual ────────────────────────────────────────────────
function detenerVoz() {
  if (audioActual) {
    audioActual.pause();
    audioActual.src = '';
    audioActual = null;
  }
  window.speechSynthesis.cancel();
  if (window.scallOrb) window.scallOrb.setState('idle');
}

// ── Cambiar voz desde el panel de config ─────────────────────────────
function probarVozElevenLabs(texto) {
  texto = texto || '¡Hola! Soy SCALL, tu asistente personal de IIT. ¿En qué te puedo ayudar, parcero?';
  // Prioridad: lo que hay AHORA MISMO en el campo (recién pegado, aunque
  // no se haya guardado con "Activar voz" todavía) — si el campo está
  // vacío, se usa la key ya guardada de antes.
  var campo = document.getElementById('elevenLabsKeyInput');
  var key = (campo && campo.value.trim()) || getElevenLabsKey();
  if (!key) {
    alert('Primero pega tu ElevenLabs API Key en el campo de arriba.');
    return;
  }
  // Forzar sincronización del select con el ID actual
  var sel = document.getElementById('elVoiceSelect');
  if (sel && sel.value) {
    setVozActual(sel.value);
  }
  var vozId  = getVozActual();
  var st     = document.getElementById('elStatus');
  if (st) st.textContent = '⏳ Generando audio con voz ' + vozId.substring(0,8) + '...';
  _ttsLog('[TTS] Probando voz ID: ' + vozId);
  hablarConElevenLabs(texto, key).then(function() {
    if (st) st.textContent = '✅ Voz funcionando — ID: ' + vozId;
  }).catch(function(err) {
    var claro = interpretarErrorEL(err.message);
    _ttsLog('[TTS] Error prueba: ' + claro);
    if (st) st.textContent = '❌ ' + claro;
    hablarConWebSpeech(texto);
  });
}

// ── Usar caracteres eficientemente — truncar si muy largo ─────────────
// ElevenLabs cobra por caracter — optimizar frases largas
function optimizarTexto(texto) {
  // Máximo 500 caracteres por llamada para no agotar el plan gratis
  var MAX_CHARS = 500;
  if (texto.length <= MAX_CHARS) return texto;
  // Cortar en la última oración completa dentro del límite
  var truncado = texto.substring(0, MAX_CHARS);
  var ultimo   = Math.max(
    truncado.lastIndexOf('.'),
    truncado.lastIndexOf('!'),
    truncado.lastIndexOf('?')
  );
  return ultimo > 100 ? truncado.substring(0, ultimo + 1) : truncado + '...';
}

// ── Contador de caracteres usados (estimado) ──────────────────────────
function estimarUso(texto) {
  var usadoHoy = parseInt(localStorage.getItem('scall_el_chars_hoy') || '0');
  var fechaHoy = new Date().toDateString();
  var fechaGuardada = localStorage.getItem('scall_el_fecha');
  if (fechaGuardada !== fechaHoy) {
    usadoHoy = 0;
    localStorage.setItem('scall_el_fecha', fechaHoy);
  }
  usadoHoy += texto.length;
  localStorage.setItem('scall_el_chars_hoy', usadoHoy);
  _ttsLog('[TTS] Chars usados hoy: ' + usadoHoy + ' / ~10000 (plan gratis)');
  return usadoHoy;
}

// ── Inicialización ────────────────────────────────────────────────────
window.addEventListener('load', function() {
  var key = getElevenLabsKey();
  usarElevenLabs = key && key.length > 10;

  if (usarElevenLabs) {
    // Reemplazar responderVoz del app.js con la versión ElevenLabs
    window.responderVoz = responderVozEL;
    _ttsLog('[TTS] ✅ ElevenLabs activo — voz: ' + getVozActual().substring(0, 8) + '...');
  } else {
    _ttsLog('[TTS] ℹ️ ElevenLabs sin key — usando Web Speech API');
  }
});

// ── Exponer globalmente ───────────────────────────────────────────────
window.responderVozEL        = responderVozEL;
window.hablarConElevenLabs   = hablarConElevenLabs;
window.getElevenLabsKey      = getElevenLabsKey;
window.setElevenLabsKey      = setElevenLabsKey;
window.probarVozElevenLabs   = probarVozElevenLabs;
window.detenerVoz            = detenerVoz;
window.getVozActual          = getVozActual;
window.setVozActual          = setVozActual;
window.ELEVENLABS_VOICES     = ELEVENLABS_VOICES;
window.optimizarTexto        = optimizarTexto;

function _ttsLog(m) { if (typeof logMessage === 'function') logMessage(m); else console.log(m); }

_ttsLog('[TTS] Módulo ElevenLabs listo');

} // fin guard
