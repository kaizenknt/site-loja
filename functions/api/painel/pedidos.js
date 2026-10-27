/* GET /api/painel/pedidos  (Authorization: Bearer <token da loja>)
   O Balcão busca os pedidos que ainda não recebeu. Depois confirma em /api/painel/status.
   A fila fica numa chave só ("filaidx:<loja>"): o Balcão consulta a cada 30 s e o KV grátis só permite 1.000 list() por dia. */
import { json, lojaDoToken, lerFila, gravarFila } from '../../_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const loja = lojaDoToken(env, request);
  if (!loja) return json({ erro: 'token' }, 401);

  let ids = await lerFila(env, loja);
  if (ids === null) {
    // primeira vez depois da mudança: traz o que estava na fila antiga (um list só) e passa a usar a lista
    ids = [];
    try {
      let cursor;
      do {
        const r = await env.LOJA.list({ prefix: 'fila:' + loja + ':', cursor, limit: 1000 });
        for (const k of r.keys) ids.push(k.name.slice(('fila:' + loja + ':').length));
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
    } catch (e) { /* limite de list do dia: começa a fila vazia, os pedidos novos já entram na lista */ }
    await gravarFila(env, loja, ids);
  }

  const pedidos = [], vivos = [];
  for (const id of ids.slice(0, 200)) {
    const p = await env.LOJA.get('ped:' + loja + ':' + id, { type: 'json' });
    if (p) { pedidos.push(p); vivos.push(id); }
  }
  if (vivos.length !== Math.min(ids.length, 200)) await gravarFila(env, loja, vivos.concat(ids.slice(200))); // tira os que expiraram
  pedidos.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  return json({ loja, pedidos });
}
