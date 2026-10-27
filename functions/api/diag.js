/* GET /api/diag — diagnóstico da ponte, sem mostrar segredos.
   Abra no navegador (https://<site>/api/diag) para ver se o KV e os tokens estão ligados. */
import { json } from '../_lib.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const out = { ok: true, versao: String(env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || '?', host: new URL(request.url).host, hora: new Date().toISOString() };
  // KV
  out.kvLigado = !!env.LOJA;
  if (env.LOJA) {
    try { await env.LOJA.get('diag:teste'); out.kvLeitura = 'ok'; } catch (e) { out.kvLeitura = 'falhou: ' + String(e && e.message || e).slice(0, 160); out.ok = false; }
    try { await env.LOJA.list({ prefix: 'fila:', limit: 1 }); out.kvLista = 'ok'; } catch (e) { out.kvLista = 'falhou: ' + String(e && e.message || e).slice(0, 160); out.ok = false; }
  } else out.ok = false;
  // tokens (só diz quais lojas têm token, nunca o valor)
  const bruto = env.PAINEL_TOKENS;
  out.tokensDefinido = bruto != null && String(bruto).trim() !== '';
  try {
    const t = JSON.parse(String(bruto || '{}').replace(/[“”„″«»]/g, '"'));
    out.tokensLojas = Object.keys(t).filter(k => t[k]);
    out.tokensFormato = 'json ok';
  } catch (e) { out.tokensFormato = 'não é JSON válido'; }
  if (!out.tokensLojas || !out.tokensLojas.length) out.ok = false;
  return json(out);
}
