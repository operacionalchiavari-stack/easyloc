// Uma projeção dos dados existentes, compartilhada por Geral, apresentação e PDF.
// As medidas saem do nome gerado ("... (L) 2.40 m (A) 0.75 m (P) 1.10 m") porque já aparecem na linha de baixo, com as siglas.
const MEDIDA_RE = /\s*\((?:L|A|P)\)\s*[\d.,]+\s*m\b/gi;
const semMedidas = nome => String(nome || '').replace(MEDIDA_RE, '').replace(/\s{2,}/g, ' ').trim();
// Mesmo formato do cadastro: "(L) 2.50 m (A) 1.00 m (P) 0.60 m". Usa o trecho do próprio nome gerado; sem ele, monta a partir
// das dimensões do item ("250 × 100 × 60 cm", em cm) convertendo pra metros.
function medidasComSiglas(nome, dims){
  const doNome = String(nome || '').match(MEDIDA_RE);
  if(doNome?.length) return doNome.map(t => t.trim()).join(' ');
  const partes = String(dims || '').replace(/\s*cm$/, '').split(' × ');
  if(partes.length !== 3) return '';
  return partes.map((v, i) => `(${'LAP'[i]}) ${Number.isFinite(Number(v)) ? (Number(v) / 100).toFixed(2) + ' m' : '–'}`).join(' ');
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dadosApresentacao(project, findItem){
  return {
    nome: project.noivos || 'Projeto', local: project.local_evento || '', data: project.data_evento || '',
    ambientes: (project.dados?.ambientes || []).map(amb => {
      const grupos = new Map();
      for(const linha of amb.itens || []){
        const id = String(linha.item_id), item = findItem(id);
        const numero = Number(linha.quantidade ?? 1);
        const quantidade = Number.isFinite(numero) && numero > 0 ? numero : 1;
        if(grupos.has(id)){ grupos.get(id).quantidade += quantidade; continue; }
        grupos.set(id, { id, quantidade, nome: item?.name || linha.nome || 'Item indisponível no catálogo',
          nomeCompleto: semMedidas(item?.fullName || item?.name || linha.nome) || 'Item indisponível no catálogo',
          foto: item?.photo || '', referencia: item?.referencia || item?.specs?.find(s => s.label === 'Código')?.value || '',
          categoria: item?.catLabel || '', medidas: medidasComSiglas(item?.fullName, item?.dims),
          preco: Number.isFinite(item?.rentalPrice) ? item.rentalPrice : null,
          reposicao: Number.isFinite(item?.replacementPrice) ? item.replacementPrice : null });
      }
      return { id: amb.id, nome: amb.nome || 'Ambiente', notas: amb.notas || '',
        imagens: (amb.renders || []).filter(r => r.url).map(r => ({url:r.url, nome:r.origem || amb.nome})), itens: [...grupos.values()] };
    }),
  };
}
const dinheiro = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
// Valores em colunas próprias, na mesma linha do nome: reposição (por unidade), locação por unidade e total da linha.
const VALOR_COLS = 3;
const moeda = v => (v === null || v === undefined) ? '<span class="pa-sob-consulta">—</span>' : dinheiro.format(v);
function valoresTd(item, classe = 'pa-valor'){
  const total = item.preco === null || item.preco === undefined ? null : item.preco * item.quantidade;
  return `<td class="${classe}">${moeda(item.reposicao)}</td><td class="${classe}">${moeda(item.preco)}</td><td class="${classe} pa-valor-total">${total === null ? '<span class="pa-sob-consulta">Sob consulta</span>' : `<b>${dinheiro.format(total)}</b>`}</td>`;
}
const valoresTh = (classe = 'pa-valor') => `<th scope="col" class="${classe}">Reposição</th><th scope="col" class="${classe}">Valor un.</th><th scope="col" class="${classe}">Total</th>`;
const foto = (url, classe = '') => {
  if(!url) return '<span class="pa-sem-foto" aria-label="Sem foto">—</span>';
  // Miniaturas seguem a transformação já usada pelo catálogo; a mídia original permanece intacta.
  if(!classe && url.includes('/storage/v1/object/public/')){
    url=url.replace('/storage/v1/object/public/','/storage/v1/render/image/public/');
    url+=(url.includes('?')?'&':'?')+'width=160&quality=74&resize=contain';
  }
  return `<img class="${classe}" src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
};
function linhas(amb, ordenar = false, editar = false){
  return amb.itens.map(item => {
    const quantidade=`<td class="pa-quantidade">${editar ? `<input class="pa-qtd-input" type="number" min="1" max="999" value="${item.quantidade}" data-cpj-qtd-input aria-label="Quantidade de ${esc(item.nomeCompleto || item.nome)}">` : `<b>${item.quantidade}</b>`}${ordenar ? '' : '<small>un.</small>'}</td>`;
    const nome=ordenar ? (item.nomeCompleto || item.nome) : item.nome;
    return `<tr data-pa-item="${esc(item.id)}" data-pa-amb="${esc(amb.id)}"${editar ? ` data-cpj-item="${esc(item.id)}"` : ''}>
      ${ordenar ? `<td class="pa-ordem"><button type="button" data-pa-drag aria-label="Ordenar ${esc(nome)}. Use as setas para cima e para baixo." title="Arraste ou use ↑ e ↓">⠿</button></td>${quantidade}` : ''}
      <td class="pa-miniatura">${foto(item.foto)}</td><td class="pa-descricao">${editar ? '<button type="button" class="cpj-icon-btn pa-remover" data-cpj="item-remover" aria-label="Remover do ambiente" title="Remover">×</button>' : ''}<strong>${esc(nome)}</strong>${item.medidas ? `<small class="pa-medidas">${esc(item.medidas)}</small>` : ""}${!ordenar && item.categoria ? `<small>${esc(item.categoria)}</small>` : ''}${item.referencia ? `<small>Cód. ${esc(item.referencia)}</small>` : ''}</td>${valoresTd(item)}
      ${ordenar ? '' : quantidade}</tr>`;
  }).join('');
}
function tabela(amb, ordenar = false){
  return amb.itens.length ? `<table class="pa-itens" aria-label="Itens de ${esc(amb.nome)}"><thead><tr>${ordenar?'<th scope="col"><span class="pa-sr">Ordenar</span></th><th scope="col" class="pa-quantidade">Qtd.</th>':''}<th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh()}${ordenar?'':'<th scope="col">Qtd.</th>'}</tr></thead><tbody>${linhas(amb,ordenar)}</tbody></table>` : '<p class="pa-vazio">Nenhum item neste ambiente.</p>';
}
// Títulos das colunas logo abaixo do nome de cada ambiente, em cima da 1ª linha (o <thead> fica só pra largura das colunas e
// leitores de tela — ver .pa-geral thead no CSS).
const COLHEAD_GERAL = `<tr class="pa-colhead" aria-hidden="true"><td></td><td class="pa-quantidade">Qtd.</td><td></td><td>Item</td><td class="pa-valor">Reposição</td><td class="pa-valor">Valor un.</td><td class="pa-valor">Total</td></tr>`;
export function geralHtml(model, { editar = false, titulos = true } = {}){
  const ambientes = model.ambientes.filter(amb=>amb.itens.length > 0);
  return `<div class="pa-geral">
    ${!ambientes.length ? '<p class="pa-vazio">Este projeto ainda não possui itens adicionados.</p>' : `<table class="pa-itens" aria-label="Itens do projeto por ambiente">
      <thead><tr><th scope="col"><span class="pa-sr">Ordenar</span></th><th scope="col" class="pa-quantidade">Qtd.</th><th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh()}</tr></thead>
      ${ambientes.map(amb=>`<tbody class="pa-grupo" aria-label="${esc(amb.nome)}">${titulos ? `<tr><td colspan="${4 + VALOR_COLS}" class="pa-ambiente-titulo"><h3>${esc(amb.nome)}</h3></td></tr>` : ''}${COLHEAD_GERAL}${linhas(amb,true,editar)}</tbody>`).join('')}
    </table>`}
    <p class="pa-sr" data-pa-anuncio role="status" aria-live="polite"></p></div>`;
}
// Cabeçalho do pedido (pedido do usuário: "cabeçalho horizontal elegante ocupando toda a largura, com fundo na mesma cor
// do menu do catálogo... logo da Chiavari em branco à esquerda... à direita a foto circular da decoradora, DECORADOR
// SOLICITANTE, o nome, uma linha divisória vertical sutil e PRÉVIA DO PEDIDO"). A logo vira branca por CSS (filter), então
// serve qualquer arquivo. A da Chiavari é um PNG QUADRADO com muita margem transparente (a arte ocupa ~26% da altura): logo
// quadrada ganha .is-quadrada e é recortada na faixa do meio (object-fit:cover) — sem isso a arte sairia minúscula.
function cabecalhoPedidoHtml(empresa, decorador){
  const nome = empresa?.nome || 'Chiavari';
  const marca = empresa?.logo_url
    ? `<img class="cpj-order-logo" src="${esc(empresa.logo_url)}" alt="${esc(nome)}" onload="if(this.naturalWidth&amp;&amp;this.naturalWidth/this.naturalHeight&lt;1.6)this.classList.add('is-quadrada')">`
    : `<strong class="cpj-order-brand-name">${esc(nome)}</strong>`;
  const solicitante = decorador?.nome
    ? `<div class="cpj-order-requester">${decorador.logo_url ? `<img src="${esc(decorador.logo_url)}" alt="Foto de ${esc(decorador.nome)}">` : ''}<div><span>DECORADOR SOLICITANTE</span><strong>${esc(decorador.nome)}</strong></div></div><i class="cpj-order-divider" aria-hidden="true"></i>`
    : '';
  return `<header class="cpj-order-letterhead"><div class="cpj-order-brand">${marca}</div><div class="cpj-order-letterhead-side">${solicitante}<span class="cpj-order-kind">PRÉVIA DO PEDIDO</span></div></header>`;
}

export function pedidoPreviewHtml(model, { decorador = null, empresa = null } = {}){
  const ambientes = model.ambientes.filter(a => a.itens.length);
  const total = ambientes.reduce((s,a) => s + a.itens.reduce((n,i) => n + i.quantidade,0),0);
  return `<article class="cpj-order-paper" aria-label="Prévia do pedido">
    ${cabecalhoPedidoHtml(empresa, decorador)}
    <!-- Clientes / data / local empilhados à esquerda + aviso de prévia num card amarelo à direita (pedido do usuário). -->
    <div class="cpj-order-event">
      <dl class="cpj-order-event-info">
        <div class="cpj-order-client"><dt>Clientes</dt><dd><h2>${esc(model.nome)}</h2></dd></div>
        <div><dt>Data do evento</dt><dd>${esc(model.data ? model.data.slice(0,10).split('-').reverse().join('/') : 'Não informada')}</dd></div>
        <div><dt>Local do evento</dt><dd>${esc(model.local || 'Não informado')}</dd></div>
      </dl>
      <aside class="cpj-order-notice" role="note"><span class="cpj-order-notice-icon" aria-hidden="true">i</span><div><strong>Esta é uma prévia do pedido</strong><p>Este arquivo reúne os itens escolhidos para o projeto. O pedido oficial será enviado pela nossa equipe comercial, com todas as disponibilidades e os serviços adicionais.</p></div></aside>
    </div>
    <table class="cpj-order-table"><colgroup><col class="cpj-order-col-qty"><col class="cpj-order-col-photo"><col><col class="cpj-order-col-valor"><col class="cpj-order-col-valor"><col class="cpj-order-col-valor"></colgroup><thead class="pa-sr"><tr><th scope="col">Qtd.</th><th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh('cpj-order-valor')}</tr></thead>
    ${ambientes.map(amb => `<tbody><tr class="cpj-order-environment"><th colspan="${3 + VALOR_COLS}" scope="rowgroup">${esc(amb.nome)}</th></tr><tr class="cpj-order-colhead" aria-hidden="true"><td>Qtd.</td><td></td><td>Item</td><td class="cpj-order-valor">Reposição</td><td class="cpj-order-valor">Valor un.</td><td class="cpj-order-valor">Total</td></tr>${amb.itens.map(item => `<tr><td class="cpj-order-qty">${item.quantidade}</td><td class="cpj-order-photo">${foto(item.foto)}</td><td><strong>${esc(item.nomeCompleto || item.nome)}</strong>${item.medidas ? `<small class="pa-medidas">${esc(item.medidas)}</small>` : ""}${item.referencia ? `<small>Cód. ${esc(item.referencia)}</small>` : ''}</td>${valoresTd(item,'cpj-order-valor')}</tr>`).join('')}</tbody>`).join('')}</table>
    <div class="cpj-order-paper-total"><span>${ambientes.length} ${ambientes.length === 1 ? 'ambiente' : 'ambientes'}</span><strong>${total} ${total === 1 ? 'item' : 'itens'}</strong></div>
    ${model.ambientes.some(a => a.imagens?.length) ? `<section class="cpj-order-renders"><h2>Renderizações do projeto</h2>${model.ambientes.filter(a => a.imagens?.length).map(amb => `<section class="cpj-order-render-group"><h3>${esc(amb.nome)}</h3><div>${amb.imagens.map(r => `<figure><img src="${esc(r.url)}" alt="Renderização de ${esc(amb.nome)}" loading="lazy" decoding="async"></figure>`).join('')}</div></section>`).join('')}</section>` : ''}
  </article>`;
}
function capaHtml(model){
  const imagem = model.ambientes.flatMap(a=>a.imagens)[0]?.url;
  return `<section class="pa-capa"><p>Apresentação do projeto</p><h1>${esc(model.nome)}</h1><p>${esc([model.data ? model.data.split('-').reverse().join('/') : '',model.local].filter(Boolean).join(' · '))}</p>${imagem ? foto(imagem,'pa-capa-foto') : '<div class="pa-vazio pa-midia-vazia">As renderizações dos ambientes aparecerão aqui.</div>'}</section>`;
}
function ambienteHtml(amb){
  return `<section class="pa-ambiente" data-pa-section="${esc(amb.id)}"><header><p>Ambiente</p><h2>${esc(amb.nome)}</h2></header><div class="pa-composicao"><div class="pa-midia">
    ${amb.imagens.length ? amb.imagens.map((r,i)=>`<figure>${foto(r.url,i?'pa-render-extra':'pa-render')}<figcaption>${esc(r.nome)}</figcaption></figure>`).join('') : '<div class="pa-vazio pa-midia-vazia">Este ambiente ainda não possui imagem ou renderização 3D.</div>'}
    ${amb.notas ? `<p class="pa-notas">${esc(amb.notas)}</p>` : ''}</div><aside><h3>Móveis do ambiente</h3>${tabela(amb)}</aside></div></section>`;
}
export function apresentacaoHtml(model, ambienteId = null){
  const index = model.ambientes.findIndex(a=>a.id===ambienteId);
  const amb = model.ambientes[index];
  return `<div class="pa-apresentacao"><div class="pa-ferramentas"><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="apresentacao-voltar">← Plantas</button><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="apresentacao-pdf">Exportar PDF</button></div>
    <nav class="pa-indice" aria-label="Ambientes da apresentação"><button type="button" data-pa-page="" aria-current="${!amb?'page':'false'}">Projeto</button>${model.ambientes.map(a=>`<button type="button" data-pa-page="${esc(a.id)}" aria-current="${a.id===amb?.id?'page':'false'}">${esc(a.nome)}</button>`).join('')}</nav>
    ${amb ? ambienteHtml(amb) : capaHtml(model)}${!model.ambientes.length?'<p class="pa-vazio">Este projeto ainda não possui ambientes.</p>':''}
    <footer class="pa-paginacao">${index>=0?`<button type="button" data-pa-page="${esc(model.ambientes[index-1]?.id || '')}">← ${esc(model.ambientes[index-1]?.nome || 'Projeto')}</button>`:''}${model.ambientes[index+1]?`<button type="button" data-pa-page="${esc(model.ambientes[index+1].id)}">${esc(model.ambientes[index+1].nome)} →</button>`:''}</footer></div>`;
}
export function documentoApresentacao(model){
  const css = new URL('./projeto-apresentacao.css',import.meta.url).href;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(model.nome)} — Apresentação</title><link rel="stylesheet" href="${esc(css)}"></head><body class="pa-documento">${capaHtml(model)}${model.ambientes.map(ambienteHtml).join('')}</body></html>`;
}
export async function imprimirApresentacao(model){
  return imprimirDocumento(documentoApresentacao(model));
}
export async function imprimirPedido(model, { decorador = null, empresa = null, observacao = '' } = {}){
  const css = new URL('./catalogo-projetos.css',import.meta.url).href;
  const estilos = `@page{size:A4 portrait;margin:14mm 0}@page:first{margin-top:0}body{margin:0;font-family:Arial,sans-serif;color:#34352f}.cpj-order-paper{padding:0 14mm;box-shadow:none}.cpj-order-paper .cpj-order-letterhead{margin:0 -14mm;padding:9mm 14mm}.cpj-order-notes{padding:0 14mm}.cpj-order-table thead{display:table-header-group}.cpj-order-table tr,figure,.cpj-order-requester{break-inside:avoid}.cpj-order-render-group{break-inside:auto}.cpj-order-render-group>div{display:block}.cpj-order-render-group figure{margin:0 0 14px}.cpj-order-render-group img{max-height:230mm}.cpj-order-renders{break-before:auto}.cpj-order-renders>h2,.cpj-order-render-group h3{break-after:avoid}.cpj-order-notes{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:24px;font-size:12px;line-height:1.6}.pa-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}*{print-color-adjust:exact}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(model.nome)} — Pedido Chiavari</title><link rel="stylesheet" href="${esc(css)}"><style>${estilos}</style></head><body>${pedidoPreviewHtml(model,{decorador,empresa})}${observacao.trim() ? `<section class="cpj-order-notes"><strong>Observação para a equipe</strong><p>${esc(observacao.trim())}</p></section>` : ''}</body></html>`;
  return imprimirDocumento(html);
}
async function imprimirDocumento(html){
  const frame = document.createElement('iframe');
  frame.title = 'Impressão do documento';
  frame.style.cssText='position:fixed;width:1100px;height:800px;left:-12000px;top:0;border:0';
  document.body.append(frame);
  const loaded = new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.srcdoc = html;
  try{
    await loaded;
    const doc = frame.contentDocument;
    doc.querySelectorAll('img').forEach(img=>img.loading='eager');
    let timeout;
    try {
      await Promise.race([Promise.all([...doc.images].map(img=>img.decode().catch(()=>{
        const vazio=doc.createElement('span'); vazio.className='pa-vazio'; vazio.textContent='Imagem indisponível'; img.replaceWith(vazio);
      }))),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('As imagens não terminaram de carregar. Tente exportar novamente.')),30000);})]);
    } finally { clearTimeout(timeout); }
    await doc.fonts.ready;
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
    frame.contentWindow.focus(); frame.contentWindow.print();
    // Alguns navegadores não emitem afterprint quando a impressão é cancelada.
    setTimeout(()=>frame.remove(),120000);
  }catch(error){ frame.remove(); throw error; }
}

// Move grupos de registros do mesmo item sem alterar quantidades nem ambiente.
export function reordenarItens(amb, origem, destino){
  if(origem===destino) return false;
  const itens = amb.itens || [], de=itens.findIndex(i=>String(i.item_id)===origem), para=itens.findIndex(i=>String(i.item_id)===destino);
  if(de<0 || para<0) return false;
  const grupo=itens.filter(i=>String(i.item_id)===origem), outros=itens.filter(i=>String(i.item_id)!==origem);
  let pos=outros.findIndex(i=>String(i.item_id)===destino);
  if(de<para) while(pos<outros.length && String(outros[pos].item_id)===destino) pos++;
  outros.splice(pos,0,...grupo); amb.itens=outros; return true;
}

export function bindOrdenacao(host, onMove){
  let drag=null;
  host.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-pa-drag]'); if(!handle || event.button!==0) return;
    const row=handle.closest('[data-pa-item]');
    drag={handle,row,pointer:event.pointerId,target:null,y:event.clientY};
    handle.setPointerCapture(event.pointerId); row.classList.add('pa-arrastando');
  });
  host.addEventListener('pointermove',event=>{
    if(!drag) return;
    event.preventDefault();
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-pa-item]');
    host.querySelector('.pa-destino')?.classList.remove('pa-destino');
    drag.target=target?.dataset.paAmb===drag.row.dataset.paAmb ? target : null;
    drag.target?.classList.add('pa-destino');
    if(event.clientY<90) window.scrollBy(0,-18);
    if(event.clientY>innerHeight-70) window.scrollBy(0,18);
  });
  const end=event=>{
    if(!drag) return; const d=drag; drag=null;
    d.row.classList.remove('pa-arrastando'); d.target?.classList.remove('pa-destino');
    if(d.handle.hasPointerCapture(d.pointer)) d.handle.releasePointerCapture(d.pointer);
    if(event.type==='pointerup' && d.target) onMove(d.row.dataset.paAmb,d.row.dataset.paItem,d.target.dataset.paItem);
  };
  host.addEventListener('pointerup',end); host.addEventListener('pointercancel',end);
  host.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-pa-drag]') || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const row=event.target.closest('[data-pa-item]');
    const other=event.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
    if(other?.matches('[data-pa-item]')) onMove(row.dataset.paAmb,row.dataset.paItem,other.dataset.paItem);
  });
}
