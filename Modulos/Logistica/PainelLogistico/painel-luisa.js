// Luísa · Logística para o supervisor (aba do Painel Logístico, 21/11/2026).
// A mesma Luísa que conversa com as equipes no App do Montador; aqui ela responde sobre as montagens a partir dos
// relatos que colheu (Edge Function logistica-assistente, só leitura). Conversa guardada na aba do navegador.
// Visual igual ao da Clara do Financeiro (classes ch-*/clp-* de financeiro-clara.css): conversa à esquerda e,
// à direita, análises prontas + "Nova conversa".
(function () {
  'use strict';
  const FOTO = '../../../assets/agentes/montagem.jpg';
  const SUGESTOES = [
    'Como foram as montagens desta semana?',
    'Quais eventos tiveram problema ou reclamação do decorador?',
    'O que a equipe deixou de orientação para as próximas desmontagens?',
    'Quais locais deram mais dificuldade de acesso?'
  ];
  const ANALISES = [
    ['Resumo da semana', 'Faça um resumo das montagens e desmontagens desta semana: o que foi bem, o que deu problema, comentários dos decoradores e o que ficou pendente.'],
    ['Problemas e reclamações', 'Liste os eventos dos últimos 30 dias com problema, peça faltando ou danificada, ou reclamação do decorador, com o que a equipe fez em cada um.'],
    ['Próximas desmontagens', 'Para as desmontagens dos próximos dias, traga as orientações que a equipe da montagem deixou para cada pedido.'],
    ['Locais difíceis', 'Quais locais deram mais dificuldade de acesso, estacionamento, escada ou horário? O que a equipe recomenda para eles?'],
    ['Melhorias sugeridas', 'Junte as sugestões de melhoria que as equipes deram nos relatos e diga quais aparecem mais.'],
    ['Eventos sem relato', 'Quais montagens e desmontagens já aconteceram e ainda estão sem relato da equipe?']
  ];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Texto da IA: **negrito**, listas com "-" ou "1." e quebras de linha.
  function formatar(t) {
    const linhas = esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n');
    let html = '', lista = '';
    const fecha = () => { if (lista) { html += '</' + lista + '>'; lista = ''; } };
    for (const l of linhas) {
      const ul = l.match(/^\s*[-•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) { const tipo = ul ? 'ul' : 'ol'; if (lista !== tipo) { fecha(); html += '<' + tipo + '>'; lista = tipo; } html += '<li>' + (ul || ol)[1] + '</li>'; }
      else { fecha(); if (l.trim()) html += '<p>' + l + '</p>'; }
    }
    fecha();
    return html;
  }
  let host, ctx, chave, mensagens = [], ocupado = false;
  const salvar = () => { try { sessionStorage.setItem(chave, JSON.stringify(mensagens.slice(-40))); } catch (_) {} };
  function pintar() {
    const lista = host.querySelector('#pllMsgs');
    const nome = String(ctx?.usuario_nome || '').trim().split(/\s+/)[0];
    lista.innerHTML = '<div class="ch-coluna">' + (mensagens.length
      ? mensagens.map(m => '<div class="ch-msg ' + (m.papel === 'ia' ? 'is-bot' : 'is-eu') + '"><div class="ch-bubble' + (m.erro ? ' pll-erro' : '') + '">' +
          (m.papel === 'ia' ? formatar(m.texto) : esc(m.texto).replace(/\n/g, '<br>')) + '</div></div>').join('')
      : '<div class="ch-boasvindas"><span class="ch-avatar is-xl titulo-serifa"><img data-ia-foto width="512" height="512" src="' + FOTO + '" alt=""></span><h2>Oi' + (nome ? ', ' + esc(nome) : '') + '! Eu sou a Luísa.</h2>' +
        '<p>Sou a auxiliar de logística. Converso com as equipes em cada montagem e desmontagem e guardo o que elas contam: entrega, acessos, comentários do decorador, ocorrências e orientações para a desmontagem. Pergunte o que quiser sobre os eventos.</p></div>' +
        '<div class="ch-sugestoes">' + SUGESTOES.map(t => '<button type="button" data-pll-sugestao="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>') +
      (ocupado ? '<div class="ch-msg is-bot"><div class="ch-bubble ch-digitando" aria-label="Luísa está pensando"><i></i><i></i><i></i></div></div>' : '') + '</div>';
    lista.scrollTop = lista.scrollHeight;
    host.querySelector('#pllEnviar').disabled = ocupado;
  }
  async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    mensagens.push({ papel: 'pessoa', texto });
    ocupado = true; pintar(); salvar();
    try {
      const { data, error } = await window.supabaseClient.functions.invoke('logistica-assistente', {
        body: { empresa_id: ctx.empresa_id, mensagens: mensagens.filter(m => !m.erro).map(m => ({ papel: m.papel, texto: m.texto })) }
      });
      let msg = data?.erro;
      if (error && !msg) { try { msg = (await error.context?.json?.())?.erro; } catch (_) {} msg = msg || 'Não consegui responder agora. Tente de novo.'; }
      if (msg) mensagens.push({ papel: 'ia', texto: msg, erro: true });
      else mensagens.push({ papel: 'ia', texto: data?.resposta || 'Não encontrei nada sobre isso nos relatos.' });
    } catch (e) {
      mensagens.push({ papel: 'ia', texto: e.message || 'Não consegui responder agora.', erro: true });
    }
    ocupado = false; pintar(); salvar(); host.querySelector('#pllTexto')?.focus();
  }
  async function iniciar() {
    host = document.getElementById('plModuloLuisa');
    ctx = await window.aguardarContexto();
    chave = 'luisa_supervisor:' + ctx.empresa_id + ':' + (ctx.usuario_id || '');
    try { mensagens = JSON.parse(sessionStorage.getItem(chave) || '[]'); } catch (_) { mensagens = []; }
    host.innerHTML = '<section class="ch-tela ia-chat-com-topo" aria-label="Conversa com a Luísa">' +
      '<header class="ia-topo"><span class="ia-topo-foto" aria-hidden="true"><img data-ia-foto width="512" height="512" src="' + FOTO + '" alt=""></span>' +
      '<div class="ia-topo-texto"><strong>Luísa</strong><small><i class="ia-topo-dot" aria-hidden="true"></i><span>Auxiliar de logística · online</span></small></div>' +
      '<div class="ia-topo-acoes"><button type="button" class="ia-topo-btn" id="pllNovaTopo" title="Começar uma nova conversa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg><span>Nova conversa</span></button></div></header>' +
      '<div class="ia-chat-corpo"><div class="ch-conversa"><div class="ch-msgs" id="pllMsgs"></div>' +
      '<form class="ch-form" id="pllForm"><div class="ch-form-in"><textarea id="pllTexto" rows="1" placeholder="Pergunte sobre as montagens…" aria-label="Mensagem para a Luísa"></textarea>' +
      '<button type="submit" class="ch-send" id="pllEnviar" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6-8-2Z"/><path d="m12 14 8-10"/></svg></button></div>' +
      '<small class="ch-form-dica">Enter envia · Shift+Enter quebra a linha · a Luísa responde com o que as equipes relataram e não altera escala nem pedidos</small></form></div>' +
      '<aside class="ch-lado"><p class="ch-lado-kicker">Análises da Luísa</p><h3>Pergunte sobre as equipes</h3>' +
      '<p class="ch-lado-sub">A Luísa cruza os relatos de todas as equipes com a escala de cada montagem e desmontagem.</p>' +
      '<div class="clp-rels">' + ANALISES.map(([t], i) => '<button type="button" class="clp-rel" data-pll-analise="' + i + '"><b>' + esc(t) + '</b><span>Perguntar à Luísa</span></button>').join('') + '</div>' +
      '<button type="button" class="ch-lado-nova" id="pllNova">Nova conversa</button></aside></div></section>';
    const campo = host.querySelector('#pllTexto'), form = host.querySelector('#pllForm');
    const ajustar = () => { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 160) + 'px'; };
    campo.addEventListener('input', ajustar);
    campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', e => { e.preventDefault(); const t = campo.value; campo.value = ''; ajustar(); enviar(t); });
    host.addEventListener('click', e => {
      const s = e.target.closest('[data-pll-sugestao]'); if (s) enviar(s.dataset.pllSugestao);
      const a = e.target.closest('[data-pll-analise]'); if (a) enviar(ANALISES[Number(a.dataset.pllAnalise)][1]);
      if (e.target.closest('#pllNova,#pllNovaTopo') && !ocupado) { mensagens = []; salvar(); pintar(); campo.focus(); }
    });
    pintar();
  }
  window.PainelLuisa = { iniciar };
})();
