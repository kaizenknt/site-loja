/* GET /api/status?loja=dlu&codigo=7K3Q9
   O cliente acompanha o pedido pelo código. Mostra só a situação, sem dados pessoais. */
import { json, CORS_PUBLICO, lojaValida, texto } from '../_lib.js';

const ROTULO = {
  novo: 'Recebido, aguardando a loja',
  recebido: 'A loja recebeu seu pedido',
  separando: 'Separando e pesando',
  pronto: 'Pronto para retirar / sair para entrega',
  entregue: 'Concluído',
  cancelado: 'Cancelado'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_PUBLICO });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const loja = lojaValida(url.searchParams.get('loja'));
  const codigo = texto(url.searchParams.get('codigo'), 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!loja || !codigo) return json({ erro: 'dados' }, 400, CORS_PUBLICO);

  let id = null;
  try { id = await env.LOJA.get('cod:' + loja + ':' + codigo); } catch (e) { id = null; }
  if (!id) return json({ erro: 'nao_encontrado' }, 404, CORS_PUBLICO);

  let ped = null;
  try { ped = await env.LOJA.get('ped:' + loja + ':' + id, { type: 'json' }); } catch (e) { ped = null; }
  if (!ped) return json({ erro: 'nao_encontrado' }, 404, CORS_PUBLICO);

  return json({
    codigo, status: ped.status, rotulo: ROTULO[ped.status] || ped.status,
    criadoEm: ped.criadoEm, atualizadoEm: ped.atualizadoEm || ped.criadoEm,
    numero: ped.numeroLoja || null
  }, 200, CORS_PUBLICO);
}
