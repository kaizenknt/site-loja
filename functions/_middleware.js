/* Garante que o celular sempre receba a versão nova do site, inclusive nos domínios próprios.
   - Na página (HTML): troca o ?v=... de estilo.css, catalogo.js e app.js pelo código da publicação atual
     (CF_PAGES_COMMIT_SHA), então cada publicação nova tem endereços novos e nada antigo fica guardado.
   - Página com "no-store": o navegador e o cache da Cloudflare não guardam o HTML.
   As rotas /api/* seguem direto. */
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return next();
  const res = await next();
  const tipo = res.headers.get('content-type') || '';
  if (!tipo.includes('text/html')) return res;
  const ver = String(env.CF_PAGES_COMMIT_SHA || '').slice(0, 12) || String(Date.now());
  let html = await res.text();
  html = html.replace(/(href|src)="((?:estilo\.css|dados\/catalogo\.js|app\.js))(\?v=[^"]*)?"/g, (_, a, f) => `${a}="${f}?v=${ver}"`);
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'no-store, max-age=0');
  h.delete('content-length');
  h.delete('etag');
  return new Response(html, { status: res.status, statusText: res.statusText, headers: h });
}
