/* NiDoo · nav global, footer y apariciones al hacer scroll (estilo apple.com). */
(function(){
var EGG='<svg viewBox="0 0 26 32" aria-hidden="true"><path fill="currentColor" d="M12.2 1C5.6 1.4 1 10.6 1 19.4 1 26.6 6.2 31 13.4 31 20.5 31 25 26.3 25 19.6 25 10.1 19.5.6 12.2 1Z"/></svg>';
var LINKS=[['Clickly','/clickly/'],['Fidgets','/fidgets/'],['SpiBall','/spiball/'],['PENTA','/penta/'],['Catálogo','/catalogo/'],['Bolsas','/#bolsas'],['Ayuda','https://ig.me/m/clickly_oficial']];
var path=location.pathname;
function ext(h){return h.indexOf('http')===0?' target="_blank" rel="noopener"':''}
function cur(h){return h!=='/'&&h.charAt(0)==='/'&&h.indexOf('#')<0&&path.indexOf(h)===0}

var gn=document.getElementById('ac-gn');
if(gn){
  var li=LINKS.map(function(l){return '<li class="ac-it"><a href="'+l[1]+'"'+ext(l[1])+(cur(l[1])?' aria-current="page"':'')+'>'+l[0]+'</a></li>'}).join('');
  var sh=LINKS.map(function(l,i){return '<a href="'+l[1]+'"'+ext(l[1])+' style="transition-delay:'+(.04*i+.08).toFixed(2)+'s">'+l[0]+'</a>'}).join('');
  gn.setAttribute('aria-label','NiDoo');
  gn.innerHTML='<div class="ac-bar"></div><ul><li><a class="ac-egg" href="/" aria-label="NiDoo, inicio">'+EGG+'</a></li>'+li+
    '<li><button class="ac-burger" aria-label="Menú" aria-expanded="false"><i></i><i></i></button></li></ul>'+
    '<div class="ac-sheet">'+sh+'<span class="ac-h">Seguinos</span><a class="ac-sm" href="https://www.instagram.com/clickly_oficial/" target="_blank" rel="noopener">Instagram</a></div>';
  var bt=gn.querySelector('.ac-burger');
  function setOpen(o){gn.classList.toggle('open',o);document.documentElement.classList.toggle('ac-lock',o);bt.setAttribute('aria-expanded',o)}
  bt.addEventListener('click',function(){setOpen(!gn.classList.contains('open'))});
  gn.querySelectorAll('.ac-sheet a').forEach(function(a){a.addEventListener('click',function(){setOpen(false)})});
  addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false)});
  addEventListener('resize',function(){if(innerWidth>833)setOpen(false)});
}

var ft=document.getElementById('ac-ft');
if(ft){
  var note=ft.getAttribute('data-note')||'';
  var page=ft.getAttribute('data-page');
  var cols=[
    ['Marcas',[['Clickly','/clickly/'],['SpiBall','/spiball/'],['PENTA','/penta/'],['Fidgets','/fidgets/'],['Catálogo','/catalogo/']]],
    ['Comprar',[['Armá tu caja Clickly','/clickly/'],['Diseñá tu SpiBall','/spiball/#disena'],['Elegí tu PENTA','/penta/#disena'],['Pedí por Instagram','https://ig.me/m/clickly_oficial']]],
    ['NiDoo',[['Por qué NiDoo','/#por-que'],['Bolsas NiDoo','/#bolsas'],['Sensorial Egg','/fidgets/sensorial-egg/'],['Infinity Q','/fidgets/infinity-q/']]],
    ['Seguinos',[['Instagram','https://www.instagram.com/clickly_oficial/'],['Mensaje directo','https://ig.me/m/clickly_oficial']]]];
  ft.innerHTML='<div class="ac-w">'+(note?'<div class="ac-note">'+note+'</div>':'')+
    '<div class="ac-crumb"><a href="/" aria-label="NiDoo">'+EGG+'</a>'+(page?'<span>›</span>'+page:'')+'</div>'+
    '<div class="ac-cols">'+cols.map(function(c){return '<div class="ac-col"><h3>'+c[0]+'</h3><ul>'+c[1].map(function(l){var ext=l[1].indexOf('http')===0;return '<li><a href="'+l[1]+'"'+(ext?' target="_blank" rel="noopener"':'')+'>'+l[0]+'</a></li>'}).join('')+'</ul></div>'}).join('')+'</div>'+
    '<div class="ac-legal"><span>Copyright © 2026 NiDoo. Hecho en Argentina, capa por capa.</span><span>Precios en pesos argentinos.</span></div></div>';
  ft.querySelectorAll('.ac-col h3').forEach(function(h){h.addEventListener('click',function(){if(innerWidth<=833)h.parentNode.classList.toggle('open')})});
}

/* apariciones: todo lo marcado con data-r, más los títulos de sección */
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
var els=[].slice.call(document.querySelectorAll('[data-r]'));
if(!RM&&'IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(el){var r=el.getBoundingClientRect();el.classList.add('ac-r');if(el.dataset.r)el.classList.add(el.dataset.r);if(r.top<innerHeight*.92)requestAnimationFrame(function(){el.classList.add('in')});else io.observe(el)});
}
})();
