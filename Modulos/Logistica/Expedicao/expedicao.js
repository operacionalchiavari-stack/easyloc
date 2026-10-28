/* =====================================================
   EXPEDIÇÃO (out/2026) — ida e volta
   Quadro de 3 colunas, no visual da Separação: Aguardando conferência / Em conferência / Conferido.
   Cada pedido aprovado pode ter dois cartões:
   - Ida (carregamento): aparece desde que o pedido está para sair.
   - Retorno (volta): aparece depois que o carregamento foi concluído; cor lilás e selo "Retorno".
     A conferência de retorno é ÀS CEGAS: o cartão não mostra quantos volumes precisam voltar,
     só quantos já foram lidos. O sistema compara no fim (conferencia.html?etapa=retorno).
   Colunas: conferido = operacao.<etapa>.concluido_em (ou status_operacional); em conferência = alguma
   etiqueta lida naquela etapa; o resto aguarda. O cartão de ida conferido some quando a volta é conferida.
   Mostra pedidos com entrega ou coleta a partir de 15 dias atrás.
===================================================== */
(function () {
  "use strict";
  const STATUS_COMERCIAL = ["aprovado", "finalizado", "enviado"];
  const SEPARADO = new Set(["separado", "separado_com_divergencia"]);
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s = { sb: null, empresa: null, pedidos: [], volumes: new Map(), ocorrencias: new Map(), carregando: false };

  const dataBr = (v) => {
    if (!v) return "-";
    const d = new Date(String(v).length === 10 ? v + "T12:00:00" : v);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
  };
  const dataHoraBr = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  const local = (p) => p.local_nome || p.local_evento || p.local || "-";
  const vol = (p) => s.volumes.get(String(p.id)) || { total: 0, carregadas: 0, voltaram: 0, descarregadas: 0 };

  const idaConcluida = (p) => ["carregado", "retornado"].includes(p.status_operacional) || !!p.operacao?.carregamento?.concluido_em;
  const descargaConcluida = (p) => !!p.operacao?.descarregamento?.concluido_em;
  const voltaConcluida = (p) => p.status_operacional === "retornado" || !!p.operacao?.retorno?.concluido_em;
  function faltas(p,tipo){
    const etapa=tipo==='ida'?'carregamento':tipo;
    const registro=p.operacao?.[etapa];
    if(!registro?.concluido_em || p.encerrado_operacional_em)return [];
    const itens=Array.isArray(registro.faltando)?registro.faltando:Array.from({length:Math.min(Number(registro.faltando)||0,1000)},()=>({}));
    return itens.filter(item=>etapa!=='retorno'||!s.ocorrencias.get(String(p.id))?.get(item.codigo)?.resolvida_em);
  }
  const colunaFinal=(p,tipo)=>faltas(p,tipo).length?'pendencias':'conferidos';

  // Cartões do quadro: { p, tipo: "ida"|"retorno", col: "aguardando"|"andamento"|"conferidos" }
  function cartoes(lista) {
    const out = [];
    lista.filter(p=>!p.somente_consulta && ['expedicao','descarregamento','retorno_simultaneo'].includes(p.fluxo_etapa)).forEach((p) => {
      const tipo=p.fluxo_etapa==='expedicao'?'ida':'descarregamento';
      const registro=p.operacao?.[tipo==='ida'?'carregamento':'descarregamento'];
      out.push({p,tipo,col:registro?.iniciado_em?'andamento':'aguardando'});
    });
    const data = (c) => String((c.tipo !== "ida" ? c.p.data_coleta : c.p.data_entrega) || c.p.data_evento || "9999");
    return out.sort((a, b) => data(a).localeCompare(data(b)));
  }

  function cartao({ p, tipo, col }) {
    const v = vol(p);
    const volta = tipo === "retorno";
    const descarga = tipo === "descarregamento";
    const numero = String(p.numero_pedido || "-");
    const feito = p.operacao?.[volta ? "retorno" : descarga ? "descarregamento" : "carregamento"];
    let nota = p.fluxo_etapa==='retorno_simultaneo' ? 'Retorno simultâneo com a Triagem' : '';
    if ((col === "conferidos" || col === "pendencias") && feito) {
      const falta = faltas(p,tipo).length;
      nota = (volta ? "Retorno conferido " : descarga ? "Descarregado " : "Carregado ") + dataHoraBr(feito.concluido_em) + (feito.por ? " por " + feito.por : "") +
        (falta ? " · " + falta + (volta ? " não voltou" : " pendência(s)") : "");
    } else if (volta) {
      nota = "Conferência às cegas";
    } else if (!SEPARADO.has(p.status)) {
      nota = "Ainda em separação";
    } else if (!v.total && !nota) {
      nota = "Conferência por quantidade";
    }
    let progresso = "";
    if (col === "andamento" && !volta) {
      const lidas = descarga ? v.descarregadas : v.carregadas;
      const total = descarga ? v.carregadas : v.total;
      const pct = total ? Math.round((lidas / total) * 100) : 0;
      progresso = '<div class="separacao-card-progress"><span>' + pct + '%</span><div class="mini-progress"><span style="width:' + pct + '%"></span></div><strong>' + lidas + " / " + total + "</strong></div>";
    } else if (col === "andamento" && volta) {
      progresso = '<div class="exp-lidos">' + v.voltaram + " peça" + (v.voltaram === 1 ? "" : "s") + " lida" + (v.voltaram === 1 ? "" : "s") + "</div>";
    }
    const carregados = p.operacao?.carregamento?.caminhoes || p.operacao?.carregamento_caminhoes || [];
    const usaCarregados = volta || descarga || col === "conferidos" || col === "pendencias";
    const lista = usaCarregados ? carregados : (s.caminhoes?.get(String(p.id)) || []);
    const caminhoes = usaCarregados && !carregados.length ? "" :
      '<div class="exp-caminhoes' + (lista.length ? "" : " is-vazio") + '"><span>' + (usaCarregados ? "Carregado em" : "Caminhões programados") + "</span>" +
      (lista.length ? lista.map((c) => '<b title="' + esc([c.placa, c.modelo].filter(Boolean).join(" · ")) + '">' + esc(c.codigo || c.placa || "Caminhão") + (c.codigo && c.placa && !/^SEM PLACA/i.test(c.placa) ? "<small>" + esc(c.placa) + "</small>" : "") + "</b>").join("") : "<em>Nenhum caminhão programado no Painel Logístico</em>") + "</div>";
    const meta = (volta || descarga)
      ? "Coleta " + esc(dataBr(p.data_coleta || p.data_evento))
      : "Entrega " + esc(dataBr(p.data_entrega || p.data_evento)) + " · " + v.total + " volume" + (v.total === 1 ? "" : "s");
    return '<article class="separacao-order-card exp-card-' + tipo + '" data-coluna="' + col + '" data-tipo="' + tipo + '" data-pedido="' + esc(p.id) + '" tabindex="0" role="button">' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + esc(numero.startsWith("#") ? numero : "#" + numero) + "</span>" +
      '<span class="exp-tipo">' + (volta ? "Retorno" : descarga ? "Descarregamento" : "Ida") + "</span>" +
      (col === "conferidos" ? '<span class="separacao-done-mark">✓</span>' : "") + "</div>" +
      '<div class="separacao-card-mainline"><strong>' + esc(p.cliente_nome || "Cliente não informado") + "</strong><span>" +
      esc(p.tipo_evento || "Evento") + " · " + esc(local(p)) + "</span></div>" +
      '<div class="separacao-card-meta-line">' + meta + "</div>" +
      caminhoes +
      progresso + (nota ? '<div class="separacao-lock-note">' + esc(nota) + "</div>" : "") +
      (col==='pendencias'?'<div class="exp-pendencia-resumo"><b>'+faltas(p,tipo).length+' item(ns) com pendência</b>'+faltas(p,tipo).filter(f=>f.item).slice(0,3).map(f=>'<small>'+esc(f.item)+(f.faltam?' · '+esc(f.faltam)+' faltante(s)':'')+'</small>').join('')+'</div>':'') + "</article>";
  }

  function pintar() {
    const termo = ($("expBusca").value || "").trim().toLowerCase();
    const lista = s.pedidos.filter((p) => !termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, local(p)].join(" ").toLowerCase().includes(termo));
    const grupos = { aguardando: [], andamento: [], conferidos: [], pendencias: [] };
    cartoes(lista).forEach((c) => grupos[c.col].push(c));
    const vazio = { aguardando: "Nada aguardando conferência.", andamento: "Nenhuma conferência em andamento.", conferidos: "Nada conferido por enquanto.", pendencias: "Nenhuma pendência de conferência." };
    [["aguardando", "expColAguardando", "expContAguardando"], ["andamento", "expColAndamento", "expContAndamento"], ["conferidos", "expColCarregados", "expContCarregados"], ["pendencias", "expColPendencias", "expContPendencias"]].forEach(([g, col, cont]) => {
      $(cont).textContent = grupos[g].length;
      $(col).innerHTML = grupos[g].length ? grupos[g].map(cartao).join("") : '<div class="empty-state">' + vazio[g] + "</div>";
    });
  }

  async function etiquetasDe(ids) {
    const linhas = [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      for (let de = 0; ; de += 1000) {
        const { data, error } = await s.sb.from("separacoes_etiquetas").select("separacao_pedido_id,lida_carregamento_em,lida_retorno_em,lida_descarregamento_em")
          .eq("empresa_id", s.empresa).in("separacao_pedido_id", lote).range(de, de + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    return linhas;
  }

  async function carregar() {
    if (s.carregando || !s.sb || !s.empresa) return;
    s.carregando = true;
    try {
      s.pedidos = await window.PedidoFluxo.fila(s.sb,s.empresa,'expedicao');
      s.ocorrencias=new Map();
      for(let i=0;i<s.pedidos.length;i+=100){
        const {data:ocorrencias,error:erroOcorrencias}=await s.sb.from('operacao_ocorrencias').select('pedido_id,codigo,resolvida_em').eq('empresa_id',s.empresa).eq('tipo','falta').in('pedido_id',s.pedidos.slice(i,i+100).map(p=>p.id));
        if(erroOcorrencias)throw erroOcorrencias;
        for(const o of ocorrencias||[]){const mapa=s.ocorrencias.get(String(o.pedido_id))||new Map();mapa.set(o.codigo,o);s.ocorrencias.set(String(o.pedido_id),mapa);}
      }
      s.caminhoes=new Map();
      for(let i=0;i<s.pedidos.length;i+=100){
        const {data:cams,error:erroCam}=await s.sb.rpc('operacao_caminhoes_programados',{p_pedidos:s.pedidos.slice(i,i+100).map(p=>p.id)});
        if(erroCam){console.warn('caminhões programados',erroCam);break;}
        for(const c of cams||[]){const k=String(c.pedido_id);const l=s.caminhoes.get(k)||[];l.push(c);s.caminhoes.set(k,l);}
      }
      const etq = await etiquetasDe(s.pedidos.map((p) => p.id));
      s.volumes = new Map();
      etq.forEach((e) => {
        const k = String(e.separacao_pedido_id);
        const v = s.volumes.get(k) || { total: 0, carregadas: 0, voltaram: 0, descarregadas: 0 };
        v.total += 1;
        if (e.lida_carregamento_em) v.carregadas += 1;
        if (e.lida_retorno_em) v.voltaram += 1;
        if (e.lida_descarregamento_em) v.descarregadas += 1;
        s.volumes.set(k, v);
      });
      pintar();
    } catch (e) {
      console.error(e);
      $("expColAguardando").innerHTML = '<div class="empty-state">Não foi possível carregar os pedidos.</div>';
    } finally {
      s.carregando = false;
      window.finalizarCarregamentoModulo?.();
    }
  }

  function abrir(id, tipo) {
    const query = "?pedido=" + encodeURIComponent(id) + "&etapa=" + (tipo === "retorno" ? "retorno" : tipo === "descarregamento" ? "descarregamento" : "carregamento") + "&de=expedicao";
    try {
      if (window.top !== window && typeof window.top.shellNavigate === "function") {
        window.top.shellNavigate("Modulos/Logistica/Conferencia/conferencia.html" + query); return;
      }
    } catch (_) { /* outra origem */ }
    location.href = "../Conferencia/conferencia.html" + query;
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    $("expBusca").addEventListener("input", pintar);
    const quadro = document.querySelector(".separacao-kanban");
    quadro.addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-pedido]"); if (card) abrir(card.dataset.pedido, card.dataset.tipo);
    });
    quadro.addEventListener("keydown", (ev) => {
      const card = ev.target.closest("[data-pedido]");
      if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrir(card.dataset.pedido, card.dataset.tipo); }
    });
    await carregar();
    setInterval(() => { if (!document.hidden) carregar(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
