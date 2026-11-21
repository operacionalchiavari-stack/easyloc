// Geral › Time de agentes (antes "Uso de IA", 21/11/2026). A ideia da tela: ver os agentes de IA como um time de
// funcionários (foto grande, quanto cada um trabalhou e custou no mês), para comparar com o custo de uma pessoa. Franquia mensal de créditos, uso por agente/pessoa/decorador, por dia, histórico
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
      $("iaErro").textContent = /permiss/i.test(error.message) ? "Você não tem permissão para ver o time de agentes." : "Não foi possível carregar o uso de IA. " + error.message;
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

    // Faixa compacta (21/11/2026): os créditos numa linha só, para o time de agentes subir e ficar em destaque.
    const hero = `
      <section class="ia-hero ia-hero-compacto is-${estado}">
        <div class="ia-hc-uso">
          <div class="ia-hc-topo"><span>Créditos de IA · ${esc(MESES[S.mes.getMonth()])}</span><small>${mesAtual ? `renova em ${diasRestam} ${diasRestam === 1 ? "dia" : "dias"}` : "mês encerrado"}</small></div>
          <div class="ia-hc-num"><b>${num(d.usado)}</b><span>de ${num(d.franquia)}</span><em>${Math.round(pct)}%</em></div>
          <div class="ia-uso" role="img" aria-label="${Math.round(pct)}% da franquia usada">
            <i style="width:${Math.min(pct, 100)}%"></i>
            ${mesAtual && pctProj > pct ? `<s style="left:${Math.min(pct, 100)}%;width:${Math.max(0, Math.min(pctProj, 100) - Math.min(pct, 100))}%" title="Projeção do mês"></s>` : ""}
            <em style="left:80%" aria-hidden="true"></em>
          </div>
        </div>
        <div class="ia-hc-dados">
          <div><small>Restante</small><b>${num(d.restante)}</b></div>
          ${mesAtual ? `<div title="${Math.round(pctProj)}% da franquia"><small>Projeção</small><b>${num(d.projecao)}</b></div>` : ""}
          <div class="${d.excedente > 0 ? "tem-excedente" : ""}" title="${d.excedente > 0 ? `${brl(d.valor_excedente_total)} na próxima fatura` : "nada a pagar a mais"}"><small>Excedente</small><b>${num(d.excedente)}</b></div>
          <div><small>Tarefas</small><b>${num(d.chamadas)}</b></div>
        </div>
        <p class="ia-hero-frase">${esc(frase)}</p>
      </section>`;

    $("iaConteudo").innerHTML = hero + `
      <section class="ia-time"><header><h2>Seu time de agentes</h2><small>O que cada um fez e quanto custou em ${esc(MESES[S.mes.getMonth()])}</small></header><div id="iaOrigens"></div></section>
      <div class="ia-grade">
        <section class="ia-card"><header><h2>Equipe</h2><small>Quem da equipe mais usou os agentes</small></header><div id="iaPEquipe"></div></section>
        <section class="ia-card"><header><h2>Decoradores</h2><small>Uso dos agentes pelo catálogo</small></header><div id="iaPDecoradores"></div></section>
      </div>
      <div class="ia-grade">
        <section class="ia-card"><header><h2>Por dia</h2><div class="ia-legenda"><span><i style="background:#2a78d6"></i>Equipe</span><span><i style="background:#eb6834"></i>Decoradores</span></div></header><div id="iaDias"></div></section>
        <section class="ia-card"><header><h2>Meses anteriores</h2><small>Uso e excedente de cada mês</small></header><div id="iaHistorico"></div></section>
      </div>
      <section class="ia-card"><header><h2>Últimos trabalhos</h2><small>Os 40 mais recentes do mês</small></header><div id="iaRecentes"></div></section>`;
    pintarOrigens(); pintarDias(); pintarPessoas(); pintarHistorico(); pintarRecentes();
  }

  function vazio(texto) { return `<p class="ia-vazio">${esc(texto)}</p>`; }

  // Os 6 agentes do time aparecem sempre (mesmo sem uso); as outras funções com IA vêm numa faixa menor embaixo.
  const TIME = ["helena", "clara", "miguel", "carla", "marcos", "ideia"];
  function pintarOrigens() {
    const d = S.dados, lista = d.por_origem, porK = new Map(lista.map((o) => [o.origem, o]));
    const total = lista.reduce((t, o) => t + o.creditos, 0) || 1;
    const time = TIME.concat(porK.has("montagem") ? ["montagem"] : []);
    const cracha = (k) => {
      const g = origem(k), o = porK.get(k) || { creditos: 0, chamadas: 0, equipe: 0, decoradores: 0 };
      const partes = [o.equipe > 0 ? `equipe ${num(o.equipe)}` : "", o.decoradores > 0 ? `decoradores ${num(o.decoradores)}` : ""].filter(Boolean).join(" · ");
      return `<article class="ia-agente ${o.creditos > 0 ? "" : "is-parado"}" style="--ag:${g.cor}">
        <div class="ia-agente-foto">${esc(g.nome[0])}${g.foto ? `<img src="../../../assets/agentes/${g.foto}.jpg" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>
        <h3>${esc(g.nome)}</h3><span class="ia-agente-papel">${esc(g.papel)}</span>
        ${o.creditos > 0 ? `<div class="ia-agente-num"><div><b>${num(o.chamadas)}</b><small>tarefas</small></div><div><b>${num(o.creditos)}</b><small>créditos</small></div><div><b>${brl(o.creditos * d.valor_excedente)}</b><small>no mês</small></div></div>
        <div class="ia-barra-trilho"><i style="width:${(o.creditos / total) * 100}%;background:${g.cor}"></i></div>
        <small class="ia-agente-parte">${Math.round((o.creditos / total) * 100)}% do uso do time${partes ? ` · ${esc(partes)}` : ""}</small>` : `<p class="ia-agente-livre">Sem tarefas neste mês</p>`}
      </article>`;
    };
    const outros = lista.filter((o) => !time.includes(o.origem));
    $("iaOrigens").innerHTML = `<div class="ia-agentes">${time.map(cracha).join("")}</div>
      ${outros.length ? `<div class="ia-outros"><h3>Outras funções com IA</h3><ul>${outros.map((o) => `<li>${bolinha(o.origem, "p")}<div><b>${esc(origem(o.origem).nome)}</b><small>${esc([origem(o.origem).papel, `${num(o.chamadas)} usos`].filter(Boolean).join(" · "))}</small></div><strong>${num(o.creditos)} <small>créditos · ${brl(o.creditos * d.valor_excedente)}</small></strong></li>`).join("")}</ul></div>` : ""}
      <p class="ia-nota">Valores em reais pelo preço do crédito (${brl(d.valor_excedente)} por crédito).</p>`;
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

  const CORES_PIZZA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#6250d6"];
  function pizza(lista) {
    const top = lista.slice(0, 5), resto = lista.slice(5).reduce((t, p) => t + p.creditos, 0);
    const fatias = top.map((p, i) => ({ p, v: p.creditos, cor: CORES_PIZZA[i] }));
    if (resto > 0) fatias.push({ p: { nome: `Outros (${lista.length - 5})`, tipo: "outros" }, v: resto, cor: "#c3cad3" });
    const total = fatias.reduce((t, f) => t + f.v, 0) || 1;
    const R = 70, C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = fatias.map((f) => {
      const len = (f.v / total) * C, gap = fatias.length > 1 ? Math.min(3, len / 3) : 0;
      const el = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${f.cor}" stroke-width="30" stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)"><title>${esc(f.p.nome)}: ${num(f.v)} créditos</title></circle>`;
      acc += len; return el;
    }).join("");
    return `<div class="ia-pizza"><svg viewBox="0 0 180 180" role="img" aria-label="Divisão do uso">${arcos}<text x="90" y="86" text-anchor="middle" class="ia-pz-num">${num(total)}</text><text x="90" y="104" text-anchor="middle" class="ia-pz-rot">créditos</text></svg>
      <ul class="ia-pz-leg">${fatias.map((f) => `<li><i style="background:${f.cor}"></i>${f.p.tipo === "outros" ? "" : avatar(f.p)}<div><b>${esc(f.p.nome)}</b>${f.p.chamadas ? `<small>${num(f.p.chamadas)} usos</small>` : ""}</div><strong>${num(f.v)}<small>${Math.round((f.v / total) * 100)}%</small></strong></li>`).join("")}</ul></div>`;
  }
  function pintarPessoas() {
    const todos = S.dados.por_pessoa;
    const eq = todos.filter((p) => p.tipo !== "decorador"), dec = todos.filter((p) => p.tipo === "decorador");
    $("iaPEquipe").innerHTML = eq.length ? pizza(eq) : vazio("Ninguém da equipe usou IA neste mês.");
    $("iaPDecoradores").innerHTML = dec.length ? pizza(dec) : vazio("Nenhum decorador usou IA neste mês.");
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
    carregar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.UsoIA = { carregar };
})();
