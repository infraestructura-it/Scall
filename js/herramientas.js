// =====================================================================
// herramientas.js — Capa de ejecución de datos ("MCP local").
//
// Hoy guarda en localStorage. Está escrita con la misma forma que una
// llamada MCP (nombre de herramienta + argumentos → resultado), para que
// el día que exista un servidor MCP solo cambie ejecutarHerramienta()
// por un tools/call real, sin tocar los intents ni el motor de diálogo.
// =====================================================================

var DATOS_PREFIJO = 'scall_datos_';

function _leerColeccion(c) {
  try { var a = JSON.parse(localStorage.getItem(DATOS_PREFIJO + c) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

function nombreColeccion(c) { return normalizar(c || 'registros').replace(/\s+/g, '_') || 'registros'; }

var HERRAMIENTAS_LOCALES = {
  // args: { coleccion, datos }  →  { ok, id, total }
  guardar_registro: function(args) {
    var c = nombreColeccion(args.coleccion), lista = _leerColeccion(c);
    var reg = Object.assign({ id: 'r_' + Date.now(), creado: new Date().toISOString() }, args.datos || {});
    lista.push(reg);
    localStorage.setItem(DATOS_PREFIJO + c, JSON.stringify(lista));
    return { ok: true, id: reg.id, total: lista.length };
  },
  // args: { coleccion }  →  { ok, registros }
  consultar_registros: function(args) {
    return { ok: true, registros: _leerColeccion(nombreColeccion(args.coleccion)) };
  }
};

async function ejecutarHerramienta(nombre, args) {
  var h = HERRAMIENTAS_LOCALES[nombre];
  if (!h) throw new Error('Herramienta desconocida: ' + nombre);
  return h(args || {});
}

function listarColecciones() {
  var out = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(DATOS_PREFIJO) === 0) out.push(k.slice(DATOS_PREFIJO.length));
  }
  return out.sort();
}
function borrarColeccion(c) { localStorage.removeItem(DATOS_PREFIJO + c); }
