import { renderizarFila } from './producao-vistas.mjs?v=20261022-fila-separacao';
import { etapaAtual, roteiroHtml, situacao } from './producao-op.mjs?v=20261023-avanco-quantidade';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setores={todos:'Todos os setores',pintura:'Pintura',forracao:'Forração',personalizacao:'Personalização',almoxarifado:'Almoxarifado'};
const estados={pendente:'Aguardando execução',execucao:'Em execução',pausada:'Pausada',conferencia:'Aguardando conferência',concluida:'Concluída',cancelada:'Cancelada'};
const dia=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Sem prazo';
const n=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
function url(v){if(!v)return '';try{const u=new URL(v,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
const foto=(v,alt='')=>v&&url(v)?`<img src="${esc(url(v))}" alt="${esc(alt)}" loading="lazy">`:'';
let itemSel=new URLSearchParams(location.search).get('item');
let empresa,sb,dados,setor=new URLSearchParams(location.search).get('setor')||'todos',busy=false;
const params=new URLSearchParams(location.search);
const pedidoAberto=params.get('pedido');
if(params.has('situacao')) $('#situacao').value=params.get('situacao');
if(params.has('busca')) $('#busca').value=params.get('busca');
if(pedidoAberto){
 document.title='Ordem de produção';
 document.body.classList.add('producao-detalhe-page');
 $('.producao-topo h1').textContent='Ordem de produção';
 const voltar=$('#voltarFila');
 if(voltar){voltar.href='ordens.html?'+new URLSearchParams({setor:params.get('origem_setor')||'todos',situacao:params.get('situacao')||'todas',busca:params.get('busca')||''});voltar.hidden=false;}
}
async function rpc(nome,args={}){const r=await sb.rpc(nome,{p_empresa:empresa,...args});if(r.error)throw r.error;return r.data;}
async function carregar(){
 if(busy)return;busy=true;$('#atualizar').disabled=true;$('#retorno').textContent='Atualizando planejamento…';
 try{await rpc('producao_atualizar');dados=await rpc('producao_quadro');pintar();$('#retorno').textContent='';}
 catch(e){$('#retorno').textContent=e.message;}finally{busy=false;$('#atualizar').disabled=false;}
}
// Ordem de produção visual (out/2026): cada item vira uma ficha com galeria grande (referência escolhida, foto do item,
// detalhes/ambientadas do cadastro e o 3D do ambiente no projeto do pedido) ao lado das informações de execução.
function otimizar(v,w=1400){const u=url(v);if(!u||!u.includes('/storage/v1/object/public/'))return u;return u.replace('/storage/v1/object/public/','/storage/v1/render/image/public/')+(u.includes('?')?'&':'?')+`width=${w}&quality=80&resize=contain`;}
const galerias=new Map();
function imagensDoItem(t){
 const lista=[],vistos=new Set();
 const add=(src,rotulo,tipo)=>{const u=url(src);if(!u||vistos.has(u))return;vistos.add(u);lista.push({src:u,rotulo,tipo});};
 for(const [tipo,c] of Object.entries(t.origem.personalizacao_escolhas||{}))if(c?.foto_url)add(c.foto_url,`Referência · ${tipo} ${c.codigo||''}`.trim(),'referencia');
 add(t.foto,'Foto do item','item');
 for(const f of t.fotos||[])add(f.url,/^galeria/.test(f.slot||'')?'Ambientada':/^detalhe/.test(f.slot||'')?'Detalhe':'Foto do item','item');
 for(const r of t.renders||[])add(r.url,`Projeto 3D · ${t.origem.ambiente||'ambiente'}`,'projeto');
 return lista;
}
function amostra(c){
 if(c?.foto_url&&url(c.foto_url))return `<img src="${esc(otimizar(c.foto_url,400))}" alt="" loading="lazy">`;
 if(/^#[0-9a-f]{6}$/i.test(c?.cor||''))return `<span style="background:${c.cor}"></span>`;
 return `<span class="op-amostra-vazia">${esc(String(c?.codigo||c?.nome||'?').slice(0,6))}</span>`;
}
// Etapa cuja quantidade feita aparece na linha: a atual do setor (ou a última, se todas concluídas).
function etapaQuantidade(t){return etapaAtual(t,setor)||t.etapas.filter(e=>['todos','almoxarifado'].includes(setor)||e.setor===setor).at(-1);}
// Linha amarela com quantidade salva menor que a solicitada; verde quando chega na solicitada (pedido do usuário).
function classeQuantidade(t){const qtd=Number(t.origem.quantidade||0);const e=etapaQuantidade(t);if(!e)return '';const feita=Number(e.quantidade_feita||0);if(qtd>0&&feita>=qtd)return ' is-qtd-completa';return feita>0?' is-qtd-parcial':'';}
function quantidadesHtml(t){const qtd=Number(t.origem.quantidade||0);return `<div class="op-producao-quantidades"><label>Quantidade solicitada<input type="number" value="${qtd}" readonly></label>${(()=>{const e=etapaQuantidade(t);const habilitado=e&&['iniciar','retomar','concluir'].includes(situacao(t,e,dados).principal?.[0]);return `<label>Quantidade feita<input type="number" data-quantidade-feita data-etapa="${esc(e?.id||'')}" min="0" max="${qtd}" step="1" value="${e?Number(e.quantidade_feita||0):qtd}" ${habilitado?'title="Digite e aperte Enter para salvar"':'disabled'}></label>`;})()}</div>`;}
function linhaProducao(t){
 const nome=t.item_nome||t.snapshot.personalizacao.vinculo_nome||t.origem.nome||'Item';
 const atual=etapaAtual(t,setor);const concluido=!atual;
 const estado=atual?situacao(t,atual,dados):null;
 const img=imagensDoItem(t)[0];const total=t.etapas.filter(e=>['todos','almoxarifado'].includes(setor)||e.setor===setor).length;
 const feitas=t.etapas.filter(e=>(['todos','almoxarifado'].includes(setor)||e.setor===setor)&&e.estado==='concluida').length;
 return `<article class="op-lista-item${itemSel===t.id?' is-selecionado':''}${concluido?' is-concluido':''}${classeQuantidade(t)}" data-op-item="${esc(t.id)}" tabindex="0" role="group" aria-label="${esc(nome)}" aria-current="${itemSel===t.id}">
 <div class="op-lista-foto">${img?`<img src="${esc(otimizar(img.src,160))}" alt="" loading="lazy">`:'<span>Sem foto</span>'}</div>
 <div class="op-lista-nome"><strong>${esc(nome)}</strong><small>${esc(atual?setores[atual.setor]+' · '+atual.nome:'Produção concluída')}</small><span>${feitas} / ${total} etapas${estado?.titulo?` · ${esc(estado.titulo)}`:''}</span></div>
 ${quantidadesHtml(t)}</article>`;
}
function itemHtml(t){
 const imgs=imagensDoItem(t);galerias.set(t.id,imgs);
 const nomeCheio=t.item_nome||t.snapshot.personalizacao.vinculo_nome||t.origem.nome||'Item';
 const MEDIDA=/\s*\((?:L|A|P)\)\s*[\d.,]+\s*m\b/gi;const medidas=(String(nomeCheio).match(MEDIDA)||[]).map(v=>v.trim()).join(' ');const nome=String(nomeCheio).replace(MEDIDA,'').trim();
 const qtd=Number(t.origem.quantidade||0);
 const principal=imgs[0];
 const galeria=`<div class="op-galeria" data-galeria="${esc(t.id)}">
   <button type="button" class="op-galeria-main" data-galeria-abrir="${esc(t.id)}" aria-label="Ampliar foto">${principal?`<img src="${esc(otimizar(principal.src))}" alt="${esc(principal.rotulo)}" data-galeria-img><span class="op-galeria-zoom" aria-hidden="true">⤢</span>`:`<span class="op-galeria-vazia"><b>${esc(nome.slice(0,1))}</b>Sem foto cadastrada</span>`}</button>
   ${imgs.length>1?`<div class="op-galeria-thumbs">${imgs.map((g,i)=>`<button type="button" class="${i?'':'is-ativa'}" data-galeria-thumb="${i}" aria-label="${esc(g.rotulo)}" title="${esc(g.rotulo)}"><img src="${esc(otimizar(g.src,220))}" alt="" loading="lazy"><i class="${g.tipo}"></i></button>`).join('')}</div>`:''}
 </div>`;
 return `<article class="producao-item op-item op-ficha" data-item="${esc(t.id)}">
  <div class="op-item-grade">
   ${galeria}
   <div class="op-info">
    ${roteiroHtml(t,setor)}
    <div class="op-notas-colunas">
    ${t.snapshot.personalizacao.observacoes?`<div class="op-nota op-nota-instrucao"><small>Instruções de produção</small><p>${esc(t.snapshot.personalizacao.observacoes)}</p></div>`:''}
    ${t.origem.observacao?`<div class="op-nota op-nota-comercial"><small>Observação do Comercial</small><p>${esc(t.origem.observacao)}</p></div>`:''}
    </div>

   </div>
  </div>

 </article>`;
}
function abrirLightbox(id,indice){
 const imgs=galerias.get(id)||[];if(!imgs.length)return;let i=indice;
 const d=document.createElement('dialog');d.className='op-lightbox';
 const pintarL=()=>{const g=imgs[i];d.innerHTML=`<button type="button" class="op-lb-fechar" data-lb="fechar" aria-label="Fechar">×</button>${imgs.length>1?'<button type="button" class="op-lb-nav prev" data-lb="prev" aria-label="Anterior">‹</button><button type="button" class="op-lb-nav next" data-lb="next" aria-label="Próxima">›</button>':''}<figure><img src="${esc(otimizar(g.src,2400))}" alt="${esc(g.rotulo)}"><figcaption>${esc(g.rotulo)}${imgs.length>1?` · ${i+1} de ${imgs.length}`:''}</figcaption></figure>`;};
 pintarL();document.body.append(d);d.showModal();
 const passo=k=>{i=(i+k+imgs.length)%imgs.length;pintarL();};
 d.addEventListener('click',ev=>{const a=ev.target.closest('[data-lb]')?.dataset.lb;if(a==='fechar'||ev.target===d)d.close();else if(a==='prev')passo(-1);else if(a==='next')passo(1);});
 d.addEventListener('keydown',ev=>{if(ev.key==='ArrowLeft')passo(-1);if(ev.key==='ArrowRight')passo(1);});
 d.addEventListener('close',()=>d.remove());
}
$('#ordens').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.matches('[data-quantidade-feita]:not(:disabled)')){ev.preventDefault();ev.stopPropagation();salvarQuantidade(ev.target);return;}if(ev.target.matches('[data-op-item]')&&['Enter',' '].includes(ev.key)){ev.preventDefault();ev.target.click();}});
$('#ordens').addEventListener('click',ev=>{
 const linha=ev.target.closest('[data-op-item]');
 if(linha&&ev.target.closest('input, [data-acao]'))return;
 if(linha){itemSel=linha.dataset.opItem;const q=new URLSearchParams(location.search);q.set('item',itemSel);history.replaceState(null,'','?'+q);pintar();return;}
 const thumb=ev.target.closest('[data-galeria-thumb]');
 if(thumb){const box=thumb.closest('[data-galeria]');const g=galerias.get(box.dataset.galeria)[Number(thumb.dataset.galeriaThumb)];
  const img=box.querySelector('[data-galeria-img]');img.src=otimizar(g.src);img.alt=g.rotulo;
  box.querySelectorAll('[data-galeria-thumb]').forEach(b=>b.classList.toggle('is-ativa',b===thumb));box.dataset.ativa=thumb.dataset.galeriaThumb;return;}
 const abrir=ev.target.closest('[data-galeria-abrir]');
 if(abrir&&galerias.get(abrir.dataset.galeriaAbrir)?.length)abrirLightbox(abrir.dataset.galeriaAbrir,Number(abrir.closest('[data-galeria]').dataset.ativa||0));
});

function pintar(){
 $('#setores').innerHTML=Object.entries(setores).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
 $('#setores').value=setor;
 if(pedidoAberto){
  const todos=dados.itens.filter(t=>t.pedido_id===pedidoAberto);
  const lista=todos.filter(t=>['todos','almoxarifado'].includes(setor)||t.etapas.some(e=>e.setor===setor));
  if(!lista.some(t=>t.id===itemSel))itemSel=(lista.find(t=>etapaAtual(t,setor))||lista[0])?.id||null;
  const p=todos[0]?.pedido;
  const prazo=lista.map(t=>t.fim_previsto).filter(Boolean).sort()[0];
  // Pedido, cliente, local e prazo ficam em destaque dentro do card de progresso (pedido do usuário: "Pedido 350 Kelly Khawam - Vale dos Desejos  Prazo 25/10").
  const diaMes=v=>v?new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}):'sem prazo';
  const destaque=p?`<div class="op-progresso-pedido"><div class="op-progresso-id"><b>Pedido <em>${esc(p.numero)}</em></b>${p.cliente?`<span class="op-progresso-campo"><small>Cliente</small> ${esc(p.cliente)}</span>`:''}${p.local?`<span class="op-progresso-campo"><small>Local</small> ${esc(p.local)}</span>`:''}</div><div class="op-progresso-prazo" title="${esc('Finalizar serviços até '+quando(prazo))}"><small>Prazo</small><strong>${diaMes(prazo)}</strong></div></div>`:'';
  const cabecalho='';
  const sel=lista.find(t=>t.id===itemSel);
  const etapas=lista.flatMap(t=>t.etapas.filter(e=>['todos','almoxarifado'].includes(setor)||e.setor===setor));
  const prontas=etapas.filter(e=>e.estado==='concluida').length;const pct=etapas.length?Math.round(prontas/etapas.length*100):0;
  $('#ordens').innerHTML=cabecalho+(sel?`<div class="op-triagem-layout"><section class="op-triagem-lista"><div class="op-lista-progresso"><div>${destaque||'<span>Progresso da produção</span>'}<strong>${pct}%</strong></div><progress max="100" value="${pct}">${pct}%</progress><small>${prontas} / ${etapas.length} etapas concluídas</small></div><div class="op-lista-linhas">${lista.map(t=>linhaProducao(t)).join('')}</div></section><aside class="op-referencia-painel" aria-label="Referência e informações"><h2>Referência e informações</h2>${itemHtml(sel)}</aside></div>`:'<p class="producao-sem-pedido">Nenhum item para este setor.</p>');
  $('#contagem').textContent='';
  return;
 }
 const resultado=renderizarFila(dados.itens,{setor,situacao:$('#situacao').value,busca:$('#busca').value.trim()});
 $('#contagem').textContent=`${resultado.total} pedido(s)`;
 $('#ordens').innerHTML=resultado.html;
}
function dialogo(titulo,corpo,confirmar,executar){
 const d=document.createElement('dialog');d.className='producao-dialog';
 d.innerHTML=`<form><h2>${esc(titulo)}</h2>${corpo}<p class="erro" role="alert"></p><footer><button type="button" data-fechar>Fechar</button>${confirmar?`<button class="primario" type="submit">${esc(confirmar)}</button>`:''}</footer></form>`;
 document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const b=d.querySelector('[type=submit]');if(!b)return;b.disabled=true;try{await executar(new FormData(ev.currentTarget),d);d.close();await carregar();}catch(e){d.querySelector('.erro').textContent=e.message;b.disabled=false;}};
 d.showModal();return d;
}
async function etiqueta(t,e,p){
 const d=dialogo('Etiqueta de materiais',`<section class="producao-etiqueta"><strong>Pedido ${esc(t.pedido.numero)} · ${esc(t.pedido.cliente)}</strong><p>${esc(e.nome)} · ${setores[e.setor]}</p><p>Entrega do item: ${dia(t.pedido.entrega)}</p><div data-qr></div><small>${esc(p.qr)}</small><ul>${p.materiais.map(v=>{const m=e.materiais.find(m=>m.id===v.id);return `<li>${esc(m?.nome)} · ${n(v.quantidade)} ${esc(m?.unidade)}</li>`;}).join('')}</ul></section>`,'Imprimir',async()=>window.print());
 await window.EasyLocQR.render(d.querySelector('[data-qr]'),p.qr,160);
}
// Quantidade feita: salva ao apertar Enter no campo (não há mais botão "Salvar quantidade").
async function salvarQuantidade(input){
 if(!input||input.disabled||!input.dataset.etapa)return;
 if(!input.reportValidity())return;
 input.disabled=true;try{await rpc('producao_quantidade_salvar',{p_etapa:input.dataset.etapa,p_quantidade:Number(input.value)});await carregar();}catch(err){$('#retorno').textContent=err.message;input.disabled=false;}
}
document.addEventListener('click',async ev=>{
 const btn=ev.target.closest('[data-acao]');if(!btn)return;const a=btn.dataset.acao;
 const t=dados.itens.find(t=>t.etapas.some(e=>e.id===btn.dataset.etapa));const e=t?.etapas.find(e=>e.id===btn.dataset.etapa);if(!e)return;
 if(a==='quantidade'){
  salvarQuantidade(btn.closest('.op-producao-quantidades').querySelector('[data-quantidade-feita]'));return;
 }
 if(a==='etiqueta'){try{await etiqueta(t,e,e.pacotes.find(p=>p.id===btn.dataset.pacote));}catch(err){$('#retorno').textContent=err.message;}return;}
 if(a==='separar'){
  const dispo=m=>Math.max(0,Number(m.necessario)-Number(m.recebido)+Number(m.devolvido)-e.pacotes.filter(p=>p.estado==='separado').reduce((s,p)=>s+p.materiais.filter(v=>v.id===m.id).reduce((a,v)=>a+Number(v.quantidade),0),0));
  const ms=e.materiais.filter(m=>m.produto_id&&dispo(m)>0);
  dialogo('Separar materiais para a produção',`<p>Pedido ${esc(t.pedido.numero)} · ${esc(e.nome)}. Separar reserva o pacote; a baixa acontece ao confirmar o recebimento pelo QR.</p>${ms.map(m=>`<label>${esc(m.nome)} · ${esc(m.unidade)}<input type="number" name="${m.id}" min="0" max="${dispo(m)}" step="0.001" value="${dispo(m)}"></label>`).join('')||'<p>Não há materiais pendentes vinculados ao Almoxarifado.</p>'}`,'Separar e gerar etiqueta',async v=>{
   const materiais=ms.map(m=>({id:m.id,quantidade:Number(v.get(m.id))})).filter(m=>m.quantidade>0);
   const id=await rpc('producao_separar',{p_etapa:e.id,p_materiais:materiais});
   // A etiqueta fica disponível no próprio pedido após a confirmação.
   $('#retorno').textContent='Pacote '+id.slice(0,8)+' separado.';
  });return;
 }
 if(a==='receber'){
  const d=dialogo('Confirmar recebimento dos materiais','<p>Leia o QR da etiqueta com o leitor conectado ao computador. O recebimento registra a saída do Almoxarifado.</p><label>QR do pacote<input name="qr" required autocomplete="off" placeholder="PROD:MAT:…"></label>','Receber e dar baixa',async v=>{await rpc('producao_receber',{p_qr:v.get('qr'),p_etapa:e.id});});d.querySelector('input').focus();return;
 }
 if(a==='devolver'){
  const m=e.materiais.find(m=>m.id===btn.dataset.material);
  dialogo('Devolver sobra ao Almoxarifado',`<p>${esc(m.nome)}</p><label>Quantidade conferida<input name="qtd" type="number" min="0.001" max="${Number(m.recebido)-Number(m.devolvido)}" step="0.001" required></label><label>Motivo<textarea name="motivo" minlength="5" required></textarea></label>`,'Confirmar entrada',v=>rpc('producao_devolver',{p_material:m.id,p_quantidade:Number(v.get('qtd')),p_motivo:v.get('motivo')}));return;
 }
 const justificar=['pausar','urgencia','autorizar_prazo','revisar','cancelar_revisao'].includes(a);
 dialogo(btn.textContent,`<p>Pedido ${esc(t.pedido.numero)} · ${esc(e.nome)}</p>${a==='revisar'?'<p>A revisão preserva o histórico. Materiais recebidos devem ser reconciliados antes de substituir a ordem.</p>':''}${justificar?'<label>Justificativa<textarea name="motivo" minlength="5" maxlength="1000" required></textarea></label>':''}`,'Confirmar',v=>rpc('producao_acao',{p_etapa:e.id,p_acao:a,p_motivo:v.get('motivo')||''}));
});
$('#setores').onchange=e=>{setor=e.target.value;pintar();};
$('#busca').oninput=()=>{if(dados)pintar();};$('#situacao').onchange=()=>{if(dados)pintar();};$('#atualizar').onclick=carregar;
try{
 const ctx=await window.aguardarContexto();empresa=ctx.empresa_id;sb=window.supabaseClient;await carregar();
 // Mantém a equipe informada de novos pedidos sem interromper leitura de QR ou formulários.
 setInterval(()=>{if(!document.hidden&&!document.querySelector('.producao-dialog[open],.op-lightbox[open]'))carregar();},30000);
}catch(e){$('#retorno').textContent=e.message;}
