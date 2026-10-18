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
    carregamento: { campo: "lida_carregamento_em", titulo: "Conferência do carregamento", rotulo: "Carregamento", status: "carregado", verbo: "carregado" },
    retorno: { campo: "lida_retorno_em", titulo: "Conferência da volta", rotulo: "Triagem da volta", status: "retornado", verbo: "voltou" }
  };
  const params = new URLSearchParams(location.search);
  const etapa = ETAPAS[params.get("etapa")] ? params.get("etapa") : "carregamento";
  const cfg = ETAPAS[etapa];
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s = { sb: null, empresa: null, usuario: null, nome: "", pedido: null, itens: [], etiquetas: [], patLidos: new Set(), ocupado: false };

  function avisar(msg, titulo = cfg.rotulo, tipo = "aviso") { window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }
  function mostrarAviso(msg) { $("cfAviso").hidden = false; $("cfAviso").textContent = msg; }

  function ultima(tipo, texto, detalhe) {
    const el = $("cfUltima");
    el.className = "cf-ultima " + (tipo === "ok" ? "is-ok" : "is-erro");
    $("cfUltimaTexto").textContent = texto;
    $("cfUltimaDetalhe").textContent = detalhe || "";
    if (tipo !== "ok") navigator.vibrate?.([80, 60, 80]);
  }

  function nomeItem(id) {
    const i = s.itens.find((x) => String(x.id) === String(id));
    return i?.item_nome || i?.itens?.descricao_total || i?.itens?.produto || "Item";
  }

  function pintar() {
    const total = s.etiquetas.length, lidas = s.etiquetas.filter((e) => e[cfg.campo]).length;
    const pct = total ? Math.round((lidas / total) * 100) : 0;
    $("cfPercent").textContent = pct + "%";
    $("cfBarra").style.width = pct + "%";
    $("cfContagem").textContent = lidas + " de " + total + " volumes";
    $("cfRodapeTexto").textContent = total - lidas ? (total - lidas) + " volume(s) faltando" : "Tudo conferido";
    $("cfRodape").classList.toggle("is-completo", total > 0 && lidas === total);
    const soFaltando = $("cfSoFaltando").checked;
    const grupos = new Map();
    s.etiquetas.forEach((e) => { const k = String(e.separacao_item_id); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    $("cfItens").innerHTML = [...grupos.entries()].map(([itemId, lista]) => {
      const ok = lista.filter((e) => e[cfg.campo]).length;
      if (soFaltando && ok === lista.length) return "";
      return '<article class="cf-item' + (ok === lista.length ? " is-ok" : "") + '"><div class="cf-item-topo"><strong>' + esc(nomeItem(itemId)) +
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
    const agora = new Date().toISOString();
    const { error } = await s.sb.from("separacoes_etiquetas").update({ [cfg.campo]: agora }).eq("id", etq.id).eq("empresa_id", s.empresa);
    if (error) throw error;
    etq[cfg.campo] = agora;
    await registrar({ codigo_lido: codigoLido, separacao_item_id: etq.separacao_item_id, item_id: etq.item_id, status_leitura: "sucesso", item_nome: nomeItem(etq.separacao_item_id), observacao: cfg.rotulo + ": etiqueta " + etq.codigo });
    ultima("ok", nomeItem(etq.separacao_item_id), "Etiqueta " + etq.codigo + " · " + etq.sequencia + " de " + etq.total_item);
    pintar();
  }

  async function aoLer(texto) {
    if (s.ocupado || !s.pedido) return;
    s.ocupado = true;
    try {
      const { tipo, codigo } = window.EasyLocLeitor.ler(texto);
      if (tipo === "PAT") {
        if (s.patLidos.has(codigo)) { ultima("erro", "Este móvel já foi conferido", codigo); return; }
        const { data: pat } = await s.sb.from("itens_patrimonios").select("item_id,codigo_patrimonio").eq("empresa_id", s.empresa).eq("codigo_patrimonio", codigo).maybeSingle();
        if (!pat) { ultima("erro", "QR fixo não encontrado", codigo); await registrar({ codigo_lido: codigo, status_leitura: "erro", observacao: "Patrimônio não encontrado" }); return; }
        const livre = s.etiquetas.find((e) => String(e.item_id) === String(pat.item_id) && !e[cfg.campo]);
        if (!livre) {
          const doPedido = s.etiquetas.some((e) => String(e.item_id) === String(pat.item_id));
          ultima("erro", doPedido ? "Este item já está completo" : "Este móvel não é deste pedido", codigo);
          await registrar({ codigo_lido: codigo, item_id: pat.item_id, status_leitura: "erro", observacao: doPedido ? "Item já completo" : "Fora do pedido" });
          return;
        }
        s.patLidos.add(codigo);
        await marcar(livre, codigo);
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
      if (etq[cfg.campo]) { ultima("erro", "Já conferida", etq.codigo + " · " + nomeItem(etq.separacao_item_id)); return; }
      await marcar(etq, codigo);
    } catch (e) {
      console.error(e);
      ultima("erro", "Erro ao registrar a leitura", e?.message || "");
    } finally { s.ocupado = false; }
  }

  async function concluir() {
    const faltando = s.etiquetas.filter((e) => !e[cfg.campo]);
    if (faltando.length) {
      const ok = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal(faltando.length + " volume(s) não foram bipados. Concluir com pendência?", "Concluir com pendência", { confirmarTexto: "Concluir", cancelarTexto: "Voltar", tipo: "warning" })
        : confirm(faltando.length + " volume(s) não foram bipados. Concluir com pendência?");
      if (!ok) return;
    }
    const registro = {
      concluido_em: new Date().toISOString(), por: s.nome, usuario_id: s.usuario,
      lidas: s.etiquetas.length - faltando.length, total: s.etiquetas.length,
      faltando: faltando.map((e) => ({ codigo: e.codigo, item: nomeItem(e.separacao_item_id) }))
    };
    const operacao = { ...(s.pedido.operacao || {}), [etapa]: registro };
    const { error } = await s.sb.from("separacoes_pedidos").update({ status_operacional: cfg.status, operacao }).eq("id", s.pedido.id).eq("empresa_id", s.empresa);
    if (error) { console.error(error); avisar("Não foi possível concluir: " + error.message, cfg.rotulo, "erro"); return; }
    s.pedido.operacao = operacao;
    leitor?.desligar();
    avisar(faltando.length ? "Conferência concluída com " + faltando.length + " pendência(s)." : "Conferência concluída: tudo " + cfg.verbo + ".", cfg.rotulo, faltando.length ? "aviso" : "sucesso");
    $("cfConcluir").textContent = "Concluída · conferir de novo";
  }

  let leitor = null;

  async function iniciar() {
    $("cfTitulo").textContent = cfg.titulo;
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
    $("cfPedido").hidden = false;
    $("cfPedidoNumero").textContent = "Pedido " + (pedido.numero_pedido || "-");
    const data = pedido.data_entrega || pedido.data_evento;
    $("cfPedidoMeta").textContent = [pedido.cliente_nome, pedido.local_nome, data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : ""].filter(Boolean).join(" · ");
    if (!s.etiquetas.length) {
      mostrarAviso("Este pedido ainda não tem etiquetas de envio. Na separação, use \"Imprimir etiquetas de envio\" e cole uma em cada móvel; a conferência é feita bipando essas etiquetas.");
      return;
    }
    const feito = pedido.operacao?.[etapa];
    if (feito?.concluido_em) {
      mostrarAviso("Já conferido em " + new Date(feito.concluido_em).toLocaleString("pt-BR") + (feito.por ? " por " + feito.por : "") + " (" + feito.lidas + " de " + feito.total + "). Pode bipar de novo para completar.");
    }
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
    $("cfEntrada").focus();
  }

  window.addEventListener("pagehide", () => leitor?.desligar());
  iniciar().catch((e) => { console.error(e); mostrarAviso("Não foi possível abrir a conferência."); });
})();
