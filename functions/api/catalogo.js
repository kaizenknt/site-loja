/* GET /api/catalogo?loja=dlu
   Leitura pública: o site busca os preços e a disponibilidade que o Balcão publicou.
   Resposta no mesmo formato de precos.json: { itens:{chave:{kg}|{op}}, ... }. */
import { json, CORS_PUBLICO, lojaValida } from '../_lib.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_PUBLICO });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const loja = lojaValida(url.searchParams.get('loja')) || 'dlu';
  let dados = null;
  try { dados = await env.LOJA.get('cat:' + loja, { type: 'json' }); } catch (e) { dados = null; }
  if (!dados) {
    // ainda não publicado pelo Balcão: o site cai no precos.json (exemplo) sozinho
    return json({ loja, itens: {}, indisponivel: [], vazio: true, atualizado: null },
      200, { ...CORS_PUBLICO, 'cache-control': 'public, max-age=30' });
  }
  return json({ loja, ...dados },
    200, { ...CORS_PUBLICO, 'cache-control': 'public, max-age=30' });
}
