// Parâmetros > Almoxarifado (out/2026): liga/desliga a solicitação de compra automática (estoque chegou no mínimo →
// pede ideal − estoque) e diz se o Almoxarifado pode lançar valores/pagamento no recebimento. Grava em almoxarifado_configuracoes pela RPC almox_compra_config_salvar; a regra roda no banco.
(function(){
  "use strict";
  const form = document.getElementById("formAlmoxParametros");
  if(!form) return;
  const status = document.getElementById("almoxParametrosStatus");
  const botao = document.getElementById("btnSalvarAlmox");
  const campo = document.getElementById("almoxCompraAutomatica");
  const campoFin = document.getElementById("almoxEditaFinanceiro");
  let empresaId = null, carregado = false;
  botao.disabled=true;

  async function carregar(){
    const ctx = await window.aguardarContexto?.();
    empresaId = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if(!empresaId){ status.textContent = "Empresa não identificada."; botao.disabled = true; return; }
    const { data, error } = await window.supabaseClient.rpc("almox_compra_config", { p_empresa: empresaId });
    if(error){ console.error(error); status.textContent = "Não foi possível carregar os parâmetros do almoxarifado."; return; }
    carregado=true;botao.disabled=false;
    campo.checked = Boolean(data?.automatica);
    if(campoFin) campoFin.checked = Boolean(data?.edita_financeiro);
    status.textContent = campo.checked ? "Compra automática ligada." : "Compra automática desligada.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!empresaId || !carregado || botao.disabled) return;
    botao.disabled = true; status.textContent = "Salvando…";
    try{const { data, error } = await window.supabaseClient.rpc("almox_compra_config_salvar", { p_empresa: empresaId, p_automatica: campo.checked, p_edita_financeiro: campoFin ? campoFin.checked : null });
    botao.disabled = false;
    if(error){ console.error(error); status.textContent = ""; window.alerta?.("Não foi possível salvar: " + error.message, "Parâmetros", "erro"); return; }
    const n = Number(data?.abertas || 0);
    status.textContent = data?.automatica
      ? "Salvo. Compra automática ligada" + (n ? " · " + n + (n === 1 ? " solicitação aberta." : " solicitações abertas.") : ".")
      : "Salvo. Compra automática desligada.";
    }catch(err){status.textContent=err.message;window.alerta?.(err.message,"Parâmetros","erro");}finally{botao.disabled=false;}
  });

  carregar().catch(e=>{status.textContent=e.message;botao.disabled=true;});
})();

// Lista de justificativas da contagem, compartilhada com o Almoxarifado.
(function(){
  'use strict';
  const form=document.getElementById('formJustificativasContagem');if(!form)return;
  const campo=document.getElementById('almoxJustificativasContagem'),status=document.getElementById('almoxJustificativasStatus'),botao=document.getElementById('btnSalvarJustificativasContagem');
  let empresa,carregado=false;
  const pode=()=>window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar')!==false;
  async function carregar(){
    const ctx=await window.aguardarContexto?.();empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;
    if(!empresa)throw Error('Empresa não identificada.');
    const {data,error}=await window.supabaseClient.from('almoxarifado_configuracoes').select('valor').eq('empresa_id',empresa).eq('chave','contagem_justificativas').maybeSingle();
    if(error)throw error;
    campo.value=(Array.isArray(data?.valor)?data.valor:[]).filter(v=>typeof v==='string').join('\n');
    carregado=true;campo.disabled=!pode();botao.disabled=!pode();
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!carregado||botao.disabled||!pode())return;
    const linhas=campo.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),vistas=new Set(),opcoes=[];
    for(const linha of linhas){
      if(linha.length<5){status.textContent='Cada justificativa deve ter pelo menos 5 caracteres.';campo.focus();return;}
      const chave=linha.toLocaleLowerCase('pt-BR');if(!vistas.has(chave)){vistas.add(chave);opcoes.push(linha);}
    }
    botao.disabled=true;status.textContent='Salvando…';
    try{
      const {error}=await window.supabaseClient.from('almoxarifado_configuracoes').upsert({empresa_id:empresa,chave:'contagem_justificativas',valor:opcoes,updated_at:new Date().toISOString()},{onConflict:'empresa_id,chave'});
      if(error)throw error;
      campo.value=opcoes.join('\n');status.textContent='Justificativas salvas.';
    }catch(err){status.textContent='Não foi possível salvar: '+err.message;}finally{botao.disabled=!pode();}
  });
  carregar().catch(err=>{campo.disabled=true;botao.disabled=true;status.textContent='Não foi possível carregar: '+err.message;});
})();

// Teto de gastos por setor (nov/2026): % do faturamento do mês por setor, mês a mês. Tabela almox_teto_percentuais
// (RPCs almox_teto_percentuais_ler/_salvar). Substitui a aba "Config Percentuais" da planilha do Almoxarifado.
(function(){
  'use strict';
  const form=document.getElementById('formTetoGastos');if(!form)return;
  const host=document.getElementById('almoxTetoTabela'),status=document.getElementById('almoxTetoStatus'),botao=document.getElementById('btnSalvarTeto');
  const MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let empresa,linhas=[];
  function desenhar(){
    if(!linhas.length){host.innerHTML='<p class="pr-ajuda">Nenhum setor cadastrado. Cadastre os setores em Parâmetros › Recursos humanos.</p>';return;}
    host.innerHTML='<div style="overflow-x:auto"><table class="pr-tabela"><thead><tr><th>Setor</th>'+MESES.map(m=>'<th>'+m+' %</th>').join('')+'<th></th></tr></thead><tbody>'+
      linhas.map((l,i)=>'<tr><td><b>'+esc(l.nome)+'</b></td>'+l.valores.map((v,m)=>'<td><input type="number" min="0" max="100" step="0.1" data-teto="'+i+'" data-mes="'+m+'" value="'+(Number(v)||0)+'" aria-label="'+esc(l.nome)+' '+MESES[m]+'" style="width:64px"></td>').join('')+
      '<td><button type="button" class="btn" data-teto-repetir="'+i+'" title="Usar o valor de janeiro em todos os meses">Repetir jan.</button></td></tr>').join('')+'</tbody></table></div>';
  }
  async function carregar(){
    const ctx=await window.aguardarContexto?.();empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;if(!empresa)throw Error('Empresa não identificada.');
    const {data,error}=await window.supabaseClient.rpc('almox_teto_percentuais_ler',{p_empresa:empresa});if(error)throw error;
    linhas=(data||[]).map(l=>({nome:l.nome,valores:(l.valores||[]).map(Number)}));desenhar();botao.disabled=!linhas.length;
  }
  host.addEventListener('input',e=>{const t=e.target.closest('[data-teto]');if(t)linhas[+t.dataset.teto].valores[+t.dataset.mes]=Number(t.value)||0;});
  host.addEventListener('click',e=>{const b=e.target.closest('[data-teto-repetir]');if(!b)return;const l=linhas[+b.dataset.tetoRepetir];l.valores=l.valores.map(()=>l.valores[0]);desenhar();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(botao.disabled)return;
    if(linhas.some(l=>l.valores.some(v=>v<0||v>100))){status.textContent='Use percentuais de 0 a 100.';return;}
    botao.disabled=true;status.textContent='Salvando…';
    try{const {error}=await window.supabaseClient.rpc('almox_teto_percentuais_salvar',{p_empresa:empresa,p_dados:linhas});if(error)throw error;status.textContent='Teto de gastos salvo.';}
    catch(err){status.textContent='';window.alerta?.('Não foi possível salvar: '+err.message,'Parâmetros','erro');}finally{botao.disabled=false;}
  });
  carregar().catch(err=>{host.innerHTML='<p class="pr-ajuda">Não foi possível carregar: '+esc(err.message)+'</p>';});
})();
