/* GET /api/painel/pedidos  (Authorization: Bearer <token da loja>)
   O Balcão busca os pedidos que ainda não recebeu. Depois confirma em /api/painel/status. */
import { json, lojaDoToken } from '../../_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const loja = lojaDoToken(env, request);
  if (!loja) return json({ erro: 'token' }, 401);

  const pedidos = [];
  let cursor;
  do {
    const r = await env.LOJA.list({ prefix: 'fila:' + loja + ':', cursor, limit: 100 });
    for (const k of r.keys) {
      const id = k.name.slice(('fila:' + loja + ':').length);
      const p = await env.LOJA.get('ped:' + loja + ':' + id, { type: 'json' });
      if (p) pedidos.push(p);
      else await env.LOJA.delete(k.name); // pedido expirou: limpa a fila
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && pedidos.length < 200);

  pedidos.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  return json({ loja, pedidos });
}
