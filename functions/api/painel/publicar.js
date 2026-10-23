/* POST /api/painel/publicar  (Authorization: Bearer <token da loja>)
   O Balcão publica os preços e a disponibilidade da loja.
   Corpo: { itens: { "<chave do site>": { kg: centavos } | { op: { "90 g": centavos } } }, indisponivel: ["<chave>", ...] } */
import { json, lojaDoToken } from '../../_lib.js';

function limparPrecos(itens) {
  const out = {};
  let n = 0;
  for (const [chave, v] of Object.entries(itens && typeof itens === 'object' ? itens : {})) {
    if (n >= 2000) break;
    const k = String(chave).slice(0, 120);
    if (!k || !v || typeof v !== 'object') continue;
    const e = {};
    if (v.kg != null && isFinite(v.kg) && v.kg > 0) e.kg = Math.round(v.kg);
    if (v.op && typeof v.op === 'object') {
      const op = {};
      for (const [r, c] of Object.entries(v.op)) if (isFinite(c) && c > 0) op[String(r).slice(0, 40)] = Math.round(c);
      if (Object.keys(op).length) e.op = op;
    }
    if (e.kg != null || e.op) { out[k] = e; n++; }
  }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const loja = lojaDoToken(env, request);
  if (!loja) return json({ erro: 'token' }, 401);

  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: 'json' }, 400); }
  const itens = limparPrecos(b.itens);
  const indisponivel = (Array.isArray(b.indisponivel) ? b.indisponivel : []).slice(0, 2000).map(x => String(x).slice(0, 120));
  const dados = { moeda: 'BRL', itens, indisponivel, atualizado: new Date().toISOString() };
  await env.LOJA.put('cat:' + loja, JSON.stringify(dados));
  return json({ ok: true, loja, precos: Object.keys(itens).length, indisponiveis: indisponivel.length });
}
