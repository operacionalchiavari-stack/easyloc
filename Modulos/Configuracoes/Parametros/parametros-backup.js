(function(){'use strict';window.carregarStatusBackups=async function(host,empresa){
 const secao=document.createElement('section');secao.className='pr-card';secao.innerHTML='<h3>Backup e recuperação</h3><p class="pr-ajuda">As cópias são cifradas e verificadas por restauração em um banco isolado.</p><div data-status-backup>Consultando última verificação…</div><p class="pr-ajuda">Backup automático em nuvem às 03:17, com monitoramento de falhas. Preserve a chave de recuperação em local seguro. Os arquivos cifrados ficam retidos por 30 dias.</p>';host.append(secao);
 const {data,error}=await window.supabaseClient.from('sistema_backups').select('*').eq('empresa_id',empresa).order('criado_em',{ascending:false}).limit(1);const el=secao.querySelector('[data-status-backup]');
 if(error){el.textContent='Não foi possível consultar o backup: '+error.message;return;}
 const b=data?.[0];if(!b){el.textContent='Nenhuma execução de backup registrada ainda.';return;}
 const antigo=Date.now()-new Date(b.criado_em).getTime()>36*3600000;
 el.textContent=new Date(b.criado_em).toLocaleString('pt-BR')+' · '+(b.verificado?'Restauração e arquivos verificados':'Execução com pendências')+' · '+b.tabelas+' tabelas · '+b.registros+' registros · '+b.arquivos+' arquivos'+(b.arquivos_pendentes?' · '+b.arquivos_pendentes+' arquivos pendentes':'')+(antigo?' · A última cópia tem mais de 36 horas':'');
 const diagnostico=document.createElement('div');diagnostico.innerHTML='<h3>Erros recentes da operação</h3>';secao.append(diagnostico);
 const {data:erros,error:falha}=await window.supabaseClient.from('sistema_erros_operacionais').select('pagina,mensagem,criado_em').eq('empresa_id',empresa).order('criado_em',{ascending:false}).limit(10);
 const texto=document.createElement('div');diagnostico.append(texto);
 if(falha){texto.textContent='Não foi possível consultar os diagnósticos.';return;}
 if(!erros?.length){texto.textContent='Nenhum erro inesperado registrado.';return;}
 for(const e of erros){const p=document.createElement('p');p.textContent=new Date(e.criado_em).toLocaleString('pt-BR')+' · '+e.pagina+' · '+e.mensagem;texto.append(p);}
};})();
