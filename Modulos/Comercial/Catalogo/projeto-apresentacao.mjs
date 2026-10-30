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
// Personalizações por item (out/2026): o catálogo do pedido comercial registra aqui as personalizações cadastradas
// (Estoque > Personalizações), pra Lista Completa oferecer a escolha e a prévia mostrar o nome. Sem registro, nada aparece.
const PERSONALIZACOES = { porItem: new Map(), nome: new Map() };
// Cada uma: { id, vinculo_id, nome, preco_base, tipos_cartela } (personalizacao_lista).
export function definirPersonalizacoes(lista = []){
  PERSONALIZACOES.porItem.clear(); PERSONALIZACOES.nome.clear();
  for(const p of lista){
    const id = String(p.id), item = String(p.vinculo_id);
    PERSONALIZACOES.nome.set(id, p.nome);
    if(!PERSONALIZACOES.porItem.has(item)) PERSONALIZACOES.porItem.set(item, []);
    PERSONALIZACOES.porItem.get(item).push({ id, nome: p.nome, precoBase: p.preco_base ?? null, tiposCartela: p.tipos_cartela || [] });
  }
}
export const opcoesPersonalizacaoDoItem = (itemId) => PERSONALIZACOES.porItem.get(String(itemId)) || [];
// Texto da escolha feita nas cartelas: "Tecido LK-01 Linho Azul (Karsten)".
export function textoEscolhas(escolhas){
  return Object.entries(escolhas && typeof escolhas === 'object' ? escolhas : {})
    .map(([tipo, o]) => o && (o.codigo || o.nome) ? `${tipo} ${[o.codigo, o.nome].filter(Boolean).join(' ')}${o.fornecedor ? ` (${o.fornecedor})` : ''}` : '')
    .filter(Boolean).join(' · ');
}
function persDaLinha(linha){
  const personalizacaoId = linha.personalizacao_id ? String(linha.personalizacao_id) : '';
  const valor = Number(linha.personalizacao_valor);
  return { personalizacaoId,
    personalizacaoNome: personalizacaoId ? (PERSONALIZACOES.nome.get(personalizacaoId) || linha.personalizacao_nome || 'Personalização') : '',
    personalizacaoEscolhas: personalizacaoId && linha.personalizacao_escolhas && typeof linha.personalizacao_escolhas === 'object' ? linha.personalizacao_escolhas : {},
    personalizacaoValor: personalizacaoId && Number.isFinite(valor) && linha.personalizacao_valor !== null && linha.personalizacao_valor !== undefined ? valor : null };
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dadosApresentacao(project, findItem){
  return {
    nome: project.noivos || 'Projeto', local: project.local_evento || '', data: project.data_evento || '', dataFim: project.data_evento_fim || project.dados?.evento?.data_fim || '', evento: project.dados?.evento || {},
    ambientes: (project.dados?.ambientes || []).map(amb => {
      const grupos = new Map();
      for(const linha of amb.itens || []){
        const id = String(linha.item_id), item = findItem(id);
        const numero = Number(linha.quantidade ?? 1);
        const quantidade = Number.isFinite(numero) && numero > 0 ? numero : 1;
        if(grupos.has(id)){ const g = grupos.get(id); g.quantidade += quantidade; if(!g.personalizacaoId && linha.personalizacao_id){ Object.assign(g, persDaLinha(linha)); } continue; }
        grupos.set(id, { id, quantidade, nome: item?.name || linha.nome || 'Item indisponível no catálogo',
          nomeCompleto: semMedidas(item?.fullName || item?.name || linha.nome) || 'Item indisponível no catálogo',
          observacao: String(linha.observacao || '').slice(0,1000),
          foto: item?.photo || '', referencia: item?.referencia || item?.specs?.find(s => s.label === 'Código')?.value || '',
          categoria: item?.catLabel || '', tipo: item?.tipo || '', personalizable: Boolean(item?.personalizable), medidas: medidasComSiglas(item?.fullName, item?.dims),
          preco: Number.isFinite(item?.rentalPrice) ? item.rentalPrice : null,
          reposicao: Number.isFinite(item?.replacementPrice) ? item.replacementPrice : null,
          ...persDaLinha(linha),
          opcoesPersonalizacao: PERSONALIZACOES.porItem.get(id) || [] });
      }
      return { id: amb.id, nome: amb.nome || 'Ambiente', notas: amb.notas || '',
        imagens: (amb.renders || []).filter(r => r.url).map(r => ({url:r.url, nome:r.origem || amb.nome, jogos: Math.max(1, Number(r.jogos) || 1)})), itens: [...grupos.values()] };
    }),
    // Serviços adicionais do pedido comercial (out/2026).
    servicos: (Array.isArray(project.dados?.servicos) ? project.dados.servicos : []).map(s => ({ nome: s.nome || 'Serviço', quantidade: Number(s.quantidade) || 1, valor: Number(s.valor) || 0, data: s.data || '', hora: s.hora || '' })),
  };
}
// Seção "Serviços adicionais" da prévia/PDF do pedido.
// Resumo do pedido e programação de pagamento no fim do pedido (pedido do usuário, out/2026), nos dois layouts.
// model.financeiro = { resumo:[{rotulo, valor}], total, parcelas:[{componente, numero, tipo, vencimento, valor, metodo, status}] }
// — vem da tela do pedido (ao vivo) ou do pedido salvo (Central). Projeto do decorador não tem: nada aparece.
const COMPONENTES_PAGAMENTO = { locacao: 'Locação', frete: 'Frete', montagem: 'Montagem' };
const dataBr = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';
export function financeiroPedidoSalvo(pedido){
  const obs = pedido?.observacoes || {};
  const v = obs.valores && typeof obs.valores === 'object' ? obs.valores : null;
  const total = Number(v?.total ?? pedido?.valor_total) || 0;
  const resumo = v ? [['Locação', v.locacao], ['Frete', v.frete], ['Montagem', v.montagem]].filter(([, x]) => Number(x) > 0).map(([rotulo, valor]) => ({ rotulo, valor: Number(valor) })) : [];
  const lista = [obs.parcelas_financeiras, obs.financeiro?.parcelas_financeiras, obs.pagamento?.parcelas_financeiras, pedido?.parcelas_financeiras].find(Array.isArray) || [];
  const parcelas = lista.filter(p => Number(p?.valor) > 0).map(p => ({ componente: p.componente || 'locacao', numero: p.numero, tipo: p.tipo, vencimento: p.vencimento, valor: Number(p.valor), metodo: p.metodo, status: p.status }));
  return (total > 0 || parcelas.length) ? { resumo, total, parcelas } : null;
}
function financeiroPedidoHtml(model){
  const f = model.financeiro;
  // model.pagamentosSlot: pedido digital (o link do pedido), a lista de pagamentos entra no lugar da programação
  if(!f || (!(f.total > 0) && !f.parcelas?.length)) return model.pagamentosSlot ? `<div class="cpj-order-financeiro">${model.pagamentosSlot}</div>` : '';
  const resumo = (f.resumo || []).filter(l => Number(l.valor) !== 0);
  const blocoResumo = `<section class="cpj-order-financeiro-resumo"><h2>Resumo do pedido</h2><dl>${resumo.map(l => `<div><dt>${esc(l.rotulo)}</dt><dd>${dinheiro.format(l.valor)}</dd></div>`).join('')}<div class="is-total"><dt>Total do pedido</dt><dd>${dinheiro.format(Number(f.total) || 0)}</dd></div></dl></section>`;
  const grupos = Object.keys(COMPONENTES_PAGAMENTO).map(c => [c, (f.parcelas || []).filter(p => (p.componente || 'locacao') === c)]).filter(([, ps]) => ps.length);
  const blocoParcelas = grupos.length ? `<section class="cpj-order-financeiro-parcelas"><h2>Programação de pagamento</h2><table class="cpj-order-pagamentos"><thead><tr><th scope="col">Parcela</th><th scope="col">Vencimento</th><th scope="col">Forma</th><th scope="col" class="cpj-order-valor-col">Valor</th></tr></thead>${grupos.map(([c, ps]) => `<tbody><tr class="cpj-order-pag-grupo"><th colspan="4" scope="rowgroup">${COMPONENTES_PAGAMENTO[c]} · ${dinheiro.format(ps.reduce((t, p) => t + p.valor, 0))}</th></tr>${ps.map((p, i) => `<tr><td>${esc(p.tipo && !/^parcela\s*\d*$/i.test(p.tipo) ? p.tipo : 'Parcela')} ${i + 1} de ${ps.length}</td><td>${esc(dataBr(p.vencimento))}</td><td>${esc(p.metodo || 'A combinar')}</td><td class="cpj-order-valor-col">${dinheiro.format(p.valor)}</td></tr>`).join('')}</tbody>`).join('')}</table></section>` : '';
  return `<div class="cpj-order-financeiro">${blocoResumo}${model.pagamentosSlot || blocoParcelas}${pagarPeloCelularHtml(model.pagamentoLink)}</div>`;
}
// QR do link de pagamento do pedido (out/2026): o cliente aponta a câmera, vê os pagamentos e gera o PIX de cada um
// (o código de acesso vai junto no QR). model.pagamentoLink = { url, urlCurta, pin, qr } (EasyLocLinkPagamento.paraDocumento).
function pagarPeloCelularHtml(link){
  if(!link?.qr) return '';
  return `<section class="cpj-order-pagar"><div class="cpj-order-pagar-qr"><img src="${esc(link.qr)}" alt="QR Code para pagar o pedido"></div><div class="cpj-order-pagar-txt"><span class="cpj-order-pagar-sobre">Pagamento por PIX</span><h2>Seu pedido no celular</h2><p>Aponte a câmera para o QR Code: você confere o pedido completo e, no final, faz os pagamentos pelo PIX, com o valor já preenchido.</p><p class="cpj-order-pagar-link">Ou acesse <span>${esc(link.urlCurta)}</span> com o código <b>${esc(link.pin)}</b></p></div></section>`;
}
function servicosPedidoHtml(model){
  const lista = model.servicos || [];
  if(!lista.length) return '';
  const total = lista.reduce((t, s) => t + s.quantidade * s.valor, 0);
  return `<section class="cpj-order-servicos"><h3>Serviços adicionais</h3><table class="cpj-order-table cpj-order-servicos-tabela"><tbody>${lista.map(s => `<tr><td class="cpj-order-qty">${s.quantidade}</td><td><strong>${esc(s.nome)}</strong>${s.data ? `<small class="cpj-order-servico-quando">${esc(s.data.split('-').reverse().join('/'))}${s.hora ? ' às ' + esc(s.hora) : ''}</small>` : ''}</td><td class="cpj-order-valor">${dinheiro.format(s.valor)}</td><td class="cpj-order-valor pa-valor-total"><b>${dinheiro.format(s.quantidade * s.valor)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td></td><td>Total dos serviços</td><td></td><td class="cpj-order-valor"><b>${dinheiro.format(total)}</b></td></tr></tfoot></table></section>`;
}
const dinheiro = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
// Valores em colunas próprias, na mesma linha do nome: reposição (por unidade), locação por unidade e total da linha.
const VALOR_COLS = 3;
const moeda = v => (v === null || v === undefined) ? '<span class="pa-sob-consulta">—</span>' : dinheiro.format(v);
function valoresTd(item, classe = 'pa-valor'){
  const pers = item.personalizacaoValor;
  const unitario = item.preco === null || item.preco === undefined ? null : item.preco + (pers || 0);
  const total = unitario === null ? null : unitario * item.quantidade;
  return `<td class="${classe}">${moeda(item.reposicao)}</td><td class="${classe}">${moeda(unitario)}${pers ? `<small class="pa-valor-pers">inclui ${dinheiro.format(pers)} de personalização</small>` : ''}</td><td class="${classe} pa-valor-total">${total === null ? '<span class="pa-sob-consulta">Sob consulta</span>' : `<b>${dinheiro.format(total)}</b>`}</td>`;
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
// Escolha da personalização na linha do item (só itens com personalização cadastrada; só na edição do pedido).
// Cartelas (out/2026): botão "Personalizar" abre a escolha da personalização e da opção da cartela (tecido, tinta...).
function personalizacaoHtml(item, editar){
  const opcoes = item.opcoesPersonalizacao || [];
  const escolha = textoEscolhas(item.personalizacaoEscolhas);
  const nome = esc(item.nomeCompleto || item.nome);
  const valor = item.personalizacaoValor ? ` · + ${dinheiro.format(item.personalizacaoValor)}/un.` : '';
  if(editar && item.personalizacaoId) return `<span class="pa-pers-chip"><span class="pa-pers-txt"><b>${esc(item.personalizacaoNome)}</b>${escolha ? ` — ${esc(escolha)}` : ''}${valor}</span><button type="button" class="pa-pers-trocar" data-cpj-personalizar aria-label="Trocar a personalização de ${nome}">Trocar</button><button type="button" class="pa-pers-tirar" data-cpj-personalizar-tirar aria-label="Tirar a personalização de ${nome}" title="Tirar a personalização">×</button></span>`;
  if(editar && opcoes.length) return `<button type="button" class="pa-pers-btn" data-cpj-personalizar aria-label="Personalizar ${nome}">✦ Personalizar</button>`;
  if(editar && item.personalizable) return `<button type="button" class="pa-pers-btn" data-customize-item="${esc(item.id)}" aria-label="Personalizar ${nome}">✦ Personalizar</button>`;
  return item.personalizacaoNome ? `<small class="pa-personalizacao-txt">Personalização: ${esc(item.personalizacaoNome)}${escolha ? ` — ${esc(escolha)}` : ''}</small>` : '';
}
function linhas(amb, ordenar = false, editar = false, qtdEditavel = editar){
  return amb.itens.map(item => {
    const remover = editar ? `<button type="button" class="cpj-icon-btn pa-remover" data-cpj="item-remover" aria-label="Excluir ${esc(item.nomeCompleto || item.nome)} do ambiente" title="Excluir item">×</button>` : '';
    const quantidade=`<td class="pa-quantidade">${qtdEditavel ? `<input class="pa-qtd-input" type="number" min="1" max="999" value="${item.quantidade}" data-cpj-qtd-input aria-label="Quantidade de ${esc(item.nomeCompleto || item.nome)}">` : `<b>${item.quantidade}</b>`}${remover}${ordenar ? '' : '<small>un.</small>'}</td>`;
    const nome=ordenar ? (item.nomeCompleto || item.nome) : item.nome;
    const observacao = editar
      ? `<textarea class="pa-item-observacao" data-cpj-item-observacao rows="1" maxlength="1000" aria-label="Observação de ${esc(nome)}" placeholder="Adicionar observação ao item (opcional)">${esc(item.observacao || '')}</textarea>`
      : item.observacao ? `<p class="pa-item-observacao-texto">${esc(item.observacao)}</p>` : '';
    // Componente em amarelo, só na tela de edição do pedido (pedido do usuário).
    const destaque = (editar || qtdEditavel) && /^componente$/i.test(String(item.tipo || '').trim()) ? ' class="pa-linha-componente"' : '';
    return `<tr${destaque} data-pa-item="${esc(item.id)}" data-pa-amb="${esc(amb.id)}"${editar || qtdEditavel ? ` data-cpj-item="${esc(item.id)}"` : ''}>
      ${ordenar ? `<td class="pa-ordem"><button type="button" data-pa-drag aria-label="Ordenar ${esc(nome)}. Use as setas para cima e para baixo." title="Arraste ou use ↑ e ↓">⠿</button></td>${quantidade}` : ''}
      <td class="pa-miniatura">${foto(item.foto)}</td><td class="pa-descricao"><strong>${esc(nome)}</strong>${item.medidas ? `<small class="pa-medidas">${esc(item.medidas)}</small>` : ""}${personalizacaoHtml(item, editar || qtdEditavel)}${!ordenar && item.categoria ? `<small>${esc(item.categoria)}</small>` : ''}${item.referencia ? `<small>Cód. ${esc(item.referencia)}</small>` : ''}${observacao}</td>${valoresTd(item)}
      ${ordenar ? '' : quantidade}</tr>`;
  }).join('');
}
function tabela(amb, ordenar = false){
  return amb.itens.length ? `<table class="pa-itens" aria-label="Itens de ${esc(amb.nome)}"><thead><tr>${ordenar?'<th scope="col"><span class="pa-sr">Ordenar</span></th><th scope="col" class="pa-quantidade">Qtd.</th>':''}<th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh()}${ordenar?'':'<th scope="col">Qtd.</th>'}</tr></thead><tbody>${linhas(amb,ordenar)}</tbody></table>` : '<p class="pa-vazio">Nenhum item neste ambiente.</p>';
}
// Títulos das colunas logo abaixo do nome de cada ambiente, em cima da 1ª linha (o <thead> fica só pra largura das colunas e
// leitores de tela — ver .pa-geral thead no CSS).
const COLHEAD_GERAL = `<tr class="pa-colhead" aria-hidden="true"><td></td><td class="pa-quantidade">Qtd.</td><td></td><td>Item</td><td class="pa-valor">Reposição</td><td class="pa-valor">Valor un.</td><td class="pa-valor">Total</td></tr>`;
// quantidade: campo de quantidade editável; moverAmbientes: alça no título pra arrastar o ambiente inteiro (aba Geral).
// vazios / acoesAmbiente / depoisTitulo: só no pedido comercial, que não tem mais as abas de ambiente — ambiente sem
// itens continua aparecendo, o título ganha renomear/excluir e as renderizações vêm depois dos itens (centralizadas).
export function geralHtml(model, { editar = false, titulos = true, quantidade = false, moverAmbientes = false, vazios = false, acoesAmbiente = null, depoisTitulo = null, fotoLado = null } = {}){
  const ambientes = model.ambientes.filter(amb=>vazios || amb.itens.length > 0);
  // fotoLado: foto (renderizações) do ambiente numa coluna à direita dos itens, na altura deles (pedido comercial).
  const COLS = 4 + VALOR_COLS + (fotoLado ? 1 : 0);
  const foto = (amb, linhas) => { if(!fotoLado) return ''; const h = fotoLado(amb); return `<td class="pa-foto-ambiente" rowspan="${linhas}">${h || '<span class="pa-foto-ambiente-vazia">Sem renderização deste ambiente</span>'}</td>`; };
  const extra = amb => { const h = depoisTitulo ? depoisTitulo(amb) : ''; return h ? `<tr class="pa-ambiente-extra"><td colspan="${COLS}">${h}</td></tr>` : ''; };
  return `<div class="pa-geral">
    ${!ambientes.length ? '<p class="pa-vazio">Este projeto ainda não possui itens adicionados.</p>' : `<table class="pa-itens" aria-label="Itens do projeto por ambiente">
      <thead><tr><th scope="col"><span class="pa-sr">Ordenar</span></th><th scope="col" class="pa-quantidade">Qtd.</th><th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh()}${fotoLado ? '<th scope="col" class="pa-foto-ambiente-col"><span class="pa-sr">Foto do ambiente</span></th>' : ''}</tr></thead>
      ${ambientes.map(amb=>`<tbody class="pa-grupo" aria-label="${esc(amb.nome)}" data-pa-grupo="${esc(amb.id)}">${titulos ? `<tr><td colspan="${fotoLado ? COLS - 1 : COLS}" class="pa-ambiente-titulo${moverAmbientes ? ' pa-ambiente-movel' : ''}">${moverAmbientes ? `<button type="button" class="pa-ambiente-alca" data-pa-drag-amb aria-label="Mover o ambiente ${esc(amb.nome)} com todos os itens. Use as setas para cima e para baixo." title="Arraste para mudar a ordem dos ambientes (ou use ↑ e ↓)">⠿</button>` : ''}<h3>${esc(amb.nome)}</h3>${acoesAmbiente ? acoesAmbiente(amb) : ''}</td>${fotoLado ? '<td class="pa-foto-ambiente-topo" aria-hidden="true"></td>' : ''}</tr>` : ''}${amb.itens.length ? (fotoLado ? COLHEAD_GERAL.replace(' aria-hidden="true">', '>').replace(/<td/g, '<td aria-hidden="true"').replace('</tr>', foto(amb, amb.itens.length + 1) + '</tr>') : COLHEAD_GERAL) + linhas(amb,true,editar,editar || quantidade) : `<tr class="pa-ambiente-vazio"><td colspan="${4 + VALOR_COLS}">Nenhum móvel neste ambiente ainda. Use o Catálogo (F2) ou ＋ Componente.</td>${foto(amb, 1)}</tr>`}${extra(amb)}</tbody>`).join('')}
    </table>`}
    <p class="pa-sr" data-pa-anuncio role="status" aria-live="polite"></p></div>`;
}
// Cabeçalho do pedido (pedido do usuário: "cabeçalho horizontal elegante ocupando toda a largura, com fundo na mesma cor
// do menu do catálogo... logo da Chiavari em branco à esquerda... à direita a foto circular da decoradora, DECORADOR
// SOLICITANTE, o nome, uma linha divisória vertical sutil e PRÉVIA DO PEDIDO"). A logo vira branca por CSS (filter), então
// serve qualquer arquivo. A da Chiavari é um PNG QUADRADO com muita margem transparente (a arte ocupa ~26% da altura): logo
// quadrada ganha .is-quadrada e é recortada na faixa do meio (object-fit:cover) — sem isso a arte sairia minúscula.
// Status do pedido ao lado da logo e número no lugar de "Prévia do pedido" (Comercial, out/2026). model.statusPedido =
// { chave: orcamento|pre_reserva|aprovado|finalizado|enviado|cancelado, ate: "AAAA-MM-DD" }; model.numero = número do pedido.
const STATUS_PEDIDO = { orcamento: "Orçamento", pre_reserva: "Pré-reserva", aprovado: "Reservado", finalizado: "Reservado", enviado: "Reservado", cancelado: "Cancelado" };
function statusPedidoHtml(st){
  if(!st?.chave || !STATUS_PEDIDO[st.chave]) return "";
  const ate = st.chave === "pre_reserva" && st.ate ? " até " + String(st.ate).slice(0, 10).split("-").reverse().join("/") : "";
  return '<span class="cpj-order-status is-' + esc(st.chave) + '"><i aria-hidden="true"></i>' + esc(STATUS_PEDIDO[st.chave] + ate) + '</span>';
}
function cabecalhoPedidoHtml(empresa, decorador, model = {}){
  const nome = empresa?.nome || 'Chiavari';
  const marca = empresa?.logo_url
    ? `<img class="cpj-order-logo" src="${esc(empresa.logo_url)}" alt="${esc(nome)}" onload="if(this.naturalWidth&amp;&amp;this.naturalWidth/this.naturalHeight&lt;1.6)this.classList.add('is-quadrada')">`
    : `<strong class="cpj-order-brand-name">${esc(nome)}</strong>`;
  const solicitante = decorador?.nome
    ? `<div class="cpj-order-requester">${decorador.logo_url ? `<img src="${esc(decorador.logo_url)}" alt="Foto de ${esc(decorador.nome)}">` : ''}<div><span>DECORADOR SOLICITANTE</span><strong>${esc(decorador.nome)}</strong></div></div><i class="cpj-order-divider" aria-hidden="true"></i>`
    : '';
  const tipo = model.numero ? `PEDIDO Nº ${esc(model.numero)}` : model.statusPedido ? "NOVO PEDIDO" : "PRÉVIA DO PEDIDO";
  return `<header class="cpj-order-letterhead"><div class="cpj-order-brand">${marca}${statusPedidoHtml(model.statusPedido)}</div><div class="cpj-order-letterhead-side">${solicitante}<span class="cpj-order-kind">${tipo}</span></div></header>`;
}

// Layout do pedido (out/2026, pedido do usuário): "final" = em pé, renderizações juntas no fim (o de sempre);
// model.semAviso: sem o card amarelo "Esta é uma prévia do pedido" (pedido do Comercial e Central — out/2026).
// "horizontal" = A4 deitado, a foto de cada ambiente ao lado dos itens dele. A última escolha fica lembrada no navegador.
export const LAYOUTS_PEDIDO = [['final', 'Fotos no final'], ['horizontal', 'Horizontal · fotos ao lado']];
export function layoutPedido(valor){
  if(valor === 'final' || valor === 'horizontal'){ try{ localStorage.setItem('pedido_layout_pdf', valor); }catch{} return valor; }
  try{ return localStorage.getItem('pedido_layout_pdf') === 'horizontal' ? 'horizontal' : 'final'; }catch{ return 'final'; }
}
const layoutSeletorHtml = (atual) => `<div class="cpj-order-layout" role="radiogroup" aria-label="Layout do pedido">${LAYOUTS_PEDIDO.map(([v, r]) => `<button type="button" role="radio" aria-checked="${v === atual}" data-pedido-layout="${v}">${r}</button>`).join('')}</div>`;
const linhaItemPedido = item => `<tr><td class="cpj-order-qty">${item.quantidade}</td><td class="cpj-order-photo">${foto(item.foto)}</td><td><strong>${esc(item.nomeCompleto || item.nome)}</strong>${item.medidas ? `<small class="pa-medidas">${esc(item.medidas)}</small>` : ""}${personalizacaoHtml(item, false)}${item.referencia ? `<small>Cód. ${esc(item.referencia)}</small>` : ''}${item.observacao ? `<p class="pa-item-observacao-texto">${esc(item.observacao)}</p>` : ''}</td>${valoresTd(item,'cpj-order-valor')}</tr>`;
const COLGROUP_PEDIDO = '<colgroup><col class="cpj-order-col-qty"><col class="cpj-order-col-photo"><col><col class="cpj-order-col-valor"><col class="cpj-order-col-valor"><col class="cpj-order-col-valor"></colgroup>';
const COLHEAD_PEDIDO = '<tr class="cpj-order-colhead" aria-hidden="true"><td>Qtd.</td><td></td><td>Item</td><td class="cpj-order-valor">Reposição</td><td class="cpj-order-valor">Valor un.</td><td class="cpj-order-valor">Total</td></tr>';
const fotoAmbientePedido = (amb, r) => `<figure><img src="${esc(r.url)}" alt="Renderização de ${esc(amb.nome)}" loading="lazy" decoding="async"><figcaption>${esc(r.nome)}${r.jogos > 1 ? ` · <b>${r.jogos} jogos</b>` : ''}</figcaption></figure>`;
// Horizontal: um bloco por ambiente — título em cima, tabela à esquerda e a(s) renderização(ões) à direita.
function ambientesHorizontalHtml(ambientes){
  return ambientes.map(amb => `<section class="cpj-order-amb${amb.imagens?.length ? ' has-foto' : ''}">
    <div class="cpj-order-amb-corpo"><div class="cpj-order-amb-lista"><h3 class="cpj-order-amb-nome">${esc(amb.nome)}</h3><table class="cpj-order-table">${COLGROUP_PEDIDO}<thead class="pa-sr"><tr><th scope="col">Qtd.</th><th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh('cpj-order-valor')}</tr></thead><tbody>${COLHEAD_PEDIDO}${amb.itens.map(linhaItemPedido).join('')}</tbody></table></div>
    ${amb.imagens?.length ? `<aside class="cpj-order-amb-fotos">${amb.imagens.map((r, i) => fotoAmbientePedido(amb, r, i)).join('')}</aside>` : ''}</div></section>`).join('');
}
export function pedidoPreviewHtml(model, { decorador = null, empresa = null, layout = null } = {}){
  const horizontal = (layout || layoutPedido()) === 'horizontal';
  const ambientes = model.ambientes.filter(a => a.itens.length);
  const total = ambientes.reduce((s,a) => s + a.itens.reduce((n,i) => n + i.quantidade,0),0);
  return `<article class="cpj-order-paper${horizontal ? ' is-horizontal' : ''}" aria-label="Prévia do pedido">
    ${cabecalhoPedidoHtml(empresa, decorador, model)}
    <!-- Out/2026 (pedido do usuário): o nome do cliente já está no cabeçalho (decorador solicitante), então aqui ficam só o
         local do evento em destaque e, abaixo, data do evento, entrega e coleta. Aviso de prévia no card amarelo à direita.
         Projeto do decorador: o nome dos noivos (diferente do decorador) continua, pequeno, acima do local. -->
    <div class="cpj-order-event">
      <div class="cpj-order-event-info">
        ${model.nome && model.nome !== decorador?.nome ? `<p class="cpj-order-event-cliente">${esc(model.nome)}</p>` : ''}
        <div class="cpj-order-local"><span>Local do evento</span><h2>${esc(model.local || 'Não informado')}</h2>${model.localEndereco ? `<p class="cpj-order-local-endereco">${esc(model.localEndereco)}</p>` : ''}</div>
        <dl class="cpj-order-datas">
          <div><dt>Data do evento</dt><dd>${esc(model.data ? [model.data, model.dataFim].filter(Boolean).map(dataBr).join(' a ') : '—')}</dd></div>
          <div><dt>Entrega</dt><dd>${esc(model.evento?.data_entrega ? dataBr(model.evento.data_entrega) + (model.evento.hora_entrega ? ' às ' + model.evento.hora_entrega : '') : '—')}</dd></div>
          <div><dt>Coleta</dt><dd>${esc(model.evento?.data_coleta ? dataBr(model.evento.data_coleta) + (model.evento.hora_coleta ? ' às ' + model.evento.hora_coleta : '') : '—')}</dd></div>
        </dl>
      </div>
      ${model.semAviso ? "" : `<aside class="cpj-order-notice" role="note"><span class="cpj-order-notice-icon" aria-hidden="true">i</span><div><strong>Esta é uma prévia do pedido</strong><p>Este arquivo reúne os itens escolhidos para o projeto. O pedido oficial será enviado pela nossa equipe comercial, com todas as disponibilidades e os serviços adicionais.</p></div></aside>`}
    </div>
    ${horizontal ? ambientesHorizontalHtml(ambientes) : `<table class="cpj-order-table">${COLGROUP_PEDIDO}<thead class="pa-sr"><tr><th scope="col">Qtd.</th><th scope="col"><span class="pa-sr">Foto</span></th><th scope="col">Item</th>${valoresTh('cpj-order-valor')}</tr></thead>
    ${ambientes.map(amb => `<tbody><tr class="cpj-order-environment"><th colspan="${3 + VALOR_COLS}" scope="rowgroup">${esc(amb.nome)}</th></tr>${COLHEAD_PEDIDO}${amb.itens.map(linhaItemPedido).join('')}</tbody>`).join('')}</table>`}
    <div class="cpj-order-paper-total"><span>${ambientes.length} ${ambientes.length === 1 ? 'ambiente' : 'ambientes'}</span><strong>${total} ${total === 1 ? 'item' : 'itens'}</strong></div>
    ${servicosPedidoHtml(model)}
    ${!horizontal && model.ambientes.some(a => a.imagens?.length) ? `<section class="cpj-order-renders"><h2>Renderizações do projeto</h2>${model.ambientes.filter(a => a.imagens?.length).map(amb => `<section class="cpj-order-render-group"><h3>${esc(amb.nome)}</h3><div>${amb.imagens.map(r => `<figure><img src="${esc(r.url)}" alt="Renderização de ${esc(amb.nome)}" loading="lazy" decoding="async"></figure>`).join('')}</div></section>`).join('')}</section>` : ''}
    ${plantasPedidoHtml(model, horizontal)}
    ${financeiroPedidoHtml(model)}
  </article>`;
}
// Planta do evento (com as legendas das fotos), antes do resumo e das parcelas — out/2026. model.plantas vem pronto
// (cópia estática da planta inteira feita no catálogo: { nome, w, h, html } com w/h em mm, na proporção da folha).
// Na tela cabe na largura do papel (--zt); na impressão cada planta vai para uma página só dela (A4 deitado ou em pé,
// conforme a planta) e cresce até ocupar a página toda (--zp), sem passar da altura.
function plantasPedidoHtml(model, horizontal){
  const plantas = (model.plantas || []).filter(p => p?.html && p.w && p.h);
  if(!plantas.length) return '';
  const [tw, th] = horizontal ? [269, 170] : [182, 250];
  return `<section class="cpj-order-plantas">${plantas.map(p => {
    const deitada = p.w >= p.h;
    const [pw, ph] = deitada ? [281, 182] : [194, 268];
    const zt = Math.min(1, tw / p.w, th / p.h).toFixed(4), zp = Math.min(pw / p.w, ph / p.h).toFixed(4);
    return `<figure class="cpj-order-planta${deitada ? ' is-deitada' : ' is-em-pe'}"><h2>${esc(plantas.length > 1 ? p.nome : 'Planta do evento')}</h2><div class="cpj-order-planta-folha" style="width:${p.w}mm;height:${p.h}mm;--zt:${zt};--zp:${zp}">${p.html}</div></figure>`;
  }).join('')}</section>`;
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
export async function imprimirPedido(model, { decorador = null, empresa = null, observacao = '', layout = null } = {}){
  const css = new URL('./catalogo-projetos.css?v=20261030-link-pagamento2',import.meta.url).href;
  // Decorador com os valores ocultos (botão do olho no catálogo): o PDF sai sem as colunas de valores.
  const semValores = document.documentElement.classList.contains('catalogo-sem-valores');
  const horizontal = (layout || layoutPedido()) === 'horizontal';
  // Topo das páginas sem margem do papel (out/2026): a impressão do navegador (Edge/Chrome) às vezes ignora @page:first e
  // descia a faixa escura ~1cm na 1ª página. Agora toda página tem margem 0 em cima; nas seguintes, o respiro vem do
  // cabeçalho da tabela repetido (em pé) ou do espaço no começo de cada ambiente (deitado).
  // Horizontal: A4 deitado; cada ambiente tenta caber inteiro na página (foto ao lado da tabela), e a foto nunca passa da altura útil.
  const estilosHorizontal = horizontal ? `@page{size:A4 landscape;margin:0 0 10mm}.cpj-order-amb{padding-top:3mm}.cpj-order-amb{break-inside:avoid-page}.cpj-order-amb-nome{break-after:avoid}` : '';
  const estilos = `@page{size:A4 portrait;margin:0 0 12mm}.cpj-order-table thead.pa-sr{position:static;width:auto;height:auto;overflow:visible;clip-path:none}.cpj-order-table thead.pa-sr th{height:10mm;padding:0;border:0;font-size:0;line-height:0}.cpj-order-render-group,.cpj-order-financeiro{padding-top:6mm}@page plantaDeitada{size:A4 landscape;margin:6mm 0}@page plantaEmPe{size:A4 portrait;margin:6mm 0}.cpj-order-planta.is-deitada{page:plantaDeitada}.cpj-order-planta.is-em-pe{page:plantaEmPe}.cpj-order-paper .cpj-order-planta{margin:0 -6mm;padding:0;break-after:page}.cpj-order-planta h2{margin:0 0 3mm;font-size:13pt}.cpj-order-planta-folha{zoom:var(--zp)!important;box-shadow:none!important}body{margin:0;font-family:Arial,sans-serif;color:#34352f}.cpj-order-paper{padding:0 14mm;box-shadow:none}.cpj-order-paper .cpj-order-letterhead{margin:0 -14mm;padding:9mm 14mm}.cpj-order-notes{padding:0 14mm}.cpj-order-table thead{display:table-header-group}.cpj-order-table tr,figure,.cpj-order-requester{break-inside:avoid}.cpj-order-render-group{break-inside:auto}.cpj-order-render-group>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5mm}.cpj-order-render-group figure{margin:0}.cpj-order-render-group figure:first-child{grid-column:auto}.cpj-order-renders{break-before:auto}.cpj-order-renders>h2,.cpj-order-render-group h3{break-after:avoid}.cpj-order-notes{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:24px;font-size:12px;line-height:1.6}.pa-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}*{print-color-adjust:exact}${estilosHorizontal}`;
  const html = `<!doctype html><html lang="pt-BR"${semValores ? ' class="catalogo-sem-valores"' : ''}><head><meta charset="utf-8"><title>${esc(model.nome)} — Pedido Chiavari</title><link rel="stylesheet" href="${esc(css)}"><style>${estilos}${semValores ? 'html.catalogo-sem-valores :is(.pa-valor,.cpj-order-valor,.cpj-order-col-valor){display:none!important}' : ''}</style></head><body>${pedidoPreviewHtml(model,{decorador,empresa,layout:horizontal ? "horizontal" : "final"})}${observacao.trim() ? `<section class="cpj-order-notes"><strong>Observação para a equipe</strong><p>${esc(observacao.trim())}</p></section>` : ''}</body></html>`;
  return imprimirDocumento(html);
}
// A mesma janela "Ver pedido" do catálogo (fundo cinza, papel com a faixa escura, Baixar PDF e Fechar), para quem não usa
// o abrirModal de catalogo-projetos.mjs: Central de Pedidos e a "Lista Completa" do pedido comercial (out/2026). Precisa
// de catalogo-projetos.css carregado na página.
// extra: HTML de botões a mais no rodapé; onMount({ dialog, atualizar }) — atualizar(model) redesenha a prévia (e o PDF
// passa a usar o model novo), usado pelo "Renderizar projeto com IA" da Lista Completa.
// flutuante: aberta pela Helena — sem travar a tela (a conversa e a barra dela continuam usáveis por cima pra pedir "fecha o pedido").
// Liga os botões "Fotos no final" / "Horizontal" de uma janela de pedido: grava a escolha e redesenha a prévia.
export function ligarSeletorLayout(raiz, redesenhar){
  raiz.querySelectorAll('[data-pedido-layout]').forEach(botao => botao.addEventListener('click', () => {
    const valor = layoutPedido(botao.dataset.pedidoLayout);
    raiz.querySelectorAll('[data-pedido-layout]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pedidoLayout === valor)));
    redesenhar(valor);
  }));
}
export { layoutSeletorHtml };
export function abrirVisualizacaoPedido({ titulo = 'Pedido', model, decorador = null, empresa = null, observacao = '', extra = '', onMount = null, flutuante = false }){
  const dialog = document.createElement('dialog');
  dialog.className = 'cpj-modal is-wide cpj-order-preview' + (flutuante ? ' is-flutuante' : '');
  dialog.innerHTML = `<form class="cpj-modal-form" method="dialog" novalidate>
    <header><h3>${esc(titulo)}</h3>${layoutSeletorHtml(layoutPedido())}</header>
    <div class="cpj-modal-body">${pedidoPreviewHtml(model, { decorador, empresa })}</div>
    <p class="cpj-modal-error" role="alert" hidden></p>
    <footer><button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-link" data-pedido-pdf>Baixar PDF</button>${extra}<button type="button" class="cpj-btn cpj-btn-ghost" data-pedido-fechar>Fechar</button></footer>
  </form>`;
  document.body.appendChild(dialog);
  const erro = dialog.querySelector('.cpj-modal-error');
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', event => { if(event.target === dialog) dialog.close(); });
  dialog.querySelector('[data-pedido-fechar]').addEventListener('click', () => dialog.close());
  ligarSeletorLayout(dialog, () => { const corpo = dialog.querySelector('.cpj-modal-body'); if(corpo) corpo.innerHTML = pedidoPreviewHtml(model, { decorador, empresa }); });
  dialog.querySelector('[data-pedido-pdf]').addEventListener('click', async event => {
    const botao = event.currentTarget;
    botao.disabled = true; botao.textContent = 'Preparando PDF…'; erro.hidden = true;
    try{ await imprimirPedido(model, { decorador, empresa, observacao }); }
    catch(error){ erro.textContent = error?.message || 'Não foi possível gerar o PDF.'; erro.hidden = false; }
    finally{ botao.disabled = false; botao.textContent = 'Baixar PDF'; }
  });
  onMount?.({ dialog, atualizar(novo){ model = novo; const corpo = dialog.querySelector('.cpj-modal-body'); if(corpo) corpo.innerHTML = pedidoPreviewHtml(model, { decorador, empresa }); } });
  if(flutuante){
    const esc = (event) => { if(event.key === 'Escape' && dialog.open) dialog.close(); };
    document.addEventListener('keydown', esc);
    dialog.addEventListener('close', () => document.removeEventListener('keydown', esc));
    dialog.show();
  }else dialog.showModal();
  return dialog;
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

// Ambientes inteiros (aba Geral): arrastar pela alça do título move o bloco com todos os itens. onMove(origem, destino, depois).
export function moverAmbiente(ambientes, origem, destino, depois){
  if(origem === destino) return false;
  const de = ambientes.findIndex(a => String(a.id) === String(origem));
  if(de < 0 || ambientes.findIndex(a => String(a.id) === String(destino)) < 0) return false;
  const [bloco] = ambientes.splice(de, 1);
  const alvo = ambientes.findIndex(a => String(a.id) === String(destino));
  ambientes.splice(depois ? alvo + 1 : alvo, 0, bloco);
  return true;
}
export function bindOrdenacaoAmbientes(host, onMove){
  if(!host) return;
  let drag = null;
  const limpar = () => host.querySelectorAll('.pa-grupo-destino-antes,.pa-grupo-destino-depois').forEach(g => g.classList.remove('pa-grupo-destino-antes','pa-grupo-destino-depois'));
  host.addEventListener('pointerdown', event => {
    const alca = event.target.closest('[data-pa-drag-amb]'); if(!alca || event.button !== 0) return;
    event.preventDefault();
    const grupo = alca.closest('[data-pa-grupo]');
    drag = { alca, grupo, pointer: event.pointerId, alvo: null, depois: false };
    alca.setPointerCapture(event.pointerId); grupo.classList.add('pa-grupo-arrastando');
  });
  host.addEventListener('pointermove', event => {
    if(!drag) return;
    event.preventDefault();
    const alvo = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pa-grupo]');
    limpar();
    drag.alvo = alvo && alvo !== drag.grupo ? alvo : null;
    if(drag.alvo){ const r = drag.alvo.getBoundingClientRect(); drag.depois = event.clientY > r.top + r.height / 2; drag.alvo.classList.add(drag.depois ? 'pa-grupo-destino-depois' : 'pa-grupo-destino-antes'); }
    if(event.clientY < 90) window.scrollBy(0, -22);
    if(event.clientY > innerHeight - 70) window.scrollBy(0, 22);
  });
  const fim = event => {
    if(!drag) return; const d = drag; drag = null;
    d.grupo.classList.remove('pa-grupo-arrastando'); limpar();
    if(d.alca.hasPointerCapture(d.pointer)) d.alca.releasePointerCapture(d.pointer);
    if(event.type === 'pointerup' && d.alvo) onMove(d.grupo.dataset.paGrupo, d.alvo.dataset.paGrupo, d.depois);
  };
  host.addEventListener('pointerup', fim); host.addEventListener('pointercancel', fim);
  host.addEventListener('keydown', event => {
    if(!event.target.matches('[data-pa-drag-amb]') || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const grupo = event.target.closest('[data-pa-grupo]');
    const outro = event.key === 'ArrowUp' ? grupo.previousElementSibling : grupo.nextElementSibling;
    if(outro?.matches('[data-pa-grupo]')) onMove(grupo.dataset.paGrupo, outro.dataset.paGrupo, event.key === 'ArrowDown');
  });
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
