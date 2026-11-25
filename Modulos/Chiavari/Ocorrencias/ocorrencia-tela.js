/* Ocorrências operacionais: clicar na linha abre esta tela inteira com a ocorrência e as provas (20/11/2026, no lugar
   do botão "Ver evidências"; mesmo desenho da tela do Painel de Complexidade).
   Esquerda: linha do tempo em destaque (rpc ocorrencias_evidencias), seguida do resumo da ocorrência
   (descrição, origem, etapa, números, resolução). Direita: as provas — horário programado × registrado, contagens,
   checklist de registros faltando, respostas do cliente, fotos (das evidências e dos registros de campo da etapa),
   equipe e caminhão escalados, a foto do item e os dados brutos da origem.
   Uso: window.OPTela.abrir(caso, { sb, empresa, rotulos: { nomes, tipos, estados, etapas, objetos } }). */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const TZ = "America/Sao_Paulo";
  const dataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const duracao = (min) => { const m = Math.round(Math.abs(min)); if (m < 60) return m + " min"; const h = Math.floor(m / 60), r = m % 60; if (h < 48) return h + " h" + (r ? " " + r + " min" : ""); return Math.floor(h / 24) + " dia(s)"; };
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  const foto = (nome, url, cls = "") => '<span class="ot-foto ' + cls + '"><i>' + esc(iniciais(nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  const ehImagem = (s) => /^https?:\/\/\S+\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(String(s)) || /\/storage\/v1\/object\/(public|sign)\//.test(String(s));
  let tela, ctx, abertoId = null;

  function montar() {
    if (tela) return tela;
    tela = document.createElement("div");
    tela.className = "ot"; tela.hidden = true; tela.setAttribute("role", "dialog"); tela.setAttribute("aria-modal", "true");
    tela.innerHTML = '<header class="ot-topo"><button type="button" class="ot-voltar" data-ot-voltar>← Voltar</button><div class="ot-cab" data-ot-cab></div></header><div class="ot-corpo"><div class="ot-esq" data-ot-esq></div><aside class="ot-provas" data-ot-provas></aside></div>';
    document.body.append(tela);
    tela.addEventListener("click", (e) => {
      if (e.target.closest("[data-ot-voltar]")) fechar();
      const f = e.target.closest("[data-ot-ampliar]"); if (f) ampliar(f.dataset.otAmpliar);
      if (e.target.closest(".ot-luz")) e.target.closest(".ot-luz").remove();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !tela.hidden) { const luz = tela.querySelector(".ot-luz"); if (luz) luz.remove(); else fechar(); } });
    return tela;
  }
  function ampliar(url) { const d = document.createElement("div"); d.className = "ot-luz"; d.innerHTML = '<img src="' + esc(url) + '" alt="">'; tela.append(d); }
  function fechar() { tela.hidden = true; document.documentElement.classList.remove("ot-aberta"); abertoId = null; }

  /* ---------- coleta das fotos de qualquer evidência ---------- */
  async function urlsDasFotos(valor) {
    const achadas = [];
    (function andar(v) {
      if (v == null) return;
      if (typeof v === "string") { if (ehImagem(v)) achadas.push({ url: v }); return; }
      if (Array.isArray(v)) { v.forEach(andar); return; }
      if (typeof v === "object") {
        if (v.bucket && v.path) { achadas.push({ bucket: v.bucket, path: v.path }); return; }
        Object.values(v).forEach(andar);
      }
    })(valor);
    const out = [];
    for (const a of achadas) {
      if (a.url) { out.push(a.url); continue; }
      try { const r = await ctx.sb.storage.from(a.bucket).createSignedUrl(a.path, 3600); if (r.data?.signedUrl) out.push(r.data.signedUrl); else out.push(ctx.sb.storage.from(a.bucket).getPublicUrl(a.path).data.publicUrl); } catch (_) {}
    }
    return [...new Set(out)];
  }

  /* ---------- contexto: pedido, etapa (equipe, caminhão, registros de campo) e item ---------- */
  async function contexto(c) {
    const sb = ctx.sb, r = { pedido: null, etapas: [], pessoas: [], caminhoes: [], registros: [], item: null, clienteFoto: "" };
    const tarefas = [];
    if (c.pedido_id) tarefas.push(sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_id,cliente_nome,tipo_evento,data_evento,local_nome").eq("id", c.pedido_id).maybeSingle().then(({ data }) => { r.pedido = data; }));
    if (c.item_id) tarefas.push(sb.from("itens").select("id,descricao_total,produto,foto_url,categoria").eq("id", c.item_id).maybeSingle().then(({ data }) => { r.item = data; }));
    const MAPA = { triagem: ["triagem_ida"], triagem_ida: ["triagem_ida"], retorno: ["triagem_volta"], triagem_volta: ["triagem_volta"], carregamento: ["carregamento"], descarregamento: ["descarregamento"], montagem: ["montagem"], entrega: ["montagem", "carregamento"], desmontagem: ["desmontagem"], coleta: ["desmontagem", "descarregamento"] };
    if (c.pedido_id && MAPA[c.etapa]) {
      tarefas.push((async () => {
        const { data: etapas } = await sb.from("operacao_etapas").select("id,tipo,nome,data,hora,servico_ref").eq("pedido_id", c.pedido_id);
        r.etapas = (etapas || []).filter((e) => MAPA[c.etapa].includes(e.tipo) && !e.servico_ref);
        const ids = r.etapas.map((e) => e.id);
        if (!ids.length) return;
        const [p, k, g] = await Promise.all([
          sb.from("operacao_etapa_pessoas").select("etapa_id,nome,papel,funcionario_id,free_id").in("etapa_id", ids),
          sb.from("operacao_etapa_caminhoes").select("etapa_id,caminhao_id").in("etapa_id", ids),
          sb.from("operacao_registros").select("etapa_id,tipo,dados,autor,criado_em").in("etapa_id", ids),
        ]);
        r.pessoas = p.data || []; r.registros = g.data || [];
        const frees = [...new Set(r.pessoas.map((x) => x.free_id).filter(Boolean))], fotoFree = {};
        if (frees.length) { const { data } = await sb.from("free_cadastros").select("id,foto_url").in("id", frees); (data || []).forEach((f) => { fotoFree[f.id] = f.foto_url; }); }
        r.pessoas.forEach((x) => { x.foto = x.free_id ? fotoFree[x.free_id] || "" : x.funcionario_id ? sb.storage.from("avatares").getPublicUrl(ctx.empresa + "/" + x.funcionario_id + ".jpg").data.publicUrl : ""; });
        const cids = [...new Set((k.data || []).map((x) => x.caminhao_id))];
        if (cids.length) { const { data } = await sb.from("caminhoes").select("id,codigo,placa,modelo,foto_url").in("id", cids); r.caminhoes = data || []; }
      })().catch(() => {}));
    }
    await Promise.all(tarefas.map((t) => t.catch(() => {})));
    const idCli = r.pedido?.cliente_id;
    if (idCli) { const { data } = await sb.from("clientes_empresas").select("catalogo_logo_url").eq("id", idCli).maybeSingle(); r.clienteFoto = data?.catalogo_logo_url || ""; }
    return r;
  }

  /* ---------- provas ---------- */
  const NOMES_REG = { equipe: "Foto da equipe", sacolas: "Registro das sacolas", lista_assinada: "Lista assinada", lista_conferida: "Lista conferida", contagem_itens: "Contagem da desmontagem", desmontagem_concluida: "Conclusão da desmontagem", conferencia_entrega: "Conferência de entrega", posicionamento: "Posicionamento" };
  function provaHorario(ev) {
    const prev = ev.previsto || ev.programado, reg = ev.realizado ?? ev.registrado_em, tol = ev.tolerancia_minutos;
    if (!prev && !ev.coleta_registrada && !ev.enviado_em && !ev.encerrado_em) return "";
    const linhas = [];
    if (prev) linhas.push(["Programado", dataHora(prev)]);
    if (ev.coleta_registrada) linhas.push(["Coleta registrada", dataHora(ev.coleta_registrada)]);
    if (ev.enviado_em) linhas.push(["Enviado em", dataHora(ev.enviado_em)]);
    if (ev.encerrado_em) linhas.push(["Etapa encerrada em", dataHora(ev.encerrado_em)]);
    if (prev) linhas.push(["Registrado", reg ? dataHora(reg) : '<span class="ot-ruim">Nada registrado até agora</span>']);
    if (tol != null) linhas.push(["Tolerância", tol + " min"]);
    if (ev.janela_horas != null) linhas.push(["Prazo para a triagem da volta", ev.janela_horas + " h depois da coleta"]);
    if (ev.antecedencia_minutos != null) linhas.push(["Cobrado a partir de", duracao(ev.antecedencia_minutos) + " antes do horário"]);
    let conclusao = "";
    if (prev) {
      const ate = reg ? new Date(reg) : new Date(), dif = (ate - new Date(prev)) / 60000;
      conclusao = dif > (tol || 0) ? '<p class="ot-conclusao ruim">' + (reg ? "Registrado " : "Já são ") + duracao(dif) + " depois do programado" + (reg ? "." : " sem registro.") + "</p>" : '<p class="ot-conclusao boa">Dentro do horário.</p>';
    }
    return bloco("Horário", tabelaPares(linhas) + conclusao);
  }
  function provaNumeros(c, ev) {
    const pares = [];
    const esperado = c.esperado ?? ev.esperado ?? ev.solicitado, conferido = c.conferido ?? ev.conferido ?? ev.contado ?? ev.confirmados;
    if (esperado != null) pares.push([ev.solicitado != null ? "Solicitado" : "Esperado", esperado]);
    if (conferido != null) pares.push([ev.confirmados != null ? "Confirmados" : "Contado / conferido", conferido]);
    if (ev.contado_em) pares.push(["Contagem feita em", dataHora(ev.contado_em)]);
    if (ev.quantidade != null && esperado == null) pares.push(["Quantidade", ev.quantidade]);
    if (!pares.length) return "";
    const dif = esperado != null && conferido != null ? Number(conferido) - Number(esperado) : null;
    return bloco("Contagem", '<div class="ot-numeros">' + pares.map(([a, b]) => "<div><small>" + esc(a) + "</small><b>" + esc(b) + "</b></div>").join("") + "</div>" +
      (dif ? '<p class="ot-conclusao ' + (dif < 0 ? "ruim" : "atencao") + '">' + (dif < 0 ? "Faltam " + Math.abs(dif) : Math.abs(dif) + " a mais") + ".</p>" : ""));
  }
  function provaChecklist(ev) {
    if (!Array.isArray(ev.registros_ausentes)) return "";
    const todos = Object.keys(NOMES_REG), faltam = new Set(ev.registros_ausentes);
    const lista = [...new Set([...todos, ...faltam])].filter((k) => faltam.has(k) || todos.includes(k));
    return bloco("Registros obrigatórios da etapa", '<ul class="ot-check">' + lista.map((k) => '<li class="' + (faltam.has(k) ? "falta" : "ok") + '"><span>' + (faltam.has(k) ? "✗" : "✓") + "</span>" + esc(NOMES_REG[k] || k) + "</li>").join("") + "</ul>");
  }
  function provaFeedback(ev) {
    if (!ev.pergunta && !Array.isArray(ev.respostas)) return "";
    return bloco("O que o cliente respondeu no pós-venda", '<p class="ot-pergunta">' + esc(ev.pergunta || "") + "</p>" + (ev.respostas || []).map((r) => '<span class="ot-resp' + (ev.ruim ? " ruim" : "") + '">' + esc(r) + "</span>").join(" "));
  }
  function provaEtapa(cx) {
    if (!cx.etapas.length) return "";
    const pessoas = cx.pessoas, resp = pessoas.filter((p) => p.papel === "responsavel"), eq = pessoas.filter((p) => p.papel !== "responsavel");
    const pessoa = (p) => '<li>' + foto(p.nome, p.foto) + "<span>" + esc(p.nome) + "<small>" + (p.papel === "responsavel" ? "Responsável" : p.free_id ? "Freelancer" : "Equipe") + "</small></span></li>";
    const etapasTxt = cx.etapas.map((e) => esc((e.nome || e.tipo) + " · " + (e.data ? e.data.split("-").reverse().join("/") : "") + (e.hora ? " " + String(e.hora).slice(0, 5) : ""))).join("<br>");
    return bloco("Etapa no cronograma", '<p class="ot-sub">' + etapasTxt + "</p>" +
      (pessoas.length ? '<ul class="ot-pessoas">' + resp.concat(eq).map(pessoa).join("") + "</ul>" : '<p class="ot-ruim">Ninguém escalado.</p>') +
      (cx.caminhoes.length ? '<ul class="ot-pessoas">' + cx.caminhoes.map((k) => "<li>" + foto(k.codigo, k.foto_url, "quadrada") + "<span>" + esc(k.codigo + " · " + (k.modelo || "")) + "<small>" + esc(k.placa || "") + "</small></span></li>").join("") + "</ul>" : '<p class="ot-sub">Sem caminhão escalado.</p>') +
      (cx.registros.length ? '<p class="ot-sub">Registros de campo: ' + cx.registros.map((g) => esc(NOMES_REG[g.tipo] || g.tipo) + " (" + dataHora(g.criado_em) + ")").join(", ") + "</p>" : '<p class="ot-sub">Nenhum registro de campo nesta etapa.</p>'));
  }
  const bloco = (titulo, html) => '<section class="ot-bloco"><h4>' + esc(titulo) + "</h4>" + html + "</section>";
  const tabelaPares = (pares) => '<dl class="ot-pares">' + pares.map(([a, b]) => "<div><dt>" + esc(a) + "</dt><dd>" + b + "</dd></div>").join("") + "</dl>";
  function brutos(v, rot) {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (Array.isArray(v)) return v.map((x) => brutos(x, rot)).join("<hr>");
    if (typeof v === "object") return '<dl class="ot-pares">' + Object.entries(v).filter(([k]) => !/(^id$|_id$|^chave$|^versao$|^empresa_id$|^path$|^bucket$|_por$)/.test(k)).map(([k, x]) => "<div><dt>" + esc(k.replaceAll("_", " ")) + "</dt><dd>" + brutos(k === "etapa" ? rot.etapas[x] || x : x, rot) + "</dd></div>").join("") + "</dl>";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return esc(dataHora(s));
    if (/^https?:\/\//.test(s)) return '<a href="' + esc(s) + '" target="_blank" rel="noopener">Abrir</a>';
    return esc(NOMES_REG[s] || s);
  }

  async function abrir(c, opcoes) {
    ctx = opcoes; montar(); abertoId = c.id;
    const rot = ctx.rotulos, titulo = rot.tipos[c.tipo] || c.tipo;
    tela.hidden = false; document.documentElement.classList.add("ot-aberta"); tela.scrollTop = 0;
    tela.querySelector("[data-ot-cab]").innerHTML = '<div class="ot-ped">' + (c.pedido ? '<span class="ot-num">Pedido ' + esc(c.pedido) + "</span>" : '<span class="ot-num cinza">Sem pedido</span>') +
      foto(c.cliente || "?", "", "grande") + '<div><b>' + esc(c.cliente || "Sem cliente") + "</b><small data-ot-local></small></div></div>" +
      '<div class="ot-titulo"><small>' + esc((rot.nomes[c.origem] || c.origem || "") + (c.etapa ? " · " + (rot.etapas[c.etapa] || c.etapa) : "")) + "</small><h2>" + esc(titulo) + '</h2></div><span class="op-status op-' + esc(c.status) + '">' + esc(rot.estados[c.status] || c.status) + "</span>";
    const ev = c.evidencias && typeof c.evidencias === "object" && !Array.isArray(c.evidencias) ? c.evidencias : {};
    tela.querySelector("[data-ot-esq]").innerHTML =
      '<section class="ot-historico" aria-labelledby="ot-tempo-titulo"><header class="ot-tempo-topo"><div><h3 id="ot-tempo-titulo">Linha do tempo</h3><p>Histórico de detecção e atualizações</p></div><span class="ot-tempo-total" data-ot-tempo-total hidden></span></header><ol class="ot-tempo" data-ot-tempo aria-live="polite" aria-busy="true"><li class="ot-carregando">Carregando o histórico…</li></ol></section>' +
      '<section class="ot-resumo" aria-labelledby="ot-resumo-titulo"><h3 id="ot-resumo-titulo">Sobre a ocorrência</h3><p class="ot-desc">' + esc(c.descricao || "") + "</p>" +
      tabelaPares([["Item / material", esc(c.item || "Etapa operacional") + "<small>" + esc(rot.objetos[c.objeto] || "Registro operacional") + "</small>"], ["Quantidade", esc(c.quantidade ?? "—")], ["Data da ocorrência", esc(dataHora(c.data))], ["Detectada pelo sistema", esc(dataHora(c.detectada_em))], ["Última atualização", esc(dataHora(c.atualizado_em))]].concat(c.responsavel_nome ? [["Responsável pelo acompanhamento", esc(c.responsavel_nome)]] : []).concat(c.resolucao ? [["Resolução", esc(c.resolucao)]] : [])) +
      '<p class="ot-nota">O sistema detecta e atualiza a ocorrência sozinho pelos registros da operação. A prova mostra quem registrou cada evidência, sem atribuir culpa.</p></section>';
    tela.querySelector("[data-ot-provas]").innerHTML = '<div class="ot-prova-topo"><small>PROVAS</small><h3>' + esc(titulo) + '</h3></div><p class="ot-carregando">Carregando as provas…</p>';

    const id = c.id;
    const [cx, hist] = await Promise.all([contexto(c), ctx.sb.rpc("ocorrencias_evidencias", { p_empresa: ctx.empresa, p_caso: c.id }).then((r) => r.data || []).catch(() => [])]);
    if (abertoId !== id) return;
    if (cx.pedido) {
      tela.querySelector("[data-ot-local]").textContent = [cx.pedido.tipo_evento, cx.pedido.data_evento ? cx.pedido.data_evento.split("-").reverse().join("/") : "", cx.pedido.local_nome].filter(Boolean).join(" · ");
      if (cx.clienteFoto) tela.querySelector(".ot-ped .ot-foto").insertAdjacentHTML("beforeend", '<img src="' + esc(cx.clienteFoto) + '" alt="" onerror="this.remove()">');
    }
    // linha do tempo: detecção + cada atualização automática
    const eventos = [{ data: c.detectada_em, txt: "Ocorrência detectada", sub: c.descricao }].concat((Array.isArray(hist) ? hist : []).map((e) => ({ data: e.data, txt: (rot.estados[e.registro?.status] || e.registro?.status || "Atualização"), sub: e.registro?.quantidade != null ? "Quantidade: " + e.registro.quantidade : "" })))
      .filter((e) => e.data).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const tempo = tela.querySelector("[data-ot-tempo]"), total = tela.querySelector("[data-ot-tempo-total]");
    tempo.innerHTML = eventos.map((e, i) => {
      const [dia, hora] = dataHora(e.data).split(", ");
      return '<li class="ot-evento"><time datetime="' + esc(e.data) + '"><span class="ot-evento-hora">' + esc(hora || "—") + '</span><span class="ot-evento-dia">' + esc(dia) + '</span></time><div class="ot-evento-conteudo">' +
        (i === 0 ? '<span class="ot-evento-recente">Mais recente</span>' : "") + '<b>' + esc(e.txt) + '</b>' + (e.sub ? '<p>' + esc(e.sub) + '</p>' : "") + '</div></li>';
    }).join("") || '<li class="ot-vazio">Sem atualizações.</li>';
    tempo.setAttribute("aria-busy", "false");
    total.textContent = eventos.length + (eventos.length === 1 ? " registro" : " registros");
    total.hidden = false;
    // provas
    const fotos = await urlsDasFotos([c.evidencias, cx.registros.map((g) => g.dados)]);
    if (abertoId !== id) return;
    const blocos = [
      provaHorario(ev), provaNumeros(c, ev), provaChecklist(ev), provaFeedback(ev),
      fotos.length ? bloco("Fotos", '<div class="ot-fotos">' + fotos.map((u) => '<button type="button" data-ot-ampliar="' + esc(u) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>').join("") + "</div>") : "",
      cx.item ? bloco("Item", '<div class="ot-item">' + (cx.item.foto_url ? '<img src="' + esc(cx.item.foto_url) + '" alt="">' : "") + "<span>" + esc(cx.item.descricao_total || cx.item.produto) + "<small>" + esc(cx.item.categoria || "") + "</small></span></div>") : "",
      provaEtapa(cx),
      bloco("Dados registrados na origem", '<details><summary>Ver todos os campos</summary>' + brutos(c.evidencias, rot) + "</details>"),
    ].filter(Boolean);
    tela.querySelector("[data-ot-provas]").innerHTML = '<div class="ot-prova-topo"><small>PROVAS</small><h3>' + esc(titulo) + "</h3></div>" + blocos.join("");
  }
  window.OPTela = { abrir, fechar };
})();
