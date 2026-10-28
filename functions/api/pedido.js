/* POST /api/pedido
   O site envia o pedido montado na sacola. A ponte guarda numa fila por loja;
   o Balcão da loja vem buscar. Nada aqui alcança o computador da loja. */
import { filaAdicionar, json, lojaValida, limitePedido, texto, soNum, codigoCurto, idPedido } from '../_lib.js';

function mesmaOrigem(request) {
  const origem = request.headers.get('origin');
  if (!origem) return true; // pedidos sem Origin (não-navegador) passam; o resto é barrado abaixo
  try { return new URL(origem).host === new URL(request.url).host; } catch (e) { return false; }
}

function limparItens(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 120).map(i => ({
    chave: texto(i && i.chave, 80),
    nome: texto(i && i.nome, 120),
    marca: texto(i && i.marca, 60),
    opcao: texto(i && (i.r || i.opcao), 40),
    gramas: Math.max(0, Math.min(999999, Math.round(Number(i && i.g) || 0))),
    unidade: texto(i && i.un, 20),
    fechado: texto(i && i.fechado, 40),
    liquido: texto(i && i.liquido, 20),
    quantidade: Math.max(1, Math.min(9999, Math.round(Number(i && i.n) || 1))),
    preco: i && i.preco != null && isFinite(i.preco) ? Math.max(0, Math.round(Number(i.preco))) : null,
    atacado: !!(i && i.atacado)
  })).filter(i => i.nome || i.chave);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!mesmaOrigem(request)) return json({ erro: 'origem' }, 403);

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  if (!(await limitePedido(env, ip))) return json({ erro: 'muitos', mensagem: 'Você enviou muitos pedidos seguidos. Aguarde alguns minutos.' }, 429);

  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: 'json' }, 400); }

  if (texto(b.hp, 20)) return json({ ok: true, codigo: codigoCurto() }); // campo-isca: bot preencheu, descarta em silêncio

  const loja = lojaValida(b.loja);
  if (!loja) return json({ erro: 'loja', mensagem: 'Loja inválida.' }, 400);

  const itens = limparItens(b.itens);
  if (!itens.length) return json({ erro: 'itens', mensagem: 'O pedido está sem itens.' }, 400);

  const c = b.cliente && typeof b.cliente === 'object' ? b.cliente : {};
  const entrega = b.entrega && typeof b.entrega === 'object' ? b.entrega : {};
  const codigo = codigoCurto();
  const id = idPedido();
  const subtotal = itens.reduce((s, i) => (i.preco != null ? s + i.preco * i.quantidade : s), 0);
  const algumSemPreco = itens.some(i => i.preco == null);
  const pagamento = ['pix', 'dinheiro', 'cartao'].includes(String(b.pagamento)) ? String(b.pagamento) : '';
  // o desconto é conferido aqui de novo: o valor que o navegador manda não vale sozinho
  let desconto = 0, descontoPct = 0;
  try {
    const cat = await env.LOJA.get('cat:' + (lojaValida(b.loja) || ''), { type: 'json' });
    const r = cat && cat.desconto ? cat.desconto : { ativo: true, pct: 5, min: 10000, formas: ['pix', 'dinheiro'] };
    // varejo: 5% a partir do mínimo. Se algum item está no preço de atacado, a compra é de atacado e não tem o desconto.
    const base = itens.some(i => i.atacado) ? 0 : subtotal;
    if (r.ativo && r.pct > 0 && r.formas.includes(pagamento) && base > 0 && base >= r.min) { descontoPct = r.pct; desconto = Math.round(base * r.pct / 100); }
  } catch (e) { desconto = 0; }
  const total = subtotal - desconto;

  const registro = {
    id, codigo, loja, status: 'novo', criadoEm: new Date().toISOString(),
    cliente: { nome: texto(c.nome, 80), telefone: soNum(c.telefone).slice(0, 15), doc: soNum(c.doc).slice(0, 14), razao: texto(c.razao, 80) },
    nf: !!b.nf,
    entrega: (function () {
      const tipo = /entrega|uber|lalamove/i.test(texto(entrega.tipo, 60)) ? 'entrega' : 'retirada';
      return { tipo, endereco: tipo === 'entrega' ? texto(entrega.endereco, 300) : '', meio: texto(entrega.meio, 60) || (tipo === 'entrega' ? 'Lalamove ou Uber' : 'Retirar na loja') };
    })(),
    obs: texto(b.obs, 1000),
    itens,
    pagamento, subtotal: subtotal || null, desconto, descontoPct,
    total: algumSemPreco ? null : total,
    totalParcial: total > 0 ? total : null,
    mensagem: texto(b.mensagem, 4000)
  };

  try {
    // guarda o pedido (14 dias) e um atalho pelo código, para o cliente acompanhar
    await env.LOJA.put('ped:' + loja + ':' + id, JSON.stringify(registro), { expirationTtl: 14 * 86400 });
    await env.LOJA.put('cod:' + loja + ':' + codigo, id, { expirationTtl: 14 * 86400 });
    await filaAdicionar(env, loja, id); // aguardando o Balcão buscar
  } catch (e) {
    return json({ erro: 'guardar', mensagem: 'Não consegui registrar o pedido agora. Tente de novo ou use o WhatsApp.' }, 500);
  }

  return json({ ok: true, codigo, id, loja });
}
