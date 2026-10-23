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
    if (e.kg && v.fardo != null && isFinite(v.fardo) && v.fardo >= 0 && v.fardo <= 100) e.fardo = Math.round(v.fardo); // kg do fardo (0 = não vende em fardo)
    if (e.kg && v.kgAt != null && isFinite(v.kgAt) && v.kgAt > 0 && v.kgAt < e.kg) e.kgAt = Math.round(v.kgAt); // atacado por quilo
    if (v.op && typeof v.op === 'object') {
      const op = {};
      for (const [r, c] of Object.entries(v.op)) if (isFinite(c) && c > 0) op[String(r).slice(0, 40)] = Math.round(c);
      if (Object.keys(op).length) e.op = op;
      if (e.op && v.opAt && typeof v.opAt === 'object') { // atacado por tamanho
        const at = {};
        for (const [r, c] of Object.entries(v.opAt)) { const k = String(r).slice(0, 40); if (e.op[k] && isFinite(c) && c > 0 && c < e.op[k]) at[k] = Math.round(c); }
        if (Object.keys(at).length) e.opAt = at;
      }
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
  const a = b.atacado && typeof b.atacado === 'object' ? b.atacado : {};
  const minKg = Number(a.minKg), minUn = Number(a.minUn);
  const atacado = { ativo: a.ativo !== false, minKg: minKg > 0 && minKg <= 1000 ? minKg : 10, minUn: minUn >= 1 && minUn <= 10000 ? Math.round(minUn) : 12 };
  // desconto por forma de pagamento (ex.: 5% no Pix ou dinheiro acima de R$ 100)
  const d = b.desconto && typeof b.desconto === 'object' ? b.desconto : { ativo: true, pct: 5, min: 10000 }; // Balcão antigo não manda: vale o padrão da loja
  const pct = Number(d.pct), min = Number(d.min);
  const formas = (Array.isArray(d.formas) ? d.formas : ['pix', 'dinheiro']).filter(f => ['pix', 'dinheiro', 'cartao'].includes(f));
  const desconto = { ativo: d.ativo !== false && pct > 0, pct: pct > 0 && pct <= 30 ? pct : 0, min: min >= 0 && min <= 10000000 ? Math.round(min) : 10000, formas };
  const dados = { moeda: 'BRL', itens, indisponivel, atacado, desconto, atualizado: new Date().toISOString() };
  await env.LOJA.put('cat:' + loja, JSON.stringify(dados));
  return json({ ok: true, loja, precos: Object.keys(itens).length, indisponiveis: indisponivel.length });
}
