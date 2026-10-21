/* =====================================================
   CONFERÊNCIA POR BIPAGEM (out/2026)
   conferencia.html?pedido=<id>&etapa=carregamento|retorno — aberta pelo cronograma.
   Confere só lendo etiquetas: a etiqueta de envio de cada móvel (ACERVO:ENV:) ou o QR fixo dele
   (ACERVO:PAT:, que marca a próxima etiqueta daquele item). Não há marcação manual, de propósito.
   - carregamento: marca separacoes_etiquetas.lida_carregamento_em
   - retorno (triagem da volta): marca lida_retorno_em
   Concluir grava no pedido status_operacional (carregado/retornado) e operacao.<etapa>
   (quando, quem, lidas, total, o que faltou).
===================================================== */
(function () {
  "use strict";
  const ETAPAS = {
    descarregamento: { campo: "lida_descarregamento_em", titulo: "Conferência do descarregamento", rotulo: "Descarregamento", status: "descarregado", verbo: "descarregado" },
    carregamento: { campo: "lida_carregamento_em", titulo: "Conferência do carregamento", rotulo: "Carregamento", status: "carregado", verbo: "carregado" },
    retorno: { campo: "lida_retorno_em", titulo: "Conferência da volta", rotulo: "Triagem da volta", status: "retornado", verbo: "voltou" }
  };
  const params = new URLSearchParams(location.search);
  const etapa = ETAPAS[params.get("etapa")] ? params.get("etapa") : "carregamento";
  const cfg = ETAPAS[etapa];
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s = { sb: null, empresa: null, usuario: null, nome: "", pedido: null, itens: [], etiquetas: [], patLidos: new Set(), nomes: new Map(), ocupado: false, base: [], revelado: false };
  // Retorno às cegas: quem confere não vê quantos volumes deviam voltar nem o que falta; o sistema compara
  // com o que saiu no carregamento só quando a conferência é concluída (s.revelado).
  const cega = etapa === "retorno";
  const escondido = () => cega && !s.revelado;
  const chavePendencias = () => ["acervo-leituras-pendentes",s.empresa,s.usuario,s.pedido?.id,etapa].join(":");
  const pendenciasRede = () => { try { return JSON.parse(localStorage.getItem(chavePendencias()) || "[]"); } catch { return []; } };
  function mostrarPendenciasRede(){
    const el = $("cfPendenciasRede"), fila = pendenciasRede();
    if(!el) return;
    el.hidden = !fila.length;
    el.innerHTML = fila.length ? '<p>' + fila.length + ' leitura(s) aguardando envio. Elas ainda não contam como conferidas.</p><button type="button" class="btn" id="cfReenviarLeituras">Tentar enviar</button>' : '';
    $("cfReenviarLeituras")?.addEventListener("click", reenviarPendencias);
  }
  function guardarLeitura(texto){
    const fila = pendenciasRede();
    if(!fila.includes(texto)) fila.push(texto);
    try { localStorage.setItem(chavePendencias(),JSON.stringify(fila)); }
    catch { throw new Error("Sem rede e sem espaço para guardar a leitura. Bipe novamente quando a conexão voltar."); }
    mostrarPendenciasRede();
  }
  async function reenviarPendencias(){
    if(s.ocupado || !s.pedido) return;
    s.ocupado = true;
    try {
      for(const texto of pendenciasRede()){
        const lido = window.EasyLocLeitor.ler(texto);
        const { data, error } = await s.sb.rpc("operacao_ler_peca", { p_pedido:s.pedido.id,p_etapa:etapa,p_tipo:lido.tipo === "PAT" ? "PAT" : "ENV",p_codigo:lido.codigo });
        if(error && !/já conferid|já foi conferid/i.test(error.message)) { ultima("erro","Envio pendente",error.message); break; }
        if(data){ const e=s.etiquetas.find(e=>e.id===data.id); if(e) Object.assign(e,data); }
        localStorage.setItem(chavePendencias(),JSON.stringify(pendenciasRede().filter(v=>v!==texto)));
      }
      pintar();mostrarPendenciasRede();
    } finally { s.ocupado=false; }
  }

  function avisar(msg, titulo = cfg.rotulo, tipo = "aviso") { window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }
  function mostrarAviso(msg) { $("cfAviso").hidden = false; $("cfAviso").textContent = msg; }

  function ultima(tipo, texto, detalhe) {
    const el = $("cfUltima");
    el.className = "cf-ultima " + (tipo === "ok" ? "is-ok" : "is-erro");
    $("cfUltimaTexto").textContent = texto;
    $("cfUltimaDetalhe").textContent = detalhe || "";
    if (tipo !== "ok") navigator.vibrate?.([80, 60, 80]);
  }

  // Nome da peça da etiqueta: o do próprio item (num Kit, o componente), senão o da linha do pedido.
  function nomeItem(etq) {
    if (etq && s.nomes.has(String(etq.item_id))) return s.nomes.get(String(etq.item_id));
    const i = s.itens.find((x) => String(x.id) === String(etq?.separacao_item_id));
    return i?.item_nome || "Item";
  }

  function pintarCego() {
    const lidas = s.etiquetas.filter((e) => e[cfg.campo]);
    $("cfPercent").hidden = true; $("cfBarra").parentElement.hidden = true;
    $("cfSoFaltando").parentElement.hidden = true;
    document.querySelector(".cf-lista-topo h3").textContent = "Peças lidas";
    $("cfContagem").textContent = lidas.length + " peça" + (lidas.length === 1 ? "" : "s") + " lida" + (lidas.length === 1 ? "" : "s");
    $("cfRodapeTexto").textContent = lidas.length + " peça" + (lidas.length === 1 ? "" : "s") + " conferida" + (lidas.length === 1 ? "" : "s") + " · conferência às cegas";
    $("cfRodape").classList.remove("is-completo"); $("cfRodape").classList.add("is-cega");
    const grupos = new Map();
    lidas.forEach((e) => { const k = e.separacao_item_id + "|" + e.item_id; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    $("cfItens").innerHTML = [...grupos.values()].map((lista) => '<article class="cf-item"><div class="cf-item-topo"><strong>' + esc(nomeItem(lista[0])) +
      '</strong><span>' + lista.length + '</span></div><div class="cf-etiquetas">' + lista.map((e) => '<span class="cf-etq is-ok">' + esc(e.codigo) + "</span>").join("") + "</div></article>").join("")
      || '<p class="cf-vazio">Bipe cada peça que voltou. O sistema compara com o que saiu quando você concluir.</p>';
  }

  function pintar() {
    if (escondido()) { pintarCego(); return; }
    $("cfPercent").hidden = false; $("cfBarra").parentElement.hidden = false; $("cfSoFaltando").parentElement.hidden = false;
    document.querySelector(".cf-lista-topo h3").textContent = "Volumes do pedido";
    $("cfRodape").classList.remove("is-cega");
    const conferir = etapa !== "carregamento" ? s.base : s.etiquetas;
    const total = conferir.length, lidas = conferir.filter((e) => e[cfg.campo]).length;
    const pct = total ? Math.round((lidas / total) * 100) : 0;
    $("cfPercent").textContent = pct + "%";
    $("cfBarra").style.width = pct + "%";
    $("cfContagem").textContent = lidas + " de " + total + " volumes";
    $("cfRodapeTexto").textContent = total - lidas ? (total - lidas) + " volume(s) faltando" : "Tudo conferido";
    $("cfRodape").classList.toggle("is-completo", total > 0 && lidas === total);
    const soFaltando = $("cfSoFaltando").checked;
    const grupos = new Map();
    conferir.forEach((e) => { const k = e.separacao_item_id + "|" + e.item_id; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    $("cfItens").innerHTML = [...grupos.entries()].map(([, lista]) => {
      const ok = lista.filter((e) => e[cfg.campo]).length;
      if (soFaltando && ok === lista.length) return "";
      return '<article class="cf-item' + (ok === lista.length ? " is-ok" : "") + '"><div class="cf-item-topo"><strong>' + esc(nomeItem(lista[0])) +
        '</strong><span>' + ok + " / " + lista.length + '</span></div><div class="cf-etiquetas">' +
        lista.map((e) => '<span class="cf-etq' + (e[cfg.campo] ? " is-ok" : "") + '" title="' + esc(e.codigo) + '">' + esc(e.codigo) + "</span>").join("") + "</div></article>";
    }).join("") || '<p class="cf-vazio">Nada faltando.</p>';
  }

  async function registrar(dados) {
    const { error } = await s.sb.from("separacoes_leituras").insert({
      empresa_id: s.empresa, separacao_pedido_id: s.pedido.id, tipo_controle: etapa,
      usuario_id: s.usuario, usuario_nome: s.nome, ...dados
    });
    if (error) console.warn("Leitura não registrada no histórico:", error);
  }

  async function marcar(etq, codigoLido) {
    const lido = window.EasyLocLeitor.ler(codigoLido);
    const { data, error } = await s.sb.rpc("operacao_ler_peca", { p_pedido: s.pedido.id, p_etapa: etapa, p_tipo: lido.tipo === "PAT" ? "PAT" : "ENV", p_codigo: lido.codigo });
    if (error) {
      if(!navigator.onLine || /fetch|network|failed to fetch/i.test(error.message)){
        guardarLeitura(codigoLido);
        ultima("erro","Leitura aguardando envio","A peça só será confirmada quando o servidor receber a leitura.");
        return false;
      }
      throw error;
    }
    // O servidor pode escolher outra etiqueta do mesmo item quando dois aparelhos leem ao mesmo tempo.
    const atual = s.etiquetas.find(e => e.id === data.id) || etq;
    Object.assign(atual, data);
    ultima("ok", nomeItem(etq), "Etiqueta " + etq.codigo + (escondido() ? "" : " · " + etq.sequencia + " de " + etq.total_item));
    pintar();
    return true;
  }

  async function aoLer(texto) {
    if (s.ocupado || !s.pedido) return;
    s.ocupado = true;
    try {
      const { tipo, codigo } = window.EasyLocLeitor.ler(texto);
      if (tipo === "PAT") {
        if (s.patLidos.has(codigo)) { ultima("erro", "Este móvel já foi conferido", codigo); return; }
        if(await marcar({}, texto)) s.patLidos.add(codigo);
        return;
      }
      if (tipo === "ITEM") { ultima("erro", "Leia a etiqueta de envio ou o QR fixo do móvel", "O QR do item não identifica qual unidade é."); return; }
      const etq = s.etiquetas.find((e) => e.codigo === codigo);
      if (!etq) {
        const { data: outra } = await s.sb.from("separacoes_etiquetas").select("separacao_pedido_id").eq("empresa_id", s.empresa).eq("codigo", codigo).maybeSingle();
        ultima("erro", outra ? "Etiqueta de outro pedido" : "Etiqueta não encontrada", codigo + (outra ? " — separe este móvel" : ""));
        await registrar({ codigo_lido: codigo, status_leitura: "erro", observacao: outra ? "Etiqueta de outro pedido" : "Etiqueta não encontrada" });
        return;
      }
      if (etq[cfg.campo]) { ultima("erro", "Já conferida", etq.codigo + " · " + nomeItem(etq)); return; }
      await marcar(etq, texto);
    } catch (e) {
      console.error(e);
      ultima("erro", "Erro ao registrar a leitura", e?.message || "");
    } finally { s.ocupado = false; }
  }

  async function concluir() {
    if(pendenciasRede().length){ avisar("Envie as leituras pendentes antes de concluir."); return; }
    const conferir = etapa !== "carregamento" ? s.base : s.etiquetas;
    const faltando = conferir.filter((e) => !e[cfg.campo]);
    if (escondido()) {
      const n = s.etiquetas.filter((e) => e[cfg.campo]).length;
      const msg = "Concluir a conferência de retorno com " + n + " peça(s) bipada(s)? O sistema vai comparar com o que saiu no carregamento.";
      const ok = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal(msg, "Concluir retorno", { confirmarTexto: "Concluir", cancelarTexto: "Continuar bipando", tipo: "warning" })
        : confirm(msg);
      if (!ok) return;
    } else if (faltando.length) {
      const ok = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal(faltando.length + " volume(s) não foram bipados. Concluir com pendência?", "Concluir com pendência", { confirmarTexto: "Concluir", cancelarTexto: "Voltar", tipo: "warning" })
        : confirm(faltando.length + " volume(s) não foram bipados. Concluir com pendência?");
      if (!ok) return;
    }
    const { data: registro, error } = await s.sb.rpc("operacao_concluir_conferencia", { p_pedido: s.pedido.id, p_etapa: etapa, p_aceitar_faltas: faltando.length > 0 });
    if (error) { avisar(error.message, cfg.rotulo, "erro"); return; }
    const operacao = { ...(s.pedido.operacao || {}), [etapa]: registro };
    s.pedido.operacao = operacao;
    leitor?.desligar();
    if (cega) { s.revelado = true; pintar(); mostrarResultadoRetorno(registro); await carregarOcorrencias(); }
    avisar(faltando.length ? "Conferência concluída com " + faltando.length + " pendência(s)." : "Conferência concluída: tudo " + cfg.verbo + ".", cfg.rotulo, faltando.length ? "aviso" : "sucesso");
    $("cfConcluir").textContent = "Concluída · conferir de novo";
  }

  async function carregarOcorrencias(){
    const raiz = $("cfOcorrencias");
    if(!raiz || etapa !== "retorno") return;
    const { data, error } = await s.sb.from("operacao_ocorrencias").select("*").eq("pedido_id", s.pedido.id).order("criado_em");
    if(error){ mostrarAviso("Não foi possível carregar as ocorrências. Tente novamente."); return; }
    raiz.hidden = false;
    raiz.innerHTML = '<h3>Ocorrências e encerramento</h3><details><summary>Registrar ocorrência</summary>' +
      '<form id="cfFormularioOcorrencia" class="cf-formulario-ocorrencia"><label>Tipo<select name="tipo"><option value="avaria">Avaria</option><option value="limpeza">Limpeza</option><option value="manutencao">Manutenção</option><option value="outro">Outro</option></select></label>' +
      '<label>Peça<select name="codigo"><option value="">Ocorrência geral</option>' + s.etiquetas.map(e => '<option value="' + esc(e.codigo) + '">' + esc(e.codigo + ' · ' + nomeItem(e)) + '</option>').join('') + '</select></label>' +
      '<label>O que aconteceu e para onde encaminhar?<textarea name="descricao" required minlength="5"></textarea></label><button type="submit" class="btn" id="cfNovaOcorrencia">Salvar ocorrência</button></form></details>' +
      (data || []).map(o => '<p>' + esc(o.tipo + ': ' + o.descricao) + (o.resolvida_em ? ' · Resolvida' : ' · Pendente <button type="button" class="btn" data-resolver="' + esc(o.id) + '">Resolver</button>') + '</p>').join('') +
      '<button type="button" class="btn primary" id="cfEncerrar">Encerrar operação</button><p id="cfEncerramentoMensagem" role="status"></p>';
    $("cfFormularioOcorrencia").onsubmit = async event => {
      event.preventDefault();
      const campos = new FormData(event.currentTarget);
      const tipo = campos.get("tipo"), codigo = campos.get("codigo"), descricao = String(campos.get("descricao") || "").trim();
      const etiqueta = codigo ? s.etiquetas.find(e => e.codigo === codigo) : null;
      if(codigo && !etiqueta){ avisar("Etiqueta não pertence a este pedido"); return; }
      if(!descricao?.trim()) return;
      $("cfNovaOcorrencia").disabled = true;
      const { error } = await s.sb.from("operacao_ocorrencias").insert({ empresa_id: s.empresa, pedido_id: s.pedido.id, item_id: etiqueta?.item_id || null, codigo: codigo || null, tipo, descricao: descricao.trim() });
      if(error){ $("cfNovaOcorrencia").disabled = false; avisar(error.message); } else await carregarOcorrencias();
    };
    raiz.querySelectorAll("[data-resolver]").forEach(btn => btn.onclick = async () => {
      const o = data.find(o => o.id === btn.dataset.resolver);
      const destino = o.tipo === "falta" ? prompt("Digite devolvido para conferir uma peça recebida, ou perda para confirmar a baixa do estoque:", "devolvido") : "resolvido";
      if(!destino) return;
      if(!["devolvido","perda","resolvido"].includes(destino)){ avisar("Destino inválido"); return; }
      if(destino === "devolvido"){ avisar("Bipe a etiqueta da peça e conclua novamente a triagem; a falta será resolvida automaticamente."); return; }
      const motivo = prompt("Descreva o encaminhamento ou a solução:");
      if(!motivo?.trim()) return;
      if(destino === "perda" && !await window.confirmarGlobal("A perda será registrada e a peça será baixada do estoque. Confirmar?", "Confirmar perda", { confirmarTexto: "Confirmar perda", cancelarTexto: "Voltar" })) return;
      const { error } = await s.sb.rpc("operacao_resolver_ocorrencia", { p_id: o.id, p_destino: destino, p_motivo: motivo.trim() });
      if(error) avisar(error.message); else await carregarOcorrencias();
    });
    $("cfEncerrar").onclick = async () => {
      const { error } = await s.sb.rpc("operacao_encerrar", { p_pedido: s.pedido.id });
      $("cfEncerramentoMensagem").textContent = error ? error.message : "Operação encerrada. O fechamento financeiro permanece independente.";
      if(!error){ s.pedido.status_operacional="encerrado"; bloquearOperacaoEncerrada(); }
    };
    bloquearOperacaoEncerrada();
  }
  function bloquearOperacaoEncerrada(){
    if(s.pedido?.status_operacional !== "encerrado") return;
    ["cfEncerrar","cfConcluir","cfBtnCamera","cfEntrada","cfNovaOcorrencia"].forEach(id=>{if($(id)) $(id).disabled=true;});
    if($("cfEncerrar")) $("cfEncerrar").textContent="Operação encerrada";
  }

  // Depois de concluída, o sistema mostra o resultado: o que voltou e o que não voltou.
  function mostrarResultadoRetorno(feito) {
    const falta = Array.isArray(feito.faltando) ? feito.faltando : [];
    const el = $("cfAviso"); el.hidden = false;
    el.classList.toggle("is-divergente", falta.length > 0); el.classList.toggle("is-ok", !falta.length);
    el.innerHTML = "<strong>" + (falta.length ? "Não voltaram " + falta.length + " de " + feito.total + " peças." : "Tudo voltou: " + feito.total + " de " + feito.total + " peças.") + "</strong>" +
      " Conferido em " + esc(new Date(feito.concluido_em).toLocaleString("pt-BR")) + (feito.por ? " por " + esc(feito.por) : "") + "." +
      (falta.length ? '<ul class="cf-faltaram">' + falta.map((f) => "<li><code>" + esc(f.codigo) + "</code> " + esc(f.item) + "</li>").join("") + "</ul>" : "");
  }

  let leitor = null;

  async function iniciar() {
    $("cfTitulo").textContent = cfg.titulo;
    const origem = { expedicao: ["Modulos/Logistica/Expedicao/expedicao.html", "../Expedicao/expedicao.html"], separacao: ["Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html", "../../Estoque/SeparacaoMateriais/separacao-materiais.html"] }[params.get("de")];
    if (origem) {
      const voltar = $("cfVoltar"); voltar.hidden = false;
      // na mesma linha do título (centralizado pelo tema), alinhado à esquerda do conteúdo
      const alinhar = () => {
        if (matchMedia("(max-width:760px)").matches) return;
        const pg = voltar.parentElement.getBoundingClientRect(), t = $("cfTitulo").getBoundingClientRect(), ref = $("cfPedido").getBoundingClientRect();
        voltar.parentElement.style.setProperty("--cf-voltar-y", Math.round(t.top - pg.top + t.height / 2 - voltar.offsetHeight / 2) + "px");
        voltar.parentElement.style.setProperty("--cf-voltar-x", Math.round((ref.width ? ref.left : pg.left + 24) - pg.left) + "px");
      };
      alinhar(); setTimeout(alinhar, 400); addEventListener("resize", alinhar);
      voltar.addEventListener("click", () => {
        try { if (window.top !== window && typeof window.top.shellNavigate === "function") { window.top.shellNavigate(origem[0]); return; } } catch (_) {}
        location.href = origem[1];
      });
    }
    $("cfEtapaRotulo").textContent = cfg.rotulo;
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    s.usuario = ctx?.usuario_id || window.__CONTEXT?.usuario_id || null;
    s.nome = ctx?.usuario_nome || window.__CONTEXT?.usuario_nome || "";
    const pedidoId = params.get("pedido");
    if (!s.empresa || !pedidoId) { mostrarAviso("Abra a conferência pelo cronograma, na etapa do pedido."); return; }
    const [{ data: pedido }, { data: itens }, { data: etiquetas, error }] = await Promise.all([
      s.sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,local_nome,data_entrega,data_evento,status,status_operacional,operacao").eq("empresa_id", s.empresa).eq("id", pedidoId).maybeSingle(),
      s.sb.from("separacoes_itens").select("id,item_id,item_nome").eq("empresa_id", s.empresa).eq("separacao_pedido_id", pedidoId),
      s.sb.from("separacoes_etiquetas").select("*").eq("empresa_id", s.empresa).eq("separacao_pedido_id", pedidoId).order("codigo")
    ]);
    if (error) { console.error(error); mostrarAviso("Não foi possível carregar as etiquetas do pedido."); return; }
    if (!pedido) { mostrarAviso("Pedido não encontrado."); return; }
    s.pedido = pedido; s.itens = itens || []; s.etiquetas = etiquetas || [];
    // O que deve voltar = o que saiu no carregamento (se ele foi conferido); senão, todas as etiquetas.
    const carregadas = s.etiquetas.filter((e) => e.lida_carregamento_em);
    s.base = carregadas.length ? carregadas : s.etiquetas;
    const idsItens = [...new Set(s.etiquetas.map((e) => e.item_id).filter(Boolean))];
    if (idsItens.length) {
      const { data: cad } = await s.sb.from("itens").select("id,produto,descricao_total").eq("empresa_id", s.empresa).in("id", idsItens);
      (cad || []).forEach((c) => s.nomes.set(String(c.id), c.descricao_total || c.produto || "Item"));
    }
    $("cfPedido").hidden = false;
    $("cfPedidoNumero").textContent = "Pedido " + (pedido.numero_pedido || "-");
    const data = pedido.data_entrega || pedido.data_evento;
    $("cfPedidoMeta").textContent = [pedido.cliente_nome, pedido.local_nome, data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : ""].filter(Boolean).join(" · ");
    if (!s.etiquetas.length) {
      mostrarAviso("Este pedido ainda não tem etiquetas de envio. Na separação, use \"Imprimir etiquetas de envio\" e cole uma em cada móvel; a conferência é feita bipando essas etiquetas.");
      return;
    }
    const feito = pedido.operacao?.[etapa];
    if (feito?.concluido_em && cega) {
      s.revelado = true;
      mostrarResultadoRetorno(feito);
    } else if (feito?.concluido_em) {
      mostrarAviso("Já conferido em " + new Date(feito.concluido_em).toLocaleString("pt-BR") + (feito.por ? " por " + feito.por : "") + " (" + feito.lidas + " de " + feito.total + "). Pode bipar de novo para completar.");
    }
    if (escondido()) $("cfUltimaDetalhe").textContent = "Conferência às cegas: bipe cada peça que voltou. Ao concluir, o sistema mostra o que faltou.";
    $("cfCorpo").hidden = false; $("cfRodape").hidden = false;
    leitor = window.EasyLocLeitor.criar({
      video: $("cfVideo"), aoLer,
      aoMudar: (ligada) => { $("cfCamera").hidden = !ligada; $("cfBtnCamera").textContent = ligada ? "Desligar câmera" : "Ler com a câmera"; }
    });
    $("cfBtnCamera").addEventListener("click", () => (leitor.ligada ? leitor.desligar() : leitor.ligar().catch((e) => avisar(e.message, "Câmera"))));
    window.EasyLocLeitor.teclado($("cfEntrada"), aoLer);
    $("cfSoFaltando").addEventListener("change", pintar);
    $("cfConcluir").addEventListener("click", () => concluir().catch(console.error));
    pintar();
    if(etapa === "retorno" && feito?.concluido_em) await carregarOcorrencias();
    mostrarPendenciasRede();
    window.addEventListener("online",reenviarPendencias);
    $("cfEntrada").focus();
  }

  window.addEventListener("pagehide", () => leitor?.desligar());
  iniciar().catch((e) => { console.error(e); mostrarAviso("Não foi possível abrir a conferência."); });
})();
