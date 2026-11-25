/* Gerencial de Compras: o padrão de Produtividade/Cancelamentos, com dados à esquerda e gráficos à direita. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
  const brl=v=>v==null?'—':(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pct=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const hoje=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const CORES=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#6250d6','#008300','#e34948'];
  const S={dados:null,relatorio:null,ativo:false,sujo:true,revisao:0,filtro:{de:hoje().slice(0,4)+'-01-01',ate:hoje(),fornecedor:''}};
  const host=()=>document.getElementById('purchaseManager');
  const vazio=texto=>'<p class="cg-vazio">'+esc(texto||'Sem registros neste período.')+'</p>';
  const tabela=(cab,linhas)=>linhas.length?'<div class="cg-rolar"><table class="cg-tabela"><thead><tr>'+cab.map(c=>'<th scope="col">'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+linhas.map(l=>'<tr>'+l.map((c,i)=>'<'+(i?'td':'th scope="row"')+'>'+c+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div>':vazio();
  const todasLinhas=(cab,linhas)=>tabela(cab,linhas.slice(0,20))+(linhas.length>20?'<details class="cg-mais"><summary>Ver mais '+num(linhas.length-20)+' registros</summary>'+tabela(cab,linhas.slice(20))+'</details>':'');
  const quadro=(id,titulo,nota,dados,grafico)=>'<section class="cg-quadro" id="cg-'+id+'"><header><h3>'+esc(titulo)+'</h3>'+(nota?'<p>'+esc(nota)+'</p>':'')+'</header><div class="cg-corpo"><div class="cg-dados">'+dados+'</div><div class="cg-grafico">'+grafico+'</div></div></section>';
  const linkPedido=o=>'<a class="cg-link" href="?pedido='+encodeURIComponent(o.id)+'">PC-'+String(o.numero||'').padStart(6,'0')+'</a>';
  const grupoLink=(g,tipo)=>'<button type="button" class="cg-link" data-cg-'+tipo+'="'+esc(g.chave)+'">'+esc(g.nome)+'</button>';
  function rosca(grupos,titulo,monetario=true,acao=''){
    let itens=grupos.filter(g=>Number(g.valor)>0),total=itens.reduce((s,g)=>s+g.valor,0);
    if(!total)return vazio('Sem dados para este gráfico.');
    if(itens.length>8)itens=itens.slice(0,7).concat([{nome:'Outros',valor:itens.slice(7).reduce((s,g)=>s+g.valor,0)}]);
    const circ=2*Math.PI*60;let acumulado=0;
    const fmt=monetario?brl:num;
    const fatias=itens.map((g,i)=>{const fracao=g.valor/total,comprimento=Math.max(0,fracao*circ-(itens.length>1?2:0)),offset=-acumulado*circ;acumulado+=fracao;
      return '<circle cx="80" cy="80" r="60" fill="none" stroke="'+CORES[i]+'" stroke-width="26" stroke-dasharray="'+comprimento+' '+(circ-comprimento)+'" stroke-dashoffset="'+offset+'" transform="rotate(-90 80 80)"><title>'+esc(g.nome)+': '+esc(fmt(g.valor))+' ('+pct(fracao)+')</title></circle>';}).join('');
    const curto=monetario?'R$ '+(total/100).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1}):num(total);
    return '<h4>'+esc(titulo)+'</h4><div class="cg-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="'+esc(titulo)+'">'+fatias+'<text x="80" y="76" text-anchor="middle" class="cg-rosca-rot">Total</text><text x="80" y="98" text-anchor="middle" class="cg-rosca-valor">'+esc(curto)+'</text></svg><ul class="cg-legenda">'+itens.map((g,i)=>'<li><i style="background:'+CORES[i]+'"></i><span>'+(acao&&g.chave?grupoLink(g,acao):esc(g.nome))+'</span><b>'+esc(fmt(g.valor))+'</b><small>'+pct(g.valor/total)+'</small></li>').join('')+'</ul></div>';
  }
  function barras(grupos){
    if(!grupos.length)return vazio('Sem dados para este gráfico.');
    const max=Math.max(1,...grupos.map(g=>g.valor));
    return '<h4>Valor comprado por mês</h4><div class="cg-barras">'+grupos.map(g=>'<div><span>'+esc(g.nome.split('-').reverse().join('/'))+'</span><div class="cg-trilho"><i style="width:'+g.valor/max*100+'%"></i></div><b>'+brl(g.valor)+'</b></div>').join('')+'</div>';
  }
  const indisponivel=nome=>vazio(nome+' indisponível. Use Atualizar para tentar novamente.');
  function pintar(){
    if(!S.dados)return;
    const r=window.ComprasGerencialDados.calcular(S.dados,{...S.filtro,hoje:hoje()});S.relatorio=r;
    const fin=r.financeiro,ant=r.anterior;
    let html='';
    if(!r.quantidade)html+='<p class="cg-aviso">Nenhuma compra válida neste período e fornecedor. Ajuste os filtros para consultar outro recorte.</p>';
    if(r.semData)html+='<p class="cg-aviso">'+num(r.semData)+' pedido(s) sem data de compra ou emissão ficaram fora do filtro de período.</p>';
    html+=quadro('resumo','Visão do período','A data da compra define o período. Nas compras cotadas, vale a data de emissão do pedido.',tabela(['Indicador','Período selecionado','Período anterior'],[
      ['Valor comprado',brl(r.total),brl(ant?.valor)],['Pedidos emitidos',num(r.quantidade),num(ant?.pedidos)],['Ticket médio',brl(r.ticket),brl(ant?.pedidos?ant.valor/ant.pedidos:null)],['Compras diretas',brl(r.diretas)+' · '+pct(r.total?r.diretas/r.total:null),'—'],['Frete informado',brl(r.frete),'—'],['Descontos informados',brl(r.descontos),'—'],['Top 3 fornecedores',pct(r.concentracao),'—']])+ (ant?'<p class="cg-nota">Comparação com '+data(ant.de)+' a '+data(ant.ate)+', com a mesma quantidade de dias.</p>':''),rosca(r.entregas.map(g=>({...g,valor:g.pedidos})),'Recebimento dos pedidos',false));
    html+=quadro('fornecedores','Onde mais compramos','Clique no fornecedor para filtrar o painel. Valores de pedidos válidos, incluindo frete e descontos.',todasLinhas(['Fornecedor','Pedidos','Valor comprado','Participação','Ticket médio','Em aberto','Entregas atrasadas','Pedidos com divergência'],r.fornecedores.map(g=>[grupoLink(g,'fornecedor'),num(g.pedidos),brl(g.valor),pct(r.total?g.valor/r.total:null),brl(g.valor/g.pedidos),brl(fin?g.aberto:null),num(g.atrasados),num(r.rncs?g.divergencias:null)])),rosca(r.fornecedores,'Gastos por fornecedor',true,'fornecedor'));
    html+=quadro('itens','O que mais compramos','Ordenado pelo valor dos itens, antes de frete, descontos e ajustes. Quantidades de unidades diferentes não são somadas.',todasLinhas(['Item','Unidade','Quantidade','Pedidos','Valor dos itens','Preço médio por unidade'],r.itens.map(g=>[grupoLink(g,'item'),esc(g.unidade),num(g.quantidade),num(g.pedidos),brl(g.valor),brl(g.quantidade?g.valor/g.quantidade:null)]))+tabela(['Composição do valor comprado','Valor'],[['Itens',brl(r.brutoItens)],['Frete',brl(r.frete)],['Descontos','− '+brl(r.descontos)],['Outros ajustes dos pedidos',brl(r.ajustes)],['Total comprado',brl(r.total)]]),rosca(r.itens,'Participação no valor dos itens',true,'item'));
    for(const [id,titulo,grupos] of [['destinos','Para onde vão as compras',r.destinos],['origens','O que gera as compras',r.origens]])html+=quadro(id,titulo,'O valor total de cada pedido é distribuído proporcionalmente ao valor de seus itens. Pedidos sem informação aparecem separados.',todasLinhas([id==='destinos'?'Destino':'Origem da necessidade','Pedidos envolvidos','Valor','Participação'],grupos.map(g=>[esc(g.nome),num(g.pedidos),brl(g.valor),pct(r.total?g.valor/r.total:null)]))+'<p class="cg-nota">Um pedido pode atender mais de um destino ou origem; a contagem de pedidos não é somável entre as linhas.</p>',rosca(grupos,titulo));
    html+=quadro('responsaveis','Compras por responsável','Responsável registrado na emissão do pedido de compra.',todasLinhas(['Responsável','Pedidos','Valor comprado','Ticket médio'],r.compradores.map(g=>[esc(g.nome),num(g.pedidos),brl(g.valor),brl(g.valor/g.pedidos)])),rosca(r.compradores,'Valor comprado por responsável'));
    html+=quadro('evolucao','Evolução das compras','Valor dos pedidos por mês da compra, dentro do período selecionado.',tabela(['Mês','Pedidos','Valor comprado','Ticket médio'],r.meses.map(g=>[esc(g.nome.split('-').reverse().join('/')),num(g.pedidos),brl(g.valor),brl(g.valor/g.pedidos)])),barras(r.meses));
    html+=quadro('financeiro','Pagamento das compras','Posição atual das contas geradas pelas compras filtradas. Os valores pagos não representam o fluxo de caixa ocorrido no período.',fin?tabela(['Situação','Valor'],[['Já pago',brl(fin.pago)],['Compensado / créditos',brl(fin.compensado)],['Em aberto, não vencido',brl(fin.aVencer)],['Vencido em aberto',brl(fin.vencido)]])+tabela(['Vencimento do saldo em aberto','Valor'],fin.porPrazo.map(g=>[g.nome,brl(g.valor)]))+(fin.semConta?'<p class="cg-aviso">'+num(fin.semConta)+' pedido(s) ainda sem conta a pagar ativa. O financeiro abaixo cobre as contas já geradas.</p>':''):indisponivel('Pagamentos'),fin?rosca([{nome:'Já pago',valor:fin.pago},{nome:'Compensado',valor:fin.compensado},{nome:'A vencer',valor:fin.aVencer},{nome:'Vencido',valor:fin.vencido}],'Situação financeira'):indisponivel('Gráfico financeiro'));
    html+=quadro('qualidade','Entregas, documentação e qualidade','Atrasos consideram o prazo acordado e a situação atual. Divergências pertencem aos pedidos selecionados, independentemente da data de abertura.',tabela(['Indicador','Quantidade'],[['Pedidos com entrega atrasada',num(r.atrasados.length)],['Pedidos ainda a receber',num(r.pendentes.length)],['Pedidos sem número de NF informado',num(r.semNota)],['Pedidos com divergência',num(r.rncs?r.comRnc:null)],['Taxa de pedidos com divergência',pct(r.rncs&&r.quantidade?r.comRnc/r.quantidade:null)],['Divergências ainda abertas',num(r.rncs?r.rncs.filter(x=>x.status!=='resolvida'&&x.status!=='cancelada').length:null)]]),r.rncs?rosca([{nome:'Pedidos com divergência',valor:r.comRnc},{nome:'Pedidos sem divergência registrada',valor:r.quantidade-r.comRnc}],'Pedidos com divergência',false):indisponivel('Divergências'));
    html+=quadro('entregas','Pedidos pendentes de recebimento','Prioridade pelo prazo acordado. Abra o pedido para acompanhar itens, documentos e recebimentos.',todasLinhas(['Pedido','Fornecedor','Prazo acordado','Situação','Valor do pedido'],r.pendentes.map(o=>[linkPedido(o),esc(o.nomeFornecedor),data(o.prazo_acordado||o.previsao_entrega),esc(o.entrega),brl(o.valor)])),rosca(r.pendentes.reduce((a,o)=>{let g=a.find(x=>x.nome===o.entrega);if(!g)a.push(g={nome:o.entrega,valor:0});g.valor++;return a;},[]),'Pendências de recebimento',false));
    const q=r.negociacao;
    html+=quadro('cotacoes','Cotações e concorrência','Cotações emitidas no período. Duas respostas não garantem propostas equivalentes; economia só é confirmada após comparar os mesmos itens e condições.',q?tabela(['Indicador','Quantidade'],[['Cotações emitidas',num(q.total)],['Ainda abertas',num(q.abertas)],['Convites enviados a fornecedores',num(q.convites)],['Respostas recebidas',num(q.respostas)],['Taxa de resposta',pct(q.convites?q.respostas/q.convites:null)],['Cotações com ao menos duas respostas',num(q.concorrencia)]]):indisponivel('Cotações'),q?rosca([{nome:'Com pelo menos duas respostas',valor:q.concorrencia},{nome:'Com menos de duas respostas',valor:q.total-q.concorrencia}],'Concorrência nas cotações',false):indisponivel('Gráfico de cotações'));
    html+=quadro('creditos','Créditos disponíveis com fornecedores','Saldo atual de todos os períodos. O filtro de fornecedor se aplica; o filtro de data não limita os créditos disponíveis.',r.creditos?todasLinhas(['Fornecedor','Descrição','Crédito original','Saldo disponível'],r.creditos.map(c=>[esc(c.fornecedor||c.fornecedor_nome),esc(c.descricao),brl(c.valor),brl(c.saldo)])):indisponivel('Créditos'),r.creditos?rosca(r.creditos.reduce((a,c)=>{const nome=c.fornecedor||c.fornecedor_nome||'Fornecedor não informado';let g=a.find(x=>x.nome===nome);if(!g)a.push(g={nome,valor:0});g.valor+=c.saldo;return a;},[]),'Saldo de créditos por fornecedor'):indisponivel('Gráfico de créditos'));
    html+=quadro('pedidos','Pedidos que compõem o painel','A lista mantém o mesmo recorte de período e fornecedor dos indicadores.',todasLinhas(['Pedido','Compra / emissão','Fornecedor','Recebimento','Valor'],r.pedidos.slice().sort((a,b)=>b.data.localeCompare(a.data)).map(o=>[linkPedido(o),data(o.data),esc(o.nomeFornecedor),esc(o.entrega),brl(o.valor)])),rosca([{nome:'Compras diretas',valor:r.diretas},{nome:'Demais compras',valor:r.total-r.diretas}],'Compras diretas e demais compras'));
    host().querySelector('[data-cg-relatorio]').innerHTML=html;
  }
  function montar(){
    host().innerHTML='<form class="cg-filtros"><label>De<input type="date" name="de" required value="'+S.filtro.de+'"></label><label>Até<input type="date" name="ate" required value="'+S.filtro.ate+'"></label><label>Fornecedor<select name="fornecedor"><option value="">Todos os fornecedores</option></select></label><button class="fin-btn" type="submit">Consultar</button><div class="cg-atalhos"><button type="button" data-cg-periodo="mes">Este mês</button><button type="button" data-cg-periodo="90">Últimos 90 dias</button><button type="button" data-cg-periodo="ano">Este ano</button></div><div class="cg-ferramentas"><button type="button" class="fin-btn claro" data-cg-atualizar>Atualizar</button><button type="button" class="fin-btn claro" data-cg-imprimir>Imprimir</button><button type="button" class="fin-btn" data-cg-excel>Exportar para Excel</button></div></form><p class="cg-status" role="status"></p><div data-cg-relatorio></div>';
    host().querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.target;if(form.elements.de.value>form.elements.ate.value){host().querySelector('.cg-status').textContent='A data inicial deve ser anterior ou igual à final.';return;}S.filtro={de:form.elements.de.value,ate:form.elements.ate.value,fornecedor:form.elements.fornecedor.value};host().querySelector('.cg-status').textContent=S.aviso||'';pintar();};
  }
  async function carregar(){
    const revisao=++S.revisao;
    if(!host().querySelector('form'))montar();
    const status=host().querySelector('.cg-status');status.textContent='Carregando indicadores de Compras…';host().setAttribute('aria-busy','true');
    try{
      await window.AcervoComprasAuth?.ready;
      const api=window.AcervoComprasAPI,ctx=window.__CONTEXT, sb=window.supabaseClient;
      const consultas=[['pedidos',()=>api.listPurchaseOrdersV2()],['necessidades',()=>api.listPurchaseNeeds()],['cotacoes',()=>api.listQuotationRequests()],['rncs',()=>api.listReceivingRncs()],['creditos',()=>api.listSupplierCredits()],['contas',async()=>{const r=await sb.rpc('compras_contas_pagar',{p_empresa:ctx.empresa_id});if(r.error)throw r.error;return r.data;}]];
      const resultados=await Promise.allSettled(consultas.map(([,fn])=>Promise.resolve().then(fn)));
      if(revisao!==S.revisao)return;
      if(resultados[0].status==='rejected')throw resultados[0].reason;
      S.dados={};const indisponiveis=[];
      resultados.forEach((r,i)=>{S.dados[consultas[i][0]]=r.status==='fulfilled'?(r.value||[]):null;if(r.status==='rejected')indisponiveis.push(({necessidades:'vínculos das necessidades',cotacoes:'cotações',rncs:'divergências',creditos:'créditos',contas:'pagamentos'})[consultas[i][0]]);});
      S.sujo=false;S.atualizado=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});S.aviso=indisponiveis.length?'Não foi possível consultar: '+indisponiveis.join(', ')+'.':'';status.textContent=S.aviso;
      const opcoes=window.ComprasGerencialDados.calcular(S.dados,S.filtro).opcoesFornecedores;
      const sel=host().querySelector('[name="fornecedor"]');sel.innerHTML='<option value="">Todos os fornecedores</option>'+opcoes.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nome)+'</option>').join('');sel.value=S.filtro.fornecedor;if(!sel.value)S.filtro.fornecedor='';pintar();
    }catch(e){if(revisao===S.revisao){S.sujo=true;status.textContent='Não foi possível carregar o gerencial: '+(e.message||e)+'. Use Atualizar para tentar novamente.';}}
    finally{if(revisao===S.revisao)host().removeAttribute('aria-busy');}
  }
  function detalheItem(chave){
    const g=S.relatorio.itens.find(i=>i.chave===chave);if(!g)return;
    const d=document.createElement('dialog');d.className='fin-modal cg-modal';d.setAttribute('aria-label','Compras de '+g.nome);
    d.innerHTML='<div class="fin-modal-caixa"><header><h3>'+esc(g.nome)+' · '+esc(g.unidade)+'</h3><button type="button" class="fin-x" aria-label="Fechar">×</button></header><div class="fin-modal-corpo">'+tabela(['Pedido','Data','Fornecedor','Quantidade','Valor dos itens'],S.relatorio.pedidos.filter(o=>g.ids.includes(o.id)).map(o=>{const itens=o.itens.filter(i=>i.chave===chave);return [linkPedido(o),data(o.data),esc(o.nomeFornecedor),num(itens.reduce((s,i)=>s+i.quantidade,0))+' '+esc(g.unidade),brl(itens.reduce((s,i)=>s+i.valor,0))];}))+'</div></div>';
    d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
  }
  async function exportar(){
    if(!S.relatorio)return;const r=S.relatorio,fin=r.financeiro;
    const nomeFiltro=S.filtro.fornecedor?(r.opcoesFornecedores.find(g=>g.id===S.filtro.fornecedor)?.nome||'Fornecedor selecionado'):'Todos os fornecedores';
    const meta=[['Gerencial de Compras',data(S.filtro.de)+' a '+data(S.filtro.ate)],['Fornecedor',nomeFiltro],['Atualização',S.atualizado],[]];
    const aba=(nome,cab,linhas)=>({nome,linhas:[...meta,cab,...linhas]});
    const abas=[aba('Resumo',['Indicador','Valor'],[['Valor comprado',r.total/100],['Pedidos',r.quantidade],['Ticket médio',r.ticket==null?null:r.ticket/100],['Frete',r.frete/100],['Descontos',r.descontos/100],['Ajustes',r.ajustes/100],['Compras diretas',r.diretas/100],['Entregas atrasadas',r.atrasados.length],['Em aberto (posição atual)',fin?fin.aberto/100:null],['Já pago (posição atual)',fin?fin.pago/100:null],['Créditos disponíveis (todos os períodos)',r.creditoDisponivel==null?null:r.creditoDisponivel/100]]),
      aba('Fornecedores',['Fornecedor','Pedidos','Valor comprado','Participação (%)','Em aberto','Entregas atrasadas'],r.fornecedores.map(g=>[g.nome,g.pedidos,g.valor/100,r.total?g.valor/r.total*100:null,fin?g.aberto/100:null,g.atrasados])),
      aba('Itens',['Item','Unidade','Quantidade','Pedidos','Valor dos itens','Preço médio'],r.itens.map(g=>[g.nome,g.unidade,g.quantidade,g.pedidos,g.valor/100,g.quantidade?g.valor/g.quantidade/100:null])),
      ...[['Destinos',r.destinos],['Origens',r.origens],['Responsáveis',r.compradores],['Evolução mensal',r.meses]].map(([nome,lista])=>aba(nome,['Grupo','Pedidos envolvidos','Valor'],lista.map(g=>[g.nome,g.pedidos,g.valor/100]))),
      aba('Pedidos',['Pedido','Data','Fornecedor','Recebimento','Valor'],r.pedidos.map(o=>['PC-'+String(o.numero).padStart(6,'0'),data(o.data),o.nomeFornecedor,o.entrega,o.valor/100]))];
    if(fin)abas.push(aba('Pagamentos',['Situação (posição atual)','Valor'],[['Pago',fin.pago/100],['Compensado',fin.compensado/100],...fin.porPrazo.map(g=>[g.nome,g.valor/100])]));
    if(r.creditos)abas.push(aba('Créditos',['Fornecedor','Descrição','Saldo atual de todos os períodos'],r.creditos.map(c=>[c.fornecedor||c.fornecedor_nome,c.descricao,c.saldo/100])));
    const b=host().querySelector('[data-cg-excel]');b.disabled=true;try{await window.ComercialRelatorios.exportar(abas,'Compras gerencial '+S.filtro.de+' a '+S.filtro.ate);}finally{b.disabled=false;}
  }
  function iniciar(){
    if(!host())return;
    host().addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-cg-atualizar'))carregar();
      else if(b.hasAttribute('data-cg-imprimir'))window.print();
      else if(b.hasAttribute('data-cg-excel'))exportar();
      else if(b.dataset.cgFornecedor){S.filtro.fornecedor=b.dataset.cgFornecedor;host().querySelector('[name="fornecedor"]').value=S.filtro.fornecedor;pintar();host().scrollIntoView({block:'start',behavior:'smooth'});}
      else if(b.dataset.cgItem)detalheItem(b.dataset.cgItem);
      else if(b.dataset.cgPeriodo){const fim=hoje(),ini=b.dataset.cgPeriodo==='mes'?fim.slice(0,7)+'-01':b.dataset.cgPeriodo==='ano'?fim.slice(0,4)+'-01-01':new Date(Date.parse(fim+'T12:00:00Z')-89*864e5).toISOString().slice(0,10);const form=host().querySelector('form');form.elements.de.value=ini;form.elements.ate.value=fim;form.requestSubmit();}
    });
    window.addEventListener('compras-aba',e=>{S.ativo=e.detail==='gerencial';if(S.ativo){if(!S.dados||S.sujo)carregar();else pintar();}});
    window.addEventListener('compras-contas-atualizar',()=>{S.sujo=true;if(S.ativo)carregar();});
    let abertosAntesDeImprimir=[];
    window.addEventListener('beforeprint',()=>{if(!S.ativo)return;abertosAntesDeImprimir=[...host().querySelectorAll('details.cg-mais')].map(el=>({el,aberto:el.open}));abertosAntesDeImprimir.forEach(({el})=>el.open=true);});
    window.addEventListener('afterprint',()=>{abertosAntesDeImprimir.forEach(({el,aberto})=>el.open=aberto);abertosAntesDeImprimir=[];});
    S.ativo=document.querySelector('[data-pv-tab="gerencial"]')?.classList.contains('active');if(S.ativo)carregar();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
