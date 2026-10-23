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
  sel:{}, tipo:{}, agora:Date.now(),
  enviando:false, enviado:null, erroEnvio:'', statusPed:{},
  pag:'pix',
  limite:24, folha:null, mob:false
};
var POR_PAGINA=24;
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
  // seg. a sex. até 16h; sábado até 13h (as duas lojas); no sábado a D’Lu abre às 7h (abreSab)
  var util=dia>=1&&dia<=6, fecha=dia===6?780:960;
  var abreSab=l.abreSab!=null?l.abreSab:l.abre, abreSabTxt=l.abreSabTxt||l.abreTxt;
  var abreHoje=dia===6?abreSab:l.abre;
  if(util&&minuto>=abreHoje&&minuto<fecha){
    var falta=fecha-minuto;
    return {aberto:true, curto:falta<=60?('Fecha em '+falta+' min'):('Aberto até '+(dia===6?'13h':'16h')), texto:falta<=60?('Aberto · fecha em '+falta+' min'):('Aberto agora · fecha às '+(dia===6?'13h':'16h')), cor:'#4cc27f', fundo:'#e3f5ea', tinta:'#146b3f'};
  }
  var quando='amanhã', hora=l.abreTxt;
  if(util&&minuto<abreHoje){ quando='hoje'; if(dia===6) hora=abreSabTxt; }
  else if(dia===6) quando='segunda';
  else if(dia===5) hora=abreSabTxt; // sexta depois das 16h: abre sábado
  return {aberto:false, curto:'Abre '+(quando==='hoje'?'às ':(quando==='amanhã'?'amanhã ':'seg. '))+hora, texto:'Fechado · abre '+quando+' às '+hora, cor:'#f26b5b', fundo:'#fde6e2', tinta:'#9b2a1c'};
}

/* ---------- preços ---------- */
function slug(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function chavePreco(p){ return slug(p.nome)+(p.marca?('|'+slug(p.marca)):''); }
function precoDe(p){ return PRECOS&&PRECOS.itens?PRECOS.itens[chavePreco(p)]:null; }
function emFalta(p){ return !!(PRECOS&&PRECOS.indisponivel&&PRECOS.indisponivel.indexOf(chavePreco(p))>=0); }
function brl(cent){ return 'R$ '+(cent/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
/* regras publicadas pelo Balcão (atacado e desconto por forma de pagamento) */
function regraAtacado(){ var a=PRECOS&&PRECOS.atacado; return a&&a.ativo!==false&&!PRECOS._exemplo?a:null; }
function regraDesconto(){
  var d=PRECOS&&PRECOS.desconto;
  if(!d) d={ativo:true,pct:5,min:10000,formas:['pix','dinheiro']}; // padrão da loja até o Balcão publicar
  return d.ativo&&d.pct>0?d:null;
}
/* preço unitário (centavos) de uma opção, já com atacado quando a quantidade alcança o mínimo.
   n = quantas vezes a opção vai na sacola. Retorna {c, at} ou null. */
function precoUnit(p,op,n){
  var pr=precoDe(p); if(!pr) return null; var a=regraAtacado(); n=n||1;
  if(op.g!=null && pr.kg!=null){
    var at=!!(a&&pr.kgAt&&(op.fechado||op.g*n>=a.minKg*1000));
    return {c:Math.round((at?pr.kgAt:pr.kg)*op.g/1000), at:at};             // granel: por grama
  }
  if(pr.op && pr.op[op.r]!=null){
    var at2=!!(a&&pr.opAt&&pr.opAt[op.r]!=null&&n>=a.minUn);
    return {c:at2?pr.opAt[op.r]:pr.op[op.r], at:at2};                       // embalado/unidade: por opção
  }
  return null;
}
function precoOpcao(p,op,n){ var x=precoUnit(p,op,n); return x?x.c:null; }
function fmtKg(kg){ return String(+(+kg).toFixed(3)).replace('.',',')+' kg'; }

/* ---------- opções de quantidade / ardência de cada produto ---------- */
function extras(p,loja){
  var pr=precoDe(p), seloKg=/(\d+)\s*kg/i.exec(p.selo||'');
  var fardoKg = pr&&pr.fardo!=null ? pr.fardo : (seloKg?+seloKg[1]:loja.fardoKg);
  var fardo = fardoKg>0 ? {r:'Fardo',g:fardoKg*1000,fechado:'fardo fechado'} : null;
  var opcoes;
  if(p.nome==='Alho roxo nacional') opcoes=[{r:'Caixa 10 kg',un:'caixa de 10 kg'}];
  else if(p.nome==='Alho descascado') opcoes=[{r:'Pacote 1 kg',un:'pacote de 1 kg'}];
  else if(p.emb) opcoes=(p.tamanhos||['Unidade']).map(function(t,i){return {r:t,un:'un',liq:p.liquido?p.liquido[i]:''};});
  else { opcoes=[{r:'250 g',g:250},{r:'500 g',g:500},{r:'1 kg',g:1000}]; if(fardo) opcoes.push(fardo); }
  var ard = typeof p.ard==='number'?p.ard:null;
  var nomes=['Sem ardência','Suave','Média','Média-forte','Muito forte','Extrema'];
  var cores=['#3f7a3a','#3f7a3a','#b7791f','#c2410c','var(--c-acento)','#7a1010'];
  return {
    opcoes:opcoes, rotuloOpcoes:p.rotulo||(p.emb?(p.liquido?'Peso drenado':'Tamanho'):'Quantidade'),
    temArd:ard!==null, ardTxt:ard!==null?(p.ardRotulo||nomes[ard]):'',
    ardCor:ard!==null?cores[ard]:'var(--c-escuro)',
    pimentas:ard!==null?[0,1,2,3,4].map(function(i){return i<ard?'#d6261a':'var(--c-borda2)';}):[]
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
        seloBg:p.marca?'var(--c-escuro)':(p.cat==='Misturas da casa'&&!p.selo?'var(--c-acento)':'var(--c-destaque)'),
        seloCor:(p.marca||(p.cat==='Misturas da casa'&&!p.selo))?'#ffffff':'var(--c-escuro)',
        opcoes:ex.opcoes, rotuloOpcoes:ex.rotuloOpcoes, temArd:ex.temArd, ardTxt:ex.ardTxt, ardCor:ex.ardCor, pimentas:ex.pimentas,
        chave:chavePreco(p),
        wa:wa('Olá, '+loja.nome+'! Quero pedir:\n'+(emb
          ? (p.nome+(p.marca?' '+p.marca:'')+(p.tamanhos?' ('+p.tamanhos.join(' / ')+')':'')+' – tamanho: ___ · quantidade: ___')
          : (p.nome+' – ___ '+(p.unidade||'g'))))
      });
    });
}

/* ---------- grupos: entradas com o mesmo "grupo" viram um cartão só, com escolha de Tipo ----------
   Cada entrada continua sendo um produto próprio (chave, preço e falta próprios). */
function agrupar(todos){
  var vistos={}, out=[];
  todos.forEach(function(p){
    if(!p.grupo){ out.push(p); return; }
    if(vistos[p.grupo]) return;
    vistos[p.grupo]=1;
    var membros=todos.filter(function(x){return x.grupo===p.grupo;});
    var info=membros.map(function(m){return {tipo:m.tipo||m.nome, chave:m.chave, falta:emFalta(m)};});
    var ia=state.tipo[p.grupo];
    if(ia==null||!membros[ia]){ ia=info.findIndex(function(x){return !x.falta;}); if(ia<0) ia=0; }
    var busca=membros.map(function(m){return m.nome+' '+(m.tipo||'')+' '+(m.marca||'');}).join(' ')+' '+p.grupo;
    out.push(Object.assign({},membros[ia],{titulo:p.grupo, grupoInfo:{nome:p.grupo, membros:info, ativo:ia}, textoBusca:busca}));
  });
  return out;
}

/* ---------- HTML helpers ---------- */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function at(s){ return esc(s).replace(/'/g,'&#39;'); }

/* ---------- cartão de produto ---------- */
function selDe(p){ return Math.min(state.sel[p.chave]||0, Math.max(p.opcoes.length-1,0)); }
/* foto (ou desenho) + selo do produto; usada no cartão completo, no cartão compacto e na folha */
function midiaDe(p){
  var sel=selDe(p);
  var opEsc=p.opcoes[sel]||{}, fotoTam=p.fotosTam&&p.fotosTam[state.loja]?p.fotosTam[state.loja][opEsc.r]:'';
  var midia='';
  if(fotoTam) midia='<img class="midia-img foto-tam" src="'+at(fotoTam)+'" alt="'+at(p.nome+' '+(p.marca||'')+' '+opEsc.r+(opEsc.liq?' drenado (pote de '+opEsc.liq+')':''))+'" loading="lazy" style="position:absolute;left:0;right:0;top:6%;bottom:5%;margin:auto;max-width:84%;max-height:89%;width:auto;height:auto;object-fit:contain;display:block;filter:drop-shadow(0 14px 14px rgba(29,34,64,.28))">';
  else if(p.temFoto) midia='<img class="midia-img" src="'+at(p.foto)+'" alt="'+at(p.nome)+' a granel" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">';
  else if(p.temRecorte) midia='<img class="midia-img" src="'+at(p.foto)+'" alt="'+at(p.nome)+'" loading="lazy" style="position:absolute;left:0;right:0;top:7%;bottom:5%;margin:auto;max-width:84%;max-height:88%;width:auto;height:auto;object-fit:contain;display:block;filter:drop-shadow(0 14px 14px rgba(29,34,64,.28))">';
  else if(p.temGrao) midia='<div class="midia-img" aria-hidden="true" style="position:relative;width:70%;height:62%;display:flex;align-items:flex-end;justify-content:center">'
      +'<div style="position:absolute;bottom:4%;width:92%;height:18%;border-radius:50%;background:'+p.sombra+';opacity:.22;filter:blur(6px)"></div>'
      +'<div style="position:relative;width:100%;height:88%;border-radius:50% 50% 46% 46% / 72% 72% 28% 28%;background:'+p.graoBg+';box-shadow:inset 0 -10px 14px rgba(0,0,0,.18),inset 0 8px 12px rgba(255,255,255,.18)"></div></div>';
  else if(p.temPote) midia='<div class="midia-img" aria-hidden="true" style="position:relative;height:80%;aspect-ratio:.78;display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:74%;height:14%;border-radius:8px 8px 4px 4px;background:'+p.tampa+';box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),inset 0 3px 0 rgba(255,255,255,.18)"></div>'
      +'<div style="position:relative;width:100%;flex:1;margin-top:3%;border-radius:14px 14px 22px 22px;background:'+p.graoBg+';box-shadow:inset 10px 0 14px rgba(255,255,255,.25),inset -8px 0 12px rgba(0,0,0,.2),0 16px 22px -12px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">'
      +'<div style="width:84%;padding:9px 6px;background:var(--c-fundo3);border-radius:6px;text-align:center;display:flex;flex-direction:column;gap:2px;box-shadow:0 2px 4px rgba(0,0,0,.15)"><span style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--c-acento)">'+esc(p.rotulo)+'</span><span style="font-family:\'Archivo\',\'Arial Narrow\',sans-serif;font-stretch:72%;font-weight:900;font-size:15px;line-height:1;text-transform:uppercase;color:var(--c-escuro)">'+esc(p.curto)+'</span></div></div></div>';
  else if(p.temGarrafa) midia='<div class="midia-img" aria-hidden="true" style="position:relative;height:86%;aspect-ratio:.42;display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:34%;height:9%;border-radius:5px 5px 2px 2px;background:var(--c-escuro)"></div>'
      +'<div style="width:26%;height:14%;background:'+p.brilho+';opacity:.92"></div>'
      +'<div style="width:100%;height:9%;border-radius:40% 40% 0 0 / 100% 100% 0 0;background:'+p.brilho+'"></div>'
      +'<div style="position:relative;width:100%;flex:1;border-radius:0 0 14px 14px;background:'+p.brilho+';box-shadow:0 16px 22px -12px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">'
      +'<div style="width:92%;padding:9px 4px;background:var(--c-fundo3);border-radius:4px;text-align:center;display:flex;flex-direction:column;gap:2px;box-shadow:0 2px 4px rgba(0,0,0,.15)"><span style="font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c-acento)">'+esc(p.rotulo)+'</span><span style="font-family:\'Archivo\',\'Arial Narrow\',sans-serif;font-stretch:68%;font-weight:900;font-size:13px;line-height:1;text-transform:uppercase;color:var(--c-escuro)">'+esc(p.curto)+'</span></div></div></div>';

  var selo = p.temSelo?('<span class="selo-card" style="position:absolute;z-index:1;left:12px;top:12px;background:'+p.seloBg+';color:'+p.seloCor+';font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:5px 10px;border-radius:999px;transform:rotate(-3deg);box-shadow:0 4px 10px -4px rgba(0,0,0,.35)">'+esc(p.selo)+'</span>'):'';
  return {midia:midia, selo:selo};
}
function cartaoHTML(p,o){
  o=o||{};
  var sel=selDe(p), opEsc=p.opcoes[sel]||{}, md=midiaDe(p), midia=md.midia, selo=md.selo;

  var ard = p.temArd?('<div style="display:flex;align-items:center;gap:8px"><span style="display:flex;gap:1px" aria-hidden="true">'
      +p.pimentas.map(function(c){return '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M14 3c0 2 1 3 3 3-1 1-1.5 2-1.5 3.5C15.5 15 11 21 5 21c-1 0-1.5-.6-1-1.2C7 16 8 12 10 9.5 11 8 12.5 7.6 14 8c0-1.6-.6-3-2-4z" fill="'+c+'"></path></svg>';}).join('')
      +'</span><span style="font-size:12px;font-weight:800;color:'+p.ardCor+';text-transform:uppercase;letter-spacing:.06em">'+esc(p.ardTxt)+'</span></div>'):'';

  var tiposHTML='';
  if(p.grupoInfo){
    tiposHTML='<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:11px;font-weight:800;color:var(--c-mudo);text-transform:uppercase;letter-spacing:.1em">Tipo</span><div style="display:flex;flex-wrap:wrap;gap:6px" role="group" aria-label="Tipo">'
      +p.grupoInfo.membros.map(function(m,i){
        var on=i===p.grupoInfo.ativo;
        return '<button type="button" class="chip-tipo'+(m.falta?' chip-falta':'')+'" data-act="tipo" data-grupo="'+at(p.grupoInfo.nome)+'" data-ti="'+i+'" aria-pressed="'+on+'"'+(m.falta?' title="Em falta no momento"':'')+' style="font:inherit;font-size:13px;font-weight:800;padding:6px 11px;min-height:34px;border-radius:999px;cursor:pointer;border:1.5px solid '+(on?'var(--c-acento)':'var(--c-borda2)')+';background:'+(on?'var(--c-acento)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+'">'+esc(m.tipo)+(m.falta?' <small>(em falta)</small>':'')+'</button>';
      }).join('')+'</div></div>';
  }
  var opc = p.opcoes.map(function(o,i){
    var on=i===sel;
    return '<button type="button" data-act="opt" data-key="'+at(p.chave)+'" data-oi="'+i+'" aria-pressed="'+on+'" style="font:inherit;font-size:13px;font-weight:800;padding:6px 11px;min-height:34px;border-radius:999px;cursor:pointer;border:1.5px solid '+(on?'var(--c-escuro)':'var(--c-borda2)')+';background:'+(on?'var(--c-escuro)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+'">'+esc(o.r)+'</button>';
  }).join('');

  // preço
  var precoHTML='';
  var falta=emFalta(p);
  var pr=precoDe(p);
  var cent=precoOpcao(p,p.opcoes[sel]);
  if(falta){
    precoHTML='<span class="preco-consulta" style="color:var(--c-acento-esc)">Em falta no momento</span>';
  } else if(cent!=null){
    var extra='', ra=regraAtacado(), opSel=p.opcoes[sel], uSel=precoUnit(p,opSel,1);
    if(pr&&pr.kg!=null) extra='<span class="preco-kg">'+brl(uSel&&uSel.at?pr.kgAt:pr.kg)+' / kg</span>';
    var tagAt=uSel&&uSel.at?'<span class="tag-atac">Preço de atacado</span>':'';
    var linhaAt='';
    if(ra&&pr){
      if(pr.kgAt&&!(uSel&&uSel.at)) linhaAt='<span class="linha-atac">Atacado: <b>'+brl(pr.kgAt)+' / kg</b> a partir de '+fmtKg(ra.minKg)+'</span>';
      else if(pr.opAt&&opSel&&pr.opAt[opSel.r]!=null) linhaAt='<span class="linha-atac">Atacado: <b>'+brl(pr.opAt[opSel.r])+' cada</b> a partir de '+ra.minUn+' un.</span>';
    }
    if(opSel&&opSel.fechado) linhaAt='<span class="linha-atac">Fardo fechado de <b style="color:var(--c-escuro)">'+fmtKg(opSel.g/1000)+'</b></span>'+linhaAt;
    precoHTML='<div style="display:flex;flex-direction:column;gap:3px"><div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="preco preco-sel">'+brl(cent)+'</span>'+extra+tagAt+'</div>'+linhaAt+'</div>';
  } else {
    precoHTML='<span class="preco-consulta">Preço sob consulta</span>';
  }

  return '<article class="card'+(o.folha?' card-folha':'')+'" style="height:100%;background:#fff;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 0 1px var(--c-borda)">'
    +'<div style="position:relative;aspect-ratio:4/3;max-width:100%;background:'+p.fundo+';overflow:hidden;display:flex;align-items:center;justify-content:center">'+midia+selo+'</div>'
    +'<div style="padding:16px 18px 18px;display:flex;flex-direction:column;gap:8px;flex:1">'
      +'<span style="font-size:11px;font-weight:800;color:var(--c-acento);text-transform:uppercase;letter-spacing:.12em">'+esc(p.cat)+'</span>'
      +'<h3'+(o.folha?' id="folhaTitulo"':'')+' class="nome-prod">'+esc(p.titulo||p.nome)+'</h3>'
      +'<p style="margin:0;font-size:14px;color:var(--c-mudo);flex:1">'+esc(p.uso)+'</p>'
      +ard
      +tiposHTML
      +'<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:11px;font-weight:800;color:var(--c-mudo);text-transform:uppercase;letter-spacing:.1em">'+esc(p.rotuloOpcoes)+'</span><div style="display:flex;flex-wrap:wrap;gap:6px" role="group" aria-label="'+at(p.rotuloOpcoes)+'">'+opc+'</div>'+(opEsc.liq?'<span class="peso-liq">Peso drenado (só a pimenta, sem o líquido). Pote de '+esc(opEsc.liq).replace(/ /g,'\u00a0')+' no rótulo.</span>':'')+'</div>'
      +precoHTML
      +'<div style="display:flex;gap:8px;margin-top:4px">'
        +'<button type="button" data-act="add" data-key="'+at(p.chave)+'"'+(falta?' disabled aria-disabled="true"':'')+' style="flex:1;font:inherit;cursor:'+(falta?'not-allowed':'pointer')+';opacity:'+(falta?'.45':'1')+';border:none;background:var(--c-escuro);color:#fff;font-weight:800;font-size:14px;padding:12px;border-radius:999px;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg><span class="add-txt">Adicionar</span></button>'
        +'<a class="btn-wa" href="'+at(p.wa)+'" target="_blank" rel="noopener" aria-label="Pedir só '+at(p.nome)+' pelo WhatsApp" title="Pedir só este produto" style="flex:none;width:46px;height:46px;border-radius:50%;background:#1b7a4b;color:#fff;display:flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></a>'
      +'</div>'
    +'</div></article>';
}

/* ---------- cartão compacto (celular): foto, marca, nome, preço e "+"; o resto fica na folha ---------- */
function compactoHTML(p){
  var md=midiaDe(p), falta=emFalta(p);
  var precos=p.opcoes.map(function(o){return precoOpcao(p,o);}).filter(function(x){return x!=null;});
  var min=precos.length?Math.min.apply(null,precos):null;
  var precoTxt;
  if(falta) precoTxt='<span class="mini-preco mini-falta">Em falta</span>';
  else if(min==null) precoTxt='<span class="mini-preco mini-consulta">Preço sob consulta</span>';
  else if(p.opcoes.length>1||p.grupoInfo) precoTxt='<span class="mini-preco"><small>a partir de</small> '+brl(min)+'</span>';
  else precoTxt='<span class="mini-preco">'+brl(min)+' <small>· '+esc((p.opcoes[0]||{}).r||'')+'</small></span>';
  var marca=p.marca?('<span class="mini-marca">'+esc(p.marca)+'</span>'):(p.grupoInfo?('<span class="mini-marca">'+p.grupoInfo.membros.length+' tipos</span>'):'');
  var g=p.grupoInfo?(' data-grupo="'+at(p.grupoInfo.nome)+'"'):'';
  return '<article class="card card-mini">'
    +'<button type="button" class="mini-abrir" data-act="abrirFolha" data-key="'+at(p.chave)+'"'+g+' aria-haspopup="dialog" aria-label="'+at((p.titulo||p.nome)+(p.marca?' '+p.marca:'')+': escolher quantidade')+'">'
      +'<span class="mini-midia" style="background:'+p.fundo+'">'+md.midia
        +'<span class="mini-mais" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg></span></span>'
      +'<span class="mini-txt">'+marca+'<span class="mini-nome">'+esc(p.titulo||p.nome)+'</span>'+precoTxt+'</span>'
    +'</button></article>';
}
function cardFor(p){ return state.mob?compactoHTML(p):cartaoHTML(p); }
/* produto mostrado na folha: segue o grupo (trocar o Tipo troca o produto) */
function produtoDaFolha(c){
  var f=state.folha; if(!f) return null;
  if(f.grupo) return c.produtos.find(function(p){return p.grupoInfo&&p.grupoInfo.nome===f.grupo;})||null;
  return c.produtos.find(function(p){return p.chave===f.chave;})||c.todos.find(function(p){return p.chave===f.chave;})||null;
}
function folhaHTML(c){
  var p=produtoDaFolha(c); if(!p) return '';
  return '<div class="folha-camada">'
    +'<button type="button" class="folha-fundo" data-act="fecharFolha" aria-label="Fechar" tabindex="-1"></button>'
    +'<div class="folha" role="dialog" aria-modal="true" aria-labelledby="folhaTitulo">'
      +'<div class="folha-pega" aria-hidden="true"><span></span></div>'
      +'<button type="button" class="folha-x" data-act="fecharFolha" aria-label="Fechar"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
      +'<div class="folha-rolar">'+cartaoHTML(p,{folha:true})+'</div>'
    +'</div></div>';
}

/* ================= REGIÕES ================= */
function ctx(){
  var loja=LOJAS[state.loja]||LOJAS.dlu;
  var todos=montarProdutos(loja);
  var produtos=agrupar(todos);
  var ordem=['Alho','Misturas da casa','Pimentas e pápricas','Especiarias','Ervas','Chás','Desidratados','Grãos e sementes','Pimentas em conserva','Molhos','Mel, dendê e manteiga','Diversos'];
  var cats=ordem.filter(function(c){return produtos.some(function(p){return p.cat===c;});});
  var sel=(state.cat==='Todos'||cats.indexOf(state.cat)>=0)?state.cat:'Todos';
  function norm(s){return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
  var q=norm(state.busca.trim());
  var lista=sel==='Todos'?produtos:produtos.filter(function(p){return p.cat===sel;});
  if(q) lista=lista.filter(function(p){return norm((p.textoBusca||p.nome)+' '+p.cat+' '+(p.marca||'')).indexOf(q)>=0;});
  var visivel=q?lista:lista.slice(0,Math.max(state.limite||POR_PAGINA,POR_PAGINA));
  return {loja:loja, produtos:produtos, todos:todos, cats:cats, sel:sel, q:q, lista:lista, visivel:visivel, sit:situacao(loja)};
}
function waGeralDe(loja){ return 'https://wa.me/'+loja.waNum+'?text='+encodeURIComponent('Olá, '+loja.nome+'! Gostaria de fazer um pedido:\n'); }

/* logo de cada loja (a VKS tem a placa verde) */
var LOGO={dlu:'imagens/logo-dlu.png', vks:'imagens/logo-vks.webp'};
var ICONE_PADRAO=null;
function aplicarTemaLoja(id){
  document.documentElement.setAttribute('data-loja', id);
  var ic=document.querySelector('link[rel=icon]'); if(!ic) return;
  if(ICONE_PADRAO===null) ICONE_PADRAO=ic.getAttribute('href');
  ic.setAttribute('href', id==='vks' ? LOGO.vks : ICONE_PADRAO);
}
function fillTopo(c){
  var loja=c.loja, sit=c.sit;
  var abasLoja=Object.keys(LOJAS).map(function(id){
    var l=LOJAS[id], on=id===loja.id;
    return '<button type="button" class="loja-pill" data-act="loja" data-loja="'+id+'" aria-pressed="'+on+'" style="border-color:'+(on?'var(--c-destaque)':'var(--c-linha-esc)')+';background:'+(on?'var(--c-destaque)':'transparent')+';color:'+(on?'var(--c-escuro)':'var(--c-texto-esc)')+'">'+esc(l.nome)+'</button>';
  }).join('');
  var qtd=(state.carrinhos[loja.id]||[]).length;
  var nome=state.nome.trim().split(' ')[0];
  var logo = '<img class="logo-img" src="'+LOGO[loja.id]+'" alt="'+at(loja.nome)+'" style="height:58px;width:auto;display:block">';
  return ''
  +'<div class="topo-barra" style="background:var(--c-escuro);color:var(--c-texto-esc);font-size:13px"><div class="wrap barra-lojas">'
    +'<div class="barra-esq" role="group" aria-label="Escolha a loja"><span class="hide-sm lbl-lojas" style="margin-right:2px">Duas lojas vizinhas no Brás, cada uma com seu catálogo:</span>'+abasLoja+'</div>'
    +'<span class="barra-status" title="'+at(sit.texto+' · '+loja.horarioCurto)+'"><span class="ponto-vivo" aria-hidden="true" style="width:8px;height:8px;flex:none;border-radius:50%;background:'+sit.cor+'"></span><span class="hide-sm">'+esc(sit.texto)+'</span><span class="so-sm">'+esc(sit.curto)+'</span><span class="hide-sm st-hor" style="font-weight:600;color:var(--c-mudo-esc)">· '+esc(loja.horarioCurto)+'</span></span>'
  +'</div></div>'
  +'<header style="background:#fff;border-bottom:1px solid var(--c-borda)"><div class="wrap head-row head-pad" style="padding-top:12px;padding-bottom:12px">'
    +'<a href="#inicio" style="text-decoration:none;display:flex;align-items:center">'+logo+'</a>'
    +'<div class="head-search" style="position:relative"><label for="busca" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Buscar tempero</label>'
      +'<input id="busca" class="search" type="search" value="'+at(state.busca)+'" data-act="busca" placeholder="O que vai temperar hoje? Páprica, cominho, Ana Maria…" style="width:100%;font:inherit;font-size:16px;padding:13px 52px 13px 20px;border-radius:999px;border:2px solid var(--c-borda);background:var(--c-fundo);color:var(--c-escuro)">'
      +'<span aria-hidden="true" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:var(--c-escuro2);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg></span></div>'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<button type="button" data-act="abrirConta" aria-label="Minha conta" style="font:inherit;cursor:pointer;height:48px;padding:0 14px 0 8px;border-radius:999px;border:2px solid var(--c-borda);background:#fff;color:var(--c-escuro);display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px"><span aria-hidden="true" style="width:32px;height:32px;border-radius:50%;background:var(--c-fundo);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg></span><span class="hide-sm">'+(nome?('Olá, '+esc(nome)):'Minha conta')+'</span></button>'
      +'<button type="button" data-act="abrirSacola" aria-label="Abrir meu pedido" style="position:relative;font:inherit;cursor:pointer;width:48px;height:48px;border-radius:50%;border:2px solid var(--c-borda);background:#fff;color:var(--c-escuro);display:flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg>'+(qtd>0?('<span style="position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--c-acento);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+qtd+'</span>'):'')+'</button>'
      +'<a class="btn-wa hide-sm" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:700;font-size:15px;padding:9px 16px 9px 12px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center;gap:10px;line-height:1.15"><span aria-hidden="true" style="width:32px;height:32px;border-radius:50%;background:#2a9a62;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></span><span style="display:flex;flex-direction:column"><span style="font-size:12px;font-weight:600">Peça pelo WhatsApp</span><span style="font-variant-numeric:tabular-nums;font-weight:800">'+esc(loja.fone)+'</span></span></a>'
    +'</div>'
  +'</div></header>'
  +'<nav aria-label="Categorias" style="background:var(--c-escuro2)"><div class="wrap catnav" id="catnav" style="padding-top:6px;padding-bottom:6px">'+navCatsHTML(c)+'</div></nav>';
}
function navCatsHTML(c){
  return ['Todos'].concat(c.cats).map(function(cat){
    var on=cat===c.sel&&!c.q;
    return '<a class="navlink" href="#produtos" data-act="cat" data-cat="'+at(cat)+'" aria-current="'+on+'" style="text-decoration:none;white-space:nowrap;color:'+(on?'#ffffff':'#ffffff')+';background:'+(on?'var(--c-destaque)':'transparent')+';color:'+(on?'var(--c-escuro)':'#ffffff')+';font-weight:700;font-size:14px;letter-spacing:.01em;padding:9px 14px;border-radius:999px;min-height:40px;display:inline-flex;align-items:center">'+esc(cat)+'</a>';
  }).join('');
}

function fillHero(c){
  var loja=c.loja, sit=c.sit;
  var slides = loja.id==='vks' ? [
    {selo:'VKS Condimentos',titulo:'Alho roxo nacional',destaque:'em caixa de 10 kg',texto:'Para restaurantes, açougues e revenda. Entrega somente por Lalamove, Uber ou retirada na Avenida Mercúrio, 330.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Varejo e atacado',titulo:'Temperos a granel',destaque:'no Brás',texto:'Fardos fechados ou a quantidade que você precisar, pesada na hora.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Aberto às 6h',titulo:'Seg. a sex. das 6h às 16h,',destaque:'sábado até 13h',texto:'Avenida Mercúrio, 330 – Brás. Pertinho da D’Lu Empório.',botao:'Como chegar',link:'#visite'}
  ] : [
    {selo:'Varejo e atacado',titulo:'Temperos a granel',destaque:'do jeito que você precisa',texto:'De 250 g ao fardo fechado. Temperos, ervas e misturas da casa, pesados na hora.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Misturas da casa',titulo:'Ana Maria, Edu Guedes,',destaque:'Gaúcho e muito mais',texto:'As misturas que os clientes mais pedem, prontas para temperar.',botao:'Ver produtos',link:'#produtos'},
    {selo:'Para o seu negócio',titulo:'Atacado em',destaque:'fardo fechado',texto:'Ou a quantidade que você precisar, pesada na hora. Mande a lista no WhatsApp que a gente separa.',botao:'Ver produtos',link:'#produtos'}
  ];
  var si=state.slide%slides.length;
  var s=slides[si];
  var comF=c.produtos.filter(function(p){return p.foto&&!p.recorte;});
  var tigelaCores=loja.id==='vks'?['#8a4a6b','var(--c-destaque-bg2)','#c4241b']:['#b5651d','#5e7a35','#c4402a'];
  var pos=[{w:'64%',t:'20%',l:'34%'},{w:'40%',t:'56%',l:'2%'},{w:'34%',t:'4%',l:'6%'}];
  var tig=pos.map(function(ps,i){
    var f=comF.length?comF[(i+si*3)%comF.length]:null;
    var inner=f?('<img src="'+at(f.foto)+'" alt="'+at(f.nome)+'">'):('<div aria-hidden="true" style="width:100%;height:100%;background:'+grao(tigelaCores[i])+'"></div>');
    return '<div class="bowl" style="width:'+ps.w+';height:'+ps.w+';top:'+ps.t+';left:'+ps.l+';animation-duration:'+['6.5s','5.2s','7.4s'][i]+';animation-delay:'+['-1s','-3s','-2s'][i]+'"><div class="bowl-in" style="animation-name:'+(si%2?'popB':'popA')+';animation-delay:'+(0.25+i*0.15)+'s">'+inner+'</div></div>';
  }).join('');
  var pontos=slides.map(function(_,i){var on=i===si;return '<button type="button" data-act="slide" data-i="'+i+'" aria-label="Ir para o destaque '+(i+1)+'" aria-current="'+on+'" style="width:'+(on?'28px':'10px')+';height:10px;border-radius:999px;border:none;background:'+(on?'var(--c-destaque)':'var(--c-linha-esc)')+';cursor:pointer;padding:0"></button>';}).join('');
  return '<section id="inicio" aria-roledescription="carrossel" aria-label="Destaques" style="background:radial-gradient(1200px 500px at 85% 20%, var(--c-escuro3) 0%, var(--c-escuro) 60%);color:#fff;position:relative;overflow:hidden">'
    +'<svg class="gira" aria-hidden="true" viewBox="0 0 400 400" style="position:absolute;right:-120px;bottom:-160px;width:620px;height:620px;opacity:.18"><circle cx="200" cy="200" r="190" fill="none" style="stroke:var(--c-destaque)" stroke-width="2" stroke-dasharray="2 10"></circle><circle cx="200" cy="200" r="140" fill="none" style="stroke:var(--c-destaque)" stroke-width="2" stroke-dasharray="2 10"></circle></svg>'
    +'<div class="wrap hero">'
      +'<div style="display:flex;flex-direction:column;gap:20px">'
        +'<div class="entra d1" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px"><span class="eyebrow" style="color:var(--c-destaque)">'+esc(s.selo)+'</span></div>'
        +'<h1 class="disp caps hero-h1 entra d2">'+esc(s.titulo)+' <span style="color:var(--c-destaque)">'+esc(s.destaque)+'</span></h1>'
        +'<p class="entra d3 hero-p">'+esc(s.texto)+'</p>'
        +'<div class="entra d4 hero-btns"><a class="btn-y" href="'+at(s.link)+'" style="text-decoration:none;background:var(--c-destaque);color:var(--c-escuro);font-weight:800;font-size:15px;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center;gap:10px">'+esc(s.botao)+' <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a><a class="btn-ghost" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="text-decoration:none;border:2px solid #fff;color:#fff;font-weight:800;font-size:15px;padding:14px 26px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center">Pedir no WhatsApp</a></div>'
        +'<div class="entra d5 hero-nav"><button type="button" data-act="slidePrev" aria-label="Destaque anterior" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--c-linha-esc);background:transparent;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"></path></svg></button>'+pontos+'<button type="button" data-act="slideNext" aria-label="Próximo destaque" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--c-linha-esc);background:transparent;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"></path></svg></button></div>'
      +'</div>'
      +'<div class="bowls">'+tig+'<span class="selo-250" style="position:absolute;right:2%;top:4%;width:112px;height:112px;border-radius:50%;background:var(--c-destaque);color:var(--c-escuro);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:rotate(12deg);box-shadow:0 14px 28px -12px rgba(0,0,0,.5);line-height:1"><span class="disp" style="font-weight:900;font-size:30px">250 g</span><span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding-top:4px">pesado<br>na hora</span></span></div>'
    +'</div></section>';
}

/* destaques: mesmos cartões do catálogo; a ordem fica presa ao produto (ou ao grupo), para trocar o tipo não embaralhar */
function destaquesDe(c){
  function comFoto(p){ var m=p.grupoInfo?c.todos.filter(function(x){return x.grupo===p.grupoInfo.nome;}):[p]; return (m.some(function(x){return x.foto;})?2:0)+(p.top||m.some(function(x){return x.top;})?1:0); }
  if(c.loja.id==='dlu'){ // os queridinhos: os mais vendidos da D’Lu (relatório de vendas do ano)
    var q=c.produtos.filter(function(p){return p.queridinho;}).sort(function(a,b){return a.queridinho-b.queridinho;});
    if(q.length>=4) return q.slice(0,8);
  }
  return c.produtos.slice().sort(function(a,b){return comFoto(b)-comFoto(a);}).slice(0,6);
}
function renderDestaques(){
  var c=ctx(), d=destaquesDe(c);
  Array.prototype.forEach.call(document.querySelectorAll('[data-dest]'),function(n){ var p=d[+n.getAttribute('data-dest')]; if(p) por(n,cardFor(p)); });
}
function fillCorpo(c){
  var loja=c.loja, produtos=c.produtos;
  // fita
  var nomesFita=produtos.filter(function(p){return p.top||p.foto||p.marca;}).concat(produtos).map(function(p){return p.nome;}).filter(function(n,i,a){return a.indexOf(n)===i;}).slice(0,14);
  var fita=nomesFita.concat(nomesFita).map(function(n){return '<span style="display:inline-flex;align-items:center;gap:22px;padding:12px 11px;font-weight:900;font-size:22px;color:var(--c-escuro);white-space:nowrap">'+esc(n)+' <svg width="14" height="14" viewBox="0 0 24 24" style="fill:var(--c-acento)"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"></path></svg></span>';}).join('');
  // vantagens
  var trust=''
   +vItem('<path d="M3 7h18l-2 13H5L3 7z"></path><path d="M8 7a4 4 0 0 1 8 0"></path>','Varejo e atacado',loja.vantagem,'var(--c-acento)')
   +vItem('<path d="M4 20h16"></path><path d="M6 20l2-9h8l2 9"></path><path d="M12 11V5"></path><circle cx="12" cy="4" r="1.5"></circle>','Pesado na hora','Na quantidade do seu pedido','var(--c-acento)')
   +vItem('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>','Duas lojas no Brás','D’Lu Empório e VKS Condimentos','var(--c-acento)')
   +vItem('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path>','Pedido pelo WhatsApp',loja.fone,'#1b7a4b');
  // circulos
  var cats=c.cats;
  function nCat(cat){return produtos.filter(function(p){return p.cat===cat;});}
  var circ=cats.map(function(cat){
    var ps=nCat(cat); var fc=(ps.find(function(p){return p.foto&&!p.recorte;})||{}).foto||'';
    var on=cat===c.sel&&!c.q;
    var dot=fc?('<img class="dot" src="'+at(fc)+'" alt="" loading="lazy" decoding="async" width="150" height="150" style="width:100%;max-width:150px;aspect-ratio:1;object-fit:cover;border-radius:50%;border:5px solid '+(on?'var(--c-destaque)':'#ffffff')+';box-shadow:0 0 0 1px var(--c-borda);display:block">'):('<span class="dot" aria-hidden="true" style="width:100%;max-width:150px;aspect-ratio:1;border-radius:50%;background:'+grao((ps[0]||{}).cor||'#cccccc')+';border:5px solid '+(on?'var(--c-destaque)':'#ffffff')+';box-shadow:0 0 0 1px var(--c-borda);display:block"></span>');
    return '<a class="circ revela" href="#produtos" data-act="cat" data-cat="'+at(cat)+'" style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">'+dot+'<span style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:800;font-size:15px;color:var(--c-escuro);line-height:1.2">'+esc(cat)+'</span><span style="font-size:12px;color:var(--c-mudo)">'+ps.length+(ps.length===1?' produto':' produtos')+'</span></span></a>';
  }).join('');
  // destaques
  var destaques=destaquesDe(c);
  var destHTML=destaques.map(function(p,i){return '<div class="'+(state.mob?'':'revela ')+'cel" data-dest="'+i+'">'+cardFor(p)+'</div>';}).join('');
  // galeria
  var comF=produtos.filter(function(p){return p.foto&&!p.recorte;});
  var galeria=comF.filter(function(p){return p.cat==='Misturas da casa';}).slice(0,5);
  var galeriaHTML='';
  if(galeria.length>=5){
    galeriaHTML='<sectionwrap><section style="background:var(--c-escuro);color:#fff">'
      +'<svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:#fff"><path d="M0 48 C 240 0 480 0 720 24 C 960 48 1200 48 1440 8 L1440 48 Z" style="fill:var(--c-escuro)"></path></svg>'
      +'<div class="wrap" style="padding-top:40px;padding-bottom:72px;display:flex;flex-direction:column;gap:28px"><div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px;max-width:640px"><span class="eyebrow" style="color:var(--c-destaque)">Misturas da casa</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Direto da bandeja para a sua cozinha</h2><p style="margin:0;color:var(--c-texto-esc);font-size:17px">Misturas montadas aqui na loja, do jeito que os clientes pedem há anos.</p></div><a class="btn-y" href="#produtos" data-act="cat" data-cat="Misturas da casa" style="text-decoration:none;background:var(--c-destaque);color:var(--c-escuro);font-weight:800;font-size:14px;padding:14px 24px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center">Ver todas as misturas</a></div>'
      +'<div class="bento">'+galeria.map(function(g){return '<a class="bento-item revela" href="#produtos" data-act="cat" data-cat="Misturas da casa" style="position:relative;display:block;border-radius:22px;overflow:hidden;text-decoration:none;min-height:0"><img src="'+at(g.foto)+'" alt="'+at(g.nome)+'" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block"><span style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,24,48,0) 45%,rgba(20,24,48,.85) 100%)"></span><span class="disp" style="position:absolute;left:18px;right:18px;bottom:14px;font-weight:900;font-size:26px;line-height:1;color:#fff">'+esc(g.nome)+'</span></a>';}).join('')+'</div></div>'
      +'<svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:var(--c-fundo)"><path d="M0 0 L1440 0 L1440 24 C 1200 48 960 0 720 20 C 480 40 240 48 0 16 Z" style="fill:var(--c-escuro)"></path></svg>'
      +'</section></sectionwrap>';
  }
  return '<div class="fita" aria-hidden="true"><div class="fita-faixa"><div class="fita-trilho">'+fita+'</div></div></div>'
    +'<section class="sec-dest" style="padding-top:40px;padding-bottom:56px"><div class="wrap" style="display:flex;flex-direction:column;gap:28px"><div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:var(--c-acento)">'+(loja.id==='vks'?'Os mais pedidos da VKS':'Os mais vendidos da D’Lu')+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">'+(loja.id==='vks'?'Destaques da semana':'Os queridinhos')+'</h2></div><a href="#produtos" style="font-weight:800;font-size:15px;display:inline-flex;align-items:center;gap:8px">Ver todos os produtos <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div><div class="prods'+(state.mob?' carrossel':'')+'">'+destHTML+'</div></div></section>'
    +'<section style="padding-top:26px;padding-bottom:8px"><div class="wrap trust revela">'+trust+'</div></section>'
    +'<section style="padding-top:56px;padding-bottom:28px"><div class="wrap" style="display:flex;flex-direction:column;gap:32px"><div class="revela" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="eyebrow" style="color:var(--c-acento)">Compre por categoria</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95;color:var(--c-escuro)">Tem tempero pra tudo</h2></div><div class="circles">'+circ+'</div></div></section>'
    +galeriaHTML;
}
function vItem(path,titulo,texto,stroke){
  return '<div style="display:flex;gap:14px;align-items:center;padding:18px;border-radius:18px;background:var(--c-fundo)"><span aria-hidden="true" style="width:48px;height:48px;flex:none;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg></span><span style="display:flex;flex-direction:column;min-width:0"><strong style="font-size:15px">'+esc(titulo)+'</strong><span style="font-size:13px;color:var(--c-mudo)">'+esc(texto)+'</span></span></div>';
}

function fillCatalogo(c){
  var temFiltro=!!c.q||c.sel!=='Todos';
  var abas=['Todos'].concat(c.cats).map(function(cat){
    var on=(cat===c.sel)&&!c.q;
    return '<button type="button" data-act="cat" data-cat="'+at(cat)+'" aria-pressed="'+on+'" style="font:inherit;white-space:nowrap;font-weight:800;font-size:13px;padding:9px 16px;min-height:40px;border-radius:999px;border:1px solid var(--c-borda2);background:'+(on?'var(--c-escuro)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+';cursor:pointer">'+esc(cat)+'</button>';
  }).join('');
  var grid=c.visivel.map(function(p){return '<div class="'+(state.mob?'':'revela ')+'cel">'+cardFor(p)+'</div>';}).join('');
  var resta=c.lista.length-c.visivel.length;
  var verMais=resta>0?('<div class="ver-mais"><button type="button" data-act="verMais" class="btn-mais">Ver mais produtos <span>('+resta+(resta===1?' restante':' restantes')+')</span></button><span class="ver-mais-info">Mostrando '+c.visivel.length+' de '+c.lista.length+'</span></div>'):'';
  var outra=Object.keys(LOJAS).filter(function(id){return id!==c.loja.id;})[0], lo=LOJAS[outra];
  var notaLojas=lo?('<p class="nota-lojas">Este é o catálogo da <b>'+esc(c.loja.nome)+'</b>. A '+esc(lo.nome)+', nossa vizinha no Brás, tem catálogo e preços próprios. <button type="button" data-act="loja" data-loja="'+outra+'">Ver a '+esc(lo.nome)+' →</button></p>'):'';
  var vazio=c.lista.length===0?('<p style="margin:0;padding:36px;text-align:center;background:#fff;border-radius:20px;color:var(--c-mudo)">Não achamos esse produto no site. <a href="'+at(waGeralDe(c.loja))+'" target="_blank" rel="noopener" style="font-weight:800">Pergunte pelo WhatsApp</a>: temos muito mais na loja.</p>'):'';
  var limpar=temFiltro?('<button type="button" data-act="limpar" style="font:inherit;font-weight:800;font-size:14px;padding:10px 18px;min-height:44px;border-radius:999px;border:2px solid var(--c-escuro);background:#fff;color:var(--c-escuro);cursor:pointer">Limpar filtro ✕</button>'):'';
  var rd=regraDesconto();
  var faixaDesc = rd?'<p class="faixa-desc"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V3h8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle></svg>'+esc(textoDesconto(rd))+'</p>':'';
  var exemplo = (PRECOS&&PRECOS._exemplo)?'<p style="margin:0;font-size:13px;color:var(--c-acento);font-weight:700">⚠️ Preços de exemplo — serão substituídos pelos preços reais do Balcão.</p>':'';
  return '<section id="produtos" style="padding-top:64px;padding-bottom:72px;background:var(--c-fundo)"><div class="wrap" style="display:flex;flex-direction:column;gap:26px">'
    +'<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px"><div class="revela-esq" style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:var(--c-acento)">'+c.lista.length+(c.lista.length===1?' produto':' produtos')+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">'+esc(c.q?'Resultado da busca':(c.sel==='Todos'?'Todos os produtos':c.sel))+'</h2></div>'+limpar+'</div>'
 +faixaDesc+exemplo
    +'<div class="catnav" style="gap:8px;padding-bottom:4px" role="group" aria-label="Filtrar por categoria">'+abas+'</div>'
    +'<div class="prods'+(state.mob?' prods-mini':'')+'">'+grid+'</div>'+vazio+verMais+notaLojas
  +'</div></section>';
}

function fillAtacado(c){
  var loja=c.loja;
  var quadros=loja.quadros.map(function(q){return '<div class="etiqueta" style="position:relative;background:var(--c-fundo2);color:var(--c-escuro);border-radius:16px 16px 20px 20px;padding:34px 12px 22px;text-align:center;display:flex;flex-direction:column;gap:6px;box-shadow:0 18px 30px -18px rgba(0,0,0,.6)"><span aria-hidden="true" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;background:var(--c-acento);box-shadow:inset 0 2px 3px rgba(0,0,0,.4)"></span><span class="disp" style="font-weight:900;font-size:clamp(30px,3.4vw,46px);line-height:1;color:var(--c-acento)">'+esc(q.n)+'</span><span style="font-size:13px;font-weight:700;color:var(--c-escuro);line-height:1.3">'+esc(q.t)+'</span></div>';}).join('');
  var waAtacado='https://wa.me/'+loja.waNum+'?text='+encodeURIComponent('Olá, '+loja.nome+'! Quero um orçamento de atacado:\n');
  return '<section style="background:var(--c-acento);color:#fff;position:relative;overflow:hidden"><div aria-hidden="true" style="position:absolute;inset:0;opacity:.5;background:radial-gradient(circle at 30% 35%, var(--c-ponto1) 0 1.5px, transparent 2.4px) 0 0 / 14px 14px, radial-gradient(circle at 60% 70%, var(--c-ponto2) 0 1.6px, transparent 2.6px) 5px 7px / 17px 17px"></div><div class="wrap atacado" style="padding-top:72px;padding-bottom:72px;position:relative"><div class="revela-esq" style="display:flex;flex-direction:column;gap:16px"><span class="eyebrow" style="color:var(--c-destaque)">Atacado '+esc(loja.nome)+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(40px,5.4vw,68px);line-height:.92">Compra para o seu negócio? A gente abastece.</h2><p style="margin:0;color:var(--c-acento-bg2);font-size:18px;max-width:46ch">'+esc(loja.textoAtacado)+'</p><a class="btn-y" href="'+at(waAtacado)+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:var(--c-destaque);color:var(--c-escuro);font-weight:800;font-size:15px;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center;gap:10px">Pedir orçamento de atacado <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div><div class="tags revela">'+quadros+'</div></div></section>';
}

function fillPedir(c){
  var loja=c.loja;
  return '<section id="como-pedir" style="padding-top:72px;padding-bottom:72px"><div class="wrap pedir"><div class="revela-esq" style="display:flex;flex-direction:column;gap:26px"><div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:var(--c-acento)">Simples e rápido</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Como pedir</h2></div>'
    +'<ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px">'
    +passo('1','Escolha os temperos','No site ou perguntando pelo que precisa. No varejo, a partir de 250 g por produto.')
    +passo('2','Monte sua sacola','Escolha a quantidade e toque em “Adicionar” em cada produto. No fim, abra a sacola e envie direto para a loja (ou pelo WhatsApp, se preferir).')
    +passo('3','A gente pesa e separa','Conferimos o pedido, pesamos na hora e avisamos quando estiver pronto.')
    +'</ol><a class="btn-wa" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:15px;padding:16px 28px;border-radius:999px;min-height:52px;display:inline-flex;align-items:center">Fazer meu pedido</a></div>'
    +'<figure class="revela" aria-label="Exemplo de conversa de pedido" style="margin:0;background:var(--c-borda4);border-radius:28px;padding:18px;box-shadow:0 30px 50px -30px rgba(29,34,64,.45)"><div style="background:var(--c-borda3);border-radius:18px;overflow:hidden"><div style="background:#1b7a4b;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px"><span style="width:38px;height:38px;border-radius:50%;background:#fff;color:var(--c-escuro2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px" class="disp">'+(loja.id==='vks'?'VKS':'D’Lu')+'</span><span style="display:flex;flex-direction:column;line-height:1.2"><strong style="font-size:15px">'+esc(loja.nome)+'</strong><span style="font-size:12px;color:#d3f0df">conta comercial</span></span></div><div style="padding:18px 14px 22px;display:flex;flex-direction:column;gap:10px;font-size:15px"><div class="bolha b1" style="align-self:flex-end;max-width:82%;background:#d9fdd3;color:#1a2a1f;border-radius:14px 14px 4px 14px;padding:10px 12px;white-space:pre-line;box-shadow:0 1px 1px rgba(0,0,0,.08)">Bom dia! Quero:\nCominho – 500 g\nPáprica defumada – 1 kg</div><div class="bolha b2" style="align-self:flex-start;max-width:82%;background:#fff;color:#1a2a1f;border-radius:14px 14px 14px 4px;padding:10px 12px;box-shadow:0 1px 1px rgba(0,0,0,.08)">Bom dia! Já estamos separando. Avisamos assim que estiver pesado e pronto.</div><div class="bolha b3" style="align-self:flex-end;max-width:82%;background:#d9fdd3;color:#1a2a1f;border-radius:14px 14px 4px 14px;padding:10px 12px;box-shadow:0 1px 1px rgba(0,0,0,.08)">Perfeito, obrigado!</div></div></div></figure></div></section>';
}
function passo(n,t,d){return '<li style="display:flex;gap:18px;align-items:flex-start"><span class="disp" style="flex:none;width:52px;height:52px;border-radius:50%;background:var(--c-destaque);color:var(--c-escuro);font-weight:900;font-size:26px;display:flex;align-items:center;justify-content:center">'+n+'</span><span style="display:flex;flex-direction:column;gap:2px;padding-top:4px"><strong style="font-size:18px">'+esc(t)+'</strong><span style="color:var(--c-mudo)">'+esc(d)+'</span></span></li>';}

function fillVisite(c){
  var cards=Object.keys(LOJAS).map(function(id){
    var l=LOJAS[id]; var sit=situacao(l); var on=id===c.loja.id;
    var wa='https://wa.me/'+l.waNum+'?text='+encodeURIComponent('Olá, '+l.nome+'! Gostaria de fazer um pedido:\n');
    return '<article class="revela" style="background:#fff;border-radius:24px;padding:30px;display:flex;flex-direction:column;gap:18px;box-shadow:0 0 0 2px '+(on?'var(--c-destaque)':'#ffffff')+', 0 24px 40px -30px rgba(29,34,64,.5)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><h3 class="disp" style="margin:0;font-weight:900;font-size:36px;line-height:1;color:var(--c-escuro2)">'+esc(l.nome)+'</h3><span style="display:inline-flex;align-items:center;gap:8px;background:'+sit.fundo+';color:'+sit.tinta+';font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px"><span class="ponto-vivo" aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:'+sit.cor+'"></span>'+esc(sit.texto)+'</span></div>'
      +'<p style="margin:0;color:var(--c-mudo)">'+esc(l.historia)+'</p>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;padding:18px;border-radius:16px;background:var(--c-fundo)"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-acento)">Endereço</span><span style="font-weight:700">'+esc(l.endereco)+'</span><a href="'+at(l.mapa)+'" target="_blank" rel="noopener" style="font-weight:800;font-size:14px">Abrir no mapa →</a></div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-acento)">Horário</span><span style="font-weight:700">'+esc(l.horario)+'</span><span style="font-size:14px;color:var(--c-mudo)">'+esc(l.dias)+'</span></div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-acento)">WhatsApp</span><span style="font-weight:700;font-variant-numeric:tabular-nums">'+esc(l.fone)+'</span></div></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:10px"><a class="btn-wa" href="'+at(wa)+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:15px;padding:13px 22px;border-radius:999px;min-height:48px;display:inline-flex;align-items:center">Pedir na '+esc(l.nome)+'</a><button type="button" data-act="loja" data-loja="'+id+'" style="font:inherit;font-weight:800;font-size:15px;padding:13px 22px;min-height:48px;border-radius:999px;border:2px solid var(--c-escuro);background:#fff;color:var(--c-escuro);cursor:pointer">Ver produtos desta loja</button></div>'
    +'</article>';
  }).join('');
  return '<section id="visite" style="padding-top:72px;padding-bottom:80px;background:var(--c-fundo)"><div class="wrap" style="display:flex;flex-direction:column;gap:32px"><div class="revela" style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="eyebrow" style="color:var(--c-acento)">Duas lojas no Brás</span><h2 class="disp" style="margin:0;font-weight:900;font-size:clamp(36px,4.6vw,56px);line-height:.95">Visite nossas lojas</h2><p style="margin:6px 0 0;max-width:56ch;color:var(--c-mudo);font-size:16px">São vizinhas, pertinho uma da outra no Brás: a <b>D’Lu Empório</b> fica na Rua Santa Rosa, 244 e a <b>VKS Condimentos</b> na Avenida Mercúrio, 330. Cada uma tem seu catálogo, seus preços e seu WhatsApp.</p></div><div class="lojas">'+cards+'</div></div></section>';
}

function fillRodape(c){
  var loja=c.loja;
  var cats=c.cats.map(function(cat){return '<a href="#produtos" data-act="cat" data-cat="'+at(cat)+'" style="color:var(--c-texto-esc);text-decoration:none">'+esc(cat)+'</a>';}).join('');
  return '<footer style="background:var(--c-escuro);color:var(--c-texto-esc);font-size:14px"><svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" style="display:block;width:100%;height:36px;background:var(--c-fundo)"><path d="M0 48 C 240 0 480 0 720 24 C 960 48 1200 48 1440 8 L1440 48 Z" style="fill:var(--c-escuro)"></path></svg><div class="wrap foot" style="padding-top:40px;padding-bottom:32px"><div style="display:flex;flex-direction:column;gap:14px"><img src="'+LOGO[loja.id]+'" alt="'+at(loja.nome)+'" style="height:76px;width:auto;align-self:flex-start;background:#fff;border-radius:16px;padding:8px"><p style="margin:0;max-width:34ch">Temperos, ervas, misturas da casa, pimentas e molhos no Brás. Varejo e atacado, pesado na hora.</p><a class="btn-wa" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:14px;padding:11px 18px;border-radius:999px;min-height:44px;display:inline-flex;align-items:center">Pedir no WhatsApp</a></div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:var(--c-destaque);text-transform:uppercase;letter-spacing:.1em;font-size:12px">Categorias</strong>'+cats+'</div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:var(--c-destaque);text-transform:uppercase;letter-spacing:.1em;font-size:12px">D’Lu Empório</strong><span>Rua Santa Rosa, 244 – Brás</span><span>Seg. a sex. 5h30 às 16h · Sáb. 7h às 13h</span><span style="font-variant-numeric:tabular-nums">(11) 3313-6697</span></div><div style="display:flex;flex-direction:column;gap:8px"><strong style="color:var(--c-destaque);text-transform:uppercase;letter-spacing:.1em;font-size:12px">VKS Condimentos</strong><span>Avenida Mercúrio, 330 – Brás</span><span>Seg. a sex. 6h às 16h · Sáb. 6h às 13h</span><span style="font-variant-numeric:tabular-nums">(11) 3311-7153</span></div></div><div class="wrap" style="border-top:1px solid var(--c-linha-esc2);padding-top:16px;padding-bottom:22px;font-size:13px">São Paulo – SP · Site do catálogo. Os pedidos são conferidos e pesados na loja.</div></footer>';
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
  if(x.un==='un') return nome+' '+(x.r==='Unidade'?'':x.r+(x.liq?' drenado (pote de '+x.liq+')':'')+' ')+'– '+x.n+' un';
  return nome+' – '+x.n+' '+x.un.replace(/^(caixa|pacote)/,function(m){return x.n>1?m+'s':m;});
}
function unitItem(x){ return precoUnit({nome:x.nome, marca:x.marca},{r:x.r, g:x.g||null, fechado:x.fechado||''},x.n); }
function precoItem(x){ var u=unitItem(x); return u?u.c*x.n:null; }
function totalSacola(loja){
  var itens=state.carrinhos[loja.id]||[];
  var algum=false, soma=0, falta=false;
  itens.forEach(function(x){ var c=precoItem(x); if(c!=null){algum=true;soma+=c;} else falta=true; });
  var d=regraDesconto(), desc=0, faltaDesc=0;
  if(d&&algum){
    if(soma>=d.min){ if(d.formas.indexOf(state.pag)>=0) desc=Math.round(soma*d.pct/100); }
    else faltaDesc=d.min-soma;
  }
  return {algum:algum, soma:soma, falta:falta, desc:desc, total:soma-desc, faltaDesc:faltaDesc, regra:d};
}
function textoDesconto(d){ return d.pct+'% de desconto no '+d.formas.filter(function(f){return f!=='cartao';}).map(function(f){return f==='pix'?'Pix':'dinheiro';}).join(' ou ')+' acima de '+brl(d.min); }

function fillOverlay(c){
  var loja=c.loja;
  var html='';
  // aviso toast
  var hAviso='',hFab='',hWa='',hGav='';
  if(state._aviso) hAviso='<div class="aviso" role="status" style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;background:var(--c-escuro);color:#fff;padding:12px 18px;border-radius:999px;display:flex;align-items:center;gap:12px;box-shadow:0 14px 30px -10px rgba(0,0,0,.5);max-width:calc(100% - 32px)"><span aria-hidden="true" style="width:24px;height:24px;flex:none;border-radius:50%;background:#4cc27f;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span><span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Na sacola: <b>'+esc(state._aviso)+'</b></span><button type="button" data-act="abrirSacola" style="font:inherit;cursor:pointer;border:none;background:var(--c-destaque);color:var(--c-escuro);font-weight:800;font-size:13px;padding:7px 12px;border-radius:999px;min-height:34px;white-space:nowrap">Ver pedido</button></div>';
  // FAB sacola
  var qtd=(state.carrinhos[loja.id]||[]).length;
  if(qtd>0) hFab='<button type="button" data-act="abrirSacola" style="position:fixed;left:20px;bottom:20px;z-index:50;font:inherit;cursor:pointer;border:none;background:var(--c-escuro);color:#fff;padding:0 20px 0 14px;height:58px;border-radius:999px;display:flex;align-items:center;gap:10px;box-shadow:0 12px 24px -8px rgba(0,0,0,.45)"><span style="width:34px;height:34px;border-radius:50%;background:var(--c-destaque);color:var(--c-escuro);font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center">'+qtd+'</span><span style="font-weight:800;font-size:14px">Ver meu pedido</span></button>';
  // FAB whatsapp
  hWa='<a class="btn-wa pulso" href="'+at(waGeralDe(loja))+'" target="_blank" rel="noopener" aria-label="Pedir pelo WhatsApp da '+at(loja.nome)+'" style="position:fixed;right:20px;bottom:20px;width:62px;height:62px;border-radius:50%;background:#1b7a4b;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(27,122,75,.18),0 12px 24px -8px rgba(0,0,0,.45);z-index:50"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg></a>';
  if(state.sacola) hGav=sacolaHTML(c);
  else if(state.conta) hGav=contaHTML(c);
  // cada parte fica sempre na mesma "vaga": assim, quando o aviso some ou o botão da sacola aparece, a gaveta não é recriada
  var vaga=function(k,h){ return '<div data-vaga="'+k+'" style="display:contents">'+h+'</div>'; };
  return vaga('aviso',hAviso)+vaga('fab',hFab)+vaga('wa',hWa)+vaga('gaveta',hGav);
}

function confirmacaoHTML(loja){
  var cod=state.enviado.codigo, st=state.statusPed[cod]||{};
  var waTxt='Olá, '+loja.nome+'! Acabei de fazer o pedido '+cod+' pelo site.';
  return '<div style="text-align:center;padding:26px 6px;display:flex;flex-direction:column;align-items:center;gap:14px">'
    +'<span aria-hidden="true" style="width:64px;height:64px;border-radius:50%;background:#e3f5ea;display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1b7a4b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span>'
    +'<h3 class="disp" style="margin:0;font-weight:900;font-size:32px;line-height:1">Pedido enviado!</h3>'
    +'<p style="margin:0;color:var(--c-mudo);max-width:32ch">A '+esc(loja.nome)+' recebeu seu pedido. A gente confere, pesa e avisa você pelo WhatsApp.</p>'
    +'<div style="display:flex;flex-direction:column;gap:4px;padding:14px 24px;border-radius:18px;background:var(--c-fundo);border:2px dashed var(--c-borda2)"><span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:var(--c-mudo)">Código do pedido</span><span class="disp" style="font-weight:900;font-size:40px;letter-spacing:.12em;color:var(--c-escuro)">'+esc(cod)+'</span></div>'
    +'<p role="status" style="margin:0;font-size:15px;font-weight:700;color:var(--c-escuro)">'+esc(st.rotulo||'Recebido, aguardando a loja')+(st.numero?' · nº '+esc(st.numero)+' na loja':'')+'</p>'
    +'<button type="button" data-act="verStatus" data-cod="'+at(cod)+'" data-loja="'+at(loja.id)+'" style="font:inherit;cursor:pointer;border:2px solid var(--c-escuro);background:#fff;color:var(--c-escuro);font-weight:800;font-size:14px;padding:9px 18px;border-radius:999px;min-height:42px">Atualizar situação</button>'
    +'<a class="btn-wa" href="'+at('https://wa.me/'+loja.waNum+'?text='+encodeURIComponent(waTxt))+'" target="_blank" rel="noopener" style="text-decoration:none;background:#1b7a4b;color:#fff;font-weight:800;font-size:14px;padding:11px 18px;border-radius:999px;min-height:44px;display:inline-flex;align-items:center">Falar com a loja no WhatsApp</a>'
    +'<button type="button" data-act="novoPedido" style="font:inherit;cursor:pointer;border:none;background:transparent;color:var(--c-acento);font-weight:700;font-size:14px;padding:6px 10px;min-height:36px">Fazer outro pedido</button>'
  +'</div>';
}
function sacolaHTML(c){
  var loja=c.loja;
  var nItens=(state.carrinhos[loja.id]||[]).length, rotItens=nItens===1?'1 item':nItens+' itens';
  if(state.enviado&&state.enviado.loja===loja.id){
    return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharSacola" aria-label="Fechar" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Pedido enviado" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;justify-content:flex-end;padding:16px 18px 0"><button type="button" data-act="fecharSacola" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--c-borda);background:#fff;color:var(--c-escuro);cursor:pointer;font-size:20px;line-height:1">✕</button></div><div class="gaveta-rolar" style="flex:1;overflow-y:auto;padding:0 22px 24px">'+confirmacaoHTML(loja)+'</div></aside></div>';
  }
  var itens=(state.carrinhos[loja.id]||[]).map(function(x,i){
    var resumo=x.g?(fmtG(x.g*x.n)+(x.n>1?' · '+x.n+'× '+x.r:'')):(x.n+'× '+x.r+(x.liq?' drenado · pote de '+x.liq:''));
    var cent=precoItem(x), u=unitItem(x), ra=regraAtacado(), prx=precoDe({nome:x.nome,marca:x.marca});
    var preco=cent!=null?('<span style="font-size:13px;font-weight:800;color:var(--c-escuro)">'+brl(cent)+(u&&u.at?' <span class="tag-atac">Atacado</span>':'')+'</span>'):'';
    if(ra&&prx&&u&&!u.at){
      if(x.g&&prx.kgAt){ var faltaG=ra.minKg*1000-x.g*x.n; if(faltaG>0) preco+='<span class="dica-atac">Com mais '+fmtG(faltaG)+' sai a '+brl(prx.kgAt)+'/kg (atacado)</span>'; }
      else if(!x.g&&prx.opAt&&prx.opAt[x.r]!=null){ var faltaU=ra.minUn-x.n; if(faltaU>0) preco+='<span class="dica-atac">Com mais '+faltaU+' un. sai a '+brl(prx.opAt[x.r])+' cada (atacado)</span>'; }
    }
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:var(--c-fundo)"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><strong style="font-size:15px;line-height:1.2">'+esc(x.nome)+(x.marca?' '+esc(x.marca):'')+'</strong><span style="font-size:13px;color:var(--c-mudo)">'+esc(resumo)+'</span>'+preco+'</div><div style="display:flex;align-items:center;gap:2px;background:#fff;border-radius:999px;border:1px solid var(--c-borda2)"><button type="button" class="qtd-btn" data-act="menos" data-bi="'+i+'" aria-label="Diminuir" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:var(--c-escuro);font-size:18px;font-weight:800;cursor:pointer">−</button><span style="min-width:22px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums">'+x.n+'</span><button type="button" class="qtd-btn" data-act="mais" data-bi="'+i+'" aria-label="Aumentar" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:var(--c-escuro);font-size:18px;font-weight:800;cursor:pointer">+</button></div><button type="button" data-act="tirar" data-bi="'+i+'" aria-label="Tirar do pedido" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;color:#8a8fa8;cursor:pointer"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg></button></div>';
  }).join('');
  var vazio=itens.length===0;
  var corpo=vazio
    ? '<div style="text-align:center;padding:40px 12px;color:var(--c-mudo);display:flex;flex-direction:column;align-items:center;gap:12px"><svg aria-hidden="true" width="56" height="56" viewBox="0 0 24 24" fill="none" style="stroke:var(--c-borda2)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2L5 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg><strong style="color:var(--c-escuro);font-size:17px">Sua sacola está vazia</strong><span>Escolha a quantidade nos produtos e toque em “Adicionar”.</span><button type="button" data-act="fecharSacola" style="font:inherit;cursor:pointer;border:2px solid var(--c-escuro);background:#fff;color:var(--c-escuro);font-weight:800;padding:10px 18px;border-radius:999px;min-height:44px">Ver produtos</button></div>'
    : itens;

  var rodape='';
  if(!vazio){
    var doc=soNum(state.doc), ehCnpj=doc.length>11, docValido=ehCnpj?cnpjOk(doc):cpfOk(doc);
    var querNf=state.nf==='sim', entrega=state.entrega!=='Retirar na loja';
    var tot=totalSacola(loja);
    var entregas=['Retirar na loja','Entrega por Lalamove ou Uber'].map(function(t){var on=state.entrega===t;return '<button type="button" data-act="entrega" data-v="'+at(t)+'" aria-pressed="'+on+'" style="flex:1;font:inherit;cursor:pointer;font-size:13px;font-weight:800;padding:9px 10px;min-height:40px;border-radius:999px;border:1.5px solid var(--c-escuro);background:'+(on?'var(--c-escuro)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+'">'+esc(t)+'</button>';}).join('');
    var endBloco=entrega?('<label for="sacolaEnd" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Endereço de entrega</label><input id="sacolaEnd" value="'+at(state.endereco)+'" data-act="campo" data-field="endereco" autocomplete="street-address" placeholder="Rua, número, bairro e cidade" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">'):'';
    var nfOp=[{v:'nao',t:'Não preciso'},{v:'sim',t:'Sim, quero nota'}].map(function(o){var on=state.nf===o.v;return '<button type="button" data-act="nf" data-v="'+o.v+'" aria-pressed="'+on+'" style="flex:1;font:inherit;cursor:pointer;font-size:13px;font-weight:800;padding:9px 10px;min-height:40px;border-radius:999px;border:1.5px solid var(--c-escuro);background:'+(on?'var(--c-escuro)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+'">'+esc(o.t)+'</button>';}).join('');
    var docDica=!doc?'Digite só os números.':(docValido?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
    var nfBloco=querNf?('<div style="display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;background:var(--c-fundo2);border:1px solid var(--c-destaque-bg)"><label for="sacolaDoc" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">CPF ou CNPJ</label><input id="sacolaDoc" value="'+at(state.doc)+'" data-act="campo" data-field="doc" inputmode="numeric" autocomplete="off" placeholder="Só os números" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)"><span id="docDica" style="font-size:13px;font-weight:700;color:'+(doc&&docValido?'#1b7a4b':'var(--c-mudo)')+'">'+esc(docDica)+'</span>'+('<div id="sacolaRazaoBox" style="display:'+(ehCnpj?'flex':'none')+';flex-direction:column;gap:8px">'+'<label for="sacolaRazao" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Razão social (opcional)</label><input id="sacolaRazao" value="'+at(state.razao)+'" data-act="campo" data-field="razao" placeholder="Nome da empresa" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">'+'</div>')+'</div>'):'';

    var erro='';
    if(!state.nome.trim()) erro='Informe seu nome para a loja identificar o pedido.';
    else if(soNum(state.fone).length<10) erro='Informe seu WhatsApp com DDD: é por ele que a loja confirma o pedido.';
    else if(querNf&&!doc) erro='Para a nota fiscal, informe seu CPF ou CNPJ.';
    else if(querNf&&!docValido) erro=ehCnpj?'Esse CNPJ não parece certo. Confira os números.':'Esse CPF não parece certo. Confira os números.';
    else if(entrega&&!state.endereco.trim()) erro='Para entrega, informe o endereço.';

    var pagOp=[{v:'pix',t:'Pix'},{v:'dinheiro',t:'Dinheiro'},{v:'cartao',t:'Cartão'}].map(function(o){var on=state.pag===o.v;return '<button type="button" data-act="pag" data-v="'+o.v+'" aria-pressed="'+on+'" style="flex:1;font:inherit;cursor:pointer;font-size:13px;font-weight:800;padding:9px 10px;min-height:40px;border-radius:999px;border:1.5px solid var(--c-escuro);background:'+(on?'var(--c-escuro)':'#ffffff')+';color:'+(on?'#ffffff':'var(--c-escuro)')+'">'+esc(o.t)+'</button>';}).join('');
    var pagBloco='<span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Como vai pagar?</span><div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Forma de pagamento">'+pagOp+'</div><span style="font-size:12px;color:var(--c-mudo);margin-top:-4px">O pagamento é feito na retirada ou na entrega.'+(tot.regra?' <b style="color:#1b7a4b">'+esc(textoDesconto(tot.regra))+'.</b>':'')+'</span>';
    var totalBloco='';
    if(tot.algum){
      var linhaDesc='';
      if(tot.desc>0) linhaDesc='<div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 2px;color:#1b7a4b;font-weight:800;font-size:14px"><span>Desconto '+tot.regra.pct+'% no '+(state.pag==='pix'?'Pix':'dinheiro')+'</span><span>− '+brl(tot.desc)+'</span></div>';
      else if(tot.regra&&tot.faltaDesc>0&&tot.regra.formas.indexOf(state.pag)>=0) linhaDesc='<p style="margin:0;padding:8px 10px;border-radius:10px;background:#e3f5ea;color:#146b3f;font-size:13px;font-weight:700">Faltam '+brl(tot.faltaDesc)+' para ganhar '+tot.regra.pct+'% de desconto no '+(state.pag==='pix'?'Pix':'dinheiro')+'.</p>';
      else if(tot.regra&&tot.soma>=tot.regra.min&&tot.regra.formas.indexOf(state.pag)<0) linhaDesc='<p style="margin:0;padding:8px 10px;border-radius:10px;background:var(--c-fundo2);color:#7a5a12;font-size:13px;font-weight:700">Pagando no Pix ou em dinheiro você economiza '+brl(Math.round(tot.soma*tot.regra.pct/100))+'.</p>';
      totalBloco=(tot.desc>0?'<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 2px 0;font-size:14px;color:var(--c-mudo);font-weight:700"><span>Subtotal</span><span>'+brl(tot.soma)+'</span></div>':'')
        +linhaDesc
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 2px"><span style="font-weight:700;color:var(--c-mudo);font-size:14px">Estimativa'+(tot.falta?' (parcial)':'')+'</span><span class="preco" style="font-size:24px">'+brl(tot.total)+'</span></div><p style="margin:-4px 0 0;font-size:12px;color:var(--c-mudo)">Valor final confirmado na pesagem, na loja.</p>';
    }
    var acao=erro
      ? '<p role="alert" style="margin:0;padding:10px 12px;border-radius:12px;background:#fde6e2;color:#9b2a1c;font-size:14px;font-weight:700">'+esc(erro)+'</p>'
      : ('<button type="button" data-act="enviarLoja"'+(state.enviando?' disabled aria-busy="true"':'')+' style="font:inherit;cursor:'+(state.enviando?'wait':'pointer')+';border:none;background:var(--c-destaque);color:var(--c-escuro);font-weight:800;font-size:15px;padding:15px;border-radius:999px;min-height:52px;display:flex;align-items:center;justify-content:center;gap:10px"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>'+(state.enviando?'Enviando…':'Enviar pedido para a loja · '+rotItens)+'</button>'
        +(state.erroEnvio?'<p role="alert" style="margin:0;padding:10px 12px;border-radius:12px;background:#fde6e2;color:#9b2a1c;font-size:14px;font-weight:700">'+esc(state.erroEnvio)+'</p>':'')
        +'<a class="btn-wa" href="'+at(mensagemWa(c))+'" data-act="registrar" target="_blank" rel="noopener" style="text-decoration:none;background:'+(state.erroEnvio?'#1b7a4b':'#fff')+';color:'+(state.erroEnvio?'#fff':'#1b7a4b')+';border:2px solid #1b7a4b;font-weight:800;font-size:14px;padding:11px;border-radius:999px;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"></path></svg>'+(state.erroEnvio?'Enviar pelo WhatsApp':'ou enviar pelo WhatsApp')+'</a>');

    rodape='<div style="border-top:1px solid var(--c-borda);margin:4px -22px 0;padding:16px 22px 6px;display:flex;flex-direction:column;gap:12px;background:#fff">'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Retirada ou entrega">'+entregas+'</div>'+endBloco
      +'<span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Precisa de nota fiscal?</span><div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Nota fiscal">'+nfOp+'</div>'+nfBloco
      +'<label for="sacolaNome" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Seu nome</label><input id="sacolaNome" value="'+at(state.nome)+'" data-act="campo" data-field="nome" autocomplete="name" placeholder="Para a gente identificar o pedido" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">'
      +'<label for="sacolaFone" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Seu WhatsApp</label><input id="sacolaFone" type="tel" value="'+at(state.fone)+'" data-act="campo" data-field="fone" autocomplete="tel" inputmode="tel" placeholder="(11) 90000-0000" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">'
      +'<input id="hpCampo" name="empresa_site" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
      +'<label for="sacolaObs" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">Observação (opcional)</label><input id="sacolaObs" value="'+at(state.obs)+'" data-act="campo" data-field="obs" placeholder="Ex.: separar em pacotes de 1 kg" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">'
      +pagBloco+'<div id="sacolaTotal" style="display:flex;flex-direction:column;gap:12px">'+totalBloco+'</div><div id="sacolaAcao" style="display:flex;flex-direction:column;gap:12px">'+acao+'</div>'
      +'<button type="button" data-act="limpar2" style="align-self:center;font:inherit;cursor:pointer;border:none;background:transparent;color:var(--c-acento);font-weight:700;font-size:14px;padding:6px 10px;min-height:36px">'+(state.limparOk?'Toque de novo para esvaziar':'Esvaziar sacola')+'</button>'
    +'</div>';
  }

  return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharSacola" aria-label="Fechar meu pedido" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Meu pedido" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px;border-bottom:1px solid var(--c-borda)"><div style="display:flex;flex-direction:column;gap:2px"><span class="eyebrow" style="color:var(--c-acento)">'+esc(loja.nome)+'</span><h2 class="disp" style="margin:0;font-weight:900;font-size:34px;line-height:1">Meu pedido</h2></div><button type="button" data-act="fecharSacola" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--c-borda);background:#fff;color:var(--c-escuro);cursor:pointer;font-size:20px;line-height:1">✕</button></div><div class="gaveta-rolar" style="flex:1;overflow-y:auto;padding:16px 22px 22px;display:flex;flex-direction:column;gap:12px">'+corpo+rodape+'</div></aside></div>';
}

function mensagemWa(c){
  var loja=c.loja;
  var itens=state.carrinhos[loja.id]||[];
  var doc=soNum(state.doc), ehCnpj=doc.length>11;
  var querNf=state.nf==='sim', entrega=state.entrega!=='Retirar na loja';
  var tot=totalSacola(loja);
  var msg='Olá, '+loja.nome+'! Gostaria de fazer um pedido:\n\n'
    +itens.map(function(x){var u=unitItem(x);return linhaTxt(x)+(u&&u.at?' (atacado)':'');}).join('\n')
    +'\n\n'+state.entrega
    +(entrega&&state.endereco.trim()?'\nEndereço: '+state.endereco.trim():'')
    +'\nNota fiscal: '+(querNf?('sim, no '+(ehCnpj?'CNPJ ':'CPF ')+fmtDoc(doc)+(ehCnpj&&state.razao.trim()?' ('+state.razao.trim()+')':'')):'não preciso')
    +(state.nome.trim()?'\nNome: '+state.nome.trim():'')
    +(state.fone.trim()?'\nTelefone: '+state.fone.trim():'')
    +(state.obs.trim()?'\nObs.: '+state.obs.trim():'')
    +'\nPagamento: '+({pix:'Pix',dinheiro:'Dinheiro',cartao:'Cartão'}[state.pag]||state.pag)
    +(tot.algum?('\n\nEstimativa'+(tot.falta?' (parcial)':'')+': '+brl(tot.total)+(tot.desc>0?' (já com '+tot.regra.pct+'% de desconto: − '+brl(tot.desc)+')':'')+' — confirmar na pesagem.'):'');
  return 'https://wa.me/'+loja.waNum+'?text='+encodeURIComponent(msg);
}

function contaHTML(c){
  var doc=soNum(state.doc), ehCnpj=doc.length>11, docValido=ehCnpj?cnpjOk(doc):cpfOk(doc);
  var docDica=!doc?'Digite só os números.':(docValido?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
  var abas=[{v:'dados',t:'Meus dados'},{v:'pedidos',t:'Meus pedidos ('+(state.historico||[]).length+')'}].map(function(a){var on=state.contaAba===a.v;return '<button type="button" role="tab" data-act="contaAba" data-v="'+a.v+'" aria-selected="'+on+'" style="font:inherit;cursor:pointer;border:none;background:transparent;padding:10px 0;font-weight:800;font-size:15px;color:'+(on?'var(--c-escuro)':'var(--c-mudo)')+';border-bottom:3px solid '+(on?'var(--c-acento)':'transparent')+';margin-bottom:-1px">'+esc(a.t)+'</button>';}).join('');
  var corpo;
  if(state.contaAba==='dados'){
    corpo='<p style="margin:0 0 4px;font-size:14px;color:var(--c-mudo)">Preencha uma vez e seus pedidos já saem com tudo pronto. <b style="color:var(--c-escuro)">Seus dados ficam salvos só neste aparelho</b> e só vão para a loja quando você envia um pedido.</p>'
      +campoHTML('contaNome','Nome','nome',state.nome,'Seu nome ou da empresa','name')
      +campoHTML('contaFone','WhatsApp','fone',state.fone,'(11) 90000-0000','tel')
      +campoHTML('contaDoc','CPF ou CNPJ (para nota fiscal)','doc',state.doc,'Só os números','off')
      +'<span id="docDica" style="font-size:13px;font-weight:700;color:'+(doc&&docValido?'#1b7a4b':'var(--c-mudo)')+'">'+esc(docDica)+'</span>'
      +'<div id="contaRazaoBox" style="display:'+(ehCnpj?'flex':'none')+';flex-direction:column;gap:10px">'+campoHTML('contaRazao','Razão social','razao',state.razao,'Nome da empresa','')+'</div>'
      +campoHTML('contaEnd','Endereço de entrega','endereco',state.endereco,'Rua, número, bairro e cidade','street-address')
      +'<span style="font-size:13px;color:#1b7a4b;font-weight:700">Salvo automaticamente ✓</span>'
      +'<button type="button" data-act="apagarDados" style="align-self:flex-start;margin-top:8px;font:inherit;cursor:pointer;border:none;background:transparent;color:var(--c-acento);font-weight:700;font-size:14px;padding:6px 0;min-height:36px">'+(state.apagarOk?'Toque de novo para apagar tudo':'Apagar meus dados deste aparelho')+'</button>';
  } else {
    var h=(state.historico||[]);
    if(h.length===0){ corpo='<p style="margin:0;padding:30px 8px;text-align:center;color:var(--c-mudo)">Os pedidos que você enviar pelo site aparecem aqui, para pedir de novo com um toque.</p>'; }
    else corpo=h.map(function(hh,i){
      var lojaNome=(LOJAS[hh.loja]||c.loja).nome;
      var resumo=hh.itens.map(function(x){return x.nome;}).slice(0,3).join(', ')+(hh.itens.length>3?' e mais '+(hh.itens.length-3):'');
      var dataTxt=new Date(hh.data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var stH=hh.codigo?(state.statusPed[hh.codigo]||null):null;
      var codHTML=hh.codigo?('<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:13px;font-weight:800;color:var(--c-escuro)">Código <span style="letter-spacing:.08em">'+esc(hh.codigo)+'</span></span>'+(stH?'<span style="font-size:13px;font-weight:700;color:#1b7a4b">'+esc(stH.rotulo)+'</span>':'<button type="button" data-act="verStatus" data-cod="'+at(hh.codigo)+'" data-loja="'+at(hh.loja)+'" style="font:inherit;cursor:pointer;border:none;background:transparent;color:var(--c-escuro2);font-weight:800;font-size:13px;text-decoration:underline;padding:4px 0">Ver situação</button>')+'</div>'):'<span style="font-size:12px;color:#8a8fa8">Enviado pelo WhatsApp</span>';
      return '<div style="padding:14px;border-radius:16px;background:var(--c-fundo);display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong style="font-size:15px">'+esc(lojaNome)+'</strong><span style="font-size:13px;color:var(--c-mudo);font-variant-numeric:tabular-nums">'+esc(dataTxt)+'</span></div><span style="font-size:14px;color:var(--c-mudo)">'+(hh.itens.length===1?'1 item':hh.itens.length+' itens')+' · '+esc(resumo)+'</span>'+codHTML+'<button type="button" data-act="repetir" data-hi="'+i+'" style="align-self:flex-start;font:inherit;cursor:pointer;border:2px solid var(--c-escuro);background:#fff;color:var(--c-escuro);font-weight:800;font-size:14px;padding:8px 16px;border-radius:999px;min-height:40px">Pedir de novo</button></div>';
    }).join('');
  }
  return '<div style="position:fixed;inset:0;z-index:80"><button type="button" class="gaveta-fundo" data-act="fecharConta" aria-label="Fechar minha conta" style="position:absolute;inset:0;border:none;padding:0;background:rgba(15,18,38,.55);cursor:pointer"></button><aside class="gaveta" role="dialog" aria-label="Minha conta" style="position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 40px -20px rgba(0,0,0,.5)"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 0"><div style="display:flex;flex-direction:column;gap:2px"><span class="eyebrow" style="color:var(--c-acento)">D’Lu e VKS</span><h2 class="disp" style="margin:0;font-weight:900;font-size:34px;line-height:1">Minha conta</h2></div><button type="button" data-act="fecharConta" aria-label="Fechar" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--c-borda);background:#fff;color:var(--c-escuro);cursor:pointer;font-size:20px;line-height:1">✕</button></div><div role="tablist" style="display:flex;gap:18px;padding:14px 22px 0;border-bottom:1px solid var(--c-borda)">'+abas+'</div><div class="gaveta-rolar" style="flex:1;overflow-y:auto;padding:18px 22px 24px;display:flex;flex-direction:column;gap:10px">'+corpo+'</div></aside></div>';
}
function campoHTML(id,label,field,val,ph,ac){
  var extra = field==='doc'?' inputmode="numeric"':'';
  var acAttr = ac?(' autocomplete="'+ac+'"'):'';
  var tipo = field==='fone'?' type="tel"':'';
  return '<label for="'+id+'" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--c-mudo)">'+esc(label)+'</label><input id="'+id+'" value="'+at(val)+'" data-act="campo" data-field="'+field+'"'+tipo+extra+acAttr+' placeholder="'+at(ph)+'" style="font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--c-borda2);background:var(--c-fundo);color:var(--c-escuro)">';
}

/* ================= RENDER + EVENTOS ================= */
function el(id){ return document.getElementById(id); }
/* Põe o HTML novo mexendo só no que mudou (morph). Os botões continuam sendo os mesmos elementos:
   um toque que começou antes do re-render não se perde, a rolagem lateral das categorias não volta
   ao começo, as fotos não recarregam e as animações de entrada não rodam de novo. */
function por(no,html){
  if(!no) return;
  if(!no.firstChild){ no.innerHTML=html; return; }
  var tmp=document.createElement(no.tagName==='TBODY'?'tbody':'div'); tmp.innerHTML=html; morphFilhos(no,tmp);
}
var heroSlide=-1, heroLoja='';
function renderAll(){
  var c=ctx();
  aplicarTemaLoja(c.loja.id);
  por(el('topo'),fillTopo(c));
  renderHero(c);
  por(el('corpo'),fillCorpo(c));
  por(el('catalogo'),fillCatalogo(c));
  por(el('atacado'),fillAtacado(c));
  por(el('pedir'),fillPedir(c));
  por(el('visite'),fillVisite(c));
  por(el('rodape'),fillRodape(c));
  renderOverlay(c);
  renderFolha(c);
}
/* folha do produto (celular): abre por cima, com a mesma lógica do cartão completo */
var folhaVinha=null;
function renderFolha(c){
  var f=el('folha'); if(!f) return;
  if(!state.folha){ if(f.firstChild){ f.innerHTML=''; document.documentElement.classList.remove('folha-aberta'); if(folhaVinha&&document.contains(folhaVinha)){ try{folhaVinha.focus({preventScroll:true});}catch(e){} } folhaVinha=null; } return; }
  var html=folhaHTML(c||ctx());
  if(!html){ state.folha=null; f.innerHTML=''; document.documentElement.classList.remove('folha-aberta'); return; }
  var nova=!f.firstChild;
  por(f,html);
  if(nova){ document.documentElement.classList.add('folha-aberta'); var x=f.querySelector('.folha-x'); if(x) try{ x.focus({preventScroll:true}); }catch(e){} }
}
function abrirFolha(chave,grupo,quem){ state.folha={chave:chave, grupo:grupo||''}; folhaVinha=quem||null; renderFolha(); }
function fecharFolha(){ if(!state.folha) return; state.folha=null; renderFolha(); }
function renderCatalogo(){ var c=ctx(); por(el('catalogo'),fillCatalogo(c)); por(el('catnav'),navCatsHTML(c)); if(state.folha) renderFolha(c); }
function renderCorpo(){ por(el('corpo'),fillCorpo(ctx())); }
// troca de slide (ou de loja) recria o destaque para tocar a animação de entrada; o resto só atualiza o que mudou
function renderHero(c){ c=c||ctx(); var h=el('hero'), html=fillHero(c);
  if(state.slide!==heroSlide||state.loja!==heroLoja){ heroSlide=state.slide; heroLoja=state.loja; h.innerHTML=html; } else por(h,html); }
var gavetaAberta='', ultimoToque=0;
/* Atualiza a árvore viva para ficar igual à nova, mexendo só no que mudou.
   Assim a gaveta não é recriada: não "abre" de novo, não perde a rolagem, o foco nem as animações já tocadas. */
function morphNo(de,para){
  if(de.nodeType!==para.nodeType||de.nodeName!==para.nodeName){ de.parentNode.replaceChild(para,de); return; }
  if(de.nodeType===3||de.nodeType===8){ if(de.nodeValue!==para.nodeValue) de.nodeValue=para.nodeValue; return; }
  if(de.nodeType!==1) return;
  var i,nm;
  for(i=de.attributes.length-1;i>=0;i--){ nm=de.attributes[i].name; if(!para.hasAttribute(nm)) de.removeAttribute(nm); }
  for(i=0;i<para.attributes.length;i++){ var a=para.attributes[i]; if(de.getAttribute(a.name)!==a.value) de.setAttribute(a.name,a.value); }
  if(de.tagName==='INPUT'||de.tagName==='TEXTAREA'||de.tagName==='SELECT'){
    if(de!==document.activeElement){ if(de.value!==para.value) de.value=para.value; if(de.checked!==para.checked) de.checked=para.checked; }
    if(de.tagName!=='SELECT') return;
  }
  morphFilhos(de,para);
}
function morphFilhos(de,para){
  var a=de.firstChild, b=para.firstChild;
  while(b){ var bProx=b.nextSibling;
    if(!a) de.appendChild(b); else { var aProx=a.nextSibling; morphNo(a,b); a=aProx; }
    b=bProx; }
  while(a){ var r=a.nextSibling; de.removeChild(a); a=r; }
}
function renderOverlay(c){
  var o=el('overlay'), rol=o.querySelector('.gaveta-rolar'), topoRol=rol?rol.scrollTop:0;
  var ativo=document.activeElement, idF=(ativo&&ativo.id&&o.contains(ativo))?ativo.id:'', ini=null, fim=null;
  if(idF){ try{ ini=ativo.selectionStart; fim=ativo.selectionEnd; }catch(e){} }
  var qual=state.sacola?'sacola':(state.conta?'conta':'');
  var mesma=qual&&qual===gavetaAberta; gavetaAberta=qual;
  var html=fillOverlay(c||ctx());
  var totV=el('sacolaTotal'), altTot=totV?totV.offsetHeight:0;
  if(mesma&&o.firstChild){ var tmp=document.createElement('div'); tmp.innerHTML=html; morphFilhos(o,tmp); }
  else o.innerHTML=html;
  if(mesma){
    var r=o.querySelector('.gaveta-rolar');
    if(r&&r!==rol){ // a parte que rola foi recriada: devolve a posição e não anima a abertura de novo
      o.querySelectorAll('.gaveta,.gaveta-fundo').forEach(function(x){ x.style.animation='none'; });
      r.scrollTop=topoRol;
    }
    // o total encolheu (ex.: trocou Pix por Cartão e saiu a linha do desconto) e a pessoa está no fim da gaveta:
    // segura a altura para a tela não "pular" debaixo do dedo
    var totN=el('sacolaTotal');
    if(r&&totN&&altTot&&totN.offsetHeight<altTot&&topoRol>r.scrollHeight-r.clientHeight){ totN.style.minHeight=altTot+'px'; r.scrollTop=topoRol; }
  }
  if(idF){ var n=el(idF); if(n&&n!==document.activeElement){ try{ n.focus({preventScroll:true}); if(ini!=null) n.setSelectionRange(ini,fim); }catch(e){} } }
}
/* enquanto a pessoa digita: atualiza só o botão de enviar e os avisos, sem recriar os campos */
function patchGaveta(){
  var tmp=document.createElement('div'); tmp.innerHTML=fillOverlay(ctx());
  var novo=tmp.querySelector('#sacolaAcao'), vivo=el('sacolaAcao');
  if(novo&&vivo&&vivo.innerHTML!==novo.innerHTML) vivo.innerHTML=novo.innerHTML;
  var ehCnpj=soNum(state.doc).length>11;
  ['sacolaRazaoBox','contaRazaoBox'].forEach(function(id){ var b=el(id); if(b) b.style.display=ehCnpj?'flex':'none'; });
  patchDoc();
}
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
  else lista.push({chave:chave, chavePreco:p.chave, nome:p.nome, marca:p.marca||'', r:op.r, g:op.g||0, un:op.un||'', fechado:op.fechado||'', liq:op.liq||'', n:1});
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

  if(act==='abrirFolha'){ abrirFolha(t.getAttribute('data-key'), t.getAttribute('data-grupo'), t); return; }
  if(act==='fecharFolha'){ fecharFolha(); return; }
  if(act==='verMais'){ state.limite=(state.limite||POR_PAGINA)+POR_PAGINA; renderCatalogo();
    // o foco vai para o primeiro produto novo (teclado e leitores de tela)
    var cels=document.querySelectorAll('#catalogo .prods > .cel'), alvo=cels[state.limite-POR_PAGINA]; if(alvo){ var b=alvo.querySelector('button,a'); if(b) try{ b.focus({preventScroll:true}); }catch(_){} }
    return; }
  if(act==='loja'){ var id=t.getAttribute('data-loja'); if(id!==state.loja){ state.loja=id; state.cat='Todos'; state.busca=''; state.slide=0; state.limite=POR_PAGINA; state.folha=null; state.sacola=false; state.conta=false; state.enviado=null; state.erroEnvio=''; PRECOS=PRECOS_CACHE[id]||null; renderAll(); carregarPrecos(); } return; }
  if(act==='cat'){ state.cat=t.getAttribute('data-cat'); state.busca=''; state.limite=POR_PAGINA; renderAll(); return; }
  if(act==='limpar'){ state.busca=''; state.cat='Todos'; state.limite=POR_PAGINA; renderAll(); return; }
  if(act==='slide'){ state.slide=+t.getAttribute('data-i'); renderHero(); return; }
  if(act==='slidePrev'){ state.slide=(state.slide+2)%3; renderHero(); return; }
  if(act==='slideNext'){ state.slide=(state.slide+1)%3; renderHero(); return; }

  if(act==='tipo'){
    var g=t.getAttribute('data-grupo'), ti=+t.getAttribute('data-ti'), cc=ctx();
    var membros=cc.todos.filter(function(p){return p.grupo===g;});
    var antes=cc.produtos.find(function(p){return p.grupoInfo&&p.grupoInfo.nome===g;}), novo=membros[ti];
    if(antes&&novo&&antes.chave!==novo.chave){ // mantém a quantidade escolhida, se existir no tipo novo
      var opA=antes.opcoes[Math.min(state.sel[antes.chave]||0,antes.opcoes.length-1)];
      var j=opA?novo.opcoes.findIndex(function(o){return o.r===opA.r;}):-1;
      if(j>=0) state.sel[novo.chave]=j;
    }
    state.tipo[g]=ti; renderCatalogo(); renderDestaques(); renderFolha(); return;
  }
  if(act==='opt'){ var k=t.getAttribute('data-key'); state.sel[k]=+t.getAttribute('data-oi'); renderCatalogo(); renderDestaques(); renderFolha(); return; }
  if(act==='add'){
    e.preventDefault();
    var key=t.getAttribute('data-key');
    var c=ctx(); var prod=c.todos.find(function(p){return p.chave===key;});
    if(prod){ addItem(prod);
      renderOverlay(); syncBadge();
      // feedback no botão (depois do re-render, para não ser desfeito na hora)
      var naFolha=!!t.closest('.folha');
      if(naFolha){ var bt=el('folha').querySelector('[data-act=add]'); if(bt) t=bt; }
      var span=t.querySelector('.add-txt'); if(span){ span.textContent='Adicionado ✓'; t.style.background='#1b7a4b'; setTimeout(function(){ try{span.textContent='Adicionar'; t.style.background='var(--c-escuro)';}catch(_){} },1400); }
      if(naFolha) setTimeout(fecharFolha,700);
    }
    return;
  }

  if(act==='enviarLoja'){ enviarLoja(); return; }
  if(act==='verStatus'){ verStatus(t.getAttribute('data-cod'), t.getAttribute('data-loja')); return; }
  if(act==='novoPedido'){ state.enviado=null; state.sacola=false; renderAll(); return; }
  if(act==='abrirSacola'){ state.folha=null; renderFolha(); state.sacola=true; state.conta=false; state.limparOk=false; renderOverlay(); return; }
  if(act==='fecharSacola'){ state.sacola=false; state.enviado=null; state.erroEnvio=''; renderOverlay(); return; }
  if(act==='abrirConta'){ state.folha=null; renderFolha(); state.conta=true; state.sacola=false; state.apagarOk=false; renderOverlay(); return; }
  if(act==='fecharConta'){ state.conta=false; renderOverlay(); return; }
  if(act==='contaAba'){ state.contaAba=t.getAttribute('data-v'); renderOverlay(); return; }

  if(act==='mais'){ var bi=+t.getAttribute('data-bi'); mudarSacola(function(l){l[bi]=Object.assign({},l[bi],{n:l[bi].n+1});return l;}); renderOverlay(); syncBadge(); return; }
  if(act==='menos'){ var bi2=+t.getAttribute('data-bi'); mudarSacola(function(l){ if(l[bi2].n>1) l[bi2]=Object.assign({},l[bi2],{n:l[bi2].n-1}); else l.splice(bi2,1); return l; }); renderOverlay(); syncBadge(); return; }
  if(act==='tirar'){ var bi3=+t.getAttribute('data-bi'); mudarSacola(function(l){l.splice(bi3,1);return l;}); renderOverlay(); syncBadge(); return; }
  if(act==='limpar2'){ if(state.limparOk){ mudarSacola(function(){return [];}); } else state.limparOk=true; renderOverlay(); syncBadge(); return; }

  if(act==='nf'){ state.nf=t.getAttribute('data-v'); renderOverlay(); return; }
  if(act==='entrega'){ state.entrega=t.getAttribute('data-v'); renderOverlay(); return; }
  if(act==='pag'){ state.pag=t.getAttribute('data-v'); renderOverlay(); return; }

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
  if(act==='busca'){ state.busca=t.value; state.cat='Todos'; state.limite=POR_PAGINA; renderCatalogo(); return; }
  if(act==='campo'){
    var f=t.getAttribute('data-field');
    state[f]=t.value;
    if(f==='nome'||f==='fone'||f==='doc'||f==='razao'||f==='endereco') guardarConta(); else guardarSacola();
    if(state.sacola||state.conta) patchGaveta();
    return;
  }
}
function patchDoc(){
  var doc=soNum(state.doc), ehCnpj=doc.length>11, ok=ehCnpj?cnpjOk(doc):cpfOk(doc);
  var dica=!doc?'Digite só os números.':(ok?(ehCnpj?'CNPJ válido ✓':'CPF válido ✓'):(doc.length<11?'Faltam números.':'Confira os números.'));
  var n=el('docDica'); if(n){ n.textContent=dica; n.style.color=(doc&&ok)?'#1b7a4b':'var(--c-mudo)'; }
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
    itens:itens.map(function(x){ var u=unitItem(x); return {chave:x.chavePreco, nome:x.nome, marca:x.marca, r:x.r, g:x.g, un:x.un, fechado:x.fechado, liquido:x.liq||'', n:x.n, preco:u?u.c:null, atacado:!!(u&&u.at)}; }),
    pagamento:state.pag,
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
  // sempre abrir no topo: sem restaurar a rolagem antiga e sem pular para um #âncora guardado no endereço
  try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch(e){}
  if(location.hash){ try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){} }
  // links internos (#produtos, #visite...) rolam até a seção sem gravar o # no endereço
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href^="#"]'); if(!a) return;
    var id=a.getAttribute('href').slice(1); if(!id) return;
    e.preventDefault();
    requestAnimationFrame(function(){ var alvo=document.getElementById(id); if(!alvo) return; alvo.scrollIntoView({behavior:'smooth',block:'start'});
      // a página pode mudar de altura enquanto rola (filtro, fotos): confere no fim e acerta
      setTimeout(function(){ var t=alvo.getBoundingClientRect().top; if(Math.abs(t-90)>30) alvo.scrollIntoView({block:'start'}); },900); });
  },true);
  // botão "voltar ao topo": fica fora do #app para não ser recriado pelos renders
  var topo=document.createElement('button'); topo.type='button'; topo.className='topo-btn'; topo.setAttribute('aria-label','Voltar ao topo da página'); topo.title='Voltar ao topo';
  topo.innerHTML='<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  topo.addEventListener('click',function(){ var r=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; window.scrollTo({top:0,behavior:r?'auto':'smooth'}); });
  document.body.appendChild(topo);
  var vendoTopo=false;
  function olhaTopo(){ var v=window.scrollY>600&&!state.sacola&&!state.conta&&!state.folha; if(v!==vendoTopo){ vendoTopo=v; topo.classList.toggle('ver',v); topo.tabIndex=v?0:-1; }
    topo.classList.toggle('com-fab',(state.carrinhos[state.loja]||[]).length>0); }
  topo.tabIndex=-1; window.addEventListener('scroll',olhaTopo,{passive:true}); setInterval(olhaTopo,800);
  // celular x computador: no celular o catálogo usa cartões compactos e a folha do produto
  var mq=window.matchMedia?window.matchMedia('(max-width:760px)'):null;
  state.mob=!!(mq&&mq.matches);
  if(mq){ var aoMudar=function(){ var m=mq.matches; if(m!==state.mob){ state.mob=m; if(!m) state.folha=null; renderAll(); } }; if(mq.addEventListener) mq.addEventListener('change',aoMudar); else if(mq.addListener) mq.addListener(aoMudar); }
  // folha: Esc fecha, Tab fica preso dentro dela
  document.addEventListener('keydown',function(e){
    if(!state.folha) return;
    if(e.key==='Escape'){ e.preventDefault(); fecharFolha(); return; }
    if(e.key!=='Tab') return;
    var dlg=document.querySelector('#folha .folha'); if(!dlg) return;
    var f=[].filter.call(dlg.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),function(x){return x.offsetParent!==null;});
    if(!f.length) return;
    var pri=f[0], ult=f[f.length-1];
    if(!dlg.contains(document.activeElement)){ e.preventDefault(); pri.focus(); return; }
    if(e.shiftKey&&document.activeElement===pri){ e.preventDefault(); ult.focus(); }
    else if(!e.shiftKey&&document.activeElement===ult){ e.preventDefault(); pri.focus(); }
  });
  // folha: arrastar a alça (ou o topo) para baixo fecha
  var arr=null;
  document.addEventListener('touchstart',function(e){ var h=e.target.closest&&e.target.closest('.folha-pega'); if(!h||!state.folha) return; var d=document.querySelector('#folha .folha'); arr={y:e.touches[0].clientY, dy:0, d:d}; if(d) d.style.transition='none'; },{passive:true});
  document.addEventListener('touchmove',function(e){ if(!arr) return; arr.dy=Math.max(0,e.touches[0].clientY-arr.y); if(arr.d) arr.d.style.transform='translateY('+arr.dy+'px)'; },{passive:true});
  document.addEventListener('touchend',function(){ if(!arr) return; var a=arr; arr=null; if(a.d){ a.d.style.transition=''; a.d.style.transform=''; } if(a.dy>90) fecharFolha(); },{passive:true});
  carregar();
  var app=el('app');
  app.addEventListener('click', onClick);
  ['pointerdown','touchstart','keydown'].forEach(function(t){ document.addEventListener(t,function(){ ultimoToque=Date.now(); },{passive:true,capture:true}); });
  app.addEventListener('input', onInput);
  renderAll();
  window.scrollTo(0,0); requestAnimationFrame(function(){ window.scrollTo(0,0); });
  carregarPrecos();
  // relógio para "aberto agora"
  relogio=setInterval(function(){ state.agora=Date.now(); if(Date.now()-ultimoToque<2000) return; var a=document.activeElement; if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; renderAll(); }, 60000);
  // carrossel automático
  var reduz=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduz) slideTimer=setInterval(function(){ if(document.hidden||Date.now()-ultimoToque<8000) return; state.slide=(state.slide+1)%3; renderHero(); }, 7000);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
