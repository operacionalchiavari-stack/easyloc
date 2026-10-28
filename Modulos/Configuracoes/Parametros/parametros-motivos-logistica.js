(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.carregarMotivosLogistica = async function(host, empresa) {
    const sb=window.supabaseClient,secao=document.createElement('section');
    secao.className='pr-motivos-logistica';
    secao.innerHTML='<h3>Motivos de carregamento, entrega e coleta</h3><p>Opções disponíveis na coluna Motivo dos itens e nas pendências do carregamento. Desative um motivo para deixar de oferecê-lo sem apagar o histórico.</p><form class="pr-motivo-novo"><label>Etapa<select name="etapa"><option value="carregamento">Pendência do carregamento</option><option value="entrega">Entrega</option><option value="coleta">Coleta</option></select></label><label>Nome do motivo<input name="nome" minlength="3" maxlength="120" required placeholder="Ex.: Item não encontrado no local"></label><button type="submit">Cadastrar motivo</button></form><p class="pr-motivos-status" role="status"></p><div class="pr-motivos-lista"></div>';
    host.append(secao);
    const status=secao.querySelector('.pr-motivos-status'),lista=secao.querySelector('.pr-motivos-lista');
    let ocupado=false;
    async function carregar(){
      const {data,error}=await sb.from('logistica_motivos').select('*').eq('empresa_id',empresa).order('etapa').order('nome');if(error)throw error;
      lista.innerHTML=(data||[]).map(m=>'<form data-motivo="'+esc(m.id)+'"><span>'+({carregamento:'Pendência do carregamento',entrega:'Entrega',coleta:'Coleta'}[m.etapa]||m.etapa)+'</span><input name="nome" aria-label="Nome do motivo" minlength="3" maxlength="120" required value="'+esc(m.nome)+'"><label><input name="ativo" type="checkbox" '+(m.ativo?'checked':'')+'> Ativo</label><button type="submit">Salvar motivo</button></form>').join('')||'<p>Nenhum motivo cadastrado.</p>';
    }
    secao.addEventListener('submit',async evento=>{
      evento.preventDefault();if(ocupado)return;ocupado=true;
      const form=evento.target,botao=form.querySelector('button');botao.disabled=true;status.textContent='Salvando motivo…';
      try{
        const dados={nome:form.elements.nome.value.trim()};
        const r=form.dataset.motivo?await sb.from('logistica_motivos').update({...dados,ativo:form.elements.ativo.checked}).eq('empresa_id',empresa).eq('id',form.dataset.motivo).select('id').single():await sb.from('logistica_motivos').insert({...dados,empresa_id:empresa,etapa:form.elements.etapa.value}).select('id').single();
        if(r.error)throw r.error;
        if(!form.dataset.motivo)form.elements.nome.value='';
        await carregar();status.textContent='Motivo salvo.';
      }catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{ocupado=false;botao.disabled=false;}
    });
    try{await carregar();}catch(e){status.textContent='Não foi possível carregar os motivos: '+e.message;}
  };
})();
