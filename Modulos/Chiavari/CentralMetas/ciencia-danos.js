/* Confirmação de ciência usando exclusivamente o PIN individual do RH. */
(function(){
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const servidor = (fn,...args) => new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args));
  window.danoCienciaHtml = function(id,c){
    if(!c || c.status==='legado') return '<span class="ciencia-legado">Registro anterior</span>';
    if(c.status==='confirmado') return '<span class="ciencia-confirmada">Ciência confirmada</span><small>'+esc(c.nome || '')+(c.em ? ' · '+esc(new Date(c.em).toLocaleString('pt-BR')) : '')+'</small>';
    if(c.status==='contestado') return '<span class="ciencia-contestada">Atribuição contestada</span><small>'+esc(c.justificativa || '')+'</small>'+(c.podeRevisar?'<button type="button" data-ciencia-revisar="'+esc(id)+'">Revisar atribuição</button>':'');
    return '<span class="ciencia-pendente">Pendente de ciência</span><button type="button" class="btn-toolbar btn-toolbar-contorno" data-ciencia-id="'+esc(id)+'" data-ciencia-equipe="'+esc(c.equipe)+'" data-ciencia-assinatura="'+esc(c.assinatura)+'">Conferir dano</button>';
  };
  document.addEventListener('click',async function(ev){
    const b=ev.target.closest('[data-ciencia-id],[data-ciencia-revisar]');
    if(!b) return;
    let dialog=document.getElementById('dialogCienciaDano');
    if(dialog?.open) return;
    if(!dialog){dialog=document.createElement('dialog');dialog.id='dialogCienciaDano';dialog.className='ciencia-dialog';document.body.appendChild(dialog);}
    dialog.innerHTML='<p>Carregando funcionários da equipe...</p><button type="button" data-fechar>Fechar</button>';
    dialog.querySelector('[data-fechar]').onclick=()=>dialog.close();dialog.showModal();
    try{
      if(b.dataset.cienciaRevisar){
        dialog.innerHTML='<form><h2>Revisar atribuição do dano</h2><p>A equipe indicada precisará confirmar a ciência novamente.</p><label>Equipe correta<select name="equipe"><option value="triagem">Triagem</option><option value="carregamento">Carregamento</option><option value="montagem">Montagem</option><option value="producao">Produção</option></select></label><label>Justificativa<textarea name="justificativa" required minlength="5" maxlength="1000"></textarea></label><p class="ciencia-erro" role="status"></p><div class="ciencia-acoes"><button type="button" data-fechar>Cancelar</button><button type="submit">Reabrir ciência</button></div></form>';
        const form=dialog.querySelector('form');form.querySelector('[data-fechar]').onclick=()=>dialog.close();
        form.onsubmit=async function(e){e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
          try{const r=await servidor('danoCienciaRevisar',b.dataset.cienciaRevisar,form.elements.equipe.value,form.elements.justificativa.value);if(!r?.ok)throw new Error(r?.msg || 'Não foi possível revisar.');dialog.close();if(window.carregarOperacao)window.carregarOperacao();if(window.carregar)window.carregar(true);}
          catch(err){form.querySelector('.ciencia-erro').textContent=err.message;submit.disabled=false;}
        };return;
      }
      const pessoas=await servidor('danoCienciaFuncionarios',b.dataset.cienciaEquipe);
      if(!dialog.open)return;
      const row=b.closest('tr');
      const dados=row ? [...row.cells].slice(0,8).map(c=>c.innerText.trim()).join(' · ') : '';
      dialog.innerHTML='<form><h2>Ciência do dano</h2><p class="ciencia-resumo">'+esc(dados)+'</p><p>Confira o dano atribuído à sua equipe. A confirmação libera o desconto no bônus da equipe.</p>'+
       '<label>Funcionário responsável pela ciência<select name="funcionario" required><option value="">Selecione seu nome</option>'+pessoas.map(f=>'<option value="'+esc(f.id)+'" '+(!f.temPin?'disabled':'')+'>'+esc(f.nome)+(!f.temPin?' — cadastrar PIN no RH':'')+'</option>').join('')+'</select></label>'+
       '<label>Seu PIN individual<input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required autocomplete="off"></label>'+
       '<label>Resposta<select name="acao"><option value="confirmar">Confirmar ciência</option><option value="contestar">Contestar atribuição</option></select></label>'+
       '<label hidden data-justificativa>Justificativa<textarea name="justificativa" maxlength="1000"></textarea></label>'+
       '<p class="ciencia-erro" role="status"></p><div class="ciencia-acoes"><button type="button" data-fechar>Cancelar</button><button type="submit">Registrar resposta</button></div></form>';
      const form=dialog.querySelector('form');
      form.elements.acao.onchange=()=>{const contestar=form.elements.acao.value==='contestar';form.querySelector('[data-justificativa]').hidden=!contestar;form.elements.justificativa.required=contestar;form.elements.justificativa.minLength=contestar?5:0;};
      form.querySelector('[data-fechar]').onclick=()=>dialog.close();
      form.onsubmit=async function(e){e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
       try{const r=await servidor('danoCienciaResponder',b.dataset.cienciaId,form.elements.funcionario.value,form.elements.pin.value,form.elements.acao.value,form.elements.justificativa.value,b.dataset.cienciaAssinatura);
        form.elements.pin.value='';if(!r?.ok)throw new Error(r?.msg || 'Não foi possível registrar a ciência.');dialog.close();
        if(typeof window.carregarOperacao==='function')window.carregarOperacao();
        if(typeof window.carregar==='function')window.carregar(true);
       }catch(err){form.querySelector('.ciencia-erro').textContent=err.message;submit.disabled=false;}
      };
      form.elements.funcionario.focus();
    }catch(err){dialog.innerHTML='<p>'+esc(err.message)+'</p><button type="button" data-fechar>Fechar</button>';dialog.querySelector('[data-fechar]').onclick=()=>dialog.close();}
  });
})();
