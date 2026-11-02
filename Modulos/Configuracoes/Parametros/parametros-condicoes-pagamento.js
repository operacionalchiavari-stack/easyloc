// Condições de pagamento do catálogo (nov/2026): Parâmetros > Comercial.
// O decorador escolhe uma delas ao enviar o pedido pelo catálogo; o Comercial aplica (ou ajusta) no Financeiro do pedido.
// Tabela comercial_condicoes_pagamento (grava quem tem configuracoes.empresa.editar).
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FORMAS = [['PIX', 'PIX'], ['Boleto', 'Boleto'], ['Cartao', 'Cartão'], ['Transferencia', 'Transferência'], ['Dinheiro', 'Dinheiro']];

  // texto que o decorador vê (mesma regra do catálogo, catalogo-projetos.mjs: resumoCondicao)
  function resumo(c) {
    const e = Number(c.entrada_pct) || 0, n = Number(c.parcelas) || 0, forma = (FORMAS.find(([v]) => v === c.forma) || [, c.forma])[1];
    let t = e >= 100 ? 'À vista' : (e > 0 ? e + '% de entrada + ' : '') + (n === 1 ? (e > 0 ? 'saldo em 1 parcela' : '1 parcela') : n + ' parcelas mensais');
    if (c.quitar_dias_antes != null && e < 100) t += ', quitado até ' + c.quitar_dias_antes + ' dia(s) antes do evento';
    return t + ' · ' + forma;
  }
  window.resumoCondicaoPagamento = resumo;

  window.carregarCondicoesPagamento = async function (host, empresa) {
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const card = document.createElement('section');
    card.className = 'pr-card pr-cond-card';
    card.innerHTML = '<h3>Condições de pagamento do catálogo</h3>' +
      '<p class="pr-ajuda">O decorador escolhe uma destas ao enviar o pedido pelo catálogo. O pedido chega na aba "Catálogo" da Central de Pedidos e o Comercial aplica a condição (ou ajusta) no Financeiro antes de salvar.</p>' +
      '<div data-lista></div>' +
      (pode ? '<button type="button" class="btn secondary" data-nova>+ Nova condição</button>' : '') +
      '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span></div>';
    host.append(card);
    const status = card.querySelector('[role=status]'), lista = card.querySelector('[data-lista]');
    const aviso = (t, erro) => { status.textContent = t; status.classList.toggle('erro', !!erro); };
    let itens = [];

    async function carregar() {
      const { data, error } = await sb.from('comercial_condicoes_pagamento').select('*').eq('empresa_id', empresa).order('ordem').order('nome');
      if (error) { aviso('Não foi possível carregar: ' + error.message, true); return; }
      itens = data || []; pintar();
    }
    function linha(c, i) {
      const dis = pode ? '' : ' disabled';
      return '<li class="pr-cond' + (c.ativo ? '' : ' inativo') + '" data-id="' + c.id + '">' +
        '<span class="pr-mc-ordem">' + (pode ? '<button type="button" data-subir aria-label="Subir"' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-descer aria-label="Descer"' + (i < itens.length - 1 ? '' : ' disabled') + '>↓</button>' : '') + '</span>' +
        '<div class="pr-cond-campos">' +
          '<label class="pr-cond-nome">Nome<input data-campo="nome" value="' + esc(c.nome) + '" maxlength="80"' + dis + '></label>' +
          '<label>Entrada (%)<input data-campo="entrada_pct" type="number" min="0" max="100" step="1" value="' + esc(c.entrada_pct) + '"' + dis + '></label>' +
          '<label>Parcelas do saldo<input data-campo="parcelas" type="number" min="0" max="24" step="1" value="' + esc(c.parcelas) + '"' + dis + '></label>' +
          '<label>Quitar até (dias antes do evento)<input data-campo="quitar_dias_antes" type="number" min="0" max="365" step="1" placeholder="sem limite" value="' + esc(c.quitar_dias_antes ?? '') + '"' + dis + '></label>' +
          '<label>Forma<select data-campo="forma"' + dis + '>' + FORMAS.map(([v, r]) => '<option value="' + v + '"' + (c.forma === v ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>' +
          '<p class="pr-cond-resumo">' + esc(resumo(c)) + '</p>' +
        '</div>' +
        (pode ? '<span class="pr-cond-acoes"><label class="pr-check"><input type="checkbox" data-ativo' + (c.ativo ? ' checked' : '') + '><span>Aparece</span></label><button type="button" class="pr-cond-excluir" data-excluir aria-label="Excluir">Excluir</button></span>' : (c.ativo ? '' : '<small>desativada</small>')) +
        '</li>';
    }
    function pintar() {
      lista.innerHTML = itens.length ? '<ul class="pr-cond-lista">' + itens.map(linha).join('') + '</ul>' : '<p class="pr-ajuda">Nenhuma condição cadastrada. Sem condições, o decorador envia o pedido sem escolher a forma de pagamento.</p>';
    }
    async function salvar(id, campos) {
      const atual = itens.find((x) => x.id === id) || {}, novo = { ...atual, ...campos };
      if (String(novo.nome || '').trim().length < 3) { aviso('O nome precisa de pelo menos 3 letras.', true); pintar(); return; }
      if (Number(novo.entrada_pct) < 100 && Number(novo.parcelas) < 1) { aviso('Sem entrada de 100%, informe pelo menos 1 parcela.', true); pintar(); return; }
      const { error } = await sb.from('comercial_condicoes_pagamento').update(campos).eq('id', id).eq('empresa_id', empresa);
      if (error) { aviso(/duplicate|unique/i.test(error.message) ? 'Já existe uma condição com esse nome.' : 'Não foi possível salvar: ' + error.message, true); await carregar(); return; }
      Object.assign(atual, campos); aviso('Salvo.');
      const li = lista.querySelector('[data-id="' + id + '"]'); if (li) { li.querySelector('.pr-cond-resumo').textContent = resumo(atual); li.classList.toggle('inativo', !atual.ativo); }
    }
    lista.addEventListener('change', async (e) => {
      const li = e.target.closest('[data-id]'); if (!li) return;
      const id = li.dataset.id;
      if (e.target.matches('[data-ativo]')) return salvar(id, { ativo: e.target.checked });
      const campo = e.target.dataset.campo; if (!campo) return;
      let v = e.target.value;
      if (campo === 'nome') v = v.trim();
      else if (campo === 'forma') v = v;
      else if (campo === 'quitar_dias_antes') v = v === '' ? null : Math.max(0, Math.round(Number(v)));
      else v = Math.max(0, Math.round(Number(v) || 0));
      if (campo === 'entrada_pct') v = Math.min(100, v);
      if (campo === 'parcelas') v = Math.min(24, v);
      await salvar(id, { [campo]: v });
    });
    lista.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-id]'); if (!li) return;
      const i = itens.findIndex((x) => x.id === li.dataset.id);
      if (e.target.matches('[data-subir],[data-descer]')) {
        const j = e.target.matches('[data-subir]') ? i - 1 : i + 1; if (j < 0 || j >= itens.length) return;
        [itens[i], itens[j]] = [itens[j], itens[i]];
        await Promise.all(itens.map((x, k) => (x.ordem === k + 1 ? null : sb.from('comercial_condicoes_pagamento').update({ ordem: k + 1 }).eq('id', x.id).then(() => { x.ordem = k + 1; }))));
        pintar(); aviso('Ordem salva.');
      }
      if (e.target.matches('[data-excluir]')) {
        const ok = typeof window.confirmarGlobal === 'function' ? await window.confirmarGlobal('Excluir a condição "' + itens[i].nome + '"? Pedidos que já usaram continuam com ela gravada.', 'Excluir condição', { confirmarTexto: 'Excluir', cancelarTexto: 'Voltar' }) : confirm('Excluir esta condição?');
        if (!ok) return;
        const { error } = await sb.from('comercial_condicoes_pagamento').delete().eq('id', itens[i].id).eq('empresa_id', empresa);
        if (error) { aviso('Não foi possível excluir: ' + error.message, true); return; }
        itens.splice(i, 1); pintar(); aviso('Excluída.');
      }
    });
    card.querySelector('[data-nova]')?.addEventListener('click', async () => {
      let n = itens.length + 1, nome = 'Nova condição ' + n;
      while (itens.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) nome = 'Nova condição ' + (++n);
      const { error } = await sb.from('comercial_condicoes_pagamento').insert({ empresa_id: empresa, nome, entrada_pct: 50, parcelas: 1, quitar_dias_antes: 5, forma: 'PIX', ordem: itens.length + 1 });
      if (error) { aviso('Não foi possível criar: ' + error.message, true); return; }
      await carregar(); aviso('Condição criada. Ajuste os campos.');
      lista.querySelector('li:last-child [data-campo="nome"]')?.focus();
    });
    await carregar();
  };
})();
