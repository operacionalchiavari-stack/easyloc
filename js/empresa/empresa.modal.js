(function () {
  const api = window.empresa.api;
  const u = window.empresa.utils;

  async function openEmpresaModal() {
    const empresaId = window.__CONTEXT.empresa_id;
    const state = {
      empresaId,
      empresa: null,
      config: null,
      financeiro: null,   // ✅ ADICIONE ESTA LINHA
      dashboard: null,
      sections: {},
      refs: {}
    };
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,.42)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';

    const modal = document.createElement('div');
    modal.style.width = '1100px';
    modal.style.maxWidth = '96%';
    modal.style.height = '90vh';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.background = '#ffffff';
    modal.style.borderRadius = '20px';
    modal.style.boxShadow = '0 40px 90px rgba(0,0,0,.25)';
    modal.style.fontFamily = 'Inter, sans-serif';
    modal.style.overflow = 'hidden';

    overlay.appendChild(modal);
    root.appendChild(overlay);

    modal.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;">

        <!-- HEADER -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:28px 36px 18px 36px;flex-shrink:0;">
          <h3 style="margin:0;font-size:22px;font-weight:700;color:#0f2a44;">
            Editar Empresa
          </h3>
          <button id="closeEmpresaModal"
            style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">
            ✕
          </button>
        </div>

        <!-- SCROLL -->
        <div style="
          flex:1;
          min-height:0;
          display:flex;
          flex-direction:column;
          overflow:hidden;
        ">

          <div style="
            flex:1;
            overflow-y:auto;
            padding:0 36px 24px 36px;
          ">

              <!-- ABAS -->
              <div style="display:flex;gap:12px;margin-bottom:24px;border-bottom:1px solid #e5e7eb;">

                <div class="empresa-tab active" data-tab="dados"
                  style="padding:10px 16px;font-weight:600;cursor:pointer;border-bottom:3px solid #ff6a00;">
                  Dados da Empresa
                </div>

                <div class="empresa-tab" data-tab="tributacao"
                  style="padding:10px 16px;font-weight:600;cursor:pointer;color:#64748b;">
                  Tributação
                </div>

                <div class="empresa-tab" data-tab="logistica"
                  style="padding:10px 16px;font-weight:600;cursor:pointer;color:#64748b;">
                  Logística
                </div>

                <div class="empresa-tab" data-tab="financeiro"
                  style="padding:10px 16px;font-weight:600;cursor:pointer;color:#64748b;">
                  Financeiro
                </div>

                <div class="empresa-tab" data-tab="comercial"
  style="padding:10px 16px;font-weight:600;cursor:pointer;color:#64748b;">
  Comercial
</div>

              </div>

              <!-- CONTEÚDOS DAS ABAS -->
<div id="aba-dados"></div>
<div id="aba-tributacao" style="display:none;"></div>
<div id="aba-logistica" style="display:none;"></div>
<div id="aba-financeiro" style="display:none;"></div>
<div id="aba-comercial" style="display:none;"></div>

          </div>
        </div>

        <!-- FOOTER FIXO -->
        <div style="padding:20px 36px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px;background:#ffffff;flex-shrink:0;">
          <button id="cancelEmpresaBtn"
            style="padding:10px 20px;border-radius:14px;border:none;background:#e5e7eb;cursor:pointer;">
            Cancelar
          </button>

          <button id="saveEmpresaBtn"
            style="padding:10px 20px;border-radius:14px;border:none;background:#ff6a00;color:#fff;font-weight:600;cursor:pointer;">
            Salvar
          </button>
        </div>

      </div>
    `;

function showTab(tipo) {
  modal.querySelector('#aba-dados').style.display = tipo === 'dados' ? 'block' : 'none';
  modal.querySelector('#aba-tributacao').style.display = tipo === 'tributacao' ? 'block' : 'none';
  modal.querySelector('#aba-logistica').style.display = tipo === 'logistica' ? 'block' : 'none';
  modal.querySelector('#aba-financeiro').style.display = tipo === 'financeiro' ? 'block' : 'none';
  modal.querySelector('#aba-comercial').style.display = tipo === 'comercial' ? 'block' : 'none';
}

    async function loadSection(name) {
      console.log(`📋 [loadSection] ${name} - already rendered?`, !!state.sections[name]?.rendered);
      if (state.sections[name]?.rendered) return;
      const container = modal.querySelector(`#aba-${name}`);
      let renderFn, bindFn;
      if (name === 'dados') {
        renderFn = window.empresa.sections.dados.render;
        bindFn = window.empresa.sections.dados.bind;
      } else if (name === 'tributacao') {
        renderFn = window.empresa.sections.tributacao.render;
        bindFn = window.empresa.sections.tributacao.bind;
      } else if (name === 'logistica') {
        renderFn = window.empresa.sections.logistica.render;
        bindFn = window.empresa.sections.logistica.bind;
} else if (name === 'financeiro') {
  renderFn = window.empresa.sections.financeiro.render;
  bindFn = window.empresa.sections.financeiro.bind;
} else if (name === 'comercial') {
  renderFn = window.empresa.sections.comercial.render;
  bindFn = window.empresa.sections.comercial.bind;
}
      if (!renderFn) return;
      console.log(`📋 [loadSection] ${name} - render() start`);
      renderFn(container, state);
      console.log(`📋 [loadSection] ${name} - bind() start`);
      const cleanup = await bindFn(container, state, api);
      console.log(`📋 [loadSection] ${name} - OK`);
      state.sections[name] = { rendered: true, cleanup };
    }

    function close() {
      Object.values(state.sections).forEach(sec => {
        sec.cleanup && sec.cleanup();
      });
      root.innerHTML = '';
    }

    async function save() {
      const container = modal;
      const payloadEmpresa = {
        nome: container.querySelector('#empresaNomeInput').value.trim(),
        razao_social: container.querySelector('#razaoSocialInput').value.trim(),
        cnpj: container.querySelector('#cnpjInput').value.trim(),
        inscricao_estadual: container.querySelector('#ieInput').value.trim(),
        telefone: container.querySelector('#empresaTelefoneInput').value.trim(),
        email: container.querySelector('#empresaEmailInput').value.trim(),
        logradouro: container.querySelector('#logradouroInput').value.trim(),
        numero: container.querySelector('#numeroInput').value.trim(),
        bairro: container.querySelector('#bairroInput').value.trim(),
        cidade: container.querySelector('#cidadeInput').value.trim(),
        uf: container.querySelector('#ufInput').value.trim(),
        cep: container.querySelector('#cepInput').value.trim(),
        endereco_google: container.querySelector('#empresaEnderecoGoogleInput')?.value.trim()
      };
      const { error: erroEmpresa } = await api.saveEmpresa(state.empresaId, payloadEmpresa);
      if (erroEmpresa) {
        console.error('Erro ao salvar empresa:', erroEmpresa);
        if (typeof window.alerta === "function") window.alerta('Erro ao salvar dados da empresa', 'Erro', 'erro');
        else alert('Erro ao salvar dados da empresa');
        return;
      }

/* =====================================================
   SALVAR CONFIGURAÇÕES LOGÍSTICAS
===================================================== */

const freteMinInput = container.querySelector('#freteMinimoInput');

if (freteMinInput) {

  const payloadConfig = {
    empresa_id: state.empresaId,
    frete_minimo: parseFloat(container.querySelector('#freteMinimoInput')?.value) || 0,
    frete_maximo: parseFloat(container.querySelector('#freteMaximoInput')?.value) || 0,
    montagem_minima: parseFloat(container.querySelector('#montagemMinimaInput')?.value) || 0,
    montagem_maxima: parseFloat(container.querySelector('#montagemMaximaInput')?.value) || 0,
    diaria_montador: parseFloat(container.querySelector('#diariaMontadorInput')?.value) || 0
  };

  const { error: erroConfig } = await api.saveConfig(payloadConfig);

  if (erroConfig) {
    console.error('Erro ao salvar configurações:', erroConfig);
    if (typeof window.alerta === "function") window.alerta('Erro ao salvar configurações logísticas', 'Erro', 'erro');
    else alert('Erro ao salvar configurações logísticas');
    return;
  }

}

/* =====================================================
   SALVAR CONFIGURAÇÕES FINANCEIRAS
===================================================== */

const freteInput = container.querySelector('#financeiroAbsorcaoFrete');
const montagemInput = container.querySelector('#financeiroAbsorcaoMontagem');

if (freteInput && montagemInput) {

  const payloadFinanceiro = {
    empresa_id: state.empresaId,
    absorcao_frete_percent: parseFloat(freteInput.value) || 0,
    absorcao_montagem_percent: parseFloat(montagemInput.value) || 0
  };

const { data: financeiroSalvo, error: erroFinanceiro } =
  await api.saveFinanceiro(payloadFinanceiro);

if (erroFinanceiro) {
  console.error('Erro ao salvar financeiro:', erroFinanceiro);
  if (typeof window.alerta === "function") window.alerta('Erro ao salvar configurações financeiras', 'Erro', 'erro');
  else alert('Erro ao salvar configurações financeiras');
  return;
}

state.financeiro = financeiroSalvo || payloadFinanceiro;

}

// salva serviços comerciais (se a aba existir)
// garante que a aba comercial foi carregada
if (!state.sections.comercial) {
  await loadSection('comercial'); 
}

if (window.__salvarServicosComercial) {
  try {
    await window.__salvarServicosComercial();
  } catch (e) {
    console.error("Erro ao salvar serviços comerciais:", e);
    if (typeof window.alerta === "function") window.alerta("Erro ao salvar serviços comerciais", "Erro", "erro");
    else alert("Erro ao salvar serviços comerciais");
    return;
  }
}

document.getElementById('empresaNome').innerText = payloadEmpresa.nome;
close();
    }

    modal.querySelector('#closeEmpresaModal').onclick = close;
    modal.querySelector('#cancelEmpresaBtn').onclick = close;
    modal.querySelector('#saveEmpresaBtn').onclick = save;

    const tabs = modal.querySelectorAll('.empresa-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        tabs.forEach(t => {
          t.style.borderBottom = 'none';
          t.style.color = '#64748b';
        });
        tab.style.borderBottom = '3px solid #ff6a00';
        tab.style.color = '#0f2a44';
        const tipo = tab.dataset.tab;
        showTab(tipo);
        await loadSection(tipo);
      });
    });

    // fetch data before showing first tab
    const [empresa, config, dashboard, financeiro] = await Promise.all([
      api.getEmpresa(state.empresaId),
      api.getConfig(state.empresaId),
      api.getDashboardEmpresa(state.empresaId),
      api.getFinanceiro(state.empresaId)
    ]);

    state.empresa = empresa || {};
    state.config = config || {};
    state.dashboard = dashboard || {};
    state.financeiro = financeiro || null;
    await loadSection('dados');
    showTab('dados');
  }

  window.empresa = window.empresa || {};
  window.empresa.openModal = openEmpresaModal;
  window.criarModalEmpresa = openEmpresaModal;
})();
