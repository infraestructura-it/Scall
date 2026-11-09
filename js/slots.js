// =====================================================================
// slots.js — Tipos de slot y sus validadores.
// Cada validador recibe el texto del usuario y devuelve
//   { valor, texto }  si es válido  (valor = lo que se guarda, texto = lo que se dice)
//   null              si no lo es
// =====================================================================

function normalizar(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"]/g, ' ').replace(/\s+/g, ' ').trim();
}

var SLOT_MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var SLOT_DIAS  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
var SLOT_NUMEROS = { un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10,
  once:11, doce:12, trece:13, catorce:14, quince:15, veinte:20, treinta:30 };

function _fechaResultado(d) {
  var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { valor: iso, texto: d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) };
}

var VALIDADORES = {
  texto: function(t) {
    t = (t || '').trim();
    return t ? { valor: t, texto: t } : null;
  },

  numero: function(t, slot) {
    var n = normalizar(t), num = null;
    var m = n.match(/\b(\d+)\b/);
    if (m) num = parseInt(m[1], 10);
    else n.split(' ').some(function(p){ if (SLOT_NUMEROS[p]) { num = SLOT_NUMEROS[p]; return true; } });
    if (num === null) return null;
    if (slot && slot.min != null && num < slot.min) return null;
    if (slot && slot.max != null && num > slot.max) return null;
    return { valor: num, texto: String(num) };
  },

  // Orden importa: lo explícito primero ("el viernes en la mañana" no debe leerse como "mañana")
  fecha: function(t) {
    var n = normalizar(t), m, hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if ((m = n.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return _fechaResultado(new Date(+m[1], m[2] - 1, +m[3]));
    if ((m = n.match(new RegExp('\\b(\\d{1,2}) de (' + SLOT_MESES.join('|') + ')(?: de (\\d{4}))?')))) {
      var d = new Date(m[3] ? +m[3] : hoy.getFullYear(), SLOT_MESES.indexOf(m[2]), +m[1]);
      if (!m[3] && d < hoy) d.setFullYear(d.getFullYear() + 1);
      return _fechaResultado(d);
    }
    if ((m = n.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/))) {
      var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : hoy.getFullYear();
      var d2 = new Date(y, m[2] - 1, +m[1]);
      if (!m[3] && d2 < hoy) d2.setFullYear(d2.getFullYear() + 1);
      return _fechaResultado(d2);
    }
    for (var i = 0; i < SLOT_DIAS.length; i++) {
      if (new RegExp('\\b' + SLOT_DIAS[i] + '\\b').test(n)) {
        var dif = (i - hoy.getDay() + 7) % 7 || 7;
        return _fechaResultado(new Date(hoy.getTime() + dif * 86400000));
      }
    }
    if (/\bpasado manana\b/.test(n)) return _fechaResultado(new Date(hoy.getTime() + 2 * 86400000));
    if (/\bmanana\b/.test(n))        return _fechaResultado(new Date(hoy.getTime() + 86400000));
    if (/\bhoy\b/.test(n))           return _fechaResultado(hoy);
    return null;
  },

  opcion: function(t, slot) {
    var n = ' ' + normalizar(t) + ' ';
    var op = (slot.opciones || []).find(function(o){ return n.indexOf(' ' + normalizar(o) + ' ') !== -1; });
    return op ? { valor: op, texto: op } : null;
  }
};

function validarSlot(slot, texto) {
  var v = VALIDADORES[slot.tipo] || VALIDADORES.texto;
  return v(texto, slot);
}

// Tipos que se pueden "pescar" en cualquier parte de la frase sin un {hueco}
function slotDetectable(slot) { return slot.tipo === 'fecha' || slot.tipo === 'opcion'; }
