// =====================================================================
// ui.js — Voz, micrófono, chat y paneles. Sin lógica de intents.
// =====================================================================

// tts_elevenlabs.js usa getApiKey() para la ruta de Gemini TTS
function getApiKey() {
  var k = localStorage.getItem('geminiApiKey');
  return (k && k.trim()) ? k.trim() : '';
}

// ── Voz (motor de tts_elevenlabs.js: navegador / ElevenLabs / Gemini) ─
function decir(t) {
  if (!t) return;
  agregar('scall', t);
  if (typeof encolarVoz === 'function') encolarVoz(t);
  else if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(t); u.lang = 'es-CO'; speechSynthesis.speak(u); }
}

function preguntarSiNo(msg) {
  decir(msg);
  mostrarOpciones([{ t: 'Sí', f: function(){ procesar('sí'); } }, { t: 'No', no: true, f: function(){ procesar('no'); } }]);
}

// ── Micrófono ─────────────────────────────────────────────────────────
var rec = null, escuchando = false;
function toggleMic() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { agregar('sis', 'Este navegador no reconoce voz. Usa Chrome o escribe abajo.'); return; }
  if (escuchando) { rec.stop(); return; }
  if (typeof detenerVoz === 'function') detenerVoz();   // que no se escuche a sí mismo
  rec = new SR(); rec.lang = 'es-CO'; rec.interimResults = false;
  rec.onstart  = function(){ escuchando = true;  estado('Escuchando…', 'escuchando'); };
  rec.onend    = function(){ escuchando = false; estado('Toca el orbe y habla'); };
  rec.onerror  = function(e){ if (e.error !== 'no-speech') agregar('sis', 'Micrófono: ' + e.error); };
  rec.onresult = function(e){ procesar(e.results[0][0].transcript); };
  rec.start();
}

// ── Chat ──────────────────────────────────────────────────────────────
function agregar(clase, t) {
  var c = document.getElementById('chat'), d = document.createElement('div');
  d.className = 'msg ' + clase; d.textContent = t; c.appendChild(d); c.scrollTop = c.scrollHeight;
}
function estado(t, modo) {
  document.getElementById('estado').textContent = t;
  document.getElementById('orbe').className = modo || '';
}
function mostrarOpciones(ops) {
  var o = document.getElementById('opciones'); o.innerHTML = '';
  ops.forEach(function(op){ var b = document.createElement('button'); b.textContent = op.t; if (op.no) b.className = 'no'; b.onclick = op.f; o.appendChild(b); });
}
function limpiarOpciones() { document.getElementById('opciones').innerHTML = ''; }

// ── Paneles ───────────────────────────────────────────────────────────
function abrirPanel(id) {
  cerrarPaneles();
  if (id === 'panelConfig') cargarConfig();
  if (id === 'panelDatos') renderDatos();
  if (id === 'panelIntents') renderIntents();
  document.getElementById(id).hidden = false;
}
function cerrarPaneles() { document.querySelectorAll('.panel').forEach(function(p){ p.hidden = true; }); }

function _el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

function renderIntents() {
  var cont = document.getElementById('listaIntents'), db = leerDB();
  cont.innerHTML = '';
  if (!db.length) { cont.appendChild(_el('p', 'hint', 'Vacío. Di algo como "quiero reservar un hotel" y acepta crearlo.')); return; }
  db.forEach(function(i) {
    var d = _el('div', 'intent');
    var del = _el('button', 'btn del', 'Borrar');
    del.onclick = function(){ guardarDB(leerDB().filter(function(x){ return x.id !== i.id; })); renderIntents(); };
    d.appendChild(del);
    d.appendChild(_el('b', null, i.nombre));
    d.appendChild(_el('code', null, ' ' + i.tipo + ' → "' + i.valor + '"' + (i.confirmar ? ' · confirma' : '')));
    if (i.slots.length) d.appendChild(_el('div', 'hint', 'Slots: ' + i.slots.map(function(s){ return s.nombre + ' (' + s.tipo + (s.opciones && s.opciones.length ? ': ' + s.opciones.join('/') : '') + ')'; }).join(', ')));
    d.appendChild(_el('div', 'hint', 'Frases: ' + i.frases.join(' | ')));
    cont.appendChild(d);
  });
}

function renderDatos() {
  var cont = document.getElementById('listaDatos');
  if (!cont) return;
  cont.innerHTML = '';
  var cols = listarColecciones();
  if (!cols.length) { cont.appendChild(_el('p', 'hint', 'Todavía no hay datos guardados.')); return; }
  cols.forEach(function(c) {
    var regs = HERRAMIENTAS_LOCALES.consultar_registros({ coleccion: c }).registros;
    var d = _el('div', 'intent');
    var del = _el('button', 'btn del', 'Borrar todo');
    del.onclick = function(){ borrarColeccion(c); renderDatos(); };
    d.appendChild(del);
    d.appendChild(_el('b', null, c + ' (' + regs.length + ')'));
    regs.slice().reverse().forEach(function(r) {
      var campos = Object.keys(r).filter(function(k){ return ['id', 'creado', 'intent'].indexOf(k) === -1; })
        .map(function(k){ return k + ': ' + r[k]; }).join(' · ');
      d.appendChild(_el('div', 'hint', new Date(r.creado).toLocaleString('es-CO') + ' — ' + campos));
    });
    cont.appendChild(d);
  });
}

function exportarIntents() {
  document.getElementById('zonaImportar').hidden = false;
  document.getElementById('jsonImportar').value = JSON.stringify(leerDB(), null, 2);
  agregar('sis', 'JSON listo en el panel para copiar.');
}
function mostrarImportar() { document.getElementById('zonaImportar').hidden = false; document.getElementById('jsonImportar').value = ''; }
function importarIntents() {
  try {
    var arr = JSON.parse(document.getElementById('jsonImportar').value);
    if (!Array.isArray(arr)) arr = [arr];
    var ok = arr.filter(validarIntent);
    guardarDB(leerDB().concat(ok.map(function(i, n){ i.id = i.id || ('i_' + Date.now() + '_' + n); return i; })));
    renderIntents();
    agregar('sis', 'Importados ' + ok.length + ' de ' + arr.length + ' intents.');
  } catch (e) { agregar('sis', 'JSON inválido: ' + e.message); }
}

// ── Configuración ─────────────────────────────────────────────────────
function _v(id) { return document.getElementById(id).value.trim(); }
function cargarConfig() {
  document.getElementById('estClaude').textContent = getClaudeKey() ? '✅ configurada' : '❌ falta';
  document.getElementById('estYT').textContent = localStorage.getItem('youtubeApiKey') ? '✅ configurada' : '— no configurada';
  document.getElementById('estEL').textContent = localStorage.getItem('scall_elevenlabs_key') ? '✅ configurada' : '❌ falta';
  document.getElementById('estGem').textContent = getApiKey() ? '✅ configurada' : '❌ falta';
  document.getElementById('cfgModelo').value = getModelo();
  document.getElementById('cfgProveedor').value = localStorage.getItem('scall_tts_proveedor') || 'navegador';
  document.getElementById('cfgELVoz').value = localStorage.getItem('scall_el_voice') || '';
  document.getElementById('cfgGemVoz').value = localStorage.getItem('scall_gemini_voice') || '';
  ['cfgClaude', 'cfgYT', 'cfgEL', 'cfgGem'].forEach(function(id){ document.getElementById(id).value = ''; });
  mostrarCamposVoz();
}
function mostrarCamposVoz() {
  var p = document.getElementById('cfgProveedor').value;
  document.getElementById('camposEL').hidden = p !== 'elevenlabs';
  document.getElementById('camposGemini').hidden = p !== 'gemini';
}
function guardarConfig() {
  var pares = { claudeApiKey: 'cfgClaude', youtubeApiKey: 'cfgYT', scall_elevenlabs_key: 'cfgEL', scall_el_voice: 'cfgELVoz', geminiApiKey: 'cfgGem', scall_gemini_voice: 'cfgGemVoz' };
  Object.keys(pares).forEach(function(k){ var v = _v(pares[k]); if (v) localStorage.setItem(k, v); });   // vacío = no cambiar
  localStorage.setItem('scall_asistente_modelo', _v('cfgModelo') || 'claude-opus-5-5');
  localStorage.setItem('scall_tts_proveedor', document.getElementById('cfgProveedor').value);
  cargarConfig(); agregar('sis', 'Configuración guardada.');
}

function iniciarUI() {
  document.getElementById('entrada').addEventListener('submit', function(e) {
    e.preventDefault(); var i = document.getElementById('texto'); procesar(i.value); i.value = '';
  });
  agregar('scall', 'Hola. Dime qué necesitas. Si no sé hacerlo, te ofrezco crearlo con Claude.');
}
