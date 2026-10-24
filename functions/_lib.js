/* Funções compartilhadas da ponte na nuvem (Cloudflare Pages Functions).
   A ponte guarda, por loja, o catálogo com preços (publicado pelo Balcão) e a
   fila de pedidos do site. O computador da loja não fica exposto: o Balcão vem
   buscar os pedidos e publicar os preços de fora para dentro. */

export const LOJAS = ['dlu', 'vks'];

export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

// o catálogo é leitura pública (o site busca); liberamos CORS só para ele
export const CORS_PUBLICO = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

export function lojaValida(l) {
  l = String(l || '').toLowerCase();
  return LOJAS.includes(l) ? l : null;
}

// token do painel: o Balcão se identifica com "Authorization: Bearer <token>".
// Os tokens ficam na variável de ambiente PAINEL_TOKENS (JSON { "dlu": "...", "vks": "..." }).
export function lojaDoToken(env, req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : '';
  if (!token) return null;
  let tokens = {};
  // aceita o segredo colado do celular (aspas curvas, espaços) e também o formato dlu=...;vks=...
  const bruto = String(env.PAINEL_TOKENS || '{}').replace(/[\u201C\u201D\u201E\u2033\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'").trim();
  try { tokens = JSON.parse(bruto); } catch (e) {
    tokens = {};
    for (const par of bruto.replace(/[{}"']/g, '').split(/[,;\n]/)) {
      const m2 = par.match(/^\s*(\w+)\s*[:=]\s*(\S+)\s*$/);
      if (m2) tokens[m2[1].toLowerCase()] = m2[2];
    }
  }
  for (const l of LOJAS) {
    const esperado = tokens[l];
    if (esperado && timingSafeEqual(token, esperado)) return l;
  }
  return null;
}

// comparação em tempo constante (evita descobrir o token por tempo de resposta)
export function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// limite simples de pedidos por IP (anti-abuso), guardado no próprio KV
export async function limitePedido(env, ip) {
  const chave = 'rl:' + ip;
  let n = 0;
  try { n = Number(await env.LOJA.get(chave)) || 0; } catch (e) { n = 0; }
  if (n >= 8) return false; // no máximo 8 pedidos por janela de 10 min por IP
  try { await env.LOJA.put(chave, String(n + 1), { expirationTtl: 600 }); } catch (e) {}
  return true;
}

export function texto(v, max) {
  let t = String(v == null ? '' : v).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max).trim() : t;
}

export function soNum(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

export function codigoCurto() {
  // código curto e legível para o cliente acompanhar o pedido (ex.: "7K3Q9")
  const alfabeto = 'ACDEFGHJKLMNPQRSTUVWXYZ2345679';
  let s = '';
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  for (let i = 0; i < 5; i++) s += alfabeto[a[i] % alfabeto.length];
  return s;
}

export function idPedido() {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}
