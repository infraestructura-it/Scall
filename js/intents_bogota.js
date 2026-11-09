// =====================================================================
// intents_bogota.js — Frases comunes de Bogotá como intents (solo datos).
// Se siembran en la base local al cargar: agrega los que falten por nombre
// y NO pisa los que el usuario haya editado. Todos usan acciones del CATALOGO.
// =====================================================================

function _ib(nombre, frases, tipo, valor, respuesta, slots) {
  return { nombre: nombre, frases: frases, slots: slots || [], confirmar: false, tipo: tipo, valor: valor || '', respuesta: respuesta || '' };
}

var INTENTS_BOGOTA = [
  // ── Conversación ──
  _ib('BogSaludo', ['que mas', 'que mas pues', 'quihubo', 'quiubo', 'que hubo', 'buenas', 'hola parce', 'como vamos'], 'responder', '', '¡Qué más! Aquí andamos, ¿en qué le colaboro?'),
  _ib('BogEstado', ['como estas', 'como va todo', 'como le va', 'todo bien'], 'responder', '', 'Bien, gracias a Dios. ¿Y usted qué?'),
  _ib('BogGracias', ['muchas gracias', 'mil gracias', 'gracias', 'le agradezco'], 'responder', '', 'Con mucho gusto, para eso estamos.'),
  _ib('BogDespedida', ['nos vemos', 'hasta luego', 'chao', 'chao pues', 'hablamos', 'que le vaya bien', 'cuidese'], 'responder', '', '¡Chao pues! Que le vaya muy bien.'),
  _ib('BogDisculpa', ['que pena', 'que pena con usted', 'disculpe', 'perdon', 'con permiso'], 'responder', '', 'Tranquilo, no pasa nada.'),
  _ib('BogAfirmar', ['de una', 'dale pues', 'hagale', 'ya mismo', 'con gusto'], 'responder', '', '¡De una! Hágale.'),
  _ib('BogNegar', ['ni de fundas', 'que va', 'para nada', 'jamas'], 'responder', '', 'Entendido, entonces no se hace.'),
  _ib('BogAprobar', ['eso es', 'eso mismo', 'exacto', 'tal cual'], 'responder', '', '¡Eso mismo!'),
  _ib('BogAsombro', ['de verdad', 'en serio', 'no me diga', 'no joda'], 'responder', '', '¿En serio? Sí, señor.'),
  _ib('BogAmigo', ['parce', 'parcero', 'mi llave', 'llave'], 'responder', '', 'Dígame, parce.'),
  _ib('BogQuienEres', ['quien es usted', 'como te llamas', 'como se llama'], 'responder', '', 'Soy Scall, su asistente. A la orden.'),
  _ib('BogAyuda', ['echeme una mano', 'me puede colaborar', 'me colabora', 'hagame un favor', 'regaleme'], 'responder', '', 'Claro, con gusto. ¿Qué necesita?'),
  _ib('BogEspera', ['espereme tantico', 'un momentico', 'un segundito', 'tantico'], 'responder', '', 'Tranquilo, aquí lo espero.'),
  _ib('BogRepetir', ['no entendi', 'como asi', 'dígame otra vez', 'que dijo'], 'responder', '', 'Claro, dígame qué parte no quedó clara.'),
  _ib('BogCumplido', ['que buena gente', 'usted es muy buena gente', 'es un crack', 'usted es un berraco'], 'responder', '', '¡Gracias! Usted también es muy buena gente.'),
  _ib('BogAhorita', ['ahorita', 'ahoritica', 'ahorita le cuento'], 'responder', '', 'Ahorita en Colombia puede ser mucho tiempo, pero conmigo es ya.'),

  // ── Estados de ánimo ──
  _ib('BogBacano', ['que chimba', 'que bacano', 'bacano', 'chevere', 'que berraquera', 'bien ahi'], 'responder', '', '¡Qué chimba! Me alegra mucho.'),
  _ib('BogMal', ['que mamera', 'que embarrada', 'que jartera', 'que pereza', 'que vaina'], 'responder', '', 'Uy, qué embarrada. Ánimo, que ya pasa.'),
  _ib('BogCansancio', ['estoy mamado', 'estoy cansado', 'estoy muerto', 'no doy mas'], 'responder', '', 'Descanse un ratico, que se lo merece. Un tintico ayuda.'),
  _ib('BogCamellar', ['toca camellar', 'a camellar', 'tengo que camellar'], 'responder', '', '¡A camellar, que la plata no cae del cielo!'),
  _ib('BogFrio', ['que frio', 'hace mucho frio', 'estoy congelado'], 'responder', '', 'Es Bogotá, abríguese bien y tómese algo calientico.'),

  // ── Comida y bebida ──
  _ib('BogTinto', ['un tintico', 'un tinto', 'vamos por un tinto', 'tomese un tinto'], 'responder', '', '¡Un tintico siempre cae bien!'),
  _ib('BogAjiaco', ['ajiaco', 'receta de ajiaco', 'donde hay buen ajiaco'], 'buscar_web', 'receta ajiaco santafereño', 'Le abro la receta del ajiaco santafereño.'),
  _ib('BogHambre', ['tengo hambre', 'que almuerzo', 'que hay de almorzar', 'que comemos'], 'buscar_web', 'restaurantes corrientazo cerca de mí Bogotá', 'Mire estas opciones para almorzar.'),

  // ── Plata ──
  _ib('BogLuca', ['que es una luca', 'cuanto es una luca', 'cuanto son dos lucas', 'cuantas lucas'], 'responder', '', 'Una luca son mil pesos colombianos.'),
  _ib('BogPrecio', ['cuanto cuesta {producto}', 'cuanto vale {producto}', 'precio de {producto}'], 'buscar_web', 'precio {producto} Colombia', 'Busco el precio de {producto}.'),

  // ── Ciudad y movilidad ──
  _ib('BogTrafico', ['como esta el trafico', 'hay trancon', 'que trancon', 'como esta la autopista'], 'buscar_web', 'estado del tráfico Bogotá ahora', 'Reviso el tráfico de Bogotá.'),
  _ib('BogTransmilenio', ['estado del transmilenio', 'como esta el transmilenio', 'cuanto demora el transmi', 'ruta de transmilenio'], 'buscar_web', 'estado TransMilenio hoy', 'Miro cómo está el Transmi.'),
  _ib('BogPicoPlaca', ['hay pico y placa', 'pico y placa hoy', 'que pico y placa hay'], 'buscar_web', 'pico y placa Bogotá hoy', 'Consulto el pico y placa de hoy.'),
  _ib('BogTaxi', ['pida un taxi', 'necesito un taxi', 'pedir un uber'], 'abrir_url', 'https://m.uber.com', 'Todavía no pido taxis, pero le abro Uber.'),
  _ib('BogComoLlegar', ['como llego a {lugar}', 'donde queda {lugar}'], 'buscar_web', 'cómo llegar a {lugar} Bogotá', 'Busco cómo llegar a {lugar}.'),
  _ib('BogClima', ['va a llover', 'que clima hace', 'esta lloviendo', 'cuantos grados hay'], 'buscar_web', 'clima Bogotá hoy', 'Reviso el clima de Bogotá.'),
  _ib('BogPlan', ['que plan hay', 'que hacemos hoy', 'plan de fin de semana'], 'buscar_web', 'planes en Bogotá este fin de semana', 'Mire estos planes en Bogotá.'),
  _ib('BogNoticias', ['que noticias hay', 'noticias de bogota', 'que hay de nuevo', 'cuenteme un chisme'], 'buscar_web', 'noticias de Bogotá hoy', 'Le abro las noticias de Bogotá.'),

  // ── Hora, fecha, música, temporizador ──
  _ib('BogHora', ['que horas son', 'que hora es', 'a que hora estamos'], 'hora'),
  _ib('BogFecha', ['a cuanto estamos', 'que dia es hoy', 'en que dia estamos'], 'fecha'),
  _ib('BogMusica', ['ponga {genero}', 'pongame {genero}', 'suene {genero}'], 'musica', '{genero}', 'De una, suena {genero}.'),
  _ib('BogQuitarMusica', ['quite esa musica', 'apague la musica', 'ya no mas musica'], 'detener_musica', '', 'Listo, silencio.'),
  _ib('BogAvisar', ['avíseme en {minutos} minutos', 'recuerdeme en {minutos} minutos'], 'temporizador', '{minutos}', 'Listo, le aviso en {minutos} minutos.',
      [{ nombre: 'minutos', tipo: 'numero', pregunta: '¿En cuántos minutos?', opciones: [] }])
];

// Siembra: agrega los intents que falten (por nombre); nunca pisa los existentes.
function sembrarIntentsBogota() {
  var db = leerDB(), nombres = {}, nuevos = 0;
  db.forEach(function(i){ nombres[i.nombre] = true; });
  INTENTS_BOGOTA.forEach(function(i){
    if (!nombres[i.nombre] && validarIntent(i)) { db.push(i); nuevos++; }
  });
  if (nuevos) guardarDB(db);
  return nuevos;
}
