(function(){
  const state = {
    pedidos: [],
    visao: 'pedidos',
    filtrados: [],
    supabase: null,
    empresaId: null,
    whatsappPedido: null,
    onFinanceiroAtualizado: null,
    onPixAtualizado: null,
    onStorageFinanceiroAtualizado: null,
    realtimeChannel: null,
    presenca: new Map(),
    presencaTimer: null
  };

  const els = {};
  let acompanhamentos = [], acompanhamentoErro = '', acompanhamentoPronto = false;
  let acompanhamentoFiltros;
  const tabelaOriginal = {};
  async function carregarAcompanhamentos(){
    const {data,error}=await state.supabase.rpc('comercial_acompanhamentos',{p_empresa:state.empresaId});
    acompanhamentoErro=error ? error.message : ''; acompanhamentos=data||[];acompanhamentoPronto=true;render();
  }
  function renderAcompanhamentos(){
    const tabela=els.centralPedidosTbody.closest('table');
    const especial=['orcamento','pre_reserva'].includes(els.filtroStatusPedido?.value);
    tabela.classList.toggle('cp-acomp-table',especial);
    if(!tabelaOriginal.head){tabelaOriginal.head=tabela.querySelector('thead').innerHTML;tabelaOriginal.cols=tabela.querySelector('colgroup').innerHTML;}
    if(!acompanhamentoFiltros){
      acompanhamentoFiltros=document.createElement('div');acompanhamentoFiltros.className='cp-filtros cp-acomp-filtros';
      acompanhamentoFiltros.innerHTML='<label>Retornos<select data-prazo><option value="">Todos</option><option value="atrasados">Atrasados</option><option value="hoje">Hoje</option><option value="proximos">Próximos</option><option value="sem">Sem agendamento / encerrados</option></select></label><label>Responsável<select data-responsavel></select></label><label>Situação<select data-situacao-contato></select></label><label>Motivo<select data-motivo-contato></select></label><button type="button" data-atualizar>Atualizar contatos</button><span role="status" data-contato-status></span>';
      acompanhamentoFiltros.setAttribute('aria-label','Filtros de acompanhamento comercial');
      els.centralFiltrosPedidos.append(acompanhamentoFiltros);acompanhamentoFiltros.addEventListener('change',render);acompanhamentoFiltros.querySelector('[data-atualizar]').onclick=()=>carregarAcompanhamentos().catch(e=>{acompanhamentoErro=e.message;render();});
    }
    acompanhamentoFiltros.hidden=!especial||state.visao==='receber';
    if(!especial){tabela.querySelector('thead').innerHTML=tabelaOriginal.head;tabela.querySelector('colgroup').innerHTML=tabelaOriginal.cols;return false;}
    acompanhamentoFiltros.querySelector('[data-contato-status]').textContent=acompanhamentoErro?'Acompanhamentos indisponíveis: '+acompanhamentoErro:acompanhamentoPronto?'':'Carregando acompanhamentos…';
    for(const [seletor,chave] of [['[data-responsavel]','responsavel_id'],['[data-situacao-contato]','situacao'],['[data-motivo-contato]','motivo']]){
      const sel=acompanhamentoFiltros.querySelector(seletor),valor=sel.value;const opcoes=new Map(acompanhamentos.filter(c=>c[chave]).map(c=>[c[chave],chave==='responsavel_id'?c.responsavel:c[chave]]));
      sel.innerHTML='<option value="">Todos</option>'+[...opcoes].map(([k,v])=>`<option value="${escapeHtml(k)}">${escapeHtml(v||'')}</option>`).join('');sel.value=valor;
    }
    tabela.querySelector('colgroup').innerHTML=[190,220,110,125,300,180,165,190,140].map(largura=>'<col style="width:'+largura+'px">').join('');
    tabela.querySelector('thead').innerHTML='<tr>'+['Número','Cliente','Evento','Valor','Situação / motivo','Último contato','Próximo contato','Responsável','Ações'].map(t=>'<th>'+t+'</th>').join('')+'</tr>';
    els.centralPedidosTbody.innerHTML=window.ComercialProdutividade.tabela(state.filtrados.filter(p=>!p.origemCatalogo),acompanhamentos,{prazo:acompanhamentoFiltros.querySelector('[data-prazo]').value,responsavel:acompanhamentoFiltros.querySelector('[data-responsavel]').value,situacao:acompanhamentoFiltros.querySelector('[data-situacao-contato]').value,motivo:acompanhamentoFiltros.querySelector('[data-motivo-contato]').value});
    return true;
  }
  const MISSING_SEPARACAO_TABLES_KEY = "easyloc:separacao-tabelas-ausentes";

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    [
      "btnNovoPedidoCentral",
      "btnTabelasPreco",
      "btnFiltrosPedidos",
      "pesquisaGeralPedidos",
      "centralFiltrosPedidos",
      "filtroClientePedido",
      "filtroNumeroPedido",
      "filtroLocalPedido",
      "filtroComercialPedido",
      "filtroStatusPedido",
      "filtroDataInicialPedido",
      "filtroDataFinalPedido",
      "centralStatusCarregamento",
      "centralPedidosTbody",
      "centralWhatsappModal",
      "centralWhatsappTitulo",
      "centralWhatsappCliente",
      "centralWhatsappTelefone",
      "centralWhatsappMensagem",
      "btnFecharWhatsappPedido",
      "btnCancelarWhatsappPedido",
      "btnEnviarWhatsappPedido",
      "centralCadastroRelacionadoModal",
      "centralCadastroRelacionadoTitulo",
      "centralCadastroRelacionadoSubtitulo",
      "centralCadastroRelacionadoBody",
      "btnFecharCadastroRelacionado"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function avisar(mensagem, titulo = "Central de Pedidos", tipo = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(mensagem, titulo, tipo);
      return;
    }
    alert(mensagem);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatCurrency(value){
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function onlyDigits(value){
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(value){
    const digits = onlyDigits(value);
    if(!digits) return "-";
    if(digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if(digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value || digits;
  }

  function formatCadastroValue(value){
    const text = String(value ?? "").trim();
    return text || "-";
  }

  function formatEnderecoCadastro(registro){
    const partes = [
      registro?.endereco,
      registro?.numero_endereco,
      registro?.bairro,
      registro?.cidade,
      registro?.estado || registro?.uf
    ].filter(Boolean);
    return partes.join(", ") || "-";
  }

  function tagsCadastroHtml(tags){
    let parsed = tags;
    if(typeof parsed === "string"){
      try{
        parsed = JSON.parse(parsed);
      }catch{
        parsed = {};
      }
    }
    if(!parsed || typeof parsed !== "object") return "";

    return Object.entries(parsed)
      .filter(([, value]) => {
        if(Array.isArray(value)) return value.length;
        return value !== null && value !== undefined && String(value).trim() !== "";
      })
      .map(([key, value]) => {
        const values = Array.isArray(value) ? value : [value];
        return `
          <div class="central-cadastro-tags-group">
            <span>${escapeHtml(key)}</span>
            <div>
              ${values.map((item) => `<em>${escapeHtml(item)}</em>`).join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function moneyNumber(value){
    if(typeof value === "number") return Number.isFinite(value) ? value : 0;
    if(value === null || value === undefined) return 0;
    const raw = String(value)
      .replace("R$", "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return Math.max(0, Number(raw) || 0);
  }

  function firstMoneyValue(...values){
    for(const value of values){
      const parsed = moneyNumber(value);
      if(parsed > 0) return parsed;
    }
    return 0;
  }

  function normalizarObservacoes(value){
    if(!value) return {};
    if(typeof value === "object") return value;
    try{
      return JSON.parse(value);
    }catch{
      return {};
    }
  }

  function statusParcelaPago(status){
    const normalized = String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return ["pago", "recebido", "quitado", "liquidado", "baixado"].includes(normalized);
  }

  function statusParcelaCancelado(status){
    return String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() === "cancelado";
  }

  function dateISO(value){
    if(!value) return "";
    const text = String(value).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(br) return `${br[3]}-${br[2]}-${br[1]}`;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function calcularFinanceiroPedido(pedido){
    const fin = pedido.fin;
    const total = fin ? Math.max(moneyNumber(pedido.valor), fin.devido) : moneyNumber(pedido.valor);
    const observacoes = pedido.observacoes || {};
    const parcelas = Array.isArray(observacoes.parcelas_financeiras)
      ? observacoes.parcelas_financeiras
      : [];

    const recebidoPorCampo = firstMoneyValue(
      pedido.valor_recebido,
      pedido.total_recebido,
      pedido.valor_pago,
      pedido.total_pago,
      pedido.recebido,
      pedido.baixado,
      pedido.valor_baixado,
      observacoes.valor_recebido,
      observacoes.total_recebido,
      observacoes.valor_pago,
      observacoes.total_pago,
      observacoes.baixado
    );

    const recebidoPorParcelas = parcelas.reduce((sum, parcela) => {
      if(!statusParcelaPago(parcela?.status)) return sum;
      return sum + moneyNumber(parcela?.valor);
    }, 0);

    const statusQuitado = statusParcelaPago(
      pedido.status_pagamento
      || pedido.status_financeiro
      || pedido.pagamento_status
      || pedido.financeiro_status
      || observacoes.status_financeiro
      || observacoes.pagamento_status
      || observacoes.financeiro_status
    );
    const recebido = fin ? Math.min(total, fin.recebido) : Math.min(total, statusQuitado ? total : (recebidoPorCampo || recebidoPorParcelas));
    const pendente = Math.max(0, total - recebido);
    const percentual = total > 0 ? Math.min(100, Math.round((recebido / total) * 100)) : 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const pendentes = parcelas
      .filter((parcela) => !statusParcelaPago(parcela?.status) && !statusParcelaCancelado(parcela?.status))
      .map((parcela) => ({
        ...parcela,
        vencimentoISO: dateISO(parcela?.vencimento)
      }))
      .filter((parcela) => parcela.vencimentoISO)
      .sort((a, b) => a.vencimentoISO.localeCompare(b.vencimentoISO));

    const vencimentoDireto = dateISO(
      pedido.proximo_vencimento
      || pedido.proximo_vencimento_pagamento
      || pedido.data_vencimento
      || pedido.vencimento
      || observacoes.proximo_vencimento
      || observacoes.proximo_vencimento_pagamento
      || observacoes.data_vencimento
      || observacoes.vencimento
    );
    const proxima = fin ? (fin.proximo ? { vencimentoISO: fin.proximo } : null) : (pendentes[0] || (vencimentoDireto ? { vencimentoISO: vencimentoDireto } : null));
    const proximaDate = proxima?.vencimentoISO ? new Date(`${proxima.vencimentoISO}T00:00:00`) : null;
    const atrasado = percentual < 100 && proximaDate && proximaDate < hoje;
    const qtdParcelas = (fin && fin.titulos) || parcelas.length
      || Number(pedido.quantidade_parcelas || pedido.parcelas || observacoes.quantidade_parcelas || observacoes.parcelas || 0);

    let estado = "empty";
    if(percentual >= 100) estado = "paid";
    else if(atrasado) estado = "overdue";
    else if(percentual > 0) estado = "partial";

    const label = `${percentual}% pago${atrasado ? " (atrasado)" : ""}`;

    return {
      total,
      recebido,
      pendente,
      percentual,
      estado,
      label,
      proximoVencimento: proxima?.vencimentoISO || "",
      qtdParcelas
    };
  }

  function renderValorFinanceiro(pedido){
    const financeiro = calcularFinanceiroPedido(pedido);
    const tooltip = [
      `Valor total: ${formatCurrency(financeiro.total)}`,
      `Valor recebido: ${formatCurrency(financeiro.recebido)}`,
      `Valor pendente: ${formatCurrency(financeiro.pendente)}`,
      `Proximo vencimento: ${financeiro.proximoVencimento ? dataBR(financeiro.proximoVencimento) : "-"}`,
      `Quantidade de parcelas: ${financeiro.qtdParcelas}`
    ].map(escapeHtml).join("&#10;");

    return `
      <div class="central-finance-indicator ${escapeHtml(financeiro.estado)}" style="--finance-progress:${financeiro.percentual}%" title="${tooltip}" aria-label="${tooltip}">
        <span class="central-finance-value">${formatCurrency(financeiro.total)}</span>
        <span class="central-finance-track">
          <span class="central-finance-fill"></span>
        </span>
        <span class="central-finance-label">${escapeHtml(financeiro.label)}</span>
      </div>
    `;
  }

  function formatStatusLabel(status){
    const labels = {
      pre_reserva: "Pré-reserva",
      orcamento: "Orçamento",
      aprovado: "Reservado",
      enviado: "Reservado",
      pendente: "Pendente",
      em_separacao: "Em separação",
      separado: "Separado",
      finalizado: "Finalizado",
      cancelado: "Cancelado",
      catalogo_rascunho: "Em montagem",
      catalogo_pedido_enviado: "Pedido enviado",
      catalogo_em_analise: "Em análise",
      catalogo_convertido: "Convertido"
    };

    return labels[status] || String(status || "-").replaceAll("_", " ");
  }

  function isTabelaAusente(error){
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || /does not exist|schema cache|could not find/i.test(message);
  }

  function tabelasSeparacaoAusentes(){
    try{
      return localStorage.getItem(MISSING_SEPARACAO_TABLES_KEY) === "1";
    }catch{
      return false;
    }
  }

  function marcarTabelasSeparacaoAusentes(){
    try{
      localStorage.setItem(MISSING_SEPARACAO_TABLES_KEY, "1");
    }catch{}
  }

  function abrirPedido(pedidoId = "", modo = "editar"){
    window.__PEDIDO_ATUAL_ID = pedidoId || null;
    window.__PEDIDO_MODO_ABERTURA = modo;

    const params = new URLSearchParams();
    if (pedidoId) params.set("pedido", pedidoId);
    if (modo) params.set("modo", modo);
    const query = params.toString();

    window.location.href = query ? `pedido.html?${query}` : "pedido.html";
  }

  function escolherParcelaPix(pedido){
    const parcelas = Array.isArray(pedido?.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    const indexAberto = parcelas.findIndex((parcela) => {
      return moneyNumber(parcela?.valor) > 0
        && !statusParcelaPago(parcela?.status)
        && !statusParcelaCancelado(parcela?.status);
    });

    if(indexAberto >= 0){
      const parcela = parcelas[indexAberto];
      return {
        index: indexAberto,
        numero: parcela.numero || indexAberto + 1,
        label: parcela.tipo || `Parcela ${indexAberto + 1}`,
        valor: moneyNumber(parcela.valor),
        vencimento: dateISO(parcela.vencimento) || dateISO(pedido.data)
      };
    }

    return {
      index: null,
      numero: "",
      label: "Pedido",
      valor: moneyNumber(pedido?.valor),
      vencimento: dateISO(pedido?.vencimento || pedido?.data_vencimento || pedido?.data)
    };
  }

  function abrirPixPedido(pedido){
    if(!pedido) return;
    if(!window.EasyLocPix?.open){
      avisar("Fluxo PIX indisponivel neste momento.", "PIX", "erro");
      return;
    }

    const parcela = escolherParcelaPix(pedido);
    const parcelas = Array.isArray(pedido?.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    window.EasyLocPix.open({
      source: "central_pedidos",
      pedidoId: pedido.id,
      numeroPedido: pedido.numero,
      clienteId: pedido.cliente_id,
      cliente: pedido.cliente,
      contato: pedido.contato,
      valor: parcela.valor,
      vencimento: parcela.vencimento,
      parcelaIndex: parcela.index,
      parcelaNumero: parcela.numero,
      parcelaLabel: parcela.label,
      parcelas,
      gateway: "mercado_pago"
    });
  }

  function campoCadastro(label, value, extraClass = ""){
    return `
      <div class="central-cadastro-field ${extraClass}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatCadastroValue(value))}</strong>
      </div>
    `;
  }

  /* Janela de cadastro do cliente / local (out/2026, pedido do usuário: "mais bonito, foto do cliente, mapa do local").
     Cliente: foto (a do catálogo) ou iniciais, contatos com atalho e o histórico com a empresa. Local: mapa, distância do
     galpão, rotas e as condições do local em destaque. Só aparecem os campos preenchidos. */
  const ROTULOS_TAGS = { tipo: "Tipo", canal: "Canal", horario: "Horário", orcamento: "Orçamento", estilo: "Estilo", observacoes: "Condições", origem: "Origem" };
  function lerTags(tags){
    let t = tags;
    if(typeof t === "string"){ try{ t = JSON.parse(t); }catch{ t = {}; } }
    if(!t || typeof t !== "object") return [];
    return Object.entries(t).map(([chave, valor]) => [chave, (Array.isArray(valor) ? valor : [valor]).map((v) => String(v ?? "").trim()).filter(Boolean)]).filter(([, v]) => v.length);
  }
  function iniciais(nome){
    return String(nome || "?").split(/\s+/).filter((p) => p && !/^(de|da|do|dos|das|e)$/i.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  }
  // CPF/CNPJ no cofre: mostra só a máscara.
function docVisivel(r){ const v = String(r?.cpf_cnpj || ""); return v.startsWith("cofre:") ? ((r.cofre_mascaras || {}).cpf_cnpj || "••••") : v; }

function infoCadastro(rotulo, valor, icone){
    const texto = String(valor ?? "").trim();
    if(!texto || texto === "-") return "";
    return `<div class="cad-info"><i data-lucide="${icone}" aria-hidden="true"></i><div><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(texto)}</strong></div></div>`;
  }
  function tagsBonitasHtml(tags, isCliente){
    const grupos = lerTags(tags);
    if(!grupos.length) return "";
    return `<section class="cad-bloco"><h4>${isCliente ? "Perfil" : "Sobre o local"}</h4>${grupos.map(([chave, valores]) => `
      <div class="cad-tags-linha${chave === "observacoes" && !isCliente ? " is-condicoes" : ""}"><span>${escapeHtml(ROTULOS_TAGS[chave] || (chave.charAt(0).toUpperCase() + chave.slice(1).replaceAll("_", " ")))}</span><div>${valores.map((v) => `<em>${escapeHtml(v)}</em>`).join("")}</div></div>`).join("")}</section>`;
  }

  function renderCadastroRelacionado(tipo, registro, pedido){
    const isCliente = tipo === "cliente";
    const tituloFallback = isCliente ? pedido?.cliente : pedido?.local;
    const nome = registro?.nome_razao || registro?.nome || tituloFallback || "-";
    const status = registro?.status || registro?.status_cliente || "";
    const endereco = formatEnderecoCadastro(registro);
    const telefone = onlyDigits(registro?.telefone || registro?.celular || pedido?.contato || "");
    const email = String(registro?.email || "").trim();

    if(els.centralCadastroRelacionadoSubtitulo) els.centralCadastroRelacionadoSubtitulo.textContent = isCliente ? "Cliente" : "Local do evento";
    if(els.centralCadastroRelacionadoTitulo) els.centralCadastroRelacionadoTitulo.textContent = nome;
    if(!els.centralCadastroRelacionadoBody){ return; }

    const statusHtml = status ? `<span class="cad-status ${/ativ/i.test(status) ? "ativo" : /inativ|frio/i.test(status) ? "inativo" : ""}">${escapeHtml(status)}</span>` : "";
    const acoes = [
      telefone ? `<a class="cad-acao whatsapp" href="https://wa.me/${telefone.length <= 11 ? "55" + telefone : telefone}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i>WhatsApp</a>` : "",
      telefone ? `<a class="cad-acao" href="tel:+${telefone.length <= 11 ? "55" + telefone : telefone}"><i data-lucide="phone"></i>Ligar</a>` : "",
      email ? `<a class="cad-acao" href="mailto:${escapeHtml(email)}"><i data-lucide="mail"></i>E-mail</a>` : ""
    ].join("");

    let corpo;
    if(isCliente){
      const foto = /^https?:\/\//i.test(registro?.catalogo_logo_url || "") ? registro.catalogo_logo_url : "";
      const pedidos = state.pedidos.filter((p) => !p.origemCatalogo && ((registro?.id && p.cliente_id === registro.id) || p.cliente === nome))
        .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
      const ativos = pedidos.filter((p) => p.status !== "cancelado");
      const total = ativos.reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
      corpo = `
        <section class="cad-hero">
          <div class="cad-avatar">${foto ? `<img src="${escapeHtml(foto)}" alt="" onerror="this.remove()">` : ""}<span>${escapeHtml(iniciais(nome))}</span></div>
          <div class="cad-hero-texto">
            <div class="cad-hero-nome"><h3>${escapeHtml(nome)}</h3>${statusHtml}</div>
            ${endereco !== "-" ? `<p><i data-lucide="map-pin"></i>${escapeHtml(endereco)}</p>` : ""}
            ${acoes ? `<div class="cad-acoes">${acoes}</div>` : ""}
          </div>
        </section>
        <section class="cad-numeros">
          <div><span>Pedidos</span><strong>${ativos.length}</strong></div>
          <div><span>Valor em pedidos</span><strong>${escapeHtml(formatCurrency(total))}</strong></div>
          <div><span>Última locação</span><strong>${escapeHtml(dataBR(registro?.ultima_locacao) || "-")}</strong></div>
        </section>
        <section class="cad-bloco cad-grade">
          ${infoCadastro("Telefone", formatPhone(telefone), "phone")}
          ${infoCadastro("E-mail", email, "mail")}
          ${infoCadastro("CPF / CNPJ", docVisivel(registro), "id-card")}
          ${infoCadastro("Ponto de referência", registro?.ponto_referencia, "flag")}
          ${infoCadastro("Observações", registro?.observacoes || registro?.observacao, "sticky-note")}
        </section>
        ${tagsBonitasHtml(registro?.tags, true)}
        ${pedidos.length ? `<section class="cad-bloco"><h4>Últimos pedidos</h4><ul class="cad-pedidos">${pedidos.slice(0, 4).map((p) => `
          <li data-cad-pedido="${escapeHtml(p.id)}"><span class="pedido-numero-card">${escapeHtml(p.numero)}</span><div><strong>${escapeHtml(formatDate(p.data))}</strong><small>${escapeHtml(p.local)}</small></div><span class="status-pill ${escapeHtml(p.status)}">${escapeHtml(formatStatusLabel(p.status))}</span><b>${escapeHtml(formatCurrency(p.valor))}</b></li>`).join("")}</ul></section>` : ""}`;
    }else{
      const lat = Number(registro?.latitude), lng = Number(registro?.longitude);
      const temCoord = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng);
      const alvo = temCoord ? `${lat},${lng}` : (endereco !== "-" ? endereco : nome);
      const mapa = alvo ? `https://maps.google.com/maps?q=${encodeURIComponent(alvo)}&t=k&z=17&output=embed` : "";
      const distancia = registro?.distancia_galpao_texto || (Number(registro?.distancia_galpao_km) ? `${String(registro.distancia_galpao_km).replace(".", ",")} km` : "");
      const pedidos = state.pedidos.filter((p) => !p.origemCatalogo && p.status !== "cancelado" && ((registro?.id && p.local_id === registro.id) || p.local === nome));
      corpo = `
        <section class="cad-local">
          <div class="cad-mapa">${mapa ? `<iframe src="${mapa}" title="Mapa de ${escapeHtml(nome)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>` : `<div class="cad-mapa-vazio"><i data-lucide="map"></i>Sem endereço para mostrar no mapa</div>`}</div>
          <div class="cad-local-texto">
            <div class="cad-hero-nome"><h3>${escapeHtml(nome)}</h3>${statusHtml}</div>
            ${endereco !== "-" ? `<p><i data-lucide="map-pin"></i>${escapeHtml(endereco)}</p>` : ""}
            <div class="cad-numeros cad-numeros-local">
              ${distancia ? `<div><span>Distância do galpão</span><strong>${escapeHtml(distancia)}</strong></div>` : ""}
              <div><span>Eventos neste local</span><strong>${pedidos.length}</strong></div>
            </div>
            <div class="cad-acoes">
              ${alvo ? `<a class="cad-acao" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}" target="_blank" rel="noopener"><i data-lucide="map"></i>Google Maps</a>` : ""}
              ${temCoord ? `<a class="cad-acao" href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" rel="noopener"><i data-lucide="navigation"></i>Waze</a>` : ""}
              ${acoes}
            </div>
          </div>
        </section>
        ${tagsBonitasHtml(registro?.tags, false)}
        <section class="cad-bloco cad-grade">
          ${infoCadastro("Ponto de referência", registro?.ponto_referencia, "flag")}
          ${infoCadastro("Responsável", registro?.responsavel, "user")}
          ${infoCadastro("Telefone", formatPhone(telefone), "phone")}
          ${infoCadastro("E-mail", email, "mail")}
          ${infoCadastro("CPF / CNPJ", docVisivel(registro), "id-card")}
          ${infoCadastro("Última locação", dataBR(registro?.ultima_locacao), "calendar")}
          ${infoCadastro("Observações", registro?.observacoes || registro?.observacao, "sticky-note")}
        </section>`;
    }
    els.centralCadastroRelacionadoBody.innerHTML = corpo;
    els.centralCadastroRelacionadoModal?.classList.toggle("is-local", !isCliente);
    els.centralCadastroRelacionadoModal?.classList.remove("hidden");
    window.lucide?.createIcons?.();
  }

  async function buscarCadastroRelacionado(tipo, pedido){
    if(!state.supabase || !state.empresaId) throw new Error("Supabase indisponivel.");
    const isCliente = tipo === "cliente";
    const table = isCliente ? "clientes_empresas" : "locais_empresas";
    const id = isCliente ? pedido?.cliente_id : pedido?.local_id;
    const nome = isCliente ? pedido?.cliente : pedido?.local;

    let query = state.supabase
      .from(table)
      .select("*")
      .eq("empresa_id", state.empresaId)
      .limit(1);

    if(id){
      query = query.eq("id", id);
    }else if(nome){
      query = query.ilike("nome_razao", nome);
    }else{
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if(error && !isTabelaAusente(error)) throw error;
    return data || null;
  }

  async function abrirCadastroRelacionado(tipo, pedido){
    if(!pedido) return;

    const isCliente = tipo === "cliente";
    const id = isCliente ? pedido.cliente_id : pedido.local_id;
    const nome = isCliente ? pedido.cliente : pedido.local;

    if(!id && !nome){
      avisar(isCliente ? "Cliente nao encontrado neste pedido." : "Local nao encontrado neste pedido.", "Cadastro", "aviso");
      return;
    }

    try{
      if(els.centralCadastroRelacionadoSubtitulo){
        els.centralCadastroRelacionadoSubtitulo.textContent = isCliente ? "Cadastro de cliente" : "Cadastro de local";
      }
      if(els.centralCadastroRelacionadoTitulo){
        els.centralCadastroRelacionadoTitulo.textContent = "Carregando...";
      }
      if(els.centralCadastroRelacionadoBody){
        els.centralCadastroRelacionadoBody.innerHTML = `<div class="central-cadastro-loading">Buscando cadastro...</div>`;
      }
      els.centralCadastroRelacionadoModal?.classList.remove("hidden");

      const registro = await buscarCadastroRelacionado(tipo, pedido);
      renderCadastroRelacionado(tipo, registro || {
        nome_razao: nome,
        telefone: pedido.contato,
        status: "Nao encontrado"
      }, pedido);
    }catch(error){
      console.error("[CentralPedidos] cadastro relacionado:", error);
      avisar("Nao foi possivel abrir o cadastro neste momento.", "Cadastro", "erro");
      els.centralCadastroRelacionadoModal?.classList.add("hidden");
    }
  }

  function normalizarPedido(row){
    const observacoes = normalizarObservacoes(row.observacoes);
    return {
      id: row.id,
      numero: row.numero_pedido || row.numero || row.codigo || row.id || "-",
      origemId: row.pedido_origem_id || null, // pedido extra: id do pedido principal
      cliente_id: row.cliente_id || null,
      local_id: row.local_id || null,
      cliente: row.cliente_nome || row.cliente || row.nome_cliente || "Cliente nao informado",
      equipe: observacoes?.equipe_nome || "", // equipe do Cadastro de Clientes que a pessoa representa (out/2026)
      contato: row.contato_cliente || row.telefone_cliente || row.cliente_telefone || row.telefone || "",
      evento: row.tipo_evento || row.evento || row.nome_evento || "Evento",
      local: row.local_nome || row.local || row.endereco || "Local nao informado",
      data: row.data_evento || row.data_hora || row.data || row.created_at,
      entrega: row.data_entrega || "",
      coleta: row.data_coleta || "",
      fin: row.fin || null,
      status: row.status_comercial || row.status || "orcamento",
      fluxo: row.fluxo || null,
      pre_reserva_ate: row.pre_reserva_ate || null,
      encerrado: Boolean(row.encerrado_operacional_em),
      valor: moneyNumber(row.valor_total || row.total || row.valor || 0),
      valor_recebido: row.valor_recebido,
      total_recebido: row.total_recebido,
      valor_pago: row.valor_pago,
      total_pago: row.total_pago,
      recebido: row.recebido,
      baixado: row.baixado,
      valor_baixado: row.valor_baixado,
      status_pagamento: row.status_pagamento,
      status_financeiro: row.status_financeiro,
      pagamento_status: row.pagamento_status,
      financeiro_status: row.financeiro_status,
      proximo_vencimento: row.proximo_vencimento,
      proximo_vencimento_pagamento: row.proximo_vencimento_pagamento,
      data_vencimento: row.data_vencimento,
      vencimento: row.vencimento,
      quantidade_parcelas: row.quantidade_parcelas,
      parcelas: row.parcelas,
      observacoes,
      comercial: row.comercial_nome || row.comercial || row.responsavel || "-"
    };
  }

  async function enriquecerContatosClientes(pedidos){
    if(!state.supabase || !state.empresaId || !pedidos.length) return pedidos;

    const ids = [...new Set(pedidos.map((pedido) => pedido.cliente_id).filter(Boolean))];
    const nomesSemContato = [...new Set(pedidos
      .filter((pedido) => !pedido.contato && !pedido.cliente_id && pedido.cliente)
      .map((pedido) => pedido.cliente))];

    const contatosPorId = new Map();
    const contatosPorNome = new Map();

    try{
      if(ids.length){
        const { data, error } = await state.supabase
          .from("clientes_empresas")
          .select("id,nome_razao,telefone")
          .eq("empresa_id", state.empresaId)
          .in("id", ids);
        if(error && !isTabelaAusente(error)) console.warn("[CentralPedidos] contatos clientes:", error);
        (data || []).forEach((cliente) => {
          contatosPorId.set(String(cliente.id), cliente.telefone || "");
          if(cliente.nome_razao) contatosPorNome.set(String(cliente.nome_razao).toLowerCase(), cliente.telefone || "");
        });
      }

      if(nomesSemContato.length){
        const buscas = await Promise.allSettled(nomesSemContato.map((nome) => state.supabase
          .from("clientes_empresas")
          .select("nome_razao,telefone")
          .eq("empresa_id", state.empresaId)
          .ilike("nome_razao", nome)
          .limit(1)
          .maybeSingle()));

        buscas.forEach((result) => {
          const cliente = result.value?.data;
          if(cliente?.nome_razao) contatosPorNome.set(String(cliente.nome_razao).toLowerCase(), cliente.telefone || "");
        });
      }
    }catch(error){
      console.warn("[CentralPedidos] nao foi possivel buscar contato dos clientes:", error);
    }

    return pedidos.map((pedido) => ({
      ...pedido,
      contato: pedido.contato
        || contatosPorId.get(String(pedido.cliente_id))
        || contatosPorNome.get(String(pedido.cliente).toLowerCase())
        || ""
    }));
  }

  function mensagemPadraoWhatsapp(pedido){
    return [
      `Ola, ${pedido.cliente}!`,
      "",
      `Tudo bem? Estou entrando em contato sobre o pedido ${pedido.numero} do evento ${pedido.evento}.`,
      `Data do evento: ${formatDate(pedido.data)}.`,
      `Local: ${pedido.local}.`,
      "",
      "Qualquer duvida, estou a disposicao."
    ].join("\n");
  }

  function abrirModalWhatsapp(pedido){
    if(!pedido) return;
    const phone = onlyDigits(pedido.contato);
    if(!phone){
      avisar("Este cliente ainda nao tem telefone cadastrado.", "WhatsApp", "aviso");
      return;
    }

    state.whatsappPedido = pedido;
    if(els.centralWhatsappTitulo) els.centralWhatsappTitulo.textContent = `Pedido #${pedido.numero}`;
    if(els.centralWhatsappCliente) els.centralWhatsappCliente.value = pedido.cliente;
    if(els.centralWhatsappTelefone) els.centralWhatsappTelefone.value = formatPhone(pedido.contato);
    if(els.centralWhatsappMensagem) els.centralWhatsappMensagem.value = mensagemPadraoWhatsapp(pedido);
    els.centralWhatsappModal?.classList.remove("hidden");
    els.centralWhatsappModal?.setAttribute("aria-hidden", "false");
    window.lucide?.createIcons?.();
  }

  function fecharModalWhatsapp(){
    state.whatsappPedido = null;
    els.centralWhatsappModal?.classList.add("hidden");
    els.centralWhatsappModal?.setAttribute("aria-hidden", "true");
  }

  async function enviarWhatsappPedido(){
    const pedido = state.whatsappPedido;
    if(!pedido) return;

    const phone = onlyDigits(pedido.contato);
    const text = els.centralWhatsappMensagem?.value?.trim();
    if(!phone){
      avisar("Numero de WhatsApp ausente.", "WhatsApp", "aviso");
      return;
    }
    if(!text){
      avisar("Digite a mensagem antes de enviar.", "WhatsApp", "aviso");
      return;
    }

    if(!window.EasyLocWhatsApp?.send){
      avisar("Integracao WhatsApp indisponivel neste momento.", "WhatsApp", "erro");
      return;
    }

    const button = els.btnEnviarWhatsappPedido;
    const original = button?.innerHTML;
    try{
      if(button){
        button.disabled = true;
        button.innerHTML = `<i data-lucide="loader-circle"></i> Enviando...`;
        window.lucide?.createIcons?.();
      }
      await window.EasyLocWhatsApp.send({
        phone,
        text,
        caption: text,
        type: "texto",
        origin: "central_pedidos",
        confirm: false
      });
      avisar("Mensagem enviada pelo WhatsApp.", "WhatsApp", "sucesso");
      fecharModalWhatsapp();
    }catch(error){
      avisar(error.message || "Nao foi possivel enviar a mensagem.", "WhatsApp", "erro");
    }finally{
      if(button){
        button.disabled = false;
        button.innerHTML = original;
        window.lucide?.createIcons?.();
      }
    }
  }

  function dataPedidoParaCadastro(row){
    const raw = row.data_evento || row.data_coleta || row.data_entrega || row.data_hora || row.created_at;
    if(!raw) return "";
    const iso = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
  }

  function pedidoContaComoUltimaLocacao(row){
    const status = String(row.status_comercial || row.status || "").toLowerCase();
    return !["cancelado", "cancelada", "pausado"].includes(status);
  }

  function escolherMaisRecente(map, key, payload){
    if(!key || !payload.ultima_locacao) return;
    const atual = map.get(key);
    if(!atual || payload.ultima_locacao > atual.ultima_locacao){
      map.set(key, payload);
    }
  }

  async function atualizarCadastroPorIdOuNome(tabela, id, nome, payload){
    if(!state.supabase || !state.empresaId || !payload.ultima_locacao) return;

    let result = null;

    if(id){
      result = await state.supabase
        .from(tabela)
        .update(payload)
        .eq("empresa_id", state.empresaId)
        .eq("id", id);
    }

    if((!id || result?.error) && nome){
      result = await state.supabase
        .from(tabela)
        .update(payload)
        .eq("empresa_id", state.empresaId)
        .eq("nome_razao", nome);
    }

    if(result?.error && !isTabelaAusente(result.error)){
      console.warn(`[CentralPedidos] nao foi possivel atualizar ${tabela}:`, result.error);
    }
  }

  async function sincronizarInatividadeCadastros(rows){
    const clientes = new Map();
    const locais = new Map();

    (rows || []).filter(pedidoContaComoUltimaLocacao).forEach((row) => {
      const ultima_locacao = dataPedidoParaCadastro(row);
      if(!ultima_locacao) return;

      escolherMaisRecente(clientes, row.cliente_id || row.cliente_nome, {
        id: row.cliente_id || null,
        nome: row.cliente_nome || row.cliente || row.nome_cliente || "",
        ultima_locacao
      });

      escolherMaisRecente(locais, row.local_id || row.local_nome, {
        id: row.local_id || null,
        nome: row.local_nome || row.local || "",
        ultima_locacao
      });
    });

    const tarefas = [];
    clientes.forEach((cliente) => {
      tarefas.push(atualizarCadastroPorIdOuNome("clientes_empresas", cliente.id, cliente.nome, {
        ultima_locacao: cliente.ultima_locacao
      }));
    });

    locais.forEach((local) => {
      tarefas.push(atualizarCadastroPorIdOuNome("locais", local.id, local.nome, {
        ultima_locacao: local.ultima_locacao
      }));
    });

    if(tarefas.length){
      await Promise.allSettled(tarefas);
    }
  }

  function dataBR(value){
    if(!value) return "-";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  // Visualização do pedido = a MESMA prévia que o decorador envia pelo catálogo (projeto-apresentacao.mjs): faixa escura
  // com a logo, decorador solicitante, cliente/data/local, itens por ambiente com foto, medidas e valores, renderizações,
  // e "Baixar PDF" (pedido do usuário, out/2026: "quero um pedido igual aquele que criamos lá dentro do catálogo").
  // Ambientes e renderizações vêm de observacoes.projeto_comercial (gravado pela tela nova do pedido). Pedido antigo, sem
  // isso, vira um ambiente só com os itens de separacoes_itens; item do pedido que não está em nenhum ambiente entra em
  // "Outros itens".
  let apresentacaoModulo = null;
  async function abrirPreviewPedido(pedidoId){
    if(!pedidoId || !state.supabase || !state.empresaId) return;
    try{
      apresentacaoModulo ||= await import("../Catalogo/projeto-apresentacao.mjs?v=20261030-link-documento");
      const { data: pedido, error } = await state.supabase.from("separacoes_pedidos").select("*")
        .eq("empresa_id", state.empresaId).eq("id", pedidoId).single();
      if(error || !pedido) throw error || new Error("Pedido não encontrado.");

      const { data: linhas } = await state.supabase.from("separacoes_itens")
        .select("item_id,item_nome,codigo_item,foto_url,quantidade_solicitada")
        .eq("empresa_id", state.empresaId).eq("separacao_pedido_id", pedidoId).order("created_at", { ascending: true });

      const projeto = pedido.observacoes?.projeto_comercial;
      let ambientes = (projeto?.dados?.ambientes || []).map((amb) => ({ ...amb, itens: [...(amb.itens || [])] }));
      const noProjeto = new Set(ambientes.flatMap((amb) => amb.itens.map((i) => String(i.item_id))));
      const soltos = (linhas || []).filter((l) => l.item_id && !noProjeto.has(String(l.item_id)))
        .map((l) => ({ item_id: l.item_id, quantidade: Number(l.quantidade_solicitada) || 1, nome: l.item_nome }));
      if(soltos.length) ambientes.push({ id: "outros", nome: ambientes.length ? "Outros itens" : "Itens do pedido", itens: soltos, renders: [] });

      const ids = [...new Set(ambientes.flatMap((amb) => amb.itens.map((i) => String(i.item_id))))];
      const cadastro = new Map();
      for(let i = 0; i < ids.length; i += 150){
        const { data } = await state.supabase.from("itens")
          .select("id,produto,produto_base,descricao_total,foto_url,referencia,codigo,categoria,largura,altura,profundidade,valor_locacao,valor_reposicao")
          .eq("empresa_id", state.empresaId).in("id", ids.slice(i, i + 150));
        (data || []).forEach((row) => cadastro.set(String(row.id), row));
      }
      const fotoDaLinha = new Map((linhas || []).map((l) => [String(l.item_id), l.foto_url]));
      const numero = (v) => v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
      const findItem = (id) => {
        const row = cadastro.get(String(id));
        if(!row) return null;
        const nome = row.produto_base ? `${row.produto_base} ${row.produto || ""}`.trim() : (row.produto || "Item");
        const dims = [row.largura, row.altura, row.profundidade].map((v) => numero(v) === null ? null : Math.round(numero(v) * 100));
        return {
          name: nome, fullName: String(row.descricao_total || "").trim() || nome,
          photo: row.foto_url || fotoDaLinha.get(String(id)) || "", referencia: row.referencia || row.codigo || "",
          catLabel: row.categoria || "",
          dims: dims.every((v) => v === null) ? "" : dims.map((v) => v ?? "–").join(" × ") + " cm",
          rentalPrice: numero(row.valor_locacao), replacementPrice: numero(row.valor_reposicao)
        };
      };

      const [{ data: empresa }, { data: cliente }] = await Promise.all([
        state.supabase.from("empresas").select("nome,logo_url").eq("id", state.empresaId).maybeSingle(),
        pedido.cliente_nome
          ? state.supabase.from("clientes_empresas").select("nome_razao,catalogo_logo_url").eq("empresa_id", state.empresaId).eq("nome_razao", pedido.cliente_nome).limit(1).maybeSingle()
          : Promise.resolve({ data: null })
      ]);
      const logoCliente = String(cliente?.catalogo_logo_url || "");
      const foto = /^https?:/i.test(logoCliente) ? logoCliente : "";

      const { dadosApresentacao, abrirVisualizacaoPedido, financeiroPedidoSalvo } = apresentacaoModulo;
      const model = dadosApresentacao({
        noivos: pedido.cliente_nome || projeto?.noivos || "Pedido",
        data_evento: pedido.data_evento || projeto?.data_evento || "",
        data_evento_fim: pedido.data_evento_fim || "",
        local_evento: pedido.local_nome || projeto?.local_evento || "",
        dados: { ambientes, servicos: projeto?.dados?.servicos || [] }
      }, findItem);
      model.financeiro = financeiroPedidoSalvo(pedido);
      model.semAviso = true; // no Comercial não aparece o card "Esta é uma prévia do pedido"
      model.numero = pedido.numero_pedido || "";
      model.statusPedido = { chave: pedido.status_comercial || "orcamento", ate: pedido.pre_reserva_ate || "" };
      if(pedido.local_id){
        const { data: local } = await state.supabase.from("locais_empresas").select("endereco,numero_endereco").eq("empresa_id", state.empresaId).eq("id", pedido.local_id).maybeSingle();
        const rua = String(local?.endereco || "").trim(), num = String(local?.numero_endereco || "").trim();
        model.localEndereco = num && !rua.includes(num) ? rua + ", " + num : rua;
      }
      const obsPed = pedido.observacoes || {};
      model.evento = { ...(model.evento || {}), data_entrega: pedido.data_entrega || "", hora_entrega: obsPed.horario_entrega || "", data_coleta: pedido.data_coleta || "", hora_coleta: obsPed.horario_coleta || "" }; // resumo e programação de pagamento no fim do pedido
      model.pagamentoLink = await window.EasyLocLinkPagamento?.paraDocumento({ empresaId: state.empresaId, pedidoId: pedido.id }) || null;
      abrirVisualizacaoPedido({
        titulo: `Pedido #${pedido.numero_pedido || "-"}`, model, empresa,
        decorador: pedido.cliente_nome ? { nome: pedido.cliente_nome, logo_url: foto } : null
      });
    }catch(error){
      console.error("Visualizar pedido:", error);
      avisar("Nao foi possivel abrir a visualizacao do pedido.", "Visualizar", "erro");
    }
  }

  // Projetos que os decoradores montam no catálogo (pedido do usuário, out/2026: "a central de pedidos do comercial é a
  // base principal do sistema... todo projeto que ele criar já tem que aparecer para a gente lá dentro, com alguma coisa
  // sinalizando que foi criado através do catálogo"). Só os de decorador (cliente_id); os da equipe já são pedidos.
  // Valor = soma de quantidade × valor de locação do cadastro (mesma base da prévia).
  // Presença do decorador (projetos_presenca, sinal do catálogo a cada minuto e a cada edição): "Montando agora" quando o
  // último sinal tem menos de 2 minutos; até 30 minutos mostra "Visto há N min".
  const PRESENCA_ATIVA_MS = 2 * 60 * 1000;
  async function carregarPresenca(){
    const { data, error } = await state.supabase.from("projetos_presenca").select("projeto_id,visto_em,detalhe")
      .eq("empresa_id", state.empresaId).gte("visto_em", new Date(Date.now() - 30 * 60 * 1000).toISOString());
    if(error) return;
    state.presenca = new Map((data || []).map((p) => [String(p.projeto_id), p]));
  }
  function presencaDe(pedido){
    const p = pedido?.origemCatalogo ? state.presenca.get(String(pedido.projetoId)) : null;
    if(!p) return null;
    const idade = Date.now() - new Date(p.visto_em).getTime();
    if(!(idade >= -60000)) return null;
    return { ativo: idade < PRESENCA_ATIVA_MS, minutos: Math.max(1, Math.round(idade / 60000)), detalhe: p.detalhe || "" };
  }
  function presencaHtml(pedido){
    const p = presencaDe(pedido);
    if(!p) return "";
    return p.ativo
      ? `<span class="pedido-presenca is-ativa" title="O decorador está com este projeto aberto no catálogo"><i aria-hidden="true"></i>Montando agora${p.detalhe ? ` · ${escapeHtml(p.detalhe)}` : ""}</span>`
      : `<span class="pedido-presenca" title="Último sinal do decorador neste projeto">Visto há ${p.minutos} min</span>`;
  }
  // Só a presença é relida a cada 30 s (a lista inteira não); quem está montando sobe pro topo.
  function iniciarPresenca(){
    clearInterval(state.presencaTimer);
    state.presencaTimer = setInterval(async () => {
      if(document.visibilityState !== "visible") return;
      await carregarPresenca().catch(() => {});
      const atualizados=await enriquecerFluxoPedidos(state.pedidos.filter(p=>!p.origemCatalogo));
      const fluxos=new Map(atualizados.map(p=>[p.id,p.fluxo]));
      state.pedidos=state.pedidos.map(p=>fluxos.has(p.id)?{...p,fluxo:fluxos.get(p.id)}:p);
      aplicarFiltros();
    }, 30000);
  }

  async function carregarProjetosCatalogo(){
    const { data, error } = await state.supabase.from("projetos")
      .select("id,cliente_id,noivos,data_evento,local_evento,status,dados,created_at,updated_at,pedido_enviado_em,numero_catalogo")
      .eq("empresa_id", state.empresaId).not("cliente_id", "is", null)
      .order("updated_at", { ascending: false }).limit(200);
    if(error) throw error;
    // Projeto que já virou pedido (aberto e salvo na tela do pedido) aparece só como o pedido.
    const { data: convertidos } = await state.supabase.from("separacoes_pedidos")
      .select("projeto_catalogo_id:observacoes->>projeto_catalogo_id").eq("empresa_id", state.empresaId)
      .not("observacoes->>projeto_catalogo_id", "is", null).limit(1000);
    const jaViraram = new Set((convertidos || []).map((row) => String(row.projeto_catalogo_id || "")));
    const projetos = (data || []).filter((p) => !jaViraram.has(String(p.id)));
    if(!projetos.length) return [];
    await carregarPresenca().catch(() => {});
    const linhas = (p) => (p.dados?.ambientes || []).flatMap((amb) => amb.itens || []);
    const ids = [...new Set(projetos.flatMap((p) => linhas(p).map((i) => String(i.item_id))))];
    const precos = new Map();
    for(let i = 0; i < ids.length; i += 150){
      const { data: itens } = await state.supabase.from("itens").select("id,valor_locacao").eq("empresa_id", state.empresaId).in("id", ids.slice(i, i + 150));
      (itens || []).forEach((row) => precos.set(String(row.id), Number(row.valor_locacao) || 0));
    }
    const clientes = new Map();
    const clienteIds = [...new Set(projetos.map((p) => p.cliente_id))];
    const { data: cadastros } = await state.supabase.from("clientes_empresas").select("id,nome_razao").in("id", clienteIds);
    (cadastros || []).forEach((c) => clientes.set(String(c.id), c.nome_razao));
    return projetos.map((p) => ({
      id: `projeto:${p.id}`, projetoId: p.id, origemCatalogo: true,
      numero: p.numero_catalogo ? String(p.numero_catalogo).padStart(3, "0") : "—", cliente_id: p.cliente_id, local_id: null,
      cliente: clientes.get(String(p.cliente_id)) || "Decorador",
      contato: "", evento: p.noivos || "Projeto", local: p.local_evento || "Local nao informado",
      data: p.data_evento || p.created_at,
      entrega: p.dados?.evento?.data_entrega || "", coleta: p.dados?.evento?.data_coleta || "",
      status: `catalogo_${p.status || "rascunho"}`,
      valor: linhas(p).reduce((soma, i) => soma + (Number(i.quantidade) || 1) * (precos.get(String(i.item_id)) || 0), 0),
      observacoes: {}, comercial: "Catálogo"
    }));
  }

  async function abrirPreviewProjetoCatalogo(pedido){
    try{
      apresentacaoModulo ||= await import("../Catalogo/projeto-apresentacao.mjs?v=20261030-link-documento");
      const { data: projeto, error } = await state.supabase.from("projetos").select("*")
        .eq("empresa_id", state.empresaId).eq("id", pedido.projetoId).single();
      if(error || !projeto) throw error || new Error("Projeto não encontrado.");
      const ambientes = projeto.dados?.ambientes || [];
      const ids = [...new Set(ambientes.flatMap((amb) => (amb.itens || []).map((i) => String(i.item_id))))];
      const cadastro = new Map();
      for(let i = 0; i < ids.length; i += 150){
        const { data } = await state.supabase.from("itens")
          .select("id,produto,produto_base,descricao_total,foto_url,referencia,codigo,categoria,largura,altura,profundidade,valor_locacao,valor_reposicao")
          .eq("empresa_id", state.empresaId).in("id", ids.slice(i, i + 150));
        (data || []).forEach((row) => cadastro.set(String(row.id), row));
      }
      const numero = (v) => v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
      const findItem = (id) => {
        const row = cadastro.get(String(id));
        if(!row) return null;
        const nome = row.produto_base ? `${row.produto_base} ${row.produto || ""}`.trim() : (row.produto || "Item");
        const dims = [row.largura, row.altura, row.profundidade].map((v) => numero(v) === null ? null : Math.round(numero(v) * 100));
        return {
          name: nome, fullName: String(row.descricao_total || "").trim() || nome, photo: row.foto_url || "",
          referencia: row.referencia || row.codigo || "", catLabel: row.categoria || "",
          dims: dims.every((v) => v === null) ? "" : dims.map((v) => v ?? "–").join(" × ") + " cm",
          rentalPrice: numero(row.valor_locacao), replacementPrice: numero(row.valor_reposicao)
        };
      };
      const [{ data: empresa }, { data: cliente }] = await Promise.all([
        state.supabase.from("empresas").select("nome,logo_url").eq("id", state.empresaId).maybeSingle(),
        state.supabase.from("clientes_empresas").select("nome_razao,catalogo_logo_url").eq("id", projeto.cliente_id).maybeSingle()
      ]);
      const logo = String(cliente?.catalogo_logo_url || "");
      const { dadosApresentacao, abrirVisualizacaoPedido } = apresentacaoModulo;
      abrirVisualizacaoPedido({
        titulo: `Projeto do catálogo · ${projeto.noivos || ""}`,
        model: { ...dadosApresentacao(projeto, findItem), semAviso: true }, empresa,
        decorador: { nome: cliente?.nome_razao || pedido.cliente, logo_url: /^https?:/i.test(logo) ? logo : "" }
      });
    }catch(error){
      console.error("Visualizar projeto do catálogo:", error);
      avisar("Nao foi possivel abrir o projeto do catalogo.", "Visualizar", "erro");
    }
  }

  /* Pré-reserva com validade (out/2026): até quando o item fica pré-reservado e se está vencendo. */
  function prazoPreReserva(pedido){
    if(pedido.status !== "pre_reserva") return null;
    if(!pedido.pre_reserva_ate) return { cls: "sem-data", texto: "Sem data de validade", ordem: -1 };
    const hoje = new Date(new Date().toLocaleDateString("sv-SE") + "T00:00:00");
    const ate = new Date(String(pedido.pre_reserva_ate).slice(0, 10) + "T00:00:00");
    const dias = Math.round((ate - hoje) / 86400000);
    const data = ate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if(dias < 0) return { cls: "vencida", texto: `Vencida há ${-dias} dia${dias === -1 ? "" : "s"} (${data})`, ordem: -2 };
    if(dias === 0) return { cls: "vencendo", texto: "Vence hoje", ordem: 0 };
    if(dias <= 3) return { cls: "vencendo", texto: `Vence em ${dias} dia${dias === 1 ? "" : "s"} (${data})`, ordem: dias };
    return { cls: "ok", texto: `Válida até ${data}`, ordem: dias };
  }
  function prazoHtml(pedido){
    const prazo = prazoPreReserva(pedido);
    return prazo ? `<span class="pre-reserva-prazo ${prazo.cls}">${escapeHtml(prazo.texto)}</span>` : "";
  }

  /* Botões de situação (out/2026): Todos, Pré-reserva, Orçamento e Reservado, Pré-reserva e Orçamento com a contagem numa bolinha
     vermelha piscando (Todos e Reservado sem bolinha). Clicar filtra a lista pela situação (mesmo filtro de "Situação" dos Filtros); clicar de novo mostra todos. */
  const SITUACOES = [
    { status: "", titulo: "Todos", icone: "list" },
    { status: "pre_reserva", titulo: "Pré-reserva", icone: "alarm-clock", alerta: true },
    { status: "orcamento", titulo: "Orçamento", icone: "file-text", alerta: true },
    { status: "aprovado", titulo: "Reservado", icone: "calendar-check" },
    // Catálogo (nov/2026): pedidos enviados pelo decorador que o Comercial ainda precisa finalizar (pagamento, frete, montagem)
    { status: "catalogo", titulo: "Catálogo", icone: "book-open", alerta: true }
  ];
  const CATALOGO_PENDENTE = ["catalogo_pedido_enviado", "catalogo_em_analise"];
  function renderAvisoPreReserva(){
    const caixa = $("centralSituacoes");
    if(!caixa) return;
    const atual = els.filtroStatusPedido?.value || "";
    caixa.innerHTML = SITUACOES.map((sit) => {
      const lista = sit.status === "catalogo" ? state.pedidos.filter((p) => CATALOGO_PENDENTE.includes(p.status)) : sit.status ? state.pedidos.filter((p) => p.status === sit.status) : state.pedidos;
      let detalhe = "";
      if(sit.status === "pre_reserva"){
        const pre = lista.map(prazoPreReserva);
        const vencidas = pre.filter((x) => x.cls === "vencida").length;
        const vencendo = pre.filter((x) => x.cls === "vencendo").length;
        const semData = pre.filter((x) => x.cls === "sem-data").length;
        detalhe = [vencidas && `${vencidas} vencida${vencidas > 1 ? "s" : ""}`, vencendo && `${vencendo} vencendo`, semData && `${semData} sem data`].filter(Boolean).join(" · ");
      }
      const ativo = atual === sit.status;
      return `<button type="button" class="central-situacao situacao-${sit.status}${ativo ? " is-active" : ""}" data-situacao="${sit.status}" aria-pressed="${ativo}" title="${!sit.status ? "Mostrar todos os pedidos" : ativo ? "Mostrar todos" : "Mostrar só " + escapeHtml(sit.titulo)}">
        <i data-lucide="${sit.icone}" aria-hidden="true"></i><span class="central-situacao-texto"><b>${escapeHtml(sit.titulo)}</b>${detalhe ? `<small>${escapeHtml(detalhe)}</small>` : ""}</span>
        ${sit.alerta && lista.length ? `<span class="central-situacao-conta" aria-label="${lista.length} pedido(s)">${lista.length}</span>` : ""}
      </button>`;
    }).join("");
    window.lucide?.createIcons?.();
  }

  function aplicarFiltros(){
    const normalizarBusca = (valor) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const termos = normalizarBusca(els.pesquisaGeralPedidos?.value).trim().split(/\s+/).filter(Boolean);
    const cliente = (els.filtroClientePedido?.value || "").trim().toLowerCase();
    const numero = (els.filtroNumeroPedido?.value || "").trim().toLowerCase();
    const local = (els.filtroLocalPedido?.value || "").trim().toLowerCase();
    const comercial = (els.filtroComercialPedido?.value || "").trim().toLowerCase();
    const status = els.filtroStatusPedido?.value || "";
    const inicial = els.filtroDataInicialPedido?.value;
    const final = els.filtroDataFinalPedido?.value;
    // os mesmos filtros valem para o Contas a receber (datas = vencimento da parcela)
    window.CentralContasReceber?.filtrar({ termos, cliente: normalizarBusca(cliente), numero: normalizarBusca(numero), local: normalizarBusca(local), status, de: inicial || "", ate: final || "" });

    state.filtrados = state.pedidos.filter((pedido) => {
      const dataPedido = pedido.data ? new Date(pedido.data) : null;
      const dataISO = dataPedido && !Number.isNaN(dataPedido.getTime())
        ? dataPedido.toISOString().slice(0, 10)
        : "";

      const textoBusca = normalizarBusca([
        pedido.numero, pedido.cliente, pedido.equipe, pedido.contato, formatPhone(pedido.contato),
        pedido.evento, pedido.local, pedido.comercial, pedido.status,
        formatStatusLabel(pedido.status), pedido.data, formatDate(pedido.data),
        pedido.valor, formatCurrency(pedido.valor)
      ].join(" "));

      return termos.every((termo) => textoBusca.includes(termo))
        && (!cliente || pedido.cliente.toLowerCase().includes(cliente) || String(pedido.equipe || "").toLowerCase().includes(cliente))
        && (!numero || String(pedido.numero).toLowerCase().includes(numero))
        && (!local || pedido.local.toLowerCase().includes(local))
        && (!comercial || pedido.comercial.toLowerCase().includes(comercial))
        && (!status || pedido.status === status || (status === "catalogo" && CATALOGO_PENDENTE.includes(pedido.status)))
        && (!inicial || dataISO >= inicial)
        && (!final || dataISO <= final);
    });
    ordenarLista(state.filtrados);
    // Pedido extra (out/2026): aparece logo abaixo do pedido principal (quando os dois estão na lista)
    const idsLista = new Set(state.filtrados.map((p) => String(p.id)));
    const extrasDe = new Map(), principais = [];
    for(const p of state.filtrados){
      const origem = p.origemId && idsLista.has(String(p.origemId)) ? String(p.origemId) : null;
      if(origem){ if(!extrasDe.has(origem)) extrasDe.set(origem, []); extrasDe.get(origem).push(p); } else principais.push(p);
    }
    state.filtrados = principais.flatMap((p) => [p, ...(extrasDe.get(String(p.id)) || [])
      .sort((a, b) => String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }))]);

    render();
  }

  // Ordem da tabela (out/2026): escolhida no cabeçalho ("Ordenar por") e lembrada no navegador.
  // "Padrão" = pré-reservas no topo (a que vence primeiro em cima), depois quem está montando agora, depois evento mais recente.
  const ORDENS = [
    ["padrao", "Padrão (pré-reservas primeiro)"],
    ["evento_proximo", "Evento mais próximo"],
    ["evento_recente", "Data do evento (mais recente)"],
    ["evento_antigo", "Data do evento (mais antiga)"],
    ["entrega_proxima", "Entrega mais próxima"],
    ["numero_desc", "Nº do pedido (maior primeiro)"],
    ["numero_asc", "Nº do pedido (menor primeiro)"],
    ["cliente", "Cliente (A a Z)"],
    ["valor", "Maior valor"]
  ];
  function ordemAtual(){
    if(!state.ordem){ try{ state.ordem = localStorage.getItem("central_pedidos_ordem") || "padrao"; }catch{ state.ordem = "padrao"; } }
    if(!ORDENS.some(([k]) => k === state.ordem)) state.ordem = "padrao";
    return state.ordem;
  }
  function ordenarLista(lista){
    const hoje = new Date().toLocaleDateString("sv-SE");
    const dia = (v) => String(v || "").slice(0, 10);
    const num = (p) => String(p.numero || "");
    const porNumero = (a, b) => num(a).localeCompare(num(b), "pt-BR", { numeric: true });
    // próximos primeiro (mais perto de hoje em cima); os que já passaram vão para o fim, do mais recente ao mais antigo
    const proximo = (campo) => (a, b) => {
      const da = dia(a[campo]), db = dia(b[campo]), fa = da && da >= hoje, fb = db && db >= hoje;
      if(fa !== fb) return fa ? -1 : 1;
      if(!da || !db) return da ? -1 : db ? 1 : 0;
      return fa ? da.localeCompare(db) : db.localeCompare(da);
    };
    const ativo = (p) => (presencaDe(p)?.ativo ? 1 : 0);
    const pre = (p) => (p.status === "pre_reserva" ? 1 : 0);
    const cmp = {
      padrao: (a, b) => (pre(b) - pre(a)) || (pre(a) ? prazoPreReserva(a).ordem - prazoPreReserva(b).ordem : 0) || (ativo(b) - ativo(a)) || dia(b.data).localeCompare(dia(a.data)),
      evento_proximo: proximo("data"),
      evento_recente: (a, b) => dia(b.data).localeCompare(dia(a.data)),
      evento_antigo: (a, b) => (dia(a.data) || "9999").localeCompare(dia(b.data) || "9999"),
      entrega_proxima: proximo("entrega"),
      numero_desc: (a, b) => porNumero(b, a),
      numero_asc: porNumero,
      cliente: (a, b) => String(a.cliente || "").localeCompare(String(b.cliente || ""), "pt-BR", { sensitivity: "base" }) || dia(b.data).localeCompare(dia(a.data)),
      valor: (a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0)
    }[ordemAtual()];
    lista.sort((a, b) => cmp(a, b) || porNumero(b, a));
    return lista;
  }
  function montarSeletorOrdem(){
    const sel = document.getElementById("centralOrdem");
    if(!sel || sel.dataset.pronto) return;
    sel.dataset.pronto = "1";
    sel.innerHTML = ORDENS.map(([k, t]) => '<option value="' + k + '">' + t + "</option>").join("");
    sel.value = ordemAtual();
    sel.addEventListener("change", () => {
      state.ordem = sel.value;
      try{ localStorage.setItem("central_pedidos_ordem", state.ordem); }catch{}
      aplicarFiltros();
    });
  }

  function renderFluxoPedido(pedido){
    // fluxo completo (out/2026): depois da coleta vêm o descarregamento e a triagem da volta; depois da posição final, o pós-venda
    const etapas=['Comercial','Triagem','Carregamento','Entrega','Coleta','Descarregamento','Triagem (volta)','Posição final','Pós-venda','Finalizado'];
    const etapa=pedido.origemCatalogo?'comercial':pedido.fluxo?.etapa;
    const f=pedido.fluxo||{};
    const indice=f.finalizado?9:f.posicao_final?8:({comercial:0,pre_reserva:0,triagem:1,expedicao:2,entrega:3,coleta:4,retorno_simultaneo:5,descarregamento:5,triagem_retorno:6,posicao_final:7})[etapa];
    const cancelado=pedido.status==='cancelado'||etapa==='cancelado';
    const descricao=cancelado?'Cancelado':indice==null?'Fluxo indisponível':(indice===5&&etapa==='retorno_simultaneo'?'Descarregamento e triagem da volta ao mesmo tempo':null)||(indice===8?'Pós-venda: aguardando a ligação para o cliente':null)||(indice===0?formatStatusLabel(pedido.status):etapas[indice]);
    const corComercial=cancelado?'vermelho':indice===0?(pedido.status==='pre_reserva'?'amarelo':['aprovado','enviado','finalizado'].includes(pedido.status)?'verde':'azul'):'';
    const notaExtra=f.unificado?'<small class="central-fluxo-descricao">Da coleta em diante: junto com o pedido '+escapeHtml(String(pedido.numero).split('/')[0])+'</small>':'';
    const nota=notaExtra||(f.posicao_final&&f.posvenda_feita&&f.financeiro_pendente?'<small class="central-fluxo-descricao">Pós-venda feito · financeiro pendente</small>':f.operacao_concluida&&f.financeiro_pendente&&!f.posicao_final?'<small class="central-fluxo-descricao">Operação concluída · financeiro pendente</small>':(!cancelado&&indice==null)||etapa==='retorno_simultaneo'?'<small class="central-fluxo-descricao">'+escapeHtml(descricao)+'</small>':'');
    return '<div class="central-fluxo'+(cancelado?' is-cancelado':'')+(corComercial?' comercial-'+corComercial:'')+'" title="'+escapeHtml(descricao)+'" aria-label="'+escapeHtml('Etapa atual: '+descricao)+'"><ol>'+etapas.map((nome,i)=>'<li class="'+(!cancelado&&indice!=null?(i<indice?'is-concluida':i===indice?'is-atual':''):'')+'"'+(!cancelado&&i===indice?' aria-current="step"':'')+'><span class="central-fluxo-ponto" aria-hidden="true">'+(!cancelado&&indice!=null&&i<indice?'✓':i+1)+'</span><span>'+nome+'</span></li>').join('')+'</ol>'+nota+'</div>';
  }

  async function enriquecerFluxoPedidos(pedidos){
    if(!pedidos.length)return pedidos;
    try{
      const {data,error}=await state.supabase.rpc('comercial_fluxo_pedidos',{p_empresa:state.empresaId,p_pedidos:pedidos.map(p=>p.id)});
      if(error)throw error;
      const fluxos=new Map((Array.isArray(data)?data:[]).map(f=>[f.id,f]));
      return pedidos.map(p=>({...p,fluxo:fluxos.get(p.id)||null}));
    }catch(e){console.warn('Não foi possível consultar o fluxo dos pedidos:',e.message);return pedidos;}
  }

  // o "% pago" vem das contas a receber do Financeiro (recebimentos confirmados lá), não do que ficou gravado no pedido
  async function enriquecerRecebimentos(rows){
    const ids = rows.map((r) => r.id).filter(Boolean);
    if(!ids.length) return rows;
    const porPedido = new Map();
    try{
      for(let i = 0; i < ids.length; i += 150){
        const { data, error } = await state.supabase.rpc("pedidos_recebimentos", { p_empresa: state.empresaId, p_pedidos: ids.slice(i, i + 150) });
        if(error) throw error;
        (data || []).forEach((t) => porPedido.set(t.pedido_id, { devido: Number(t.devido) || 0, recebido: Number(t.recebido) || 0, proximo: t.proximo ? String(t.proximo).slice(0, 10) : "", titulos: Number(t.titulos) || 0 }));
      }
    }catch(e){ console.warn("[CentralPedidos] contas a receber indisponiveis:", e.message); return rows; }
    return rows.map((r) => porPedido.has(r.id) ? { ...r, fin: porPedido.get(r.id) } : r);
  }

  function render(){
    if(els.centralStatusCarregamento){
      els.centralStatusCarregamento.textContent = `${state.filtrados.length} pedido(s)`;
    }
    renderAvisoPreReserva();

    if(!els.centralPedidosTbody) return;
    if(window.ComercialProdutividade && renderAcompanhamentos()) return;

    if(!state.filtrados.length){
      els.centralPedidosTbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="central-empty">
              Nenhum pedido encontrado. Use "Novo Pedido" para montar um evento.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    els.centralPedidosTbody.innerHTML = state.filtrados.map((pedido) => `
      <tr data-pedido-id="${escapeHtml(pedido.id)}" class="${pedido.origemCatalogo ? "is-catalogo" : ""}${pedido.origemId ? " is-extra" : ""}${presencaDe(pedido)?.ativo ? " is-montando" : ""}" title="${pedido.origemCatalogo ? "Projeto do catálogo: clique duas vezes para abrir como pedido" : "Clique duas vezes para abrir o pedido"}">
        <td><span class="pedido-numero-card${pedido.origemCatalogo ? " pedido-numero-catalogo" : ""}" title="${pedido.origemCatalogo ? "Veio do catálogo" : "Pedido comercial"}" aria-label="${pedido.origemCatalogo ? "Pedido do catálogo" : "Pedido comercial"} ${escapeHtml(pedido.numero)}">${escapeHtml(pedido.numero)}</span>${presencaHtml(pedido)}</td>
        <td>
          <button type="button" class="central-record-link" data-action="abrir-cliente" title="Abrir cadastro do cliente">
            ${escapeHtml(pedido.cliente)}
          </button>${pedido.equipe ? `<small class="pedido-equipe-tag" title="Equipe do pedido">${escapeHtml(pedido.equipe)}</small>` : ""}
        </td>
        <td>
          <button type="button" class="central-record-link" data-action="abrir-local" title="Abrir cadastro do local">
            ${escapeHtml(pedido.local)}
          </button>
        </td>
        <td>${escapeHtml(formatDate(pedido.data))}</td>
        <td>${pedido.entrega ? escapeHtml(formatDate(pedido.entrega)) : "—"}</td>
        <td>${pedido.coleta ? escapeHtml(formatDate(pedido.coleta)) : "—"}</td>
        <td class="central-fluxo-cell">${renderFluxoPedido(pedido)}${prazoHtml(pedido)}</td>
        <td class="central-value-cell">${renderValorFinanceiro(pedido)}</td>
        <td>
          <div class="central-actions">
            <button type="button" class="central-icon-action whatsapp" data-action="whatsapp" title="Enviar WhatsApp" aria-label="Enviar WhatsApp">
              <i data-lucide="message-circle"></i>
            </button>
            ${pedido.origemCatalogo ? "" : `<button type="button" class="central-icon-action pix" data-action="pix" title="Gerar PIX" aria-label="Gerar PIX">
              <i data-lucide="qr-code"></i>
            </button>`}
          </div>
        </td>
      </tr>
    `).join("");
    window.lucide?.createIcons?.();
    ligarExtras();
  }

  // Colchete na margem externa da tabela, do centro do principal até o último extra.
  // Os números ficam alinhados; as posições são medidas novamente quando as linhas mudam de altura.
  let ligacaoObservada = false;
  function ligarExtras(){
    const wrap = els.centralPedidosTbody?.closest(".central-table-wrap");
    if(!wrap) return;
    wrap.querySelectorAll(".central-extra-ligacao").forEach((el) => el.remove());
    const base = wrap.getBoundingClientRect();
    const pos = (el) => { const r = el.getBoundingClientRect(); return { left: r.left - base.left + wrap.scrollLeft, top: r.top - base.top + wrap.scrollTop, bottom: r.bottom - base.top + wrap.scrollTop, height: r.height }; };
    const porId = new Map([...els.centralPedidosTbody.querySelectorAll("tr[data-pedido-id]")].map((tr) => [tr.dataset.pedidoId, tr]));
    const grupos = new Map();
    for(const pedido of state.filtrados){
      if(!pedido.origemId) continue;
      const id = String(pedido.origemId);
      if(!grupos.has(id)) grupos.set(id, []);
      const filho = porId.get(String(pedido.id))?.querySelector('.pedido-numero-card');
      if(filho) grupos.get(id).push(pos(filho));
    }
    for(const [id, filhos] of grupos){
      const trPai = porId.get(id), pai = trPai?.querySelector('.pedido-numero-card');
      if(!pai || !filhos.length) continue;
      const a = pos(pai), coluna = pos(trPai.cells[0]);
      const y = a.top + a.height / 2;
      const centros = filhos.map(b => b.top + b.height / 2).filter(centro => centro > y);
      if(!centros.length) continue;
      const fim = Math.max(...centros);
      const linha = document.createElement("span");
      linha.className = "central-extra-ligacao";
      linha.setAttribute("aria-hidden", "true");
      linha.style.cssText = "left:" + (coluna.left - 18) + "px;top:" + y + "px;width:14px;height:" + (fim - y) + "px";
      for(const centro of centros.filter(centro => centro < fim)){
        const ramo = document.createElement('span'); ramo.className = 'central-extra-ramo';
        ramo.style.top = (centro - y - 1.5) + 'px'; linha.append(ramo);
      }
      wrap.append(linha);
    }
    if(!ligacaoObservada && "ResizeObserver" in window){
      ligacaoObservada = true;
      let pendente = 0;
      new ResizeObserver(() => { cancelAnimationFrame(pendente); pendente = requestAnimationFrame(ligarExtras); }).observe(els.centralPedidosTbody);
    }
  }

  async function carregarPedidos(){
    if(els.centralStatusCarregamento) els.centralStatusCarregamento.textContent = "Carregando...";

    if(!state.supabase || !state.empresaId){
      state.pedidos = [];
      state.filtrados = [];
      render();
      window.finalizarCarregamentoModulo?.();
      return;
    }

    try{
      const { data:{ session } } = await state.supabase.auth.getSession();
      if(!session?.access_token){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          causa: "Sessao ausente/expirada antes da consulta"
        });
        throw new Error("Sessao ausente para carregar pedidos");
      }

      const { data, error } = await state.supabase
        .from("separacoes_pedidos")
        .select("*")
        .eq("empresa_id", state.empresaId)
        .order("data_hora", { ascending: false })
        .limit(200);

      if(error){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          empresaId: state.empresaId,
          erro: error
        });
        if(isTabelaAusente(error)) marcarTabelasSeparacaoAusentes();
        throw error;
      }
      const doCatalogo = await carregarProjetosCatalogo().catch((error) => {
        console.warn("[CentralPedidos] projetos do catalogo indisponiveis:", error);
        return [];
      });
      const comFluxo=await enriquecerRecebimentos(await enriquecerFluxoPedidos(data||[]));
      state.pedidos = await enriquecerContatosClientes([...comFluxo.map(normalizarPedido), ...doCatalogo]);
      state.pedidos.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
      sincronizarInatividadeCadastros(data || []).catch((error) => {
        console.warn("[CentralPedidos] sincronizacao de inatividade falhou:", error);
      });
    }catch(err){
      console.warn("Central de Pedidos sem tabela de pedidos disponivel:", err);
      state.pedidos = [];
      if(els.centralStatusCarregamento){
        els.centralStatusCarregamento.textContent = "Tabela de pedidos indisponivel";
      }
    }

    aplicarFiltros();
    window.finalizarCarregamentoModulo?.();
  }

  function setupRealtime(){
    if(!state.supabase?.channel || !state.empresaId || state.realtimeChannel) return;

    state.realtimeChannel = state.supabase
      .channel(`central-pedidos-${state.empresaId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "separacoes_pedidos",
        filter: `empresa_id=eq.${state.empresaId}`
      }, () => carregarPedidos())
      .subscribe();
  }

  // Pedidos | Contas a receber (out/2026): a mesma página mostra a lista de pedidos ou as contas a receber (só leitura)
  function trocarVisao(visao){
    state.visao=visao;
    const receber = visao === "receber";
    document.querySelectorAll("[data-central-visao]").forEach((b) => { const on = b.dataset.centralVisao === visao; b.classList.toggle("ativa", on); b.setAttribute("aria-pressed", String(on)); });
    const host = document.getElementById("centralContasReceber");
    ["centralSituacoes", "centralListaTabela"].forEach((id) => { const el = document.getElementById(id); if(el) el.hidden = receber; });
    document.querySelector(".central-barra .central-ordem")?.toggleAttribute("hidden", receber);
    // nas contas a receber as datas do filtro são o vencimento da parcela; "Comercial" não se aplica
    const rotulo = (id, texto) => { const l = document.getElementById(id)?.closest(".el-field")?.querySelector("label"); if(l) l.textContent = texto; };
    rotulo("filtroDataInicialPedido", receber ? "Vencimento de" : "Data Inicial");
    rotulo("filtroDataFinalPedido", receber ? "Vencimento até" : "Data Final");
    const comercialCampo = document.getElementById("filtroComercialPedido")?.closest(".el-field");
    if(comercialCampo) comercialCampo.hidden = receber;
    if(host) host.hidden = !receber;
    if(acompanhamentoFiltros) acompanhamentoFiltros.hidden=receber||!['orcamento','pre_reserva'].includes(els.filtroStatusPedido?.value);
    els.centralFiltrosPedidos?.setAttribute('aria-label',receber?'Filtros de contas a receber':'Filtros de pedidos');
    if(receber && host){ aplicarFiltros(); window.CentralContasReceber?.abrir(host).then(atualizarBadgeReceber); }
  }
  async function atualizarBadgeReceber(){
    const badge = document.getElementById("centralReceberBadge");
    if(!badge || !window.CentralContasReceber) return;
    const n = await window.CentralContasReceber.contarAlertas();
    badge.textContent = n ? String(n) : ""; badge.hidden = !n;
    badge.title = n ? n + " parcela(s) vencida(s) ou vencendo hoje" : "";
  }

  function bindEvents(){
    montarSeletorOrdem();
    document.querySelector(".central-visao")?.addEventListener("click", (event) => {
      const b = event.target.closest("[data-central-visao]");
      if(b) trocarVisao(b.dataset.centralVisao);
    });
    setTimeout(() => atualizarBadgeReceber().catch(() => {}), 800);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')carregarPedidos();});
    els.pesquisaGeralPedidos?.addEventListener("input", aplicarFiltros);
    els.btnFiltrosPedidos?.addEventListener("click", () => {
      const panel = els.centralFiltrosPedidos;
      if (!panel) return;
      panel.hidden = !panel.hidden;
      els.btnFiltrosPedidos.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) els.filtroClientePedido?.focus();
    });
    els.btnNovoPedidoCentral?.addEventListener("click", () => abrirPedido());
    // Atalho pro catálogo (out/2026): botão e teclado — F2 abre o catálogo, F4 abre já na pesquisa (Alt+C/Alt+P também).
    const abrirCatalogo = (pesquisar) => {
      const href = "Modulos/Comercial/Catalogo/catalogo.html" + (pesquisar ? "?pesquisar=1" : "");
      try { if (window.parent !== window && window.parent.shellNavigate) { window.parent.shellNavigate(href); return; } } catch (e) {}
      location.href = "../Catalogo/catalogo.html" + (pesquisar ? "?pesquisar=1" : "");
    };
    document.getElementById("btnCatalogoCentral")?.addEventListener("click", () => abrirCatalogo(false));
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      const acao = !event.altKey ? (event.key === "F2" ? "catalogo" : event.key === "F4" ? "pesquisar" : "") : (event.code === "KeyC" ? "catalogo" : event.code === "KeyP" ? "pesquisar" : "");
      if (!acao) return;
      if (document.querySelector("dialog[open], .modal.open, .modal:not(.hidden)[aria-hidden=false]")) return;
      event.preventDefault();
      abrirCatalogo(acao === "pesquisar");
    });
    els.btnTabelasPreco?.addEventListener("click", () => {
      // Dentro do dashboard abre pelo shell (registra no histórico e confere permissão);
      // aberta sozinha, navega direto.
      try { if (window.parent !== window && window.parent.shellNavigate) { window.parent.shellNavigate("Modulos/Estoque/TabelasPreco/tabelas-preco.html"); return; } } catch (e) {}
      location.href = "../../Estoque/TabelasPreco/tabelas-preco.html";
    });
    els.btnFecharWhatsappPedido?.addEventListener("click", fecharModalWhatsapp);
    els.btnCancelarWhatsappPedido?.addEventListener("click", fecharModalWhatsapp);
    els.btnEnviarWhatsappPedido?.addEventListener("click", enviarWhatsappPedido);
    els.centralWhatsappModal?.addEventListener("click", (event) => {
      if(event.target === els.centralWhatsappModal) fecharModalWhatsapp();
    });
    els.btnFecharCadastroRelacionado?.addEventListener("click", () => {
      els.centralCadastroRelacionadoModal?.classList.add("hidden");
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape" && !els.centralCadastroRelacionadoModal?.classList.contains("hidden")) els.centralCadastroRelacionadoModal.classList.add("hidden");
    });
    els.centralCadastroRelacionadoModal?.addEventListener("click", (event) => {
      const linhaPedido = event.target.closest("[data-cad-pedido]");
      if(linhaPedido){ abrirPedido(linhaPedido.dataset.cadPedido, "editar"); return; }
      if(event.target === els.centralCadastroRelacionadoModal){
        els.centralCadastroRelacionadoModal.classList.add("hidden");
      }
    });

    [
      els.filtroClientePedido,
      els.filtroNumeroPedido,
      els.filtroLocalPedido,
      els.filtroComercialPedido,
      els.filtroStatusPedido,
      els.filtroDataInicialPedido,
      els.filtroDataFinalPedido
    ].forEach((el) => {
      el?.addEventListener("input", aplicarFiltros);
      el?.addEventListener("change", aplicarFiltros);
    });

    els.centralPedidosTbody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if(!button) return;

      const row = button.closest("[data-pedido-id]");
      const pedidoId = row?.dataset?.pedidoId || "";
      const action = button.dataset.action;
      const pedido = state.pedidos.find((item) => String(item.id) === String(pedidoId));

      if(action === 'acompanhar'){
        window.ComercialProdutividade.abrir(pedido,state.empresaId,()=>{window.location.href='pedido.html?pedido='+encodeURIComponent(pedidoId)+'&cancelar=1';}).catch(e=>window.alert(e.message));
        return;
      }

      if(action === "abrir-cliente"){
        abrirCadastroRelacionado("cliente", pedido);
        return;
      }

      if(action === "abrir-local"){
        abrirCadastroRelacionado("local", pedido);
        return;
      }

      if(action === "visualizar"){
        if(pedido?.origemCatalogo){ abrirPreviewProjetoCatalogo(pedido); return; }
        abrirPreviewPedido(pedidoId);
        return;
      }

      if(action === "contrato"){
        abrirPedido(pedidoId);
        return;
      }

      if(action === "whatsapp"){
        abrirModalWhatsapp(pedido);
        return;
      }

      if(action === "pix"){
        abrirPixPedido(pedido);
      }
    });

    $("centralSituacoes")?.addEventListener("click", (event) => {
      const botao = event.target.closest("[data-situacao]");
      if(!botao || !els.filtroStatusPedido) return;
      const status = botao.dataset.situacao;
      els.filtroStatusPedido.value = status && els.filtroStatusPedido.value === status ? "" : status;
      aplicarFiltros();
    });

    els.centralPedidosTbody?.addEventListener("dblclick", (event) => {
      if(event.target.closest("[data-action]")) return;
      const row = event.target.closest("[data-pedido-id]");
      const pedidoId = row?.dataset?.pedidoId || "";
      const doCatalogo = state.pedidos.find((item) => String(item.id) === String(pedidoId) && item.origemCatalogo);
      if(doCatalogo){ window.location.href = `pedido.html?projeto=${encodeURIComponent(doCatalogo.projetoId)}&modo=editar`; return; }
      if(pedidoId) abrirPedido(pedidoId, "editar");
    });

    state.onFinanceiroAtualizado = () => carregarPedidos();
    state.onPixAtualizado = () => carregarPedidos();
    state.onStorageFinanceiroAtualizado = (event) => {
      if(event.key === "easyloc:pedido-financeiro-atualizado") carregarPedidos();
    };
    window.addEventListener("easyloc:pedido-financeiro-atualizado", state.onFinanceiroAtualizado);
    window.addEventListener("easyloc:pix-atualizado", state.onPixAtualizado);
    window.addEventListener("storage", state.onStorageFinanceiroAtualizado);
  }

  async function init(){
    cacheEls();
    state.supabase = window.supabaseClient;
    await window.aguardarContexto?.(); // espera a empresa ser identificada (ver CLAUDE.md, "aguardarContexto")
    state.empresaId = window.__CONTEXT?.empresa_id;
    state.onContatoSalvo=()=>carregarAcompanhamentos().catch(e=>{acompanhamentoErro=e.message;render();});
    window.addEventListener('comercial:contato-salvo',state.onContatoSalvo);
    state.onContatoSalvo();
    bindEvents();
    try{ localStorage.removeItem("central_pedidos_visao"); }catch{}
    await carregarPedidos();
    setupRealtime();
    iniciarPresenca();
  }

  function destroy(){
    window.removeEventListener('comercial:contato-salvo',state.onContatoSalvo);
    clearInterval(state.presencaTimer);
    if(state.onFinanceiroAtualizado){
      window.removeEventListener("easyloc:pedido-financeiro-atualizado", state.onFinanceiroAtualizado);
    }
    if(state.onPixAtualizado){
      window.removeEventListener("easyloc:pix-atualizado", state.onPixAtualizado);
    }
    if(state.onStorageFinanceiroAtualizado){
      window.removeEventListener("storage", state.onStorageFinanceiroAtualizado);
    }
    if(state.realtimeChannel && state.supabase?.removeChannel){
      state.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    delete window.__centralPedidosLoaded;
  }

  async function initCentralPedidos(){
    if(window.__centralPedidosLoaded) return;
    window.__centralPedidosLoaded = true;
    await init();
  }

  requestAnimationFrame(() => requestAnimationFrame(initCentralPedidos));

  window.__activeModuleDestroy = destroy;
})();
