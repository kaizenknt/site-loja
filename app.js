/* D'Lu Empório e VKS Condimentos — lógica do site (catálogo + sacola + preços).
   Portado do design original. Sem framework: só JavaScript puro.
   Preços vêm de precos.json (publicado pelo Balcão PDV). */
(function(){
'use strict';
var CAT = window.CATALOGO, LOJAS = CAT.lojas;

/* ---------- estado ---------- */
var state = {
  cat:'Todos', loja:'dlu', busca:'', slide:0,
  carrinhos:{dlu:[], vks:[]},
  sacola:false, conta:false, contaAba:'dados',
  nome:'', fone:'', doc:'', razao:'', endereco:'', obs:'',
  nf:'nao', entrega:'Retirar na loja',
  historico:[], apagarOk:false, limparOk:false,
  sel:{}, agora:Date.now(),
  enviando:false, enviado:null, erroEnvio:'', statusPed:{}
};
var PRECOS = null;         // { itens:{ chave:{kg|op} }, indisponivel:[chaves], _exemplo:bool }
var PRECOS_CACHE = {};     // preços por loja (cada loja publica os seus pelo Balcão)
var avisoTimer=null, relogio=null, slideTimer=null;

/* ---------- persistência ---------- */
function guardarSacola(){ try{ localStorage.setItem('dlu-sacola', JSON.stringify({carrinhos:state.carrinhos, nome:state.nome})); }catch(e){} }
function guardarConta(){
  try{
    localStorage.setItem('dlu-conta', JSON.stringify({
      dados:{nome:state.nome,fone:state.fone,doc:state.doc,razao:state.razao,endereco:state.endereco},
      historico:state.historico
    }));
  }catch(e){}
  guardarSacola();
}
function carregar(){
  try{ var s=JSON.parse(localStorage.getItem('dlu-sacola')||'null'); if(s&&s.carrinhos){ state.carrinhos={dlu:s.carrinhos.dlu||[],vks:s.carrinhos.vks||[]}; state.nome=s.nome||''; } }catch(e){}
  try{ var c=JSON.parse(localStorage.getItem('dlu-conta')||'null'); if(c){ var d=c.dados||{}; state.nome=d.nome||state.nome; state.fone=d.fone||''; state.doc=d.doc||''; state.razao=d.razao||''; state.endereco=d.endereco||''; state.historico=c.historico||[]; } }catch(e){}
}

/* ---------- utilidades de cor (produtos sem foto) ---------- */
function hx(h){ return [1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16);}); }
function mix(a,b,t){ var x=hx(a),y=hx(b); return '#'+x.map(function(v,i){return Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0');}).join(''); }
function grao(c){
  var cl=mix(c,'#ffffff',0.38), ce=mix(c,'#000000',0.32), cm=mix(c,'#ffffff',0.16);
  return 'radial-gradient(circle at 30% 35%, '+ce+' 0 1.4px, transparent 2.2px) 0 0 / 9px 9px, '
    +'radial-gradient(circle at 60% 70%, '+cl+' 0 1.6px, transparent 2.4px) 3px 5px / 11px 11px, '
    +'radial-gradient(circle at 50% 50%, '+cm+' 0 1px, transparent 1.7px) 6px 2px / 7px 7px, '
    +'radial-gradient(circle at 50% 30%, '+cl+', '+c+' 55%, '+ce+')';
}

/* ---------- aberto agora ---------- */
function situacao(l){
  var partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(state.agora));
  function pt(t){ var x=partes.find(function(p){return p.type===t;}); return x?x.value:''; }
  var dia=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(pt('weekday'));
  var minuto=parseInt(pt('hour'),10)*60+parseInt(pt('minute'),10);
  var util=dia>=1&&dia<=6, fecha=960;
  if(util&&minuto>=l.abre&&minuto<fecha){
    var falta=fecha-minuto;
    return {aberto:true, texto:falta<=60?('Aberto · fecha em '+falta+' min'):'Aberto agora · fecha às 16h', cor:'#4cc27f', fundo:'#e3f5ea', tinta:'#146b3f'};
  }
  var quando='amanhã';
  if(util&&minuto<l.abre) quando='hoje'; else if(dia===6) quando='segunda';
  return {aberto:false, texto:'Fechado · abre '+quando+' às '+l.abreTxt, cor:'#f26b5b', fundo:'#fde6e2', tinta:'#9b2a1c'};
}

/* ---------- preços ---------- */
function slug(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function chavePreco(p){ return slug(p.nome)+(p.marca?('|'+slug(p.marca)):''); }
function precoDe(p){ return PRECOS&&PRECOS.itens?PRECOS.itens[chavePreco(p)]:null; }
function emFalta(p){ return !!(PRECOS&&PRECOS.indisponivel&&PRECOS.indisponivel.indexOf(chavePreco(p))>=0); }
function brl(cent){ return 'R$ '+(cent/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
/* preço em centavos de uma opção escolhida; null se não houver preço */
function precoOpcao(p,op){
  var pr=precoDe(p); if(!pr) return null;
  if(op.g!=null && pr.kg!=null) return Math.round(pr.kg*op.g/1000);      // granel: por grama
  if(pr.op && pr.op[op.r]!=null) return pr.op[op.r];                      // embalado/unidade: por opção
  return null;
}

/* ---------- opções de quantidade / ardência de cada produto ---------- */
function extras(p,loja){
  var fardo = loja.id==='vks' ? {r:'Saco 25 kg',g:25000,fechado:'saco fechado'} : {r:'Fardo 10 kg',g:10000,fechado:'fardo fechado'};
  var opcoes;
  if(p.nome==='Alho roxo nacional') opcoes=[{r:'Caixa 10 kg',un:'caixa de 10 kg'}];
  else if(p.nome==='Alho descascado') opcoes=[{r:'Pacote 1 kg',un:'pacote de 1 kg'}];
  else if(p.emb) opcoes=(p.tamanhos||['Unidade']).map(function(t){return {r:t,un:'un'};});
  else opcoes=[{r:'250 g',g:250},{r:'500 g',g:500},{r:'1 kg',g:1000},(p.selo==='Saco 25 kg'?{r:'Saco 25 kg',g:25000,fechado:'saco fechado'}:fardo)];
  var ard = typeof p.ard==='number'?p.ard:null;
  var nomes=['Sem ardência','Suave','Média','Média-forte','Muito forte','Extrema'];
  var cores=['#3f7a3a','#3f7a3a','#b7791f','#c2410c','#b8321e','#7a1010'];
  return {
    opcoes:opcoes, rotuloOpcoes:p.emb?'Tamanho':'Quantidade',
    temArd:ard!==null, ardTxt:ard!==null?(p.ardRotulo||nomes[ard]):'',
    ardCor:ard!==null?cores[ard]:'#1d2240',
    pimentas:ard!==null?[0,1,2,3,4].map(function(i){return i<ard?'#d6261a':'#e2d9c6';}):[]
  };
}

/* ---------- monta a lista de produtos da loja atual ---------- */
function montarProdutos(loja){
  var wa=function(txt){return 'https://wa.me/'+loja.waNum+'?text='+encodeURIComponent(txt);};
  return CAT.base
    .filter(function(p){ return !p.so || p.so===loja.id; })
    .map(function(p){
      var r=p.fotos&&p.fotos[loja.id], t=p.fotosT&&p.fotosT[loja.id];
      if(r) return Object.assign({},p,{foto:r,recorte:true});
      if(t) return Object.assign({},p,{foto:t,recorte:false});
      return (p.foto&&p.so!==loja.id&&loja.id!=='dlu')?Object.assign({},p,{foto:''}):p;
    })
    .map(function(p){
      var ex=extras(p,loja);
      var emb=!!p.emb;
      return Object.assign({},p,{
        venda:p.venda||(emb?(p.tamanhos?'':'Consulte os tamanhos'):'a partir de 250 g'),
        selo:p.selo||(p.marca?'Marca '+p.marca:(p.cat==='Misturas da casa'?'Da casa':'')),
        temSelo:!!(p.selo||p.marca||p.cat==='Misturas da casa'),
        temFoto:!!p.foto&&!p.recorte, temRecorte:!!p.recorte, semFoto:!p.foto, foto:p.foto||'',
        temGrao:!p.foto&&!emb,
        temPote:!p.foto&&emb&&(p.cat==='Pimentas em conserva'||/^Mel/.test(p.nome)),
        temGarrafa:!p.foto&&emb&&!(p.cat==='Pimentas em conserva'||/^Mel/.test(p.nome)),
        graoBg:grao(p.cor),
        fundo:p.recorte?('radial-gradient(circle at 50% 38%, #ffffff 0%, '+mix(p.cor,'#ffffff',0.9)+' 70%)'):mix(p.cor,'#ffffff',0.87),
        sombra:mix(p.cor,'#000000',0.55), tampa:mix(p.cor,'#000000',0.5),
        brilho:'linear-gradient(100deg, '+mix(p.cor,'#000000',0.25)+' 0%, '+p.cor+' 30%, '+mix(p.cor,'#ffffff',0.35)+' 45%, '+p.cor+' 60%, '+mix(p.cor,'#000000',0.3)+' 100%)',
        rotulo:p.marca||(loja.id==='vks'?'VKS':'D’Lu'),
        curto:p.nome.replace(/^(Molho de pimenta |Molho de |Molho |Pimenta de |Pimenta )/,''),
        seloBg:p.marca?'#1d2240':(p.cat==='Misturas da casa'&&!p.selo?'#b8321e':'#f2b31b'),
        seloCor:(p.marca||(p.cat==='Misturas da casa'&&!p.selo))?'#ffffff':'#1d2240',
        opcoes:ex.opcoes, rotuloOpcoes:ex.rotuloOpcoes, temArd:ex.temArd, ardTxt:ex.ardTxt, ardCor:ex.ardCor, pimentas:ex.pimentas,
        chave:chavePreco(p),
        wa:wa('Olá, '+loja.nome+'! Quero pedir:\n'+(emb
          ? (p.nome+(p.marca?' '+p.marca:'')+(p.tamanhos?' ('+p.tamanhos.join(' / ')+')':'')+' – tamanho: ___ · quantidade: ___')
          : (p.nome+' – ___ '+(p.unidade||'g'))))
      });
    });
}

/* ---------- HTML helpers ---------- */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function at(s){ return esc(s).replace(/'/g,'&#39;'); }

/* ---------- cartão de produto ---------- */
function cartaoHTML(p){
  var sel=Math.min(state.sel[p.chave]||0, Math.max(p.opcoes.length-1,0));
  var midia='';
  if(p.temFoto) midia='<img class="midia-img" src="'+at(p.foto)+'" alt="'+at(p.nome)+' a granel" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">';
  else if(p.temRecorte) midia='<img class="midia-img" src="'+at(p.foto)+'" alt="'+at(p.nome)+'" loading="lazy" style="position:absolute;left:0;right:0;top:7%;bottom:5%;margin:auto;max-width:84%;max-height:88%;width:auto;height:auto;object-fit:contain;display:block;filter:drop-shadow(0 14px 14px rgba(29,34,64,.28))">';
  else if(p.temGrao) midia='<div class="midia-img" aria-hidden="true" style="position:relative;width:70%;height:62%;display:flex;align-items:flex-end;justify-content:center">'
      +'<div style="position:absolute;bottom:4%;width:92%;height:18%;border-radius:50%;background:'+p.sombra+';opacity:.22;filter:blur(6px)"></div>'
      +'<div style="position:relative;width:100%;height:88%;border-radius:50% 50% 46% 46% / 72% 72% 28% 28%;background:'+p.graoBg+';box-shadow:inset 0 -10px 14px rgba(0,0,0,.18),inset 0 8px 12px rgba(255,255,255,.18)"></div></div>';
  else if(p.temPote) midia='<div class="midia-img" aria-hidden="true" style="position:relative;height:80%;aspect-ratio:.78;display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:74%;height:14%;border-radius:8px 8px 4px 4px;background:'+p.tampa+';box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),inset 0 3px 0 rgba(255,255,255,.18)"></div>'
      +'<div style="position:relative;width:100%;flex:1;margin-top:3%;border-radius:14px 14px 22px 22px;background:'+p.graoBg+';box-shadow:inset 10px 0 14px rgba(255,255,255,.25),inset -8px 0 12px rgba(0,0,0,.2),0 16px 22px -12px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">'
      +'<div style="width:84%;padding:9px 6px;background:#fffaf0;border-radius:6px;text-align:center;display:flex;flex-direction:column;gap:2px;box-shadow:0 2px 4px rgba(0,0,0,.15)"><span style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b8321e">'+esc(p.rotulo)+'</span><span style="font-family:\'Archivo\',\'Arial Narrow\',sans-serif;font-stretch:72%;font-weight:900;font-size:15px;line-height:1;text-transform:uppercase;color:#1d2240">'+esc(p.curto)+'</span></div></div></div>';
  else if(p.temGarrafa) midia='<div class="midia-img" aria-hidden="true" style="position:relative;height:86%;aspect-ratio:.42;display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:34%;height:9%;border-radius:5px 5px 2px 2px;background:#1d2240"></div>'
      +'<div style="width:26%;height:14%;background:'+p.brilho+';opacity:.92"></div>'
      +'<div style="width:100%;height:9%;border-radius:40% 40% 0 0 / 100% 100% 0 0;background:'+p.brilho+'"></div>'
      +'<div style="position:relative;width:100%;flex:1;border-radius:0 0 14px 14px;background:'+p.brilho+';box-shadow:0 16px 22px -12px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">'
      +'<div style="width:92%;padding:9px 4px;background:#fffaf0;border-radius:4px;text-align:center;display:flex;flex-direction:column;gap:2px;box-shadow:0 2px 4px rgba(0,0,0,.15)"><span style="font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#b8321e">'+esc(p.rotulo)+'</span><span style="font-family:\'Archivo\',\'Arial Narrow\',sans-serif;font-stretch:68%;font-weight:900;font-size:13px;line-height:1;text-transform:uppercase;color:#1d2240">'+esc(p.curto)+'</span></div></div></div>';

  var selo = p.temSelo?('<span style="position:absolute;z-index:1;left:12px;top:12px;background:'+p.seloBg+';color:'+p.seloCor+';font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:5px 10px;border-radius:999px;transform:rotate(-3deg);box-shadow:0 4px 10px -4px rgba(0,0,0,.35)">'+esc(p.selo)+'</span>'):'';

  var ard = p.temArd?('<div style="display:flex;align-items:center;gap:8px"><span style="display:flex;gap:1px" aria-hidden="true">'
      +p.pimentas.map(function(c){return '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M14 3c0 2 1 3 3 3-1 1-1.5 2-1.5 3.5C15.5 15 11 21 5 21c-1 0-1.5-.6-1-1.2C7 16 8 12 10 9.5 11 8 12.5 7.6 14 8c0-1.6-.6-3-2-4z" fill="'+c+'"></path></svg>';}).join('')
      +'</span><span style="font-size:12px;font-weight:800;color:'+p.ardCor+';text-transform:uppercase;letter-spacing:.06em">'+esc(p.ardTxt)+'</span></div>'):'';

  var opc = p.opcoes.map(function(o,i){
    var on=i===sel;
    return '<button type="button" data-act="opt" data-key="'+at(p.chave)+'" data-oi="'+i+'" aria-pressed="'+on+'" style="font:inherit;font-size:13px;font-weight:800;padding:6px 11px;min-height:34px;border-radius:999px;cursor:pointer;border:1.5px solid '+(on?'#1d2240':'#e2d9c6')+';background:'+(on?'#1d2240':'#ffffff')+';color:'+(on?'#ffffff':'#1d2240')+'">'+esc(o.r)+'</button>';
  }).join('');

  // preço
  var precoHTML='';
  var falta=emFalta(p);
  var pr=precoDe(p);
  var cent=precoOpcao(p,p.opcoes[sel]);
  if(falta){
    precoHTML='<span class="preco-consulta" style="color:#9b2a1c">Em falta no momento</span>';
  } else if(cent!=null){
    var extra='';
    if(pr&&pr.kg!=null) extra='<span class="preco-kg">'+brl(pr.kg)+' / kg</span>';
    precoHTML='<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="preco preco-sel">'+brl(cent)+'</span>'+extra+'</div>';
  } else {
    precoHTML='<span class="preco-consulta">Preço sob consulta</span>';
  }

  return '<article class="card" style="height:100%;background:#fff;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 0 1px #ece5d6">'
    +'<div style="position:relative;aspect-ratio:4/3;max-width:100%;background:'+p.fundo+';overflow:hidden;display:flex;align-items:center;justify-content:center">'+midia+selo+'</div>'
    +'<div style="padding:16px 18px 18px;display:flex;flex-direction:column;gap:8px;flex:1">'
      +'<span style="font-size:11px;font-weight:800;color:#b8321e;text-transform:uppercase;letter-spacing:.12em">'+esc(p.cat)+'</span>'
      +'<h3 style="margin:0;font-family:\'Archivo\',\'Arial Narrow\',sans-serif;font-stretch:75%;font-weight:900;font-size:22px;line-height:1.02;text-transform:uppercase">'+esc(p.nome)+'</h3>'
      +'<p style="margin:0;font-size:14px;color:#5a5f78;flex:1">'+esc(p.uso)+'</p>'
      +ard
      +'<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:11px;font-weight:800;color:#5a5f78;text-transform:uppercase;letter-spacing:.1em">'+esc(p.rotuloOpcoes)+'</span><div style="display:flex;flex-wrap:wrap;gap:6px" role="group" aria-label="'+at(p.rotuloOpcoes)+'">'+opc+'</div></div>'
      +precoHTML
      +'<div style="display:flex;gap:8px;margin-top:4px">'
        +'<button type="button" data-act="add" data-key="'+at(p.chave)+'"'+(falta?' disabled aria-disabled="true"':'')+' style="flex:1;font:inherit;cursor:'+(falta?'not-allowed':'pointer')+';opacity:'+(falta?'.45':'1')+';border:none;background:#1d2240;color:#fff;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:.06em;padding:12px;border-radius:999px;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg><span class="add-txt">Adicionar</span></button>'
        +'<a class="btn-wa" href="'+at(p.wa)+'" target="_blank" rel="noopener" aria-label="Pedir só '+at(p.nome)+' pelo WhatsApp" title="Pedir só este produto" style="flex:none;width:46px;height:46px;border-radius:50%;background:#1b7a4b;color:#fff;display:flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></a>'
      +'</div>'
    +'</div></article>';
}

/* ================= REGIÕES ================= */
function ctx(){
  var loja=LOJAS[state.loja]||LOJAS.dlu;
  var produtos=montarProdutos(loja);
  var ordem=['Alho','Misturas da casa','Pimentas e pápricas','Especiarias','Ervas','Chás','Desidratados','Pimentas em conserva','Molhos','Mel, dendê e manteiga'];
  var cats=ordem.filter(function(c){return produtos.some(function(p){return p.cat===c;});});
  var sel=(state.cat==='Todos'||cats.indexOf(state.cat)>=0)?state.cat:'Todos';
  function norm(s){return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
  var q=norm(state.busca.trim());
  var lista=sel==='Todos'?produtos:produtos.filter(function(p){return p.cat===sel;});
  if(q) lista=lista.filter(function(p){return norm(p.nome+' '+p.cat+' '+(p.marca||'')).indexOf(q)>=0;});
  return {loja:loja, produtos:produtos, cats:cats, sel:sel, q:q, lista:lista, sit:situacao(loja)};
}
function waGeralDe(loja){ return 'https://wa.me/'+loja.waNum+'?text='+encodeURIComponent('Olá, '+loja.nome+'! Gostaria de fazer um pedido:\n'); }

function fillTopo(c){
  var loja=c.loja, sit=c.sit;
  var abasLoja=Object.keys(LOJAS).map(function(id){
    var l=LOJAS[id], on=id===loja.id;
    return '<button type="button" data-act="loja" data-loja="'+id+'" aria-pressed="'+on+'" style="font:inherit;font-weight:800;font-size:13px;padding:5px 13px;min-height:32px;border-radius:999px;border:1px solid '+(on?'#f2b31b':'#4a5a94')+';background:'+(on?'#f2b31b':'transparent')+';color:'+(on?'#1d2240':'#c9d0e6')+';cursor:pointer">'+esc(l.nome)+'</button>';
  }).join('');
  var qtd=(state.carrinhos[loja.id]||[]).length;
  var nome=state.nome.trim().split(' ')[0];
  var logo = loja.temLogo
    ? '<img class="logo-img" src="imagens/logo-dlu.png" alt="D’Lu Empório" style="height:58px;width:auto;display:block">'
    : '<span style="display:flex;flex-direction:column;line-height:1"><span class="disp" style="font-weight:900;font-size:34px;color:#23336b">VKS</span><span style="font-weight:800;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#b8321e">Condimentos</span></span>';
  return ''
  +'<div class="topo-barra" style="background:#1d2240;color:#c9d0e6;font-size:13px"><div class="wrap" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 16px;padding-top:6px;padding-bottom:6px">'
    +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap" role="group" aria-label="Escolha a loja"><span style="margin-right:2px">Você está na loja:</span>'+abasLoja+'</div>'
    +'<span style="font-weight:700;display:inline-flex;align-items:center;gap:8px"><span class="ponto-vivo" aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:'+sit.cor+'"></span>'+esc(sit.texto)+'<span class="hide-sm" style="font-weight:600;color:#8f98bd">· '+esc(loja.horarioCurto)+'</span></span>'
  +'</div></div>'
  +'<header style="background:#fff;border-bottom:1px solid #ece5d6"><div class="wrap head-row head-pad" style="padding-top:12px;padding-bottom:12px">'
    +'<a href="#inicio" style="text-decoration:none;display:flex;align-items:center">'+logo+'</a>'
    +'<div class="head-search" style="position:relative"><label for="busca" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Buscar tempero</label>'
      +'<input id="busca" class="search" type="search" value="'+at(state.busca)+'" data-act="busca" placeholder="O que vai temperar hoje? Páprica, cominho, Ana Maria…" style="width:100%;font:inherit;font-size:16px;padding:13px 52px 13px 20px;border-radius:999px;border:2px solid #ece5d6;background:#f8f3ea;color:#1d2240">'
      +'<span aria-hidden="true" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:#23336b;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg></span></div>'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<button type="button" data-act="abrirConta" aria-label="Minha conta" style="font:inherit;cursor:pointer;height:48px;padding:0 14px 0 8px;border-radius:999px;border:2px solid #ece5d6;background:#fff;color:#1d2240;display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px"><span aria-hidden="true" style="width:32px;height:32px;border-radius:50%;background:#f8f3ea;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg></span><span class="hide-sm">'+(nome?('Olá, '+esc(nome)):'Minha conta')+'</span></button>'
      +'<button type="button" data-act="abrirSacola" aria-label="Abrir meu pedido" style="position:relative;font:inherit;cursor:pointer;width:48px;height:48px;border-radius:50%;border:2px solid #ece5d6;background:#fff;color:#1d2240;display:flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg>'+(qtd>0?('<span style="position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#b8321e;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+qtd+'</span>'):'')+'</button>'
      +'<a class="btn-wa hide-sm" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:700;font-size:15px;padding:9px 16px 9px 12px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center;gap:10px;line-height:1.15"><span aria-hidden="true" style="width:32px;height:32px;border-radius:50%;background:#2a9a62;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></span><span style="display:flex;flex-direction:column"><span style="font-size:12px;font-weight:600">Peça pelo WhatsApp</span><span style="font-variant-numeric:tabular-nums;font-weight:800">'+esc(loja.fone)+'</span></span></a>'
    +'</div>'
  +'</div></header>'
  +'<nav aria-label="Categorias" style="background:#23336b"><div class="wrap catnav" id="catnav" style="padding-top:6px;padding-bottom:6px">'+navCatsHTML(c)+'</div></nav>';
}
function navCatsHTML(c){
  return ['Todos'].concat(c.cats).map(function(cat){
    var on=cat===c.sel&&!c.q;
    return '<a class="navlink" href="#produtos" data-act="cat" data-cat="'+at(cat)+'" aria-current="'+on+'" style="text-decoration:none;white-space:nowrap;color:'+(on?'#ffffff':'#ffffff')+';background:'+(on?'#f2b31b':'transparent')+';color:'+(on?'#1d2240':'#ffffff')+';font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.06em;padding:9px 14px;border-radius:999px;min-height:38px;display:inline-flex;align-items:center">'+esc(cat)+'</a>';
  }).join('');
}

function fillHero(c){
  var loja=c.loja, sit=c.sit;
  var slides = loja.id==='vks' ? [
    {selo:'VKS Condimentos',titulo:'Alho roxo nacional',destaque:'em caixa de 10 kg',texto:'Para restaurantes, açougues e revenda. Entrega somente por Lalamove, Uber ou retirada na Avenida Mercúrio, 330.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Varejo e atacado',titulo:'Temperos a granel',destaque:'no Brás',texto:'Sacos de 25 kg ou a quantidade que você precisar, pesada na hora.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Aberto às 6h',titulo:'Segunda a sábado,',destaque:'das 6h às 16h',texto:'Avenida Mercúrio, 330 – Brás. Pertinho da D’Lu Empório.',botao:'Como chegar',link:'#visite'}
  ] : [
    {selo:'Varejo e atacado',titulo:'Temperos a granel',destaque:'do jeito que você precisa',texto:'De 250 g a fardos de 10 kg. Temperos, ervas e misturas da casa, pesados na hora.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Misturas da casa',titulo:'Ana Maria, Edu Guedes,',destaque:'Gaúcho e muito mais',texto:'As misturas que os clientes mais pedem, prontas para temperar.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Para o seu negócio',titulo:'Atacado em fardos de',destaque:'10 kg',texto:'Ou a quantidade que você precisar, pesada na hora. Mande a lista no WhatsApp que a gente separa.',botao:'Ver produtos',link:'#produtos'}
  ];
  var si=state.slide%slides.length;
  var s=slides[si];
  var comF=c.produtos.filter(function(p){return p.foto&&!p.recorte;});
  var tigelaCores=loja.id==='vks'?['#8a4a6b','#efe3c4','#c4241b']:['#b5651d','#5e7a35','#c4402a'];
  var pos=[{w:'64%',t:'20%',l:'34%'},{w:'40%',t:'56%',l:'2%'},{w:'34%',t:'4%',l:'6%'}];
  var tig=pos.map(function(ps,i){
    var f=comF.length?comF[(i+si*3)%comF.length]:null;
    var inner=f?('<img src="'+at(f.foto)+'" alt="'+at(f.nome)+'">'):('<div aria-hidden="true" style="width:100%;height:100%;background:'+grao(tigelaCores[i])+'"></div>');
    return '<div class="bowl" style="width:'+ps.w+';aspect-ratio:1;top:'+ps.t+';left:'+ps.l+';animation-duration:'+['6.5s','5.2s','7.4s'][i]+';animation-delay:'+['-1s','-3s','-2s'][i]+'"><div class="bowl-in" style="animation-name:'+(si%2?'popB':'popA')+';animation-delay:'+(0.25+i*0.15)+'s">'+inner+'</div></div>';
  }).join('');
  var pontos=slides.map(function(_,i){var on=i===si;return '<button type="button" data-act="slide" data-i="'+i+'" aria-label="Ir para o destaque '+(i+1)+'" aria-current="'+on+'" style="width:'+(on?'28px':'10px')+';height:10px;border-radius:999px;border:none;background:'+(on?'#f2b31b':'#4a5a94')+';cursor:pointer;padding:0"></button>';}).join('');
  return '<section id="inicio" aria-roledescription="carrossel" aria-label="Destaques" style="background:radial-gradient(1200px 500px at 85% 20%, #2c3d78 0%, #1d2240 60%);color:#fff;position:relative;overflow:hidden">'
    +'<svg class="gira" aria-hidden="true" viewBox="0 0 400 400" style="position:absolute;right:-120px;bottom:-160px;width:620px;height:620px;opacity:.18"><circle cx="200" cy="200" r="190" fill="none" stroke="#f2b31b" stroke-width="2" stroke-dasharray="2 10"></circle><circle cx="200" cy="200" r="140" fill="none" stroke="#f2b31b" stroke-width="2" stroke-dasharray="2 10"></circle></svg>'
    +'<div class="wrap hero" style="padding-top:56px;padding-bottom:92px;position:relative">'
      +'<div style="display:flex;flex-direction:column;gap:20px">'
        +'<div class="entra d1" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px"><span style="display:inline-flex;align-items:center;gap:8px;background:'+sit.fundo+';color:'+sit.tinta+';font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px"><span class="ponto-vivo" aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:'+sit.cor+'"></span>'+esc(sit.texto)+'</span><span class="eyebrow" style="color:#f2b31b">'+esc(s.selo)+'</span></div>'
        +'<h1 class="disp entra d2" style="margin:0;font-weight:900;font-size:clamp(46px,6.6vw,88px);line-height:.9;text-wrap:balance">'+esc(s.titulo)+' <span style="color:#f2b31b">'+esc(s.destaque)+'</span></h1>'
        +'<p class="entra d3" style="margin:0;font-size:19px;color:#c9d0e6;max-width:42ch">'+esc(s.texto)+'</p>'
        +'<div class="entra d4" style="display:flex;flex-wrap:wrap;gap:12px;padding-top:6px"><a class="btn-y" href="'+at(s.link)+'" style="text-decoration:none;background:#f2b31b;color:#1d2240;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.06em;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center;gap:10px">'+esc(s.botao)+' <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a><a class="btn-ghost" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="text-decoration:none;border:2px solid #fff;color:#fff;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.06em;padding:14px 26px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center">Pedir no WhatsApp</a></div>'
        +'<div class="entra d5" style="display:flex;align-items:center;gap:10px;padding-top:14px"><button type="button" data-act="slidePrev" aria-label="Destaque anterior" style="width:44px;height:44px;border-radius:50%;border:1px solid #4a5a94;background:transparent;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"></path></svg></button>'+pontos+'<button type="button" data-act="slideNext" aria-label="Próximo destaque" style="width:44px;height:44px;border-radius:50%;border:1px solid #4a5a94;background:transparent;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"></path></svg></button></div>'
      +'</div>'
      +'<div class="bowls">'+tig+'<span class="selo-250" style="position:absolute;right:2%;top:4%;width:112px;height:112px;border-radius:50%;background:#f2b31b;color:#1d2240;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:rotate(12deg);box-shadow:0 14px 28px -12px rgba(0,0,0,.5);line-height:1"><span class="disp" style="font-weight:900;font-size:30px">250 g</span><span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding-top:4px">pesado<br>na hora</span></span></div>'
    +'</div></section>';
}

function fillCorpo(c){
  var loja=c.loja, produtos=c.produtos;
  // fita
  var nomesFita=produtos.filter(function(p){return p.top||p.foto||p.marca;}).concat(produtos).map(function(p){return p.nome;}).filter(function(n,i,a){return a.indexOf(n)===i;}).slice(0,14);
  var fita=nomesFita.concat(nomesFita).map(function(n){return '<span style="display:inline-flex;align-items:center;gap:22px;padding:12px 11px;font-weight:900;font-size:22px;color:#1d2240;white-space:nowrap">'+esc(n)+' <svg width="14" height="14" viewBox="0 0 24 24" fill="#b8321e"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"></path></svg></span>';}).join('');
  // vantagens
  var trust=''
   +vItem('<path d="M3 7h18l-2 13H5L3 7z"></path><path d="M8 7a4 4 0 0 1 8 0"></path>','Varejo e atacado',loja.vantagem,'#b8321e')
   +vItem('<path d="M4 20h16"></path><path d="M6 20l2-9h8l2 9"></path><path d="M12 11V5"></path><circle cx="12" cy="4" r="1.5"></circle>','Pesado na hora','Na quantidade do seu pedido','#b8321e')
   +vItem('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>','Duas lojas no Brás','D’Lu Empório e VKS Condimentos','#b8321e')
   +vItem('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path>','Pedido pelo WhatsApp',loja.fone,'#1b7a4b');
  // circulos
  var cats=c.cats;
  function nCat(cat){return produtos.filter(function(p){return p.cat===cat;});}
  var circ=cats.map(function(cat){
    var ps=nCat(cat); var fc=(ps.find(function(p){return p.foto&&!p.recorte;})||{}).foto||'';
    var on=cat===c.sel&&!c.q;
    var dot=fc?('<img class="dot" src="'+at(fc)+'" alt="" style="width:100%;max-width:150px;aspect-ratio:1;object-fit:cover;border-radius:50%;border:5px solid '+(on?'#f2b31b':'#ffffff')+';box-shadow:0 0 0 1px #ece5d6;display:block">'):('<span class="dot" aria-hidden="true" style="width:100%;max-width:150px;aspect-ratio:1;border-radius:50%;background:'+grao((ps[0]||{}).cor||'#cccccc')+';border:5px solid '+(on?'#f2b31b':'#ffffff')+';box-shadow:0 0 0 1px #ece5d6;display:block"></span>');
    return '<a class="circ revela" href="#produtos" data-act="cat" data-cat="'+at(cat)+'" style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">'+dot+'<span style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#1d2240">'+esc(cat)+'</span><span style="font-size:12px;color:#5a5f78">'+ps.length+(ps.length===1?' produto':' produtos')+'</span></span></a>';
  }).join('');
  // destaques
  function comFoto(p){return (p.foto?2:0)+(p.top?1:0);}
  var destaques=produtos.slice().sort(function(a,b){return comFoto(b)-comFoto(a);}).slice(0,6);
  var destHTML=destaques.map(function(p){return '<div class="revela cel">'+cartaoHTML(p)+'</div>';}).join('');
  // galeria
  var comF=produtos.filter(function(p){return p.foto&&!p.recorte;});
  var galeria=comF.filter(function(p){return p.cat==='Misturas da casa';}).slice(0,5);
  var galeriaHTML='';
  if(galeria.length>=5){
    galeriaHTML='<sectionwrap><section style="background:#1d2240;color:#fff">'
      +'<svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:#fff"><path d="M0 48 C 240 0 480 0 720 24 C 960 48 1200 48 1440 8 L1440 48 Z" fill="#1d2240"></path></svg>'
      +'<div class="wrap" style="padding-top:40px;padding-bottom:72px;display:flex;flex-direction:column;gap:28px"><div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px;max-width:640px"><span class="eyebrow" style="color:#f2b31b">Misturas da casa</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Direto da bandeja para a sua cozinha</h2><p style="margin:0;color:#c9d0e6;font-size:17px">Misturas montadas aqui na loja, do jeito que os clientes pedem há anos.</p></div><a class="btn-y" href="#produtos" data-act="cat" data-cat="Misturas da casa" style="text-decoration:none;background:#f2b31b;color:#1d2240;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:.06em;padding:14px 24px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center">Ver todas as misturas</a></div>'
      +'<div class="bento">'+galeria.map(function(g){return '<a class="bento-item revela" href="#produtos" data-act="cat" data-cat="Misturas da casa" style="position:relative;display:block;border-radius:22px;overflow:hidden;text-decoration:none;min-height:0"><img src="'+at(g.foto)+'" alt="'+at(g.nome)+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block"><span style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,24,48,0) 45%,rgba(20,24,48,.85) 100%)"></span><span class="disp" style="position:absolute;left:18px;right:18px;bottom:14px;font-weight:900;font-size:26px;line-height:1;color:#fff">'+esc(g.nome)+'</span></a>';}).join('')+'</div></div>'
      +'<svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:#f8f3ea"><path d="M0 0 L1440 0 L1440 24 C 1200 48 960 0 720 20 C 480 40 240 48 0 16 Z" fill="#1d2240"></path></svg>'
      +'</section></sectionwrap>';
  }
  return '<div class="fita" aria-hidden="true"><div class="fita-faixa"><div class="fita-trilho">'+fita+'</div></div></div>'
    +'<section style="padding-top:26px;padding-bottom:8px"><div class="wrap trust revela">'+trust+'</div></section>'
    +'<section style="padding-top:56px;padding-bottom:28px"><div class="wrap" style="display:flex;flex-direction:column;gap:32px"><div class="revela" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="eyebrow" style="color:#b8321e">Compre por categoria</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95;color:#1d2240">Tem tempero pra tudo</h2></div><div class="circles">'+circ+'</div></div></section>'
    +'<section style="padding-top:40px;padding-bottom:64px"><div class="wrap" style="display:flex;flex-direction:column;gap:28px"><div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:#b8321e">'+(loja.id==='vks'?'Os mais pedidos da VKS':'Os mais pedidos da D’Lu')+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Destaques da semana</h2></div><a href="#produtos" style="font-weight:800;font-size:15px;display:inline-flex;align-items:center;gap:8px">Ver todos os produtos <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div><div class="prods">'+destHTML+'</div></div></section>'
    +galeriaHTML;
}
function vItem(path,titulo,texto,stroke){
  return '<div style="display:flex;gap:14px;align-items:center;padding:18px;border-radius:18px;background:#f8f3ea"><span aria-hidden="true" style="width:48px;height:48px;flex:none;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg></span><span style="display:flex;flex-direction:column;min-width:0"><strong style="font-size:15px">'+esc(titulo)+'</strong><span style="font-size:13px;color:#5a5f78">'+esc(texto)+'</span></span></div>';
}

function fillCatalogo(c){
  var temFiltro=!!c.q||c.sel!=='Todos';
  var abas=['Todos'].concat(c.cats).map(function(cat){
    var on=(cat===c.sel)&&!c.q;
    return '<button type="button" data-act="cat" data-cat="'+at(cat)+'" aria-pressed="'+on+'" style="font:inherit;white-space:nowrap;font-weight:800;font-size:13px;padding:9px 16px;min-height:40px;border-radius:999px;border:1px solid #e2d9c6;background:'+(on?'#1d2240':'#ffffff')+';color:'+(on?'#ffffff':'#1d2240')+';cursor:pointer">'+esc(cat)+'</button>';
  }).join('');
  var grid=c.lista.map(function(p){return '<div class="revela cel">'+cartaoHTML(p)+'</div>';}).join('');
  var vazio=c.lista.length===0?('<p style="margin:0;padding:36px;text-align:center;background:#fff;border-radius:20px;color:#5a5f78">Não achamos esse produto no site. <a href="'+at(waGeralDe(c.loja))+'" target="_blank" rel="noopener" style="font-weight:800">Pergunte pelo WhatsApp</a>: temos muito mais na loja.</p>'):'';
  var limpar=temFiltro?('<button type="button" data-act="limpar" style="font:inherit;font-weight:800;font-size:14px;padding:10px 18px;min-height:44px;border-radius:999px;border:2px solid #1d2240;background:#fff;color:#1d2240;cursor:pointer">Limpar filtro ✕</button>'):'';
  var exemplo = (PRECOS&&PRECOS._exemplo)?'<p style="margin:0;font-size:13px;color:#b8321e;font-weight:700">⚠️ Preços de exemplo — serão substituídos pelos preços reais do Balcão.</p>':'';
  return '<section id="produtos" style="padding-top:64px;padding-bottom:72px;background:#f8f3ea"><div class="wrap" style="display:flex;flex-direction:column;gap:26px">'
    +'<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:#b8321e">'+c.lista.length+(c.lista.length===1?' produto':' produtos')+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">'+esc(c.q?'Resultado da busca':(c.sel==='Todos'?'Todos os produtos':c.sel))+'</h2></div>'+limpar+'</div>'
    +exemplo
    +'<div class="catnav" style="gap:8px;padding-bottom:4px" role="group" aria-label="Filtrar por categoria">'+abas+'</div>'
    +'<div class="prods">'+grid+'</div>'+vazio
  +'</div></section>';
}

function fillAtacado(c){
  var loja=c.loja;
  var quadros=loja.quadros.map(function(q){return '<div class="etiqueta" style="position:relative;background:#fdf6e8;color:#1d2240;border-radius:16px 16px 20px 20px;padding:34px 12px 22px;text-align:center;display:flex;flex-direction:column;gap:6px;box-shadow:0 18px 30px -18px rgba(0,0,0,.6)"><span aria-hidden="true" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;background:#b8321e;box-shadow:inset 0 2px 3px rgba(0,0,0,.4)"></span><span class="disp" style="font-weight:900;font-size:clamp(30px,3.4vw,46px);line-height:1;color:#b8321e">'+esc(q.n)+'</span><span style="font-size:13px;font-weight:700;color:#1d2240;line-height:1.3">'+esc(q.t)+'</span></div>';}).join('');
  var waAtacado='https://wa.me/'+loja.waNum+'?text='+encodeURIComponent('Olá, '+loja.nome+'! Quero um orçamento de atacado:\n');
  return '<section style="background:#b8321e;color:#fff;position:relative;overflow:hidden"><div aria-hidden="true" style="position:absolute;inset:0;opacity:.5;background:radial-gradient(circle at 30% 35%, #8f2414 0 1.5px, transparent 2.4px) 0 0 / 14px 14px, radial-gradient(circle at 60% 70%, #d4553a 0 1.6px, transparent 2.6px) 5px 7px / 17px 17px"></div><div class="wrap atacado" style="padding-top:72px;padding-bottom:72px;position:relative"><div class="revela-esq" style="display:flex;flex-direction:column;gap:16px"><span class="eyebrow" style="color:#f2b31b">Atacado '+esc(loja.nome)+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(40px,5.4vw,68px);line-height:.92">Compra para o seu negócio? A gente abastece.</h2><p style="margin:0;color:#fde3da;font-size:18px;max-width:46ch">'+esc(loja.textoAtacado)+'</p><a class="btn-y" href="'+at(waAtacado)+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:#f2b31b;color:#1d2240;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.06em;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center;gap:10px">Pedir orçamento de atacado <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div><div class="tags revela">'+quadros+'</div></div></section>';
}

function fillPedir(c){
  var loja=c.loja;
  return '<section id="como-pedir" style="padding-top:72px;padding-bottom:72px"><div class="wrap pedir"><div class="revela-esq" style="display:flex;flex-direction:column;gap:26px"><div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:#b8321e">Simples e rápido</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Como pedir</h2></div>'
    +'<ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px">'
    +passo('1','Escolha os temperos','No site ou perguntando pelo que precisa. No varejo, a partir de 250 g por produto.')
    +passo('2','Monte sua sacola','Escolha a quantidade e toque em “Adicionar” em cada produto. No fim, abra a sacola e envie direto para a loja (ou pelo WhatsApp, se preferir).')
    +passo('3','A gente pesa e separa','Conferimos o pedido, pesamos na hora e avisamos quando estiver pronto.')
    +'</ol><a class="btn-wa" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.06em;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center">Fazer meu pedido</a></div>'
    +'<figure class="revela" aria-label="Exemplo de conversa de pedido" style="margin:0;background:#e9e1d2;border-radius:28px;padding:18px;box-shadow:0 30px 50px -30px rgba(29,34,64,.45)"><div style="background:#efe7d9;border-radius:18px;overflow:hidden"><div style="background:#1b7a4b;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px"><span style="width:38px;height:38px;border-radius:50%;background:#fff;color:#23336b;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px" class="disp">'+(loja.id==='vks'?'VKS':'D’Lu')+'</span><span style="display:flex;flex-direction:column;line-height:1.2"><strong style="font-size:15px">'+esc(loja.nome)+'</strong><span style="font-size:12px;color:#d3f0df">conta comercial</span></span></div><div style="padding:18px 14px 22px;display:flex;flex-direction:column;gap:10px;font-size:15px"><div class="bolha b1" style="align-self:flex-end;max-width:82%;background:#d9fdd3;color:#1a2a1f;border-radius:14px 14px 4px 14px;padding:10px 12px;white-space:pre-line;box-shadow:0 1px 1px rgba(0,0,0,.08)">Bom dia! Quero:\nCominho – 500 g\nPáprica defumada – 1 kg</div><div class="bolha b2" style="align-self:flex-start;max-width:82%;background:#fff;color:#1a2a1f;border-radius:14px 14px 14px 4px;padding:10px 12px;box-shadow:0 1px 1px rgba(0,0,0,.08)">Bom dia! Já estamos separando. Avisamos assim que estiver pesado e pronto.</div><div class="bolha b3" style="align-self:flex-end;max-width:82%;background:#d9fdd3;color:#1a2a1f;border-radius:14px 14px 4px 14px;padding:10px 12px;box-shadow:0 1px 1px rgba(0,0,0,.08)">Perfeito, obrigado!</div></div></div></figure></div></section>';
}
function passo(n,t,d){return '<li style="display:flex;gap:18px;align-items:flex-start"><span class="disp" style="flex:none;width:52px;height:52px;border-radius:50%;background:#f2b31b;color:#1d2240;font-weight:900;font-size:26px;display:flex;align-items:center;justify-content:center">'+n+'</span><span style="display:flex;flex-direction:column;gap:2px;padding-top:4px"><strong style="font-size:18px">'+esc(t)+'</strong><span style="color:#5a5f78">'+esc(d)+'</span></span></li>';}

function fillVisite(c){
  var cards=Object.keys(LOJAS).map(function(id){
    var l=LOJAS[id]; var sit=situacao(l); var on=id===c.loja.id;
    var wa='https://wa.me/'+l.waNum+'?text='+encodeURIComponent('Olá, '+l.nome+'! Gostaria de fazer um pedido:\n');
    return '<article class="revela" style="background:#fff;border-radius:24px;padding:30px;display:flex;flex-direction:column;gap:18px;box-shadow:0 0 0 2px '+(on?'#f2b31b':'#ffffff')+', 0 24px 40px -30px rgba(29,34,64,.5)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><h3 class="disp" style="margin:0;font-weight:900;font-size:36px;line-height:1;color:#23336b">'+esc(l.nome)+'</h3><span style="display:inline-flex;align-items:center;gap:8px;background:'+sit.fundo+';color:'+sit.tinta+';font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px"><span class="ponto-vivo" aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:'+sit.cor+'"></span>'+esc(sit.texto)+'</span></div>'
      +'<p style="margin:0;color:#5a5f78">'+esc(l.historia)+'</p>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;padding:18px;border-radius:16px;background:#f8f3ea"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#b8321e">Endereço</span><span style="font-weight:700">'+esc(l.endereco)+'</span><a href="'+at(l.mapa)+'" target="_blank" rel="noopener" style="font-weight:800;font-size:14px">Abrir no mapa →</a></div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#b8321e">Horário</span><span style="font-weight:700">'+esc(l.horario)+'</span><span style="font-size:14px;color:#5a5f78">'+esc(l.dias)+'</span></div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#b8321e">WhatsApp</span><span style="font-weight:700;font-variant-numeric:tabular-nums">'+esc(l.fone)+'</span></div></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:10px"><a class="btn-wa" href="'+at(wa)+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:15px;padding:13px 22px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center">Pedir na '+esc(l.nome)+'</a><button type="button" data-act="loja" data-loja="'+id+'" style="font:inherit;font-weight:800;font-size:15px;padding:13px 22px;min-height:48px;border-radius:999px;border:2px solid #1d2240;background:#fff;color:#1d2240;cursor:pointer">Ver produtos desta loja</button></div>'
    +'</article>';
  }).join('');
  return '<section id="visite" style="padding-top:72px;padding-bottom:80px;background:#f8f3ea"><div class="wrap" style="display:flex;flex-direction:column;gap:32px"><div class="revela" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="eyebrow" style="color:#b8321e">Duas lojas no Brás</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Visite nossas lojas</h2></div><div class="lojas">'+cards+'</div></div></section>';
}

function fillRodape(c){
  var loja=c.loja;
  var cats=c.cats.map(function(cat){return '<a href="#produtos" data-act="cat" data-cat="'+at(cat)+'" style="color:#c9d0e6;text-decoration:none">'+esc(cat)+'</a>';}).join('');
  return '<footer style="background:#1d2240;color:#c9d0e6;font-size:14px"><svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:#f8f3ea"><path d="M0 48 C 240 0 480 0 720 24 C 960 48 1200 48 1440 8 L1440 48 Z" fill="#1d2240"></path></svg><div class="wrap foot" style="padding-top:40px;padding-bottom:32px"><div style="display:flex;flex-direction:column;gap:14px"><img src="imagens/logo-dlu.png" alt="D’Lu Empório" style="height:76px;width:auto;align-self:flex-start;background:#fff;border-radius:16px;padding:8px"><p style="margin:0;max-width:34ch">Temperos, ervas, misturas da casa, pimentas e molhos no Brás. Varejo e atacado, pesado na hora.</p><a class="btn-wa" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:14px;padding:11px 18px;border-radius:999px;min-height:44px;display:inline-flex;align-items:center">Pedir no WhatsApp</a></div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:#f2b31b;text-transform:uppercase;letter-spacing:.1em;font-size:12px">Categorias</strong>'+cats+'</div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:#f2b31b;text-transform:uppercase;letter-spacing:.1em;font-size:12px">D’Lu Empório</strong><span>Rua Santa Rosa, 244 – Brás</span><span>Seg. a sáb. · 5h30 às 16h</span><span style="font-variant-numeric:tabular-nums">(11) 3313-6697</span></div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:#f2b31b;text-transform:uppercase;letter-spacing:.1em;font-size:12px">VKS Condimentos</strong><span>Avenida Mercúrio, 330 – Brás</span><span>Seg. a sáb. · 6h às 16h</span><span style="font-variant-numeric:tabular-nums">(11) 3311-7153</span></div></div><div class="wrap" style="border-top:1px solid #333a5c;padding-top:16px;padding-bottom:22px;font-size:13px">São Paulo – SP · Site do catálogo. Os pedidos são conferidos e pesados na loja.</div></footer>';
}

/* ---------- sacola: textos, documento, mensagem ---------- */
function fmtG(g){ return g>=1000?(String(+(g/1000).toFixed(3)).replace('.',',')+' kg'):(g+' g'); }
function soNum(v){ return String(v||'').replace(/\D/g,''); }
function cpfOk(c){ if(c.length!==11||/^(\d)\1+$/.test(c))return false; function dv(n){var t=0;for(var i=0;i<n;i++)t+=+c[i]*(n+1-i);var r=(t*10)%11;return r===10?0:r;} return dv(9)===+c[9]&&dv(10)===+c[10]; }
function cnpjOk(c){ if(c.length!==14||/^(\d)\1+$/.test(c))return false; function dv(n){var p=n===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];var t=0;for(var i=0;i<n;i++)t+=+c[i]*p[i];var r=t%11;return r<2?0:11-r;} return dv(12)===+c[12]&&dv(13)===+c[13]; }
function fmtDoc(c){ return c.length===11?c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):(c.length===14?c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):c); }

function itemProduto(x,loja){
  // reconstrói o produto base para preço (marca separada por '|')
  var partes=x.chavePreco?x.chavePreco.split('|'):[];
  return {nome:x.nome, marca:x.marca};
}
function linhaTxt(x){
  var nome=x.nome+(x.marca?' '+x.marca:'');
  if(x.g) return nome+(x.fechado?' ('+x.n+' '+x.fechado.replace(' ',(x.n>1?'s ':' '))+(x.n>1?'s':'')+')':'')+' – '+fmtG(x.g*x.n);
  if(x.un==='un') return nome+' '+(x.r==='Unidade'?'':x.r+' ')+'– '+x.n+' un';
  return nome+' – '+x.n+' '+x.un.replace(/^(caixa|pacote)/,function(m){return x.n>1?m+'s':m;});
}
function precoItem(x){
  var p={nome:x.nome, marca:x.marca};
  var op={r:x.r, g:x.g||null};
  var unit=precoOpcao(p,op);
  return unit!=null?unit*x.n:null;
}
function totalSacola(loja){
  var itens=state.carrinhos[loja.id]||[];
  var algum=false, soma=0, falta=false;
  itens.forEach(function(x){ var c=precoItem(x); if(c!=null){algum=true;soma+=c;} else falta=true; });
  return {algum:algum, soma:soma, falta:falta};
}

function fillOverlay(c){
  var loja=c.loja;
  var html='';
  // aviso toast
  if(state._aviso) html+='<div class="aviso" role="status" style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;background:#1d2240;color:#fff;padding:12px 18px;border-radius:999px;display:flex;align-items:center;gap:12px;box-shadow:0 14px 30px -10px rgba(0,0,0,.5);max-width:calc(100% - 32px)"><span aria-hidden="true" style="width:24px;height:24px;flex:none;border-radius:50%;background:#4cc27f;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span><span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Na sacola: <b>'+esc(state._aviso)+'</b></span><button type="button" data-act="abrirSacola" style="font:inherit;cursor:pointer;border:none;background:#f2b31b;color:#1d2240;font-weight:800;font-size:13px;padding:7px 12px;border-radius:999px;min-height:34px;white-space:nowrap">Ver pedido</button></div>';
  // FAB sacola
  var qtd=(state.carrinhos[loja.id]||[]).length;
  if(qtd>0) html+='<button type="button" data-act="abrirSacola" style="position:fixed;left:20px;bottom:20px;z-index:50;font:inherit;cursor:pointer;border:none;background:#1d2240;color:#fff;padding:0 20px 0 14px;height:58px;border-radius:999px;display:flex;align-items:center;gap:10px;box-shadow:0 12px 24px -8px rgba(0,0,0,.45)"><span style="width:34px;height:34px;border-radius:50%;background:#f2b31b;color:#1d2240;font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center">'+qtd+'</span><span style="font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:.06em">Ver meu pedido</span></button>';
  // FAB whatsapp
  html+='<a class="btn-wa pulso" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" aria-label="Pedir pelo WhatsApp da '+at(loja.nome)+'" style="position:fixed;right:20px;bottom:20px;width:62px;height:62px;border-radius:50%;background:#1b7a4b;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(27,122,75,.18),0 12px 24px -8px rgba(0,0,0,.45);z-index:50"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></a>';
  if(state.sacola) html+=sacolaHTML(c);
  if(state.conta) html+=contaHTML(c);
  return html;
}

function confirmacaoHTML(loja){
  var cod=state.enviado.codigo, st=state.statusPed[cod]||{};
  var waTxt='Olá, '+loja.nome+'! Acabei de fazer o pedido '+cod+' pelo site.';
  return '<div style="text-align:center;padding:26px 6px;display:flex;flex-direction:column;align-items:center;gap:14px">'
    +'<span aria-hidden="true" style="width:64px;height:64px;border-radius:50%;background:#e3f5ea;display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1b7a4b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span>'
    +'<h3 class="disp" style="margin:0;font-weight:900;font-size:32px;line-height:1">Pedido enviado!</h3>'
    +'<p style="margin:0;color:#5a5f78;max-width:32ch">A '+esc(loja.nome)+' recebeu seu pedido. A gente confere, pesa e avisa você pelo WhatsApp.</p>'
    +'<div style="display:flex;flex-direction:column;gap:4px;padding:14px 24px;border-radius:18px;background:#f8f3ea;border:2px dashed #e2d9c6"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#5a5f78">Código do pedido</span><span class="disp" style="font-weight:900;font-size:40px;letter-spacing:.12em;color:#1d2240">'+esc(cod)+'</span></div>'
    +'<p role="status" style="margin:0;font-size:15px;font-weight:700;color:#1d2240">'+esc(st.rotulo||'Recebido, aguardando a loja')+(st.numero?' · nº '+esc(st.numero)+' na loja':'')+'</p>'
    +'<button type="button" data-act="verStatus" data-cod="'+at(cod)+'" data-loja="'+at(loja.id)+'" style="font:inherit;cursor:pointer;border:2px solid #1d2240;background:#fff;color:#1d2240;font-weight:800;font-size:14px;padding:9px 18px;border-radius:999px;min-height:42px">Atualizar situação</button>'
    +'<a class="btn-wa" href="'+at('https://wa.me/'+loja.waNum+'?text='+encodeURIComponent(waTxt))+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:14px;padding:11px 18px;border-radius:999px;min-height:44px;display:inline-flex;align-items:center">Falar com a loja no WhatsApp</a>'
    +'<button type="button" data-act="novoPedido" style="font:inherit;cursor:pointer;border:none;background:transparent;color:#b8321e;font-weight:700;font-size:14px;padding:6px 10px;min-height:36px">Fazer outro pedido</button>'
  +'</div>';
}
function sacolaHTML(c){
  var loja=c.loja;
  var nItens=(state.carrinhos[loja.id]||[]).length, rotItens=nItens===1?'1 item':nItens+' itens';
  if(state.enviado&&state.enviado.loja===loja.id){
    return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharSacola" aria-label="Fechar" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Pedido enviado" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;justify-content:flex-end;padding:16px 18px 0"><button type="button" data-act="fecharSacola" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid #ece5d6;background:#fff;color:#1d2240;cursor:pointer;font-size:20px;line-height:1">✕</button></div><div style="flex:1;overflow-y:auto;padding:0 22px 24px">'+confirmacaoHTML(loja)+'</div></aside></div>';
  }
  var itens=(state.carrinhos[loja.id]||[]).map(function(x,i){
    var resumo=x.g?(fmtG(x.g*x.n)+(x.n>1?' · '+x.n+'× '+x.r:'')):(x.n+'× '+x.r);
    var cent=precoItem(x);
    var preco=cent!=null?('<span style="font-size:13px;font-weight:800;color:#1d2240">'+brl(cent)+'</span>'):'';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:#f8f3ea"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><strong style="font-size:15px;line-height:1.2">'+esc(x.nome)+(x.marca?' '+esc(x.marca):'')+'</strong><span style="font-size:13px;color:#5a5f78">'+esc(resumo)+'</span>'+preco+'</div><div style="display:flex;align-items:center;gap:2px;background:#fff;border-radius:999px;border:1px solid #e2d9c6"><button type="button" class="qtd-btn" data-act="menos" data-bi="'+i+'" aria-label="Diminuir" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:#1d2240;font-size:18px;font-weight:800;cursor:pointer">−</button><span style="min-width:22px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums">'+x.n+'</span><button type="button" class="qtd-btn" data-act="mais" data-bi="'+i+'" aria-label="Aumentar" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:#1d2240;font-size:18px;font-weight:800;cursor:pointer">+</button></div><button type="button" data-act="tirar" data-bi="'+i+'" aria-label="Tirar do pedido" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:#8a8fa8;cursor:pointer"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg></button></div>';
  }).join('');
  var vazio=itens.length===0;
  var corpo=vazio
    ? '<div style="text-align:center;padding:40px 12px;color:#5a5f78;display:flex;flex-direction:column;align-items:center;gap:12px"><svg aria-hidden="true" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e2d9c6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg><strong style="color:#1d2240;font-size:17px">Sua sacola está vazia</strong><span>Escolha a quantidade nos produtos e toque em “Adicionar”.</span><button type="button" data-act="fecharSacola" style="font:inherit;cursor:pointer;border:2px solid #1d2240;background:#fff;color:#1d2240;font-weight:800;padding:10px 18px;border-radius:999px;min-height:44px">Ver produtos</button></div>'
    : itens;

  var rodape='';
  if(!vazio){
    var doc=soNum(state.doc), ehCnpj=doc.length>11, docValido=ehCnpj?cnpjOk(doc):cpfOk(doc);
    var querNf=state.nf==='sim', entrega=state.entrega!=='Retirar na loja';
    var tot=totalSacola(loja);
    var entregas=['Retirar na loja','Entrega por Lalamove ou Uber'].map(function(t){var on=state.entrega===t;return '<button type="button" data-act="entrega" data-v="'+at(t)+'" aria-pressed="'+on+'" style="flex:1;font:inherit;cursor:pointer;font-size:13px;font-weight:800;padding:9px 10px;min-height:40px;border-radius:999px;border:1.5px solid #1d2240;background:'+(on?'#1d2240':'#ffffff')+';color:'+(on?'#ffffff':'#1d2240')+'">'+esc(t)+'</button>';}).join('');
    var endBloco=entrega?('<label for="sacolaEnd" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Endereço de entrega</label><input id="sacolaEnd" value="'+at(state.endereco)+'" data-act="campo" data-field="endereco" autocomplete="street-address" placeholder="Rua, número, bairro e cidade" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">'):'';
    var nfOp=[{v:'nao',t:'Não preciso'},{v:'sim',t:'Sim, quero nota'}].map(function(o){var on=state.nf===o.v;return '<button type="button" data-act="nf" data-v="'+o.v+'" aria-pressed="'+on+'" style="flex:1;font:inherit;cursor:pointer;font-size:13px;font-weight:800;padding:9px 10px;min-height:40px;border-radius:999px;border:1.5px solid #1d2240;background:'+(on?'#1d2240':'#ffffff')+';color:'+(on?'#ffffff':'#1d2240')+'">'+esc(o.t)+'</button>';}).join('');
    var docDica=!doc?'Digite só os números.':(docValido?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
    var nfBloco=querNf?('<div style="display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;background:#fdf6e8;border:1px solid #f0e2c0"><label for="sacolaDoc" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">CPF ou CNPJ</label><input id="sacolaDoc" value="'+at(state.doc)+'" data-act="campo" data-field="doc" inputmode="numeric" autocomplete="off" placeholder="Só os números" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240"><span id="docDica" style="font-size:13px;font-weight:700;color:'+(doc&&docValido?'#1b7a4b':'#5a5f78')+'">'+esc(docDica)+'</span>'+(ehCnpj?('<label for="sacolaRazao" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Razão social (opcional)</label><input id="sacolaRazao" value="'+at(state.razao)+'" data-act="campo" data-field="razao" placeholder="Nome da empresa" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">'):'')+'</div>'):'';

    var erro='';
    if(!state.nome.trim()) erro='Informe seu nome para a loja identificar o pedido.';
    else if(soNum(state.fone).length<10) erro='Informe seu WhatsApp com DDD: é por ele que a loja confirma o pedido.';
    else if(querNf&&!doc) erro='Para a nota fiscal, informe seu CPF ou CNPJ.';
    else if(querNf&&!docValido) erro=ehCnpj?'Esse CNPJ não parece certo. Confira os números.':'Esse CPF não parece certo. Confira os números.';
    else if(entrega&&!state.endereco.trim()) erro='Para entrega, informe o endereço.';

    var totalBloco='';
    if(tot.algum){
      totalBloco='<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 2px"><span style="font-weight:700;color:#5a5f78;font-size:14px">Estimativa'+(tot.falta?' (parcial)':'')+'</span><span class="preco" style="font-size:24px">'+brl(tot.soma)+'</span></div><p style="margin:-4px 0 0;font-size:12px;color:#5a5f78">Valor final confirmado na pesagem, na loja.</p>';
    }
    var acao=erro
      ? '<p role="alert" style="margin:0;padding:10px 12px;border-radius:12px;background:#fde6e2;color:#9b2a1c;font-size:14px;font-weight:700">'+esc(erro)+'</p>'
      : ('<button type="button" data-act="enviarLoja"'+(state.enviando?' disabled aria-busy="true"':'')+' style="font:inherit;cursor:'+(state.enviando?'wait':'pointer')+';border:none;background:#f2b31b;color:#1d2240;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.06em;padding:15px;border-radius:999px;min-height:52px;display:flex;align-items:center;justify-content:center;gap:10px"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>'+(state.enviando?'Enviando…':'Enviar pedido para a loja · '+rotItens)+'</button>'
        +(state.erroEnvio?'<p role="alert" style="margin:0;padding:10px 12px;border-radius:12px;background:#fde6e2;color:#9b2a1c;font-size:14px;font-weight:700">'+esc(state.erroEnvio)+'</p>':'')
        +'<a class="btn-wa" href="'+at(mensagemWa(c))+'" data-act="registrar" target="_blank" rel="noopener" style="text-decoration:none;background:'+(state.erroEnvio?'#1b7a4b':'#fff')+';color:'+(state.erroEnvio?'#fff':'#1b7a4b')+';border:2px solid #1b7a4b;font-weight:800;font-size:14px;padding:11px;border-radius:999px;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg>'+(state.erroEnvio?'Enviar pelo WhatsApp':'ou enviar pelo WhatsApp')+'</a>');

    rodape='<div style="border-top:1px solid #ece5d6;margin:4px -22px 0;padding:16px 22px 6px;display:flex;flex-direction:column;gap:12px;background:#fff">'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Retirada ou entrega">'+entregas+'</div>'+endBloco
      +'<span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Precisa de nota fiscal?</span><div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Nota fiscal">'+nfOp+'</div>'+nfBloco
      +'<label for="sacolaNome" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Seu nome</label><input id="sacolaNome" value="'+at(state.nome)+'" data-act="campo" data-field="nome" autocomplete="name" placeholder="Para a gente identificar o pedido" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">'
      +'<label for="sacolaFone" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Seu WhatsApp</label><input id="sacolaFone" type="tel" value="'+at(state.fone)+'" data-act="campo" data-field="fone" autocomplete="tel" inputmode="tel" placeholder="(11) 90000-0000" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">'
      +'<input id="hpCampo" name="empresa_site" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
      +'<label for="sacolaObs" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">Observação (opcional)</label><input id="sacolaObs" value="'+at(state.obs)+'" data-act="campo" data-field="obs" placeholder="Ex.: separar em pacotes de 1 kg" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">'
      +totalBloco+acao
      +'<button type="button" data-act="limpar2" style="align-self:center;font:inherit;cursor:pointer;border:none;background:transparent;color:#b8321e;font-weight:700;font-size:14px;padding:6px 10px;min-height:36px">'+(state.limparOk?'Toque de novo para esvaziar':'Esvaziar sacola')+'</button>'
    +'</div>';
  }

  return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharSacola" aria-label="Fechar meu pedido" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Meu pedido" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px;border-bottom:1px solid #ece5d6"><div style="display:flex;flex-direction:column;gap:2px"><span class="eyebrow" style="color:#b8321e">'+esc(loja.nome)+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:34px;line-height:1">Meu pedido</h2></div><button type="button" data-act="fecharSacola" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid #ece5d6;background:#fff;color:#1d2240;cursor:pointer;font-size:20px;line-height:1">✕</button></div><div style="flex:1;overflow-y:auto;padding:16px 22px 22px;display:flex;flex-direction:column;gap:12px">'+corpo+rodape+'</div></aside></div>';
}

function mensagemWa(c){
  var loja=c.loja;
  var itens=state.carrinhos[loja.id]||[];
  var doc=soNum(state.doc), ehCnpj=doc.length>11;
  var querNf=state.nf==='sim', entrega=state.entrega!=='Retirar na loja';
  var tot=totalSacola(loja);
  var msg='Olá, '+loja.nome+'! Gostaria de fazer um pedido:\n\n'
    +itens.map(function(x){return linhaTxt(x);}).join('\n')
    +'\n\n'+state.entrega
    +(entrega&&state.endereco.trim()?'\nEndereço: '+state.endereco.trim():'')
    +'\nNota fiscal: '+(querNf?('sim, no '+(ehCnpj?'CNPJ ':'CPF ')+fmtDoc(doc)+(ehCnpj&&state.razao.trim()?' ('+state.razao.trim()+')':'')):'não preciso')
    +(state.nome.trim()?'\nNome: '+state.nome.trim():'')
    +(state.fone.trim()?'\nTelefone: '+state.fone.trim():'')
    +(state.obs.trim()?'\nObs.: '+state.obs.trim():'')
    +(tot.algum?('\n\nEstimativa'+(tot.falta?' (parcial)':'')+': '+brl(tot.soma)+' — confirmar na pesagem.'):'');
  return 'https://wa.me/'+loja.waNum+'?text='+encodeURIComponent(msg);
}

function contaHTML(c){
  var doc=soNum(state.doc), ehCnpj=doc.length>11, docValido=ehCnpj?cnpjOk(doc):cpfOk(doc);
  var docDica=!doc?'Digite só os números.':(docValido?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
  var abas=[{v:'dados',t:'Meus dados'},{v:'pedidos',t:'Meus pedidos ('+(state.historico||[]).length+')'}].map(function(a){var on=state.contaAba===a.v;return '<button type="button" role="tab" data-act="contaAba" data-v="'+a.v+'" aria-selected="'+on+'" style="font:inherit;cursor:pointer;border:none;background:transparent;padding:10px 0;font-weight:800;font-size:15px;color:'+(on?'#1d2240':'#5a5f78')+';border-bottom:3px solid '+(on?'#b8321e':'transparent')+';margin-bottom:-1px">'+esc(a.t)+'</button>';}).join('');
  var corpo;
  if(state.contaAba==='dados'){
    corpo='<p style="margin:0 0 4px;font-size:14px;color:#5a5f78">Preencha uma vez e seus pedidos já saem com tudo pronto. <b style="color:#1d2240">Seus dados ficam salvos só neste aparelho</b> e só vão para a loja quando você envia um pedido.</p>'
      +campoHTML('contaNome','Nome','nome',state.nome,'Seu nome ou da empresa','name')
      +campoHTML('contaFone','WhatsApp','fone',state.fone,'(11) 90000-0000','tel')
      +campoHTML('contaDoc','CPF ou CNPJ (para nota fiscal)','doc',state.doc,'Só os números','off')
      +'<span id="docDica" style="font-size:13px;font-weight:700;color:'+(doc&&docValido?'#1b7a4b':'#5a5f78')+'">'+esc(docDica)+'</span>'
      +(ehCnpj?campoHTML('contaRazao','Razão social','razao',state.razao,'Nome da empresa',''):'')
      +campoHTML('contaEnd','Endereço de entrega','endereco',state.endereco,'Rua, número, bairro e cidade','street-address')
      +'<span style="font-size:13px;color:#1b7a4b;font-weight:700">Salvo automaticamente ✓</span>'
      +'<button type="button" data-act="apagarDados" style="align-self:flex-start;margin-top:8px;font:inherit;cursor:pointer;border:none;background:transparent;color:#b8321e;font-weight:700;font-size:14px;padding:6px 0;min-height:36px">'+(state.apagarOk?'Toque de novo para apagar tudo':'Apagar meus dados deste aparelho')+'</button>';
  } else {
    var h=(state.historico||[]);
    if(h.length===0){ corpo='<p style="margin:0;padding:30px 8px;text-align:center;color:#5a5f78">Os pedidos que você enviar pelo site aparecem aqui, para pedir de novo com um toque.</p>'; }
    else corpo=h.map(function(hh,i){
      var lojaNome=(LOJAS[hh.loja]||c.loja).nome;
      var resumo=hh.itens.map(function(x){return x.nome;}).slice(0,3).join(', ')+(hh.itens.length>3?' e mais '+(hh.itens.length-3):'');
      var dataTxt=new Date(hh.data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var stH=hh.codigo?(state.statusPed[hh.codigo]||null):null;
      var codHTML=hh.codigo?('<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:13px;font-weight:800;color:#1d2240">Código <span style="letter-spacing:.08em">'+esc(hh.codigo)+'</span></span>'+(stH?'<span style="font-size:13px;font-weight:700;color:#1b7a4b">'+esc(stH.rotulo)+'</span>':'<button type="button" data-act="verStatus" data-cod="'+at(hh.codigo)+'" data-loja="'+at(hh.loja)+'" style="font:inherit;cursor:pointer;border:none;background:transparent;color:#23336b;font-weight:800;font-size:13px;text-decoration:underline;padding:4px 0">Ver situação</button>')+'</div>'):'<span style="font-size:12px;color:#8a8fa8">Enviado pelo WhatsApp</span>';
      return '<div style="padding:14px;border-radius:16px;background:#f8f3ea;display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong style="font-size:15px">'+esc(lojaNome)+'</strong><span style="font-size:13px;color:#5a5f78;font-variant-numeric:tabular-nums">'+esc(dataTxt)+'</span></div><span style="font-size:14px;color:#5a5f78">'+(hh.itens.length===1?'1 item':hh.itens.length+' itens')+' · '+esc(resumo)+'</span>'+codHTML+'<button type="button" data-act="repetir" data-hi="'+i+'" style="align-self:flex-start;font:inherit;cursor:pointer;border:2px solid #1d2240;background:#fff;color:#1d2240;font-weight:800;font-size:14px;padding:8px 16px;border-radius:999px;min-height:40px">Pedir de novo</button></div>';
    }).join('');
  }
  return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharConta" aria-label="Fechar minha conta" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Minha conta" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 0"><div style="display:flex;flex-direction:column;gap:2px"><span class="eyebrow" style="color:#b8321e">D’Lu e VKS</span><h2 class="disp" style="margin:0;font-weight:900;font-size:34px;line-height:1">Minha conta</h2></div><button type="button" data-act="fecharConta" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid #ece5d6;background:#fff;color:#1d2240;cursor:pointer;font-size:20px;line-height:1">✕</button></div><div role="tablist" style="display:flex;gap:18px;padding:14px 22px 0;border-bottom:1px solid #ece5d6">'+abas+'</div><div style="flex:1;overflow-y:auto;padding:18px 22px 24px;display:flex;flex-direction:column;gap:10px">'+corpo+'</div></aside></div>';
}
function campoHTML(id,label,field,val,ph,ac){
  var extra = field==='doc'?' inputmode="numeric"':'';
  var acAttr = ac?(' autocomplete="'+ac+'"'):'';
  var tipo = field==='fone'?' type="tel"':'';
  return '<label for="'+id+'" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5a5f78">'+esc(label)+'</label><input id="'+id+'" value="'+at(val)+'" data-act="campo" data-field="'+field+'"'+tipo+extra+acAttr+' placeholder="'+at(ph)+'" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid #e2d9c6;background:#f8f3ea;color:#1d2240">';
}

/* ================= RENDER + EVENTOS ================= */
function el(id){ return document.getElementById(id); }
function renderAll(){
  var c=ctx();
  el('topo').innerHTML=fillTopo(c);
  el('hero').innerHTML=fillHero(c);
  el('corpo').innerHTML=fillCorpo(c);
  el('catalogo').innerHTML=fillCatalogo(c);
  el('atacado').innerHTML=fillAtacado(c);
  el('pedir').innerHTML=fillPedir(c);
  el('visite').innerHTML=fillVisite(c);
  el('rodape').innerHTML=fillRodape(c);
  el('overlay').innerHTML=fillOverlay(c);
}
function renderCatalogo(){ var c=ctx(); el('catalogo').innerHTML=fillCatalogo(c); el('catnav').innerHTML=navCatsHTML(c); }
function renderCorpo(){ el('corpo').innerHTML=fillCorpo(ctx()); }
function renderHero(){ el('hero').innerHTML=fillHero(ctx()); }
function renderOverlay(){ el('overlay').innerHTML=fillOverlay(ctx()); }
function syncBadge(){ // atualiza só o contador da sacola no topo (sem reconstruir busca)
  renderAll();
}

/* ---------- ações ---------- */
function addItem(p){
  var sel=Math.min(state.sel[p.chave]||0, Math.max(p.opcoes.length-1,0));
  var op=p.opcoes[sel];
  var loja=state.loja;
  var chave=p.nome+'|'+(p.marca||'')+'|'+op.r;
  var lista=state.carrinhos[loja].slice();
  var i=lista.findIndex(function(x){return x.chave===chave;});
  if(i>=0) lista[i]=Object.assign({},lista[i],{n:lista[i].n+1});
  else lista.push({chave:chave, chavePreco:p.chave, nome:p.nome, marca:p.marca||'', r:op.r, g:op.g||0, un:op.un||'', fechado:op.fechado||'', n:1});
  state.carrinhos[loja]=lista; state.limparOk=false;
  guardarSacola();
  state._aviso=p.nome+' · '+op.r;
  clearTimeout(avisoTimer);
  avisoTimer=setTimeout(function(){ state._aviso=''; renderOverlay(); }, 2200);
}
function mudarSacola(fn){
  var loja=state.loja;
  state.carrinhos[loja]=fn(state.carrinhos[loja].slice());
  state.limparOk=false; guardarSacola();
}

function onClick(e){
  var t=e.target.closest('[data-act]'); if(!t) return;
  var act=t.getAttribute('data-act');
  // links que navegam/abrem whatsapp: deixa o navegador agir
  if(act==='busca'||act==='campo') return;

  if(act==='loja'){ var id=t.getAttribute('data-loja'); if(id!==state.loja){ state.loja=id; state.cat='Todos'; state.busca=''; state.slide=0; state.sacola=false; state.conta=false; state.enviado=null; state.erroEnvio=''; PRECOS=PRECOS_CACHE[id]||null; renderAll(); carregarPrecos(); } return; }
  if(act==='cat'){ state.cat=t.getAttribute('data-cat'); state.busca=''; renderAll(); return; }
  if(act==='limpar'){ state.busca=''; state.cat='Todos'; renderAll(); return; }
  if(act==='slide'){ state.slide=+t.getAttribute('data-i'); renderHero(); return; }
  if(act==='slidePrev'){ state.slide=(state.slide+2)%3; renderHero(); return; }
  if(act==='slideNext'){ state.slide=(state.slide+1)%3; renderHero(); return; }

  if(act==='opt'){ var k=t.getAttribute('data-key'); state.sel[k]=+t.getAttribute('data-oi'); renderCatalogo(); return; }
  if(act==='add'){
    e.preventDefault();
    var key=t.getAttribute('data-key');
    var c=ctx(); var prod=c.produtos.find(function(p){return p.chave===key;});
    if(prod){ addItem(prod);
      // feedback no botão
      var span=t.querySelector('.add-txt'); if(span){ span.textContent='Adicionado ✓'; t.style.background='#1b7a4b'; setTimeout(function(){ try{span.textContent='Adicionar'; t.style.background='#1d2240';}catch(_){} },1400); }
      renderOverlay(); syncBadge();
    }
    return;
  }

  if(act==='enviarLoja'){ enviarLoja(); return; }
  if(act==='verStatus'){ verStatus(t.getAttribute('data-cod'), t.getAttribute('data-loja')); return; }
  if(act==='novoPedido'){ state.enviado=null; state.sacola=false; renderAll(); return; }
  if(act==='abrirSacola'){ state.sacola=true; state.conta=false; state.limparOk=false; renderOverlay(); return; }
  if(act==='fecharSacola'){ state.sacola=false; state.enviado=null; state.erroEnvio=''; renderOverlay(); return; }
  if(act==='abrirConta'){ state.conta=true; state.sacola=false; state.apagarOk=false; renderOverlay(); return; }
  if(act==='fecharConta'){ state.conta=false; renderOverlay(); return; }
  if(act==='contaAba'){ state.contaAba=t.getAttribute('data-v'); renderOverlay(); return; }

  if(act==='mais'){ var bi=+t.getAttribute('data-bi'); mudarSacola(function(l){l[bi]=Object.assign({},l[bi],{n:l[bi].n+1});return l;}); renderOverlay(); syncBadge(); return; }
  if(act==='menos'){ var bi2=+t.getAttribute('data-bi'); mudarSacola(function(l){ if(l[bi2].n>1) l[bi2]=Object.assign({},l[bi2],{n:l[bi2].n-1}); else l.splice(bi2,1); return l; }); renderOverlay(); syncBadge(); return; }
  if(act==='tirar'){ var bi3=+t.getAttribute('data-bi'); mudarSacola(function(l){l.splice(bi3,1);return l;}); renderOverlay(); syncBadge(); return; }
  if(act==='limpar2'){ if(state.limparOk){ mudarSacola(function(){return [];}); } else state.limparOk=true; renderOverlay(); syncBadge(); return; }

  if(act==='nf'){ state.nf=t.getAttribute('data-v'); renderOverlay(); return; }
  if(act==='entrega'){ state.entrega=t.getAttribute('data-v'); renderOverlay(); return; }

  if(act==='apagarDados'){ if(state.apagarOk){ state.nome='';state.fone='';state.doc='';state.razao='';state.endereco='';state.historico=[];state.apagarOk=false; guardarConta(); renderAll(); } else { state.apagarOk=true; renderOverlay(); } return; }
  if(act==='repetir'){ var hi=+t.getAttribute('data-hi'); var hh=(state.historico||[])[hi]; if(hh){ state.carrinhos[hh.loja]=hh.itens.map(function(x){return Object.assign({},x);}); state.loja=hh.loja; state.conta=false; state.sacola=true; state.cat='Todos'; state.busca=''; guardarSacola(); renderAll(); } return; }
  if(act==='registrar'){ // grava histórico ao enviar (o link abre o whatsapp normalmente)
    var loja=state.loja;
    var h={data:Date.now(), loja:loja, itens:(state.carrinhos[loja]||[]).map(function(x){return Object.assign({},x);})};
    state.historico=[h].concat(state.historico||[]).slice(0,20);
    guardarConta();
    return; // não previne o default: o WhatsApp abre
  }
}

function onInput(e){
  var t=e.target.closest('[data-act]'); if(!t) return;
  var act=t.getAttribute('data-act');
  if(act==='busca'){ state.busca=t.value; state.cat='Todos'; renderCatalogo(); return; }
  if(act==='campo'){
    var f=t.getAttribute('data-field');
    state[f]=t.value;
    if(f==='nome'||f==='fone'||f==='doc'||f==='razao'||f==='endereco') guardarConta(); else guardarSacola();
    // doc e endereço afetam a validação (mostrar/ocultar o botão Enviar e a razão social):
    // reconstrói a gaveta e devolve o foco e o cursor ao mesmo campo.
    if((f==='doc'||f==='endereco'||f==='nome'||f==='fone') && (state.sacola||state.conta)){
      var pos=t.selectionStart, id=t.id;
      renderOverlay();
      var n=el(id); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} }
      return;
    }
    patchEnviar();
    return;
  }
}
function patchDoc(){
  var doc=soNum(state.doc), ehCnpj=doc.length>11, ok=ehCnpj?cnpjOk(doc):cpfOk(doc);
  var dica=!doc?'Digite só os números.':(ok?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
  var n=el('docDica'); if(n){ n.textContent=dica; n.style.color=(doc&&ok)?'#1b7a4b':'#5a5f78'; }
}
function patchEnviar(){
  // recalcula apenas o href/estado do botão enviar e a estimativa, se a sacola estiver aberta
  if(!state.sacola) return;
  var c=ctx();
  var link=document.querySelector('[data-act="registrar"]');
  if(link) link.setAttribute('href', mensagemWa(c));
}

/* ---------- envio do pedido direto para a loja (ponte na nuvem) ---------- */
function enviarLoja(){
  var c=ctx(), loja=c.loja, itens=state.carrinhos[loja.id]||[];
  if(!itens.length||state.enviando) return;
  var doc=soNum(state.doc), querNf=state.nf==='sim', entrega=state.entrega!=='Retirar na loja';
  var corpo={
    loja:loja.id, hp:(el('hpCampo')||{}).value||'',
    cliente:{nome:state.nome.trim(), telefone:state.fone, doc:querNf?doc:'', razao:querNf?state.razao.trim():''},
    nf:querNf, entrega:{tipo:state.entrega, endereco:entrega?state.endereco.trim():''}, obs:state.obs.trim(),
    itens:itens.map(function(x){ return {chave:x.chavePreco, nome:x.nome, marca:x.marca, r:x.r, g:x.g, un:x.un, fechado:x.fechado, n:x.n, preco:precoOpcao({nome:x.nome,marca:x.marca},{r:x.r,g:x.g||null})}; }),
    mensagem:decodeURIComponent((mensagemWa(c).split('?text=')[1])||'')
  };
  state.enviando=true; state.erroEnvio=''; renderOverlay();
  fetch('/api/pedido',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(corpo)})
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }, function(){ return {ok:false, j:null}; }); })
    .then(function(x){
      state.enviando=false;
      if(x.ok&&x.j&&x.j.codigo){
        var h={data:Date.now(), loja:loja.id, codigo:x.j.codigo, itens:itens.map(function(i){return Object.assign({},i);})};
        state.historico=[h].concat(state.historico||[]).slice(0,20);
        state.carrinhos[loja.id]=[]; state.obs='';
        state.enviado={codigo:x.j.codigo, loja:loja.id};
        state.statusPed[x.j.codigo]={rotulo:'Recebido, aguardando a loja'};
        guardarConta(); renderAll();
      } else {
        state.erroEnvio=(x.j&&x.j.mensagem)||'Não consegui enviar agora. Envie pelo WhatsApp abaixo.';
        renderOverlay();
      }
    })
    .catch(function(){ state.enviando=false; state.erroEnvio='Sem conexão com a loja agora. Envie pelo WhatsApp abaixo.'; renderOverlay(); });
}
function verStatus(cod,loja){
  if(!cod) return;
  fetch('/api/status?loja='+encodeURIComponent(loja||state.loja)+'&codigo='+encodeURIComponent(cod),{cache:'no-store'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(j){ state.statusPed[cod]=j&&j.rotulo?{rotulo:j.rotulo, numero:j.numero}:{rotulo:'Situação indisponível no momento'}; renderOverlay(); })
    .catch(function(){ state.statusPed[cod]={rotulo:'Sem conexão para ver a situação'}; renderOverlay(); });
}

/* ---------- carregamento de preços ----------
   Primeiro os preços que a loja publicou pelo Balcão (/api/catalogo);
   se ainda não houver publicação, usa o precos.json de exemplo. */
function pegarJson(u){ return fetch(u,{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}); }
function carregarPrecos(){
  var loja=state.loja;
  pegarJson('/api/catalogo?loja='+loja).then(function(j){
    if(j&&j.itens&&!j.vazio&&Object.keys(j.itens).length) return j;
    return pegarJson('precos.json');
  }).then(function(j){
    if(!(j&&j.itens)) return;
    PRECOS_CACHE[loja]=j;
    if(state.loja!==loja) return;
    PRECOS=j; renderCatalogo(); renderCorpo(); if(state.sacola||state.conta) renderOverlay();
  });
}

/* ---------- init ---------- */
function init(){
  carregar();
  var app=el('app');
  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  renderAll();
  carregarPrecos();
  // relógio para "aberto agora"
  relogio=setInterval(function(){ state.agora=Date.now(); renderAll(); }, 60000);
  // carrossel automático
  var reduz=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduz) slideTimer=setInterval(function(){ state.slide=(state.slide+1)%3; renderHero(); }, 7000);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
