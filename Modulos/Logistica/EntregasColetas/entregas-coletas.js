(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const s = {sb:null,empresa:null,nome:"",etapa:params.get('etapa')==='coleta'?'coleta':'entrega',pedidos:[],confirmacoes:[],id:null,base:null,sujo:false,salvando:false,sequencia:0,fotos:new Map(),responsaveis:[],motivos:[],dia:null,iniciado:false,filtro:"entrega",offline:false,evidencias:[],novas:[]};
  const dataBr = v => v ? new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data';
  const horaBr = v => new Date(v).toLocaleString('pt-BR');
  const titulo = () => s.etapa==='entrega'?'Entrega':'Coleta';
  function mensagem(texto,ok=false){$('ecMensagem').hidden=!texto;$('ecMensagem').classList.toggle('is-ok',ok);$('ecMensagem').textContent=texto;}
  async function rpc(nome,args){const ler=async()=>{const {data,error}=await s.sb.rpc(nome,args);if(error)throw new Error(error.message);return data;};return s.offline&&!/salvar|enviar/.test(nome)?window.OperacaoOffline.leitura('rpc:'+nome+JSON.stringify(args),ler):ler();}
  function fotoItem(p,impressao=false){
    const id=String(p.item_id||p.chave?.split('|')[1]||''),url=s.fotos.get(id)||'';
    return '<span class="ec-item-foto" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>'+(/^https?:\/\//i.test(url)?'<img src="'+esc(url)+'" alt="" loading="'+(impressao?'eager':'lazy')+'">':'')+'</span>';
  }
  async function carregarFotos(b){
    const fotos=new Map(),lista=[...b.itens,...b.historico.flatMap(h=>h.itens||[])];
    const ids=[...new Set(lista.map(p=>p.item_id||p.chave?.split('|')[1]).filter(Boolean))];
    for(let i=0;i<ids.length;i+=100){
      const {data,error}=await s.sb.from('itens').select('id,foto_url').eq('empresa_id',s.empresa).in('id',ids.slice(i,i+100));
      if(error){console.warn('N?o foi poss?vel carregar as fotos dos itens.',error.message);continue;}
      (data||[]).forEach(p=>fotos.set(String(p.id),p.foto_url||''));
    }
    return fotos;
  }
  const sair = () => !s.sujo || window.confirm('Há alterações sem confirmar. Deseja sair desta lista?');
  const pertence=(p,etapa)=>!p.somente_consulta&&p.fluxo_etapa===etapa;
  function pedidos(){
    const termo=$('ecBusca').value.trim().toLocaleLowerCase('pt-BR'),dia=s.dia||window.PainelLogisticoDias?.data;
    for(const etapa of ['entrega','coleta']){
      const aba=document.getElementById(etapa==='entrega'?'plTabEntrega':'plTabColeta');
      const indicador=aba?.querySelector('.pl-alerta-aba');
      const total=s.pedidos.filter(p=>pertence(p,etapa)).length;
      if(indicador){indicador.hidden=total===0;indicador.textContent=String(total);aba.title=total+' '+(etapa==='entrega'?'entrega(s)':'coleta(s)')+' no total';}
    }
    const lista=s.pedidos.filter(p=>pertence(p,s.filtro)).flatMap(p=>[s.filtro].map(etapa=>({p,etapa,data:String((etapa==='entrega'?p.data_entrega:p.data_coleta)||'').slice(0,10)})))
      .filter(({p,data})=>(!termo||[p.numero_pedido,p.cliente_nome,p.local_nome].join(' ').toLocaleLowerCase('pt-BR').includes(termo))&&(!dia||data===dia));
    lista.sort((a,b)=>String(a.data||'9999').localeCompare(String(b.data||'9999'))||String(a.p.numero_pedido).localeCompare(String(b.p.numero_pedido),'pt-BR',{numeric:true})||(a.etapa==='entrega'?-1:1));
    $('ecPedidos').innerHTML=lista.map(({p,etapa,data})=>{const c=s.confirmacoes.find(c=>c.pedido_id===p.id&&c.etapa===etapa),selecionado=p.id===s.id&&etapa===s.etapa;
      return '<button type="button" class="ec-pedido ec-pedido-'+etapa+'" data-pedido="'+esc(p.id)+'" data-operacao="'+etapa+'" aria-pressed="'+selecionado+'"><span class="ec-pedido-topo"><span class="ec-pedido-tipo">'+(etapa==='entrega'?'Entrega':'Coleta')+'</span><b class="ec-pedido-numero">Pedido #'+esc(String(p.numero_pedido||'-').replace(/^#/,''))+'</b></span><strong>'+esc(p.cliente_nome||'Cliente')+'</strong><small>'+esc(p.local_nome||'Local não informado')+' · '+dataBr(data)+'</small><span class="ec-selo">'+(p.somente_consulta?'Pré-reserva · somente consulta':c?'✓ Confirmado · versão '+c.versao:'Aguardando confirmação')+'</span></button>';
    }).join('')||'<p class="ec-vazio">Nenhuma entrega ou coleta encontrada.</p>';
  }
  async function carregar(){
    mensagem('');
    try{
      const buscar=async()=>{
        const todos=await window.PedidoFluxo.fila(s.sb,s.empresa,'entregas_coletas');
      const confirmacoes=[];
      for(let i=0;i<todos.length;i+=100){for(let de=0;;de+=500){const {data,error}=await s.sb.from('logistica_confirmacoes').select('pedido_id,etapa,versao').eq('empresa_id',s.empresa).in('pedido_id',todos.slice(i,i+100).map(p=>p.id)).order('versao',{ascending:false}).order('id').range(de,de+499);if(error)throw error;confirmacoes.push(...data);if(data.length<500)break;}}
        return {todos,confirmacoes};};
      const {todos,confirmacoes}=s.offline?await window.OperacaoOffline.leitura('ec:filas',buscar):await buscar();
      s.pedidos=todos;s.confirmacoes=confirmacoes;window.PainelLogisticoDias?.atualizarOperacoes(todos);pedidos();if(s.id&&todos.some(p=>p.id===s.id&&pertence(p,s.etapa)))await abrir(s.id);else if(s.id){s.id=null;s.base=null;$('ecDetalhe').innerHTML='<p class="ec-vazio">Selecione um pedido da etapa atual.</p>';}
    }catch(e){mensagem('Não foi possível carregar: '+e.message);}
    finally{window.finalizarCarregamentoModulo?.();}
  }
  async function abrir(id,etapa=s.etapa){
    const seq=++s.sequencia;s.etapa=etapa;s.id=id;s.base=null;s.sujo=false;s.novas=[];pedidos();$('ecDetalhe').innerHTML='<p class="ec-vazio">Carregando lista…</p>';mensagem('');
    try{const b=await rpc('logistica_confirmacao_base',{p_pedido:id,p_etapa:s.etapa});if(seq!==s.sequencia)return;
      const buscarExtras=async()=>{const [fotos,responsaveis,motivos,evidencias]=await Promise.all([carregarFotos(b),rpc('logistica_confirmacao_responsaveis',{p_pedido:id,p_etapa:s.etapa}),s.sb.from('logistica_motivos').select('id,etapa,nome').eq('empresa_id',s.empresa).eq('ativo',true).order('nome'),window.EvidenciasOperacao?window.EvidenciasOperacao.carregar(s.sb,s.empresa,id):[]]);if(motivos.error)throw Error(motivos.error.message);return {fotos:[...fotos],responsaveis,motivos:motivos.data||[],evidencias};};
      const extras=s.offline?await window.OperacaoOffline.leitura('ec:extras:'+id+':'+s.etapa,buscarExtras):await buscarExtras();if(seq!==s.sequencia)return;s.motivos=extras.motivos;s.fotos=new Map(extras.fotos);s.responsaveis=extras.responsaveis||[];s.evidencias=extras.evidencias||[];s.base=b;detalhe();}
    catch(e){if(seq!==s.sequencia)return;$('ecDetalhe').innerHTML='<p class="ec-vazio">Não foi possível abrir a lista. Selecione o pedido novamente para tentar.</p>';mensagem(e.message);}
  }
  function seletorMotivo(p,i){
    const opcoes=s.motivos.filter(m=>m.etapa===s.etapa),selecionado=opcoes.some(m=>m.id===p.motivo_id)?p.motivo_id:'';
    const antigo=!selecionado&&p.observacao?'Registro anterior: '+p.observacao:opcoes.length?'Selecione um motivo':'Cadastre motivos em Parâmetros';
    return '<select name="motivo" data-i="'+i+'" aria-label="Motivo · '+esc(p.nome)+'"><option value="">'+esc(antigo)+'</option>'+opcoes.map(m=>'<option value="'+esc(m.id)+'" '+(m.id===selecionado?'selected':'')+'>'+esc(m.nome)+'</option>').join('')+'</select>';
  }
  function tabela(itens,editavel=true){
    const entrega=s.etapa==='entrega';
    return `<div class="ec-tabela-wrap"><table class="ec-tabela"><thead><tr><th>Item</th><th>${entrega?'Previsto':'No evento'}</th><th>${entrega?'Entregue':'Encontrado no local'}</th><th>${entrega?'Voltou antes':'Com avaria'}</th><th>${entrega?'Não entregue':'Não encontrado'}</th><th>Motivo</th></tr></thead><tbody>${itens.map((p,i)=>{
      const valor=campo=>p[campo]??(!entrega&&Number(p.previsto)===0?0:campo===(entrega?'entregue':'coletado')?'':0);
      const input=campo=>editavel?`<input type="number" min="0" step="1" max="${p.previsto}" name="${campo}" data-i="${i}" ${!entrega&&Number(p.previsto)===0?'readonly':''} value="${esc(valor(campo))}" aria-label="${esc(({entregue:'Entregue',coletado:'Encontrado no local',voltou_antes:'Voltou antes',danificado:'Com avaria'})[campo]+' · '+p.nome)}" required>`:esc(valor(campo));
      return `<tr class="${!entrega&&Number(p.previsto)===0?'ec-item-deposito':''}"><td><div class="ec-item-identidade">${fotoItem(p)}<div><strong>${esc(p.nome)}</strong>${p.pedido_numero&&s.base?.pedido?.extras?.length?`<small class="ec-item-pedido">Pedido ${esc(p.pedido_numero)}</small>`:''}${editavel&&window.EvidenciasOperacao?`<label class="ec-anexar">Anexar foto<input type="file" accept="image/*" capture="environment" data-evidencia="${i}" aria-label="Foto de ${esc(p.nome)}"></label><div class="ec-evidencias" data-galeria="${i}"></div>`:''}${entrega&&p.carregado!=null?`<small>Carregado: ${esc(p.carregado)}</small>`:''}${p.fora_lista?'<small>Item fora da lista atual · mantido no histórico</small>':''}${!entrega?(p.previa?'<small>Previsto no pedido · entrega ainda não confirmada</small>':`<small>Entregue: ${p.entregue} · já voltou: ${p.voltou_antes}</small>${Number(p.ja_no_deposito)>0?`<small class="ec-deposito-nota">Já no depósito: ${p.ja_no_deposito}${Number(p.nao_entregue_deposito)>0?' · inclui '+p.nao_entregue_deposito+' não entregue(s)':''}</small>`:''}`):''}</div></div></td><td class="ec-num">${p.previsto}</td><td>${input(entrega?'entregue':'coletado')}</td><td>${input(entrega?'voltou_antes':'danificado')}</td><td class="ec-num" data-falta="${i}">${p[entrega?'nao_entregue':'nao_coletado']??'—'}</td><td>${editavel?seletorMotivo(p,i):esc(p.observacao||'—')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function responsaveisCabecalho(){
    if(!s.responsaveis.length)return '<div class="ec-responsaveis"><div class="ec-responsavel"><span class="ec-responsavel-foto" aria-hidden="true">—</span><span>Sem responsável no cronograma</span></div></div>';
    return '<div class="ec-responsaveis">'+s.responsaveis.map(r=>{
      let url=r.foto_url||'';
      if(!url&&r.funcionario_id&&s.sb.storage)url=s.sb.storage.from('avatares').getPublicUrl(s.empresa+'/'+r.funcionario_id+'.jpg').data.publicUrl;
      const iniciais=String(r.nome||'').trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');
      return '<div class="ec-responsavel"><span class="ec-responsavel-foto">'+esc(iniciais)+(/^https?:\/\//i.test(url)?'<img src="'+esc(url)+'" alt="" loading="lazy">':'')+'</span><div><small>Responsável · '+esc(r.etapa)+'</small><strong>'+esc(r.nome)+'</strong></div></div>';
    }).join('')+'</div>';
  }
  function detalhe(){
    const b=s.base,p=b.pedido,entrega=s.etapa==='entrega',atual=b.atual;
    if(b.somente_consulta)mensagem(b.bloqueio);
    const itens=b.itens.map(p=>({...p,...(atual?.itens.find(x=>x.chave===p.chave)||{}),previsto:p.previsto}));
    $('ecDetalhe').innerHTML=`<header class="ec-cab"><div class="ec-pedido-identificacao"><small>${titulo().toUpperCase()} · ${dataBr(entrega?p.data_entrega:p.data_coleta)}</small><h2>Pedido #${esc(p.numero_pedido)}${p.extras?.length?` <small class="ec-extras">+ ${esc(p.extras.join(', '))}</small>`:''}</h2><p>${esc(p.cliente_nome)} · ${esc(p.local_nome||'Local não informado')}</p></div>${responsaveisCabecalho()}<button type="button" id="ecImprimir">Imprimir lista de ${titulo().toLowerCase()}</button></header><div class="ec-conteudo">${atual?`<p class="ec-nota">Confirmado em ${horaBr(atual.criado_em)} · ${esc(atual.responsavel)} · versão ${atual.versao}. Uma nova confirmação preserva a versão anterior.</p>`:''}<form id="ecForm"><fieldset ${b.bloqueio?'disabled':''} style="border:0;padding:0;margin:0;min-width:0">${itens.length?tabela(itens):'<p class="ec-vazio">Nenhum item disponível. Na coleta, confirme a entrega primeiro.</p>'}<div class="ec-acoes"><button type="submit" class="ec-primario" ${!itens.length||b.previa?'disabled':''}>${b.previa?'Prévia da coleta':atual?'Salvar nova confirmação':'Confirmar '+titulo().toLowerCase()}</button></div></fieldset></form><details class="ec-historico"><summary>Histórico de confirmações (${b.historico.length})</summary>${b.historico.map(h=>`<details class="ec-versao"><summary>Versão ${h.versao} · ${horaBr(h.criado_em)} · ${esc(h.responsavel)}</summary>${tabela(h.itens,false)}<p>${esc(h.observacao)}</p></details>`).join('')||'<p class="ec-vazio">Nenhuma confirmação registrada.</p>'}</details></div>`;
    $('ecImprimir').onclick=imprimir;
    $('ecForm').querySelectorAll('[data-evidencia]').forEach(el=>el.onchange=async()=>{const i=Number(el.dataset.evidencia),seq=s.sequencia;try{if(!el.files[0])return;if(s.novas.filter(e=>e.chave===s.base.itens[i].chave).length>=8)throw Error('Limite de oito fotos por item neste registro');const foto=await window.EvidenciasOperacao.preparar(el.files[0],s.base.itens[i].chave);if(seq!==s.sequencia)return;s.novas.push(foto);s.sujo=true;galerias();}catch(e){mensagem(e.message);}finally{el.value='';}});galerias();
    $('ecForm').oninput=()=>{s.sujo=true;resumo();};$('ecForm').onsubmit=salvar;resumo();
  }
  function galerias(){if(!window.EvidenciasOperacao)return;s.base.itens.forEach((p,i)=>{const host=$('ecForm').querySelector('[data-galeria="'+i+'"]');if(host)window.EvidenciasOperacao.render(host,s.evidencias.filter(e=>e.chave===p.chave),s.novas.filter(e=>e.chave===p.chave),id=>{s.novas=s.novas.filter(e=>e.id!==id);galerias();});});}
  function ler(){return s.base.itens.map((p,i)=>{const anterior=s.base.atual?.itens.find(x=>x.chave===p.chave);const item={chave:p.chave,retirado_lista:Number(anterior?.retirado_lista)||0};for(const campo of [s.etapa==='entrega'?'entregue':'coletado',s.etapa==='entrega'?'voltou_antes':'danificado','motivo']){const el=$('ecForm').querySelector(`[name="${campo}"][data-i="${i}"]`);if(campo==='motivo'){const motivo=s.motivos.find(m=>m.id===el.value&&m.etapa===s.etapa);item.motivo_id=motivo?.id||null;item.observacao=motivo?.nome||'';}else item[campo]=el.value===''?null:Number(el.value);}return item;});}
  function resumo(){
    const entrega=s.etapa==='entrega';
    const valores=ler();
    valores.forEach((v,i)=>{const p=s.base.itens[i],q=v[entrega?'entregue':'coletado'];$('ecForm').querySelector('[data-falta="'+i+'"]').textContent=q==null?'?':p.previsto-q-v.retirado_lista;if(!entrega){const linha=$('ecForm').querySelector('[name=coletado][data-i="'+i+'"]').closest('tr');const preenchido=q!=null&&Number(p.previsto)>0,igual=q===Number(p.previsto);linha.classList.toggle('ec-coleta-completa',preenchido&&igual&&v.danificado===0);linha.classList.toggle('ec-coleta-falta',preenchido&&q<Number(p.previsto));linha.classList.toggle('ec-coleta-avaria',preenchido&&igual&&v.danificado>0); }if(entrega){const campo=$('ecForm').querySelector('[name=entregue][data-i="'+i+'"]');campo.closest('tr').classList.toggle('ec-entregue-igual',q!=null&&q===Number(p.previsto));campo.closest('tr').classList.toggle('ec-entregue-diferente',q!=null&&q!==Number(p.previsto));}});
  }
  async function salvar(ev){
    ev.preventDefault();if(s.salvando||!s.base||s.base.previa)return;if(s.base.bloqueio){mensagem(s.base.bloqueio);return;}
    const itens=ler(),entrega=s.etapa==='entrega';
    for(let i=0;i<itens.length;i++){const v=itens[i],p=s.base.itens[i],q=v[entrega?'entregue':'coletado'],extra=v[entrega?'voltou_antes':'danificado'],r=v.retirado_lista;
      if([q,extra,r].some(n=>n==null||!Number.isInteger(n)||n<0)||q+r>p.previsto||extra>q){mensagem('Revise as quantidades de '+p.nome+'. O total não pode superar o previsto; o retorno antecipado ou dano deve fazer parte do total confirmado.');return;}
      if((q<p.previsto||extra>0||r>0)&&v.observacao.length<3){mensagem('Selecione o motivo da diferença, retorno ou avaria de '+p.nome+'.');$('ecForm').querySelector(`[name="motivo"][data-i="${i}"]`).focus();return;}}
    s.salvando=true;const btn=$('ecForm').querySelector('[type=submit]');btn.disabled=true;
    const responsavel=s.nome,observacao=$('ecForm').elements.geral?.value.trim()??s.base.atual?.observacao??'';
    $('ecForm').querySelector('fieldset').disabled=true;
    try{
      const args={p_pedido:s.id,p_etapa:s.etapa,p_token:s.base.token,p_itens:itens,p_responsavel:responsavel,p_observacao:observacao};let data;
      if(s.offline){const envio=await window.OperacaoOffline.confirmar(args,s.novas);if(envio.pendente){s.sujo=false;s.novas=[];mensagem('Conferência guardada neste dispositivo. Aguarde a sincronização ou revise a pendência indicada acima.',true);return;}data=envio.resposta;}else data=await rpc('logistica_confirmacao_salvar',args);
      s.base=data;s.sujo=false;await carregar();mensagem(titulo()+' confirmada. Registro salvo no histórico.',true);
    }catch(e){mensagem('Não foi possível confirmar: '+e.message);$('ecForm').querySelector('fieldset').disabled=false;btn.disabled=false;}
    finally{s.salvando=false;}
  }
  function imprimir(){
    const b=s.base,p=b.pedido,entrega=s.etapa==='entrega',valores=ler();
    const linhas=b.itens.map((p,i)=>{const v=valores[i],q=v[entrega?'entregue':'coletado'];return `<tr><td><div class="ec-item-identidade">${fotoItem(p,true)}<div>${esc(p.nome)}${p.pedido_numero&&s.base?.pedido?.extras?.length?`<small>Pedido ${esc(p.pedido_numero)}</small>`:''}${!entrega?(p.previa?'<small>Previsto no pedido · entrega ainda não confirmada</small>':`<small>Entregue: ${p.entregue} · já voltou: ${p.voltou_antes}</small>${Number(p.ja_no_deposito)>0?`<small class="ec-deposito-nota">Já no depósito: ${p.ja_no_deposito}${Number(p.nao_entregue_deposito)>0?' · inclui '+p.nao_entregue_deposito+' não entregue(s)':''}</small>`:''}`):''}${p.fora_lista?'<small>Fora da lista atual</small>':''}</div></div></td><td>${p.previsto}</td><td>${q??''}</td><td>${v[entrega?'voltou_antes':'danificado']??''}</td><td>${q==null?'':p.previsto-q-v.retirado_lista}</td><td>${esc(v.observacao)}</td></tr>`;}).join('');
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de ${titulo().toLowerCase()} · Pedido ${esc(p.numero_pedido)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#24364b}h1{font-size:22px}p{line-height:1.5}table{border-collapse:collapse;width:100%}th,td{padding:10px 7px;border:1px solid #cbd5e1;text-align:left}th{font-size:10px}td{height:30px}td:first-child{width:28%}td:last-child{width:25%;white-space:pre-wrap}tr{break-inside:avoid}small{display:block;font-size:10px;color:#667085}.ass{display:flex;gap:35px;margin-top:55px}.ass span{flex:1;border-top:1px solid;padding-top:7px}.obs{white-space:pre-wrap;min-height:45px}thead{display:table-header-group}.ec-item-identidade{display:flex;align-items:center;gap:10px}.ec-item-foto{position:relative;display:inline-block;flex:0 0 42px;width:42px;height:42px;background:#f3f5f7;border-radius:6px;overflow:hidden;color:#94a3b8}.ec-item-foto svg{width:24px;height:24px;margin:9px}.ec-item-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:white}</style></head><body><h1>Lista de ${titulo().toLowerCase()} · Pedido #${esc(p.numero_pedido)}</h1><p>${esc(p.cliente_nome)} · ${esc(p.local_nome)} · ${dataBr(entrega?p.data_entrega:p.data_coleta)}</p><p>${b.previa?'PRÉVIA · entrega não confirmada · sem registro de cobrança':s.sujo?'Rascunho · alterações ainda não confirmadas':b.atual?'Confirmado em '+horaBr(b.atual.criado_em)+' · versão '+b.atual.versao:'Lista para conferência no local · ainda não confirmada'}</p><table><thead><tr><th>Item</th><th>${entrega?'Previsto':'No evento'}</th><th>${entrega?'Entregue':'Encontrado no local'}</th><th>${entrega?'Voltou antes':'Com avaria'}</th><th>${entrega?'Não entregue':'Não encontrado'}</th><th>Motivo</th></tr></thead><tbody>${linhas}</tbody></table><p class="obs">Observações: ${esc($('ecForm').elements.geral?.value||b.atual?.observacao||'')}</p><div class="ass"><span>Responsável: ${esc($('ecForm').elements.responsavel?.value||b.atual?.responsavel||'')}</span><span>Motorista / equipe</span><span>Data e hora</span></div></body></html>`;
    const frame=document.createElement('iframe');frame.title='Lista para impressão';frame.style.cssText='position:fixed;width:0;height:0;border:0';frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),60000);};frame.srcdoc=html;document.body.append(frame);
  }
  async function iniciar(){
    s.sb=window.supabaseClient;let ctx;try{ctx=await window.aguardarContexto?.();}catch(e){if(!navigator.onLine&&window.OperacaoOffline)ctx=await window.OperacaoOffline.contextoLocal(s.sb);else throw e;}s.empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;
    if(window.OperacaoOffline){await window.OperacaoOffline.init(s.sb,ctx);s.offline=true;}
    s.nome=String(ctx?.usuario_nome||window.__CONTEXT?.usuario_nome||'Usu\u00e1rio autenticado').trim().slice(0,150);
    if(!s.sb||!s.empresa){mensagem('Não foi possível identificar a empresa. Entre novamente no sistema.');return;}
    $('ecDetalhe').addEventListener('error',ev=>{if(ev.target.matches('.ec-item-foto img,.ec-responsavel-foto img'))ev.target.remove();},true);
    $('ecBusca').oninput=pedidos;s.dia=window.PainelLogisticoDias?.data||null;s.iniciado=true;
    $('ecPedidos').onclick=e=>{const btn=e.target.closest('[data-pedido]');if(btn&&!s.salvando&&sair())abrir(btn.dataset.pedido,btn.dataset.operacao);};
    window.addEventListener('beforeunload',e=>{if(s.sujo){e.preventDefault();e.returnValue='';}});
    await carregar();if(params.get('pedido'))await abrir(params.get('pedido'));
    const atualizar=()=>{if(!document.hidden&&!s.sujo&&!s.salvando)carregar();};
    document.addEventListener('visibilitychange',atualizar);setInterval(atualizar,30000);
  }
  function definirDia(dia){
    s.dia=dia;if(!s.iniciado)return;
    const p=s.pedidos.find(p=>p.id===s.id),data=p?String((s.etapa==='entrega'?p.data_entrega:p.data_coleta)||'').slice(0,10):null;
    if(s.id&&dia&&data!==dia){++s.sequencia;s.id=null;s.base=null;s.sujo=false;$('ecDetalhe').innerHTML='<div class="ec-inicial"><h2>Selecione um pedido</h2><p>Escolha uma entrega ou coleta deste dia.</p></div>';mensagem('');}
    pedidos();
  }
  function definirOperacao(etapa){
    if(s.filtro===etapa)return;
    s.filtro=etapa;s.etapa=etapa;++s.sequencia;s.id=null;s.base=null;s.sujo=false;
    if(s.iniciado){$('ecDetalhe').innerHTML='<div class="ec-inicial"><h2>Selecione um pedido</h2><p>Escolha uma '+(etapa==='entrega'?'entrega':'coleta')+' deste dia.</p></div>';mensagem('');pedidos();}
  }
  window.EntregasColetas = { revisarPendencia:args=>{if(sair())abrir(args.p_pedido,args.p_etapa);}, iniciar, definirDia, definirOperacao, podeSelecionarOperacao:etapa=>etapa===s.filtro||(!s.salvando&&sair()), podeTrocarDia:()=>!s.salvando&&sair() };
  if (!document.getElementById("plModuloAbas")) iniciar().catch(e=>mensagem(e.message));
})();
