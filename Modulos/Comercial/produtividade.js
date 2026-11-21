/* Acompanhamentos e produtividade do Comercial. Sem dependência de serviços externos de mensagens. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hoje = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
  const data = v => !v ? '—' : String(v).includes('T') ? new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : String(v).slice(0,10).split('-').reverse().join('/');
  // Foto de quem aparece na Participação individual (nov/2026): o avatar da conta (bucket "avatares", <empresa>/<usuário>.jpg,
  // o mesmo do menu); sem foto, as iniciais.
  function fotoPessoa(p, empresa) {
    const nome = String(p.nome || '').trim(), ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
    let url = ''; try { if (p.id && empresa) url = window.supabaseClient.storage.from('avatares').getPublicUrl(empresa + '/' + p.id + '.jpg').data?.publicUrl || ''; } catch (_) {}
    return `<span class="cp-pessoa"><span class="cp-pessoa-foto"><i>${esc(ini)}</i>${url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>${esc(nome)}</span>`;
  }
  // Indicadores da Produtividade comercial (nov/2026). Todos vêm de dados reais (RPC comercial_prod_indicadores).
  // "Dono" do pedido = quem o criou. Quais aparecem no painel: Parâmetros > Comercial (config.indicadores).
  const INDICADORES=[
    {g:'Vendas',k:'pedidos_criados',r:'Pedidos criados',t:'n',como:'Pedidos (sem os pedidos extras) criados pela pessoa no período.'},
    {g:'Vendas',k:'valor_orcado',r:'Valor orçado',t:'brl',como:'Soma do valor total dos pedidos que a pessoa criou no período.'},
    {g:'Vendas',k:'pedidos_fechados',r:'Pedidos fechados',t:'n',como:'Pedidos que a pessoa passou para Reservado no período (primeira vez que viraram Reservado, pelo histórico do Comercial). Pedido criado já como Reservado conta para quem criou.'},
    {g:'Vendas',k:'valor_fechado',r:'Valor fechado',t:'brl',como:'Soma do valor total dos pedidos fechados pela pessoa no período.'},
    {g:'Vendas',k:'ticket_medio',r:'Ticket médio',t:'brl',como:'Valor fechado ÷ pedidos fechados.',calc:p=>Number(p.pedidos_fechados)?Number(p.valor_fechado)/Number(p.pedidos_fechados):null},
    {g:'Vendas',k:'taxa_conversao',r:'Conversão',t:'pct',como:'Dos pedidos que a pessoa criou no período, quantos estão hoje Reservados.',calc:p=>Number(p.pedidos_criados)?Number(p.criados_convertidos)/Number(p.pedidos_criados):null},
    {g:'Vendas',k:'recebido',r:'Recebido',t:'brl',como:'Recebimentos (sem estornos) registrados no Financeiro no período, nas contas a receber dos pedidos que a pessoa criou.'},
    {g:'Vendas',k:'pedidos_extras',r:'Pedidos extras',t:'n',como:'Pedidos extras (itens a mais de um pedido já fechado) criados pela pessoa no período.'},
    {g:'Vendas',k:'valor_extras',r:'Valor em pedidos extras',t:'brl',como:'Soma do valor total dos pedidos extras criados pela pessoa no período.'},
    {g:'Perdas',k:'cancelados',r:'Cancelados',t:'n',como:'Pedidos criados pela pessoa que foram cancelados no período (data do cancelamento).'},
    {g:'Perdas',k:'valor_cancelado',r:'Valor cancelado',t:'brl',como:'Soma do valor total desses pedidos cancelados.'},
    {g:'Perdas',k:'nao_vai_fechar',r:'Não vai fechar',t:'n',como:'Orçamentos que a pessoa encerrou como "Não vai fechar" no acompanhamento, no período.'},
    {g:'Acompanhamento',k:'acompanhamentos',r:'Contatos registrados',t:'n',como:'Contatos que a pessoa registrou no acompanhamento de orçamentos (Central de Pedidos), no período.'},
    {g:'Acompanhamento',k:'contatos_atrasados',r:'Contatos atrasados (hoje)',t:'n',como:'Agora: orçamentos e pré-reservas criados pela pessoa com o próximo contato vencido (data do último registro, senão envio + dias de Parâmetros). Não depende do período.'},
    {g:'Acompanhamento',k:'pre_reservas_vencidas',r:'Pré-reservas vencidas (hoje)',t:'n',como:'Agora: pré-reservas criadas pela pessoa com a validade já passada. Não depende do período.'},
    {g:'Atividade',k:'pedidos_alterados',r:'Pedidos alterados',t:'n',como:'Pedidos diferentes que a pessoa alterou no período.'},
    {g:'Atividade',k:'alteracoes',r:'Alterações',t:'n',como:'Quantas vezes a pessoa salvou alterações em pedidos no período.'},
    {g:'Pós-venda',k:'posvenda_ligacoes',r:'Ligações de pós-venda',t:'n',como:'Ligações de pós-venda concluídas pela pessoa no período.'},
    {g:'Módulo 3D',k:'imagens_3d',r:'Imagens do 3D',t:'n',como:'Imagens do Módulo 3D (print ou IA) que a pessoa salvou nos pedidos no período. Contado a partir de 14/11/2026, quando o sistema passou a gravar o autor de cada imagem.'},
    {g:'Módulo 3D',k:'renders_ia',r:'Renderizações com IA',t:'n',como:'Renderizações com IA feitas pela pessoa nas imagens dos pedidos, no período (a partir de 14/11/2026).'},
    {g:'Módulo 3D',k:'pedidos_com_3d',r:'Pedidos com 3D',t:'n',como:'Pedidos diferentes em que a pessoa colocou ou renderizou imagens do Módulo 3D no período (a partir de 14/11/2026).'},
    {g:'Atividade',k:'dias_ativos',r:'Dias com atividade',t:'n',como:'Dias diferentes no período em que a pessoa registrou alguma ação no Comercial (criou ou alterou pedido, registrou contato, encerrou orçamento ou concluiu ligação de pós-venda).'}];
  // Destaques "quem mais" (nov/2026): o maior valor de cada indicador marcado. Nos indicadores ruins (atrasos, cancelamentos)
  // o destaque é "precisa de atenção". Sem ninguém acima de zero, o destaque não aparece.
  const DESTAQUES={pedidos_criados:'Quem mais criou pedidos',valor_orcado:'Quem mais orçou',pedidos_fechados:'Quem mais fechou pedidos',valor_fechado:'Quem mais fechou em valor',
    ticket_medio:'Maior ticket médio',taxa_conversao:'Maior conversão',recebido:'Quem mais recebeu',acompanhamentos:'Quem mais registrou contatos',
    pedidos_alterados:'Quem mais trabalhou em pedidos',alteracoes:'Quem mais fez alterações',posvenda_ligacoes:'Quem mais fez pós-venda',dias_ativos:'Mais dias com atividade',
    pedidos_extras:'Quem mais fez pedido extra',valor_extras:'Mais valor em pedidos extras',imagens_3d:'Quem mais usa o Módulo 3D',renders_ia:'Quem mais renderiza com IA',pedidos_com_3d:'Mais pedidos com 3D',cancelados:'Mais cancelamentos',valor_cancelado:'Maior valor cancelado',nao_vai_fechar:'Mais "Não vai fechar"',contatos_atrasados:'Mais contatos atrasados',pre_reservas_vencidas:'Mais pré-reservas vencidas'};
  const RUINS=new Set(['cancelados','valor_cancelado','nao_vai_fechar','contatos_atrasados','pre_reservas_vencidas']);
  function pintarDestaques(box,sel,pessoas,empresa){
    if(!box)return;
    const cards=sel.filter(i=>DESTAQUES[i.k]).map(i=>{
      const vals=pessoas.map(p=>({p,v:valorInd(i,p)})).filter(x=>x.v!=null&&Number(x.v)>0).sort((a,b)=>b.v-a.v);
      if(!vals.length)return'';
      const top=vals.filter(x=>x.v===vals[0].v),resto=vals.filter(x=>x.v!==vals[0].v).slice(0,2);
      return `<article class="cp-dest${RUINS.has(i.k)?' cp-dest-atencao':''}" title="${esc(i.como)}"><span class="cp-dest-tit">${RUINS.has(i.k)?'Precisa de atenção · ':''}${esc(DESTAQUES[i.k])}</span>
        <div class="cp-dest-quem">${top.map(x=>fotoPessoa(x.p,empresa)).join('')}</div><strong>${fmtInd(i,vals[0].v)}</strong>${top.length>1?'<small>Empate</small>':''}
        ${resto.length?`<ol class="cp-dest-resto">${resto.map(x=>`<li><span>${esc(x.p.nome)}</span><b>${fmtInd(i,x.v)}</b></li>`).join('')}</ol>`:''}</article>`;}).filter(Boolean);
    box.innerHTML=cards.length&&pessoas.length>1?'<h2 class="cp-dest-h">Destaques do período</h2><div class="cp-dest-grade">'+cards.join('')+'</div>':'';box.hidden=!box.innerHTML;
  }
  window.ComercialIndicadores=INDICADORES;
  const fmtInd=(i,v)=>v==null||v===''?'—':i.t==='brl'?Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):i.t==='pct'?Math.round(Number(v)*100)+'%':Number(v).toLocaleString('pt-BR');
  const valorInd=(i,p)=>i.calc?i.calc(p):p[i.k];
  // Cores das pessoas (paleta categórica validada, em ordem fixa; a pessoa mantém a cor pela posição na lista).
  const CORES=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#6250d6','#e34948'];
  const brlC=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
  // Gráficos da equipe (nov/2026): só aparecem se o indicador correspondente estiver marcado em Parâmetros.
  function pintarGraficos(box,sel,pessoas,empresa){
    if(!box)return;const tem=k=>sel.some(i=>i.k===k),cards=[];
    const nome=p=>esc(String(p.nome||'').split(/\s+/).slice(0,2).join(' '));
    if(tem('valor_fechado')){
      const tot=pessoas.reduce((s,p)=>s+Number(p.valor_fechado||0),0);
      let ang=0;const R=60,C=2*Math.PI*R;
      const fatias=tot>0?pessoas.map((p,n)=>{const v=Number(p.valor_fechado||0);if(!v)return'';const frac=v/tot,len=Math.max(0,frac*C-(pessoas.filter(x=>Number(x.valor_fechado)).length>1?2:0));const off=-ang*C;ang+=frac;
        return `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${CORES[n%CORES.length]}" stroke-width="26" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${off}" transform="rotate(-90 80 80)"><title>${esc(p.nome)}: ${brlC(v)} (${Math.round(frac*100)}%)</title></circle>`;}).join(''):'';
      cards.push(`<article class="cp-graf"><h3>Participação no valor fechado</h3><div class="cp-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="Participação de cada pessoa no valor fechado">${tot>0?fatias:`<circle r="${R}" cx="80" cy="80" fill="none" stroke="#e8ecf1" stroke-width="26"/>`}<text x="80" y="76" text-anchor="middle" class="cp-rosca-rot">Total</text><text x="80" y="96" text-anchor="middle" class="cp-rosca-val">${brlC(tot)}</text></svg>
        <ul class="cp-legenda">${pessoas.map((p,n)=>`<li><i style="background:${CORES[n%CORES.length]}"></i><span>${nome(p)}</span><b>${brlC(p.valor_fechado)}</b><small>${tot>0?Math.round(Number(p.valor_fechado||0)/tot*100):0}%</small></li>`).join('')}</ul></div></article>`);
    }
    if(tem('pedidos_criados')||tem('pedidos_fechados')){
      const series=[['pedidos_criados','Criados','#2a78d6'],['pedidos_fechados','Fechados','#1baf7a'],['cancelados','Cancelados','#e34948']].filter(([k])=>tem(k));
      const max=Math.max(1,...pessoas.flatMap(p=>series.map(([k])=>Number(p[k]||0))));
      cards.push(`<article class="cp-graf"><h3>Pedidos por pessoa</h3><ul class="cp-legenda cp-legenda-linha">${series.map(([,r,c])=>`<li><i style="background:${c}"></i><span>${r}</span></li>`).join('')}</ul><div class="cp-barras">${pessoas.map(p=>`<div class="cp-barra-pessoa"><span class="cp-barra-nome">${nome(p)}</span><div class="cp-barra-grupo">${series.map(([k,r,c])=>{const v=Number(p[k]||0);return `<div class="cp-barra-linha" title="${esc(p.nome)} · ${r}: ${v}"><span class="cp-barra" style="width:${v/max*100}%;background:${c}"></span><b>${v}</b></div>`;}).join('')}</div></div>`).join('')}</div></article>`);
    }
    if(tem('taxa_conversao')){
      cards.push(`<article class="cp-graf"><h3>Conversão</h3><p class="cp-graf-sub">Dos pedidos criados no período, quantos estão Reservados hoje.</p><div class="cp-medidores">${pessoas.map(p=>{const c=Number(p.pedidos_criados||0),f=Number(p.criados_convertidos||0),pc=c?Math.round(f/c*100):null;
        return `<div class="cp-medidor" title="${esc(p.nome)}: ${f} de ${c} pedidos"><span class="cp-barra-nome">${nome(p)}</span><div class="cp-trilho"><span style="width:${pc||0}%"></span></div><b>${pc==null?'—':pc+'%'}</b><small>${f} de ${c}</small></div>`;}).join('')}</div></article>`);
    }
    if(tem('recebido')||tem('valor_orcado')){
      const ser=[['valor_orcado','Orçado','#6250d6'],['valor_fechado','Fechado','#1baf7a'],['recebido','Recebido','#2a78d6']].filter(([k])=>tem(k));
      const max=Math.max(1,...pessoas.flatMap(p=>ser.map(([k])=>Number(p[k]||0))));
      cards.push(`<article class="cp-graf"><h3>Valores por pessoa</h3><ul class="cp-legenda cp-legenda-linha">${ser.map(([,r,c])=>`<li><i style="background:${c}"></i><span>${r}</span></li>`).join('')}</ul><div class="cp-barras">${pessoas.map(p=>`<div class="cp-barra-pessoa"><span class="cp-barra-nome">${nome(p)}</span><div class="cp-barra-grupo">${ser.map(([k,r,c])=>{const v=Number(p[k]||0);return `<div class="cp-barra-linha" title="${esc(p.nome)} · ${r}: ${brlC(v)}"><span class="cp-barra" style="width:${v/max*100}%;background:${c}"></span><b>${brlC(v)}</b></div>`;}).join('')}</div></div>`).join('')}</div></article>`);
    }
    box.innerHTML=pessoas.length?cards.join(''):'';box.hidden=!cards.length||!pessoas.length;
  }
  // Painel por categoria (nov/2026): cada categoria numa faixa com duas colunas — à esquerda a tabela (uma linha por
  // indicador, uma coluna por pessoa, o maior valor destacado; nos indicadores ruins o destaque é vermelho) e à direita
  // um gráfico da categoria. Só entram os indicadores marcados em Parâmetros.
  const ICONES={};
  function barrasHtml(pessoas,ser,fmt){
    const max=Math.max(1,...pessoas.flatMap(p=>ser.map(i=>Number(valorInd(i,p)||0))));
    return `<ul class="cp-legenda cp-legenda-linha">${ser.length>1?ser.map((i,n)=>`<li><i style="background:${SERIE[n]}"></i><span>${esc(i.r)}</span></li>`).join(''):''}</ul><div class="cp-barras">${pessoas.map(p=>`<div class="cp-barra-pessoa"><span class="cp-barra-nome">${esc(curto(p))}</span><div class="cp-barra-grupo">${ser.map((i,n)=>{const v=Number(valorInd(i,p)||0);return `<div class="cp-barra-linha" title="${esc(p.nome)} · ${esc(i.r)}: ${fmtInd(i,v)}"><span class="cp-barra" style="width:${v/max*100}%;background:${ser.length>1?SERIE[n]:CORES[pessoas.indexOf(p)%CORES.length]}"></span><b>${fmt(i,v)}</b></div>`;}).join('')}</div></div>`).join('')}</div>`;
  }
  const SERIE=['#2a78d6','#6250d6','#eda100','#e87ba4']; // séries neutras: verde e vermelho ficam só para destaque bom/ruim
  const curto=p=>String(p.nome||'').split(/\s+/).slice(0,2).join(' ');
  function roscaHtml(pessoas,i){
    const vals=pessoas.map(p=>Number(valorInd(i,p)||0)),tot=vals.reduce((a,b)=>a+b,0),R=60,C=2*Math.PI*R,vivos=vals.filter(Boolean).length;let ang=0;
    const fatias=tot>0?vals.map((v,n)=>{if(!v)return'';const frac=v/tot,len=Math.max(0,frac*C-(vivos>1?2:0)),off=-ang*C;ang+=frac;
      return `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${CORES[n%CORES.length]}" stroke-width="26" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${off}" transform="rotate(-90 80 80)"><title>${esc(pessoas[n].nome)}: ${fmtInd(i,v)} (${Math.round(frac*100)}%)</title></circle>`;}).join(''):`<circle r="${R}" cx="80" cy="80" fill="none" stroke="#e8ecf1" stroke-width="26"/>`;
    return `<div class="cp-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(i.r)} por pessoa">${fatias}<text x="80" y="76" text-anchor="middle" class="cp-rosca-rot">Total</text><text x="80" y="96" text-anchor="middle" class="cp-rosca-val">${i.t==='brl'?brlC(tot):tot}</text></svg>
      <ul class="cp-legenda">${pessoas.map((p,n)=>`<li><i style="background:${CORES[n%CORES.length]}"></i><span>${esc(curto(p))}</span><b>${i.t==='brl'?brlC(vals[n]):vals[n]}</b><small>${tot>0?Math.round(vals[n]/tot*100):0}%</small></li>`).join('')}</ul></div>`;
  }
  function medidoresHtml(pessoas){
    return `<div class="cp-medidores">${pessoas.map(p=>{const c=Number(p.pedidos_criados||0),f=Number(p.criados_convertidos||0),pc=c?Math.round(f/c*100):null;
      return `<div class="cp-medidor" title="${esc(p.nome)}: ${f} de ${c} pedidos"><span class="cp-barra-nome">${esc(curto(p))}</span><div class="cp-trilho"><span style="width:${pc||0}%"></span></div><b>${pc==null?'—':pc+'%'}</b><small>${f} de ${c}</small></div>`;}).join('')}</div>`;
  }
  function graficoCategoria(g,itens,pessoas){
    const tem=k=>itens.find(i=>i.k===k);
    if(g==='Vendas'){
      const partes=[];
      if(tem('valor_fechado'))partes.push(`<h4>Participação no valor fechado</h4>${roscaHtml(pessoas,tem('valor_fechado'))}`);
      if(tem('taxa_conversao'))partes.push(`<h4>Conversão</h4>${medidoresHtml(pessoas)}`);
      if(!partes.length){const n=itens.filter(i=>i.t==='n');if(n.length)partes.push(`<h4>${esc(n.map(i=>i.r).join(' · '))}</h4>${barrasHtml(pessoas,n.slice(0,3),(i,v)=>fmtInd(i,v))}`);}
      return partes.join('');
    }
    // demais: barras agrupadas dos indicadores de contagem (uma unidade só por gráfico); sem contagem, os de valor
    let ser=itens.filter(i=>i.t==='n');if(!ser.length)ser=itens.filter(i=>i.t==='brl');
    if(!ser.length)return'';
    ser=ser.slice(0,3);
    return `<h4>${esc(ser.map(i=>i.r).join(' · '))}</h4>${barrasHtml(pessoas,ser,(i,v)=>i.t==='brl'?brlC(v):String(v))}`;
  }
  function tabelaCategoria(itens,pessoas,empresa){
    return `<table class="cp-cat-tab"><thead><tr><th scope="col">Indicador</th>${pessoas.map((p,n)=>`<th scope="col"><span class="cp-cat-pessoa" style="--cor:${CORES[n%CORES.length]}">${fotoPessoa(p,empresa)}</span></th>`).join('')}</tr></thead><tbody>${itens.map(i=>{
      const vals=pessoas.map(p=>valorInd(i,p)),nums=vals.map(v=>v==null?null:Number(v)),max=Math.max(...nums.filter(v=>v!=null));
      const todosIguais=nums.every(v=>v===nums[0]);const marca=v=>pessoas.length>1&&!todosIguais&&v!=null&&v>0&&v===max;
      return `<tr title="${esc(i.como)}"><th scope="row">${esc(i.r)}</th>${vals.map((v,n)=>`<td class="${marca(nums[n])?(RUINS.has(i.k)?'cp-pior':'cp-melhor'):''}"><button type="button" class="cp-num" data-det-ind="${i.k}" data-det-pessoa="${esc(pessoas[n].id)}" title="Ver os dados">${fmtInd(i,v)}</button></td>`).join('')}</tr>`;}).join('')}</tbody></table>`;
  }
  // Resumo rápido (nov/2026): até 6 frases simples no topo, para quem abre a tela entender na hora.
  const RESUMO=[['valor_fechado','Quem mais vendeu'],['taxa_conversao','Melhor conversão'],['pedidos_extras','Quem mais fez pedido extra'],['imagens_3d','Quem mais usa o Módulo 3D'],['posvenda_ligacoes','Quem mais fez pós-venda'],['contatos_atrasados','Mais contatos atrasados']];
  function resumoHtml(sel,pessoas,empresa){
    if(pessoas.length<2)return'';
    const frases=RESUMO.map(([k,t])=>{const i=sel.find(x=>x.k===k);if(!i)return'';const vals=pessoas.map(p=>({p,v:valorInd(i,p)})).filter(x=>x.v!=null&&Number(x.v)>0).sort((a,b)=>b.v-a.v);if(!vals.length)return'';
      const top=vals.filter(x=>x.v===vals[0].v);
      return `<div class="cp-res${RUINS.has(k)?' cp-res-atencao':''}" title="${esc(i.como)}"><span class="cp-res-tit">${esc(t)}</span><div class="cp-res-quem">${top.map(x=>fotoPessoa(x.p,empresa)).join('')}</div><strong>${fmtInd(i,vals[0].v)}${top.length>1?' <small>(empate)</small>':''}</strong></div>`;}).filter(Boolean);
    return frases.length?`<section class="cp-resumo" aria-label="Resumo rápido">${frases.join('')}</section>`:'';
  }
  // Gaveta lateral (nov/2026): clicar num número abre, pela direita, os dados que formam aquele número
  // (RPC comercial_prod_detalhe, mesmas regras dos indicadores). Fecha no ×, no fundo escuro ou com Esc.
  let DET={};
  function abrirDetalhe(ind,pessoa){
    const i=INDICADORES.find(x=>x.k===ind),p=(DET.pessoas||[]).find(x=>x.id===pessoa);if(!i||!p)return;
    let g=document.getElementById('cpGaveta');
    if(!g){g=document.createElement('div');g.id='cpGaveta';g.className='cp-gaveta';g.innerHTML='<div class="cp-gaveta-fundo" data-fechar></div><aside class="cp-gaveta-painel" role="dialog" aria-modal="true" aria-labelledby="cpGavetaTit"><header><div><h3 id="cpGavetaTit"></h3><p class="cp-gaveta-sub"></p></div><button type="button" class="cp-gaveta-x" data-fechar aria-label="Fechar">×</button></header><div class="cp-gaveta-corpo"></div></aside>';
      document.body.append(g);g.addEventListener('click',e=>{if(e.target.closest('[data-fechar]'))fecharDetalhe();});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&g.classList.contains('aberta'))fecharDetalhe();});}
    g.querySelector('#cpGavetaTit').innerHTML=fotoPessoa(p,DET.empresa);
    g.querySelector('.cp-gaveta-sub').innerHTML=`<b>${esc(i.r)}: ${fmtInd(i,valorInd(i,p))}</b><span>${esc(i.como)}</span><small>${dataBr(DET.de)} a ${dataBr(DET.ate)}</small>`;
    const corpo=g.querySelector('.cp-gaveta-corpo');corpo.innerHTML='<p class="cp-vazio">Carregando…</p>';
    g.removeAttribute('aria-hidden');g.inert=false;g.classList.add('aberta');document.documentElement.classList.add('cp-gaveta-aberta');g.querySelector('.cp-gaveta-x').focus();
    rpc('comercial_prod_detalhe',{p_empresa:DET.empresa,p_de:DET.de,p_ate:DET.ate,p_pessoa:pessoa,p_indicador:ind}).then(linhas=>{
      if(!linhas.length){corpo.innerHTML='<p class="cp-vazio">Nenhum registro no período.</p>';return;}
      const temValor=linhas.some(l=>l.valor!=null),soma=linhas.reduce((a,l)=>a+(Number(l.valor)||0),0);
      corpo.innerHTML=`<p class="cp-gaveta-total">${linhas.length} registro(s)${temValor?' · soma '+Number(soma).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''}</p>
        <table class="cp-det"><thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Detalhe</th>${temValor?'<th class="num">Valor</th>':''}</tr></thead><tbody>${linhas.map(l=>`<tr><td>${dataBr(l.dia)}</td><td>${l.pedido_id?`<a class="cp-det-ped" href="${urlPedido(l.pedido_id)}" target="_top">${esc(l.pedido||'')}</a>`:esc(l.pedido||'—')}</td><td>${l.cliente?`<span class="cp-det-cli">${fotoCli(l)}${esc(l.cliente)}</span>`:'—'}</td><td>${esc(l.detalhe||'')}</td>${temValor?`<td class="num">${l.valor==null?'—':Number(l.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>`:''}</tr>`).join('')}</tbody></table>`;
    }).catch(err=>{corpo.innerHTML=`<p class="cp-vazio">${esc(err.message)}</p>`;});
  }
  const fotoCli=l=>{const ini=String(l.cliente||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';return `<span class="cp-det-foto"><i>${esc(ini)}</i>${l.cliente_foto?`<img src="${esc(l.cliente_foto)}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;};
  function fecharDetalhe(){const g=document.getElementById('cpGaveta');if(!g)return;g.classList.remove('aberta');g.setAttribute('aria-hidden','true');g.inert=true;document.documentElement.classList.remove('cp-gaveta-aberta');}
  const dataBr=d=>{const x=String(d||'').slice(0,10);return x?x.slice(8,10)+'/'+x.slice(5,7)+'/'+x.slice(0,4):'—';};
  const urlPedido=id=>new URL('../Pedidos/pedido.html?pedido='+encodeURIComponent(id)+'&modo=editar',location.href.replace(/[^/]*$/,'')).href;
  function pintarCategorias(box,sel,pessoas,empresa){
    if(!box)return;
    if(!sel.length){box.innerHTML='<p class="cp-vazio">Nenhum indicador marcado em Parâmetros › Comercial.</p>';return;}
    if(!pessoas.length){box.innerHTML='<p class="cp-vazio">Nenhuma pessoa do Comercial liberada para você. Configure em Parâmetros › Comercial.</p>';return;}
    DET={...DET,pessoas,empresa};
    if(!box.dataset.detLigado){box.dataset.detLigado='1';box.addEventListener('click',e=>{const b=e.target.closest('[data-det-ind]');if(b)abrirDetalhe(b.dataset.detInd,b.dataset.detPessoa);});}
    box.innerHTML=''+[...new Set(sel.map(i=>i.g))].map(g=>{const itens=sel.filter(i=>i.g===g),graf=graficoCategoria(g,itens,pessoas);
      return `<section class="cp-cat" aria-label="${esc(g)}"><header class="cp-cat-cab"><h2>${esc(g)}</h2></header>
        <div class="cp-cat-corpo${graf?'':' sem-grafico'}"><div class="cp-cat-dados">${tabelaCategoria(itens,pessoas,empresa)}</div>${graf?`<div class="cp-cat-graf">${graf}</div>`:''}</div></section>`;}).join('');
  }
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
      <h4>O que aparece no painel</h4><p>Marque os indicadores que aparecem na Produtividade comercial. Todos são calculados com dados reais do sistema, por pessoa.</p><div class="cp-ind-lista">${[...new Set(INDICADORES.map(i=>i.g))].map(g=>`<div class="cp-ind-grupo"><h5>${esc(g)}</h5>${INDICADORES.filter(i=>i.g===g).map(i=>`<label class="cp-ind"><input type="checkbox" name="indicador" value="${i.k}" ${(Array.isArray(cfg.indicadores)?cfg.indicadores.includes(i.k):true)?'checked':''}><span><b>${esc(i.r)}</b><small>${esc(i.como)}</small></span></label>`).join('')}</div>`).join('')}</div><h4>Quem pode ver de quem</h4><p>“Total da equipe” libera apenas números agregados, sem mostrar pessoas ou ações individuais.</p><div class="cp-scroll"><table><thead><tr><th>Quem consulta</th>${ctx.pessoas.map(p=>`<th>${esc(p.nome)}</th>`).join('')}<th>Total da equipe</th></tr></thead><tbody>${ctx.pessoas.map(o=>`<tr><th>${esc(o.nome)}</th>${[...ctx.pessoas.map(p=>p.id),'equipe'].map(alvo=>`<td><input aria-label="${esc(o.nome)} pode ver ${esc(alvo==='equipe'?'equipe':ctx.pessoas.find(p=>p.id===alvo)?.nome)}" type="checkbox" data-observador="${esc(o.id)}" data-alvo="${esc(alvo)}" ${cfg.acessos.some(a=>a.observador===o.id&&a.alvo===alvo)?'checked':''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="btn primary" type="submit">Salvar produtividade</button></fieldset><p role="status"></p></form>`;
      const form=card.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const status=form.querySelector('[role=status]');const btn=form.querySelector('[type=submit]');btn.disabled=true;
        const linhas=nome=>[...new Set(form.elements[nome].value.split('\n').map(x=>x.trim()).filter(Boolean))];
        try {await rpc('comercial_prod_config_salvar',{p_empresa:empresa,p_config:{participantes:[...form.querySelectorAll('[name=participante]:checked')].map(el=>el.value),acessos:[...form.querySelectorAll('[data-alvo]:checked')].map(el=>({observador:el.dataset.observador,alvo:el.dataset.alvo})),situacoes:linhas('situacoes'),motivos:linhas('motivos'),indicadores:[...form.querySelectorAll('[name=indicador]:checked')].map(el=>el.value)}});status.textContent='Configuração salva.';}catch(err){status.textContent=err.message;}finally{btn.disabled=false;}
      };
    }catch(err){card.querySelector('[role=status]').textContent=err.message;}
  };

  async function painel(){
    const root=document.getElementById('produtividadeComercial');if(!root)return;
    const status=root.querySelector('[role=status]');
    try{
      const empresa=await contexto(),ctx=await rpc('comercial_prod_contexto',{p_empresa:empresa});const form=root.querySelector('form');
      const inicio=new Date();inicio.setDate(inicio.getDate()-29);form.elements.de.value=inicio.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});form.elements.ate.value=hoje();
      // administrador (configura a empresa) vê todos os participantes, mesmo sem cadastro de funcionário (19/11/2026)
      const acessiveis=ctx.pessoas.filter(p=>ctx.config.participantes.includes(p.id)&&(ctx.admin||p.id===ctx.usuario||ctx.config.acessos.some(a=>a.observador===ctx.usuario&&a.alvo===p.id)));
      form.elements.pessoa.innerHTML='<option value="">Pessoas autorizadas</option>'+acessiveis.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')+(ctx.admin||ctx.config.acessos.some(a=>a.observador===ctx.usuario&&a.alvo==='equipe')?'<option value="equipe">Total da equipe</option>':'');
      let sequencia=0,eventos=[];
      const rotulos={criacao:'Pedido criado',alteracao:'Alteração',acompanhamento:'Acompanhamento'};
      function pintarEventos(){
        const sel=root.querySelector('[data-tipo]'),box=root.querySelector('[data-eventos]');if(!sel||!box)return; // nov/2026: "Atividade por dia" e "Ações e detalhes" saíram da tela
        const tipo=sel.value;
        box.innerHTML=eventos.filter(e=>!tipo||e.tipo===tipo).map(e=>`<details><summary>${data(e.criado_em)} · ${esc(e.autor)} · Pedido ${esc(e.numero_pedido||'excluído')} · ${rotulos[e.tipo]||esc(e.tipo)}</summary>${e.detalhes.map(d=>`<p>${esc(d.campo||d.tipo)}${d.registro?' · registro '+esc(d.registro):''}: ${esc(JSON.stringify(d.de??d.situacao??''))} → ${esc(JSON.stringify(d.para??d.observacao??''))}</p>`).join('')}</details>`).join('')||'Sem ações individuais disponíveis nesta visão.';
      }
      if(root.querySelector('[data-tipo]'))root.querySelector('[data-tipo]').onchange=pintarEventos;
      async function carregar(){const atual=++sequencia;status.textContent='Carregando…';try{
        const r=await rpc('comercial_prod_painel',{p_empresa:empresa,p_de:form.elements.de.value,p_ate:form.elements.ate.value,p_autor:form.elements.pessoa.value==='equipe'?null:form.elements.pessoa.value||null,p_equipe:form.elements.pessoa.value==='equipe'});if(atual!==sequencia)return;
        status.textContent=''; // nov/2026: a frase de escopo saiu a pedido; a linha só mostra Carregando e erros
        root.dataset.escopo=r.escopo||'';
        const pontualidade=r.totais.retornos_concluidos?Math.round(Number(r.totais.no_prazo)/Number(r.totais.retornos_concluidos)*100)+'%':'—';
        {const kp=root.querySelector('[data-kpis]');if(kp)kp.innerHTML=[['Pedidos trabalhados',r.pedidos],['Pedidos criados',r.totais.criados],['Operações de alteração',r.totais.alteracoes],['Detalhes alterados',r.totais.detalhes],['Acompanhamentos',r.totais.acompanhamentos],['Retornos no prazo',r.totais.no_prazo],['Pontualidade dos retornos',pontualidade],['Retornos atrasados',r.totais.atrasados]].map(([t,v])=>`<div><small>${t}</small><strong>${v}</strong></div>`).join('');}
        {const ind=await rpc('comercial_prod_indicadores',{p_empresa:empresa,p_de:form.elements.de.value,p_ate:form.elements.ate.value});if(atual!==sequencia)return;
         const sel=Array.isArray(ind.indicadores)?INDICADORES.filter(i=>ind.indicadores.includes(i.k)):INDICADORES;
         DET={de:form.elements.de.value,ate:form.elements.ate.value};
         pintarCategorias(root.querySelector('[data-categorias]'),sel,ind.pessoas,empresa);}
        const max=Math.max(1,...r.dias.map(d=>Number(d.acoes)));if(root.querySelector('[data-dias]'))root.querySelector('[data-dias]').innerHTML=r.dias.map(d=>`<div class="cp-dia"><span>${data(d.dia)}</span><meter min="0" max="${max}" value="${d.acoes}"></meter><b>${d.acoes}</b></div>`).join('')||'Sem atividade no período.';
        const acoes=r.dias.reduce((s,d)=>s+Number(d.acoes),0);
        if(root.querySelector('[data-evolucao]'))root.querySelector('[data-evolucao]').textContent=r.anterior?`${acoes} ações no período. Período anterior (${data(r.anterior.de)} a ${data(r.anterior.ate)}): ${r.anterior.acoes} ações e ${r.anterior.pedidos} pedidos trabalhados. Média por dia com atividade: ${r.dias.length?(acoes/r.dias.length).toFixed(1):'0'}.` : '';
        eventos=r.eventos;pintarEventos();
      }catch(err){if(atual===sequencia)status.textContent=err.message;}}
      form.onsubmit=e=>{e.preventDefault();carregar();};await carregar();
    }catch(err){status.textContent=err.message;}
  }
  painel();
})();
