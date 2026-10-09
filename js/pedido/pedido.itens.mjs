import { parseCurrency, formatCurrency } from "./pedido.utils.mjs";
import { iniciarEntradaComercial } from "./pedido.entrada.mjs";

export function initItens({ supabase, els }){

function avisar(mensagem, titulo = "Atenção", tipo = "aviso"){
if(typeof window.alerta === "function"){
window.alerta(mensagem, titulo, tipo);
return;
}
alert(mensagem);
}

const {
  tbody,
  addItemBtn,
  addComponenteBtn,
  addEspacoBtn,
  addPersonalizacaoBtn,
  addServicoBtn,
  modalComponente,
} = els;

/* =====================================================
   ADICIONAR COMPONENTE
===================================================== */

/* =====================================================
   ADICIONAR COMPONENTE
===================================================== */
function adicionarComponente() {

  const valorUnitarioOficial = 0;
  const valorReposicaoOficial = 0;

  const tr = document.createElement("tr");
  tr.classList.add("item-row", "item-componente");

  tr.dataset.valorUnitario = valorUnitarioOficial;
  tr.dataset.valorReposicao = valorReposicaoOficial;
  tr.dataset.volume = 0;

  tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
  </div>
</td>

<td class="qtd" contenteditable="true">1</td>

<td>
  <div class="foto-item"></div>
</td>

<td>
  <div class="item-autocomplete-wrapper">
    <div class="nome-item" contenteditable="true" data-placeholder="Preencha o nome do componente"></div>
    <div class="item-autocomplete-list"></div>
  </div>
</td>

<td class="valor valor-unitario">
  ${formatCurrency(valorUnitarioOficial)}
</td>

<td class="valor">
  <input 
    type="number"
    class="input-desconto"
    value="0"
    min="0"
    max="100"
    step="1"
  >
</td>

<td class="valor valor-total">
  R$ 0,00
</td>

<td class="valor valor-reposicao">
  ${formatCurrency(valorReposicaoOficial)}
</td>
  `;

  tbody.appendChild(tr);

  const qtd = tr.querySelector(".qtd");
  const desconto = tr.querySelector(".input-desconto");

  qtd.addEventListener("input", () => recalcularLinha(tr));
  desconto.addEventListener("input", () => recalcularLinha(tr));

  bindAutocompleteItem(tr, "Componente");
  bindRemover(tr);
  recalcularLinha(tr);
}

/* =====================================================
   BIND COMPONENTE (SPA SAFE)
===================================================== */

setTimeout(() => {

  const btn = document.getElementById("addComponenteBtn");
  const modal = document.getElementById("modalConfirmarComponente");

  if(!btn){
    console.warn("❌ Botão componente não encontrado");
    return;
  }

  btn.onclick = function(e){
    e.preventDefault();
    e.stopPropagation();

    if(modal){
      modal.classList.remove("hidden");
      modal.classList.add("ativo");
      return;
    }

    adicionarComponente();
  };

  window.fecharModalComponente = function () {
    if(modal){
      modal.classList.remove("ativo");
      modal.classList.add("hidden");
    }
  };

  window.confirmarAdicionarComponente = function () {
    if(modal){
      modal.classList.remove("ativo");
      modal.classList.add("hidden");
    }
    adicionarComponente();
  };

}, 300);
  /* =====================================================
     RESUMO + VOLUME
===================================================== */
function atualizarResumo() {

  /* =========================
     LOCAÇÃO
  ========================= */

  let locacaoBruta = 0;
  let customizacoes = 0;
  let servicos = 0;

  document.querySelectorAll("#listaItens tr.item-row").forEach(tr => {

    const totalEl = tr.querySelector(".valor-total");
    if(!totalEl) return;

    const valor = parseCurrency(totalEl.innerText);

    if(tr.classList.contains("item-personalizacao")){

      customizacoes += valor;

    } else if(tr.classList.contains("item-servico")){

      servicos += valor;

    } else {

      locacaoBruta += valor;

    }

  });

  const descontoLocacao = 0;
  const locacaoFinal = locacaoBruta - descontoLocacao;

  /* =========================
     FRETE
  ========================= */

  const freteBruto = Number(window.__FRETE_BRUTO || 0);
  const freteDesconto = Number(window.__FRETE_DESCONTO || 0);
  const freteFinal = Number(window.__FRETE_FINAL || 0);

  /* =========================
     MONTAGEM
  ========================= */

  const montagemBruta = Number(window.__MONTAGEM_BRUTA || 0);
  const montagemDesconto = Number(window.__MONTAGEM_DESCONTO || 0);
  const montagemFinal = Number(window.__MONTAGEM_FINAL || 0);

  /* =========================
     UI
  ========================= */

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = formatCurrency(value);
  };

  set("resumoLocacaoBruto", locacaoBruta);
  set("resumoLocacaoDesconto", -descontoLocacao);

  set("resumoCustomizacoes", customizacoes);

  set("resumoFreteBruto", freteFinal);
  set("resumoFreteDesconto", -freteDesconto);
  set("logisticaDescontoCaminhao", -freteDesconto);
  set("logisticaTotalOperacao", freteFinal + montagemFinal);

  set("resumoMontagemBruto", montagemFinal);
  set("resumoMontagemDesconto", -montagemDesconto);

  set("resumoServicos", servicos);

  /* =========================
     TOTAL
  ========================= */

  const total =
    locacaoFinal +
    customizacoes +
    freteFinal +
    montagemFinal +
    servicos;

const totalFinalPedido = total > 0 ? total : 0;

set("resumoTotalGeral", totalFinalPedido);

/* 🔥 SALVA GLOBAL */
window.__TOTAL_PEDIDO = totalFinalPedido;

/* 🔥 DISPARA PAGAMENTO */
window.atualizarPagamento?.();
}

function calcularVolumeTotalPedido(){

  let volumeTotal = 0;

  document.querySelectorAll("#listaItens tr.item-row").forEach(tr => {

    /* SERVIÇOS NÃO GERAM VOLUME */

    if(tr.classList.contains("item-servico")) return;

    const qtdEl = tr.querySelector(".qtd");
    const volumeUnit = parseFloat(tr.dataset.volume) || 0;
    const qtd = parseFloat(qtdEl?.innerText) || 0;

    volumeTotal += qtd * volumeUnit;

  });

  volumeTotal = parseFloat(volumeTotal.toFixed(2));

  const volumeEl = document.getElementById("freteVolumeTotal");

  if(volumeEl){
    volumeEl.innerText = volumeTotal + " m³";
  }

  /* =====================================================
     SALVA VOLUME GLOBAL
  ===================================================== */

  window.volumeTotalPedido = volumeTotal;

  /* =====================================================
     RECALCULA FRETE
  ===================================================== */

  if (window.kmPedido != null) {
    window.calcularFreteInteligente?.();
  }

  /* =====================================================
     RECALCULA SERVIÇOS
  ===================================================== */

  window.recalcularServicosPedido?.();

}

  function recalcularLinha(tr){
    const qtdEl = tr.querySelector(".qtd");
    const descontoEl = tr.querySelector(".input-desconto");
    const totalEl = tr.querySelector(".valor-total");

    if(!qtdEl || !totalEl) return;

    const quantidade = parseFloat(qtdEl.innerText) || 0;
    const valorUnit = parseFloat(tr.dataset.valorUnitario) || 0;
    const descontoPercent = descontoEl ? (parseFloat(descontoEl.value) || 0) : 0;

    const subtotal = quantidade * valorUnit;
    const valorDesconto = subtotal * (descontoPercent / 100);
    const totalFinal = subtotal - valorDesconto;

    totalEl.innerText = formatCurrency(totalFinal > 0 ? totalFinal : 0);

    atualizarResumo();
    calcularVolumeTotalPedido();
  }

  function bindRemover(tr) {
    const btn = tr.querySelector(".btn-remover-item");
    if (!btn) return;

    btn.addEventListener("click", function () {
      tr.remove();
      atualizarResumo();
      calcularVolumeTotalPedido();
    });
  }

  /* =====================================================
     AUTOCOMPLETE ITENS
  ===================================================== */
  function limparListaItens(listEl){
    if(!listEl) return;
    listEl.innerHTML = "";
    listEl.style.display = "none";
  }

  function escapeHtml(value = ""){
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatarDescricao(texto){
    if(!texto) return "";

    const index = texto.indexOf("(L)");
    if(index === -1) return escapeHtml(texto);

    const titulo = texto.substring(0, index).trim();
    const medidas = texto.substring(index).trim();

    return `
      <div class="item-nome-titulo">${escapeHtml(titulo)}</div>
      <div class="item-nome-medidas">${escapeHtml(medidas)}</div>
    `;
  }

  function toDateOnly(value){
    if(!value) return "";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function selectedDate(){
    return document.getElementById("dataEvento")?.value
      || document.getElementById("dataEntrega")?.value
      || "";
  }

  function isDateInsidePedido(pedido = {}){
    const base = selectedDate();
    if(!base) return true;
    const alvo = toDateOnly(base);
    const inicio = toDateOnly(pedido.data_entrega || pedido.data_evento || pedido.data_hora);
    const fim = toDateOnly(pedido.data_coleta || pedido.data_evento || pedido.data_hora);
    if(!inicio && !fim) return true;
    return alvo >= (inicio || fim) && alvo <= (fim || inicio);
  }

  function isReservaAtiva(pedido = {}){
    const comercial = String(pedido.status_comercial || "").toLowerCase();
    const operacional = String(pedido.status || "").toLowerCase();
    return !["orcamento", "cancelado"].includes(comercial) && operacional !== "cancelado";
  }

  function calcularDisponibilidadeItem(item = {}, reservas = []){
    const totalEstoque = Number(item.estoque_total || 0);
    const totalManutencao = Number(item.estoque_manutencao || item.estoque_indisponivel || 0);
    const totalReservado = reservas.reduce((acc, reserva) => {
      const pedido = reserva.separacoes_pedidos || {};
      if(!isReservaAtiva(pedido) || !isDateInsidePedido(pedido)) return acc;
      return acc + Number(reserva.quantidade_solicitada || 0);
    }, 0);

    return Math.max(0, totalEstoque - totalReservado - totalManutencao);
  }

  function formatarQuantidadeDisponivel(value){
    const numero = Number(value || 0);
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2
    }).format(numero);
  }

  async function anexarDisponibilidadeAosItens(itens = [], empresaId){
    if(!itens.length || !empresaId || !supabase) return itens;

    const ids = itens.map((item) => item.id).filter(Boolean);
    if(!ids.length){
      return itens.map((item) => ({
        ...item,
        disponibilidade_busca: calcularDisponibilidadeItem(item)
      }));
    }

    const { data, error } = await supabase
      .from("separacoes_itens")
      .select("item_id, quantidade_solicitada, separacoes_pedidos(data_evento, data_hora, data_entrega, data_coleta, status, status_comercial)")
      .eq("empresa_id", empresaId)
      .in("item_id", ids)
      .limit(1000);

    if(error){
      console.warn("Disponibilidade dos itens indisponivel:", error);
      return itens.map((item) => ({
        ...item,
        disponibilidade_busca: calcularDisponibilidadeItem(item)
      }));
    }

    const reservasPorItem = new Map();
    (data || []).forEach((reserva) => {
      const key = reserva.item_id;
      if(!reservasPorItem.has(key)) reservasPorItem.set(key, []);
      reservasPorItem.get(key).push(reserva);
    });

    return itens.map((item) => ({
      ...item,
      disponibilidade_busca: calcularDisponibilidadeItem(item, reservasPorItem.get(item.id) || [])
    }));
  }

  function renderizarListaItens(listEl, itens, onPick){
    if(!listEl) return;

    if(!itens || !itens.length){
      listEl.innerHTML = `
        <div class="item-autocomplete-empty">
          Nenhum item encontrado
        </div>
      `;
      listEl.style.display = "block";
      return;
    }

    listEl.innerHTML = "";

    itens.forEach(it => {
      const div = document.createElement("div");
      div.className = "item-autocomplete-item";
      const nome = it.descricao_total || it.produto || "-";
      const foto = it.foto_url || "";
      const disponivel = Number(it.disponibilidade_busca ?? 0);
      const disponivelTexto = formatarQuantidadeDisponivel(disponivel);
      const badgeClass = disponivel > 0 ? "is-available" : "is-unavailable";
      const badgeText = disponivel > 0 ? `${disponivelTexto} disponivel` : "Indisponivel";
      div.innerHTML = `
        <div class="item-autocomplete-thumb">
          ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nome)}">` : `<span>Sem foto</span>`}
        </div>
        <div class="item-autocomplete-info">
          <div class="item-autocomplete-name">
            ${formatarDescricao(nome)}
          </div>
          <div class="item-autocomplete-meta">
            <span>${it.codigo ? `Cod: ${escapeHtml(it.codigo)}` : "Sem codigo"}</span>
            <em class="item-autocomplete-stock ${badgeClass}">${escapeHtml(badgeText)}</em>
          </div>
        </div>
      `;

      div.addEventListener("click", () => onPick(it));
      listEl.appendChild(div);
    });

    listEl.style.display = "block";
  }

  function aplicarItemNaLinha(tr, it){
    if(!tr || !it) return;

    tr.dataset.itemId = it.id;
    tr.dataset.codigoItem = it.codigo || "";
    tr.dataset.valorUnitario = Number(it.valor_locacao || 0);
    tr.dataset.valorReposicao = Number(it.valor_reposicao || 0);
    tr.dataset.volume = Number(it.volume_cubico || 0);

    const nomeEl = tr.querySelector(".nome-item");
    if(nomeEl){
      nomeEl.innerHTML = formatarDescricao(
        it.descricao_total || it.produto || ""
      );
    }

    const unitEl = tr.querySelector(".valor-unitario");
    if(unitEl) unitEl.innerText = formatCurrency(tr.dataset.valorUnitario);

    const repEl = tr.querySelector(".valor-reposicao");
    if(repEl) repEl.innerText = formatCurrency(tr.dataset.valorReposicao);

    const fotoBox = tr.querySelector(".foto-item");
    if(fotoBox){
      if(it.foto_url){
        fotoBox.innerHTML = `<img src="${escapeHtml(it.foto_url)}" alt="">`;
      } else {
        fotoBox.innerHTML = "";
      }
    }

    recalcularLinha(tr);

    const listEl = tr.querySelector(".item-autocomplete-list");
    limparListaItens(listEl);
  }

  let timeoutBuscaItem;

  function bindAutocompleteItem(tr, tipoFiltro){
    const nomeEl = tr.querySelector(".nome-item");
    const listEl = tr.querySelector(".item-autocomplete-list");
    if(!nomeEl || !listEl) return;

    nomeEl.addEventListener("input", () => {
      const termo = (nomeEl.innerText || "").trim();

      clearTimeout(timeoutBuscaItem);

      if(termo.length < 2){
        limparListaItens(listEl);
        return;
      }

      timeoutBuscaItem = setTimeout(async () => {

        const empresaId = window.__CONTEXT?.empresa_id;
        if(!empresaId){
          console.warn("empresa_id não encontrado no contexto.");
          return;
        }

        const busca = termo.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
        if(busca.length < 2){
          limparListaItens(listEl);
          return;
        }

        const { data, error } = await supabase
          .from("itens")
          .select("id, codigo, produto, descricao_total, valor_locacao, valor_reposicao, volume_cubico, foto_url, estoque_total, estoque_manutencao, estoque_indisponivel")
          .eq("empresa_id", empresaId)
          .eq("ativo", true)
          .eq("tipo", tipoFiltro)
          // "Locar somente no kit": o item não pode ser adicionado avulso a um
          // pedido — só pode aparecer como componente de um kit já montado.
          // Kits em si (tipo="Kit") sempre têm locar_somente_kit=false, então
          // esse filtro não os afeta.
          .eq("locar_somente_kit", false)
          .or(`descricao_total.ilike.%${busca}%,produto.ilike.%${busca}%,codigo.ilike.%${busca}%`)
          .limit(12);

        if(error){
          console.error("Erro ao buscar itens:", error);
          return;
        }

        const itensComDisponibilidade = await anexarDisponibilidadeAosItens(data || [], empresaId);
        renderizarListaItens(listEl, itensComDisponibilidade, (it) => aplicarItemNaLinha(tr, it));

      }, 250);
    });

    document.addEventListener("click", (e) => {
      if(!e.target.closest(".item-autocomplete-wrapper")){
        limparListaItens(listEl);
      }
    });
  }

  /* =====================================================
     ADICIONAR ITEM
  ===================================================== */
  addItemBtn.addEventListener("click", function () {

    const valorUnitarioOficial = 0;
    const valorReposicaoOficial = 0;

    const tr = document.createElement("tr");
    tr.classList.add("item-row");

    tr.dataset.valorUnitario = valorUnitarioOficial;
    tr.dataset.valorReposicao = valorReposicaoOficial;
    tr.dataset.volume = 0;

    tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
</td>

<td class="qtd" contenteditable="true">1</td>

<td>
  <div class="foto-item"></div>
</td>

<td>
  <div class="item-autocomplete-wrapper">
    <div class="nome-item" contenteditable="true" data-placeholder="Preencha o nome do item"></div>
    <div class="item-autocomplete-list"></div>
  </div>
</td>

<td class="valor valor-unitario">
  ${formatCurrency(valorUnitarioOficial)}
</td>

<td class="valor">
  <input 
    type="number"
    class="input-desconto"
    value="0"
    min="0"
    max="100"
    step="1"
  >
</td>

<td class="valor valor-total">
  R$ 0,00
</td>

<td class="valor valor-reposicao">
  ${formatCurrency(valorReposicaoOficial)}
</td>
    `;

    tbody.appendChild(tr);

    const qtd = tr.querySelector(".qtd");
    const desconto = tr.querySelector(".input-desconto");

    qtd.addEventListener("input", () => recalcularLinha(tr));
    desconto.addEventListener("input", () => recalcularLinha(tr));

    bindAutocompleteItem(tr, "Item");
    bindRemover(tr);
    recalcularLinha(tr);

  });


  // Vitrine comercial integrada ?s linhas e c?lculos existentes do pedido.
  const vitrine = document.createElement('section');
  vitrine.className='pedido-vitrine';
  vitrine.innerHTML='<div class="vitrine-cabecalho"><span>ACERVO PARA O SEU EVENTO</span><h2>Escolha as pe?as do pedido</h2><p>Explore o acervo e adicione as quantidades ? sua sele??o.</p></div><div class="vitrine-filtros"><input type="search" placeholder="Pesquisar nome ou c?digo" aria-label="Pesquisar produtos"><select aria-label="Categoria"><option value="">Todas as categorias</option></select><button type="button" class="vitrine-atualizar">Atualizar disponibilidade</button></div><div class="vitrine-grade" aria-live="polite"></div><div class="vitrine-paginacao"><button type="button">Anterior</button><span></span><button type="button">Pr?xima</button></div>';
  document.querySelector('.pedido-items-panel')?.before(vitrine);
  const grade=vitrine.querySelector('.vitrine-grade'),busca=vitrine.querySelector('input'),categoria=vitrine.querySelector('select'),pag=vitrine.querySelector('.vitrine-paginacao');
  let pagina=0,sequencia=0,timerVitrine;
  async function carregarVitrine(){
    const seq=++sequencia,empresa=window.__CONTEXT?.empresa_id;
    if(!empresa){grade.innerHTML='<p>Entre na empresa para visualizar o acervo.</p>';return;}
    grade.innerHTML='<p>Carregando acervo...</p>';
    let consulta=supabase.from('itens').select('id,codigo,produto,descricao_total,valor_locacao,valor_reposicao,volume_cubico,foto_url,estoque_total,estoque_manutencao,estoque_indisponivel,categoria').eq('empresa_id',empresa).eq('ativo',true).eq('tipo','Item').eq('locar_somente_kit',false).order('produto').range(pagina*12,pagina*12+12);
    const termo=busca.value.replace(/[%_,()]/g,' ').trim();
    if(termo)consulta=consulta.or('produto.ilike.%'+termo+'%,descricao_total.ilike.%'+termo+'%,codigo.ilike.%'+termo+'%');
    if(categoria.value)consulta=consulta.eq('categoria',categoria.value);
    const {data,error}=await consulta;if(seq!==sequencia)return;
    if(error){grade.innerHTML='<p>N?o foi poss?vel carregar o acervo. Tente atualizar.</p>';return;}
    const temProxima=(data || []).length>12;
    const itens=await anexarDisponibilidadeAosItens((data || []).slice(0,12),empresa);if(seq!==sequencia)return;
    grade.innerHTML=itens.length?itens.map((it,index)=>'<article class="vitrine-produto"><div class="vitrine-foto">'+(it.foto_url?'<img loading="lazy" src="'+escapeHtml(it.foto_url)+'" alt="'+escapeHtml(it.produto || '')+'">':'<span>Sem foto</span>')+'<span class="vitrine-codigo">'+escapeHtml(it.codigo || '')+'</span></div><div class="vitrine-produto-info"><h3>'+escapeHtml(it.produto || it.descricao_total || 'Item')+'</h3><div class="vitrine-preco"><strong>'+formatCurrency(it.valor_locacao || 0)+'</strong><small>'+formatarQuantidadeDisponivel(it.disponibilidade_busca || 0)+' dispon?veis</small></div><div class="vitrine-selecionar"><input type="number" min="1" step="1" value="1" aria-label="Quantidade de '+escapeHtml(it.produto || 'item')+'"><button type="button" data-index="'+index+'">Adicionar</button></div></div></article>').join(''):'<p>Nenhum item encontrado para esta pesquisa.</p>';
    grade.querySelectorAll('button').forEach(button=>button.onclick=()=>{
      const it=itens[Number(button.dataset.index)],qtd=Number(button.previousElementSibling.value);
      if(!Number.isInteger(qtd)||qtd<1){button.previousElementSibling.reportValidity();return;}
      addItemBtn.click();const tr=tbody.querySelector('tr.item-row:last-child');if(!tr)return;
      aplicarItemNaLinha(tr,it);tr.querySelector('.qtd').innerText=String(qtd);recalcularLinha(tr);
      button.textContent='Adicionado';setTimeout(()=>button.textContent='Adicionar',1200);
    });
    pag.children[0].disabled=pagina===0;pag.children[2].disabled=!temProxima;pag.children[1].textContent='P?gina '+(pagina+1);
  }
  busca.oninput=()=>{clearTimeout(timerVitrine);timerVitrine=setTimeout(()=>{pagina=0;carregarVitrine();},300);};
  categoria.onchange=()=>{pagina=0;carregarVitrine();};
  pag.children[0].onclick=()=>{if(pagina>0){pagina--;carregarVitrine();}};pag.children[2].onclick=()=>{pagina++;carregarVitrine();};
  vitrine.querySelector('.vitrine-atualizar').onclick=carregarVitrine;
  async function iniciarVitrine(){
    const empresa=window.__CONTEXT?.empresa_id;
    if(empresa){const {data}=await supabase.from('itens').select('categoria').eq('empresa_id',empresa).eq('ativo',true).eq('tipo','Item').limit(2000);[...new Set((data || []).map(i=>i.categoria).filter(Boolean))].sort().forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;categoria.appendChild(o);});}
    carregarVitrine();
  }

  window.pedidoAdicionarDoCatalogo = async function(id){
    const empresa=window.__CONTEXT?.empresa_id;if(!empresa)throw Error('Empresa n?o identificada.');
    const {data:it,error}=await supabase.from('itens').select('id,codigo,produto,descricao_total,valor_locacao,valor_reposicao,volume_cubico,foto_url').eq('id',id).eq('empresa_id',empresa).eq('ativo',true).eq('locar_somente_kit',false).single();
    if(error || !it)throw Error('Este item n?o est? dispon?vel para adicionar avulso.');
    const existente=Array.from(tbody.querySelectorAll('tr.item-row')).find(tr=>tr.dataset.itemId===id);
    if(existente){const qtd=existente.querySelector('.qtd');qtd.innerText=String((Number(qtd.innerText)||0)+1);recalcularLinha(existente);return;}
    addItemBtn.click();const tr=tbody.querySelector('tr.item-row:last-child');aplicarItemNaLinha(tr,it);recalcularLinha(tr);
  };

  window.pedidoMetadadosCatalogo = () => ({
    noivos: document.getElementById('clienteInput')?.value || 'Novo pedido',
    data_evento: document.getElementById('dataEvento')?.value || null,
    local_evento: document.getElementById('localInput')?.value || ''
  });
  window.pedidoProjetoCatalogo = () => {
    const salvo=window.__pedidoProjetoComercial || window.__PEDIDO_DADOS_ATUAL?.observacoes?.projeto_comercial;
    if(salvo)return structuredClone({...salvo,...window.pedidoMetadadosCatalogo()});
    const itens=Array.from(tbody.querySelectorAll('tr.item-row')).filter(tr=>tr.dataset.itemId).map(tr=>({item_id:tr.dataset.itemId,quantidade:Number(tr.querySelector('.qtd')?.innerText)||1}));
    return {id:window.__PEDIDO_ATUAL_ID || crypto.randomUUID(),...window.pedidoMetadadosCatalogo(),status:'rascunho',dados:{ambientes:[{id:crypto.randomUUID(),nome:'Evento',itens,renders:[],notas:''}],plantas:[]}};
  };
  let sincronizacao=Promise.resolve();
  window.pedidoSincronizarProjetoCatalogo = project => {
    const snapshot=structuredClone(project);
    sincronizacao=sincronizacao.catch(()=>{}).then(async()=>{
      const quantidades=new Map();
      for(const amb of snapshot.dados.ambientes)for(const item of amb.itens){
        const qtd=Number(item.quantidade);if(!Number.isFinite(qtd)||qtd<=0)continue;
        const id=String(item.item_id);quantidades.set(id,(quantidades.get(id)||0)+qtd);
      }
      for(const [id,qtd] of quantidades){
        let tr=Array.from(tbody.querySelectorAll('tr.item-row')).find(row=>row.dataset.itemId===id);
        if(!tr){await window.pedidoAdicionarDoCatalogo(id);tr=Array.from(tbody.querySelectorAll('tr.item-row')).find(row=>row.dataset.itemId===id);}
        if(!tr)throw Error('Não foi possível sincronizar um item do pedido.');
        tr.querySelector('.qtd').innerText=String(qtd);recalcularLinha(tr);
      }
      for(const tr of tbody.querySelectorAll('tr.item-row'))if(tr.dataset.itemId&&!quantidades.has(tr.dataset.itemId))tr.remove();
      window.__pedidoProjetoComercial=snapshot;atualizarResumo();
    });
    return sincronizacao;
  };
  vitrine.querySelector('.vitrine-cabecalho').innerHTML='<button type="button" class="comercial-ver-selecao">Ver sele??o do pedido</button>';
  vitrine.querySelector('.comercial-ver-selecao').onclick=()=>document.querySelector('.pedido-items-panel').scrollIntoView({behavior:'smooth'});
  vitrine.querySelector('.vitrine-filtros').hidden=true;grade.hidden=true;pag.hidden=true;
  const catalogo=document.createElement('iframe');catalogo.className='pedido-catalogo-real';catalogo.title='Cat?logo comercial';
  catalogo.dataset.src='../Catalogo/catalogo.html?comercial=pedido';vitrine.appendChild(catalogo);
  iniciarEntradaComercial(vitrine);


  window.__restaurarItensPedido = function restaurarItensPedido(itens = []) {
    tbody.innerHTML = "";

    const aplicarObservacaoOperacional = (tr, observacao = null) => {
      const destinos = observacao?.destinos || {};
      const observacoes = observacao?.observacoes || {};
      const textoLegado = String(observacao?.texto || "").trim();
      const separacaoTexto = String(observacoes.separacao || (!observacoes.separacao && destinos.separacao !== false ? textoLegado : "")).trim();
      const entregaTexto = String(observacoes.entrega || (!observacoes.entrega && destinos.entrega ? textoLegado : "")).trim();
      tr.dataset.obsSeparacaoTexto = separacaoTexto;
      tr.dataset.obsEntregaTexto = entregaTexto;
      tr.dataset.obsTexto = separacaoTexto || entregaTexto;
      tr.dataset.obsSeparacao = separacaoTexto ? "1" : "0";
      tr.dataset.obsEntrega = entregaTexto ? "1" : "0";
      tr.classList.toggle("has-operational-note", Boolean(separacaoTexto || entregaTexto));
    };

    itens.forEach((item) => {
      addItemBtn.click();
      const tr = Array.from(tbody.querySelectorAll("tr.item-row")).at(-1);
      if(!tr) return;

      aplicarItemNaLinha(tr, {
        id: item.item_id || item.id,
        codigo: item.codigo_item || item.codigo || "",
        produto: item.item_nome || item.produto || "Item",
        descricao_total: item.item_nome || item.descricao_total || item.produto || "Item",
        foto_url: item.foto_url || "",
        valor_locacao: Number(item.valor_locacao || 0),
        valor_reposicao: Number(item.valor_reposicao || 0),
        volume_cubico: Number(item.volume_cubico || 0)
      });

      const qtdEl = tr.querySelector(".qtd");
      if(qtdEl) qtdEl.innerText = String(Number(item.quantidade_solicitada || item.quantidade || 1));
      aplicarObservacaoOperacional(tr, item.observacao_operacional || null);
      recalcularLinha(tr);
    });

    atualizarResumo();
    calcularVolumeTotalPedido();
  };
  /* =====================================================
     ADICIONAR ESPAÇO
  ===================================================== */
  function adicionarEspaco() {

    const tr = document.createElement("tr");
    tr.classList.add("linha-espaco");

    tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-espaco" type="button">✕</button>
  </div>
</td>

<td colspan="7">
  <div class="espaco-wrapper">
    <div class="nome-espaco-input" contenteditable="true">
      NOVO ESPAÇO
    </div>
  </div>
</td>
    `;

    tbody.appendChild(tr);

    tr.querySelector(".btn-remover-espaco")
      ?.addEventListener("click", () => {
        tr.remove();
        atualizarResumo();
        calcularVolumeTotalPedido();
      });
  }

  if (addEspacoBtn) {
    addEspacoBtn.addEventListener("click", adicionarEspaco);
  }

  if(addPersonalizacaoBtn){
  addPersonalizacaoBtn.addEventListener("click", adicionarPersonalizacao);
}
/* =====================================================
   ADICIONAR PERSONALIZAÇÃO
===================================================== */

async function adicionarPersonalizacao(){

  const empresaId = window.__CONTEXT?.empresa_id;

  if(!empresaId){
    avisar("Empresa não encontrada.", "Erro", "erro");
    return;
  }

  const { data, error } = await supabase
    .from("personalizacoes")
    .select("id, tipo, vinculo_nome, preco_sugerido")
    .eq("empresa_id", empresaId)
    .eq("status","ATIVO")
    .order("tipo");

  if(error){
    console.error(error);
    return;
  }

  if(!data || !data.length){
    avisar("Nenhuma personalização cadastrada.");
    return;
  }

const options = data.map(p => {

  const nomeSemMedida = (p.vinculo_nome || "").split("(L)")[0].trim();

  return `
    <option value="${p.id}" data-preco="${p.preco_sugerido}">
      ${p.tipo} — ${nomeSemMedida}
    </option>
  `;

}).join("");

  const tr = document.createElement("tr");
  tr.classList.add("item-row","item-personalizacao");

  tr.dataset.valorUnitario = 0;
  tr.dataset.valorReposicao = 0;
  tr.dataset.volume = 0;

  function atualizarDescricao(){

  const tecido = tr.querySelector(".input-tecido")?.value || "";
  const cor = tr.querySelector(".input-cor")?.value || "";
  const obs = tr.querySelector(".input-obs")?.value || "";

  let texto = "";

  if(tecido) texto += `Tecido: ${tecido}`;

  if(cor) texto += (texto ? " • " : "") + `Cor: ${cor}`;

  if(obs) texto += (texto ? " • " : "") + obs;

const detalhe = tr.querySelector(".detalhe-personalizacao");

if(detalhe){
  detalhe.innerText = texto;
}

}

tbody.appendChild(tr);

tr.innerHTML = `

<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
  </div>
</td>

<td class="qtd" contenteditable="true">1</td>

<td></td>

<td class="td-item">

<div class="item-container">

  <div class="item-autocomplete-wrapper">

    <div class="nome-item-card">

      <select class="nome-item select-personalizacao" required>

        <option value="" selected disabled>
          Selecionar personalização
        </option>

        ${options}

      </select>

      <div class="detalhe-personalizacao"></div>

    </div>

  </div>

  <div class="campos-personalizacao hidden">

    <input type="text" class="input-tecido" placeholder="Tecido">

    <input type="text" class="input-cor" placeholder="Cor">

    <input type="text" class="input-obs" placeholder="Observação">

  </div>

</div>

</td>

<td class="valor valor-unitario">
  R$ 0,00
</td>

<td class="valor">
  <input 
    type="number"
    class="input-desconto"
    value="0"
    min="0"
    max="100"
    step="1"
  >
</td>

<td class="valor valor-total">
  R$ 0,00
</td>

<td class="valor valor-reposicao">
  R$ 0,00
</td>

`;
tbody.appendChild(tr);

tr.addEventListener("input", function(e){

  if(
    e.target.classList.contains("input-tecido") ||
    e.target.classList.contains("input-cor") ||
    e.target.classList.contains("input-obs")
  ){
    atualizarDescricao();
  }

});
  tbody.appendChild(tr);
bindRemover(tr);
  tr.addEventListener("click", function(e){

  if(e.target.closest(".campos-personalizacao")) return;

  document.querySelectorAll(".campos-personalizacao")
    .forEach(el => el.classList.add("hidden"));

  const campos = tr.querySelector(".campos-personalizacao");

  campos.classList.remove("hidden");

});

  const select = tr.querySelector(".select-personalizacao");

select.addEventListener("change", function(){

  const option = this.selectedOptions[0];
  if(!option.value) return;

  const preco = Number(option.dataset.preco || 0);

  tr.dataset.valorUnitario = preco;

  tr.querySelector(".valor-unitario").innerText =
    formatCurrency(preco);

  const campos = tr.querySelector(".campos-personalizacao");
  const tecidoCampo = tr.querySelector(".campo-tecido");

  const texto = option.text.toLowerCase();

  campos.classList.remove("hidden");

  if(tecidoCampo){
    tecidoCampo.style.display = "none";

    if(texto.includes("forração")){
      tecidoCampo.style.display = "block";
    }
  }

  /* =========================
     RECALCULA LINHA
  ========================= */

  recalcularLinha(tr);

});

}

  /* =====================================================
     SORTABLE
  ===================================================== */
  if (window.Sortable && tbody) {
    new Sortable(tbody, {
      animation: 150,
      filter: "button,input,select,textarea,[contenteditable='true'],.item-autocomplete-wrapper,.item-autocomplete-list,.acoes-linha",
      preventOnFilter: false,
      ghostClass: "drag-ghost",
      chosenClass: "drag-chosen",
      onStart: function () {
        window.__pedidoOrdenacaoManual = true;
      },
      onEnd: function () {
        window.__pedidoOrdenacaoManual = true;
        atualizarResumo();
        calcularVolumeTotalPedido();
        window.__salvarOrdemPedido?.();
      }
    });
  }

/* =====================================================
   START
===================================================== */

window.atualizarResumoGlobal = atualizarResumo;

atualizarResumo();
calcularVolumeTotalPedido();
}document.addEventListener("click", function(e){

  if(!e.target.closest(".item-personalizacao")){

    document.querySelectorAll(".campos-personalizacao")
      .forEach(el => el.classList.add("hidden"));

  }

});
if(!window.__orcamentoToggleLoaded){

  document.addEventListener("click", function(e){

    const header = e.target.closest(".orcamento-header");
    if(!header) return;

    const container = header.parentElement;
    const content = container.querySelector('.orcamento');
    const btn = header.querySelector('.btn-minimizar');

    if(!content) return;

    content.classList.toggle('hidden');

    btn.textContent = content.classList.contains('hidden') ? '+' : '—';

  });

  window.__orcamentoToggleLoaded = true;
}
