/* Tela de consulta da complexidade de um pedido (nov/2026, pedido do usuário: "trocar o modal por uma tela que mostra
   as perguntas e principalmente as provas na coluna da direita, sempre com provas, as perguntas de cada setor").
   Só leitura. Cada resposta automática mostra, à direita, os dados que a geraram (itens com foto, personalizações,
   etiquetas do local, caminhões, datas, histórico do cliente) e quantos pontos ela soma na nota do setor.
   Regras: js/shared/complexidade.js (CXRegras). Contexto do pedido: complexidade_contextos_tela (guardado em p.contexto). */
(function () {
  "use strict";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const sb = () => window.supabaseClient;
  const dataBR = v => { const t = String(v || "").slice(0, 10).split("-"); return t.length === 3 ? t[2] + "/" + t[1] + "/" + t[0] : (v || "—"); };
  const horaBR = v => String(v || "").slice(0, 5);
  const diaSemana = d => d ? ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(String(d).slice(0, 10) + "T12:00:00Z").getUTCDay()] : "";
  const dataHoraSP = v => v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
  const SEM_FOTO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#eef1f5"/><path d="M11 27l6-7 5 5 3-3 4 5z" fill="#c4ccd6"/><circle cx="25" cy="15" r="3" fill="#c4ccd6"/></svg>');

  let tela = null, atual = null, setorAtivo = null, perguntaAtiva = null;
  const extrasCache = new Map();

  async function contextoDe(p) {
    if (p.contexto) return p.contexto;
    const empresa = p.empresa_id || window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    const { data, error } = await sb().rpc("complexidade_contextos_tela", { p_empresa: empresa });
    if (error) throw error;
    return (data || []).find(c => String(c.id) === String(p.id)) || null;
  }

  // Dados extras para as provas: nomes e fotos dos itens, caminhões escalados e pedidos anteriores do cliente.
  async function extras(c) {
    if (extrasCache.has(c.id)) return extrasCache.get(c.id);
    const ids = [...new Set([...(c.itens || []), ...(c.pecas || []), ...(c.servicos || [])].map(i => i.item_id).filter(Boolean))];
    const r = { itens: new Map(), caminhoes: [], anteriores: [] };
    const tarefas = [];
    if (ids.length) tarefas.push(sb().from("itens").select("id,produto,descricao_total,foto_url,material,cor,categoria").in("id", ids).then(({ data }) => (data || []).forEach(i => r.itens.set(i.id, i))));
    tarefas.push((async () => {
      const { data: et } = await sb().from("operacao_etapas").select("id,tipo,data,hora").eq("pedido_id", c.id).in("tipo", ["carregamento", "montagem"]);
      const etapas = (et || []).filter(e => e.tipo === "carregamento");
      if (!etapas.length) return;
      const { data: ec } = await sb().from("operacao_etapa_caminhoes").select("etapa_id,caminhao_id").in("etapa_id", etapas.map(e => e.id));
      const cids = [...new Set((ec || []).map(x => x.caminhao_id))];
      if (!cids.length) return;
      const { data: cams } = await sb().from("caminhoes").select("id,codigo,modelo,placa,foto_url,capacidade_m3").in("id", cids);
      r.caminhoes = cams || [];
    })().catch(() => {}));
    tarefas.push((async () => {
      const { data: ped } = await sb().from("separacoes_pedidos").select("cliente_id,cliente_nome,data_evento").eq("id", c.id).maybeSingle();
      if (!ped) return;
      let q = sb().from("separacoes_pedidos").select("id,numero_pedido,data_evento,local_nome,status_comercial").in("status_comercial", ["aprovado", "finalizado", "enviado"]).neq("id", c.id).order("data_evento", { ascending: false }).limit(12);
      q = ped.cliente_id ? q.eq("cliente_id", ped.cliente_id) : q.eq("cliente_nome", ped.cliente_nome);
      if (ped.data_evento) q = q.lt("data_evento", ped.data_evento);
      const { data } = await q; r.anteriores = data || [];
    })().catch(() => {}));
    await Promise.all(tarefas);
    extrasCache.set(c.id, r);
    return r;
  }

  // ---------- peças de prova ----------
  const fato = (rotulo, valor, destaque) => `<div class="cxt-fato${destaque ? " is-" + destaque : ""}"><span>${esc(rotulo)}</span><b>${valor}</b></div>`;
  const fatos = lista => `<div class="cxt-fatos">${lista.join("")}</div>`;
  const nota = t => `<p class="cxt-nota">${t}</p>`;
  function itemHtml(ex, id, extra, base) {
    const i = ex.itens.get(id) || {};
    const nome = i.descricao_total || i.produto || base?.produto_base || "Item";
    return `<li class="cxt-item"><img src="${esc(i.foto_url || SEM_FOTO)}" alt="" loading="lazy" onerror="this.src='${SEM_FOTO}'"><div><b>${esc(nome)}</b><small>${esc([i.categoria || base?.categoria, i.material || base?.material].filter(Boolean).join(" · "))}</small>${extra ? `<em>${extra}</em>` : ""}</div></li>`;
  }
  const lista = (itens, vazio) => itens.length ? `<ul class="cxt-itens">${itens.join("")}</ul>` : `<div class="cxt-vazio">${vazio}</div>`;
  const NOME_GRUPO = { sofa: "sofá", cadeira_puff: "cadeira, poltrona ou puff", bar: "bar", mesa: "mesa", aparador_estante: "aparador ou estante", painel: "painel" };

  function servicosDoSetor(c, setor) {
    return (c.servicos || []).filter(s => {
      const et = (Array.isArray(s.etapas) ? s.etapas : []).map(e => norm(e?.setor || e));
      if (et.length) return et.includes(setor);
      const t = norm(s.tipo);
      return setor === "pintura" ? t === "pintura" : ["forracao", "tecido", "costura", "estofado", "estofados"].includes(t);
    });
  }

  function prova(id, c, r, ex) {
    const cfg = { ...CXRegras.padrao(), ...(c.config || {}) };
    const excecao = r.fonte === "Exceção do pedido" ? nota("Resposta registrada como exceção deste pedido: " + esc(r.detalhe)) : "";
    const servLista = (setor, grupos) => {
      const todos = servicosDoSetor(c, setor);
      const casam = todos.filter(s => grupos.includes(CXRegras.grupo(s.item || {})));
      return { todos, casam };
    };
    const servItem = s => itemHtml(ex, s.item_id, `${Number(s.quantidade || 0)} peça(s) · ${esc(s.tipo || "Personalização")}`, s.item);
    switch (id) {
      case 1: case 2: case 3: case 11: case 12: case 13: {
        const mapa = { 1: ["forracao", ["sofa"]], 2: ["forracao", ["cadeira_puff"]], 3: ["forracao", ["bar"]], 11: ["pintura", ["cadeira_puff"]], 12: ["pintura", ["bar", "mesa"]], 13: ["pintura", ["aparador_estante"]] };
        const [setor, grupos] = mapa[id], { todos, casam } = servLista(setor, grupos);
        const nomeSetor = setor === "pintura" ? "pintura" : "forração/estofamento";
        return excecao + fatos([fato("Personalizações de " + nomeSetor + " no pedido", String(todos.length)), fato("Do tipo " + grupos.map(g => NOME_GRUPO[g]).join(" / "), String(casam.length), casam.length ? "sim" : "")]) +
          `<h5>Peças que respondem a pergunta</h5>` + lista(casam.map(servItem), "Nenhuma peça do tipo " + grupos.map(g => NOME_GRUPO[g]).join(" / ") + " com serviço de " + nomeSetor + ".") +
          (todos.length > casam.length ? `<h5>Outras personalizações de ${nomeSetor} (não contam aqui)</h5>` + lista(todos.filter(s => !casam.includes(s)).map(servItem), "") : "");
      }
      case 4: case 14: {
        const setor = id === 4 ? "forracao" : "pintura", todos = servicosDoSetor(c, setor), qtd = todos.reduce((n, s) => n + Number(s.quantidade || 0), 0);
        return excecao + fatos([fato("Peças com serviço de " + (id === 4 ? "forração" : "pintura"), String(qtd), qtd > cfg.limite_personalizados ? "sim" : ""), fato("Limite", String(cfg.limite_personalizados))]) + lista(todos.map(servItem), "Nenhuma peça com esse serviço neste pedido.");
      }
      case 5: {
        const h = c.cliente?.reclamacao_historico;
        return excecao + fatos([fato("Ligações de pós-venda registradas", String(h?.registros ?? "—")), fato("Com reclamação", String(h?.reclamacoes ?? (c.cliente?.complexidade?.reclamacao ? "marcado no cadastro" : 0)), r.valor ? "sim" : "")]) + nota(esc(h?.detalhe || r.detalhe));
      }
      case 6: {
        const ant = ex.anteriores;
        return excecao + fatos([fato("Pedidos confirmados antes deste", String(c.pedidos_anteriores ?? ant.length), r.valor ? "sim" : "")]) +
          lista(ant.map(p => `<li class="cxt-ped"><span class="cxt-num">${esc(p.numero_pedido)}</span><div><b>${dataBR(p.data_evento)}</b><small>${esc(p.local_nome || "")}</small></div></li>`), "Primeiro pedido confirmado deste cliente.");
      }
      case 7:
        return excecao + fatos([fato("Tipo de evento do pedido", esc(c.tipo_evento || "Não informado"), r.valor ? "sim" : "")]) + nota("Tipos que exigem operação especial (Parâmetros › Complexidade): <b>" + esc((cfg.tipos_especiais || []).join(", ") || "nenhum") + "</b>");
      case 9: case 26: {
        const cron = c.carregamento?.data ? c.carregamento : null, data = cron?.data || c.data_entrega, hora = cron?.hora || c.hora_entrega;
        const base = [fato("Carregamento", data ? dataBR(data) + " (" + diaSemana(data) + ")" + (hora ? " às " + horaBR(hora) : "") : "Sem data"), fato("Fonte", cron ? "Etapa no cronograma" : "Data e horário de entrega do pedido")];
        if (id === 9) return excecao + fatos(base.concat(fato("Segunda a quarta?", r.valor ? "Sim" : "Não", r.valor ? "sim" : "")));
        const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
        return excecao + fatos(base.concat(fato("Fora do expediente?", r.valor ? "Sim" : "Não", r.valor ? "sim" : ""))) + nota("Expediente (Parâmetros): " + esc((cfg.dias_expediente || []).map(d => dias[d]).join(", ")) + " das " + esc(cfg.inicio_expediente) + " às " + esc(cfg.fim_expediente));
      }
      case 10: {
        const set = new Set(); (c.servicos || []).forEach(s => (Array.isArray(s.etapas) ? s.etapas : []).forEach(e => { const t = norm(e?.setor || e); if (t) set.add(t); }));
        return excecao + fatos([fato("Setores envolvidos nas personalizações", esc([...set].map(s => ({ forracao: "Forração", pintura: "Pintura", personalizacao: "Personalização" }[s] || s)).join(", ") || "Nenhum"), set.size > 1 ? "sim" : "")]) + lista((c.servicos || []).map(servItem), "Nenhuma personalização no pedido.");
      }
      case 15: case 16: {
        let tags = c.local?.tags || {}; if (typeof tags === "string") { try { tags = JSON.parse(tags); } catch (_) { tags = {}; } }
        const obs = Array.isArray(tags.observacoes) ? tags.observacoes : tags.observacoes ? [tags.observacoes] : [];
        const alvo = id === 15 ? /baldea/i : /escada/i, marcado = c.local?.complexidade?.[id === 15 ? "baldeacao" : "escada"];
        const doCadastro = typeof marcado === "boolean" ? nota("Marcado no cadastro do local (condições para a complexidade): <b>" + (marcado ? "Sim" : "Não") + "</b>. Essa marcação vale antes das etiquetas.") : "";
        return excecao + fatos([fato("Local", esc(c.local_nome || "—")), fato(id === 15 ? "Precisa de baldeação?" : "Tem escada?", r.valor ? "Sim" : "Não", r.valor ? "sim" : "")]) + doCadastro +
          `<h5>Etiquetas do cadastro do local</h5>` + (obs.length ? `<div class="cxt-tags">${obs.map(t => `<span class="${alvo.test(t) ? "is-alvo" : ""}">${esc(t)}</span>`).join("")}</div>` : `<div class="cxt-vazio">O local não tem observações cadastradas.${doCadastro ? "" : " Sem a etiqueta, a resposta é Não."}</div>`);
      }
      case 18:
        return excecao + fatos([fato("Caminhões escalados no carregamento", String(c.caminhoes || 0), r.valor ? "sim" : ""), fato("Limite", String(cfg.limite_caminhoes))]) +
          lista(ex.caminhoes.map(k => `<li class="cxt-item"><img src="${esc(k.foto_url || SEM_FOTO)}" alt="" onerror="this.src='${SEM_FOTO}'"><div><b>${esc(k.codigo || k.modelo || "Caminhão")}</b><small>${esc([k.modelo, k.placa, k.capacidade_m3 ? k.capacidade_m3 + " m³" : ""].filter(Boolean).join(" · "))}</small></div></li>`), "Ainda sem caminhão escalado no Painel Logístico.");
      case 19: {
        const pecas = (c.pecas || []).slice().sort((a, b) => Number(b.quantidade) - Number(a.quantidade)), total = pecas.reduce((n, p) => n + Number(p.quantidade || 0), 0);
        return excecao + fatos([fato("Peças físicas (kits abertos)", String(total), r.valor ? "sim" : ""), fato("Limite da triagem", String(cfg.limite_pecas))]) + lista(pecas.map(p => itemHtml(ex, p.item_id, Number(p.quantidade || 0) + " un.", p)), "Pedido sem peças.");
      }
      case 20: case 24: {
        const frageis = (c.pecas || []).filter(p => { const b = p.complexidade?.fragil; return typeof b === "boolean" ? b : /vidro|espelho|laca/.test(norm(p.material)); });
        const materiais = [...new Set((c.pecas || []).map(p => p.material).filter(Boolean))];
        return excecao + fatos([fato("Peças de vidro, espelho ou laca", String(frageis.reduce((n, p) => n + Number(p.quantidade || 0), 0)), frageis.length ? "sim" : "")]) +
          lista(frageis.map(p => itemHtml(ex, p.item_id, Number(p.quantidade || 0) + " un. · " + esc(p.material || "marcada como frágil"), p)), "Nenhuma peça frágil.") +
          (materiais.length ? nota("Materiais no pedido: " + esc(materiais.join(", "))) : "");
      }
      case 21:
        return excecao + fatos([fato("Itens com personalização", String((c.servicos || []).length), r.valor ? "sim" : "")]) + lista((c.servicos || []).map(servItem), "Nenhuma personalização no pedido.");
      case 22: {
        const ex2 = c.excecoes || {}, conf = ex2.confirmado_em || c.confirmado_em || c.reservado_em;
        const ref = c.montagem?.data ? c.montagem : c.data_entrega ? { data: c.data_entrega, hora: c.hora_entrega || "08:00" } : null;
        const montagem = ref ? Date.parse(String(ref.data).slice(0, 10) + "T" + String(ref.hora || "08:00").slice(0, 5) + ":00-03:00") : NaN;
        const horas = Number.isFinite(montagem) && conf ? Math.round((montagem - Date.parse(conf)) / 36e5) : null;
        const origem = ex2.confirmado_em ? "Autorizada no pedido" : c.confirmado_em ? "Primeiro pagamento" : c.reservado_em ? "Dia em que virou Reservado" : "Pedido ainda não confirmado";
        return excecao + fatos([fato("Confirmação", conf ? dataHoraSP(conf) : "—"), fato("Origem", esc(origem)), fato("Montagem", ref ? dataBR(ref.data) + " às " + horaBR(ref.hora || "08:00") : "—"), fato("Antecedência", horas === null ? "—" : horas + " h", r.valor ? "sim" : ""), fato("Referência", cfg.antecedencia_horas + " h")]);
      }
      case 23: {
        const vol = (c.itens || []).filter(i => { const v = i.complexidade?.volumoso; return typeof v === "boolean" ? v : (cfg.grupos_volumosos || []).includes(CXRegras.grupo(i)); });
        return excecao + fatos([fato("Itens de manuseio volumoso", String(vol.reduce((n, i) => n + Number(i.quantidade || 0), 0)), vol.length ? "sim" : "")]) + lista(vol.map(i => itemHtml(ex, i.item_id, Number(i.quantidade || 0) + " un. · " + esc(NOME_GRUPO[CXRegras.grupo(i)] || "marcado como volumoso"), i)), "Nenhum item volumoso.") +
          nota("Grupos volumosos (Parâmetros): " + esc((cfg.grupos_volumosos || []).map(g => NOME_GRUPO[g] || g).join(", ")));
      }
      default: return excecao + nota(esc(r.fonte) + " · " + esc(r.detalhe));
    }
  }

  // ---------- desenho ----------
  function pontosDe(c, setor, id) {
    const cfg = { ...CXRegras.padrao(), ...(c.config || {}) }, pesos = { ...CXRegras.padrao().pesos, ...(cfg.pesos || {}) }, p = pesos[id] || { sim: 0, nao: 0 };
    const sx = atual.complexidade.setores[setor.id], r = atual.complexidade.respostas[id];
    const forcado = sx.base_geral && setor.perguntas.includes(id);
    const valor = forcado ? false : r.valor;
    return { sim: p.sim, nao: p.nao, max: Math.max(p.sim, p.nao), ganho: valor === null ? null : valor ? p.sim : p.nao, valor, forcado };
  }
  function desenhar() {
    const p = atual, c = p.contexto;
    const setor = CXRegras.setores.find(s => s.id === setorAtivo) || CXRegras.setores[0];
    const sx = p.complexidade.setores[setor.id], v = CXRegras.apresentarScore(sx);
    const ids = [...CXRegras.gerais, ...setor.perguntas];
    if (!ids.includes(perguntaAtiva)) perguntaAtiva = setor.perguntas[0];
    let soma = 0, max = 0; ids.forEach(id => { const k = pontosDe(c, setor, id); max += k.max; if (k.ganho !== null) soma += k.ganho; });
    const titulo = id => CXRegras.perguntas.find(q => q.id === id)?.titulo || "Pergunta " + id;
    const linha = id => {
      const k = pontosDe(c, setor, id), r = p.complexidade.respostas[id];
      return `<button type="button" class="cxt-q${id === perguntaAtiva ? " is-ativa" : ""}" data-cxt-q="${id}">
        <span class="cxt-q-titulo">${esc(titulo(id))}</span>
        <span class="cxt-q-resp ${k.valor === null ? "sem" : k.valor ? "sim" : "nao"}">${k.valor === null ? "Sem dado" : k.valor ? "Sim" : "Não"}</span>
        <span class="cxt-q-pts"><b>${k.ganho ?? "—"}</b> de ${k.max} pts</span>
        <small>${esc(k.forcado ? "Setor sem serviço neste pedido: conta como Não" : r.fonte)}</small></button>`;
    };
    const k = pontosDe(c, setor, perguntaAtiva), r = p.complexidade.respostas[perguntaAtiva];
    tela.querySelector("[data-cxt-setores]").innerHTML = CXRegras.setores.map(s => { const a = CXRegras.apresentarScore(p.complexidade.setores[s.id]); return `<button type="button" class="cxt-setor${s.id === setor.id ? " is-ativo" : ""}" data-cxt-setor="${s.id}"><small>${esc(s.nome)}</small><b>${esc(a.texto)}</b></button>`; }).join("");
    tela.querySelector("[data-cxt-perguntas]").innerHTML =
      `<div class="cxt-conta"><b>${esc(setor.nome)}: ${esc(v.texto)}</b><span>Somou <b>${soma}</b> de <b>${max}</b> pontos possíveis${sx.ajuste_personalizacao?.acrescimo_percentual ? " + acréscimo de " + Math.round(sx.ajuste_personalizacao.acrescimo_percentual) + "% pela complexidade das personalizações" : ""}.${sx.base_geral ? " Este setor não tem serviço neste pedido: as perguntas dele contam como Não." : ""}</span></div>
      <h4>Perguntas de ${esc(setor.nome)}</h4>${setor.perguntas.map(linha).join("")}
      <h4>Fatores gerais (valem para todos os setores)</h4>${CXRegras.gerais.map(linha).join("")}`;
    const lado = tela.querySelector("[data-cxt-provas]");
    lado.innerHTML = `<div class="cxt-prova-topo"><small>PROVA</small><h3>${esc(titulo(perguntaAtiva))}</h3>
      <div class="cxt-prova-resp"><span class="cxt-q-resp ${k.valor === null ? "sem" : k.valor ? "sim" : "nao"}">${k.valor === null ? "Sem dado" : k.valor ? "Sim" : "Não"}</span><span>${k.ganho ?? "—"} de ${k.max} pontos · Sim vale ${k.sim}, Não vale ${k.nao}</span></div>
      <p class="cxt-fonte">Fonte: <b>${esc(r.fonte)}</b></p></div><div class="cxt-prova-corpo"><div class="cxt-carregando">Buscando os dados…</div></div>`;
    extras(c).then(ex => {
      if (tela.dataset.pedido !== String(p.id) || Number(lado.dataset.q || 0) !== perguntaAtiva) return;
      lado.querySelector(".cxt-prova-corpo").innerHTML = prova(perguntaAtiva, c, r, ex);
    }).catch(() => { lado.querySelector(".cxt-prova-corpo").innerHTML = prova(perguntaAtiva, c, r, { itens: new Map(), caminhoes: [], anteriores: [] }); });
    lado.dataset.q = perguntaAtiva;
  }

  function montar() {
    if (tela) return tela;
    tela = document.createElement("section");
    tela.className = "cxt"; tela.hidden = true; tela.setAttribute("aria-label", "Complexidade do pedido");
    tela.innerHTML = `<header class="cxt-topo"><button type="button" class="cxt-voltar" data-cxt-voltar>← Voltar</button><div class="cxt-ped" data-cxt-ped></div></header>
      <nav class="cxt-setores" data-cxt-setores></nav>
      <div class="cxt-corpo"><div class="cxt-perguntas" data-cxt-perguntas></div><aside class="cxt-provas" data-cxt-provas aria-live="polite"></aside></div>`;
    document.body.append(tela);
    tela.addEventListener("click", e => {
      const s = e.target.closest("[data-cxt-setor]"); if (s) { setorAtivo = s.dataset.cxtSetor; perguntaAtiva = null; desenhar(); return; }
      const q = e.target.closest("[data-cxt-q]"); if (q) { perguntaAtiva = Number(q.dataset.cxtQ); desenhar(); if (innerWidth < 1000) tela.querySelector("[data-cxt-provas]").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (e.target.closest("[data-cxt-voltar]")) fechar();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && tela && !tela.hidden) fechar(); });
    return tela;
  }
  function fechar() { if (!tela) return; tela.hidden = true; document.documentElement.classList.remove("cxt-aberta"); }

  async function abrir(p) {
    montar();
    atual = p; setorAtivo = setorAtivo || CXRegras.setores[0].id; perguntaAtiva = null;
    tela.dataset.pedido = String(p.id);
    tela.querySelector("[data-cxt-ped]").innerHTML = `<span class="cxt-num">${esc(p.numero)}</span>${typeof fotoClienteCX === "function" ? fotoClienteCX(p.cliente) : ""}<div><b>${esc(p.cliente)}</b><small>${esc([p.local, p.data ? "evento " + dataBR(p.data) : ""].filter(Boolean).join(" · "))}</small></div>${p.complexidade.congelado ? `<span class="cxt-congelado">Avaliação encerrada em ${esc(dataHoraSP(p.complexidade.congelado_em))}</span>` : ""}`;
    tela.hidden = false; document.documentElement.classList.add("cxt-aberta"); tela.scrollTop = 0;
    tela.querySelector("[data-cxt-perguntas]").innerHTML = '<div class="cxt-carregando">Carregando…</div>';
    tela.querySelector("[data-cxt-provas]").innerHTML = "";
    try {
      if (!p.contexto) p.contexto = await contextoDe(p);
      if (!p.contexto) throw new Error("Não encontrei os dados deste pedido.");
      if (tela.dataset.pedido === String(p.id)) desenhar();
    } catch (e) {
      tela.querySelector("[data-cxt-perguntas]").innerHTML = `<div class="cxt-vazio">Não foi possível abrir as provas: ${esc(e.message || e)}</div>`;
    }
  }
  window.CXTela = { abrir, fechar };
})();
