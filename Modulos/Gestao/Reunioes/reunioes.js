/* Reuniões (nov/2026). Agenda, convites, gravação, transcrição com as vozes cadastradas e ata pela IA.
   Banco: supabase/migrations/20261111000700_reunioes.sql. IA: Edge Function reunioes-ia.
   A gravação é feita em partes de 5 minutos: cada parte sobe assim que fecha (nada se perde se o navegador cair) e
   já é transcrita em segundo plano, então ao encerrar a reunião a ata fica pronta em pouco tempo. */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FUSO = 'America/Sao_Paulo';
  const PARTE_SEG = 300;
  const TIPOS = ['Diretoria', 'Comercial', 'Operação', 'Logística', 'Financeiro', 'RH', 'Alinhamento semanal', 'Conversa individual', 'Treinamento'];
  const CORES = ['#123f86', '#b08d57', '#1f7a44', '#7a4fc2', '#c4453b', '#0e7490', '#b45309', '#475569'];
  const I = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    pausa: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    rel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M15 10l4.5-3v10L15 14"/><rect x="3" y="7" width="12" height="10" rx="2"/></svg>',
    org: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    esq: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    dir: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    ia: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  };

  await window.aguardarContexto?.();
  const ctx = window.__CONTEXT || {};
  const client = window.supabaseClient;
  const S = {
    emp: ctx.empresa_id, eu: ctx.usuario_id, porId: new Map(), de: null, ate: null, pessoas: [], tarefas: [], vista: 'proximas', lado: 'reunioes', diaSel: null, filtroAta: 'todas',
    det: null, aba: 'ata', mes: inicioMes(new Date()), busca: '',
    rec: null, envios: 0, fila: Promise.resolve(), proc: null, respostas: [], falhas: [],
  };
  if (!S.emp) { $('rnCentro').innerHTML = '<div class="rn-card rn-card-pad">Não foi possível identificar a empresa. Entre de novo no sistema.</div>'; return; }

  // ── utilidades ─────────────────────────────────────────────────────────────────────────────────────────────
  function inicioMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  const diaChave = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: FUSO });
  const hojeChave = () => diaChave(new Date());
  const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  const dataLonga = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long' });
  const dataCurta = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: 'short' });
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
  const duracaoTxt = (min) => min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`;
  const cor = (t) => { let h = 0; for (const c of String(t || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  function fotoUrl(id) { if (!id) return ''; const { data } = client.storage.from('avatares').getPublicUrl(`${S.emp}/${id}.jpg`); return data?.publicUrl || ''; }
  function av(id, nome, extra = '') {
    const u = fotoUrl(id);
    return `<span class="rn-av ${extra}" style="--rn-av:${cor(nome)}" title="${esc(nome)}">${esc(iniciais(nome))}${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  }
  const ok = (m) => window.alerta?.(m, 'Reuniões', 'success');
  const erro = (e) => window.alerta?.(String(e?.message || e), 'Reuniões', 'error');
  async function rpc(n, a) { const { data, error } = await client.rpc(n, a); if (error) throw error; return data; }
  async function ia(body) {
    const { data, error } = await client.functions.invoke('reunioes-ia', { body: { ...body, empresa_id: S.emp } });
    if (error) { let d; try { d = await error.context?.json(); } catch {} throw new Error(d?.erro || d?.error || error.message); }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }
  const confirmar = (m, t = 'Reuniões') => window.confirmarGlobal ? window.confirmarGlobal(m, t) : Promise.resolve(confirm(m));

  // ── dados ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function carregarIntervalo(de, ate) {
    const lista = await rpc('reunioes_listar', { p_empresa: S.emp, p_de: diaChave(de), p_ate: diaChave(ate) });
    S.porId.clear(); lista.forEach((r) => S.porId.set(r.id, r)); S.de = de; S.ate = ate;
  }
  async function garantirPeriodo(mes) {
    const de = new Date(mes.getFullYear(), mes.getMonth() - 3, 1), ate = new Date(mes.getFullYear(), mes.getMonth() + 7, 0);
    if (S.de && de >= S.de && ate <= S.ate) return;
    await carregarIntervalo(S.de && S.de < de ? S.de : de, S.ate && S.ate > ate ? S.ate : ate);
  }
  async function recarregarLista() { const de = S.de, ate = S.ate; if (de) await carregarIntervalo(de, ate); else await garantirPeriodo(S.mes); pintarLista(); }
  async function carregarApoio() {
    const [p, t] = await Promise.all([
      rpc('reunioes_pessoas', { p_empresa: S.emp }).catch(() => []),
      rpc('reunioes_minhas_tarefas', { p_empresa: S.emp }).catch(() => []),
    ]);
    S.pessoas = p || []; S.tarefas = t || [];
  }

  // ── abas da página (Próximas, Convites, Realizadas, Calendário, Minhas tarefas) ──────────────────────────────
  function bate(r) {
    if (!S.busca) return true;
    const q = norm(S.busca);
    return [r.titulo, r.tipo, r.local, r.organizador_nome, r.resumo, ...(r.participantes || []).map((p) => p.nome)].some((x) => norm(x).includes(q));
  }
  const fimDe = (r) => new Date(r.inicio).getTime() + (r.duracao_min || 60) * 60e3;
  const convites = () => [...S.porId.values()].filter((r) => r.minha_resposta === 'pendente' && !r.sou_organizador && r.status !== 'cancelada' && new Date(r.inicio) > Date.now() - 3600e3);
  // "Em andamento" que terminou há mais de 3 h e não está gravando agora = gravação esquecida: vai para Realizadas (sem ata)
  const ANDAMENTO_FOLGA = 3 * 3600e3;
  const andando = (r) => r.status === 'em_andamento' && (S.rec?.id === r.id || fimDe(r) + ANDAMENTO_FOLGA > Date.now());
  const proximas = () => [...S.porId.values()].filter((r) => andando(r) || (r.status !== 'realizada' && r.status !== 'em_andamento' && fimDe(r) > Date.now())).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const realizadas = () => [...S.porId.values()].filter((r) => !andando(r) && r.status !== 'cancelada' && (r.status === 'realizada' || fimDe(r) <= Date.now())).sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
  const paraRevisar = () => realizadas().filter((r) => r.ata_status === 'rascunho' && r.sou_organizador);

  function statusChip(r) {
    if (r.status === 'cancelada') return '<span class="rn-chip vermelho">Cancelada</span>';
    if (S.rec?.id === r.id) return '<span class="rn-chip vivo">Gravando</span>';
    if (r.status === 'em_andamento') return andando(r) ? '<span class="rn-chip vivo">Em andamento</span>' : '<span class="rn-chip">Gravação não encerrada</span>';
    if (r.ata_status === 'aprovada') return '<span class="rn-chip verde">Ata aprovada</span>';
    if (r.ata_status === 'rascunho') return '<span class="rn-chip ouro">Ata para revisar</span>';
    if (r.status === 'realizada') return '<span class="rn-chip">Realizada</span>';
    if (r.minha_resposta === 'pendente' && !r.sou_organizador && fimDe(r) > Date.now()) return '<span class="rn-chip amarelo">Responder convite</span>';
    return '';
  }
  function badge(id, n) { const b = $(id); if (!b) return; b.hidden = !n; b.textContent = n; }
  function atualizarBadges() {
    badge('rnQtdConvites', convites().length);
    badge('rnQtdRevisar', paraRevisar().length);
  }
  function pintarLista() { atualizarBadges(); if (!S.det) pintarVista(); }
  function marcarAba() { document.querySelectorAll('.rn-abas-top [data-vista]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.vista === S.vista))); }

  function pintarVista() {
    $('rnDetalhe').hidden = true; $('rnVista').hidden = false;
    marcarAba(); atualizarBadges();
    const v = S.vista;
    if (v === 'convites') return pintarConvites();
    if (v === 'realizadas') return pintarRealizadas();
    pintarProximas();
  }
  function trocarVista(v) {
    S.vista = v; S.det = null; history.replaceState(null, '', v === 'proximas' ? location.pathname : `${location.pathname}?aba=${v}`);
    pintarFlutuante(); pintarVista(); scrollTo({ top: 0 });
  }
  function rotuloDia(k) {
    const hoje = hojeChave(), amanha = diaChave(new Date(Date.now() + 864e5)), ontem = diaChave(new Date(Date.now() - 864e5));
    const longa = new Date(k + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    return (k === hoje ? 'Hoje · ' : k === amanha ? 'Amanhã · ' : k === ontem ? 'Ontem · ' : '') + longa;
  }
  function avsHtml(r, max = 5) {
    const ps = r.participantes || [];
    return `<span class="rn-avs">${ps.slice(0, max).map((p) => av(p.funcionario_id, p.nome)).join('')}${ps.length > max ? `<span class="rn-av rn-av-mais">+${ps.length - max}</span>` : ''}</span>`;
  }
  function linhaHtml(r, o = {}) {
    const ps = r.participantes || [];
    const conf = ps.filter((p) => p.resposta === 'confirmado').length;
    const meta = (o.compacta ? [r.tipo, r.local] : [r.tipo, r.local, r.organizador_nome ? 'marcada por ' + r.organizador_nome : '']).filter(Boolean).map(esc).join(' · ');
    const extra = o.resumo && r.resumo ? `<span class="rn-linha-resumo">${esc(r.resumo)}</span>` : '';
    const rsvp = o.rsvp ? `<span class="rn-linha-rsvp">${[['confirmado', 'Vou'], ['talvez', 'Talvez'], ['recusado', 'Não vou']].map(([k, t]) => `<button type="button" class="rn-rsvp-mini ${k}" data-rsvp-linha="${k}" data-id="${r.id}">${t}</button>`).join('')}</span>` : '';
    return `<div class="rn-linha ${o.compacta ? 'compacta' : ''} ${r.status === 'cancelada' ? 'cancelada' : ''}" role="button" tabindex="0" data-abrir="${r.id}" style="--rn-cor:${cor(r.tipo || r.titulo)}">
      <span class="rn-linha-hora"><b>${hora(r.inicio)}</b><small>${duracaoTxt(r.duracao_min)}</small></span>
      <span class="rn-linha-txt"><span class="rn-linha-tit">${esc(r.titulo)}${r.visibilidade === 'confidencial' ? ' <span title="Confidencial">🔒</span>' : ''}</span><span class="rn-linha-meta">${meta}</span>${extra}</span>
      <span class="rn-linha-fim">${statusChip(r)}${rsvp || `<span class="rn-linha-pessoas">${avsHtml(r, 4)}${ps.length && !o.resumo && !o.compacta ? `<small>${conf}/${ps.length} confirmados</small>` : ''}</span>`}</span>
    </div>`;
  }
  function gruposPorDia(itens, o) {
    let html = '', ult = '';
    for (const r of itens) {
      const k = diaChave(r.inicio);
      if (k !== ult) { if (ult) html += '</div>'; ult = k; html += `<div class="rn-grupo"><div class="rn-grupo-tit">${esc(rotuloDia(k))}</div>`; }
      html += linhaHtml(r, o);
    }
    return html + (ult ? '</div>' : '');
  }
  const vazio = (titulo, txt, botao) => `<div class="rn-card rn-vazio-vista"><span class="titulo-serifa">${titulo}</span><p>${txt}</p>${botao ? `<button type="button" class="rn-btn rn-btn-pri" data-nova>${I.cal} Marcar reunião</button>` : ''}</div>`;

  function pintarProximas() {
    const lista = proximas().filter(bate);
    // calendário do mês ao lado da lista: escolher um dia mostra só as reuniões dele
    let itens = lista, titLista = 'Próximas reuniões';
    if (S.diaSel) {
      itens = [...S.porId.values()].filter((r) => diaChave(r.inicio) === S.diaSel && bate(r)).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      titLista = rotuloDia(S.diaSel);
    }
    const atras = S.tarefas.filter((t) => t.prazo && t.prazo < hojeChave()).length;
    const subAbas = `<nav class="rn-lado-abas el-tabs" role="tablist" aria-label="Próximas reuniões e tarefas">
      <button type="button" role="tab" data-lado="reunioes" aria-selected="${S.lado === 'reunioes'}">Próximas reuniões</button>
      <button type="button" role="tab" data-lado="tarefas" aria-selected="${S.lado === 'tarefas'}">Minhas tarefas<b class="rn-bolinha"${atras ? '' : ' hidden'}>${atras}</b></button></nav>`;
    if (S.lado === 'tarefas') {
      $('rnVista').innerHTML = `<div class="rn-agenda">${calendarioHtml()}<div class="rn-agenda-lista">${subAbas}${tarefasLista()}</div></div>`;
      return;
    }
    const lado = `<div class="rn-agenda-lista">${subAbas}<div class="rn-agenda-tit"><span>${esc(titLista)}</span>${S.diaSel && itens.length && S.diaSel >= hojeChave() ? `<button type="button" data-nova-dia="${S.diaSel}">+ marcar neste dia</button>` : ''}${S.diaSel ? '<button type="button" data-dia-todas>ver todas</button>' : ''}</div>
      ${itens.length ? `<div class="rn-lista-dias">${S.diaSel ? itens.map((x) => linhaHtml(x, { compacta: true })).join('') : gruposPorDia(itens, { compacta: true })}</div>`
        : `<div class="rn-card rn-vazio-vista rn-vazio-min"><p>${S.busca ? 'Nada encontrado com essa pesquisa.' : S.diaSel ? 'Nenhuma reunião neste dia.' : 'Nenhuma reunião marcada.'}</p>${!S.busca && (!S.diaSel || S.diaSel >= hojeChave()) ? `<button type="button" class="rn-btn rn-btn-sec rn-btn-min" ${S.diaSel ? `data-nova-dia="${S.diaSel}"` : 'data-nova'}>${I.cal} Marcar reunião</button>` : ''}</div>`}</div>`;
    $('rnVista').innerHTML = `<div class="rn-agenda">${calendarioHtml()}${lado}</div>`;
  }
  function pintarConvites() {
    const lista = convites().filter(bate).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    $('rnVista').innerHTML = lista.length ? `<p class="rn-intro">Reuniões para as quais você foi convidado e ainda não respondeu. Quem marcou vê a sua resposta.</p><div class="rn-lista-dias">${gruposPorDia(lista, { rsvp: true })}</div>`
      : vazio('Nenhum convite esperando', S.busca ? 'Nada encontrado com essa pesquisa.' : 'Quando alguém convidar você para uma reunião, ela aparece aqui para você responder.');
  }
  function pintarRealizadas() {
    const todas = realizadas().filter(bate);
    const f = S.filtroAta || 'todas';
    const tipoAta = (r) => r.ata_status === 'rascunho' ? 'revisar' : r.ata_status === 'aprovada' ? 'aprovadas' : 'sem';
    const lista = todas.filter((r) => f === 'todas' || tipoAta(r) === f);
    const q = (k) => todas.filter((r) => tipoAta(r) === k).length;
    const filtros = `<div class="rn-filtros">${[['todas', 'Todas', todas.length], ['revisar', 'Ata para revisar', q('revisar')], ['aprovadas', 'Ata aprovada', q('aprovadas')], ['sem', 'Sem ata', q('sem')]]
      .map(([k, t, n]) => `<button type="button" class="${f === k ? 'on' : ''}" data-filtro-ata="${k}">${t}<span>${n}</span></button>`).join('')}</div>`;
    $('rnVista').innerHTML = filtros + (lista.length ? `<div class="rn-lista-dias">${gruposPorDia(lista, { resumo: true })}</div>` : vazio('Nenhuma reunião aqui', S.busca ? 'Nada encontrado com essa pesquisa.' : 'As reuniões que já aconteceram aparecem aqui, com a ata.'))
      + `<div class="rn-mais"><button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-antigas>Mostrar reuniões de antes de ${esc(S.de.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</button></div>`;
  }
  function calendarioHtml() {
    const m = S.mes, porDia = {};
    for (const r of S.porId.values()) if (bate(r)) (porDia[diaChave(r.inicio)] ||= []).push(r);
    Object.values(porDia).forEach((l) => l.sort((a, b) => new Date(a.inicio) - new Date(b.inicio)));
    const primeiro = new Date(m.getFullYear(), m.getMonth(), 1), ini = new Date(primeiro); ini.setDate(1 - primeiro.getDay());
    const semanas = Math.ceil((primeiro.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
    let dias = '';
    for (let i = 0; i < semanas * 7; i++) {
      const d = new Date(ini); d.setDate(ini.getDate() + i);
      const k = diaChave(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
      const rs = porDia[k] || [];
      dias += `<div class="rn-cdia ${d.getMonth() !== m.getMonth() ? 'fora' : ''} ${k === hojeChave() ? 'hoje' : ''} ${k < hojeChave() ? 'passado' : ''} ${k === S.diaSel ? 'sel' : ''} ${rs.length ? 'tem' : ''}" data-cdia="${k}">
        <span class="rn-cdia-num">${d.getDate()}</span>
        ${rs.slice(0, 2).map((r) => `<button type="button" class="rn-cevt ${r.status === 'cancelada' ? 'cancelada' : ''}" data-abrir="${r.id}" style="--rn-cor:${cor(r.tipo || r.titulo)}" title="${esc(hora(r.inicio) + ' · ' + r.titulo)}">${esc(r.titulo)}</button>`).join('')}
        ${rs.length > 2 ? `<button type="button" class="rn-cmais" data-cdia-mais="${k}">+${rs.length - 2} mais</button>` : ''}</div>`;
    }
    const nomeMes = (() => { const t = m.toLocaleDateString('pt-BR', { month: 'long' }); return t[0].toUpperCase() + t.slice(1); })();
    return `<section class="rn-card rn-calendario">
      <div class="rn-cal-topo"><button type="button" data-mes="-1" aria-label="Mês anterior">${I.esq}</button><strong>${nomeMes} ${m.getFullYear()}</strong><button type="button" data-mes="1" aria-label="Próximo mês">${I.dir}</button><button type="button" class="rn-cal-hoje" data-mes="0">Hoje</button>
        <span class="rn-dica">Clique num dia para ver as reuniões dele.</span></div>
      <div class="rn-cgrade">${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((x) => `<span class="rn-csem">${x}</span>`).join('')}${dias}</div></section>`;
  }
  function tarefasLista() {
    const ts = S.tarefas.filter((t) => !S.busca || norm(t.descricao + ' ' + t.reuniao_titulo).includes(norm(S.busca)));
    return ts.length ? `<section class="rn-card rn-card-pad rn-tarefas-vista"><div class="rn-tit-sec">Suas tarefas em aberto<span>${ts.length}</span></div>${ts.map((t) => tarefaHtml({ ...t, responsavel_nome: '' }, { link: true })).join('')}</section>`
      : `<div class="rn-card rn-vazio-vista rn-vazio-min"><p>${S.busca ? 'Nada encontrado com essa pesquisa.' : 'Nenhuma tarefa em aberto. Quando a ata de uma reunião der uma tarefa para você, ela aparece aqui.'}</p></div>`;
  }

  document.querySelectorAll('.rn-abas-top').forEach((n) => n.addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) trocarVista(b.dataset.vista); }));
  $('rnVista').addEventListener('click', async (e) => {
    const rs = e.target.closest('[data-rsvp-linha]');
    if (rs) {
      try {
        await rpc('reuniao_responder', { p_id: rs.dataset.id, p_resposta: rs.dataset.rsvpLinha });
        const r = S.porId.get(rs.dataset.id); if (r) r.minha_resposta = rs.dataset.rsvpLinha;
        ok({ confirmado: 'Presença confirmada.', talvez: 'Resposta enviada: talvez.', recusado: 'Resposta enviada: não vai.' }[rs.dataset.rsvpLinha]);
        pintarLista();
      } catch (err) { erro(err); }
      return;
    }
    const ir = e.target.closest('[data-ir]'); if (ir) return trocarVista(ir.dataset.ir);
    if (e.target.closest('[data-nova]')) return abrirFormulario();
    const fa = e.target.closest('[data-filtro-ata]'); if (fa) { S.filtroAta = fa.dataset.filtroAta; return pintarRealizadas(); }
    if (e.target.closest('[data-antigas]')) {
      try { await carregarIntervalo(new Date(S.de.getFullYear(), S.de.getMonth() - 6, 1), S.ate); pintarRealizadas(); } catch (err) { erro(err); }
      return;
    }
    const ms = e.target.closest('[data-mes]');
    if (ms) {
      const n = Number(ms.dataset.mes);
      S.mes = n === 0 ? inicioMes(new Date()) : new Date(S.mes.getFullYear(), S.mes.getMonth() + n, 1);
      try { await garantirPeriodo(S.mes); } catch (err) { erro(err); }
      return pintarProximas();
    }
    const la = e.target.closest('[data-lado]'); if (la) { S.lado = la.dataset.lado; return pintarProximas(); }
    if (e.target.closest('[data-dia-todas]')) { S.diaSel = null; return pintarProximas(); }
    const nd = e.target.closest('[data-nova-dia]'); if (nd) return novaNoDia(nd.dataset.novaDia);
    const cm = e.target.closest('[data-cdia-mais]'); if (cm) { S.diaSel = cm.dataset.cdiaMais; S.lado = 'reunioes'; return pintarProximas(); }
    if (e.target.closest('.rn-tarefa')) return;
    const a = e.target.closest('[data-abrir]'); if (a) return abrir(a.dataset.abrir);
    const dia = e.target.closest('[data-cdia]');
    if (dia) { S.diaSel = S.diaSel === dia.dataset.cdia ? null : dia.dataset.cdia; S.lado = 'reunioes'; pintarProximas(); }
  });
  function novaNoDia(k) {
    const d = new Date(`${k}T09:00:00-03:00`);
    abrirFormulario({ inicio: (d < Date.now() ? new Date(Math.ceil((Date.now() + 1800e3) / 1800e3) * 1800e3) : d).toISOString() });
  }
  $('rnVista').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-abrir][role=button]')) { e.preventDefault(); abrir(e.target.dataset.abrir); } });
  let tBusca;
  $('rnBusca').addEventListener('input', (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { S.busca = e.target.value.trim(); if (S.det) voltar(); else pintarVista(); }, 150); });
  $('rnNova').addEventListener('click', () => abrirFormulario());
  $('rnVoltar').addEventListener('click', () => voltar());
  function voltar() { S.det = null; history.replaceState(null, '', S.vista === 'proximas' ? location.pathname : `${location.pathname}?aba=${S.vista}`); pintarFlutuante(); pintarVista(); scrollTo({ top: 0 }); }

  // ── reunião ────────────────────────────────────────────────────────────────────────────────────────────────
  async function abrir(id, manterAba) {
    try {
      const det = await rpc('reuniao_obter', { p_id: id });
      if (S.det?.id !== id) { S.respostas = []; if (!manterAba) S.aba = det.ata ? 'ata' : (det.partes ? 'transcricao' : 'pauta'); }
      S.det = det; S.porId.set(id, { ...(S.porId.get(id) || {}), ...det, resumo: det.ata?.resumo });
      history.replaceState(null, '', `${location.pathname}?id=${id}`);
      const trocou = $('rnDetalhe').hidden;
      pintarDetalhe(); pintarLista();
      if (trocou) scrollTo({ top: 0 });
    } catch (e) { erro(e); }
  }

  function pintarDetalhe() {
    const r = S.det; if (!r) return voltar();
    $('rnVista').hidden = true; $('rnDetalhe').hidden = false; marcarAba();
    const link = r.link ? (/^https?:\/\//i.test(r.link) ? r.link : 'https://' + r.link) : '';
    const visTxt = { empresa: 'Toda a equipe vê', participantes: 'Só os convidados', confidencial: '🔒 Confidencial' }[r.visibilidade];
    // capa numa linha só, ao lado do Voltar (o que não cabe é cortado com "…"; o texto inteiro aparece ao passar o mouse)
    const info = [dataLonga(r.inicio), `${hora(r.inicio)} · ${duracaoTxt(r.duracao_min)}`, r.local, `Marcada por ${r.organizador_nome || '—'}`].filter(Boolean);
    $('rnCapa').innerHTML = `${r.tipo ? `<span class="rn-chip" style="background:${cor(r.tipo)}1a;color:${cor(r.tipo)}">${esc(r.tipo)}</span>` : ''}${statusChip(r)}<span class="rn-chip">${visTxt}</span>${r.serie_id ? '<span class="rn-chip azul">Toda semana</span>' : ''}
      <h2 class="rn-titulo" title="${esc(r.titulo)}">${esc(r.titulo)}</h2>
      <span class="rn-capa-info" title="${esc(info.join(' · '))}">${I.cal}<span>${info.map(esc).join(' · ')}</span></span>
      ${link ? `<a class="rn-capa-link" href="${esc(link)}" target="_blank" rel="noopener">${I.link}Entrar na videochamada</a>` : ''}`;
    $('rnCentro').innerHTML = `
      ${r.status === 'cancelada' ? `<div class="rn-card rn-card-pad rn-aviso-cancelada">Reunião cancelada${r.cancelado_motivo ? ': ' + esc(r.cancelado_motivo) : '.'}</div>` : ''}
      ${r.status !== 'cancelada' && r.pode_editar && r.ata_status !== 'aprovada' ? `<section class="rn-card rn-grav" id="rnGrav"></section>` : ''}
      <section class="rn-card">
        <nav class="rn-tabs" role="tablist">
          <button type="button" role="tab" data-aba="ata" aria-selected="${S.aba === 'ata'}">Ata</button>
          <button type="button" role="tab" data-aba="transcricao" aria-selected="${S.aba === 'transcricao'}">Transcrição${r.partes ? ` · ${mmss(r.gravacao_segundos)}` : ''}</button>
          <button type="button" role="tab" data-aba="pauta" aria-selected="${S.aba === 'pauta'}">Pauta e anotações</button>
        </nav>
        <div class="rn-tab-corpo" id="rnTab"></div>
      </section>`;
    pintarGravador(); pintarAba(); pintarLateral();
  }

  // ── gravador ───────────────────────────────────────────────────────────────────────────────────────────────
  function pintarGravador() {
    const box = $('rnGrav'); if (!box || !S.det) return;
    const r = S.det, gravandoAqui = S.rec?.id === r.id, outra = S.rec && !gravandoAqui;
    box.classList.toggle('gravando', gravandoAqui && !S.rec.pausaIni);
    if (S.proc?.id === r.id) {
      const p = S.proc;
      box.innerHTML = `<button type="button" class="rn-grav-bola" disabled>${I.ia}</button><div class="rn-grav-txt"><strong>${esc(p.titulo)}</strong><small>Pode continuar usando o sistema: avisamos quando a ata ficar pronta.</small></div><div></div>
        <div class="rn-grav-passos">${p.passos.map((x, i) => `<div class="rn-passo ${i < p.at ? 'feito' : i === p.at ? 'agora' : ''}"><i></i>${esc(x)}</div>`).join('')}</div>`;
      return;
    }
    if (gravandoAqui) {
      const pausado = !!S.rec.pausaIni;
      box.innerHTML = `<button type="button" class="rn-grav-bola" data-g="${pausado ? 'continuar' : 'pausar'}" aria-label="${pausado ? 'Continuar' : 'Pausar'}">${pausado ? I.play : I.pausa}</button>
        <div class="rn-grav-txt"><span class="rn-grav-tempo" id="rnTempo">${mmss(tempoTotal())}</span><canvas id="rnOnda" height="46"></canvas>
          <small>${pausado ? 'Gravação pausada.' : 'Gravando. Deixe o aparelho no centro da mesa.'} Salva sozinha a cada 5 minutos${S.rec.ordem > 1 || S.envios ? ` · ${S.rec.ordem - 1} parte(s) salva(s)` : ''}.</small></div>
        <div class="rn-grav-lado"><button type="button" class="rn-btn rn-btn-pri" data-g="encerrar">${I.stop} Encerrar e gerar a ata</button><button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-g="encerrar-sem">Encerrar sem gerar</button></div>`;
      return;
    }
    const temPartes = (r.partes_lista || []).length;
    const pend = (r.partes_lista || []).filter((x) => !x.transcrita).length;
    box.innerHTML = `<button type="button" class="rn-grav-bola" data-g="gravar" ${outra ? 'disabled' : ''} aria-label="Começar a gravar">${I.mic}</button>
      <div class="rn-grav-txt"><strong>${outra ? 'Outra reunião está sendo gravada' : temPartes ? 'Continuar gravando' : 'Gravar a reunião'}</strong>
        <small>${outra ? 'Encerre a gravação atual para gravar esta.' : 'A IA separa quem falou, reconhece as vozes cadastradas e escreve a ata com decisões e tarefas.'}${temPartes ? ` Já gravado: ${mmss(r.gravacao_segundos)}.` : ''}</small></div>
      <div class="rn-grav-lado">
        ${temPartes ? `<button type="button" class="rn-btn rn-btn-pri" data-g="gerar">${I.ia} ${r.ata ? 'Gerar a ata de novo' : 'Gerar a ata'}${pend ? ` (${pend} parte${pend > 1 ? 's' : ''} para transcrever)` : ''}</button>` : ''}
        <button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-g="arquivo">${I.up} Enviar áudio</button><input type="file" accept="audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.webm" hidden data-g-arquivo>
      </div>
      ${S.falhas.length ? `<div class="rn-partes-mini">⚠ ${S.falhas.length} parte(s) não subiram. ${S.falhas.map((f, i) => `<a href="${f.url}" download="reuniao-parte-${f.ordem}.webm">baixar parte ${f.ordem}</a> <button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-g-reenviar="${i}">tentar de novo</button>`).join(' ')}</div>` : ''}`;
  }
  $('rnCentro').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = b.dataset.g;
    if (g === 'gravar') return iniciarGravacao();
    if (g === 'pausar') return pausar(true);
    if (g === 'continuar') return pausar(false);
    if (g === 'encerrar') return encerrar(true);
    if (g === 'encerrar-sem') return encerrar(false);
    if (g === 'gerar') return processar(S.det.id, true);
    if (g === 'arquivo') return document.querySelector('[data-g-arquivo]')?.click();
  });
  $('rnCentro').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g-reenviar]'); if (!b) return;
    const f = S.falhas.splice(Number(b.dataset.gReenviar), 1)[0]; if (f) enviarParte(f);
  });
  $('rnCentro').addEventListener('change', async (e) => {
    if (!e.target.matches('[data-g-arquivo]')) return;
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 25 * 1024 * 1024) return erro('O arquivo passou de 25 MB. Envie em qualidade menor ou em partes.');
    const seg = await duracaoArquivo(f);
    const ordem = proximaOrdem(S.det);
    await enviarParte({ id: S.det.id, ordem, blob: f, seg, tipo: f.type || 'audio/mpeg' });
    processar(S.det.id, true);
  });
  function duracaoArquivo(f) {
    return new Promise((res) => { const a = new Audio(); const u = URL.createObjectURL(f); a.preload = 'metadata'; a.onloadedmetadata = () => { res(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; });
  }
  const proximaOrdem = (det) => Math.max(0, ...(det.partes_lista || []).map((p) => p.ordem)) + 1;
  function tempoTotal() {
    const r = S.rec; if (!r) return 0;
    return r.base + segParte(r);
  }
  function segParte(r) { return Math.max(0, (Date.now() - r.parteIni - r.parteMsPausa - (r.pausaIni ? Date.now() - r.pausaIni : 0)) / 1000); }

  async function iniciarGravacao() {
    if (S.rec) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return erro('Este navegador não grava áudio. Grave no celular e use "Enviar áudio".');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { return erro('Permita o uso do microfone para gravar.'); }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const r = { id: S.det.id, titulo: S.det.titulo, stream, tipo, ordem: proximaOrdem(S.det), base: S.det.gravacao_segundos || 0 };
    try { r.ac = new (window.AudioContext || window.webkitAudioContext)(); await r.ac.resume?.(); r.an = r.ac.createAnalyser(); r.an.fftSize = 256; r.ac.createMediaStreamSource(stream).connect(r.an); } catch {}
    try { r.wake = await navigator.wakeLock?.request('screen'); } catch {}
    S.rec = r;
    novaParte(r);
    r.timer = setInterval(() => {
      const t = $('rnTempo'); if (t) t.textContent = mmss(tempoTotal());
      pintarFlutuante();
      if (!r.pausaIni && segParte(r) >= PARTE_SEG) fecharParte(r, true);
    }, 500);
    desenharOnda();
    try { if (S.det.status === 'agendada') await rpc('reuniao_status', { p_id: r.id, p_status: 'em_andamento' }); S.det.status = 'em_andamento'; } catch {}
    pintarDetalhe(); pintarLista();
  }
  function novaParte(r) {
    const mr = new MediaRecorder(r.stream, { ...(r.tipo ? { mimeType: r.tipo } : {}), audioBitsPerSecond: 32000 });
    const pedacos = [];
    mr.ondataavailable = (ev) => ev.data.size && pedacos.push(ev.data);
    r.mr = mr; r.pedacos = pedacos; r.parteIni = Date.now(); r.parteMsPausa = 0;
    mr.start(5000);
  }
  function fecharParte(r, continuar) {
    const mr = r.mr, pedacos = r.pedacos, seg = Math.round(segParte(r)), ordem = r.ordem++;
    if (r.pausaIni) { r.parteMsPausa += Date.now() - r.pausaIni; r.pausaIni = null; }
    r.base += seg;
    if (continuar) novaParte(r);
    return new Promise((res) => {
      mr.onstop = () => {
        const blob = new Blob(pedacos, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
        res(enviarParte({ id: r.id, ordem, blob, seg, tipo: blob.type }));
      };
      try { mr.state !== 'inactive' ? mr.stop() : mr.onstop(); } catch { mr.onstop(); }
    });
  }
  function pausar(sim) {
    const r = S.rec; if (!r) return;
    if (sim && !r.pausaIni) { r.mr.pause?.(); r.pausaIni = Date.now(); }
    if (!sim && r.pausaIni) { r.mr.resume?.(); r.parteMsPausa += Date.now() - r.pausaIni; r.pausaIni = null; }
    if (S.det?.id === r.id) pintarGravador();
  }
  async function encerrar(gerar) {
    const r = S.rec; if (!r) return;
    if (tempoTotal() < 5 && !(await confirmar('A gravação tem poucos segundos. Encerrar mesmo assim?'))) return;
    clearInterval(r.timer); cancelAnimationFrame(r.raf);
    S.rec = null;
    const envio = fecharParte(r, false);
    pintarFlutuante();
    if (S.det?.id === r.id) pintarDetalhe();
    await envio;
    r.stream.getTracks().forEach((t) => t.stop()); try { r.ac?.close(); } catch {} try { r.wake?.release(); } catch {}
    if (gerar) processar(r.id, true); else { ok('Gravação salva.'); if (S.det?.id === r.id) abrir(r.id, true); }
  }
  async function enviarParte(p) {
    if (p.blob.size < 1500 && p.seg < 2) return;
    S.envios++;
    try {
      let ultimoErro;
      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        try {
          const t = (p.tipo || 'audio/webm').split(';')[0];
          const ext = t.includes('mp4') || t.includes('m4a') ? 'm4a' : t.includes('ogg') ? 'ogg' : t.includes('mpeg') || t.includes('mp3') ? 'mp3' : t.includes('wav') ? 'wav' : 'webm';
          const path = `${S.emp}/${p.id}/parte-${p.ordem}-${Date.now()}.${ext}`;
          const up = await client.storage.from('reunioes').upload(path, p.blob, { contentType: t, upsert: true });
          if (up.error) throw up.error;
          const parteId = await rpc('reuniao_parte_registrar', { p_id: p.id, p_ordem: p.ordem, p_path: path, p_tipo: t, p_segundos: p.seg, p_tamanho: p.blob.size });
          // já transcreve em segundo plano (a ata sai mais rápido ao encerrar)
          S.fila = S.fila.then(() => ia({ acao: 'transcrever_parte', reuniao_id: p.id, parte_id: parteId }).catch((e) => console.warn('transcrição em segundo plano:', e)));
          if (S.det?.id === p.id && !S.rec && !S.proc) abrir(p.id, true);
          return;
        } catch (e) { ultimoErro = e; if (tentativa < 4) await new Promise((r) => setTimeout(r, 2000 * tentativa)); }
      }
      S.falhas.push({ ...p, url: URL.createObjectURL(p.blob) });
      erro(`A parte ${p.ordem} da gravação não subiu (${ultimoErro?.message || ultimoErro}). Ela continua guardada nesta tela: baixe ou tente de novo.`);
      if (S.det?.id === p.id) pintarGravador();
    } finally { S.envios--; }
  }
  function desenharOnda() {
    const r = S.rec; if (!r) return;
    const c = $('rnOnda');
    if (c && r.an) {
      const w = c.clientWidth; if (c.width !== w) c.width = w;
      const g = c.getContext('2d'), buf = new Uint8Array(r.an.frequencyBinCount);
      r.an.getByteFrequencyData(buf);
      g.clearRect(0, 0, c.width, c.height);
      const n = Math.max(20, Math.floor(w / 6)), passo = Math.floor(buf.length / n) || 1;
      for (let i = 0; i < n; i++) {
        const v = r.pausaIni ? 0.04 : Math.max(0.05, buf[i * passo] / 255);
        const h = v * c.height;
        g.fillStyle = i / n < 0.5 ? '#123f86' : '#b08d57';
        g.globalAlpha = 0.35 + v * 0.65;
        g.fillRect(i * 6, (c.height - h) / 2, 3, h);
      }
    }
    r.raf = requestAnimationFrame(desenharOnda);
  }
  function pintarFlutuante() {
    let f = $('rnFlutuante');
    const r = S.rec;
    if (!r || S.det?.id === r.id) { f?.remove(); return; }
    if (!f) { f = document.createElement('button'); f.id = 'rnFlutuante'; f.type = 'button'; f.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;border:0;border-radius:999px;background:#c4453b;color:#fff;padding:10px 18px;font:500 14px Inter,sans-serif;box-shadow:0 10px 28px rgba(196,69,59,.35);cursor:pointer'; f.onclick = () => abrir(S.rec.id); document.body.appendChild(f); }
    f.textContent = `● Gravando "${r.titulo}" · ${mmss(tempoTotal())} — voltar`;
  }
  window.addEventListener('beforeunload', (e) => { if (S.rec || S.envios > 0) { e.preventDefault(); e.returnValue = ''; } });

  async function processar(id, gerar) {
    if (S.proc) return;
    const titulo = S.porId.get(id)?.titulo || 'Reunião';
    S.proc = { id, titulo: 'Preparando a ata', passos: ['Salvando a gravação', 'Transcrevendo e reconhecendo as vozes', 'Escrevendo a ata', 'Pronto'], at: 0 };
    const tela = () => { if (S.det?.id === id) pintarGravador(); };
    tela();
    try {
      while (S.envios > 0) await new Promise((r) => setTimeout(r, 400));
      await S.fila;
      S.proc.at = 1; S.proc.titulo = 'Transcrevendo a reunião'; tela();
      let det = await rpc('reuniao_obter', { p_id: id });
      const pend = (det.partes_lista || []).filter((p) => !p.transcrita);
      for (let i = 0; i < pend.length; i++) {
        S.proc.passos[1] = `Transcrevendo parte ${i + 1} de ${pend.length} e reconhecendo as vozes`; tela();
        await ia({ acao: 'transcrever_parte', reuniao_id: id, parte_id: pend[i].id });
      }
      if (gerar) {
        S.proc.at = 2; S.proc.titulo = 'Escrevendo a ata'; tela();
        const res = await ia({ acao: 'gerar_ata', reuniao_id: id });
        S.proc.at = 3; tela();
        window.alerta?.(`Ata de "${titulo}" pronta${res.tarefas ? ` com ${res.tarefas} tarefa(s)` : ''}. Revise e aprove.`, 'Reuniões', 'success');
      }
      S.proc = null;
      await carregarApoio();
      if (S.det?.id === id) { S.aba = 'ata'; await abrir(id, true); } else { const r = S.porId.get(id); if (r) { r.ata_status = 'rascunho'; } pintarLista(); }
    } catch (e) {
      S.proc = null; tela(); erro(e);
    }
  }

  // ── abas do conteúdo ───────────────────────────────────────────────────────────────────────────────────────
  $('rnCentro').addEventListener('click', (e) => {
    const t = e.target.closest('.rn-tabs [data-aba]'); if (!t) return;
    S.aba = t.dataset.aba;
    document.querySelectorAll('.rn-tabs [data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    pintarAba();
  });
  function pintarAba() {
    const box = $('rnTab'); if (!box || !S.det) return;
    if (S.aba === 'transcricao') return pintarTranscricao(box);
    if (S.aba === 'pauta') return pintarPauta(box);
    pintarAta(box);
  }

  function lista(arr, cls = '') { return arr?.length ? `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''; }
  function pintarAta(box) {
    const r = S.det, a = r.ata;
    if (!a) {
      const tem = (r.partes_lista || []).length;
      box.innerHTML = `<div class="rn-vazio-grande"><span class="titulo-serifa">${tem ? 'A gravação está pronta' : 'A ata aparece aqui'}</span>
        <p>${tem ? 'Gere a ata: a IA transcreve, reconhece quem falou e organiza o resumo, os assuntos, as decisões e as tarefas.' : r.status === 'cancelada' ? 'Esta reunião foi cancelada.' : 'Grave a reunião (ou envie o áudio) e a IA escreve a ata. Também dá para escrever a ata à mão.'}</p>
        ${r.pode_editar && r.status !== 'cancelada' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${tem ? `<button type="button" class="rn-btn rn-btn-pri" data-g="gerar">${I.ia} Gerar a ata</button>` : ''}<button type="button" class="rn-btn rn-btn-sec" data-ata="editar">Escrever à mão</button></div>` : ''}</div>
        ${tarefasSecao()}`;
      return;
    }
    const aprovada = r.ata_status === 'aprovada';
    box.innerHTML = `
      <div class="rn-ata-topo">${aprovada ? `<span class="rn-chip verde">✓ Aprovada por ${esc(r.ata_aprovada_por_nome || '')} em ${new Date(r.ata_aprovada_em).toLocaleDateString('pt-BR')}</span>` : '<span class="rn-chip ouro">Rascunho · revise antes de aprovar</span>'}
        ${a.gerada_por_ia ? `<span class="rn-chip azul">${I.ia.replace('<svg', '<svg style="width:13px;height:13px"')} Escrita pela IA</span>` : ''}
        <span class="rn-acoes">
          <button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-ata="copiar">Copiar resumo</button>
          <button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-ata="imprimir">Imprimir / PDF</button>
          ${!aprovada && r.pode_editar ? '<button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-ata="editar">Editar</button>' : ''}
          ${!aprovada && r.pode_aprovar ? '<button type="button" class="rn-btn rn-btn-pri rn-btn-min" data-ata="aprovar">Aprovar a ata</button>' : ''}
        </span></div>
      ${a.resumo ? `<p class="rn-resumo">${esc(a.resumo)}</p>` : ''}
      ${a.topicos?.length ? `<div class="rn-sec"><h4>Assuntos discutidos</h4>${a.topicos.map((t) => `<div class="rn-topico"><time>${esc(t.minuto || '')}</time><div><strong>${esc(t.titulo)}</strong>${lista(t.pontos)}</div></div>`).join('')}</div>` : ''}
      ${a.decisoes?.length ? `<div class="rn-sec"><h4>Decisões</h4>${lista(a.decisoes, 'rn-decisoes')}</div>` : ''}
      ${tarefasSecao()}
      ${a.pendencias?.length ? `<div class="rn-sec"><h4>Ficou em aberto</h4>${lista(a.pendencias)}</div>` : ''}
      ${a.destaques?.length ? `<div class="rn-sec"><h4>Frases marcantes</h4><div class="rn-destaques">${a.destaques.map((d) => `<div class="rn-destaque"><q>${esc(d.frase)}</q><small>${esc(d.quem)}${d.minuto ? ' · ' + esc(d.minuto) : ''}</small></div>`).join('')}</div></div>` : ''}
      ${a.proxima_reuniao ? `<div class="rn-sec"><h4>Próxima reunião</h4><p style="margin:0;font-size:14px">${esc(a.proxima_reuniao)}</p></div>` : ''}`;
  }
  function tarefaHtml(t, o = {}) {
    const atrasada = t.prazo && !t.concluida && t.prazo < hojeChave();
    return `<div class="rn-tarefa ${t.concluida ? 'feita' : ''}">
      <button type="button" class="rn-check ${t.concluida ? 'ok' : ''}" data-tarefa-ok="${t.id}" data-v="${!t.concluida}" aria-label="${t.concluida ? 'Reabrir' : 'Concluir'} tarefa"></button>
      <div class="rn-tarefa-txt"><span>${esc(t.descricao)}</span><small>${t.responsavel_nome ? `<span>${esc(t.responsavel_nome)}</span>` : ''}${t.prazo ? `<span class="${atrasada ? 'atrasada' : ''}">${atrasada ? 'Atrasada · ' : 'até '}${new Date(t.prazo + 'T12:00').toLocaleDateString('pt-BR')}</span>` : ''}${o.link ? `<a href="#" data-abrir="${t.reuniao_id}">${esc(t.reuniao_titulo)}</a>` : ''}</small></div>
      ${o.excluir ? `<button type="button" class="rn-x" data-tarefa-x="${t.id}" aria-label="Excluir tarefa">×</button>` : '<span></span>'}</div>`;
  }
  function tarefasSecao() {
    const r = S.det, ts = r.tarefas || [];
    const edita = r.pode_editar && r.status !== 'cancelada';
    if (!ts.length && !edita) return '';
    const pessoas = (r.participantes || []).filter((p) => p.funcionario_id);
    return `<div class="rn-sec"><h4>Tarefas</h4>${ts.map((t) => tarefaHtml(t, { excluir: edita && r.ata_status !== 'aprovada' })).join('') || '<p class="rn-dica">Nenhuma tarefa ainda.</p>'}
      ${edita ? `<form class="rn-nova-tarefa" data-nova-tarefa><input class="rn-campo" name="d" placeholder="Nova tarefa: o que precisa ser feito" maxlength="600" required>
        <select class="rn-campo" name="r"><option value="">Responsável</option>${pessoas.map((p) => `<option value="${p.funcionario_id}">${esc(p.nome)}</option>`).join('')}${S.pessoas.filter((p) => !pessoas.some((x) => x.funcionario_id === p.id)).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
        <input class="rn-campo" type="date" name="p" aria-label="Prazo"><button class="rn-btn rn-btn-sec rn-btn-min" type="submit">Adicionar</button></form>` : ''}</div>`;
  }
  document.addEventListener('click', async (e) => {
    const okb = e.target.closest('[data-tarefa-ok]');
    if (okb) {
      try { await rpc('reuniao_tarefa_concluir', { p_id: okb.dataset.tarefaOk, p_concluida: okb.dataset.v === 'true' }); await carregarApoio(); S.det ? abrir(S.det.id, true) : pintarLista(); } catch (err) { erro(err); }
      return;
    }
    const xb = e.target.closest('[data-tarefa-x]');
    if (xb) { try { await rpc('reuniao_tarefa_excluir', { p_id: xb.dataset.tarefaX }); abrir(S.det.id, true); } catch (err) { erro(err); } return; }
    const lk = e.target.closest('.rn-tarefa [data-abrir]');
    if (lk) { e.preventDefault(); abrir(lk.dataset.abrir); }
  });
  $('rnCentro').addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-nova-tarefa]'); if (!f) return;
    e.preventDefault();
    try { await rpc('reuniao_tarefa_salvar', { p_reuniao: S.det.id, p_id: null, p_descricao: f.d.value, p_responsavel: f.r.value || null, p_prazo: f.p.value || null }); await carregarApoio(); abrir(S.det.id, true); }
    catch (err) { erro(err); }
  });
  $('rnCentro').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ata]'); if (!b) return;
    const r = S.det;
    if (b.dataset.ata === 'editar') return editarAta();
    if (b.dataset.ata === 'copiar') { await navigator.clipboard.writeText(textoResumo(r)); ok('Resumo copiado. É só colar no WhatsApp ou no e-mail.'); return; }
    if (b.dataset.ata === 'imprimir') return imprimir(r);
    if (b.dataset.ata === 'aprovar') {
      if (!(await confirmar('Aprovar a ata? Depois de aprovada ela não pode mais ser alterada nem regravada.', 'Aprovar a ata'))) return;
      try { await rpc('reuniao_ata_aprovar', { p_id: r.id }); ok('Ata aprovada.'); abrir(r.id, true); } catch (err) { erro(err); }
    }
  });
  function textoResumo(r) {
    const a = r.ata || {};
    const ts = r.tarefas || [];
    return [`*${r.titulo}*`, `${dataLonga(r.inicio)} · ${hora(r.inicio)}`, '', a.resumo || '',
      a.decisoes?.length ? '\n*Decisões*\n' + a.decisoes.map((d) => `• ${d}`).join('\n') : '',
      ts.length ? '\n*Tarefas*\n' + ts.map((t) => `• ${t.descricao}${t.responsavel_nome ? ` — ${t.responsavel_nome}` : ''}${t.prazo ? ` (até ${new Date(t.prazo + 'T12:00').toLocaleDateString('pt-BR')})` : ''}`).join('\n') : '',
      a.pendencias?.length ? '\n*Em aberto*\n' + a.pendencias.map((d) => `• ${d}`).join('\n') : ''].filter((x) => x !== '').join('\n').trim();
  }
  function imprimir(r) {
    const a = r.ata || {}, ps = r.participantes || [];
    const w = window.open('', '_blank'); if (!w) return erro('Libere as janelas do navegador para imprimir.');
    const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata · ${esc(r.titulo)}</title><style>
      body{font-family:Inter,Arial,sans-serif;color:#1f2020;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.55;font-size:13.5px}
      h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;margin:0 0 4px}h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;border-bottom:1px solid #e3e7ec;padding-bottom:4px;margin:22px 0 8px}
      .meta{color:#4f4f4f}.resumo{background:#f7f1e6;border-left:3px solid #b08d57;padding:12px 16px;border-radius:8px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e3e7ec;padding:6px 4px;text-align:left;font-size:12.5px}
      .ass{margin-top:40px;font-size:12px;color:#6b6b6b}</style></head><body>
      <small style="letter-spacing:.14em;text-transform:uppercase;color:#b08d57">Ata de reunião</small><h1>${esc(r.titulo)}</h1>
      <div class="meta">${esc(dataLonga(r.inicio))} · ${hora(r.inicio)} · ${duracaoTxt(r.duracao_min)}${r.local ? ' · ' + esc(r.local) : ''}</div>
      <h2>Participantes</h2><div>${ps.map((p) => `${esc(p.nome)}${p.presente === false ? ' (ausente)' : ''}`).join(' · ')}</div>
      ${a.resumo ? `<h2>Resumo</h2><div class="resumo">${esc(a.resumo)}</div>` : ''}
      ${a.topicos?.length ? `<h2>Assuntos discutidos</h2>${a.topicos.map((t) => `<p><b>${esc(t.titulo)}</b></p><ul>${li(t.pontos)}</ul>`).join('')}` : ''}
      ${a.decisoes?.length ? `<h2>Decisões</h2><ul>${li(a.decisoes)}</ul>` : ''}
      ${(r.tarefas || []).length ? `<h2>Tarefas</h2><table><tr><th>O quê</th><th>Responsável</th><th>Prazo</th></tr>${r.tarefas.map((t) => `<tr><td>${esc(t.descricao)}</td><td>${esc(t.responsavel_nome || 'a definir')}</td><td>${t.prazo ? new Date(t.prazo + 'T12:00').toLocaleDateString('pt-BR') : 'a definir'}</td></tr>`).join('')}</table>` : ''}
      ${a.pendencias?.length ? `<h2>Ficou em aberto</h2><ul>${li(a.pendencias)}</ul>` : ''}
      ${a.proxima_reuniao ? `<h2>Próxima reunião</h2><p>${esc(a.proxima_reuniao)}</p>` : ''}
      <div class="ass">${r.ata_status === 'aprovada' ? `Ata aprovada por ${esc(r.ata_aprovada_por_nome || '')} em ${new Date(r.ata_aprovada_em).toLocaleString('pt-BR')}.` : 'Rascunho — ainda não aprovada.'}</div>
      <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  function editarAta() {
    const r = S.det, a = r.ata || {};
    const topicos = (a.topicos || []).map((t) => `# ${t.titulo}\n${(t.pontos || []).map((p) => `- ${p}`).join('\n')}`).join('\n\n');
    dialogo('Editar a ata', `
      <label class="c6">Resumo<textarea name="resumo" rows="4">${esc(a.resumo || '')}</textarea></label>
      <label class="c6">Assuntos discutidos <span class="rn-dica">(linha com # = assunto; linhas com - = pontos)</span><textarea name="topicos" rows="8">${esc(topicos)}</textarea></label>
      <label class="c3">Decisões (uma por linha)<textarea name="decisoes" rows="5">${esc((a.decisoes || []).join('\n'))}</textarea></label>
      <label class="c3">Ficou em aberto (uma por linha)<textarea name="pendencias" rows="5">${esc((a.pendencias || []).join('\n'))}</textarea></label>
      <label class="c6">Próxima reunião<input name="prox" value="${esc(a.proxima_reuniao || '')}"></label>`, 'Salvar a ata', async (f) => {
      const linhas = (v) => String(v || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
      const tops = []; let cur = null;
      for (const l of String(f.get('topicos') || '').split('\n')) {
        const t = l.trim(); if (!t) continue;
        if (t.startsWith('#')) { cur = { titulo: t.replace(/^#+\s*/, ''), minuto: '', pontos: [] }; tops.push(cur); }
        else { if (!cur) { cur = { titulo: 'Assuntos', minuto: '', pontos: [] }; tops.push(cur); } cur.pontos.push(t.replace(/^[-•*]\s*/, '')); }
      }
      (a.topicos || []).forEach((o) => { const n = tops.find((x) => x.titulo === o.titulo); if (n) n.minuto = o.minuto || ''; });
      await rpc('reuniao_ata_salvar', { p_id: r.id, p_ata: { ...a, resumo: String(f.get('resumo') || '').trim(), topicos: tops, decisoes: linhas(f.get('decisoes')), pendencias: linhas(f.get('pendencias')), proxima_reuniao: String(f.get('prox') || '').trim() } });
      ok('Ata salva.'); S.aba = 'ata'; abrir(r.id, true);
    });
  }

  async function pintarTranscricao(box) {
    const r = S.det, partes = r.partes_lista || [];
    if (!partes.length) { box.innerHTML = '<div class="rn-vazio-grande"><span class="titulo-serifa">Sem gravação</span><p>Quando a reunião for gravada, a conversa aparece aqui, separada por quem falou.</p></div>'; return; }
    let base = 0; const falas = [];
    for (const p of partes) {
      let ult = null;
      for (const s of p.transcricao || []) {
        if (ult && ult.quem === s.quem) ult.texto += ' ' + s.texto;
        else { ult = { quem: s.quem, id: s.id, ini: base + (s.ini || 0), texto: s.texto }; falas.push(ult); }
      }
      base += p.segundos || 0;
    }
    const naoTrans = partes.filter((p) => !p.transcrita).length;
    box.innerHTML = `
      <details class="rn-audio-partes"${partes.length < 3 ? ' open' : ''}><summary class="rn-dica" style="cursor:pointer">Gravação: ${partes.length} parte(s) · ${mmss(r.gravacao_segundos)}</summary>
        ${partes.map((p) => `<div class="rn-audio-parte"><b>Parte ${p.ordem}</b><span>${mmss(p.segundos)}</span>${p.transcrita ? '<span class="rn-chip verde">transcrita</span>' : '<span class="rn-chip amarelo">não transcrita</span>'}<button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-ouvir="${esc(p.path)}">Ouvir</button>${r.pode_editar && r.ata_status !== 'aprovada' ? `<button type="button" class="rn-x" data-parte-x="${p.id}" aria-label="Apagar parte">×</button>` : ''}</div>`).join('')}
      </details>
      ${naoTrans ? `<p class="rn-dica">${naoTrans} parte(s) ainda sem transcrição. ${r.pode_editar ? 'Use "Gerar a ata" para transcrever.' : ''}</p>` : ''}
      ${falas.length ? `<input class="rn-campo rn-trans-busca" type="search" placeholder="Procurar na conversa" data-trans-busca>
      <div data-falas>${falas.map((f) => `<div class="rn-fala" data-texto="${esc(norm(f.quem + ' ' + f.texto))}">${av(f.id, f.quem)}<div><div class="rn-fala-cab"><strong>${esc(f.quem)}</strong><time>${mmss(f.ini)}</time></div><p>${esc(f.texto)}</p></div></div>`).join('')}</div>` : ''}`;
  }
  $('rnCentro').addEventListener('input', (e) => {
    if (!e.target.matches('[data-trans-busca]')) return;
    const q = norm(e.target.value.trim());
    document.querySelectorAll('[data-falas] .rn-fala').forEach((el) => {
      el.hidden = q && !el.dataset.texto.includes(q);
      const p = el.querySelector('p'); const txt = p.textContent;
      p.innerHTML = q ? esc(txt).replace(new RegExp(esc(e.target.value.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : esc(txt);
    });
  });
  $('rnCentro').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-ouvir]');
    if (o) {
      const { data } = await client.storage.from('reunioes').createSignedUrl(o.dataset.ouvir, 600);
      if (!data?.signedUrl) return erro('Não foi possível abrir o áudio.');
      const a = document.createElement('audio'); a.controls = true; a.autoplay = true; a.src = data.signedUrl; o.replaceWith(a);
      return;
    }
    const x = e.target.closest('[data-parte-x]');
    if (x) {
      if (!(await confirmar('Apagar esta parte da gravação? A transcrição dela também sai.'))) return;
      try { const path = await rpc('reuniao_parte_excluir', { p_parte: x.dataset.parteX }); if (path) await client.storage.from('reunioes').remove([path]); abrir(S.det.id, true); } catch (err) { erro(err); }
    }
  });

  let tNotas;
  function pintarPauta(box) {
    const r = S.det, edita = r.pode_editar && r.ata_status !== 'aprovada';
    box.innerHTML = `<div class="rn-sec"><h4>Pauta</h4>${r.pauta ? `<p style="white-space:pre-wrap;margin:0;font-size:14.5px;line-height:1.6">${esc(r.pauta)}</p>` : '<p class="rn-dica">Sem pauta. Quem marcou a reunião pode incluir em "Editar reunião".</p>'}</div>
      <div class="rn-sec"><h4>Anotações da reunião</h4>
        ${edita ? `<textarea rows="9" data-notas placeholder="Anote o que quiser durante a reunião. A IA usa estas anotações para escrever a ata.">${esc(r.notas || '')}</textarea><div class="rn-notas-status" data-notas-st>Salva sozinha.</div>` : `<p style="white-space:pre-wrap;margin:0">${esc(r.notas || '—')}</p>`}</div>`;
  }
  $('rnCentro').addEventListener('input', (e) => {
    if (!e.target.matches('[data-notas]')) return;
    const st = document.querySelector('[data-notas-st]'); if (st) st.textContent = 'Salvando…';
    clearTimeout(tNotas);
    const id = S.det.id, v = e.target.value;
    tNotas = setTimeout(async () => { try { await rpc('reuniao_notas_salvar', { p_id: id, p_notas: v }); if (S.det?.id === id) S.det.notas = v; if (st) st.textContent = 'Salvo.'; } catch (err) { if (st) st.textContent = 'Não salvou: ' + (err.message || err); } }, 700);
  });

  // ── coluna da direita ──────────────────────────────────────────────────────────────────────────────────────
  function pintarLateral() {
    const r = S.det, ps = r.participantes || [];
    const conf = ps.filter((p) => p.resposta === 'confirmado').length;
    const comVoz = ps.filter((p) => p.tem_voz).length;
    const eu = ps.find((p) => p.funcionario_id === S.eu);
    const futura = new Date(r.inicio).getTime() + r.duracao_min * 60e3 > Date.now();
    const temTrans = (r.partes_lista || []).some((p) => p.transcrita);
    const marcaPres = r.pode_editar && r.status !== 'agendada' && r.status !== 'cancelada' && r.ata_status !== 'aprovada';
    const respTxt = { confirmado: ['Vai', 'verde'], talvez: ['Talvez', 'amarelo'], recusado: ['Não vai', 'vermelho'], pendente: ['Sem resposta', ''] };
    $('rnDireita').innerHTML = `
      ${eu && !r.sou_organizador && r.status === 'agendada' && futura ? `<section class="rn-card rn-card-pad"><div class="rn-tit-sec">Você vai?</div><div class="rn-rsvp">
        ${['confirmado', 'talvez', 'recusado'].map((k) => `<button type="button" data-rsvp="${k}" class="${eu.resposta === k ? 'on ' + k : ''}">${respTxt[k][0]}</button>`).join('')}</div></section>` : ''}
      <section class="rn-card rn-card-pad"><div class="rn-tit-sec">Convidados<span>${conf} de ${ps.length} confirmados</span></div>
        ${ps.map((p) => `<div class="rn-pessoa">${av(p.funcionario_id, p.nome)}<div><div class="rn-pessoa-nome"><span>${esc(p.nome)}</span>${p.externo ? '' : `<svg class="rn-mic ${p.tem_voz ? '' : 'sem'}" viewBox="0 0 24 24" aria-label="${p.tem_voz ? 'Voz cadastrada' : 'Sem voz cadastrada'}"><title>${p.tem_voz ? 'Voz cadastrada: reconhecida pelo nome' : 'Sem voz cadastrada'}</title><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`}</div>
          <small>${p.funcionario_id === r.organizador_id ? 'Organizador · ' : ''}${p.externo ? 'Convidado de fora' + (p.email ? ' · ' + esc(p.email) : '') : esc(p.setor || '')}</small></div>
          ${marcaPres ? `<button type="button" class="rn-pres ${p.presente === true ? 'sim' : p.presente === false ? 'nao' : ''}" data-pres="${p.id}" data-v="${p.presente === true ? 'false' : p.presente === false ? '' : 'true'}">${p.presente === true ? 'Presente' : p.presente === false ? 'Faltou' : 'Presença?'}</button>`
            : `<span class="rn-chip ${respTxt[p.resposta]?.[1] || ''}">${respTxt[p.resposta]?.[0] || ''}</span>`}</div>`).join('')}
        <p class="rn-dica" style="margin:10px 0 0">${comVoz} com voz cadastrada. Por gravação, até 4 vozes são reconhecidas pelo nome; as outras aparecem como "Participante". A voz é cadastrada no Cadastro de Funcionários (RH).</p>
      </section>
      ${temTrans ? `<section class="rn-card rn-card-pad rn-pergunta"><div class="rn-tit-sec">${I.ia.replace('<svg', '<svg style="width:15px;height:15px;color:#b08d57"')} Pergunte à reunião</div>
        <div class="rn-sugestoes">${['O que ficou decidido?', 'Quais são as minhas tarefas?', 'Alguém falou de prazo ou valor?', 'Resuma em 3 linhas'].map((q) => `<button type="button" data-sug="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        ${S.respostas.map((x) => `<div class="rn-resposta"><b>${esc(x.p)}</b>${x.r ? esc(x.r) : '<em>Pensando…</em>'}</div>`).join('')}
        <form data-perguntar><input class="rn-campo" name="q" placeholder="Pergunte algo sobre o que foi dito" maxlength="500" autocomplete="off"><button class="rn-btn rn-btn-pri rn-btn-min" type="submit">Perguntar</button></form></section>` : ''}
      <section class="rn-card rn-card-pad"><div class="rn-tit-sec">Ações</div><div class="rn-links">
        ${r.status !== 'cancelada' && futura ? `<button type="button" data-acao="ics">${I.cal} Adicionar à minha agenda</button>` : ''}
        <button type="button" data-acao="convite">Copiar convite</button>
        ${r.sou_organizador && r.ata_status !== 'aprovada' ? `<button type="button" data-acao="editar">Editar reunião e convidados</button>` : ''}
        ${r.sou_organizador ? `<button type="button" data-acao="repetir">Marcar a próxima a partir desta</button>` : ''}
        ${r.sou_organizador && r.status !== 'cancelada' && r.ata_status !== 'aprovada' ? '<button type="button" class="perigo" data-acao="cancelar">Cancelar reunião</button>' : ''}
        ${r.sou_organizador && r.status === 'cancelada' ? '<button type="button" data-acao="reabrir">Reabrir reunião</button>' : ''}
        ${r.sou_organizador && r.ata_status !== 'aprovada' ? '<button type="button" class="perigo" data-acao="excluir">Excluir</button>' : ''}
      </div></section>`;
  }
  $('rnDireita').addEventListener('click', async (e) => {
    const r = S.det; if (!r) return;
    const rs = e.target.closest('[data-rsvp]');
    if (rs) { try { await rpc('reuniao_responder', { p_id: r.id, p_resposta: rs.dataset.rsvp }); await abrir(r.id, true); } catch (err) { erro(err); } return; }
    const pr = e.target.closest('[data-pres]');
    if (pr) { try { await rpc('reuniao_presenca', { p_participante: pr.dataset.pres, p_presente: pr.dataset.v === '' ? null : pr.dataset.v === 'true' }); await abrir(r.id, true); } catch (err) { erro(err); } return; }
    const sg = e.target.closest('[data-sug]');
    if (sg) return perguntar(sg.dataset.sug);
    const ac = e.target.closest('[data-acao]'); if (!ac) return;
    const a = ac.dataset.acao;
    if (a === 'ics') return baixarIcs(r);
    if (a === 'convite') { await navigator.clipboard.writeText(textoConvite(r)); ok('Convite copiado.'); return; }
    if (a === 'editar') return abrirFormulario(r);
    if (a === 'repetir') { const prox = new Date(new Date(r.inicio).getTime() + 7 * 864e5); return abrirFormulario({ ...r, id: null, inicio: prox.toISOString(), serie_id: null, pauta: [r.pauta, r.ata?.pendencias?.length ? 'Pendências da reunião anterior:\n' + r.ata.pendencias.map((x) => '- ' + x).join('\n') : ''].filter(Boolean).join('\n\n') }); }
    if (a === 'cancelar') {
      return dialogo('Cancelar reunião', '<label class="c6">Motivo (os convidados veem)<input name="m" maxlength="300"></label>', 'Cancelar reunião', async (f) => { await rpc('reuniao_status', { p_id: r.id, p_status: 'cancelada', p_motivo: f.get('m') }); ok('Reunião cancelada.'); await recarregarLista(); abrir(r.id, true); });
    }
    if (a === 'reabrir') { try { await rpc('reuniao_status', { p_id: r.id, p_status: 'agendada' }); await recarregarLista(); abrir(r.id, true); } catch (err) { erro(err); } return; }
    if (a === 'excluir') {
      if (!(await confirmar('Excluir a reunião, a gravação e a ata? Não dá para desfazer.', 'Excluir reunião'))) return;
      try { const paths = await rpc('reuniao_excluir', { p_id: r.id }); if (paths?.length) await client.storage.from('reunioes').remove(paths); S.porId.delete(r.id); ok('Reunião excluída.'); voltar(); } catch (err) { erro(err); }
    }
  });
  $('rnDireita').addEventListener('submit', (e) => { const f = e.target.closest('[data-perguntar]'); if (!f) return; e.preventDefault(); const q = f.q.value.trim(); if (q) perguntar(q); });
  async function perguntar(q) {
    const id = S.det.id, item = { p: q, r: '' };
    S.respostas.push(item); pintarLateral();
    try { item.r = (await ia({ acao: 'perguntar', reuniao_id: id, pergunta: q })).resposta; }
    catch (err) { item.r = 'Não consegui responder: ' + (err.message || err); }
    if (S.det?.id === id) { pintarLateral(); document.querySelector('[data-perguntar] input')?.focus(); }
  }
  function textoConvite(r) {
    const link = r.link ? (/^https?:\/\//i.test(r.link) ? r.link : 'https://' + r.link) : '';
    return [`*${r.titulo}*`, `📅 ${dataLonga(r.inicio)} às ${hora(r.inicio)} (${duracaoTxt(r.duracao_min)})`, r.local ? `📍 ${r.local}` : '', link ? `🎥 ${link}` : '', r.pauta ? `\nPauta:\n${r.pauta}` : ''].filter(Boolean).join('\n');
  }
  function baixarIcs(r) {
    const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const fim = new Date(new Date(r.inicio).getTime() + r.duracao_min * 60e3);
    const t = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Acervo//Reunioes//PT', 'BEGIN:VEVENT', `UID:${r.id}@acervo`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(r.inicio)}`, `DTEND:${z(fim)}`,
      `SUMMARY:${t(r.titulo)}`, `DESCRIPTION:${t([r.pauta, r.link].filter(Boolean).join('\n'))}`, r.local ? `LOCATION:${t(r.local)}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Reunião', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${r.titulo.replace(/[^\w\-]+/g, '-').slice(0, 40)}.ics`; a.click();
  }

  // ── janelas ────────────────────────────────────────────────────────────────────────────────────────────────
  function dialogo(titulo, corpo, botao, aoSalvar, depois) {
    const d = $('rnDialog');
    d.innerHTML = `<form method="dialog"><header><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></header>
      <div class="rn-dlg-corpo"><div class="rn-campos">${corpo}</div></div>
      <footer><span class="rn-erro" data-erro></span><button type="button" class="rn-btn rn-btn-sec" data-fechar>Voltar</button>${botao ? `<button type="submit" class="rn-btn rn-btn-pri">${esc(botao)}</button>` : ''}</footer></form>`;
    const f = d.querySelector('form');
    d.querySelectorAll('[data-fechar]').forEach((b) => b.onclick = () => d.close());
    f.onsubmit = async (e) => {
      e.preventDefault();
      const bt = f.querySelector('[type=submit]'); bt.disabled = true;
      try { await aoSalvar(new FormData(f), f); d.close(); } catch (err) { d.querySelector('[data-erro]').textContent = err.message || err; } finally { bt.disabled = false; }
    };
    depois?.(f);
    d.showModal();
  }
  function abrirFormulario(r) {
    const novo = !r?.id;
    const ini = r?.inicio ? new Date(r.inicio) : (() => { const d = new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d; })();
    const data = diaChave(ini), hh = hora(ini);
    const sel = new Map(); const ext = [];
    (r?.participantes || []).forEach((p) => { if (p.funcionario_id) { if (p.funcionario_id !== S.eu) sel.set(p.funcionario_id, p.nome); } else ext.push({ nome: p.nome, email: p.email || '' }); });
    const setores = [...new Set(S.pessoas.map((p) => p.setor).filter(Boolean))].sort();
    dialogo(novo ? 'Nova reunião' : 'Editar reunião', `
      <label class="c4">Assunto da reunião<input name="titulo" required maxlength="160" value="${esc(r?.titulo || '')}" placeholder="Ex.: Alinhamento da semana"></label>
      <label class="c2">Tipo<input name="tipo" list="rnTipos" maxlength="60" value="${esc(r?.tipo || '')}" placeholder="Escolha ou escreva"><datalist id="rnTipos">${TIPOS.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
      <label class="c2">Data<input type="date" name="data" required value="${data}"></label>
      <label class="c1">Horário<input type="time" name="hora" required value="${hh}"></label>
      <label class="c1">Duração<select name="dur">${[15, 30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${(r?.duracao_min || 60) === m ? 'selected' : ''}>${duracaoTxt(m)}</option>`).join('')}</select></label>
      ${novo ? `<label class="c2">Repetir<select name="rep"><option value="1">Não repetir</option><option value="4">Toda semana · 4 vezes</option><option value="8">Toda semana · 8 vezes</option><option value="12">Toda semana · 12 vezes</option></select></label>` : '<span class="c2"></span>'}
      <label class="c3">Local<input name="local" maxlength="200" value="${esc(r?.local || '')}" placeholder="Ex.: sala de reunião, galpão"></label>
      <label class="c3">Link da videochamada<input name="link" maxlength="500" value="${esc(r?.link || '')}" placeholder="Meet, Zoom, Teams (opcional)"></label>
      <div class="c6"><span class="rn-dica" style="display:block;margin-bottom:6px;font-weight:500;color:#4f4f4f">Quem pode ver esta reunião e a ata</span><div class="rn-vis">
        ${[['participantes', 'Só os convidados', 'Convidados e a diretoria (quem vê todas as reuniões).'], ['empresa', 'Toda a equipe', 'Qualquer pessoa da empresa vê a reunião e a ata.'], ['confidencial', '🔒 Confidencial', 'Somente você e os convidados. Ninguém mais.']]
          .map(([v, t, s]) => `<label><input type="radio" name="vis" value="${v}" ${(r?.visibilidade || 'participantes') === v ? 'checked' : ''}>${t}<small>${s}</small></label>`).join('')}</div></div>
      <div class="c6 rn-convidados"><span class="rn-dica" style="font-weight:500;color:#4f4f4f">Convidados <span data-qtd></span></span>
        <div class="rn-sel-chips" data-chips></div>
        <div class="rn-picker"><input data-picker placeholder="Digite o nome de quem você quer convidar" autocomplete="off"><div class="rn-picker-lista" data-picker-lista hidden></div></div>
        ${setores.length ? `<div class="rn-setores">Convidar o setor inteiro: ${setores.map((s) => `<button type="button" data-setor="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="rn-externo"><input data-ext-nome placeholder="Convidado de fora (nome)" maxlength="120"><input data-ext-email type="email" placeholder="E-mail (opcional)" maxlength="160"><button type="button" class="rn-btn rn-btn-sec rn-btn-min" data-ext-add>Incluir</button></div>
        <span class="rn-dica">Quem tem o app no celular recebe o convite por notificação.</span>
      </div>
      <label class="c6">Pauta<textarea name="pauta" rows="4" maxlength="5000" placeholder="O que vai ser tratado (um assunto por linha)">${esc(r?.pauta || '')}</textarea></label>`,
      novo ? 'Marcar reunião' : 'Salvar', async (f) => {
        const dados = {
          id: novo ? null : r.id, titulo: f.get('titulo'), tipo: f.get('tipo'), pauta: f.get('pauta'), local: f.get('local'), link: f.get('link'),
          visibilidade: f.get('vis'), duracao_min: Number(f.get('dur')), repetir_semanas: Number(f.get('rep') || 1),
          inicio: `${f.get('data')}T${f.get('hora')}:00-03:00`,
          participantes: [...[...sel.keys()].map((id) => ({ funcionario_id: id })), ...ext.map((x) => ({ nome: x.nome, email: x.email }))],
        };
        const res = await rpc('reuniao_salvar', { p_empresa: S.emp, p_dados: dados });
        ok(novo ? (res.criadas > 1 ? `${res.criadas} reuniões marcadas e convites enviados.` : 'Reunião marcada e convites enviados.') : 'Reunião atualizada.');
        await recarregarLista(); abrir(res.id);
      }, (f) => {
        const chips = f.querySelector('[data-chips]'), inp = f.querySelector('[data-picker]'), lst = f.querySelector('[data-picker-lista]');
        let foco = 0;
        const desenhar = () => {
          chips.innerHTML = [...sel].map(([id, nome]) => `<span class="rn-chip">${av(id, nome)}${esc(nome)}<button type="button" data-tira="${id}" aria-label="Tirar ${esc(nome)}">×</button></span>`).join('')
            + ext.map((x, i) => `<span class="rn-chip ext">${esc(x.nome)}${x.email ? ' · ' + esc(x.email) : ''}<button type="button" data-tira-ext="${i}">×</button></span>`).join('');
          f.querySelector('[data-qtd]').textContent = sel.size + ext.length ? `· ${sel.size + ext.length} além de você` : '';
        };
        const opcoes = () => { const q = norm(inp.value.trim()); return S.pessoas.filter((p) => p.id !== S.eu && !sel.has(p.id) && (!q || norm(p.nome + ' ' + (p.setor || '')).includes(q))).slice(0, 30); };
        const lista = () => {
          const ops = opcoes(); foco = Math.min(foco, Math.max(0, ops.length - 1));
          lst.hidden = !ops.length || document.activeElement !== inp;
          lst.innerHTML = ops.map((p, i) => `<button type="button" class="${i === foco ? 'foco' : ''}" data-poe="${p.id}">${av(p.id, p.nome)}<span>${esc(p.nome)}<br><small>${esc([p.setor, p.cargo].filter(Boolean).join(' · '))}</small></span>${p.tem_voz ? '<small title="Voz cadastrada">🎙</small>' : ''}</button>`).join('');
        };
        const poe = (id) => { const p = S.pessoas.find((x) => x.id === id); if (p) sel.set(p.id, p.nome); inp.value = ''; desenhar(); inp.focus(); lst.hidden = true; };
        inp.addEventListener('input', () => { foco = 0; lista(); });
        inp.addEventListener('focus', lista);
        inp.addEventListener('blur', () => setTimeout(() => { lst.hidden = true; }, 150));
        inp.addEventListener('keydown', (e) => {
          const ops = opcoes();
          if (e.key === 'ArrowDown') { e.preventDefault(); foco = Math.min(foco + 1, ops.length - 1); lista(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); foco = Math.max(foco - 1, 0); lista(); }
          if (e.key === 'Enter') { e.preventDefault(); if (ops[foco]) poe(ops[foco].id); }
        });
        lst.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-poe]'); if (b) { e.preventDefault(); poe(b.dataset.poe); } });
        f.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tira]'); if (t) { sel.delete(t.dataset.tira); desenhar(); return; }
          const te = e.target.closest('[data-tira-ext]'); if (te) { ext.splice(Number(te.dataset.tiraExt), 1); desenhar(); return; }
          const st = e.target.closest('[data-setor]'); if (st) { S.pessoas.filter((p) => p.setor === st.dataset.setor && p.id !== S.eu).forEach((p) => sel.set(p.id, p.nome)); desenhar(); return; }
          if (e.target.closest('[data-ext-add]')) {
            const n = f.querySelector('[data-ext-nome]'), m = f.querySelector('[data-ext-email]');
            if (n.value.trim().length < 2) { n.focus(); return; }
            ext.push({ nome: n.value.trim(), email: m.value.trim() }); n.value = ''; m.value = ''; desenhar();
          }
        });
        desenhar();
      });
  }

  // ── início ─────────────────────────────────────────────────────────────────────────────────────────────────
  try { await Promise.all([garantirPeriodo(S.mes), carregarApoio()]); }
  catch (e) { $('rnCentro').innerHTML = `<div class="rn-card rn-card-pad">Não foi possível carregar as reuniões: ${esc(e.message || e)}</div>`; return; }
  const pedido = new URLSearchParams(location.search).get('id');
  const abaUrl = new URLSearchParams(location.search).get('aba');
  if (['proximas', 'convites', 'realizadas'].includes(abaUrl)) S.vista = abaUrl;
  if (abaUrl === 'tarefas') S.lado = 'tarefas';
  if (pedido) abrir(pedido); else pintarVista();
})();
