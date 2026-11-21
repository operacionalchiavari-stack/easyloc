const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const itemId = foto => String(foto.item_id || foto.personalizacao?.item_id || foto.item_codigo || foto.item_nome);
const state = { fotos:[], dentro:false, categoria:null, item:null, carregando:false, foto:null };
let folderSeq=0;
function folderSvg(foto){
  const id='pia-peek-'+(++folderSeq);
  const miniatura=foto?.replace('/storage/v1/object/public/','/storage/v1/render/image/public/');
  const src=miniatura && miniatura!==foto?miniatura+(miniatura.includes('?')?'&':'?')+'width=160&quality=74&resize=contain':foto;
  const imagem=src?`<clipPath id="${id}"><rect x="18" y="0" width="64" height="42" rx="4"/></clipPath><g class="pia-folder-peek"><image href="${escapeHtml(src)}" x="18" y="0" width="64" height="42" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/><rect class="pia-folder-peek-frame" x="18" y="0" width="64" height="42" rx="4" fill="none"/></g>`:'';
  return `<svg viewBox="0 0 100 80" aria-hidden="true"><rect class="pia-folder-tab" x="10" y="16" width="28" height="12" rx="3"/><rect class="pia-folder-back" x="10" y="22" width="80" height="48" rx="6"/>${imagem}<rect class="pia-folder-front" x="6" y="32" width="88" height="38" rx="6"/></svg>`;
}
const dataBr = data => data ? new Date(data).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}) : '';
const pasta = (nome,quantidade,atributos,foto) => `<button type="button" class="pia-card pia-folder" ${atributos}><span class="pia-card-visual">${folderSvg(foto)}</span><span class="pia-card-copy"><strong>${escapeHtml(nome)}</strong><small>${quantidade} ${quantidade===1?'imagem':'imagens'}</small></span></button>`;

function renderizar(){
  const busca=normalizar($('piaBusca').value), tipo=$('piaTipo').value;
  const fotos=state.fotos.filter(f=>(!tipo || f.tipo===tipo) && (!busca || normalizar([f.item_nome,f.item_codigo,f.categoria,f.titulo,f.cliente_nome,f.tipo].join(' ')).includes(busca)));
  const trilha=['<button type="button" data-nav="inicio">Personalizações IA</button>'];
  if(state.dentro)trilha.push('<span>›</span><button type="button" data-nav="raiz">Itens personalizáveis</button>');
  if(state.categoria!==null)trilha.push(`<span>›</span><button type="button" data-nav="categoria">${escapeHtml(state.categoria)}</button>`);
  if(state.item!==null)trilha.push(`<span>›</span><strong>${escapeHtml(state.fotos.find(f=>itemId(f)===state.item)?.item_nome || 'Item')}</strong>`);
  $('piaCaminho').innerHTML=trilha.join('');
  let html='';
  if(!state.dentro){html=pasta('Itens personalizáveis',fotos.length,'data-open-root',fotos[0]?.url);}
  else if(state.categoria===null){
    const categorias=[...new Set(fotos.map(f=>f.categoria))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    html=categorias.map(c=>pasta(c,fotos.filter(f=>f.categoria===c).length,`data-category="${escapeHtml(c)}"`,fotos.find(f=>f.categoria===c)?.url)).join('');
  }else if(state.item===null){
    const itens=new Map();fotos.filter(f=>f.categoria===state.categoria).forEach(f=>{const id=itemId(f);if(!itens.has(id))itens.set(id,{foto:f,n:0});itens.get(id).n++;});
    html=[...itens].sort(([,a],[,b])=>a.foto.item_nome.localeCompare(b.foto.item_nome,'pt-BR')).map(([id,{foto,n}])=>pasta([foto.item_nome,foto.item_codigo].filter(Boolean).join(' · '),n,`data-item="${escapeHtml(id)}"`,foto.url)).join('');
  }else{
    html=fotos.filter(f=>f.categoria===state.categoria && itemId(f)===state.item).map(f=>`<button type="button" class="pia-card" data-photo="${escapeHtml(f.id)}"><span class="pia-card-visual"><img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.titulo)}" loading="lazy"></span><span class="pia-card-copy"><strong>${escapeHtml(f.titulo)}</strong><small>${f.tipo==='tinta'?'Tinta':'Tecido'} · ${escapeHtml(dataBr(f.criado_em))}${f.cliente_nome?'<br>'+escapeHtml(f.cliente_nome):''}</small></span></button>`).join('');
  }
  $('piaGrade').innerHTML=html;
  $('piaStatus').hidden=Boolean(html);
  $('piaStatus').textContent=busca||tipo?'Nenhuma personalização encontrada com esses filtros.':'As imagens geradas com IA aparecerão aqui automaticamente.';
}

async function carregar(){
  if(state.carregando)return;
  state.carregando=true;$('piaAtualizar').disabled=true;$('piaStatus').hidden=false;$('piaStatus').textContent='Carregando personalizações…';
  try{
    const contexto=await window.aguardarContexto();
    if(!contexto?.empresa_id)throw Error('Não foi possível identificar a empresa. Entre novamente no sistema.');
    const {data,error}=await window.supabaseClient.rpc('comercial_personalizacoes_ia_carregar',{p_empresa_id:contexto.empresa_id});
    if(error)throw error;
    state.fotos=Array.isArray(data?.fotos)?data.fotos:[];renderizar();
  }catch(error){$('piaGrade').innerHTML='';$('piaStatus').hidden=false;$('piaStatus').textContent=error.message || 'Não foi possível carregar as imagens. Clique em Atualizar para tentar novamente.';}
  finally{state.carregando=false;$('piaAtualizar').disabled=false;}
}

function abrirFoto(id){
  const foto=state.fotos.find(f=>String(f.id)===id);if(!foto)return;
  state.foto=foto;
  $('piaPreviewTitulo').textContent=foto.item_nome;
  $('piaPreviewDetalhe').textContent=[foto.item_codigo,foto.titulo,foto.cliente_nome].filter(Boolean).join(' · ');
  $('piaPreviewData').textContent=dataBr(foto.criado_em);
  $('piaImagem').src=foto.url;$('piaImagem').alt=`${foto.item_nome} — ${foto.titulo}`;
  $('piaPreview').showModal();
}
$('piaGrade').addEventListener('click',event=>{
  const botao=event.target.closest('button');if(!botao)return;
  if(botao.hasAttribute('data-open-root'))state.dentro=true;
  else if(botao.hasAttribute('data-category'))state.categoria=botao.dataset.category;
  else if(botao.hasAttribute('data-item'))state.item=botao.dataset.item;
  else if(botao.hasAttribute('data-photo')){abrirFoto(botao.dataset.photo);return;}
  renderizar();
});
$('piaCaminho').addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]')?.dataset.nav;if(!nav)return;
  state.item=null;
  if(nav!=='categoria')state.categoria=null;
  if(nav==='inicio')state.dentro=false;
  renderizar();
});
$('piaBusca').addEventListener('input',renderizar);$('piaTipo').addEventListener('change',renderizar);
$('piaAtualizar').addEventListener('click',carregar);$('piaFechar').addEventListener('click',()=>$('piaPreview').close());
$('piaBaixar').addEventListener('click',async()=>{
  const foto=state.foto;if(!foto)return;
  const botao=$('piaBaixar');botao.disabled=true;botao.textContent='Preparando…';
  try{
    const resposta=await fetch(foto.url);if(!resposta.ok)throw Error('Imagem indisponível');
    const blob=await resposta.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
    const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
    link.href=url;link.download=`${foto.item_nome.replace(/[^\p{L}\p{N} -]/gu,'')}-${foto.tipo}.${ext}`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{const link=document.createElement('a');link.href=foto.url;link.target='_blank';link.rel='noopener';link.click();}
  finally{botao.disabled=false;botao.textContent='Baixar imagem';}
});
carregar();
