const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const situacoes={aguardando_vinculo:'Enviada para Compras',pendente:'Em análise',aguardando_aprovacao:'Aguardando aprovação',em_cotacao:'Em cotação',cotada:'Cotada',comprada:'Comprada',aguardando_recebimento:'Aguardando recebimento',atendida:'Atendida',cancelada:'Cancelada'};
const tons={aguardando_vinculo:'enviada',pendente:'atencao',aguardando_aprovacao:'atencao',em_cotacao:'cotacao',cotada:'cotacao',comprada:'concluida',aguardando_recebimento:'atencao',atendida:'concluida',cancelada:'cancelada'};
let empresa;
async function rpc(acao,dados={}){const {data,error}=await window.supabaseClient.rpc('compras_galpao',{p_empresa:empresa,p_acao:acao,p_dados:dados});if(error)throw Error(error.message);return data;}
async function carregar(){
 const rows=await rpc('listar');$('solicitacoes').innerHTML=rows.map(r=>`<tr><td>#${esc(r.numero)}</td><td>${esc(r.material_nome)}${r.observacao?`<small>${esc(r.observacao)}</small>`:''}</td><td>${Number(r.quantidade).toLocaleString('pt-BR')} ${esc(r.unidade)}</td><td class="solicitacao-prazo text-danger">${r.data_necessidade?esc(r.data_necessidade.split('-').reverse().join('/')):'—'}</td><td>${esc(r.solicitante_nome)}</td><td><span class="solicitacao-status is-${tons[r.status]||'enviada'}">${esc(situacoes[r.status]||r.status)}</span></td></tr>`).join('');$('vazio').hidden=rows.length>0;contar(rows.length);
}

// Nov/2026: tela em duas colunas (como a Ideia Premiada): aba "Nova solicitação" com a conversa sempre aberta e aba
// "Minhas solicitações" com a lista.
const trocarAba=aba=>{document.querySelectorAll('.sl-abas [data-aba]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.aba===aba)));$('painelNova').hidden=aba!=='nova';$('painelLista').hidden=aba!=='lista';try{localStorage.setItem('sl_aba:'+location.pathname,aba);}catch(_){}if(aba==='nova')window.EasyLocAssistenteSolicitacao?.focar();};
document.querySelectorAll('.sl-abas [data-aba]').forEach(b=>b.onclick=()=>trocarAba(b.dataset.aba));
const contar=n=>{$('slQtd').textContent=n?` · ${n}`:'';};
const abrirFormulario=()=>{$('solicitacaoForm').reset();$('erroSolicitacao').textContent='';$('solicitacaoDialog').showModal();};
// Nov/2026: a nova solicitação é feita conversando com a especialista em compras; o formulário fica como alternativa.
const diaBr=v=>v?String(v).split('-').reverse().join('/'):'';
const configIA={tipo:'compra',titulo:'Nova solicitação de compra',assistente:'Especialista em compras',icone:'🛒',
  saudacao:n=>(n?`Oi, ${n}! `:'Oi! ')+'Me conte o que você precisa comprar e para que vai usar. Pode escrever ou mandar um áudio.',
  resumoHtml:(r,esc)=>`<h3>${esc(r.descricao_item)}</h3><div class="as-res-grade"><div class="as-res-campo"><span>Quantidade</span><p>${Number(r.quantidade).toLocaleString('pt-BR')} ${esc(r.unidade)}</p></div><div class="as-res-campo"><span>Necessário até</span><p>${esc(diaBr(r.data_necessidade)||'Sem data definida')}</p></div><div class="as-res-campo inteira"><span>Para que vai usar</span><p>${esc(r.motivo)}</p></div><div class="as-res-campo inteira"><span>Pedido / evento</span><p>${esc(r.pedido||'Uso geral / estoque')}</p></div>${r.produto_url?`<div class="as-res-campo inteira"><span>Link de referência</span><p><a href="${esc(r.produto_url)}" target="_blank" rel="noopener">${esc(r.produto_url)}</a></p></div>`:''}${r.observacao?`<div class="as-res-campo inteira"><span>Observações</span><p>${esc(r.observacao)}</p></div>`:''}</div>`,
  confirmar:async r=>{
   const obs=[`Para que: ${r.motivo}`,`Pedido / evento: ${r.pedido||'uso geral / estoque'}`,r.observacao].filter(Boolean).join('\n');
   const criada=await rpc('criar',{descricao_item:r.descricao_item,quantidade:r.quantidade,unidade:r.unidade||'un',data_necessidade:r.data_necessidade||'',produto_url:r.produto_url||'',observacao:obs});
   await carregar();
   return `Pronto! A solicitação ${criada?.numero?'#'+criada.numero+' ':''}foi enviada para Compras. Você acompanha a situação aqui nesta lista.`;
  },
  formulario:abrirFormulario,verLista:()=>trocarAba('lista')};
document.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>$('solicitacaoDialog').close());
$('solicitacaoForm').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;$('erroSolicitacao').textContent='';try{const dados=Object.fromEntries(new FormData(e.target));dados.quantidade=Number(dados.quantidade);await rpc('criar',dados);$('solicitacaoDialog').close();await carregar();window.alerta('Solicitação enviada para Compras.','Solicitação de compra','sucesso');}catch(err){$('erroSolicitacao').textContent=err.message;}finally{btn.disabled=false;}};
try{const ctx=await window.aguardarContexto();empresa=ctx.empresa_id;window.EasyLocAssistenteSolicitacao?.montarNaTela($('slChat'),configIA);let ab='nova';try{ab=localStorage.getItem('sl_aba:'+location.pathname)||'nova';}catch(_){}trocarAba(ab);await carregar();}catch(err){$('retorno').textContent=err.message;}
