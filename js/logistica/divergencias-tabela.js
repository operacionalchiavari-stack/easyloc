/* Divergências de frete, free e Uber agrupadas por pedido (nov/2026). Uma tabela só para Logística (com as ações),
   Financeiro › Fechamentos de parceiros (frete e Uber) e RH › Pagamento de Freelancer (free), que só acompanham.
   Mostra os dois lados: a explicação do parceiro (app) e a decisão do supervisor. Usa as classes pla-* (painel-anunciados.css). */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=v=>v==null||v===''?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dia=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'Sem data';
  const quando=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const hm=v=>v?new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):'';
  const SERV={frete:'Frete',free:'Montagem (free)',uber:'Uber'};
  const TIPOS={valor:'Valores',presenca:'Presença',horario:'Horários'};
  const pedidoDe=d=>d.pedido||d.registro?.sistema?.pedido||'';
  const clienteDe=d=>d.cliente||d.registro?.sistema?.cliente||'';
  const ini=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
  const fotos={};
  async function lerFotos(empresa,lista){
    const nums=[...new Set((lista||[]).map(pedidoDe).filter(Boolean).map(String))].filter(n=>!(n in fotos));
    if(!nums.length||!window.supabaseClient)return;
    try{const sb=window.supabaseClient,{data}=await sb.from('separacoes_pedidos').select('numero_pedido,cliente_id').eq('empresa_id',empresa).in('numero_pedido',nums);
      const ids=[...new Set((data||[]).map(x=>x.cliente_id).filter(Boolean))];
      const {data:cl}=ids.length?await sb.from('clientes_empresas').select('id,catalogo_logo_url').in('id',ids):{data:[]};
      const f=Object.fromEntries((cl||[]).map(x=>[x.id,x.catalogo_logo_url]));
      nums.forEach(n=>{fotos[n]=null;});(data||[]).forEach(x=>{fotos[String(x.numero_pedido)]=f[x.cliente_id]||null;});
    }catch(_){}
  }
  function explicar(d){
    const qd=(d.data?dia(d.data):'')+(d.hora?' às '+String(d.hora).slice(0,5):'');
    const dif=(a,b)=>{const x=Number(b)-Number(a);return (x>0?'+':'')+brl(x);};
    const t=String(d.titulo||'');
    if(d.origem==='frete'){const f=d.registro||{};
      if(f.divergencia==='sem_frete')return 'O freteiro lançou um frete de '+brl(d.valor_informado)+' que não existe no sistema.';
      if(f.divergencia==='nao_lancado')return 'O frete foi feito pelo sistema ('+brl(d.valor_previsto)+') e o freteiro não lançou no relatório.';
      if(d.valor_previsto!=null&&d.valor_informado!=null)return 'Combinado '+brl(d.valor_previsto)+', o freteiro cobrou '+brl(d.valor_informado)+' ('+dif(d.valor_previsto,d.valor_informado)+').';
      return t;}
    if(/ajuste/i.test(t))return 'Diária de '+brl(d.valor_previsto)+' com ajuste de '+brl(d.ajuste)+': a pagar '+brl(d.valor_informado)+'.';
    if(/pago diferente/i.test(t))return 'Enviado ao financeiro '+brl(d.valor_enviado)+', mas foi pago '+brl(d.valor_informado)+'.';
    if(d.tipo==='valor')return 'Combinado '+brl(d.valor_previsto)+', conferido '+brl(d.valor_informado)+' ('+dif(d.valor_previsto,d.valor_informado)+').';
    if(/Entrada não/i.test(t))return 'Não fez check-in. Trabalho marcado para '+qd+'.';
    if(/Saída não/i.test(t))return 'Fez check-in às '+hm(d.checkin)+' e não fez check-out até agora.';
    if(/Programação/i.test(t))return 'Aceitou para '+[d.data_ciente?dia(d.data_ciente):'',d.horario_ciente].filter(Boolean).join(' às ')+'; a etapa mudou para '+qd+'.';
    if(d.tipo==='horario')return d.checkin?'Check-out ('+hm(d.checkout)+') antes do check-in ('+hm(d.checkin)+').':'Check-out às '+hm(d.checkout)+' sem check-in.';
    return t;
  }
  function ladosHtml(d,resolvida,aguardando='Aguardando a Logística decidir.'){
    const parceiro=d.origem==='frete'?'freteiro':d.origem==='uber'?'motorista':'free';
    const exp=d.explicacao?'<div class="dvt-lado is-parceiro"><b>Explicação do '+parceiro+'</b>'+(d.explicacao_em?' <span>'+esc(quando(d.explicacao_em))+'</span>':'')+'<p>'+esc(d.explicacao)+'</p></div>'
      :'<div class="dvt-lado is-vazio"><b>Explicação do '+parceiro+'</b><p>Ainda não explicou no app.</p></div>';
    const dec=resolvida?'<div class="dvt-lado is-supervisor"><b>Decisão do supervisor</b>'+(d.tratado_por?' <span>'+esc(d.tratado_por)+(d.tratado_em?' · '+esc(quando(d.tratado_em)):'')+'</span>':'')+'<p>'+esc(d.motivo||'Sem justificativa')+'</p></div>'
      :'<div class="dvt-lado is-vazio"><b>Decisão do supervisor</b><p>'+esc(aguardando)+'</p></div>';
    return '<div class="dvt-lados">'+exp+dec+'</div>';
  }
  /* opcoes: {resolvidas, acoes:d=>html (só a Logística)} */
  function html(lista,opcoes){
    const o=opcoes||{},grupos=new Map();
    for(const d of lista){const interna=d.registro?.avulso_id||(d.solicitacao_interna&&d.solicitacao_id);const k=String(pedidoDe(d)||(interna?'interna:'+interna:'sem'));if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(d);}
    return [...grupos.entries()].map(([k,ds])=>{
      const d0=ds[0],interna=!!d0.registro?.avulso_id||!!d0.solicitacao_interna,cont={};ds.forEach(d=>cont[d.origem]=(cont[d.origem]||0)+1);
      const resumo=Object.entries(cont).map(([or,n])=>'<span class="pla-chip is-pend">'+esc(SERV[or]||or)+' · '+n+'</span>').join('');
      const foto=fotos[k]?'<img class="pla-foto is-cliente" src="'+esc(fotos[k])+'" alt="" loading="lazy">':'<span class="pla-foto pla-ini is-cliente">'+esc(ini(clienteDe(d0)))+'</span>';
      const cab='<header class="pla-cab">'+(interna?'<span class="pla-pedido is-sem">Solicitação interna</span>':k!=='sem'?'<span class="pla-pedido">'+esc(k)+'</span>':'<span class="pla-pedido is-sem">Sem pedido</span>')+(interna?'':foto)+
        '<div class="pla-cli"><strong>'+esc(clienteDe(d0)||(interna?d0.solicitacao_motivo||d0.registro?.avulso?.motivo||'Solicitação interna':'Sem cliente'))+'</strong><small>'+esc(d0.local||'')+'</small></div>'+resumo+
        '<span class="pla-total">'+ds.length+' divergência'+(ds.length===1?'':'s')+'</span></header>';
      const linhas=ds.slice().sort((a,b)=>String(a.origem).localeCompare(String(b.origem))||String(a.data||'').localeCompare(String(b.data||''))).map(d=>{
        const valor=d.tipo==='valor'||d.origem==='frete',res=o.resolvidas||d.resolvida;
        const ult=o.acoes?o.acoes(d):(res?'<span class="pla-tag is-verde">Decidida</span>':'<span class="pla-tag is-amarelo">Aguardando decisão</span>'+(d.explicacao?'':'<small>e explicação do parceiro</small>'));
        return '<tr><td><span class="pla-tag dvt-serv-'+esc(d.origem)+'">'+esc(SERV[d.origem]||d.origem)+'</span><small>'+esc(TIPOS[d.tipo]||d.tipo||'')+'</small></td>'+
          '<td><div class="pla-pessoa"><span class="pla-foto pla-ini">'+esc(ini(d.nome))+'</span><div><strong>'+esc(d.nome||'—')+'</strong><small>'+esc(dia(d.data)+(d.hora?' · '+String(d.hora).slice(0,5):''))+'</small></div></div></td>'+
          '<td><strong class="dvt-titulo">'+esc(d.titulo||'')+'</strong><small class="dvt-expl">'+esc(explicar(d))+'</small>'+ladosHtml(d,res)+'</td>'+
          '<td class="pla-num">'+(valor?brl(d.valor_previsto):'<span class="pla-traco">—</span>')+'</td>'+
          '<td class="pla-num">'+(valor?'<b>'+brl(d.valor_informado)+'</b>':'<span class="pla-traco">—</span>')+'</td>'+
          '<td>'+ult+'</td></tr>';
      }).join('');
      return '<section class="pla-grupo">'+cab+'<div class="pla-tabela-caixa"><table class="pla-tabela dvt-tabela"><colgroup><col style="width:11%"><col style="width:16%"><col style="width:43%"><col style="width:9%"><col style="width:9%"><col style="width:12%"></colgroup><thead><tr><th>Serviço</th><th>Pessoa</th><th>Divergência</th><th class="pla-num">Combinado</th><th class="pla-num">Registrado</th><th>'+(o.acoes?(o.resolvidas?'Tratamento':'Ação'):'Situação')+'</th></tr></thead><tbody>'+linhas+'</tbody></table></div></section>';
    }).join('');
  }
  window.DivergenciasTabela={html,lerFotos,explicar,ladosHtml,pedidoDe,clienteDe,fotoPedido:pedido=>fotos[String(pedido)]||null,SERV};
})();
