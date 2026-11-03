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
    // Conferido (out/2026): carregado até a entrega ser confirmada; descarregado até a triagem da volta começar
    lista.filter(p=>!p.somente_consulta && (p.fluxo_etapa==='entrega' || ['triagem_retorno','posicao_final'].includes(p.fluxo_etapa))).forEach((p) => {
      const tipo=p.fluxo_etapa==='entrega'?'ida':'descarregamento';
      out.push({p,tipo,col:colunaFinal(p,tipo)});
    });
    const data = (c) => String((c.tipo !== "ida" ? c.p.data_coleta : c.p.data_entrega) || c.p.data_evento || "9999");
    return out.sort((a, b) => data(a).localeCompare(data(b)));
  }

  // Divergências abertas da volta (out/2026): o pedido não some do quadro enquanto houver falta ou peça a mais sem resolver.
  async function divergenciasAbertas(sb, empresa, etapa) {
    let data, error;
    try { ({ data, error } = await sb.from("operacao_ocorrencias").select("pedido_id,tipo,quantidade,etapa")
      .eq("empresa_id", empresa).is("resolvida_em", null).in("tipo", ["falta", "sobra"]).eq("etapa", etapa)); } catch (e) { error = e; }
    if (error) { console.warn("Divergências não carregadas:", error); return { mapa: new Map(), pedidos: [] }; }
    const mapa = new Map();
    (data || []).forEach((o) => { const k = String(o.pedido_id); const r = mapa.get(k) || { falta: 0, sobra: 0 }; r[o.tipo] += 1; mapa.set(k, r); });
    if (!mapa.size) return { mapa, pedidos: [] };
    const { data: pedidos } = await sb.from("separacoes_pedidos").select("*").eq("empresa_id", empresa).in("id", [...mapa.keys()]);
    return { mapa, pedidos: pedidos || [] };
  }
  function resumoDivergencia(r) {
    return [r.falta ? r.falta + " item(ns) faltando" : "", r.sobra ? r.sobra + " item(ns) a mais" : ""].filter(Boolean).join(" · ");
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
      nota = col === "conferidos" ? "" : (volta ? "Retorno conferido " : descarga ? "Descarregado " : "Carregado ") + dataHoraBr(feito.concluido_em) + (feito.por ? " por " + feito.por : "") +
        (falta ? " · " + falta + (volta ? " não voltou" : " pendência(s)") : "");
    } else if (volta || (descarga && s.descargaCega)) {
      nota = "Conferência às cegas";
    } else if (!SEPARADO.has(p.status)) {
      nota = "Ainda em separação";
    } else if (!v.total && !nota) {
      nota = "Conferência por quantidade";
    }
    let progresso = "";
    const cegaAqui = volta || (descarga && s.descargaCega);
    if (col === "andamento" && !cegaAqui) {
      const lidas = descarga ? v.descarregadas : v.carregadas;
      const total = descarga ? v.carregadas : v.total;
      const pct = total ? Math.round((lidas / total) * 100) : 0;
      progresso = '<div class="separacao-card-progress"><span>' + pct + '%</span><div class="mini-progress"><span style="width:' + pct + '%"></span></div><strong>' + lidas + " / " + total + "</strong></div>";
    } else if (col === "andamento" && cegaAqui) {
      const n = volta ? v.voltaram : v.descarregadas;
      progresso = '<div class="exp-lidos">' + n + " peça" + (n === 1 ? "" : "s") + " lida" + (n === 1 ? "" : "s") + "</div>";
    }
    const carregados = p.operacao?.carregamento?.caminhoes || p.operacao?.carregamento_caminhoes || [];
    const usaCarregados = volta || descarga || col === "conferidos" || col === "pendencias";
    const lista = usaCarregados ? carregados : (s.caminhoes?.get(String(p.id)) || []);
    const caminhoes = !lista.length ? "" :
      '<div class="exp-caminhoes"><span>' + (usaCarregados ? "Carregado em" : "Caminh&#245;es programados") + "</span>" +
      lista.map((c) => '<b title="' + esc([c.placa, c.modelo].filter(Boolean).join(" · ")) + '">' + esc(c.codigo || c.placa || "Caminhão") + (c.codigo && c.placa && !/^SEM PLACA/i.test(c.placa) ? "<small>" + esc(c.placa) + "</small>" : "") + "</b>").join("") + "</div>";
    const meta = (volta || descarga)
      ? "Coleta " + esc(dataBr(p.data_coleta || p.data_evento))
      : "Entrega " + esc(dataBr(p.data_entrega || p.data_evento)) + " · " + v.total + " volume" + (v.total === 1 ? "" : "s");
    // Pagamento mínimo (Parâmetros > Financeiro) travando o carregamento: aviso pequeno e o cartão não abre.
    const ida = !volta && !descarga && col !== "conferidos" && col !== "pendencias";
    const travaFin = ida && s.bloqueados?.has(String(p.id));
    // Sem caminhão programado no Painel Logístico (Parâmetros > Logística e operação): não carrega.
    const travaCam = ida && s.semCaminhao?.has(String(p.id));
    const bloqueado = travaFin || travaCam;
    const motivoTrava = [
      travaFin ? 'O Financeiro ainda não liberou o carregamento deste pedido. Solicite a conferência do pagamento e a liberação ao responsável financeiro.' : '',
      travaCam ? 'Nenhum caminhão está programado para este pedido. Programe o caminhão no Painel Logístico antes de iniciar o carregamento.' : ''
    ].filter(Boolean).join('\n\n');
    return '<article class="separacao-order-card exp-card-' + tipo + (bloqueado ? " is-bloqueado-fin" : "") + '" data-coluna="' + col + '" data-tipo="' + tipo + '" data-pedido="' + esc(p.id) + '"' + (bloqueado ? ' data-bloqueado="1" tabindex="0" role="button" aria-label="Consultar bloqueio do pedido" title="' + esc(motivoTrava) + '"' : ' tabindex="0" role="button"') + '>' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + esc(numero.startsWith("#") ? numero : "#" + numero) + "</span>" +
      '<span class="exp-tipo">' + (volta ? "Retorno" : descarga ? "Descarregamento" : "Ida") + "</span>" +
      (travaFin ? '<span class="exp-pendencia-dot exp-dot-financeiro" role="img" aria-label="Aguardando Financeiro" title="Aguardando Financeiro"></span>' : "") +
      ((ida && !lista.length) ? '<span class="exp-pendencia-dot exp-dot-caminhao" role="img" aria-label="Sem caminh&#227;o programado" title="Sem caminh&#227;o programado"></span>' : "") +
      "</div>" +
      '<div class="separacao-card-mainline"><strong>' + esc(p.cliente_nome || "Cliente não informado") + "</strong><span>" +
      esc(p.tipo_evento || "Evento") + " · " + esc(local(p)) + "</span></div>" +
      (col === "conferidos" ? "" : '<div class="separacao-card-meta-line">' + meta + "</div>") +
      caminhoes +
      (col==='conferidos'&&tipo==='ida'&&s.reabriveis?.has(String(p.id))?'<button type="button" class="exp-reabrir" data-reabrir-conferencia="'+esc(p.id)+'">Voltar</button>':'') +
      progresso + (nota ? '<div class="separacao-lock-note">' + esc(nota) + "</div>" : "") +
      (col==='pendencias'&&s.divergencias?.mapa.get(String(p.id))&&tipo==='descarregamento'?'<div class="exp-pendencia-resumo"><b>'+esc(resumoDivergencia(s.divergencias.mapa.get(String(p.id))))+'</b><small>Abra para resolver</small></div>':'')+(col==='pendencias'&&!(s.divergencias?.mapa.get(String(p.id))&&tipo==='descarregamento')?'<div class="exp-pendencia-resumo"><b>'+faltas(p,tipo).length+' item(ns) com pendência</b>'+faltas(p,tipo).filter(f=>f.item).slice(0,3).map(f=>'<small>'+esc(f.item)+(f.faltam?' · '+esc(f.faltam)+' faltante(s)':'')+'</small>').join('')+'</div>':'') + "</article>";
  }

  function pintar() {
    const termo = ($("expBusca").value || "").trim().toLowerCase();
    const lista = s.pedidos.filter((p) => !termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, local(p)].join(" ").toLowerCase().includes(termo));
    const grupos = { aguardando: [], andamento: [], conferidos: [], pendencias: [] };
    cartoes(lista).forEach((c) => grupos[c.col].push(c));
    const naFila = new Set(lista.map((p) => String(p.id)));
    (s.divergencias?.pedidos || []).filter((p) => !naFila.has(String(p.id)) && (!termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, local(p)].join(" ").toLowerCase().includes(termo)))
      .forEach((p) => grupos.pendencias.push({ p, tipo: "descarregamento", col: "pendencias", divergencia: true }));
    const vazio = { aguardando: "Nada aguardando conferência.", andamento: "Nenhuma conferência em andamento.", conferidos: "Nada conferido por enquanto.", pendencias: "Nenhuma pendência de conferência." };
    [["aguardando", "expColAguardando", "expContAguardando"], ["andamento", "expColAndamento", "expContAndamento"], ["conferidos", "expColCarregados", "expContCarregados"], ["pendencias", "expColPendencias", "expContPendencias"]].forEach(([g, col, cont]) => {
      $(cont).textContent = grupos[g].length;
      $(col).innerHTML = grupos[g].length ? grupos[g].map(cartao).join("") : '<div class="empty-state">' + vazio[g] + "</div>";
    });
    window.pintarFotosDecoradores?.({ sb: s.sb, empresa: s.empresa, pedidos: [...s.pedidos, ...(s.divergencias?.pedidos || [])] });
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
      s.reabriveis=new Set();
      for(let i=0;i<s.pedidos.length;i+=100){
        const {data,error}=await s.sb.rpc('expedicao_reaberturas_disponiveis',{p_pedidos:s.pedidos.slice(i,i+100).map(p=>p.id)});
        if(error){console.warn('Reabertura da conferência:',error.message);break;}
        for(const id of data||[])s.reabriveis.add(String(id));
      }
      // Descarregamento às cegas (Parâmetros > Operação): o cartão não mostra quanto devia chegar.
      const {data:regra}=await s.sb.from('empresa_logistica_regras').select('descarregamento_conferencia').eq('empresa_id',s.empresa).maybeSingle();
      s.descargaCega=regra?.descarregamento_conferencia==='cegas';
      // Divergência do descarregamento é resolvida na Gestão do acervo (out/2026): a Expedição não lista mais.
      s.divergencias={mapa:new Map(),pedidos:[]};
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
      s.bloqueados = new Set();
      for(let i=0;i<s.pedidos.length;i+=100){
        const {data:bloq,error:erroBloq}=await s.sb.rpc('pedidos_pagamento_bloqueados',{p_pedidos:s.pedidos.slice(i,i+100).map(p=>p.id),p_etapa:'carregamento'});
        if(erroBloq){console.warn('pagamento mínimo',erroBloq);break;}
        (bloq||[]).forEach((id)=>s.bloqueados.add(String(id)));
      }
      s.semCaminhao = new Set();
      for(let i=0;i<s.pedidos.length;i+=100){
        const {data:sem,error:erroSem}=await s.sb.rpc('pedidos_sem_caminhao_bloqueados',{p_pedidos:s.pedidos.slice(i,i+100).map(p=>p.id)});
        if(erroSem){console.warn('caminhão programado',erroSem);break;}
        (sem||[]).forEach((id)=>s.semCaminhao.add(String(id)));
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

  function ativarCard(card) {
    if (!card) return;
    if (card.dataset.bloqueado) {
      const motivo = card.getAttribute('title') || 'Este pedido possui um bloqueio. Consulte o responsável pela operação.';
      if (typeof window.alerta === 'function') window.alerta(motivo, {titulo:'Pedido bloqueado', tipo:'aviso', duracao:10000});
      else window.alert(motivo);
      return;
    }
    abrir(card.dataset.pedido, card.dataset.tipo);
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    $("expBusca").addEventListener("input", pintar);
    const quadro = document.querySelector(".separacao-kanban");
    quadro.addEventListener("click", (ev) => {
      const botao=ev.target.closest('[data-reabrir-conferencia]');
      if(botao){
        ev.preventDefault();ev.stopPropagation();
        (async()=>{
          const confirmar=typeof window.confirmarGlobal==='function'?await window.confirmarGlobal('O pedido voltará para conferência. As quantidades e os caminhões registrados serão preservados para revisão.','Voltar para conferência',{confirmarTexto:'Reabrir',cancelarTexto:'Voltar'}):window.confirm('Voltar este pedido para conferência?');
          if(!confirmar)return;botao.disabled=true;
          const {error}=await s.sb.rpc('expedicao_reabrir_conferencia',{p_pedido:botao.dataset.reabrirConferencia});if(error)throw error;
          await carregar();
        })().catch(e=>{botao.disabled=false;window.alerta?.(e.message,'Conferência','aviso');});return;
      }
      ativarCard(ev.target.closest("[data-pedido]"));
    });
    quadro.addEventListener("keydown", (ev) => {
      if(ev.target.closest("button"))return;
      const card = ev.target.closest("[data-pedido]");
      if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ativarCard(card); }
    });
    await carregar();
    setInterval(() => { if (!document.hidden) carregar(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
