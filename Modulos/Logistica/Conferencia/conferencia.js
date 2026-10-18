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
  const s = { sb: null, empresa: null, usuario: null, nome: "", pedido: null, itens: [], etiquetas: [], patLidos: new Set(), nomes: new Map(), ocupado: false, base: [], revelado: false };
  // Retorno às cegas: quem confere não vê quantos volumes deviam voltar nem o que falta; o sistema compara
  // com o que saiu no carregamento só quando a conferência é concluída (s.revelado).
  const cega = etapa === "retorno";
  const escondido = () => cega && !s.revelado;

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
    const conferir = cega ? s.base : s.etiquetas;
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
    const agora = new Date().toISOString();
    const { error } = await s.sb.from("separacoes_etiquetas").update({ [cfg.campo]: agora }).eq("id", etq.id).eq("empresa_id", s.empresa);
    if (error) throw error;
    etq[cfg.campo] = agora;
    await registrar({ codigo_lido: codigoLido, separacao_item_id: etq.separacao_item_id, item_id: etq.item_id, status_leitura: "sucesso", item_nome: nomeItem(etq), observacao: cfg.rotulo + ": etiqueta " + etq.codigo });
    ultima("ok", nomeItem(etq), "Etiqueta " + etq.codigo + (escondido() ? "" : " · " + etq.sequencia + " de " + etq.total_item));
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
          ultima("erro", doPedido ? (escondido() ? "Leia a etiqueta de envio deste móvel" : "Este item já está completo") : "Este móvel não é deste pedido", codigo);
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
      if (etq[cfg.campo]) { ultima("erro", "Já conferida", etq.codigo + " · " + nomeItem(etq)); return; }
      await marcar(etq, codigo);
    } catch (e) {
      console.error(e);
      ultima("erro", "Erro ao registrar a leitura", e?.message || "");
    } finally { s.ocupado = false; }
  }

  async function concluir() {
    const conferir = cega ? s.base : s.etiquetas;
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
    const registro = {
      concluido_em: new Date().toISOString(), por: s.nome, usuario_id: s.usuario,
      lidas: conferir.length - faltando.length, total: conferir.length, as_cegas: cega || undefined,
      faltando: faltando.map((e) => ({ codigo: e.codigo, item: nomeItem(e) }))
    };
    const operacao = { ...(s.pedido.operacao || {}), [etapa]: registro };
    const { error } = await s.sb.from("separacoes_pedidos").update({ status_operacional: cfg.status, operacao }).eq("id", s.pedido.id).eq("empresa_id", s.empresa);
    if (error) { console.error(error); avisar("Não foi possível concluir: " + error.message, cfg.rotulo, "erro"); return; }
    s.pedido.operacao = operacao;
    leitor?.desligar();
    if (cega) { s.revelado = true; pintar(); mostrarResultadoRetorno(registro); }
    avisar(faltando.length ? "Conferência concluída com " + faltando.length + " pendência(s)." : "Conferência concluída: tudo " + cfg.verbo + ".", cfg.rotulo, faltando.length ? "aviso" : "sucesso");
    $("cfConcluir").textContent = "Concluída · conferir de novo";
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
    $("cfEntrada").focus();
  }

  window.addEventListener("pagehide", () => leitor?.desligar());
  iniciar().catch((e) => { console.error(e); mostrarAviso("Não foi possível abrir a conferência."); });
})();
