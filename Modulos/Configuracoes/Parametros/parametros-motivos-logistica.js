(function () {
  'use strict';
  // Motivos em dois cards (out/2026): pendências (carregamento, entrega, coleta) e divergências da 2ª conferência.
  const SIT = '<option value="bateu">Quando a 2ª conferência bate</option><option value="continua">Quando a diferença continua</option>';
  const NOMES = {carregamento:'Pendência do carregamento',entrega:'Entrega',coleta:'Coleta',divergencia_falta:'Divergência: faltou',divergencia_sobra:'Divergência: veio a mais'};
  const GRUPOS = [
    {titulo:'Motivos das pendências', etapas:['carregamento','entrega','coleta'],
     ajuda:'Opções da coluna Motivo dos itens e das pendências do carregamento, da entrega e da coleta. Desative um motivo para deixar de oferecê-lo sem apagar o histórico.',
     exemplo:'Ex.: Item não encontrado no local'},
    {titulo:'Motivos das divergências', etapas:['divergencia_falta','divergencia_sobra'],
     ajuda:'Usados na 2ª conferência da triagem de volta e do descarregamento (o que faltou ou veio a mais). Cada motivo vale para um resultado: quando a 2ª conferência bate com o esperado (erro de contagem) ou quando a diferença continua.',
     exemplo:'Ex.: Peça extraviada'}
  ];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.carregarMotivosLogistica = async function(host, empresa) {
    const sb=window.supabaseClient;
    const cards=GRUPOS.map(g=>{
      const secao=document.createElement('section');
      secao.className='pr-motivos-logistica';
      secao.dataset.motivos=g.etapas.join(',');
      const divergencia=g.etapas[0].startsWith('divergencia_');
      secao.innerHTML='<h3>'+g.titulo+'</h3><p>'+g.ajuda+'</p><form class="pr-motivo-novo"><label>'+(divergencia?'Tipo':'Etapa')+'<select name="etapa">'+g.etapas.map(e=>'<option value="'+e+'">'+NOMES[e]+'</option>').join('')+'</select></label>'+(divergencia?'<label class="pr-motivo-sit">Quando usar<select name="situacao">'+SIT+'</select></label>':'')+'<label>Nome do motivo<input name="nome" minlength="3" maxlength="120" required placeholder="'+g.exemplo+'"></label><button type="submit">Cadastrar motivo</button></form><p class="pr-motivos-status" role="status"></p><div class="pr-motivos-lista"></div>';
      host.append(secao);
      return {g,secao,lista:secao.querySelector('.pr-motivos-lista'),status:secao.querySelector('.pr-motivos-status')};
    });
    let ocupado=false;
    async function carregar(){
      const {data,error}=await sb.from('logistica_motivos').select('*').eq('empresa_id',empresa).order('etapa').order('nome');if(error)throw error;
      cards.forEach(({g,lista})=>{
        const itens=(data||[]).filter(m=>g.etapas.includes(m.etapa));
        lista.innerHTML=itens.map(m=>'<form data-motivo="'+esc(m.id)+'"><span>'+(NOMES[m.etapa]||m.etapa)+'</span>'+(String(m.etapa).startsWith('divergencia_')?'<select name="situacao" aria-label="Quando usar">'+SIT.replace('value="'+(m.situacao||'continua')+'"','value="'+(m.situacao||'continua')+'" selected')+'</select>':'')+'<input name="nome" aria-label="Nome do motivo" minlength="3" maxlength="120" required value="'+esc(m.nome)+'"><label><input name="ativo" type="checkbox" '+(m.ativo?'checked':'')+'> Ativo</label><button type="submit">Salvar motivo</button></form>').join('')||'<p>Nenhum motivo cadastrado.</p>';
      });
    }
    cards.forEach(({secao,status})=>secao.addEventListener('submit',async evento=>{
      evento.preventDefault();if(ocupado)return;ocupado=true;
      const form=evento.target,botao=form.querySelector('button');botao.disabled=true;status.textContent='Salvando motivo…';
      try{
        const dados={nome:form.elements.nome.value.trim()};
        const etapa=form.dataset.motivo?null:form.elements.etapa.value;
        if(form.elements.situacao&&(form.dataset.motivo||String(etapa).startsWith('divergencia_')))dados.situacao=form.elements.situacao.value;
        const r=form.dataset.motivo?await sb.from('logistica_motivos').update({...dados,ativo:form.elements.ativo.checked}).eq('empresa_id',empresa).eq('id',form.dataset.motivo).select('id').single():await sb.from('logistica_motivos').insert({...dados,empresa_id:empresa,etapa:form.elements.etapa.value}).select('id').single();
        if(r.error)throw r.error;
        if(!form.dataset.motivo)form.elements.nome.value='';
        await carregar();status.textContent='Motivo salvo.';
      }catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{ocupado=false;botao.disabled=false;}
    }));
    try{await carregar();}catch(e){cards[0].status.textContent='Não foi possível carregar os motivos: '+e.message;}
  };
})();
