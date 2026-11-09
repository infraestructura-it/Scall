// =====================================================================
// motor.js — Motor de diálogo de Scall.
//
//   1. Identificar el intent   → base local (frases) → si no, Claude Haiku
//   2. Extraer slots            → de los {huecos} de la frase y de la frase completa
//   3. Diálogo y validación     → pregunta cada slot que falte, valida, reintenta
//   4. Confirmar (opcional) y ejecutar la acción
//   5. Fallback                 → 1ª vez "¿me lo repites?", 2ª vez "¿lo creo con Claude?"
//
// Depende de: slots.js, herramientas.js, claude.js (y ui.js para decir/agregar).
// =====================================================================

var DB_KEY = 'scall_asistente_intents';
var MAX_REINTENTOS_SLOT = 2;

// ── Catálogo fijo de acciones (lo único que un intent puede hacer) ────
var CATALOGO = {
  guardar_registro:    { desc: 'Guarda los datos de los slots en la base local. valor = nombre de la colección (ej. "reservas").',
                         run: async function(v, ctx){ var r = await ejecutarHerramienta('guardar_registro', { coleccion: v, datos: ctx.datos }); ctx.extra.total = r.total; } },
  consultar_registros: { desc: 'Lee en voz alta lo guardado en una colección. valor = nombre de la colección.',
                         run: async function(v){ await leerRegistros(v); } },
  musica:              { desc: 'Reproduce música/video de YouTube. valor = búsqueda (ej. "salsa clásica").', run: function(v){ reproducirMusicaAsist(v); } },
  detener_musica:      { desc: 'Detiene la música. valor = "".', run: function(){ detenerMusicaAsist(); } },
  responder:           { desc: 'Solo responde con la respuesta del intent. valor = "".', run: function(){} },
  abrir_url:           { desc: 'Abre una página web en pestaña nueva. valor = URL https://...', run: function(v){ abrirPestana(v); } },
  buscar_web:          { desc: 'Busca en Google en pestaña nueva. valor = texto a buscar.', run: function(v){ abrirPestana('https://www.google.com/search?q=' + encodeURIComponent(v)); } },
  hora:                { desc: 'Dice la hora actual. valor = "".', run: function(){ decir('Son las ' + new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })); } },
  fecha:               { desc: 'Dice la fecha de hoy. valor = "".', run: function(){ decir('Hoy es ' + new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })); } },
  temporizador:        { desc: 'Avisa después de N minutos. valor = minutos (ej. "{minutos}").', run: function(v){ temporizador(v); } },
  preguntar_claude:    { desc: 'Pregunta algo a Claude y lee la respuesta. valor = la pregunta.', run: async function(v){ decir(await preguntarAClaude(v) || 'No obtuve respuesta.'); } }
};

// ── Base local de intents ─────────────────────────────────────────────
function leerDB() {
  try { var a = JSON.parse(localStorage.getItem(DB_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function guardarDB(arr) { localStorage.setItem(DB_KEY, JSON.stringify(arr)); }

function validarIntent(i) {
  if (!i || typeof i.nombre !== 'string' || !CATALOGO[i.tipo] || !Array.isArray(i.frases) || !i.frases.length) return false;
  i.slots = Array.isArray(i.slots) ? i.slots.filter(function(s){ return s && /^[a-z_][a-z0-9_]*$/.test(s.nombre || ''); }) : [];
  i.confirmar = !!i.confirmar;
  return true;
}

// ── 1) Identificar el intent por frases ───────────────────────────────
// Gana la frase más específica (más texto literal), no la primera.
// {nombre} captura lo dicho en esa posición. Palabras completas: "desactiva" ≠ "activa".
function buscarIntent(texto) {
  var t = ' ' + normalizar(texto) + ' ', mejor = null;
  leerDB().forEach(function(intent) {
    (intent.frases || []).forEach(function(frase) {
      var nombres = [];
      var f = normalizar(frase.replace(/\{(\w+)\}/g, function(_, n){ nombres.push(n.toLowerCase()); return ' zzslot' + (nombres.length - 1) + 'zz '; }));
      if (!f) return;
      var patron = f.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&').replace(/zzslot(\d+)zz/g, function(_, k){ return +k === nombres.length - 1 ? '(.+)' : '(.+?)'; });
      var m = t.match(new RegExp(' ' + patron + ' '));
      if (!m) return;
      var puntaje = f.replace(/zzslot\d+zz/g, '').replace(/\s+/g, '').length;
      if (!mejor || puntaje > mejor.puntaje) {
        var capturas = {};
        nombres.forEach(function(n, k){ capturas[n] = (m[k + 1] || '').trim(); });
        mejor = { intent: intent, capturas: capturas, puntaje: puntaje };
      }
    });
  });
  return mejor;
}

// ── Estado del diálogo ────────────────────────────────────────────────
// null | {tipo:'slot', ctx, slot, intentos} | {tipo:'confirmar', ctx}
//      | {tipo:'crear', texto} | {tipo:'guardar', intent, texto}
var pendiente = null;
var fallosSeguidos = 0;

function esSi(t)       { return /^(si|claro|dale|ok|okay|de una|hazlo|correcto|listo|confirmo|vale|por favor)\b/.test(normalizar(t)); }
function esNo(t)       { return /^(no|nel|negativo)\b/.test(normalizar(t)); }
function esCancelar(t) { return /\b(cancela|cancelar|olvidalo|dejalo|ya no|salir)\b/.test(normalizar(t)); }

async function procesar(texto) {
  texto = (texto || '').trim();
  if (!texto) return;
  agregar('yo', texto);
  limpiarOpciones();
  var n = normalizar(texto);

  // ── Respuesta a algo pendiente (se limpia ANTES: nunca se queda atascado)
  if (pendiente) {
    var p = pendiente; pendiente = null;
    if (p.tipo === 'slot')      return responderSlot(p, texto);
    if (p.tipo === 'confirmar') {
      if (esSi(texto)) return ejecutarIntent(p.ctx);
      decir('Listo, cancelado. No guardé nada.'); return;
    }
    if (p.tipo === 'crear' || p.tipo === 'guardar') {
      if (esSi(texto)) return p.tipo === 'crear' ? crearIntent(p.texto) : guardarIntentNuevo(p.intent, p.texto);
      if (esNo(texto) || esCancelar(texto)) { decir('Listo, no hago nada.'); return; }
      // ni sí ni no → se trata como comando nuevo
    }
  }

  // ── Comandos mínimos del sistema
  if (/^(para|detente|stop|silencio|callate)\b/.test(n)) { if (typeof detenerVoz === 'function') detenerVoz(); detenerMusicaAsist(); decir('Listo.'); return; }
  if (esCancelar(texto)) { decir('No hay nada pendiente.'); return; }
  if (/(que sabes hacer|que puedes hacer|mis comandos|lista de intents)/.test(n)) { listarPorVoz(); return; }

  // ── 1a) Base local
  var hit = buscarIntent(texto);
  if (hit) {
    agregar('sis', '✔ intent local: ' + hit.intent.nombre);
    return iniciarIntent(hit.intent, texto, hit.capturas);
  }

  // ── 1b) Claude Haiku elige entre los intents existentes (si hay key)
  var db = leerDB();
  if (db.length && getClaudeKey()) {
    estado('Entendiendo…', 'pensando');
    try {
      var c = await clasificarIntent(texto, db);
      if (c) {
        var caps = {};
        c.slots.forEach(function(s){ caps[s.nombre] = s.valor; });
        agregar('sis', '🧠 Claude lo reconoció como: ' + c.intent.nombre);
        estado('Toca el orbe y habla');
        return iniciarIntent(c.intent, texto, caps);
      }
    } catch (e) { agregar('sis', 'Clasificador: ' + e.message); }
    estado('Toca el orbe y habla');
  }

  // ── 5) Fallback en dos pasos
  fallosSeguidos++;
  if (fallosSeguidos === 1) { decir('Perdón, no te entendí. ¿Me lo repites con otras palabras?'); return; }
  pendiente = { tipo: 'crear', texto: texto };
  preguntarSiNo('Sigo sin tener un intent para "' + texto + '". ¿Quieres que lo cree con ayuda de Claude?');
}

// ── 2) Llenar slots a partir de la primera frase ─────────────────────
function iniciarIntent(intent, texto, capturas) {
  fallosSeguidos = 0;
  var ctx = { intent: intent, valores: {}, textos: {}, extra: {} };
  capturas = capturas || {};
  // Huecos que no son slots declarados (ej. el {x} de intents viejos) → texto libre
  Object.keys(capturas).forEach(function(k){
    if (!intent.slots.some(function(s){ return s.nombre === k; }) && capturas[k]) { ctx.valores[k] = capturas[k]; ctx.textos[k] = capturas[k]; }
  });
  intent.slots.forEach(function(s) {
    var r = capturas[s.nombre] ? validarSlot(s, capturas[s.nombre]) : null;
    if (!r && slotDetectable(s)) r = validarSlot(s, texto);   // "reservar hotel para mañana"
    if (r) { ctx.valores[s.nombre] = r.valor; ctx.textos[s.nombre] = r.texto; }
  });
  continuar(ctx);
}

// ── 3) Diálogo: pedir lo que falte ────────────────────────────────────
function continuar(ctx) {
  var falta = ctx.intent.slots.find(function(s){ return !(s.nombre in ctx.valores); });
  if (falta) return pedirSlot(ctx, falta, 0);
  if (ctx.intent.confirmar) {
    pendiente = { tipo: 'confirmar', ctx: ctx };
    var resumen = ctx.intent.slots.map(function(s){ return etiqueta(s.nombre) + ': ' + ctx.textos[s.nombre]; }).join(', ');
    return preguntarSiNo('Confirmo: ' + resumen + '. ¿Lo hago?');
  }
  ejecutarIntent(ctx);
}

function pedirSlot(ctx, slot, intentos) {
  pendiente = { tipo: 'slot', ctx: ctx, slot: slot, intentos: intentos };
  var msg = slot.pregunta || ('¿Cuál es ' + etiqueta(slot.nombre) + '?');
  decir(intentos ? ayudaSlot(slot) + ' ' + msg : msg);
  if (slot.tipo === 'opcion' && (slot.opciones || []).length) {
    mostrarOpciones(slot.opciones.map(function(o){ return { t: o, f: function(){ procesar(o); } }; })
      .concat([{ t: 'Cancelar', no: true, f: function(){ procesar('cancelar'); } }]));
  }
}

function responderSlot(p, texto) {
  if (esCancelar(texto)) { decir('Listo, cancelado.'); return; }
  var r = validarSlot(p.slot, texto);
  if (r) {
    p.ctx.valores[p.slot.nombre] = r.valor; p.ctx.textos[p.slot.nombre] = r.texto;
    // Por si en la misma respuesta vinieron otros datos ("el viernes, doble")
    p.ctx.intent.slots.forEach(function(s){
      if (!(s.nombre in p.ctx.valores) && slotDetectable(s)) { var o = validarSlot(s, texto); if (o) { p.ctx.valores[s.nombre] = o.valor; p.ctx.textos[s.nombre] = o.texto; } }
    });
    return continuar(p.ctx);
  }
  if (p.intentos + 1 >= MAX_REINTENTOS_SLOT) { decir('No logré entender ' + etiqueta(p.slot.nombre) + '. Lo dejamos aquí; cuando quieras lo intentamos de nuevo.'); return; }
  pedirSlot(p.ctx, p.slot, p.intentos + 1);
}

function ayudaSlot(s) {
  if (s.tipo === 'fecha')  return 'No entendí la fecha. Puedes decir "mañana", "el viernes" o "15 de diciembre".';
  if (s.tipo === 'numero') return 'Necesito un número.';
  if (s.tipo === 'opcion') return 'Las opciones son: ' + (s.opciones || []).join(', ') + '.';
  return 'No te entendí.';
}

function etiqueta(nombre) { return nombre.replace(/_/g, ' '); }

// ── 4) Ejecutar ───────────────────────────────────────────────────────
function plantilla(s, ctx) {
  return (s || '').replace(/\{(\w+)\}/g, function(_, k){
    k = k.toLowerCase();
    if (k in ctx.textos) return ctx.textos[k];
    if (k in ctx.extra)  return ctx.extra[k];
    return '';
  }).replace(/\s+/g, ' ').trim();
}

async function ejecutarIntent(ctx) {
  var intent = ctx.intent, accion = CATALOGO[intent.tipo];
  ctx.datos = Object.assign({ intent: intent.nombre }, ctx.valores);
  try {
    await accion.run(plantilla(intent.valor, ctx), ctx);
    if (intent.respuesta) decir(plantilla(intent.respuesta, ctx));
  } catch (e) {
    decir(e.message === 'SIN_KEY' ? 'Necesito la API Key de Claude. Configúrala en el engranaje.' : 'Algo falló ejecutando ' + intent.nombre + '.');
    console.error(e);
  }
  if (typeof renderDatos === 'function') renderDatos();
}

async function leerRegistros(coleccion) {
  var r = await ejecutarHerramienta('consultar_registros', { coleccion: coleccion });
  var regs = r.registros;
  if (!regs.length) { decir('No tienes ' + coleccion + ' guardadas todavía.'); return; }
  var ult = regs.slice(-3).map(function(reg){
    return Object.keys(reg).filter(function(k){ return ['id', 'creado', 'intent'].indexOf(k) === -1; })
      .map(function(k){
        var v = reg[k], m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (m) v = _fechaResultado(new Date(+m[1], m[2] - 1, +m[3])).texto;   // "2026-11-13" → "viernes, 13 de noviembre"
        return etiqueta(k) + ' ' + v;
      }).join(', ');
  });
  decir('Tienes ' + regs.length + ' en ' + coleccion + '. ' + (regs.length > 3 ? 'Las últimas 3: ' : '') + ult.join('. ') + '.');
}

// ── Crear intent nuevo con Claude ─────────────────────────────────────
async function crearIntent(texto) {
  if (!getClaudeKey()) { decir('Necesito la API Key de Claude. Ábrela en el engranaje.'); abrirPanel('panelConfig'); return; }
  estado('Creando intent con Claude…', 'pensando');
  try {
    var intent = await crearIntentConClaude(texto, CATALOGO, leerDB().map(function(i){
      return i.nombre + (i.tipo === 'guardar_registro' || i.tipo === 'consultar_registros' ? ' (colección ' + i.valor + ')' : '');
    }).join(', ') || '(ninguno)');
    if (!validarIntent(intent)) throw new Error('Claude no devolvió un intent válido');
    agregar('sis', '🧩 Propuesta:\n' + JSON.stringify(intent, null, 2));
    pendiente = { tipo: 'guardar', intent: intent, texto: texto };
    var datos = intent.slots.length ? ' Te va a preguntar: ' + intent.slots.map(function(s){ return etiqueta(s.nombre); }).join(', ') + '.' : '';
    preguntarSiNo('Lo llamé ' + intent.nombre + '.' + datos + ' ¿Lo guardo y lo usamos?');
  } catch (e) {
    decir(e.message === 'SIN_KEY' ? 'Necesito la API Key de Claude.' : 'No pude crear el intent. ' + e.message);
  } finally { estado('Toca el orbe y habla'); }
}

function guardarIntentNuevo(intent, texto) {
  intent.id = 'i_' + Date.now();
  intent.creado = new Date().toISOString();
  var db = leerDB(); db.push(intent); guardarDB(db);
  if (typeof renderIntents === 'function') renderIntents();
  agregar('sis', '💾 Intent guardado: ' + intent.nombre);
  var hit = buscarIntent(texto);
  iniciarIntent(intent, texto, hit && hit.intent.id === intent.id ? hit.capturas : {});
}

// ── Acciones de apoyo ─────────────────────────────────────────────────
var ytPlayerAsist = null, ytCola = [], ytIdx = 0;

function abrirPestana(url) {
  var w = window.open(url, '_blank');
  if (!w) agregar('sis', '🔗 El navegador bloqueó la pestaña. Ábrela aquí: ' + url);
}

function cargarYT() {
  return new Promise(function(res) {
    if (window.YT && YT.Player) return res();
    var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    var t = setInterval(function(){ if (window.YT && YT.Player) { clearInterval(t); res(); } }, 200);
  });
}

async function reproducirMusicaAsist(busqueda) {
  busqueda = busqueda || 'musica';
  var key = (localStorage.getItem('youtubeApiKey') || '').trim();
  if (!key) { abrirPestana('https://www.youtube.com/results?search_query=' + encodeURIComponent(busqueda)); return; }
  try {
    var r = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=' + encodeURIComponent(busqueda) + '&key=' + key);
    var d = await r.json();
    if (d.error) throw new Error(d.error.message);
    ytCola = (d.items || []).map(function(i){ return i.id.videoId; }).filter(Boolean);
    if (!ytCola.length) { decir('No encontré nada para ' + busqueda); return; }
    ytIdx = 0;
    await cargarYT();
    document.getElementById('player').hidden = false;
    if (ytPlayerAsist) { ytPlayerAsist.loadVideoById(ytCola[0]); return; }
    ytPlayerAsist = new YT.Player('ytDiv', {
      width: '100%', height: '100%', videoId: ytCola[0],
      playerVars: { autoplay: 1, playsinline: 1 },
      events: {
        onReady: function(e){ e.target.playVideo(); },
        onStateChange: function(e){ if (e.data === 0 && ytIdx < ytCola.length - 1) ytPlayerAsist.loadVideoById(ytCola[++ytIdx]); },
        onError: function(){ if (ytIdx < ytCola.length - 1) ytPlayerAsist.loadVideoById(ytCola[++ytIdx]); }  // 101/150: embed bloqueado → siguiente
      }
    });
  } catch (e) {
    agregar('sis', 'YouTube: ' + e.message);
    abrirPestana('https://www.youtube.com/results?search_query=' + encodeURIComponent(busqueda));
  }
}

function detenerMusicaAsist() {
  if (ytPlayerAsist && ytPlayerAsist.stopVideo) ytPlayerAsist.stopVideo();
  var p = document.getElementById('player'); if (p) p.hidden = true;
}

function temporizador(v) {
  var r = VALIDADORES.numero(String(v));
  if (!r || r.valor <= 0) { decir('No entendí cuántos minutos.'); return; }
  setTimeout(function(){ decir('¡Tiempo! Pasaron ' + r.valor + ' minutos.'); }, r.valor * 60000);
}

function listarPorVoz() {
  var db = leerDB();
  if (!db.length) { decir('Todavía no tengo intents. Pídeme algo y te ofrezco crearlo.'); return; }
  decir('Sé hacer ' + db.length + ' cosas: ' + db.map(function(i){ return etiqueta(i.nombre.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()); }).join(', ') + '.');
}

// Compatibilidad: intents del formato anterior (sin slots) siguen funcionando
(function migrar() {
  var db = leerDB(), cambio = false;
  db.forEach(function(i){ if (!Array.isArray(i.slots)) { i.slots = []; i.confirmar = false; cambio = true; } });
  if (cambio) guardarDB(db);
})();
