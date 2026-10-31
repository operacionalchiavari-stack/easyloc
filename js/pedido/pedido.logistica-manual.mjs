const tipos = ['frete', 'montagem'];
const automaticos = {};
const repintar = {};
const aberto = {}; // painel do ajuste manual aberto (frete / montagem)
let permitidos = {};
const moeda = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function iniciarLogisticaManual() {
  window.__PEDIDO_LOGISTICA_MANUAL = {};
  const { data, error } = await window.supabaseClient.rpc('pedido_logistica_manual_permissoes', { p_empresa: window.__CONTEXT.empresa_id });
  permitidos = error ? {} : (data || {});
}

export function aplicarLogisticaManual(tipo, valor, render) {
  automaticos[tipo] = Number(valor || 0);
  repintar[tipo] = render;
  const ajuste = window.__PEDIDO_LOGISTICA_MANUAL?.[tipo];
  const manual = ajuste != null && Number.isFinite(ajuste.valor) && ajuste.valor >= 0;
  const card = document.getElementById(tipo === 'frete' ? 'cardLogisticaPedido' : 'cardMontagemPedido');
  if (card) {
    let controle = card.querySelector('.logistica-manual');
    if (!controle) {
      controle = document.createElement('div');
      controle.className = 'logistica-manual';
      // no Frete fica abaixo da linha do título (onde estão Volume e Distância)
      (card.querySelector('.frete-topo') || card.querySelector('h2'))?.after(controle);
    }
    controle.replaceChildren();
    // Linha única e compacta; o valor e a observação do ajuste abrem num painel flutuante,
    // para o card não crescer (pedido do usuário, out/2026).
    const info = document.createElement('small');
    info.textContent = manual ? `Manual · automático ${moeda(valor)}` : 'Cálculo automático';
    controle.append(info);
    if (permitidos[tipo]) {
      const botao = document.createElement('button');
      botao.type = 'button'; botao.className = 'logistica-manual-link';
      botao.textContent = manual ? 'Editar ajuste' : 'Ajustar';
      botao.setAttribute('aria-expanded', String(Boolean(manual && aberto[tipo])));
      botao.onclick = () => {
        const estado = window.__PEDIDO_LOGISTICA_MANUAL;
        if (!manual) estado[tipo] = { valor: automaticos[tipo] };
        aberto[tipo] = manual ? !aberto[tipo] : true;
        render();
        if (aberto[tipo]) setTimeout(() => card.querySelector('.logistica-manual-painel input')?.focus(), 0);
      };
      controle.append(botao);
      if (manual && aberto[tipo]) {
        const painel = document.createElement('div');
        painel.className = 'logistica-manual-painel';
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', `Ajuste manual de ${tipo}`);
        controle.append(painel);
        const label = document.createElement('label');
        label.textContent = 'Valor final (R$)';
        const input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.max = '999999999.99'; input.step = '0.01'; input.value = ajuste.valor.toFixed(2);
        input.onchange = () => {
          if (!input.value || !input.checkValidity() || !Number.isFinite(input.valueAsNumber)) {
            input.reportValidity(); input.value = ajuste.valor.toFixed(2); return;
          }
          window.__PEDIDO_LOGISTICA_MANUAL[tipo] = { ...window.__PEDIDO_LOGISTICA_MANUAL[tipo], valor: Math.round(input.valueAsNumber * 100) / 100 };
          render();
        };
        label.append(input); painel.append(label);
        const observacaoLabel = document.createElement('label');
        observacaoLabel.className = 'logistica-manual-observacao';
        observacaoLabel.textContent = 'Observação do ajuste (obrigatória)';
        const observacao = document.createElement('textarea');
        observacao.required = true; observacao.maxLength = 1000; observacao.rows = 3;
        observacao.placeholder = 'Explique o motivo do valor manual';
        observacao.value = ajuste.observacao || '';
        observacao.oninput = () => {
          window.__PEDIDO_LOGISTICA_MANUAL[tipo].observacao = observacao.value;
        };
        observacaoLabel.append(observacao); painel.append(observacaoLabel);
        const acoes = document.createElement('div'); acoes.className = 'logistica-manual-acoes';
        const voltar = document.createElement('button'); voltar.type = 'button'; voltar.className = 'logistica-manual-link';
        voltar.textContent = 'Voltar ao automático';
        voltar.onclick = () => { delete window.__PEDIDO_LOGISTICA_MANUAL[tipo]; aberto[tipo] = false; render(); };
        const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn btn-primary';
        ok.textContent = 'OK';
        ok.onclick = () => { aberto[tipo] = false; render(); };
        acoes.append(voltar, ok); painel.append(acoes);
        painel.addEventListener('keydown', e => { if (e.key === 'Escape') { aberto[tipo] = false; render(); } });
      }
    } else if (manual) {
      const texto = document.createElement('span'); texto.textContent = `Valor definido: ${moeda(ajuste.valor)}`; controle.append(texto);
      if (ajuste.observacao) {
        const nota = document.createElement('p'); nota.textContent = ajuste.observacao; controle.append(nota);
      }
    }
  }
  return manual ? ajuste.valor : Number(valor || 0);
}

export function validarObservacoesLogisticaManual() {
  for (const tipo of tipos) {
    const ajuste = window.__PEDIDO_LOGISTICA_MANUAL?.[tipo];
    if (ajuste && (typeof ajuste.observacao !== 'string' || !ajuste.observacao.trim())) {
      return `Informe a observação do ajuste manual de ${tipo === 'frete' ? 'frete' : 'montagem'} antes de salvar.`;
    }
  }
  return '';
}

export function restaurarLogisticaManual(estado) {
  window.__PEDIDO_LOGISTICA_MANUAL = estado && typeof estado === 'object' ? structuredClone(estado) : {};
  tipos.forEach(tipo => repintar[tipo]?.());
}
