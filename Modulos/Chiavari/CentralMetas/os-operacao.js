(function(){'use strict';
 let ultimas=[];
 async function carregar(){const c=await window.aguardarContexto();const {data,error}=await window.supabaseClient.rpc('acervo_ordens',{p_empresa:c.empresa_id});if(error)throw error;ultimas=data||[];return ultimas;}
 function data(v){return v?new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';}
 function mapear(o){const texto=String(o.item||''),comp=String(o.descricao_complementar||'').trim();return {id:o.id,data:data(o.data),dataOrdem:o.data||'',horaEnvio:o.data?new Date(o.data).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):'',nome:o.solicitante||o.responsavel||'Equipe',solicitante_foto:o.solicitante_foto||'',os:o.numero,item:(comp?texto.replace(comp,''):texto).replace(/\s+/g,' ').trim(),foto_url:o.foto_url||'',qtd:o.quantidade,fluxo:o.fluxo||[o.setor],onde:o.onde,pedido:o.pedido,detalhes:o.motivo,dataU:o.prazo,dataConclusao:data(o.data_conclusao),coluna7:o.fluxo?.[0]||o.setor,coluna8:o.fluxo?.[1],coluna9:o.fluxo?.[2],coluna10:o.fluxo?.[3],ciencia:{status:'legado'},fonte:o.fonte};}
 window.OSOperacao={async indicadores(){return {nativo:true,ordens:(await carregar()).filter(o=>o.fonte==='sistema')};},renderIndicadores(ordens){
  const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),setores=['Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados'];
  document.getElementById('gradeSetores').innerHTML=setores.map(setor=>{const lista=ordens.filter(o=>o.setor===setor),abertas=lista.filter(o=>!o.concluida),atrasadas=abertas.filter(o=>o.prazo&&o.prazo<hoje);return '<div class="setor-card" style="'+varsSetor(setor)+'"><div class="setor-card-titulo">'+escapar(setor)+'</div><div class="setor-metricas"><div class="metrica"><span class="metrica-rotulo">Em aberto</span><strong>'+abertas.length+'</strong></div><div class="metrica"><span class="metrica-rotulo">Concluídas</span><strong>'+lista.filter(o=>o.concluida).length+'</strong></div><div class="metrica"><span class="metrica-rotulo">Prazo vencido</span><strong>'+atrasadas.length+'</strong></div></div></div>';}).join('');
  document.getElementById('gradeTeto').innerHTML='<p>Peças em serviço: '+ordens.filter(o=>!o.concluida).reduce((n,o)=>n+Number(o.quantidade),0)+'</p>';
  document.getElementById('gradeRH').innerHTML=ordens.filter(o=>!o.concluida).map(o=>'<p>O.S #'+escapar(o.numero)+' · '+escapar(o.responsavel||'Responsável não definido')+' · '+escapar(o.setor)+'</p>').join('')||'<p>Nenhuma O.S em aberto.</p>';
 },async abertas(){const lista=(await carregar()).filter(o=>o.fonte==='sistema'&&!o.concluida).map(mapear);return {sucesso:true,lista,atualizadoEm:new Date().toLocaleTimeString('pt-BR')};},async concluidas(p={}){
  const todas=(await carregar()).filter(o=>o.concluida),setores=[...new Set(todas.map(o=>o.setor))].sort();
  const termo=String(p.busca||'').toLocaleLowerCase('pt-BR'),filtradas=todas.filter(o=>(!p.setor||o.setor===p.setor||o.fluxo?.includes(p.setor))&&(!termo||[o.numero,o.item,o.pedido].join(' ').toLocaleLowerCase('pt-BR').includes(termo)));
  const limite=20,totalPaginas=Math.max(1,Math.ceil(filtradas.length/limite)),pagina=Math.max(1,Math.min(Number(p.pagina)||1,totalPaginas));return {sucesso:true,dados:filtradas.slice((pagina-1)*limite,pagina*limite).map(mapear),setores,total:filtradas.length,pagina,totalPaginas};
 }};

 // 16/11/2026: o próprio setor conclui (ou passa para outro setor) a O.S aqui. Concluída, a peça vai para o
 // Controle de qualidade da Triagem (aprovar ou reprovar). Clicar numa O.S em aberto abre esta janela.
 const SETORES=['Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados'];
 function abrirAcao(o){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dlg=document.createElement('dialog');dlg.className='os-acao-dlg';
  dlg.innerHTML='<form><header><h3>O.S '+esc(o.numero)+' · '+esc(o.setor)+'</h3><button type="button" data-x aria-label="Fechar">×</button></header>'+
   '<p class="os-acao-item">'+esc(String(o.item||'').replace(/\s*\((?:L|A|P)\).*$/,''))+' · '+esc(o.quantidade)+' un.'+(o.pedido?' · Pedido '+esc(o.pedido):'')+'</p>'+(o.motivo?'<p class="os-acao-dano">Dano: '+esc(o.motivo)+'</p>':'')+
   '<div class="os-acao-escolha" role="radiogroup"><label><input type="radio" name="acao" value="concluir" checked> Serviço concluído</label><label><input type="radio" name="acao" value="encaminhar"> Passar para outro setor</label></div>'+
   '<label class="os-acao-setor" hidden>Setor<select name="setor">'+SETORES.filter(s=>s!==o.setor).map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></label>'+
   '<label>O que foi feito?<textarea name="motivo" required minlength="5" maxlength="1000" placeholder="Ex.: pé colado e lixado"></textarea></label>'+
   '<p class="os-acao-ajuda">Concluída, a peça vai para o Controle de qualidade da Triagem, que aprova ou devolve.</p>'+
   '<div class="os-acao-botoes"><button type="button" class="btn btn-contorno" data-x>Cancelar</button><button type="submit" class="btn">Salvar</button></div></form>';
  document.body.append(dlg);const f=dlg.querySelector('form');
  f.querySelectorAll('[name=acao]').forEach(r=>r.onchange=()=>{dlg.querySelector('.os-acao-setor').hidden=f.acao.value!=='encaminhar';f.motivo.placeholder=f.acao.value==='encaminhar'?'Ex.: estrutura soldada, falta pintar':'Ex.: pé colado e lixado';});
  dlg.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>dlg.close());dlg.addEventListener('close',()=>dlg.remove());
  f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;
   try{const c=await window.aguardarContexto();const {error}=await window.supabaseClient.rpc('acervo_os_atualizar',{p_empresa:c.empresa_id,p_os:o.id,p_versao:o.versao,p_acao:f.acao.value,p_setor:f.acao.value==='encaminhar'?f.setor.value:null,p_prazo:null,p_responsavel:null,p_motivo:f.motivo.value.trim()});
    if(error)throw error;dlg.close();(window.alerta||alert)(f.acao.value==='concluir'?'Serviço concluído. A peça foi para o Controle de qualidade da Triagem.':'O.S passada para '+f.setor.value+'.','O.S','sucesso');
    if(typeof window.carregar==="function")window.carregar(true);else location.reload();
   }catch(err){b.disabled=false;(window.alerta||alert)(err.message,'O.S','erro');}};
  dlg.showModal();
 }
 document.addEventListener('click',e=>{const tr=e.target.closest('#tabela tr[data-id]');if(!tr||e.target.closest('a,input,label'))return;const o=ultimas.find(x=>x.id===tr.dataset.id&&x.fonte==='sistema'&&!x.concluida);if(!o)return;e.preventDefault();e.stopImmediatePropagation();abrirAcao(o);},true);
 const st=document.createElement('style');st.textContent='#tabela tr[data-id]{cursor:pointer}.os-acao-dlg{border:0;border-radius:16px;padding:0;width:min(520px,94vw);box-shadow:0 20px 60px rgba(15,23,42,.25)}.os-acao-dlg::backdrop{background:rgba(15,23,42,.45)}.os-acao-dlg form{padding:18px 20px;display:flex;flex-direction:column;gap:10px;font-size:13px}.os-acao-dlg header{display:flex;justify-content:space-between;align-items:center}.os-acao-dlg h3{margin:0;font-size:17px}.os-acao-dlg [data-x]:not(.btn){background:none;border:0;font-size:22px;cursor:pointer}.os-acao-dlg p{margin:0}.os-acao-item{color:#4f4f4f}.os-acao-dano{color:#8a4b00}.os-acao-escolha{display:flex;gap:16px}.os-acao-escolha label{display:flex;gap:6px;align-items:center;font-weight:500}.os-acao-dlg label{display:flex;flex-direction:column;gap:5px;font-weight:600}.os-acao-dlg textarea,.os-acao-dlg select{border:1px solid #dfe4ea;border-radius:10px;padding:8px 10px;font:inherit;font-weight:400}.os-acao-dlg textarea{min-height:70px}.os-acao-ajuda{color:#6b6b6b;font-size:12px}.os-acao-botoes{display:flex;justify-content:flex-end;gap:8px}.os-acao-dlg [hidden]{display:none!important}.os-acao-dlg .os-acao-escolha label{flex-direction:row!important;font-weight:500}';document.head.append(st);
})();
