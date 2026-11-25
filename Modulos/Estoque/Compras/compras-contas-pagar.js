/* Compras > Contas a pagar: mesmos títulos e desenho do Financeiro; consulta limitada no servidor. */
(() => {
  'use strict';
  const S = {pagar:[], contas:[], cats:[], fornecedores:[], clientes:[], cartoes:[], faturas:[], fechParcelas:[], filtroP:{busca:'',status:'abertos',cat:'',conta:'',prazo:''}};
  const host = () => document.getElementById('purchasePayablesList');
  let C, carregando, ativo = false, carregado = false;
  const unicos = (lista, chave) => [...new Map(lista.filter(x => x[chave]).map(x => [x[chave], x])).values()];
  async function contexto() {
    await window.AcervoComprasAuth?.ready;
    const empresa = window.__CONTEXT?.empresa_id, sb = window.supabaseClient;
    if (!empresa || !sb) throw Error('Entre no sistema para consultar as contas.');
    return {sb, empresa};
  }
  function pintar() { window.FinanceiroPagarLista.render(C); }
  async function carregar() {
    if (carregando) return carregando;
    carregando = (async () => {
      try {
        const ctx = await contexto();
        const {data, error} = await ctx.sb.rpc('compras_contas_pagar', {p_empresa:ctx.empresa});
        if (error) throw error;
        S.pagar = data || [];
        S.contas = unicos(S.pagar, 'conta_id').map(t => ({id:t.conta_id, nome:t.conta_nome, titular_documento:t.conta_doc, pix_chave:t.conta_pix}));
        S.cats = unicos(S.pagar, 'categoria_id').map(t => ({id:t.categoria_id, nome:t.categoria_nome, tipo:'saida', ativo:t.categoria_ativa}));
        S.fornecedores = unicos(S.pagar, 'fornecedor_id').map(t => ({id:t.fornecedor_id, foto_url:t.fornecedor_foto}));
        S.cartoes = unicos(S.pagar, 'cartao_id').map(t => ({id:t.cartao_id, nome:t.cartao_nome, final:t.cartao_final, conta_id:t.conta_id}));
        S.faturas = unicos(S.pagar, 'fatura_id').map(t => ({id:t.fatura_id, cartao_id:t.cartao_id, vencimento:t.vencimento, virada:t.fatura_virada, conferida_em:t.fatura_conferida_em}));
        S.fechParcelas = unicos(S.pagar, 'fechamento_parcela_id').map(t => ({id:t.fechamento_parcela_id, fechamento_id:t.fechamento_id, numero:t.fechamento_numero, referencia:t.fechamento_referencia, nf_numero:t.fechamento_nf_numero}));
        const badge = document.getElementById('purchasePayablesBadge');
        const n = S.pagar.filter(t => C.vencido(t) || (t.requer_aprovacao && t.aprovacao === 'pendente' && t.status !== 'cancelado')).length;
        if (badge) { badge.textContent = n; badge.hidden = !n; }
        carregado = true; pintar();
      } catch (e) {
        carregado = false;
        host().innerHTML = '<div class="fin-vazio" role="alert">Não foi possível carregar as contas de Compras: ' + C.esc(e.message || e) + ' <button type="button" class="fin-btn peq claro" data-cp-tentar>Tentar novamente</button></div>';
      }
    })();
    try { await carregando; } finally { carregando = null; }
  }
  function detalhes(id) {
    const t = S.pagar.find(x => x.id === id); if (!t) return;
    const {esc, dataBr, brl, statusP} = C, [cls, rot] = statusP(t);
    const d = document.createElement('dialog'); d.className = 'fin-modal';
    d.innerHTML = '<div class="fin-modal-caixa"><header><h3>Conta a pagar · Compras</h3><button type="button" class="fin-x" aria-label="Fechar">×</button></header><div class="fin-modal-corpo"><h4>' + esc(t.fornecedor_nome || 'Fornecedor') + '</h4><p>' + esc(t.descricao) + '</p><p><span class="fin-status ' + cls + '">' + esc(rot) + '</span></p><dl class="cp-detalhes">' +
      [['Pedido de compra', 'PC-' + String(t.compra_numero).padStart(6,'0')], ['Parcela', t.parcela + '/' + t.parcelas], ['Vencimento', dataBr(t.vencimento)], ['Programado para', t.programado_para ? dataBr(t.programado_para) : '—'], ['Valor', brl(t.valor)], ['Pago', brl(t.pago)], ['Em aberto', brl(t.aberto)], ['Documento', t.documento || '—'], ['Forma', t.forma || '—']].map(([k,v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') +
      '</dl>' + (t.observacoes ? '<h4>Observações</h4><p class="cp-texto">' + esc(t.observacoes) + '</p>' : '') + (t.comentario ? '<h4>Comentário</h4><p class="cp-texto">' + esc(t.comentario) + '</p>' : '') + '</div><footer><a class="fin-btn peq claro" href="?pedido=' + encodeURIComponent(t.origem_id) + '">Abrir pedido de compra</a><button type="button" class="fin-btn" data-cp-fechar>Fechar</button></footer></div>';
    d.querySelectorAll('button').forEach(b => b.onclick = () => d.close());
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
  }
  async function iniciar() {
    if (!host()) return;
    C = {...window.FinanceiroPagarLista.contexto(S, host()), somenteConsulta:true, detalhesPagar:detalhes};
    window.FinanceiroComentarios.ligar(host(), {contexto, obter:(tipo,id) => tipo === 'pagar' ? S.pagar.find(t => t.id === id) : null});
    host().addEventListener('click', e => {
      if (e.target.closest('[data-cp-tentar]')) { carregar(); return; }
      if (e.target.closest('button,a,input,select,textarea,label,.fin-com-ed')) return;
      const tr = e.target.closest('[data-p-linha]'); if (tr) detalhes(tr.dataset.pLinha);
    });
    window.addEventListener('compras-aba', e => { ativo = e.detail === 'contas-pagar'; if (ativo) carregar(); });
    window.addEventListener('compras-contas-atualizar', () => { carregado = false; if (ativo) carregar(); });
    window.addEventListener('focus', () => { if (ativo && !host().querySelector('.fin-com-ed')) carregar(); });
    ativo = document.querySelector('[data-pv-tab="contas-pagar"]')?.classList.contains('active');
    // Consulta inicial também atualiza o indicador da aba, sem pedir acesso ao Financeiro.
    if (!carregado) await carregar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
