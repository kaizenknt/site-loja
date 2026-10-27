/* POST /api/painel/status  (Authorization: Bearer <token da loja>)
   Corpo: { id, status, numeroLoja? }  ou  { lista: [ {id, status, numeroLoja?}, ... ] }
   "recebido" tira o pedido da fila; os demais só atualizam o que o cliente vê. */
import { json, lojaDoToken, filaRemover } from '../../_lib.js';

const VALIDOS = ['recebido', 'separando', 'pronto', 'entregue', 'cancelado'];

export async function onRequestPost(context) {
  const { request, env } = context;
  const loja = lojaDoToken(env, request);
  if (!loja) return json({ erro: 'token' }, 401);

  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: 'json' }, 400); }
  const lista = Array.isArray(b.lista) ? b.lista.slice(0, 200) : [b];
  const feitos = [];

  for (const x of lista) {
    const id = String(x && x.id || '').slice(0, 60);
    const status = String(x && x.status || '');
    if (!id || !VALIDOS.includes(status)) continue;
    const chave = 'ped:' + loja + ':' + id;
    const p = await env.LOJA.get(chave, { type: 'json' });
    if (!p) continue;
    p.status = status;
    p.atualizadoEm = new Date().toISOString();
    if (x.numeroLoja != null) p.numeroLoja = Number(x.numeroLoja) || null;
    await env.LOJA.put(chave, JSON.stringify(p), { expirationTtl: 14 * 86400 });
    feitos.push(id);
  }
  await filaRemover(env, loja, feitos); // já estão no Balcão: saem da fila (uma gravação só)
  return json({ ok: true, atualizados: feitos.length });
}
