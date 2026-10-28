const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const situacoes={aguardando_vinculo:'Enviada para Compras',pendente:'Em análise',aguardando_aprovacao:'Aguardando aprovação',em_cotacao:'Em cotação',cotada:'Cotada',comprada:'Comprada',aguardando_recebimento:'Aguardando recebimento',atendida:'Atendida',cancelada:'Cancelada'};
const tons={aguardando_vinculo:'enviada',pendente:'atencao',aguardando_aprovacao:'atencao',em_cotacao:'cotacao',cotada:'cotacao',comprada:'concluida',aguardando_recebimento:'atencao',atendida:'concluida',cancelada:'cancelada'};
let empresa;
async function rpc(acao,dados={}){const {data,error}=await window.supabaseClient.rpc('compras_galpao',{p_empresa:empresa,p_acao:acao,p_dados:dados});if(error)throw Error(error.message);return data;}
async function carregar(){
 const rows=await rpc('listar');$('solicitacoes').innerHTML=rows.map(r=>`<tr><td>#${esc(r.numero)}</td><td>${esc(r.material_nome)}${r.observacao?`<small>${esc(r.observacao)}</small>`:''}</td><td>${Number(r.quantidade).toLocaleString('pt-BR')} ${esc(r.unidade)}</td><td class="solicitacao-prazo text-danger">${r.data_necessidade?esc(r.data_necessidade.split('-').reverse().join('/')):'—'}</td><td>${esc(r.solicitante_nome)}</td><td><span class="solicitacao-status is-${tons[r.status]||'enviada'}">${esc(situacoes[r.status]||r.status)}</span></td></tr>`).join('');$('vazio').hidden=rows.length>0;
}
$('novaSolicitacao').onclick=()=>{$('solicitacaoForm').reset();$('erroSolicitacao').textContent='';$('solicitacaoDialog').showModal();};
document.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>$('solicitacaoDialog').close());
$('solicitacaoForm').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;$('erroSolicitacao').textContent='';try{const dados=Object.fromEntries(new FormData(e.target));dados.quantidade=Number(dados.quantidade);await rpc('criar',dados);$('solicitacaoDialog').close();await carregar();window.alerta('Solicitação enviada para Compras.','Solicitação de compra','sucesso');}catch(err){$('erroSolicitacao').textContent=err.message;}finally{btn.disabled=false;}};
try{const ctx=await window.aguardarContexto();empresa=ctx.empresa_id;await carregar();}catch(err){$('retorno').textContent=err.message;}
