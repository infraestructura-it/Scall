// =====================================================================
// voz_propia.js — Reconocimiento de voz propio de Scall (sin APIs ni keys).
// El navegador solo entrega el micrófono (getUserMedia) y el cálculo.
//
//   1. Audio Input         vpCapturarFrase()   micrófono → muestras a 16 kHz, detección de inicio/fin
//   2. Preprocessing       vpPreprocesar()     preénfasis + recorte de silencio + normalización de volumen
//   3. Feature Extraction  vpMFCC()            FFT propia → banco mel → log → DCT → 13 MFCC (CMVN)
//   4. Pattern Recognition vpReconocer()       DTW contra los patrones que el usuario grabó
//   5. Language Processing procesar() en motor.js (sin cambios)
//
// Los patrones se guardan en localStorage (int8 en base64) y se graban desde 🎙 Voz.
// Las funciones vp* puras (2-4) no tocan el DOM: se prueban en Node.
// =====================================================================

var VP = { SR: 16000, FRAME: 400, HOP: 160, NFFT: 512, NMEL: 26, NCEP: 13, MAX_MUESTRAS: 5,
           KEY: 'scall_voz_patrones', FACTOR_UMBRAL: 1.8, MARGEN: 0.9 };

// Palabras de control que también se pueden grabar (respuestas a preguntas del diálogo)
var VP_EXTRA = ['si', 'no', 'cancela', 'para', 'que sabes hacer'];

// ── 2) Preprocesado ───────────────────────────────────────────────────
function _vpRmsBloques(x, n) {
  var out = [];
  for (var i = 0; i + n <= x.length; i += n) { var s = 0; for (var j = 0; j < n; j++) s += x[i + j] * x[i + j]; out.push(Math.sqrt(s / n)); }
  return out;
}

// Recorta silencio al inicio y al final (con 100 ms de margen)
function vpRecortar(x) {
  var B = 320, r = _vpRmsBloques(x, B);                       // bloques de 20 ms
  if (!r.length) return x;
  var orden = r.slice().sort(function(a, b){ return a - b; });
  var ruido = orden[Math.floor(orden.length * 0.1)], pico = orden[orden.length - 1];
  var umbral = Math.max(ruido * 3, pico * 0.08, 1e-4);
  var ini = -1, fin = -1;
  r.forEach(function(v, k){ if (v > umbral) { if (ini < 0) ini = k; fin = k; } });
  if (ini < 0) return new Float32Array(0);
  var a = Math.max(0, (ini - 5) * B), b = Math.min(x.length, (fin + 6) * B);
  return x.subarray(a, b);
}

// Preénfasis (realza agudos) + normaliza el volumen al pico
function vpPreprocesar(x) {
  x = vpRecortar(x);
  var y = new Float32Array(x.length), pico = 0;
  for (var i = 0; i < x.length; i++) { y[i] = x[i] - 0.97 * (i ? x[i - 1] : 0); if (Math.abs(y[i]) > pico) pico = Math.abs(y[i]); }
  if (pico > 0) for (var k = 0; k < y.length; k++) y[k] /= pico;
  return y;
}

// ── 3) Características: MFCC con FFT propia ───────────────────────────
var _vpTablas = null;
function _vpPreparar() {
  if (_vpTablas) return _vpTablas;
  var N = VP.NFFT, win = new Float32Array(VP.FRAME);
  for (var i = 0; i < VP.FRAME; i++) win[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (VP.FRAME - 1));   // Hamming
  var mel = function(f){ return 2595 * Math.log10(1 + f / 700); }, imel = function(m){ return 700 * (Math.pow(10, m / 2595) - 1); };
  var pts = [], m0 = mel(100), m1 = mel(7000);
  for (var p = 0; p < VP.NMEL + 2; p++) pts.push(Math.floor((N + 1) * imel(m0 + (m1 - m0) * p / (VP.NMEL + 1)) / VP.SR));
  var banco = [];
  for (var f = 1; f <= VP.NMEL; f++) {
    var fb = new Float32Array(N / 2 + 1);
    for (var k = pts[f - 1]; k < pts[f]; k++) fb[k] = (k - pts[f - 1]) / Math.max(1, pts[f] - pts[f - 1]);
    for (var k2 = pts[f]; k2 < pts[f + 1]; k2++) fb[k2] = (pts[f + 1] - k2) / Math.max(1, pts[f + 1] - pts[f]);
    banco.push(fb);
  }
  var dct = [];
  for (var c = 1; c <= VP.NCEP; c++) {                          // c1..c13 (c0 = energía, la quita CMVN igual)
    var row = new Float32Array(VP.NMEL);
    for (var n = 0; n < VP.NMEL; n++) row[n] = Math.cos(Math.PI * c * (n + 0.5) / VP.NMEL);
    dct.push(row);
  }
  return (_vpTablas = { win: win, banco: banco, dct: dct });
}

// FFT radix-2 en sitio
function vpFFT(re, im) {
  var n = re.length, j = 0, t;
  for (var i = 1; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (var s = 0; s < n; s += len) {
      var cr = 1, ci = 0;
      for (var k = 0; k < len / 2; k++) {
        var ur = re[s + k], ui = im[s + k];
        var vr = re[s + k + len / 2] * cr - im[s + k + len / 2] * ci;
        var vi = re[s + k + len / 2] * ci + im[s + k + len / 2] * cr;
        re[s + k] = ur + vr; im[s + k] = ui + vi;
        re[s + k + len / 2] = ur - vr; im[s + k + len / 2] = ui - vi;
        var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Devuelve un arreglo de tramas (Float32Array de 13), normalizadas por media y varianza (CMVN)
function vpMFCC(x) {
  var T = _vpPreparar(), N = VP.NFFT, frames = [];
  var re = new Float32Array(N), im = new Float32Array(N);
  for (var ini = 0; ini + VP.FRAME <= x.length; ini += VP.HOP) {
    re.fill(0); im.fill(0);
    for (var i = 0; i < VP.FRAME; i++) re[i] = x[ini + i] * T.win[i];
    vpFFT(re, im);
    var pot = new Float32Array(N / 2 + 1);
    for (var k = 0; k <= N / 2; k++) pot[k] = (re[k] * re[k] + im[k] * im[k]) / N;
    var logm = new Float32Array(VP.NMEL);
    for (var f = 0; f < VP.NMEL; f++) { var s = 0, fb = T.banco[f]; for (var q = 0; q <= N / 2; q++) s += fb[q] * pot[q]; logm[f] = Math.log(s + 1e-10); }
    var c = new Float32Array(VP.NCEP);
    for (var d = 0; d < VP.NCEP; d++) { var a = 0, row = T.dct[d]; for (var n = 0; n < VP.NMEL; n++) a += row[n] * logm[n]; c[d] = a; }
    frames.push(c);
  }
  if (!frames.length) return frames;
  for (var d2 = 0; d2 < VP.NCEP; d2++) {
    var m = 0, v = 0, L = frames.length;
    frames.forEach(function(fr){ m += fr[d2]; }); m /= L;
    frames.forEach(function(fr){ v += (fr[d2] - m) * (fr[d2] - m); }); v = Math.sqrt(v / L) || 1;
    frames.forEach(function(fr){ fr[d2] = (fr[d2] - m) / v; });
  }
  return frames;
}

// ── 4) Reconocimiento de patrones: DTW ────────────────────────────────
function vpDTW(a, b) {
  var n = a.length, m = b.length;
  if (!n || !m || Math.max(n, m) > 2.2 * Math.min(n, m)) return Infinity;    // duraciones incompatibles
  var banda = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * 0.3));
  var prev = new Float64Array(m + 1).fill(Infinity), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (var i = 1; i <= n; i++) {
    cur.fill(Infinity);
    var j0 = Math.max(1, i - banda), j1 = Math.min(m, i + banda), x = a[i - 1];
    for (var j = j0; j <= j1; j++) {
      var s = 0, y = b[j - 1];
      for (var d = 0; d < x.length; d++) { var t = x[d] - y[d]; s += t * t; }
      var mejor = Math.min(prev[j], prev[j - 1], cur[j - 1]);
      cur[j] = Math.sqrt(s) + mejor;
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return prev[m] / (n + m);
}

// Patrones: { "frase normalizada": { frase: "texto original", m: [ {n:tramas, d:base64 int8} ] } }
function vpLeerPatrones() { try { return JSON.parse(localStorage.getItem(VP.KEY) || '{}') || {}; } catch (e) { return {}; } }
function vpGuardarPatrones(p) { localStorage.setItem(VP.KEY, JSON.stringify(p)); _vpCache = {}; }

function vpCodificar(frames) {
  var bytes = new Int8Array(frames.length * VP.NCEP);
  frames.forEach(function(fr, i){ for (var d = 0; d < VP.NCEP; d++) bytes[i * VP.NCEP + d] = Math.max(-127, Math.min(127, Math.round(fr[d] * 30))); });
  var s = ''; for (var k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k] & 255);
  return { n: frames.length, d: btoa(s) };
}
function vpDecodificar(m) {
  var s = atob(m.d), frames = [];
  for (var i = 0; i < m.n; i++) {
    var fr = new Float32Array(VP.NCEP);
    for (var d = 0; d < VP.NCEP; d++) { var b = s.charCodeAt(i * VP.NCEP + d); fr[d] = (b > 127 ? b - 256 : b) / 30; }
    frames.push(fr);
  }
  return frames;
}

var _vpCache = {};      // clave → muestras decodificadas
function _vpMuestras(clave, pat) { return _vpCache[clave] || (_vpCache[clave] = pat.m.map(vpDecodificar)); }

function vpAgregarMuestra(frase, frames) {
  var p = vpLeerPatrones(), k = normalizar(frase);
  if (!p[k]) p[k] = { frase: frase, m: [] };
  p[k].m.push(vpCodificar(frames));
  if (p[k].m.length > VP.MAX_MUESTRAS) p[k].m.shift();
  vpGuardarPatrones(p);
  return p[k].m.length;
}
function vpBorrarFrase(frase) { var p = vpLeerPatrones(); delete p[normalizar(frase)]; vpGuardarPatrones(p); }

// Distancia máxima entre muestras de la misma frase (variación propia del hablante)
function _vpIntra(muestras) {
  var mx = 0;
  for (var i = 0; i < muestras.length; i++) for (var j = i + 1; j < muestras.length; j++) { var d = vpDTW(muestras[i], muestras[j]); if (isFinite(d)) mx = Math.max(mx, d); }
  return mx;
}

// frames → { frase, dist, segunda, aceptada, motivo }
function vpReconocer(frames) {
  var pats = vpLeerPatrones(), claves = Object.keys(pats);
  if (!frames.length) return { frase: null, aceptada: false, motivo: 'no se oyó voz' };
  if (!claves.length) return { frase: null, aceptada: false, motivo: 'no hay patrones grabados' };
  var res = claves.map(function(k){
    var ms = _vpMuestras(k, pats[k]), best = Infinity;
    ms.forEach(function(m){ var d = vpDTW(frames, m); if (d < best) best = d; });
    return { clave: k, frase: pats[k].frase, dist: best, ms: ms };
  }).sort(function(a, b){ return a.dist - b.dist; });
  var a = res[0], b = res[1];
  if (!isFinite(a.dist)) return { frase: null, aceptada: false, motivo: 'ninguna frase tiene duración parecida', top: res };
  var intra = a.ms.length > 1 ? _vpIntra(a.ms) : 0;
  if (intra && a.dist > intra * VP.FACTOR_UMBRAL) return { frase: a.frase, dist: a.dist, aceptada: false, motivo: 'muy distinta a lo grabado', top: res };
  if (b && isFinite(b.dist) && a.dist > b.dist * VP.MARGEN) return { frase: a.frase, dist: a.dist, segunda: b.frase, aceptada: false, motivo: 'se parece a "' + b.frase + '"', top: res };
  return { frase: a.frase, dist: a.dist, segunda: b && b.frase, aceptada: true, top: res };
}

// Audio crudo → texto de la frase reconocida (pasos 2, 3 y 4)
function vpTranscribir(muestras) { return vpReconocer(vpMFCC(vpPreprocesar(muestras))); }

// ── 1) Captura de micrófono ───────────────────────────────────────────
var _vpCancelar = null;

function vpRemuestrear(x, de, a) {
  if (de === a) return x;
  var n = Math.floor(x.length * a / de), y = new Float32Array(n), r = de / a;
  for (var i = 0; i < n; i++) { var p = i * r, k = Math.floor(p), f = p - k; y[i] = x[k] * (1 - f) + (x[k + 1] !== undefined ? x[k + 1] : x[k]) * f; }
  return y;
}

// Escucha UNA frase: espera a que empiece a hablar y termina tras ~0,7 s de silencio.
// Devuelve Promise<Float32Array a 16 kHz | null>. alNivel(0..1) es opcional (para la UI).
function vpCapturarFrase(alNivel) {
  return new Promise(function(resolve, reject) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { reject(new Error('Este navegador no da acceso al micrófono.')); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function(stream) {
      var AC = window.AudioContext || window.webkitAudioContext, ctx = new AC({ sampleRate: VP.SR });
      var src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(1024, 1, 1), mute = ctx.createGain();
      mute.gain.value = 0; src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      var bloques = [], previos = [], hablando = false, silencio = 0, activos = 0, ruido = 0, nCal = 0, t0 = Date.now(), hecho = false;
      function fin(res, err) {
        if (hecho) return; hecho = true; _vpCancelar = null;
        proc.disconnect(); src.disconnect(); stream.getTracks().forEach(function(t){ t.stop(); });
        var sr = ctx.sampleRate; ctx.close();
        if (err) return reject(err);
        if (!res) return resolve(null);
        var n = 0; res.forEach(function(b){ n += b.length; });
        var todo = new Float32Array(n), o = 0; res.forEach(function(b){ todo.set(b, o); o += b.length; });
        resolve(vpRemuestrear(todo, sr, VP.SR));
      }
      _vpCancelar = function(){ fin(null); };
      proc.onaudioprocess = function(e) {
        var b = new Float32Array(e.inputBuffer.getChannelData(0)), s = 0;
        for (var i = 0; i < b.length; i++) s += b[i] * b[i];
        var rms = Math.sqrt(s / b.length);
        if (alNivel) alNivel(Math.min(1, rms * 12));
        if (nCal < 5) { ruido += rms; nCal++; if (nCal === 5) ruido /= 5; return; }       // calibra el ruido de fondo (~0,3 s)
        var umbral = Math.max(ruido * 3, 0.012);
        if (!hablando) {
          previos.push(b); if (previos.length > 4) previos.shift();
          activos = rms > umbral ? activos + 1 : 0;
          if (activos >= 2) { hablando = true; bloques = previos.slice(); silencio = 0; }
          else if (Date.now() - t0 > 9000) fin(null);                                     // nadie habló
        } else {
          bloques.push(b);
          silencio = rms > umbral ? 0 : silencio + 1;
          if (silencio >= 11 || bloques.length > 100) fin(bloques);                       // ~0,7 s de silencio o ~6,5 s máx.
        }
      };
    }).catch(function(e){ reject(e); });
  });
}

function vpCancelarEscucha() { if (_vpCancelar) _vpCancelar(); }

// ── Uso desde la UI ───────────────────────────────────────────────────
// Reemplaza a la Web Speech API: escucha, reconoce con patrones propios y pasa el texto a procesar().
async function vpEscucharYProcesar() {
  if (escuchando) { vpCancelarEscucha(); return; }
  if (typeof detenerVoz === 'function') detenerVoz();                 // que no se escuche a sí mismo
  if (!Object.keys(vpLeerPatrones()).length) { agregar('sis', 'Aún no hay patrones de voz. Abre 🎙 Voz y graba algunas frases.'); return; }
  escuchando = true; estado('Escuchando…', 'escuchando');
  try {
    var x = await vpCapturarFrase();
    escuchando = false; estado('Toca el orbe y habla');
    if (!x) return;
    var r = vpTranscribir(x);
    if (r.aceptada) { agregar('sis', '🎙 oí: "' + r.frase + '" (' + r.dist.toFixed(2) + ')'); procesar(r.frase); }
    else agregar('sis', '🎙 no reconocí (' + r.motivo + '). Repite o graba más muestras en 🎙 Voz.');
  } catch (e) { escuchando = false; estado('Toca el orbe y habla'); agregar('sis', 'Micrófono: ' + e.message); }
}

// ── Panel de entrenamiento ────────────────────────────────────────────
// Frases grabables: las de los intents sin {huecos} + palabras de control
function vpFrasesGrabables() {
  var vistas = {}, out = [];
  leerDB().forEach(function(i){ (i.frases || []).forEach(function(f){
    var k = normalizar(f); if (f.indexOf('{') < 0 && k && !vistas[k]) { vistas[k] = 1; out.push(f); }
  }); });
  VP_EXTRA.forEach(function(f){ var k = normalizar(f); if (!vistas[k]) { vistas[k] = 1; out.push(f); } });
  return out;
}

function vpRenderPanel() {
  var cont = document.getElementById('listaVoz'), pats = vpLeerPatrones(), frases = vpFrasesGrabables(), total = 0;
  cont.innerHTML = '';
  frases.forEach(function(f) {
    var n = (pats[normalizar(f)] || { m: [] }).m.length; if (n) total++;
    var fila = _el('div', 'intent');
    var del = _el('button', 'btn del', 'Borrar'); del.onclick = function(){ vpBorrarFrase(f); vpRenderPanel(); };
    var rec = _el('button', 'btn', '● Grabar'); rec.style.cssText = 'float:right;margin-right:6px;padding:3px 8px;font-size:12px';
    rec.onclick = function(){ vpGrabarMuestra(f, rec); };
    fila.appendChild(del); fila.appendChild(rec);
    fila.appendChild(_el('b', null, f));
    fila.appendChild(_el('span', 'hint', '  ' + n + '/3' + (n >= 3 ? ' ✔' : '')));
    cont.appendChild(fila);
  });
  document.getElementById('resumenVoz').textContent = total + ' de ' + frases.length + ' frases con patrón (ideal: 3 muestras cada una).';
}

async function vpGrabarMuestra(frase, boton) {
  var estadoEl = document.getElementById('estadoVoz');
  boton.disabled = true; estadoEl.textContent = '🎙 Di: "' + frase + '"…';
  try {
    var x = await vpCapturarFrase(function(n){ estadoEl.style.opacity = 0.5 + n / 2; });
    estadoEl.style.opacity = 1;
    if (!x) { estadoEl.textContent = 'No te oí. Intenta de nuevo.'; }
    else {
      var fr = vpMFCC(vpPreprocesar(x));
      if (fr.length < 15) estadoEl.textContent = 'Muy corto. Intenta de nuevo.';
      else { var n = vpAgregarMuestra(frase, fr); estadoEl.textContent = '✔ Guardada muestra ' + n + ' de "' + frase + '".'; }
    }
  } catch (e) { estadoEl.textContent = 'Micrófono: ' + e.message; }
  boton.disabled = false; vpRenderPanel();
}

async function vpProbar() {
  var estadoEl = document.getElementById('estadoVoz');
  estadoEl.textContent = '🎙 Di una frase grabada…';
  try {
    var x = await vpCapturarFrase();
    if (!x) { estadoEl.textContent = 'No te oí.'; return; }
    var r = vpTranscribir(x);
    estadoEl.textContent = (r.aceptada ? '✔ ' : '✖ ') + (r.frase ? '"' + r.frase + '" ' : '') + (r.dist != null ? '(' + r.dist.toFixed(2) + ') ' : '') + (r.motivo || '');
  } catch (e) { estadoEl.textContent = 'Micrófono: ' + e.message; }
}
