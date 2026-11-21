// Geral › Uso de IA (21/11/2026). Franquia mensal de créditos, uso por agente/pessoa/decorador, por dia, histórico
// e excedente (pós-pago, vai na próxima fatura). Tudo vem da RPC ia_uso_painel; a franquia e o preço do excedente só o
// responsável pelo sistema muda (ia_plano_salvar). Crédito = US$ 0,01 de custo de IA (ver a migration 20261121000500).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v) || 0; return n.toLocaleString("pt-BR", { maximumFractionDigits: n > 0 && n < 10 ? 1 : 0 }); };
  const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  // Nomes e cores de cada agente/recurso (as cores dos agentes são as do app; as outras seguem a mesma paleta).
  const ORIGENS = {
    helena: { foto: "helena", nome: "Helena", papel: "Catálogo e pedidos", cor: "#b4657a" },
    clara: { foto: "clara", nome: "Clara", papel: "Financeiro", cor: "#2a78d6" },
    miguel: { foto: "miguel", nome: "Miguel", papel: "Estoque e separação", cor: "#1baf7a" },
    carla: { foto: "carla", nome: "Carla", papel: "Compras", cor: "#eb6834" },
    marcos: { foto: "marcos", nome: "Marcos", papel: "Manutenção", cor: "#6250d6" },
    ideia: { foto: "ideia", nome: "Ideia Premiada", papel: "Ideias de melhoria", cor: "#eda100" },
    reunioes: { nome: "Reuniões", papel: "Transcrição e atas", cor: "#0f8a8a" },
    studio3d: { nome: "3D e renderizações", papel: "Fotos com IA e tecido", cor: "#8a5a2b" },
    compras: { nome: "Propostas de compra", papel: "Leitura dos orçamentos", cor: "#c2410c" },
    montagem: { foto: "montagem", nome: "Assistente da montagem", papel: "App do Montador", cor: "#4b5563" },
    avaria: { nome: "Setor da avaria", papel: "Sugere o setor da O.S.", cor: "#9a3412" },
    planejador: { nome: "Planejador de eventos", papel: "", cor: "#64748b" },
    solicitacao: { nome: "Solicitações", papel: "", cor: "#64748b" },
  };
  const origem = (k) => ORIGENS[k] || { nome: k || "Outro", papel: "", cor: "#94a3b8" };
  const ACOES = { conversar: "conversa", transcrever: "áudio", ligacao: "ligação", ligacao_iniciar: "ligação", gerar_ata: "ata", transcrever_parte: "gravação", perguntar: "pergunta", relatorio: "relatório", organizar: "organizou o extrato", ler_extrato: "leu o extrato", classificar_dre: "organizou a DRE" };
  const acaoNome = (a) => ACOES[a] || String(a || "").replace(/_/g, " ");
  // Retrato do agente (assets/agentes/<nome>.jpg, os mesmos do app e das conversas); sem retrato, a inicial na cor dele.
  const bolinha = (k, cls = "") => {
    const g = origem(k);
    return `<span class="ia-bolinha ${cls}" style="background:${g.cor}">${esc(g.nome[0])}${g.foto ? `<img src="../../../assets/agentes/${g.foto}.jpg" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
  };
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  const S = { empresa: null, mes: null, dados: null, abaPessoa: "equipe" };

  function primeiroDia(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

  function avatar(p) {
    const ini = `<span class="ia-ini">${esc(iniciais(p.nome))}</span>`;
    let url = p.foto || "";
    if (!url && p.tipo === "equipe" && p.usuario_id && window.supabaseClient) {
      url = window.supabaseClient.storage.from("avatares").getPublicUrl(`${S.empresa}/${p.usuario_id}.jpg`).data?.publicUrl || "";
    }
    if (!url || /^(funcionarios|rh)\//.test(url)) return `<span class="ia-av">${ini}</span>`;
    return `<span class="ia-av">${ini}<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }

  async function carregar() {
    $("iaErro").hidden = true;
    $("iaMesNome").textContent = `${MESES[S.mes.getMonth()]} de ${S.mes.getFullYear()}`;
    const hoje = primeiroDia(new Date());
    $("iaMesProx").disabled = S.mes >= hoje;
    const { data, error } = await window.supabaseClient.rpc("ia_uso_painel", { p_empresa: S.empresa, p_mes: iso(S.mes) });
    if (error) {
      $("iaConteudo").innerHTML = "";
      $("iaErro").textContent = /permiss/i.test(error.message) ? "Você não tem permissão para ver o uso de IA." : "Não foi possível carregar o uso de IA. " + error.message;
      $("iaErro").hidden = false;
      return;
    }
    S.dados = data;
    $("iaPlanoBtn").hidden = !data.eh_dono;
    pintar();
  }

  function pintar() {
    const d = S.dados;
    const pct = d.franquia > 0 ? (d.usado / d.franquia) * 100 : 0;
    const pctProj = d.franquia > 0 ? (d.projecao / d.franquia) * 100 : 0;
    const estado = pct >= 100 ? "passou" : pct >= 80 ? "alerta" : "ok";
    const mesAtual = d.hoje >= d.mes && d.hoje <= d.fim;
    const diasRestam = mesAtual ? Math.max(0, Math.round((new Date(d.fim + "T23:59:59") - new Date()) / 86400000)) : 0;
    let frase;
    if (!mesAtual) frase = d.excedente > 0 ? `O mês fechou ${num(d.excedente)} créditos acima da franquia.` : "O mês fechou dentro da franquia.";
    else if (pct >= 100) frase = "A franquia do mês acabou. A IA continua funcionando e o excedente vai na próxima fatura.";
    else if (pctProj > 100) frase = `No ritmo atual, o mês deve fechar em cerca de ${num(d.projecao)} créditos — ${num(d.projecao - d.franquia)} acima da franquia (≈ ${brl((d.projecao - d.franquia) * d.valor_excedente)}).`;
    else frase = `No ritmo atual, o mês deve fechar em cerca de ${num(d.projecao)} créditos, dentro da franquia.`;

    const hero = `
      <section class="ia-hero is-${estado}">
        <div class="ia-hero-topo"><span>Créditos de IA · ${esc(MESES[S.mes.getMonth()])}</span>${mesAtual ? `<small>Renova em ${diasRestam} ${diasRestam === 1 ? "dia" : "dias"}</small>` : `<small>Mês encerrado</small>`}</div>
        <div class="ia-hero-num"><b>${num(d.usado)}</b><span>de ${num(d.franquia)} créditos usados</span><em>${Math.round(pct)}%</em></div>
        <div class="ia-uso" role="img" aria-label="${Math.round(pct)}% da franquia usada">
          <i style="width:${Math.min(pct, 100)}%"></i>
          ${mesAtual && pctProj > pct ? `<s style="left:${Math.min(pct, 100)}%;width:${Math.max(0, Math.min(pctProj, 100) - Math.min(pct, 100))}%" title="Projeção do mês"></s>` : ""}
          <em style="left:80%" aria-hidden="true"></em>
        </div>
        <div class="ia-hero-dados">
          <div><small>Restante</small><b>${num(d.restante)}</b><span>créditos</span></div>
          ${mesAtual ? `<div><small>Projeção do mês</small><b>${num(d.projecao)}</b><span>${Math.round(pctProj)}% da franquia</span></div>` : ""}
          <div class="${d.excedente > 0 ? "tem-excedente" : ""}"><small>Excedente</small><b>${num(d.excedente)}</b><span>${d.excedente > 0 ? `${brl(d.valor_excedente_total)} na próxima fatura` : "nada a pagar a mais"}</span></div>
          <div><small>Usos de IA</small><b>${num(d.chamadas)}</b><span>no mês</span></div>
          ${d.eh_dono ? `<div class="ia-so-dono"><small>Custo real da IA · só você vê</small><b>US$ ${(Number(d.custo_usd) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>${d.tem_plano ? `excedente a ${brl(d.valor_excedente)} por crédito` : "franquia padrão (ainda não configurada)"}</span></div>` : ""}
        </div>
        <p class="ia-hero-frase">${esc(frase)}</p>
      </section>`;

    $("iaConteudo").innerHTML = hero + `
      <div class="ia-grade">
        <section class="ia-card"><header><h2>Por agente</h2><small>Quem mais usa IA no sistema</small></header><div id="iaOrigens"></div></section>
        <section class="ia-card"><header><h2>Por dia</h2><div class="ia-legenda"><span><i style="background:#2a78d6"></i>Equipe</span><span><i style="background:#eb6834"></i>Decoradores</span></div></header><div id="iaDias"></div></section>
      </div>
      <section class="ia-card ia-pessoas-card"><header><h2>Quem mais usa</h2>
        <nav class="el-tabs ia-abas" role="tablist">
          <button type="button" role="tab" data-pessoa="equipe" aria-selected="${S.abaPessoa === "equipe"}">Equipe <b>${d.por_pessoa.filter((p) => p.tipo !== "decorador").length}</b></button>
          <button type="button" role="tab" data-pessoa="decorador" aria-selected="${S.abaPessoa === "decorador"}">Decoradores <b>${d.por_pessoa.filter((p) => p.tipo === "decorador").length}</b></button>
        </nav></header><div id="iaPessoas"></div></section>
      <div class="ia-grade">
        <section class="ia-card"><header><h2>Meses anteriores</h2><small>Uso e excedente de cada mês</small></header><div id="iaHistorico"></div></section>
        <section class="ia-card"><header><h2>Últimos usos</h2><small>Os 40 mais recentes do mês</small></header><div id="iaRecentes"></div></section>
      </div>`;
    pintarOrigens(); pintarDias(); pintarPessoas(); pintarHistorico(); pintarRecentes();
  }

  function vazio(texto) { return `<p class="ia-vazio">${esc(texto)}</p>`; }

  function pintarOrigens() {
    const lista = S.dados.por_origem;
    if (!lista.length) { $("iaOrigens").innerHTML = vazio("Nenhum uso de IA neste mês."); return; }
    const max = Math.max(...lista.map((o) => o.creditos), 0.0001), total = lista.reduce((s, o) => s + o.creditos, 0) || 1;
    $("iaOrigens").innerHTML = `<ul class="ia-barras">${lista.map((o) => {
      const g = origem(o.origem);
      const partes = [o.equipe > 0 ? `equipe ${num(o.equipe)}` : "", o.decoradores > 0 ? `decoradores ${num(o.decoradores)}` : ""].filter(Boolean).join(" · ");
      return `<li><div class="ia-barra-nome">${bolinha(o.origem)}<div><b>${esc(g.nome)}</b><small>${esc([g.papel, `${num(o.chamadas)} usos`].filter(Boolean).join(" · "))}</small></div><strong>${num(o.creditos)}<small>${Math.round((o.creditos / total) * 100)}%</small></strong></div>
        <div class="ia-barra-trilho"><i style="width:${(o.creditos / max) * 100}%;background:${g.cor}"></i></div>${partes ? `<small class="ia-barra-partes">${esc(partes)}</small>` : ""}</li>`;
    }).join("")}</ul>`;
  }

  function pintarDias() {
    const d = S.dados, mapa = new Map(d.por_dia.map((x) => [x.dia, x]));
    const dias = [];
    for (let i = 0; i < d.dias_mes; i++) { const dt = new Date(S.mes.getFullYear(), S.mes.getMonth(), i + 1); dias.push({ dia: iso(dt), n: i + 1, ...(mapa.get(iso(dt)) || { creditos: 0, equipe: 0, decoradores: 0 }) }); }
    const max = Math.max(...dias.map((x) => x.creditos), 1);
    const W = 640, H = 190, base = 168, larg = W / dias.length, bar = Math.max(3, larg - 4);
    const barras = dias.map((x, i) => {
      const he = ((x.equipe || 0) / max) * (base - 10), hd = ((x.decoradores || 0) / max) * (base - 10);
      const xx = i * larg + (larg - bar) / 2;
      return `<g class="ia-dia" data-i="${i}">
        <rect class="ia-dia-alvo" x="${i * larg}" y="0" width="${larg}" height="${base}" fill="transparent"></rect>
        ${he > 0 ? `<rect x="${xx}" y="${base - he}" width="${bar}" height="${he}" rx="2" fill="#2a78d6"></rect>` : ""}
        ${hd > 0 ? `<rect x="${xx}" y="${base - he - hd - (he > 0 ? 2 : 0)}" width="${bar}" height="${hd}" rx="2" fill="#eb6834"></rect>` : ""}
        ${x.n === 1 || x.n % 5 === 0 ? `<text x="${i * larg + larg / 2}" y="${H - 4}" text-anchor="middle">${x.n}</text>` : ""}
      </g>`;
    }).join("");
    $("iaDias").innerHTML = `<div class="ia-graf"><div class="ia-graf-leitura" id="iaDiaLeitura">Passe o mouse num dia para ver o uso</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Créditos usados por dia"><line x1="0" x2="${W}" y1="${base}" y2="${base}" class="ia-eixo"></line>${barras}</svg></div>`;
    const leitura = $("iaDiaLeitura");
    $("iaDias").querySelectorAll(".ia-dia").forEach((g) => {
      const mostrar = () => {
        const x = dias[Number(g.dataset.i)];
        $("iaDias").querySelectorAll(".ia-dia.on").forEach((o) => o.classList.remove("on"));
        g.classList.add("on");
        leitura.innerHTML = `<b>${x.n} de ${MESES[S.mes.getMonth()]}</b> · ${num(x.creditos)} créditos${x.decoradores > 0 ? ` <span>(equipe ${num(x.equipe)} · decoradores ${num(x.decoradores)})</span>` : ""}`;
      };
      g.addEventListener("mouseenter", mostrar); g.addEventListener("click", mostrar);
    });
  }

  function pintarPessoas() {
    const lista = S.dados.por_pessoa.filter((p) => (S.abaPessoa === "decorador") === (p.tipo === "decorador"));
    if (!lista.length) { $("iaPessoas").innerHTML = vazio(S.abaPessoa === "decorador" ? "Nenhum decorador usou IA neste mês." : "Ninguém da equipe usou IA neste mês."); return; }
    const max = Math.max(...lista.map((p) => p.creditos), 0.0001);
    $("iaPessoas").innerHTML = `<ul class="ia-pessoas">${lista.map((p) => {
      const ags = Object.entries(p.origens || {}).sort((a, b) => b[1] - a[1]);
      return `<li>${avatar(p)}<div class="ia-p-corpo"><div class="ia-p-topo"><b>${esc(p.nome)}</b><strong>${num(p.creditos)} <small>créditos</small></strong></div>
        <div class="ia-barra-trilho"><i style="width:${(p.creditos / max) * 100}%"></i></div>
        <div class="ia-chips">${ags.map(([k, v]) => `<span><i style="background:${origem(k).cor}"></i>${esc(origem(k).nome)} ${num(v)}</span>`).join("")}<small>${num(p.chamadas)} usos</small></div></div></li>`;
    }).join("")}</ul>`;
  }

  function pintarHistorico() {
    const h = S.dados.historico;
    if (!h.length) { $("iaHistorico").innerHTML = vazio("Ainda não há meses com uso de IA."); return; }
    $("iaHistorico").innerHTML = `<table class="ia-tabela"><thead><tr><th>Mês</th><th class="n">Usado</th><th class="n">Excedente</th><th class="n">Na fatura</th></tr></thead><tbody>${h.map((m) => {
      const dt = new Date(m.mes + "T12:00:00");
      return `<tr><td>${esc(MESES[dt.getMonth()])} ${dt.getFullYear()}</td><td class="n">${num(m.usado)}</td><td class="n ${m.excedente > 0 ? "neg" : ""}">${m.excedente > 0 ? num(m.excedente) : "–"}</td><td class="n ${m.valor > 0 ? "neg" : ""}">${m.valor > 0 ? brl(m.valor) : "–"}</td></tr>`;
    }).join("")}</tbody></table><p class="ia-nota">O excedente usa a franquia e o preço de hoje.</p>`;
  }

  function pintarRecentes() {
    const r = S.dados.recentes;
    if (!r.length) { $("iaRecentes").innerHTML = vazio("Nenhum uso de IA neste mês."); return; }
    const hora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    $("iaRecentes").innerHTML = `<ul class="ia-recentes">${r.map((u) => `<li>${bolinha(u.origem, "p")}
      <div><b>${esc(origem(u.origem).nome)}</b>${u.acao ? ` <small>${esc(acaoNome(u.acao))}</small>` : ""}<small>${esc(u.nome)}${u.decorador ? " · decorador" : ""} · ${hora(u.criado_em)}</small></div><strong>${num(u.creditos)}</strong></li>`).join("")}</ul>`;
  }

  function abrirPlano() {
    const d = S.dados;
    $("iaPlFranquia").value = d.franquia; $("iaPlValor").value = d.valor_excedente; $("iaPlObs").value = "";
    $("iaPlErro").hidden = true;
    $("iaPlCusto").textContent = `1 crédito = US$ 0,01 de custo de IA. Neste mês a empresa usou ${num(d.usado)} créditos (US$ ${(Number(d.custo_usd) || 0).toFixed(2)} de custo real).`;
    $("iaPlanoDlg").showModal();
  }

  async function salvarPlano(ev) {
    ev.preventDefault();
    const { error } = await window.supabaseClient.rpc("ia_plano_salvar", { p_empresa: S.empresa, p_franquia: Number($("iaPlFranquia").value), p_valor: Number($("iaPlValor").value), p_obs: $("iaPlObs").value });
    if (error) { $("iaPlErro").textContent = error.message; $("iaPlErro").hidden = false; return; }
    $("iaPlanoDlg").close();
    carregar();
  }

  async function iniciar() {
    if (typeof window.aguardarContexto === "function") await window.aguardarContexto();
    S.empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    S.mes = primeiroDia(new Date());
    $("iaMesAnt").addEventListener("click", () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() - 1, 1); carregar(); });
    $("iaMesProx").addEventListener("click", () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 1); carregar(); });
    $("iaPlanoBtn").addEventListener("click", abrirPlano);
    $("iaPlanoForm").addEventListener("submit", salvarPlano);
    $("iaPlCancelar").addEventListener("click", () => $("iaPlanoDlg").close());
    $("iaComoFunciona").addEventListener("click", () => $("iaAjudaDlg").showModal());
    $("iaConteudo").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pessoa]");
      if (!b) return;
      S.abaPessoa = b.dataset.pessoa;
      document.querySelectorAll("[data-pessoa]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      pintarPessoas();
    });
    carregar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.UsoIA = { carregar };
})();
