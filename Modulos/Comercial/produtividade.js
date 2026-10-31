/* Acompanhamentos e produtividade do Comercial. Sem dependência de serviços externos de mensagens. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hoje = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
  const data = v => !v ? '—' : String(v).includes('T') ? new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : String(v).slice(0,10).split('-').reverse().join('/');
  const rpc = async (nome, args) => { const r = await window.supabaseClient.rpc(nome,args); if(r.error) throw new Error(r.error.message); return r.data; };
  const contexto = async () => { const c = await window.aguardarContexto?.(); const empresa = c?.empresa_id || window.__CONTEXT?.empresa_id; if(!empresa) throw new Error('Empresa não identificada.'); return empresa; };
  const opcoes = valores => valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
  let dialogo;
  function fechar(){ dialogo?.close(); dialogo?.remove(); dialogo=null; }
  async function abrir(pedido, empresa, cancelar){
    fechar();
    const [ctx, lista] = await Promise.all([rpc('comercial_prod_contexto',{p_empresa:empresa}),rpc('comercial_acompanhamentos',{p_empresa:empresa,p_pedido:pedido.id})]);
    dialogo=document.createElement('dialog'); dialogo.className='cp-dialog';
    dialogo.innerHTML=`<form><header><h2>Acompanhamento · Pedido ${esc(pedido.numero || '')}</h2><button type="button" data-fechar aria-label="Fechar">×</button></header>
      <div class="cp-grade"><label>Ação<select name="tipo">${opcoes(['Orçamento enviado','Tentativa sem resposta','Resposta do cliente','Negociação','Retorno realizado'])}</select></label>
      <label>Canal<select name="canal">${opcoes(['WhatsApp','E-mail','Telefone','Outro'])}</select></label>
      <label>Situação<select name="situacao" required>${opcoes(ctx.config.situacoes)}</select></label><label>Motivo<select name="motivo"><option value="">Sem motivo específico</option>${opcoes(ctx.config.motivos)}</select></label>
      <label>Próximo contato<input type="date" name="proximo" min="${hoje()}" required></label>
      <label>Responsável pelo próximo contato<select name="responsavel" required>${ctx.pessoas.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select></label></div>
      <label>Observação<textarea name="observacao" maxlength="4000" rows="3" placeholder="O que o cliente respondeu e qual é o próximo passo?"></textarea></label>
      <p>Registre um contato efetivamente realizado ou uma tentativa. A conversa pelo WhatsApp ou e-mail acontece fora deste formulário.</p>
      <p role="status"></p><footer><button type="button" data-cancelar>Cliente não vai fechar</button>${lista.some(c=>!c.concluido_em)?'<button type="button" data-reagendar>Reagendar / trocar responsável</button>':''}<button class="btn btn-primary" type="submit">Registrar e agendar retorno</button></footer>
      <h3>Histórico de contatos</h3><div class="cp-historico">${lista.length?lista.map(c=>`<article><strong>${esc(c.tipo)} · ${data(c.criado_em)}</strong><small>${esc(c.autor)} · ${esc(c.canal)}</small><p>${esc(c.situacao)}${c.motivo?' · '+esc(c.motivo):''}</p><p>${esc(c.observacao)}</p><small>Retorno: ${data(c.prazo)} · ${esc(c.responsavel)}${c.encerramento?' · '+esc(c.encerramento):''}</small>${c.precisa_revisao?'<p class="cp-atrasado">Entrada estornada ou alterada: revise a negociação.</p>':''}${(c.revisoes||[]).map(r=>`<small>Reagendado de ${data(r.prazo_anterior)} para ${data(r.prazo)}: ${esc(r.motivo)}</small>`).join('')}</article>`).join(''):'Nenhum contato registrado.'}</div></form>`;
    document.body.append(dialogo); const form=dialogo.querySelector('form');
    form.elements.responsavel.value=lista.find(c=>!c.concluido_em)?.responsavel_id || ctx.usuario;
    dialogo.querySelector('[data-fechar]').onclick=fechar;
    dialogo.addEventListener('cancel',e=>{e.preventDefault();fechar();});
    dialogo.querySelector('[data-cancelar]').onclick=()=>{fechar();cancelar?.();};
    const reagendar=dialogo.querySelector('[data-reagendar]');
    if(reagendar)reagendar.onclick=async()=>{
      if(!form.reportValidity())return;
      const status=form.querySelector('[role=status]');reagendar.disabled=true;
      try{await rpc('comercial_retorno_reagendar',{p_empresa:empresa,p_pedido:pedido.id,p_proximo:form.elements.proximo.value,p_responsavel:form.elements.responsavel.value,p_motivo:form.elements.observacao.value});fechar();window.dispatchEvent(new CustomEvent('comercial:contato-salvo'));}
      catch(err){status.textContent=err.message;reagendar.disabled=false;}
    };
    const id=uuid();
    form.onsubmit=async e=>{e.preventDefault(); const status=form.querySelector('[role=status]'),btn=form.querySelector('[type=submit]'); btn.disabled=true;status.textContent='Salvando…';
      try { await rpc('comercial_acompanhamento_salvar',{p_empresa:empresa,p_pedido:pedido.id,p_id:id,p_tipo:form.elements.tipo.value,p_situacao:form.elements.situacao.value,p_motivo:form.elements.motivo.value,p_canal:form.elements.canal.value,p_observacao:form.elements.observacao.value,p_proximo:form.elements.proximo.value,p_responsavel:form.elements.responsavel.value}); fechar();window.dispatchEvent(new CustomEvent('comercial:contato-salvo')); }
      catch(err){status.textContent=err.message;btn.disabled=false;}
    };
    dialogo.showModal();
  }
  function tabela(pedidos, contatos, filtros){
    const mapa=new Map(contatos.map(c=>[c.pedido_id,c]));
    const prazo=p=>{const c=mapa.get(p.id);return !c||c.concluido_em?'sem':c.prazo<hoje()?'atrasados':c.prazo===hoje()?'hoje':'proximos';};
    const lista=pedidos.filter(p=>{const c=mapa.get(p.id);return (!filtros.prazo||prazo(p)===filtros.prazo)&&(!filtros.responsavel||c?.responsavel_id===filtros.responsavel)&&(!filtros.situacao||c?.situacao===filtros.situacao)&&(!filtros.motivo||c?.motivo===filtros.motivo);}).sort((a,b)=>{const peso={atrasados:0,hoje:1,proximos:2,sem:3};return peso[prazo(a)]-peso[prazo(b)]||String(mapa.get(a.id)?.prazo||'').localeCompare(mapa.get(b.id)?.prazo||'');});
    return lista.map(p=>{
      const c=mapa.get(p.id),tipoPrazo=prazo(p);
      const situacao=String(c?.situacao||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const tom=c?.precisa_revisao?'vermelho':situacao.includes('reuniao')?'violeta':situacao.includes('negoci')?'azul':situacao.includes('aguard')?'ambar':'neutro';
      const validade=p.pre_reserva_ate<hoje()?'vermelho':p.pre_reserva_ate===hoje()?'ambar':'neutro';
      const tomPrazo=c?.concluido_em?(c.encerramento==='pagamento'?'verde':'neutro'):({atrasados:'vermelho',hoje:'ambar',proximos:'azul',sem:'neutro'})[tipoPrazo];
      const legendaPrazo=c&&!c.concluido_em?({atrasados:'Atrasado',hoje:'Hoje',proximos:'Agendado'})[tipoPrazo]:'';
      return `<tr data-pedido-id="${esc(p.id)}">
      <td><span class="cp-acomp-numero cp-tom-${p.pre_reserva_ate?'ambar':'azul'}">${esc(p.numero)}</span>${p.pre_reserva_ate?`<small class="cp-acomp-validade cp-texto-${validade}">Pré-reserva até ${data(p.pre_reserva_ate)}</small>`:''}</td><td class="cp-acomp-cliente">${esc(p.cliente)}</td><td>${data(p.data)}</td><td class="cp-acomp-valor">${esc(Number(p.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</td>
      <td class="cp-contato-cell"><span class="cp-acomp-situacao cp-tom-${tom}">${esc(c?.situacao||'Sem acompanhamento')}</span><small>${esc(c?.motivo||'')}</small><small class="cp-acomp-observacao" title="${esc(c?.observacao||'')}">${esc(c?.observacao||'')}</small>${c?.precisa_revisao?'<small class="cp-atrasado cp-texto-vermelho">Entrada estornada ou alterada: revisar negociação</small>':''}</td>
      <td class="cp-contato-cell">${data(c?.criado_em)}<small>${esc(c?.autor||'')}</small></td><td><span class="cp-acomp-prazo cp-tom-${tomPrazo}">${c?.concluido_em?'Encerrado · '+esc(c.encerramento):c?data(c.prazo):'Sem agendamento'}</span>${legendaPrazo?`<small class="cp-texto-${tomPrazo}">${legendaPrazo}</small>`:''}</td><td>${esc(c?.responsavel||'—')}</td><td><button type="button" class="btn" data-action="acompanhar">Acompanhar</button></td></tr>`;
    }).join('')||'<tr><td colspan="9">Nenhum pedido neste filtro.</td></tr>';
  }
  window.ComercialProdutividade={abrir,tabela,uuid};
  const salvarPedido=document.getElementById('btnSalvarPedido');
  if(salvarPedido){
    const botao=document.createElement('button');botao.type='button';botao.className='btn btn-secondary';botao.textContent='Acompanhamento';salvarPedido.before(botao);
    botao.onclick=async()=>{try{const id=window.__PEDIDO_ATUAL_ID;if(!id)throw new Error('Salve o pedido antes de registrar um acompanhamento.');await abrir({id,numero:document.getElementById('orcamentoNumero')?.textContent},await contexto(),()=>document.querySelector('.timeline-step[data-status="cancelado"]')?.click());}catch(err){window.alert(err.message);}};
  }

  window.carregarParametrosProdutividade=async(host,empresa)=>{
    const card=document.createElement('section');card.className='pr-card';host.append(card);
    card.innerHTML='<h3>Produtividade e acompanhamentos do Comercial</h3><p role="status">Carregando…</p>';
    try {
      const ctx=await rpc('comercial_prod_contexto',{p_empresa:empresa});
      const pode=window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar')===true;
      const cfg=ctx.config;
      card.innerHTML=`<h3>Produtividade e acompanhamentos do Comercial</h3><p>Medição desde ${data(cfg.inicio)}. Selecione as pessoas que fazem parte do comercial. Cada pessoa pode consultar seus próprios números; os demais acessos são definidos abaixo.</p>
      <form><fieldset ${pode?'':'disabled'}><legend>Participantes</legend>${ctx.pessoas.map(p=>`<label class="pr-check"><input type="checkbox" name="participante" value="${esc(p.id)}" ${cfg.participantes.includes(p.id)?'checked':''}>${esc(p.nome)}</label>`).join('')}
      <div class="cp-grade"><label>Situações (uma por linha)<textarea rows="5" name="situacoes" required>${esc(cfg.situacoes.join('\n'))}</textarea></label><label>Motivos (um por linha)<textarea rows="5" name="motivos">${esc(cfg.motivos.join('\n'))}</textarea></label></div>
      <p>Remover uma opção impede novos registros com ela; os contatos anteriores preservam o texto usado.</p>
      <h4>Quem pode ver de quem</h4><p>“Total da equipe” libera apenas números agregados, sem mostrar pessoas ou ações individuais.</p><div class="cp-scroll"><table><thead><tr><th>Quem consulta</th>${ctx.pessoas.map(p=>`<th>${esc(p.nome)}</th>`).join('')}<th>Total da equipe</th></tr></thead><tbody>${ctx.pessoas.map(o=>`<tr><th>${esc(o.nome)}</th>${[...ctx.pessoas.map(p=>p.id),'equipe'].map(alvo=>`<td><input aria-label="${esc(o.nome)} pode ver ${esc(alvo==='equipe'?'equipe':ctx.pessoas.find(p=>p.id===alvo)?.nome)}" type="checkbox" data-observador="${esc(o.id)}" data-alvo="${esc(alvo)}" ${cfg.acessos.some(a=>a.observador===o.id&&a.alvo===alvo)?'checked':''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="btn primary" type="submit">Salvar produtividade</button></fieldset><p role="status"></p></form>`;
      const form=card.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const status=form.querySelector('[role=status]');const btn=form.querySelector('[type=submit]');btn.disabled=true;
        const linhas=nome=>[...new Set(form.elements[nome].value.split('\n').map(x=>x.trim()).filter(Boolean))];
        try {await rpc('comercial_prod_config_salvar',{p_empresa:empresa,p_config:{participantes:[...form.querySelectorAll('[name=participante]:checked')].map(el=>el.value),acessos:[...form.querySelectorAll('[data-alvo]:checked')].map(el=>({observador:el.dataset.observador,alvo:el.dataset.alvo})),situacoes:linhas('situacoes'),motivos:linhas('motivos')}});status.textContent='Configuração salva.';}catch(err){status.textContent=err.message;}finally{btn.disabled=false;}
      };
    }catch(err){card.querySelector('[role=status]').textContent=err.message;}
  };

  async function painel(){
    const root=document.getElementById('produtividadeComercial');if(!root)return;
    const status=root.querySelector('[role=status]');
    try{
      const empresa=await contexto(),ctx=await rpc('comercial_prod_contexto',{p_empresa:empresa});const form=root.querySelector('form');
      const inicio=new Date();inicio.setDate(inicio.getDate()-29);form.elements.de.value=inicio.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});form.elements.ate.value=hoje();
      const acessiveis=ctx.pessoas.filter(p=>ctx.config.participantes.includes(p.id)&&(p.id===ctx.usuario||ctx.config.acessos.some(a=>a.observador===ctx.usuario&&a.alvo===p.id)));
      form.elements.pessoa.innerHTML='<option value="">Pessoas autorizadas</option>'+acessiveis.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')+(ctx.config.acessos.some(a=>a.observador===ctx.usuario&&a.alvo==='equipe')?'<option value="equipe">Total da equipe</option>':'');
      let sequencia=0,eventos=[];
      const rotulos={criacao:'Pedido criado',alteracao:'Alteração',acompanhamento:'Acompanhamento'};
      function pintarEventos(){
        const tipo=root.querySelector('[data-tipo]').value;
        root.querySelector('[data-eventos]').innerHTML=eventos.filter(e=>!tipo||e.tipo===tipo).map(e=>`<details><summary>${data(e.criado_em)} · ${esc(e.autor)} · Pedido ${esc(e.numero_pedido||'excluído')} · ${rotulos[e.tipo]||esc(e.tipo)}</summary>${e.detalhes.map(d=>`<p>${esc(d.campo||d.tipo)}${d.registro?' · registro '+esc(d.registro):''}: ${esc(JSON.stringify(d.de??d.situacao??''))} → ${esc(JSON.stringify(d.para??d.observacao??''))}</p>`).join('')}</details>`).join('')||'Sem ações individuais disponíveis nesta visão.';
      }
      root.querySelector('[data-tipo]').onchange=pintarEventos;
      async function carregar(){const atual=++sequencia;status.textContent='Carregando…';try{
        const r=await rpc('comercial_prod_painel',{p_empresa:empresa,p_de:form.elements.de.value,p_ate:form.elements.ate.value,p_autor:form.elements.pessoa.value==='equipe'?null:form.elements.pessoa.value||null,p_equipe:form.elements.pessoa.value==='equipe'});if(atual!==sequencia)return;
        status.textContent=`${r.escopo} · medição desde ${data(r.inicio)}. Atrasados são pendências atuais; demais números seguem o período.`;
        const pontualidade=r.totais.retornos_concluidos?Math.round(Number(r.totais.no_prazo)/Number(r.totais.retornos_concluidos)*100)+'%':'—';
        root.querySelector('[data-kpis]').innerHTML=[['Pedidos trabalhados',r.pedidos],['Pedidos criados',r.totais.criados],['Operações de alteração',r.totais.alteracoes],['Detalhes alterados',r.totais.detalhes],['Acompanhamentos',r.totais.acompanhamentos],['Retornos no prazo',r.totais.no_prazo],['Pontualidade dos retornos',pontualidade],['Retornos atrasados',r.totais.atrasados]].map(([t,v])=>`<div><small>${t}</small><strong>${v}</strong></div>`).join('');
        root.querySelector('[data-pessoas]').innerHTML=r.pessoas.map(p=>`<tr><th>${esc(p.nome)}</th>${['criados','pedidos','alteracoes','detalhes','acompanhamentos','no_prazo','atrasados'].map(k=>`<td>${p[k]}</td>`).join('')}</tr>`).join('');
        const max=Math.max(1,...r.dias.map(d=>Number(d.acoes)));root.querySelector('[data-dias]').innerHTML=r.dias.map(d=>`<div class="cp-dia"><span>${data(d.dia)}</span><meter min="0" max="${max}" value="${d.acoes}"></meter><b>${d.acoes}</b></div>`).join('')||'Sem atividade no período.';
        const acoes=r.dias.reduce((s,d)=>s+Number(d.acoes),0);
        root.querySelector('[data-evolucao]').textContent=r.anterior?`${acoes} ações no período. Período anterior (${data(r.anterior.de)} a ${data(r.anterior.ate)}): ${r.anterior.acoes} ações e ${r.anterior.pedidos} pedidos trabalhados. Média por dia com atividade: ${r.dias.length?(acoes/r.dias.length).toFixed(1):'0'}.` : '';
        eventos=r.eventos;pintarEventos();
      }catch(err){if(atual===sequencia)status.textContent=err.message;}}
      form.onsubmit=e=>{e.preventDefault();carregar();};await carregar();
    }catch(err){status.textContent=err.message;}
  }
  painel();
})();
