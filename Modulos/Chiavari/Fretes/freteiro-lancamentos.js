/* App do Freteiro · "Meus fretes" (21/11/2026).
   O freteiro escolhe um pedido ou uma solicitação interna criada pelo supervisor na Logística, gera o PDF do
   período e envia. Ao enviar, o relatório trava e o sistema confere (frete_lanc_enviar); o que não bate aparece aqui
   como divergência, e ele só explica (texto ou conversa com a Luísa). A Logística decide no Painel Logístico e, sem
   divergência pendente, o relatório vai para o Financeiro (fechamento de parceiro).
   Usa o que o app expõe em window.FreteiroBase (estado, rpc, mostrar, esc, moeda, avisar). */
(function () {
  'use strict';
  const B = () => window.FreteiroBase;
  const S = { dados: null, editando: null, aberto: null, explicando: null, conversa: [], pensando: false };
  const dataBr = (v) => v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const diaBr = (v) => v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
  const DIV = {
    valor: 'O valor lançado não bate com o combinado para este frete.',
    sem_frete: 'Não encontramos este frete no sistema nesta data.',
    nao_lancado: 'Você fez este frete, mas ele não está no seu relatório.'
  };
  const SIT = {
    ok: ['ok', 'Confere'], divergente: ['div', 'Divergência'], aceito: ['ok', 'Aceito pela logística'],
    corrigido: ['res', 'Corrigido pela logística'], recusado: ['rec', 'Recusado pela logística']
  };

  async function carregar() { S.dados = await B().rpc('frete_lanc_app', { p_token: B().estado.token }); return S.dados; }

  async function abrir() {
    const b = B(); b.estado.tela = 'lancamentos';
    b.mostrar('<h1 class="titulo">Meus fretes</h1><div class="esqueleto"></div><div class="esqueleto"></div>', true);
    try { await carregar(); } catch (e) { b.mostrar('<h1 class="titulo">Meus fretes</h1><div class="vazio">' + b.esc(e.message) + '</div>', true); return; }
    if (b.estado.tela === 'lancamentos') tela();
  }

  function totalDe(l) { return Number(l.total != null ? l.total : l.valor || 0); }

  function tela() {
    const b = B(), d = S.dados || {}, p = d.periodo || {}, rasc = d.rascunhos || [];
    const total = rasc.reduce((t, l) => t + totalDe(l), 0);
    const pendentes = (d.relatorios || []).filter((r) => r.pendentes > 0);
    let h = '<h1 class="titulo">Meus fretes</h1>' +
      '<p class="apoio">Lance aqui cada frete que você fez, com o valor combinado. No fim do período, envie o relatório.</p>';
    if (pendentes.length) h += '<button type="button" class="fl-alerta" data-fl="ir-relatorios"><strong>' + pendentes.reduce((t, r) => t + r.pendentes, 0) + ' divergência(s) para explicar</strong><span>Toque para ver os relatórios enviados.</span></button>';
    h += '<div class="fl-periodo"><span>Período aberto</span><strong>' + dataBr(p.ini) + ' a ' + dataBr(p.fim) + '</strong></div>';
    h += '<button type="button" class="botao" data-fl="novo">+ Lançar frete</button>';
    h += rasc.length ? '<span class="rotulo">Lançados neste período</span>' + rasc.map(linhaRascunho).join('') +
      '<div class="fl-total"><span>Total do período</span><strong>' + b.moeda(total) + '</strong></div>'
      : '<div class="vazio">Nenhum frete lançado neste período ainda.</div>';
    if (rasc.length) {
      h += '<button type="button" class="botao claro" data-fl="pdf">Gerar PDF do período</button>';
      h += p.pode_enviar
        ? '<button type="button" class="botao" data-fl="enviar">Enviar relatório</button><p class="fl-nota">Depois de enviado, o relatório não pode mais ser alterado.</p>'
        : '<p class="fl-nota">Você pode enviar o relatório a partir de ' + dataBr(p.fim) + ', último dia do período.</p>';
    }
    b.mostrar(h, true);
    ligar();
  }

  /* Relatórios enviados: tela separada de "Meus fretes" (pedido do usuário) */
  async function abrirRelatorios() {
    const b = B(); b.estado.tela = 'relatorios';
    b.mostrar('<h1 class="titulo">Relatórios enviados</h1><div class="esqueleto"></div>', true);
    try { await carregar(); } catch (e) { b.mostrar('<h1 class="titulo">Relatórios enviados</h1><div class="vazio">' + b.esc(e.message) + '</div>', true); return; }
    if (b.estado.tela === 'relatorios') telaRelatorios();
  }
  function statusRel(r) {
    return r.status === 'no_financeiro' ? ['ok', 'Enviado ao financeiro'] : r.pendentes > 0 ? ['div', r.pendentes + ' divergência(s)'] : ['res', 'Em conferência'];
  }
  function telaRelatorios() {
    const b = B(), rels = (S.dados || {}).relatorios || [];
    S.rel = null;
    b.mostrar('<h1 class="titulo">Relatórios enviados</h1><p class="apoio">Toque num relatório para ver os fretes dele.</p>' +
      (rels.length ? rels.map((r) => {
        const st = statusRel(r);
        return '<button type="button" class="fl-rel fl-rel-topo" data-fl="rel" data-id="' + r.id + '"><span><strong>' + dataBr(r.ini) + ' a ' + dataBr(r.fim) +
          '</strong><small>Enviado em ' + new Date(r.enviado_em).toLocaleDateString('pt-BR') + ' · ' + (r.lancamentos || []).filter((l) => l.tipo !== 'sistema').length + ' frete(s) · ' + b.moeda(r.total) +
          '</small></span><span class="fl-rel-dir"><span class="fl-chip ' + st[0] + '">' + st[1] + '</span><span class="fl-seta" aria-hidden="true">›</span></span></button>';
      }).join('') : '<div class="vazio">Você ainda não enviou nenhum relatório.</div>'), true);
    ligar();
  }

  /* um relatório aberto: aba Fretes (os fretes dele) e aba Assistente (a Luísa ajuda a explicar as divergências) */
  function telaRel(id, aba, lancId) {
    const b = B(), r = ((S.dados || {}).relatorios || []).find((x) => x.id === id);
    if (!r) return telaRelatorios();
    S.rel = id; S.abaRel = aba || 'fretes';
    const st = statusRel(r), divs = (r.lancamentos || []).filter((l) => l.situacao === 'divergente');
    let h = '<button type="button" class="fl-voltar" data-fl="rel-voltar">‹ Relatórios enviados</button>' +
      '<h1 class="titulo">' + dataBr(r.ini) + ' a ' + dataBr(r.fim) + '</h1>' +
      '<p class="apoio">Enviado em ' + new Date(r.enviado_em).toLocaleDateString('pt-BR') + ' · ' + b.moeda(r.total) + ' <span class="fl-chip ' + st[0] + '">' + st[1] + '</span></p>' +
      '<div class="fl-abas" role="tablist"><button type="button" role="tab" data-fl="aba-fretes" aria-selected="' + (S.abaRel === 'fretes') + '">Fretes</button>' +
      '<button type="button" role="tab" data-fl="aba-assistente" aria-selected="' + (S.abaRel === 'assistente') + '">Assistente' + (divs.length ? ' <b class="fl-bolinha">' + divs.length + '</b>' : '') + '</button></div>';
    if (S.abaRel === 'fretes') {
      h += '<div class="fl-rel">' + (r.lancamentos || []).map((l) => {
        const sx = SIT[l.situacao] || ['', l.situacao];
        let x = '<div class="fl-lanc' + (l.situacao === 'divergente' ? ' is-div' : '') + '"><div class="fl-lanc-topo"><span><strong>' + b.esc(l.destino || '—') + '</strong><small>' + b.esc(diaBr(l.data)) +
          (l.caminhao ? ' · ' + b.esc(l.caminhao) : '') + (l.tipo === 'sistema' ? '' : ' · ' + b.moeda(totalDe(l))) + '</small></span><span class="fl-chip ' + sx[0] + '">' + sx[1] + '</span></div>';
        if (l.situacao === 'divergente') {
          x += '<p class="fl-div">' + b.esc(DIV[l.divergencia] || 'Há uma divergência neste frete.') + '</p>';
          x += l.explicacao ? '<p class="fl-exp"><b>Sua explicação:</b> ' + b.esc(l.explicacao) + '</p><button type="button" class="fl-link" data-fl="explicar" data-id="' + l.id + '">Mudar explicação</button>'
            : '<button type="button" class="botao fl-botao-peq" data-fl="explicar" data-id="' + l.id + '">Explicar com a assistente</button>';
        } else if (l.decidido && l.decisao_motivo) {
          x += '<p class="fl-exp"><b>Logística:</b> ' + b.esc(l.decisao_motivo) + (l.situacao === 'corrigido' ? ' · valor final ' + b.moeda(l.valor_final) : '') + '</p>';
        }
        return x + '</div>';
      }).join('') + '</div><button type="button" class="botao claro" data-fl="pdf-rel" data-id="' + r.id + '">Gerar PDF deste relatório</button>';
      b.mostrar(h, true); ligar(); return;
    }
    // aba Assistente
    if (!divs.length) {
      h += '<div class="fl-luisa fl-luisa-vazia"><div class="fl-luisa-topo"><img src="../../../assets/agentes/montagem.jpg" alt=""><span><strong>Luísa</strong><small>Auxiliar de logística</small></span></div>' +
        '<p>Nenhuma divergência para explicar neste relatório. ' + (r.status === 'no_financeiro' ? 'Ele já foi para o financeiro.' : 'A logística está conferindo.') + '</p></div>';
      b.mostrar(h, true); ligar(); return;
    }
    const atual = divs.find((l) => l.id === lancId) || divs.find((l) => l.id === S.explicando) || divs.find((l) => !l.explicacao) || divs[0];
    h += '<span class="rotulo">Qual frete vamos explicar?</span><div class="fl-divs">' + divs.map((l) =>
      '<button type="button" data-fl="div-escolher" data-id="' + l.id + '" aria-pressed="' + (l.id === atual.id) + '"><strong>' + b.esc(diaBr(l.data)) + '</strong><small>' + b.esc(l.destino || '—') + '</small>' +
      (l.explicacao ? '<i>✓ explicado</i>' : '') + '</button>').join('') + '</div>' +
      '<p class="fl-div">' + b.esc(DIV[atual.divergencia] || '') + '</p>' +
      (atual.explicacao ? '<p class="fl-exp"><b>Sua explicação:</b> ' + b.esc(atual.explicacao) + '</p>' : '') +
      '<div class="fl-luisa"><div class="fl-luisa-topo"><img src="../../../assets/agentes/montagem.jpg" alt=""><span><strong>Luísa</strong><small>Auxiliar de logística</small></span></div>' +
      '<div class="fl-msgs" id="flMsgs"></div>' +
      '<div class="fl-campo"><textarea id="flTexto" rows="2" placeholder="Conte o que aconteceu neste frete…"></textarea><button type="button" class="botao fl-enviar" id="flEnviarMsg">Enviar</button></div></div>' +
      '<div id="flResumo"></div><button type="button" class="fl-link" id="flSoTexto">Prefiro só escrever a explicação</button>';
    b.mostrar(h, true); ligar();
    if (S.explicando !== atual.id || !S.conversa.length) {
      S.explicando = atual.id; S.conversa = []; S.pensando = false;
      S.conversa.push({ papel: 'ia', texto: 'Oi! Sou a Luísa, da logística. Sobre o frete de ' + diaBr(atual.data) + ': ' + (DIV[atual.divergencia] || '') + ' Me conta o que aconteceu?' });
    }
    pintarConversa();
    document.getElementById('flEnviarMsg').onclick = enviarMsg;
    document.getElementById('flSoTexto').onclick = () => mostrarResumo(atual.explicacao || '');
  }
  const voltarTela = () => (B().estado.tela === 'relatorios' ? telaRelatorios() : tela());

  function linhaRascunho(l) {
    const b = B();
    const ped = l.avulso ? 'Solicitação interna · ' + l.avulso.motivo : l.pedido ? (l.direcao === 'coleta' ? 'Coleta' : 'Entrega') + ' · Pedido ' + l.pedido.numero : '';
    return '<div class="corrida fl-item"><span class="corrida-info"><strong>' + b.esc(ped || l.destino) + '</strong><span>' + b.esc(diaBr(l.data)) +
      ' · ' + b.esc((l.origem ? l.origem + ' → ' : '') + l.destino) + (l.caminhao ? ' · ' + b.esc(l.caminhao) : '') + '</span>' +
      (!l.pedido_id && !l.avulso_id ? '<span class="fl-sem-ped">Escolha o pedido deste frete (Editar)</span>' : '') + '</span>' +
      '<span class="corrida-preco"><strong>' + b.moeda(totalDe(l)) + '</strong><span class="fl-acoes"><button type="button" data-fl="editar" data-id="' + l.id + '">Editar</button>' +
      '<button type="button" data-fl="apagar" data-id="' + l.id + '">Apagar</button></span></span></div>';
  }

  function ligar() {
    document.querySelectorAll('[data-fl]').forEach((el) => {
      el.onclick = () => acao(el.dataset.fl, el.dataset.id);
    });
  }

  async function acao(a, id) {
    const b = B();
    try {
      if (a === 'novo') return form(null);
      if (a === 'editar') return form((S.dados.rascunhos || []).find((l) => l.id === id));
      if (a === 'apagar') { if (!confirm('Apagar este frete lançado?')) return; S.dados = await b.rpc('frete_lanc_excluir', { p_token: b.estado.token, p_id: id }); return tela(); }
      if (a === 'rel') return telaRel(id, 'fretes');
      if (a === 'rel-voltar') return telaRelatorios();
      if (a === 'aba-fretes') return telaRel(S.rel, 'fretes');
      if (a === 'aba-assistente') return telaRel(S.rel, 'assistente');
      if (a === 'div-escolher') { S.conversa = []; return telaRel(S.rel, 'assistente', id); }
      if (a === 'ir-relatorios') return b.ir('relatorios');
      if (a === 'pdf') return pdf(S.dados.periodo, S.dados.rascunhos || [], false);
      if (a === 'pdf-rel') { const r = (S.dados.relatorios || []).find((x) => x.id === id); return pdf({ ini: r.ini, fim: r.fim }, r.lancamentos || [], true, r); }
      if (a === 'enviar') {
        const n = (S.dados.rascunhos || []).length;
        if (!confirm('Enviar o relatório com ' + n + ' frete(s)? Depois de enviado não dá mais para alterar.')) return;
        S.dados = await b.rpc('frete_lanc_enviar', { p_token: b.estado.token });
        const r = (S.dados.relatorios || [])[0];
        b.avisar(r && r.pendentes ? 'Relatório enviado. Há ' + r.pendentes + ' divergência(s) para explicar.' : 'Relatório enviado. Tudo conferido!', !!(r && r.pendentes));
        if (r && r.pendentes) { b.estado.tela = 'relatorios'; return telaRel(r.id, 'assistente'); }
        return tela();
      }
      if (a === 'explicar') { S.conversa = []; return telaRel(S.rel, 'assistente', id); }
    } catch (e) { b.avisar(e.message, true); }
  }

  /* ---------- lançar / editar ---------- */
  // 22/11: o freteiro escolhe um dos fretes da semana (pedido + entrega/coleta); data e endereços vêm do pedido.
  const DIRN = { entrega: 'Entrega', coleta: 'Coleta' };
  function form(l) {
    const b = B(), p = S.dados.periodo || {}, ops = S.dados.opcoes || [];
    S.editando = l ? l.id : null;
    S.escolha = l && l.avulso_id ? 'av|' + l.avulso_id : l && l.pedido_id ? l.pedido_id + '|' + l.direcao : '';
    const veics = S.dados.veiculos || [];
    const veicSel = (l && l.veiculo_id) || (veics.length === 1 ? veics[0].id : '');
    const cartao = (o) => {
      if (o.direcao === 'avulso') {
        const ka = 'av|' + o.avulso_id;
        return '<button type="button" class="fl-op" data-fl-op="' + b.esc(ka) + '" aria-pressed="' + (ka === S.escolha) + '">' +
          '<span class="fl-op-topo"><b class="fl-op-dir is-avulso">Solicitação interna</b><span>' + b.esc(diaBr(o.data)) + '</span><i class="is-avulso">' + b.moeda(o.valor) + '</i></span>' +
          '<strong>' + b.esc(o.origem) + ' → ' + b.esc(o.destino) + '</strong><small>' + b.esc(o.motivo || '') + '</small></button>';
      }
      const k = o.pedido_id + '|' + o.direcao;
      return '<button type="button" class="fl-op" data-fl-op="' + b.esc(k) + '" aria-pressed="' + (k === S.escolha) + '">' +
        '<span class="fl-op-topo"><b class="fl-op-dir is-' + o.direcao + '">' + DIRN[o.direcao] + '</b><span>' + b.esc(diaBr(o.data)) + '</span><i>Pedido ' + b.esc(o.numero || '') + '</i></span>' +
        '<strong>' + (o.direcao === 'entrega' ? 'Galpão → ' : '') + b.esc(o.local || 'Local do evento') + (o.direcao === 'coleta' ? ' → Galpão' : '') + '</strong>' +
        (o.endereco ? '<small class="fl-op-end">' + b.esc(o.endereco) + '</small>' : '') + '</button>';
    };
    b.mostrar('<h1 class="titulo">' + (l ? 'Editar frete' : 'Lançar frete') + '</h1>' +
      '<p class="apoio">Período aberto: ' + dataBr(p.ini) + ' a ' + dataBr(p.fim) + '. Escolha qual frete você fez.</p>' +
      '<span class="rotulo">Qual frete?</span>' + (ops.length
        ? '<div class="fl-ops">' + ops.map(cartao).join('') + '</div><p class="fl-dica">Fez um frete que não é de pedido (buscar material, conserto…)? Peça para o supervisor da Logística cadastrar; ele aparece aqui como <b>Solicitação interna</b>.</p>'
        : '<p class="fl-erro">Não há pedidos nem solicitações internas liberadas neste período. Para frete sem pedido, peça ao supervisor que cadastre uma solicitação interna na Logística.</p>') +
      '<span class="rotulo">Caminhão</span>' + (veics.length
        ? '<div class="campo"><select id="flCaminhao"><option value="">Escolha o veículo</option>' + veics.map((v) => '<option value="' + v.id + '"' + (v.id === veicSel ? ' selected' : '') + '>' + b.esc(v.nome) + '</option>').join('') + '</select></div>'
        : '<p class="fl-erro">Cadastre seu veículo em <b>Meus veículos</b> antes de lançar.</p>') +
      '<button type="button" class="fl-link" data-fl-ir="veiculos">Cadastrar outro veículo</button>' +
      '<span class="rotulo">Valor combinado</span><div class="campo"><input type="text" inputmode="decimal" id="flValor" placeholder="R$ 0,00" value="' + (l ? String(l.valor).replace('.', ',') : '') + '"></div>' +
      '<span class="rotulo">Observação</span><div class="campo"><textarea id="flObs" placeholder="Opcional">' + b.esc((l && l.observacao) || '') + '</textarea></div>' +
      '<button type="button" class="botao" id="flSalvar">Salvar frete</button><button type="button" class="botao claro" id="flVoltar">Voltar</button>', true);
    document.querySelectorAll('[data-fl-op]').forEach((x) => { x.onclick = () => {
      S.escolha = x.dataset.flOp;
      document.querySelectorAll('[data-fl-op]').forEach((y) => y.setAttribute('aria-pressed', String(y === x)));
    }; });
    document.querySelectorAll('[data-fl-ir]').forEach((x) => { x.onclick = () => b.ir(x.dataset.flIr); });
    document.getElementById('flVoltar').onclick = () => tela();
    document.getElementById('flSalvar').onclick = async () => {
      if (!S.escolha) { b.avisar('Escolha qual frete você fez.', true); return; }
      const [pedido_id, direcao] = S.escolha.split('|');
      const avulso_id = pedido_id === 'av' ? direcao : null;
      const num = (v) => Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      const cam = document.getElementById('flCaminhao');
      if (!cam || !cam.value) { b.avisar('Escolha o caminhão do frete.', true); if (cam) cam.focus(); return; }
      const dados = { pedido_id: avulso_id ? null : pedido_id, direcao: avulso_id ? null : direcao, avulso_id, veiculo_id: cam.value, caminhao: cam.options[cam.selectedIndex].text,
        valor: num(document.getElementById('flValor').value), observacao: document.getElementById('flObs').value };
      try { S.dados = await b.rpc('frete_lanc_salvar', { p_token: b.estado.token, p_id: S.editando, p_dados: dados }); b.avisar('Frete salvo.'); tela(); }
      catch (e) { b.avisar(e.message, true); }
    };
  }

  /* ---------- explicar divergência (texto ou conversa com a Luísa) ---------- */
  function acharLanc(id) {
    for (const r of S.dados.relatorios || []) { const l = (r.lancamentos || []).find((x) => x.id === id); if (l) return l; }
    return null;
  }
  function pintarConversa() {
    const b = B(), el = document.getElementById('flMsgs'); if (!el) return;
    el.innerHTML = S.conversa.map((m) => '<div class="fl-msg ' + (m.papel === 'ia' ? 'ia' : 'eu') + '">' + b.esc(m.texto).replace(/\n/g, '<br>') + '</div>').join('') +
      (S.pensando ? '<div class="fl-msg ia fl-digitando"><i></i><i></i><i></i></div>' : '');
    el.scrollTop = el.scrollHeight;
    const bt = document.getElementById('flEnviarMsg'); if (bt) bt.disabled = S.pensando;
  }
  async function enviarMsg() {
    const b = B(), tx = document.getElementById('flTexto'), t = tx.value.trim();
    if (!t || S.pensando) return;
    tx.value = ''; S.conversa.push({ papel: 'pessoa', texto: t }); S.pensando = true; pintarConversa();
    try {
      const { data, error } = await window.supabaseClient.functions.invoke('freteiro-assistente', {
        body: { token: b.estado.token, lancamento_id: S.explicando, mensagens: S.conversa }
      });
      let msg = data && data.erro;
      if (error && !msg) { try { msg = (await error.context.json()).erro; } catch (_) {} msg = msg || 'A Luísa não conseguiu responder agora.'; }
      if (msg) { S.conversa.push({ papel: 'ia', texto: msg }); }
      else {
        S.conversa.push({ papel: 'ia', texto: data.resposta });
        if (data.pronto && data.explicacao) mostrarResumo(data.explicacao);
      }
    } catch (e) { S.conversa.push({ papel: 'ia', texto: 'A Luísa não conseguiu responder agora. Você pode escrever a explicação.' }); }
    S.pensando = false; pintarConversa();
  }
  function mostrarResumo(texto) {
    const b = B(), el = document.getElementById('flResumo');
    el.innerHTML = '<span class="rotulo">Explicação que vai para a logística</span><div class="campo"><textarea id="flExplicacao">' + b.esc(texto) + '</textarea></div>' +
      '<button type="button" class="botao" id="flEnviarExp">Enviar explicação</button>';
    document.getElementById('flEnviarExp').onclick = async () => {
      try {
        S.dados = await b.rpc('frete_lanc_explicar', { p_token: b.estado.token, p_id: S.explicando, p_texto: document.getElementById('flExplicacao').value, p_conversa: S.conversa });
        b.avisar('Explicação enviada para a logística.'); S.conversa = []; S.explicando = null;
        const rr = (S.dados.relatorios || []).find((x) => x.id === S.rel);
        const prox = rr && (rr.lancamentos || []).find((l) => l.situacao === 'divergente' && !l.explicacao);
        telaRel(S.rel, 'assistente', prox && prox.id);
      } catch (e) { b.avisar(e.message, true); }
    };
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* ---------- PDF (impressão do navegador: "Salvar como PDF") ---------- */
  function pdf(periodo, lancs, enviado, rel) {
    const b = B(), p = b.estado.perfil || {};
    const linhas = lancs.filter((l) => l.tipo !== 'sistema');
    const total = linhas.reduce((t, l) => t + totalDe(l), 0);
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Fretes ' + dataBr(periodo.ini) + ' a ' + dataBr(periodo.fim) + '</title><style>' +
      'body{font:13px/1.45 Arial,sans-serif;color:#222;margin:28px}h1{font-size:20px;margin:0 0 2px}p{margin:0 0 4px;color:#555}' +
      'table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}' +
      'th{font-size:11px;text-transform:uppercase;color:#666}td.v,th.v{text-align:right;white-space:nowrap}tfoot td{font-weight:700;border-top:2px solid #222}' +
      '.sub{color:#777;font-size:11.5px}</style></head><body>' +
      '<h1>Relatório de fretes</h1><p><b>' + b.esc(p.nome || '') + '</b>' + (p.telefone ? ' · ' + b.esc(p.telefone) : '') + (p.carro_modelo ? ' · ' + b.esc(p.carro_modelo) + (p.carro_placa ? ' ' + b.esc(p.carro_placa) : '') : '') + '</p>' +
      '<p>Período: ' + dataBr(periodo.ini) + ' a ' + dataBr(periodo.fim) + (enviado && rel ? ' · enviado em ' + new Date(rel.enviado_em).toLocaleString('pt-BR') : ' · ainda não enviado') + '</p>' +
      (p.pix ? '<p>Pix: ' + b.esc(p.pix) + '</p>' : '') +
      '<table><thead><tr><th>Data</th><th>Trajeto</th><th>Extras</th><th class="v">Frete</th><th class="v">Total</th>' + (enviado ? '<th>Situação</th>' : '') + '</tr></thead><tbody>' +
      linhas.map((l) => '<tr><td>' + dataBr(l.data) + '</td><td>' + b.esc((l.origem ? l.origem + ' → ' : '') + l.destino) + (l.observacao ? '<div class="sub">' + b.esc(l.observacao) + '</div>' : '') + '</td>' +
        '<td>' + (l.extras || []).map((e) => b.esc(e.motivo) + ' ' + b.moeda(e.valor)).join('<br>') + '</td><td class="v">' + b.moeda(l.valor) + '</td><td class="v">' + b.moeda(totalDe(l)) + '</td>' +
        (enviado ? '<td>' + b.esc((SIT[l.situacao] || ['', l.situacao])[1]) + '</td>' : '') + '</tr>').join('') +
      '</tbody><tfoot><tr><td colspan="4">Total cobrado</td><td class="v">' + b.moeda(total) + '</td>' + (enviado ? '<td></td>' : '') + '</tr></tfoot></table>' +
      '</body></html>';
    let f = document.getElementById('flImpressao');
    if (f) f.remove();
    f = document.createElement('iframe'); f.id = 'flImpressao'; f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) { b.avisar('Não foi possível abrir a impressão.', true); } }, 300);
  }

  /* Meus veículos (22/11): o freteiro cadastra todos os caminhões; ao lançar um frete escolhe qual foi. */
  async function abrirVeiculos() {
    const b = B(); b.estado.tela = 'veiculos';
    b.mostrar('<h1 class="titulo">Meus veículos</h1><div class="esqueleto"></div>', true);
    try { S.veic = (await b.rpc('frete_veiculos_app', { p_token: b.estado.token })).veiculos || []; }
    catch (e) { b.mostrar('<h1 class="titulo">Meus veículos</h1><div class="vazio">' + b.esc(e.message) + '</div>', true); return; }
    if (b.estado.tela === 'veiculos') telaVeiculos();
  }
  function telaVeiculos() {
    const b = B(), vs = S.veic || [];
    b.mostrar('<h1 class="titulo">Meus veículos</h1><p class="apoio">Cadastre todos os caminhões que você usa. Ao lançar um frete, você escolhe qual foi.</p>' +
      (vs.length ? vs.map((v) => '<div class="corrida fl-item"><span class="corrida-info"><strong>' + b.esc(v.modelo) + '</strong><span>' +
        b.esc([v.placa, v.tipo, Number(v.capacidade_m3) ? String(v.capacidade_m3).replace('.', ',') + ' m³' : ''].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="corrida-preco"><span class="fl-acoes"><button type="button" data-ve="editar" data-id="' + v.id + '">Editar</button><button type="button" data-ve="tirar" data-id="' + v.id + '">Remover</button></span></span></div>').join('')
        : '<div class="vazio">Nenhum veículo cadastrado.</div>') +
      '<button type="button" class="botao" data-ve="novo">+ Cadastrar veículo</button>', true);
    document.querySelectorAll('[data-ve]').forEach((x) => { x.onclick = async () => {
      const a = x.dataset.ve, v = vs.find((y) => y.id === x.dataset.id);
      if (a === 'novo' || a === 'editar') return formVeiculo(v || null);
      if (a === 'tirar') {
        if (!confirm('Remover este veículo? Os fretes já lançados com ele continuam.')) return;
        try { S.veic = (await b.rpc('frete_veiculo_excluir', { p_token: b.estado.token, p_id: v.id })).veiculos || []; telaVeiculos(); } catch (e) { b.avisar(e.message, true); }
      }
    }; });
  }
  function formVeiculo(v) {
    const b = B();
    b.mostrar('<h1 class="titulo">' + (v ? 'Editar veículo' : 'Cadastrar veículo') + '</h1>' +
      '<span class="rotulo">Modelo</span><div class="campo"><input type="text" id="veModelo" placeholder="Ex.: Iveco Daily, HR, Accelo" value="' + b.esc((v && v.modelo) || '') + '"></div>' +
      '<span class="rotulo">Placa</span><div class="campo"><input type="text" id="vePlaca" maxlength="8" style="text-transform:uppercase" value="' + b.esc((v && v.placa) || '') + '"></div>' +
      '<span class="rotulo">Tipo</span><div class="campo"><input type="text" id="veTipo" placeholder="Ex.: baú, VUC, carroceria" value="' + b.esc((v && v.tipo) || '') + '"></div>' +
      '<span class="rotulo">Quantos m³ cabem</span><div class="campo"><input type="text" inputmode="decimal" id="veCap" value="' + (v && Number(v.capacidade_m3) ? String(v.capacidade_m3).replace('.', ',') : '') + '"></div>' +
      '<button type="button" class="botao" id="veSalvar">Salvar veículo</button><button type="button" class="botao claro" id="veVoltar">Voltar</button>', true);
    document.getElementById('veVoltar').onclick = telaVeiculos;
    document.getElementById('veSalvar').onclick = async () => {
      const dados = { modelo: document.getElementById('veModelo').value, placa: document.getElementById('vePlaca').value, tipo: document.getElementById('veTipo').value, capacidade_m3: document.getElementById('veCap').value };
      try { S.veic = (await b.rpc('frete_veiculo_salvar', { p_token: b.estado.token, p_id: v ? v.id : null, p_dados: dados })).veiculos || []; b.avisar('Veículo salvo.'); telaVeiculos(); }
      catch (e) { b.avisar(e.message, true); }
    };
  }

  window.FreteiroLanc = { abrir, relatorios: abrirRelatorios, veiculos: abrirVeiculos, recarregar: carregar };
})();
