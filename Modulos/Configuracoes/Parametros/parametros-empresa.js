(function () {
  'use strict';
  const root = document.getElementById('parametrosEmpresa');
  const status = document.getElementById('empresaParametrosStatus');
  const salvar = document.getElementById('salvarEmpresaParametros');
  const abas = [...document.querySelectorAll('[data-parametro-aba]')];
  let atual = 'dados', pronto = false, ocupado = false;
  const state = { parametros: true, sections: {}, refs: {} };
  const api = window.empresa.api;
  const texto = id => root.querySelector('#' + id)?.value.trim() || '';
  const numero = id => {
    const valor = Number(texto(id).replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) throw Error('Informe um valor válido nos campos numéricos.');
    return valor;
  };
  const conferir = async promessa => {
    const resultado = await promessa;
    if (resultado.error) throw resultado.error;
    return resultado.data;
  };
  async function carregarSecao(nome) {
    if (nome === 'operacao' || state.sections[nome]) return;
    const secao = window.empresa.sections[nome];
    const host = root.querySelector('[data-empresa-secao="' + nome + '"]');
    await secao.render(host, state);
    const cleanup = await secao.bind(host, state, api);
    state.sections[nome] = { cleanup };
  }
  async function selecionar(nome) {
    if (!pronto || ocupado) return;
    ocupado = true; salvar.disabled = true;
    try {
      await carregarSecao(nome);
      atual = nome;
      abas.forEach(aba => {
        const ativa = aba.dataset.parametroAba === nome;
        aba.setAttribute('aria-selected', String(ativa));
        document.getElementById(aba.getAttribute('aria-controls')).hidden = !ativa;
      });
      root.hidden = nome === 'operacao';
      root.querySelector('.pr-acoes').hidden = nome === 'operacao';
      status.textContent = '';
    } catch (erro) { status.textContent = 'Não foi possível abrir a aba: ' + erro.message; }
    finally { ocupado = false; salvar.disabled = false; }
  }
  abas.forEach(aba => aba.addEventListener('click', () => selecionar(aba.dataset.parametroAba)));

  salvar.addEventListener('click', async () => {
    if (!pronto || ocupado) return;
    ocupado = true; salvar.disabled = true; status.textContent = 'Salvando…';
    try {
      if (atual === 'dados') {
        const campos = { nome: 'empresaNomeInput', razao_social: 'razaoSocialInput', cnpj: 'cnpjInput', inscricao_estadual: 'ieInput', telefone: 'empresaTelefoneInput', email: 'empresaEmailInput', logradouro: 'logradouroInput', numero: 'numeroInput', bairro: 'bairroInput', cidade: 'cidadeInput', uf: 'ufInput', cep: 'cepInput', endereco_google: 'empresaEnderecoGoogleInput' };
        const payload = Object.fromEntries(Object.entries(campos).map(([campo, id]) => [campo, texto(id)]));
        if (!payload.nome) throw Error('Informe o nome da empresa.');
        await conferir(api.saveEmpresa(state.empresaId, payload));
        Object.assign(state.empresa, payload);
        const nome = window.parent.document.getElementById('empresaNome');
        if (nome) nome.textContent = payload.nome;
      } else if (atual === 'tributacao') {
        const campos = { simples_nacional: 'simplesInput', tipo_tributacao: 'tipoTributacaoInput', natureza: 'naturezaInput', regime: 'regimeInput' };
        const payload = Object.fromEntries(Object.entries(campos).map(([campo, id]) => [campo, texto(id)]));
        payload.aliquota_iss = numero('aliquotaIssInput');
        payload.aliquota_ir = numero('aliquotaIrInput');
        if (payload.aliquota_iss > 100 || payload.aliquota_ir > 100) throw Error('Use alíquotas de 0 a 100%.');
        await conferir(api.saveEmpresa(state.empresaId, payload));
        Object.assign(state.empresa, payload);
      } else if (atual === 'logistica') {
        const payload = { empresa_id: state.empresaId, frete_minimo: numero('freteMinimoInput'), frete_maximo: numero('freteMaximoInput'), montagem_minima: numero('montagemMinimaInput'), montagem_maxima: numero('montagemMaximaInput'), diaria_montador: numero('diariaMontadorInput') };
        if (payload.frete_maximo > 0 && payload.frete_maximo < payload.frete_minimo) throw Error('O frete máximo precisa ser maior ou igual ao mínimo.');
        if (payload.montagem_maxima > 0 && payload.montagem_maxima < payload.montagem_minima) throw Error('A montagem máxima precisa ser maior ou igual à mínima.');
        await conferir(api.saveConfig(payload)); Object.assign(state.config, payload);
      } else if (atual === 'financeiro') {
        const payload = { empresa_id: state.empresaId, absorcao_frete_percent: numero('financeiroAbsorcaoFrete'), absorcao_montagem_percent: numero('financeiroAbsorcaoMontagem') };
        if (payload.absorcao_frete_percent > 100 || payload.absorcao_montagem_percent > 100) throw Error('Use percentuais de 0 a 100%.');
        await conferir(api.saveFinanceiro(payload)); state.financeiro = payload;
        if (window.parent.__FINANCEIRO_CACHE) delete window.parent.__FINANCEIRO_CACHE[state.empresaId];
        if (window.parent.__MONTAGEM_CONFIG_CACHE) delete window.parent.__MONTAGEM_CONFIG_CACHE[state.empresaId];
      } else if (atual === 'comercial') {
        await window.__salvarServicosComercial();
      } else if (atual === 'identidade') {
        if (!await window.__salvarIdentidadeVisual()) throw Error('Revise a identidade visual antes de salvar.');
      }
      status.textContent = 'Parâmetros salvos.';
    } catch (erro) { status.textContent = 'Não foi possível salvar: ' + erro.message; }
    finally { ocupado = false; salvar.disabled = false; }
  });

  (async () => {
    try {
      const contexto = await window.aguardarContexto?.();
      state.empresaId = contexto?.empresa_id || window.__CONTEXT?.empresa_id;
      if (!state.empresaId) throw Error('Empresa não identificada.');
      const sb = window.supabaseClient;
      const [empresa, config, financeiro, identidadeVisual, dashboard] = await Promise.all([
        conferir(sb.from('empresas').select('*').eq('id', state.empresaId).single()),
        conferir(sb.from('empresas_configuracoes').select('*').eq('empresa_id', state.empresaId).maybeSingle()),
        conferir(sb.from('empresa_financeiro').select('*').eq('empresa_id', state.empresaId).maybeSingle()),
        conferir(sb.from('configuracoes_empresa').select('*').eq('empresa_id', state.empresaId).maybeSingle()),
        api.getDashboardEmpresa(state.empresaId)
      ]);
      if (!empresa) throw Error('Dados da empresa não encontrados.');
      Object.assign(state, { empresa, config: config || {}, financeiro, identidadeVisual, dashboard: dashboard || {} });
      await carregarSecao('dados'); pronto = true; salvar.disabled = false; status.textContent = '';
    } catch (erro) { status.textContent = 'Não foi possível carregar os parâmetros: ' + erro.message; }
  })();
})();
