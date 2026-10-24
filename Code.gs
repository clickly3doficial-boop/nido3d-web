/**
 * CLICKLY · Backend de preventa (Google Apps Script + Google Sheets)
 * 1) La clave inicial es la de CLAVE_INICIAL (podés cambiarla después desde Clickly Admin).  2) Ejecutá la función instalar() una vez.
 * 3) Implementar > Nueva implementación > Aplicación web · Ejecutar como: Yo · Acceso: Cualquier persona.
 */
const CLAVE_INICIAL = '1214';
const MAX_CAJAS = 5, POPS_POR_CAJA = 5, PRECIO_POP = 2500, PRECIO_CAJA = 12000, CAJAS_ENVIO_GRATIS = 2; // pesos: pop suelto $2.500, caja llena de 5 $12.000; desde 2 cajas llenas = envío gratis
const COL_P = ['id','nombre','precio','stock','activo','linea','color','descripcion','imagen'];
const COL_O = ['codigo','fecha','estado','nombre','apellido','direccion','ciudad','cp','provincia','pais','contacto','cajas','cantidad_cajas','pops','total','notas','ids','envio','costo_envio','pago_id'];
const ESTADOS = ['Nueva','Pendiente de pago','Confirmada','Pagada','Enviada','Entregada','Cancelada'];
/* Envíos: precio fijo en pesos por pedido (editá estos números cuando quieras) */
const ENVIOS = {
  retiro:    {n:'Retiro en persona (sin cargo)',  p:0},
  sucursal:  {n:'Correo Argentino a sucursal',    p:7500},
  domicilio: {n:'Correo Argentino a domicilio',   p:11500}
};
const HORAS_PARA_PAGAR = 48; // si no paga en este tiempo, se cancela y vuelve el stock

function instalar(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let p = ss.getSheetByName('Productos') || ss.insertSheet('Productos');
  if (p.getLastRow() < 1){
    p.appendRow(COL_P);
    [['base','Clickly Box',6000,10,true,'base','#2F6FE0','Una cajita cuya tapa es el clicker.',''],
     ['medialuna','Medialuna Pop',6000,10,true,'ar','#5E9FDC','Una medialuna gordita, con sus rollitos y sus cuernos.',''],
     ['alfajor','Alfajor Pop',6000,10,true,'ar','#8A4B2A','Un alfajor de chocolate, con su baño y sus ondas.',''],
     ['mate','Mate Pop',6000,10,true,'ar','#6F9140','Un mate de calabaza con su virola y la yerba arriba.',''],
     ['heart','Heart Waffle Pop',6000,10,true,'bf','#F06A8C','Un corazón de waffle con crema en el medio.',''],
     ['pancake','Pancake Pop',6000,10,true,'bf','#E8A33D','Una pila de panqueques con almíbar y una pastillita de manteca arriba.','']]
      .forEach(r => p.appendRow(r));
    p.setFrozenRows(1);
  }
  let o = ss.getSheetByName('Pedidos') || ss.insertSheet('Pedidos');
  if (o.getLastRow() < 1){ o.appendRow(COL_O); o.setFrozenRows(1); }
  setClave_(CLAVE_INICIAL);
  return 'Listo: hojas creadas y clave guardada.';
}

/* ---------- utilidades ---------- */
function hash_(s){ return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function setClave_(c){ const salt = Utilities.getUuid(); const pr = PropertiesService.getScriptProperties(); pr.setProperty('SALT', salt); pr.setProperty('HASH', hash_(salt + c)); }
function okClave_(c){ const pr = PropertiesService.getScriptProperties(); return !!c && pr.getProperty('HASH') === hash_(pr.getProperty('SALT') + c); }
function token_(){ const t = Utilities.getUuid(); CacheService.getScriptCache().put('tk_' + t, '1', 21600); return t; }
function auth_(t){ if (!t || !CacheService.getScriptCache().get('tk_' + t)) throw new Error('Sesión vencida. Ingresá de nuevo.'); }
function out_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(n){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function rows_(n){ const sh = sheet_(n), v = sh.getDataRange().getValues(), h = v.shift(); return v.map((r,i) => { const o = {_row: i + 2}; h.forEach((k,j) => o[k] = r[j]); return o; }); }
function productos_(){ return rows_('Productos').filter(p => p.id).map(p => ({id:String(p.id), nombre:String(p.nombre), precio:Number(p.precio)||0, stock:Math.max(0, Math.floor(Number(p.stock)||0)), activo:p.activo === true || String(p.activo).toUpperCase() === 'TRUE', linea:String(p.linea||''), color:String(p.color||''), descripcion:String(p.descripcion||''), imagen:String(p.imagen||''), _row:p._row})); }
function limpio_(s, max){ return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g,' ').trim().slice(0, max || 120); }

/* ---------- pública: catálogo ---------- */
function doGet(e){
  try {
    const a = (e && e.parameter && e.parameter.a) || 'catalogo';
    if (a === 'v') { registrarVisita_(e.parameter); return out_({ok:true}); }
    if (a === 'catalogo') { try { sembrarProductos_(); } catch (err) {} }
    if (a === 'catalogo') return out_({ok:true, sembrado:true, maxCajas:MAX_CAJAS, popsPorCaja:POPS_POR_CAJA, precioCaja:PRECIO_CAJA, precioPop:PRECIO_POP, cajasEnvioGratis:CAJAS_ENVIO_GRATIS, envios:ENVIOS, pago:!!mpToken_(), productos:productos_().filter(p => p.activo).map(p => { delete p._row; return p; })});
    return out_({ok:false, error:'Acción desconocida'});
  } catch (err) { return out_({ok:false, error:String(err.message || err)}); }
}

function doPost(e){
  let req = {};
  try { req = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { req = {}; }
  if (e && e.parameter && e.parameter.a === 'mp') { try { avisoMp_(e, req); } catch (err) {} return out_({ok:true}); }
  try {
    switch (req.a) {
      case 'reservar': return out_(reservar_(req.reserva || {}, false));
      case 'pagar': return out_(reservar_(req.reserva || {}, true));
      case 'login': if (!okClave_(req.clave)) { Utilities.sleep(800); return out_({ok:false, error:'Clave incorrecta'}); } return out_({ok:true, token:token_()});
      case 'visitas': auth_(req.token); return out_(visitas_());
      case 'panel': auth_(req.token); return out_({ok:true, productos:productos_(), pedidos:rows_('Pedidos').reverse().map(o => { o.fecha = o.fecha instanceof Date ? o.fecha.toISOString() : String(o.fecha); return o; }), estados:ESTADOS});
      case 'estado': auth_(req.token); return out_(estado_(req.codigo, req.estado, req.notas));
      case 'producto': auth_(req.token); return out_(guardarProducto_(req.producto || {}));
      case 'borrarProducto': auth_(req.token); return out_(borrarProducto_(req.id));
      case 'clave': auth_(req.token); if (!okClave_(req.actual)) return out_({ok:false, error:'La clave actual no coincide'}); if (String(req.nueva || '').length < 6) return out_({ok:false, error:'La clave nueva necesita 6 caracteres o más'}); setClave_(String(req.nueva)); return out_({ok:true});
      default: return out_({ok:false, error:'Acción desconocida'});
    }
  } catch (err) { return out_({ok:false, error:String(err.message || err)}); }
}

/* ---------- reservas: valida y descuenta stock con candado ---------- */
function reservar_(r, pagar){
  const need = ['nombre','apellido','direccion','ciudad','cp','provincia','contacto'];
  for (const k of need) if (!limpio_(r[k])) return {ok:false, error:'Falta completar: ' + k};
  if (limpio_(r.pais) !== 'Argentina') return {ok:false, error:'Por ahora solo enviamos dentro de Argentina'};
  const cajas = Array.isArray(r.cajas) ? r.cajas : [];
  if (!cajas.length || cajas.length > MAX_CAJAS) return {ok:false, error:'Podés reservar de 1 a ' + MAX_CAJAS + ' cajas'};
  if (cajas.some(c => !Array.isArray(c) || !c.length || c.length > POPS_POR_CAJA)) return {ok:false, error:'Cada caja lleva de 1 a ' + POPS_POR_CAJA + ' pops'};
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const prods = productos_(), byId = {}; prods.forEach(p => byId[p.id] = p);
    const qty = {}; cajas.flat().forEach(id => qty[id] = (qty[id] || 0) + 1);
    for (const id in qty) {
      const p = byId[id];
      if (!p || !p.activo) return {ok:false, error:'Un pop ya no está disponible. Actualizá la página.'};
      if (p.stock < qty[id]) return {ok:false, error:'No queda stock suficiente de ' + p.nombre + ' (quedan ' + p.stock + ')', stock:p.stock, id:id};
    }
    const sh = sheet_('Productos'), colStock = COL_P.indexOf('stock') + 1;
    for (const id in qty) sh.getRange(byId[id]._row, colStock).setValue(byId[id].stock - qty[id]);
    const envio = ENVIOS[r.envio] ? r.envio : 'sucursal';
    const llenas = cajas.filter(c => c.length === POPS_POR_CAJA).length;
    const TARIFA = {retiro:[0,0,0], sucursal:[7500,4990,0], domicilio:[11500,8990,4000]};   // sin caja llena / 1 caja llena / 2+ cajas llenas
    const costoEnvio = (TARIFA[envio] || [0,0,0])[llenas >= CAJAS_ENVIO_GRATIS ? 2 : llenas >= 1 ? 1 : 0];
    const subtotal = cajas.reduce((t, c) => t + (c.length === POPS_POR_CAJA ? PRECIO_CAJA : c.length * PRECIO_POP), 0); // caja llena $12.000, si no $2.500 por pop
    const total = subtotal + costoEnvio;
    const conPago = !!(pagar && mpToken_());
    const codigo = 'CLK-' + Utilities.getUuid().slice(0, 5).toUpperCase();
    const det = cajas.map((c,i) => 'Caja ' + (i + 1) + ': ' + c.map(id => byId[id].nombre).join(', ')).join(' | ');
    asegurarColumnas_();
    sheet_('Pedidos').appendRow([codigo, new Date(), conPago ? 'Pendiente de pago' : 'Nueva', limpio_(r.nombre), limpio_(r.apellido), limpio_(r.direccion, 200), limpio_(r.ciudad), limpio_(r.cp, 12), limpio_(r.provincia), 'Argentina', limpio_(r.contacto), det, cajas.length, cajas.length * POPS_POR_CAJA, total, '', cajas.flat().join(','), ENVIOS[envio].n, costoEnvio, '']);
    if (conPago) {
      try { return {ok:true, codigo:codigo, total:total, init_point:crearPreferencia_(codigo, cajas.length, subtotal, envio, r, costoEnvio)}; }
      catch (err) { return {ok:true, codigo:codigo, total:total, aviso:'No pudimos abrir Mercado Pago. Te escribimos para cobrarte.'}; }
    }
    try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Clickly · Nueva reserva ' + codigo, r.nombre + ' ' + r.apellido + '\n' + det + '\nEntrega: ' + ENVIOS[envio].n + '\nTotal: $' + total.toLocaleString('es-AR') + ' (envío incluido: $' + costoEnvio.toLocaleString('es-AR') + ')' + '\nDirección: ' + r.direccion + ', ' + r.ciudad + ' (' + r.cp + '), ' + r.provincia + '\nContacto: ' + r.contacto); } catch (e) {}
    return {ok:true, codigo:codigo, total:total};
  } finally { lock.releaseLock(); }
}

function estado_(codigo, estado, notas){
  if (ESTADOS.indexOf(estado) < 0) return {ok:false, error:'Estado inválido'};
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const o = rows_('Pedidos').find(x => String(x.codigo) === String(codigo)); if (!o) return {ok:false, error:'No encontré el pedido'};
    const sh = sheet_('Pedidos');
    // si se cancela, devuelve el stock; si se reactiva, lo vuelve a descontar
    const antes = String(o.estado), prods = productos_(), byName = {}; prods.forEach(p => byName[p.id] = p);
    const ids = String(o.ids || '').split(',').filter(Boolean);
    const delta = (antes !== 'Cancelada' && estado === 'Cancelada') ? 1 : (antes === 'Cancelada' && estado !== 'Cancelada') ? -1 : 0;
    if (delta) { const ps = sheet_('Productos'), cs = COL_P.indexOf('stock') + 1; const q = {}; ids.forEach(n => q[n] = (q[n] || 0) + 1);
      for (const n in q) if (byName[n]) ps.getRange(byName[n]._row, cs).setValue(Math.max(0, byName[n].stock + delta * q[n])); }
    sh.getRange(o._row, COL_O.indexOf('estado') + 1).setValue(estado);
    if (notas != null) sh.getRange(o._row, COL_O.indexOf('notas') + 1).setValue(limpio_(notas, 500));
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function guardarProducto_(p){
  const id = limpio_(p.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g,''); if (!id) return {ok:false, error:'Falta el id (ej: empanada)'};
  const row = [id, limpio_(p.nombre, 60) || id, Math.max(0, Number(p.precio) || 0), Math.max(0, Math.floor(Number(p.stock) || 0)), !!p.activo, limpio_(p.linea, 20), limpio_(p.color, 9), limpio_(p.descripcion, 300), limpio_(p.imagen, 500)];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const ex = productos_().find(x => x.id === id), sh = sheet_('Productos');
    if (ex) sh.getRange(ex._row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    return {ok:true}; } finally { lock.releaseLock(); }
}
function borrarProducto_(id){ const ex = productos_().find(x => x.id === String(id)); if (!ex) return {ok:false, error:'No existe'}; sheet_('Productos').deleteRow(ex._row); return {ok:true}; }

/* ================= MERCADO PAGO (Checkout Pro) =================
 * 1) Proyecto > Configuración > Propiedades del script: agregá
 *      MP_TOKEN = tu Access Token (empieza con APP_USR-)   ← lo pegás vos, nunca lo compartas
 *      SITE_URL = https://tu-dominio/clickly/               ← a dónde vuelve el cliente después de pagar
 * 2) Ejecutá una vez instalarPagos() (te pide permisos).
 * 3) Implementar > Gestionar implementaciones > Editar > Versión nueva.
 */
function mpToken_(){ return PropertiesService.getScriptProperties().getProperty('MP_TOKEN') || ''; }
function mp_(method, path, body){
  const res = UrlFetchApp.fetch('https://api.mercadopago.com' + path, {method:method, muteHttpExceptions:true, contentType:'application/json',
    headers:{Authorization:'Bearer ' + mpToken_()}, payload: body ? JSON.stringify(body) : undefined});
  const code = res.getResponseCode(), j = JSON.parse(res.getContentText() || '{}');
  if (code >= 300) throw new Error('Mercado Pago ' + code + ': ' + (j.message || ''));
  return j;
}
function crearPreferencia_(codigo, nCajas, subtotal, envio, r, costoEnvio_){
  const site = PropertiesService.getScriptProperties().getProperty('SITE_URL') || '';
  const items = [{id:'cajas', title:nCajas + (nCajas > 1 ? ' cajas' : ' caja') + ' Clickly', quantity:1, unit_price:subtotal, currency_id:'ARS'}];
  if (costoEnvio_ > 0) items.push({id:'envio', title:ENVIOS[envio].n, quantity:1, unit_price:costoEnvio_, currency_id:'ARS'});
  const pref = {items:items, external_reference:codigo, statement_descriptor:'NIDOO',
    payer:{name:limpio_(r.nombre), surname:limpio_(r.apellido)},
    notification_url: ScriptApp.getService().getUrl() + '?a=mp',
    expires:true, expiration_date_to: Utilities.formatDate(new Date(Date.now() + HORAS_PARA_PAGAR * 3600e3), 'America/Argentina/Buenos_Aires', "yyyy-MM-dd'T'HH:mm:ss.SSS'-03:00'")};
  if (site) { pref.back_urls = {success:site + '?pago=ok', pending:site + '?pago=pendiente', failure:site + '?pago=error'}; pref.auto_return = 'approved'; }
  return mp_('post', '/checkout/preferences', pref).init_point;
}
/* Aviso de Mercado Pago: no confiamos en lo que llega, consultamos el pago directo a MP */
function avisoMp_(e, req){
  const id = (req.data && req.data.id) || e.parameter['data.id'] || e.parameter.id;
  const tipo = req.type || e.parameter.type || e.parameter.topic;
  if (!id || (tipo && tipo !== 'payment')) return;
  aplicarPago_(mp_('get', '/v1/payments/' + id));
}
function aplicarPago_(p){
  if (!p || p.status !== 'approved' || p.currency_id !== 'ARS') return false;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    asegurarColumnas_();
    const o = rows_('Pedidos').find(x => String(x.codigo) === String(p.external_reference));
    if (!o || String(o.estado) === 'Pagada') return false;
    if (Math.abs(Number(p.transaction_amount) - Number(o.total)) > 1) { notificar_('Pago con monto distinto ' + o.codigo, 'Pedido: $' + o.total + ' · Pagado: $' + p.transaction_amount + ' · Pago MP ' + p.id); return false; }
    const sh = sheet_('Pedidos');
    sh.getRange(o._row, COL_O.indexOf('estado') + 1).setValue('Pagada');
    sh.getRange(o._row, COL_O.indexOf('pago_id') + 1).setValue(String(p.id));
    notificar_('Clickly · Pago aprobado ' + o.codigo, o.nombre + ' ' + o.apellido + '\n' + o.cajas + '\nEnvío: ' + o.envio + '\nTotal cobrado: $' + p.transaction_amount + '\nContacto: ' + o.contacto + '\nPago MP: ' + p.id);
    return true;
  } finally { lock.releaseLock(); }
}
/* Cada 10 minutos: busca pagos que no avisaron y cancela los que no se pagaron a tiempo */
function revisarPagos(){
  if (!mpToken_()) return;
  const pend = rows_('Pedidos').filter(o => String(o.estado) === 'Pendiente de pago');
  pend.forEach(o => {
    try {
      const r = mp_('get', '/v1/payments/search?external_reference=' + encodeURIComponent(o.codigo) + '&status=approved');
      if ((r.results || []).some(p => aplicarPago_(p))) return;
      const edad = (Date.now() - new Date(o.fecha).getTime()) / 3600e3;
      if (edad > HORAS_PARA_PAGAR + 1) estado_(o.codigo, 'Cancelada', 'Sin pago en ' + HORAS_PARA_PAGAR + ' h');
    } catch (err) {}
  });
}
function instalarPagos(){
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'revisarPagos').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarPagos').timeBased().everyMinutes(10).create();
  asegurarColumnas_();
  UrlFetchApp.fetch('https://api.mercadopago.com/v1/payment_methods', {headers:{Authorization:'Bearer ' + mpToken_()}, muteHttpExceptions:true});
  return mpToken_() ? 'Pagos activados.' : 'Falta MP_TOKEN en Propiedades del script.';
}
function asegurarColumnas_(){
  const sh = sheet_('Pedidos'), h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  COL_O.forEach((c, i) => { if (h[i] !== c) sh.getRange(1, i + 1).setValue(c); });
}
function notificar_(asunto, cuerpo){ try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), asunto, cuerpo); } catch (e) {} }

/* Agrega una sola vez los pops nuevos a la hoja Productos (si después los borrás, no vuelven) */
const NUEVOS = [
  ['macaron','Pink Macaron Pop',6000,10,true,'sweet','#EF97B1','Un macaron con tapitas rosa pastel y relleno blanco.','']
];
function sembrarProductos_(){
  const pr = PropertiesService.getScriptProperties();
  const pend = NUEVOS.filter(r => !pr.getProperty('SEED_' + r[0]));
  if (!pend.length) return;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ids = productos_().map(p => p.id), sh = sheet_('Productos');
    pend.forEach(r => { if (ids.indexOf(r[0]) < 0) sh.appendRow(r); pr.setProperty('SEED_' + r[0], '1'); });
  } finally { lock.releaseLock(); }
}


/* ---------- visitas a la web (anónimas: un id al azar por navegador, sin IP ni datos personales) ---------- */
function registrarVisita_(p){
  const id = limpio_(p.id, 24).replace(/[^a-z0-9]/gi,''); if (!id) return;
  const pag = ({nidoo:'NiDoo', clickly:'Clickly'})[p.p] || 'otra';
  let o = limpio_(p.r, 60).toLowerCase();
  o = /instagram|^ig$|l\.instagram/.test(o) ? 'Instagram' : /facebook|fb/.test(o) ? 'Facebook' : /google/.test(o) ? 'Google' : /whatsapp|wa\.me/.test(o) ? 'WhatsApp' : o === 'interno' ? 'Navegando la web' : o ? o : 'Directo / link';
  let sh = sheet_('Visitas');
  if (!sh) { sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Visitas'); sh.appendRow(['fecha','visitante','pagina','origen','movil','nuevo']); sh.setFrozenRows(1); }
  sh.appendRow([new Date(), id, pag, o, p.m === '1' ? 'Sí' : 'No', p.n === '1' ? 'Sí' : 'No']);
}
function visitas_(){
  const sh = sheet_('Visitas'); if (!sh || sh.getLastRow() < 2) return {ok:true, total:0, unicos:0, hoy:0, hoyUnicos:0, semana:0, dias:[], paginas:{}, origenes:{}, movil:0};
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const tz = 'America/Argentina/Buenos_Aires', dia = d => Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd'), hoy = dia(new Date());
  const desde7 = Date.now() - 7 * 864e5, ids = new Set(), idsHoy = new Set(), ids7 = new Set(), porDia = {}, pag = {}, ori = {}; let mov = 0, n7 = 0, nHoy = 0;
  v.forEach(r => { const t = new Date(r[0]).getTime(), d = dia(r[0]); ids.add(r[1]);
    if (d === hoy) { nHoy++; idsHoy.add(r[1]); }
    if (t >= desde7) { n7++; ids7.add(r[1]); }
    (porDia[d] = porDia[d] || {v:0, u:new Set()}).v++; porDia[d].u.add(r[1]);
    pag[r[2]] = (pag[r[2]] || 0) + 1; ori[r[3]] = (ori[r[3]] || 0) + 1; if (r[4] === 'Sí') mov++; });
  const dias = []; for (let i = 13; i >= 0; i--) { const d = dia(Date.now() - i * 864e5); dias.push({d:d, v:porDia[d] ? porDia[d].v : 0, u:porDia[d] ? porDia[d].u.size : 0}); }
  return {ok:true, total:v.length, unicos:ids.size, hoy:nHoy, hoyUnicos:idsHoy.size, semana:n7, semanaUnicos:ids7.size, dias:dias, paginas:pag, origenes:ori, movil:Math.round(mov / v.length * 100)};
}
