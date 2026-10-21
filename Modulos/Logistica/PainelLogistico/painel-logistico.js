/* Painel Logístico (out/2026): confere e ajusta a escala automática de cada etapa do cronograma
   (responsável, equipe e caminhão). O servidor (api/_gas/projetos/cronograma/Escala.js) monta a
   escala pelos parâmetros, impede a mesma pessoa/caminhão em horários que se cruzam e grava nas
   colunas da etapa — o cronograma só mostra o resultado. */
(function () {
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const TIPO = { triagem: "Triagem", carregamento: "Carregamento", descarregamento: "Descarregamento", montagem: "Montagem", desmontagem: "Desmontagem" };
  const EQUIPE = { triagem: "Triagem", carregamento: "Carregamento", montagem: "Montagem", free: "Free" };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let inicio = segundaOuHoje(new Date());
  let dados = null;
  let salvando = false;

  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function segundaOuHoje(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return iso(x); }
  function somar(isoData, n) { const d = new Date(isoData + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
  function br(isoData) { const p = isoData.split("-"); return p[2] + "/" + p[1]; }
  function diaSemana(isoData) { return DIAS[new Date(isoData + "T12:00:00").getDay()]; }

  function chamar(fn, ...args) {
    return new Promise((ok, falha) => {
      google.script.run.withSuccessHandler(ok).withFailureHandler(e => falha(e && e.message ? e : new Error(String(e))))[fn](...args);
    });
  }

  function mostrarErro(msg) { const el = $("plErro"); el.hidden = !msg; el.textContent = msg || ""; }

  async function carregar(preencher) {
    mostrarErro("");
    $("plPreencher").disabled = true;
    try {
      dados = await chamar("ESC_painel", inicio, 7, !!preencher);
      if (preencher) aviso(dados.preenchidas ? dados.preenchidas + (dados.preenchidas === 1 ? " etapa preenchida" : " etapas preenchidas") : "Nada vazio para preencher nesta semana");
      desenhar();
    } catch (e) {
      mostrarErro(e.message || "Não foi possível carregar o painel.");
      if (!dados) $("plDias").innerHTML = "";
    } finally { $("plPreencher").disabled = false; }
  }

  function aviso(msg) {
    let el = document.querySelector(".pl-toast");
    if (!el) { el = document.createElement("div"); el.className = "pl-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("is-on");
    clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove("is-on"), 2800);
  }

  function pessoaInfo(nome) {
    const k = chave(nome);
    return (dados.pessoas || []).find(p => chave(p.nome) === k) || null;
  }
  function chave(n) { return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(); }
  function caminhaoInfo(cod) { return (dados.caminhoes || []).find(c => chave(c.codigo) === chave(cod)) || null; }

  function desenhar() {
    $("plPeriodo").textContent = br(dados.inicio) + " a " + br(dados.fim);
    const conflitos = dados.etapas.filter(e => e.conflitos.length).length;
    const avisos = dados.etapas.filter(e => !e.conflitos.length && e.avisos.length).length;
    $("plResumo").innerHTML =
      `<span class="pl-chip">${dados.etapas.length} etapas</span>` +
      `<span class="pl-chip ${conflitos ? "is-erro" : "is-ok"}">${conflitos ? conflitos + " com conflito" : "Sem conflito"}</span>` +
      (avisos ? `<span class="pl-chip is-alerta">${avisos} com aviso</span>` : "");
    const so = $("plSoProblemas").checked;
    let html = "";
    for (let i = 0; i < 7; i++) {
      const dia = somar(dados.inicio, i);
      const doDia = dados.etapas.filter(e => e.data === dia).sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
      const mostrar = so ? doDia.filter(e => e.conflitos.length || e.avisos.length) : doDia;
      html += `<section class="pl-dia${dia === dados.hoje ? " is-hoje" : ""}">
        <header class="pl-dia-topo"><h2>${diaSemana(dia)} <span>${br(dia)}</span></h2>${livresDoDia(doDia)}</header>
        ${mostrar.length ? mostrar.map(cartao).join("") : `<div class="pl-vazio">${doDia.length ? "Nada com problema neste dia." : "Nenhuma etapa."}</div>`}
      </section>`;
    }
    $("plDias").innerHTML = html;
  }

  // Quem e quais caminhões não aparecem em nenhuma etapa do dia
  function livresDoDia(doDia) {
    if (!doDia.length) return "";
    const ocupadas = new Set(doDia.flatMap(e => [e.responsavel, ...e.equipe]).filter(Boolean).map(chave));
    const usados = new Set(doDia.flatMap(e => e.caminhoes).map(chave));
    const pessoas = dados.pessoas.filter(p => !p.free && !ocupadas.has(chave(p.nome))).map(p => p.nome.split(" ")[0]);
    const cams = dados.caminhoes.filter(c => c.codigo && !usados.has(chave(c.codigo))).map(c => c.codigo);
    return `<p class="pl-livres"><b>Sem etapa no dia:</b> ${pessoas.length ? esc(pessoas.join(", ")) : "ninguém"} · <b>Caminhões livres:</b> ${cams.length ? esc(cams.join(", ")) : "nenhum"}</p>`;
  }

  function cartao(e) {
    const editavel = !e.passada;
    const usaCaminhao = !!(dados.regras.etapas[e.tipo] && dados.regras.etapas[e.tipo].caminhao);
    const equipeTipo = dados.regras.etapas[e.tipo] ? dados.regras.etapas[e.tipo].equipe : "";
    const total = (e.responsavel ? 1 : 0) + e.equipe.length;
    const cap = e.caminhoes.reduce((t, c) => t + ((caminhaoInfo(c) || {}).capacidade || 0), 0);
    const status = e.conflitos.length ? "is-erro" : e.avisos.length ? "is-alerta" : "is-ok";
    const pessoaChip = (nome, papel) => {
      const p = pessoaInfo(nome);
      const tag = p ? (p.free ? "Free" : (p.lider && papel !== "resp" ? "Líder" : "")) : "Fora do cadastro";
      return `<span class="pl-pessoa${p ? "" : " is-fora"}">${esc(nome)}${tag ? `<small>${tag}</small>` : ""}${editavel ? `<button type="button" aria-label="Tirar ${esc(nome)}" data-acao="tirar" data-papel="${papel}" data-nome="${esc(nome)}">×</button>` : ""}</span>`;
    };
    return `<article class="pl-etapa ${status}${e.passada ? " is-passada" : ""}" data-id="${esc(e.id)}">
      <div class="pl-etapa-info">
        <div class="pl-etapa-linha1"><span class="pl-hora">${esc(e.hora || "--:--")}</span><span class="pl-tipo pl-tipo-${e.tipo || "outro"}">${esc(e.etapa)}</span></div>
        <strong class="pl-cliente">${esc(e.pedido)} · ${esc(e.cliente)}</strong>
        <span class="pl-local">${esc(e.local)}</span>
        <span class="pl-volume">${e.volumeEstimado ? "Volume não informado (usa " + e.m3 + " m³)" : e.m3 + " m³" + (e.pecas ? " · " + e.pecas + " peças" : "")} · sugeridas <b>${e.sugerido}</b> pessoas</span>
      </div>
      <div class="pl-etapa-escala">
        <div class="pl-campo"><span class="pl-rotulo">Responsável</span>
          <div class="pl-valores">${e.responsavel ? pessoaChip(e.responsavel, "resp") : `<em class="pl-falta">sem responsável</em>`}
          ${editavel ? seletor("resp", e, equipeTipo) : ""}</div></div>
        <div class="pl-campo"><span class="pl-rotulo">Equipe <b class="${total < e.sugerido ? "pl-falta" : ""}">${total}/${e.sugerido}</b></span>
          <div class="pl-valores">${e.equipe.map(n => pessoaChip(n, "equipe")).join("") || `<em class="pl-falta">ninguém</em>`}
          ${editavel ? seletor("equipe", e, equipeTipo) : ""}</div>
          ${e.freeConfirmados.length ? `<small class="pl-dica">Free com vaga confirmada: ${esc(e.freeConfirmados.join(", "))}</small>` : ""}</div>
        ${usaCaminhao || e.caminhoes.length ? `<div class="pl-campo"><span class="pl-rotulo">Caminhão ${cap ? `<b>${cap} m³</b>` : ""}</span>
          <div class="pl-valores">${e.caminhoes.map(c => { const i = caminhaoInfo(c); return `<span class="pl-pessoa pl-cam">${esc(c)}${i ? `<small>${esc(i.modelo)}${i.capacidade ? " · " + i.capacidade + " m³" : ""}</small>` : `<small>Fora do cadastro</small>`}${editavel ? `<button type="button" aria-label="Tirar caminhão ${esc(c)}" data-acao="tirar" data-papel="cam" data-nome="${esc(c)}">×</button>` : ""}</span>`; }).join("") || `<em class="pl-falta">sem caminhão</em>`}
          ${editavel ? seletor("cam", e) : ""}</div></div>` : ""}
      </div>
      <div class="pl-etapa-status">
        ${e.conflitos.map(c => `<p class="pl-msg is-erro">${esc(c)}</p>`).join("")}
        ${e.avisos.map(a => `<p class="pl-msg is-alerta">${esc(a)}</p>`).join("")}
        ${!e.conflitos.length && !e.avisos.length ? `<p class="pl-msg is-ok">Escala ok</p>` : ""}
        ${e.passada ? `<p class="pl-msg">Etapa já passou</p>` : ""}
      </div>
    </article>`;
  }

  // Lista de quem pode entrar: primeiro a equipe operacional da etapa, depois o resto e os free
  function seletor(papel, e, equipeTipo) {
    if (papel === "cam") {
      const usados = new Set(e.caminhoes.map(chave));
      const opcoes = dados.caminhoes.filter(c => c.codigo && !usados.has(chave(c.codigo)))
        .map(c => `<option value="${esc(c.codigo)}">${esc(c.codigo)} · ${esc(c.modelo)}${c.capacidade ? " · " + c.capacidade + " m³" : " · sem capacidade"}${c.empresa ? " · " + esc(c.empresa) : ""}</option>`);
      return `<select class="pl-add" data-papel="cam" aria-label="Adicionar caminhão"><option value="">+ caminhão</option>${opcoes.join("")}</select>`;
    }
    const ja = new Set([e.responsavel, ...e.equipe].filter(Boolean).map(chave));
    const lista = dados.pessoas.filter(p => !ja.has(chave(p.nome)) && (papel !== "resp" || p.lider));
    const grupos = {};
    lista.forEach(p => { const g = p.equipe === equipeTipo ? "1" : p.free ? "3" : "2"; (grupos[g] = grupos[g] || []).push(p); });
    const nomeGrupo = { "1": "Equipe " + (EQUIPE[equipeTipo] || ""), "2": "Outras equipes", "3": "Free aprovados" };
    const opts = Object.keys(grupos).sort().map(g => `<optgroup label="${esc(nomeGrupo[g])}">${grupos[g].map(p => `<option value="${esc(p.nome)}">${esc(p.nome)}${p.lider ? " (líder)" : ""}</option>`).join("")}</optgroup>`).join("");
    return `<select class="pl-add" data-papel="${papel}" aria-label="${papel === "resp" ? "Trocar responsável" : "Adicionar à equipe"}"><option value="">${papel === "resp" ? (e.responsavel ? "trocar" : "+ responsável") : "+ pessoa"}</option>${opts}</select>`;
  }

  async function salvar(e, novo, forcar) {
    if (salvando) return;
    salvando = true;
    document.querySelector(`.pl-etapa[data-id="${CSS.escape(e.id)}"]`)?.classList.add("is-salvando");
    try {
      const r = await chamar("ESC_salvarEtapa", e.id, novo, !!forcar);
      if (!r.ok) {
        salvando = false;
        const sim = await confirmarConflito(r.conflitos);
        if (sim) return salvar(e, novo, true);
        desenhar();
        return;
      }
      aviso(r.conflitos && r.conflitos.length ? "Salvo com conflito" : "Escala salva");
      salvando = false;
      await carregar(false);
    } catch (err) {
      mostrarErro(err.message || "Não foi possível salvar.");
      desenhar();
    } finally { salvando = false; }
  }

  function confirmarConflito(lista) {
    return new Promise(ok => {
      const d = $("plConflito");
      $("plConflitoLista").innerHTML = lista.map(c => `<li>${esc(c)}</li>`).join("");
      const fim = v => { d.close(); $("plConflitoSalvar").onclick = $("plConflitoVoltar").onclick = null; ok(v); };
      $("plConflitoSalvar").onclick = () => fim(true);
      $("plConflitoVoltar").onclick = () => fim(false);
      d.oncancel = () => fim(false);
      d.showModal();
    });
  }

  function etapaDo(el) {
    const card = el.closest(".pl-etapa");
    return card && dados.etapas.find(e => e.id === card.dataset.id);
  }

  $("plDias").addEventListener("change", ev => {
    const sel = ev.target.closest("select.pl-add");
    if (!sel || !sel.value) return;
    const e = etapaDo(sel);
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (sel.dataset.papel === "resp") {
      if (e.responsavel) novo.equipe = novo.equipe.filter(n => chave(n) !== chave(sel.value));
      novo.responsavel = sel.value;
      novo.equipe = novo.equipe.filter(n => chave(n) !== chave(sel.value));
    } else if (sel.dataset.papel === "equipe") novo.equipe.push(sel.value);
    else novo.caminhoes.push(sel.value);
    salvar(e, novo);
  });

  $("plDias").addEventListener("click", ev => {
    const b = ev.target.closest('button[data-acao="tirar"]');
    if (!b) return;
    const e = etapaDo(b);
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (b.dataset.papel === "resp") novo.responsavel = "";
    else if (b.dataset.papel === "equipe") novo.equipe = novo.equipe.filter(n => n !== b.dataset.nome);
    else novo.caminhoes = novo.caminhoes.filter(c => c !== b.dataset.nome);
    salvar(e, novo);
  });

  $("plAnterior").onclick = () => { inicio = somar(inicio, -7); carregar(false); };
  $("plProxima").onclick = () => { inicio = somar(inicio, 7); carregar(false); };
  $("plHoje").onclick = () => { inicio = segundaOuHoje(new Date()); carregar(false); };
  $("plAtualizar").onclick = () => carregar(false);
  $("plPreencher").onclick = () => carregar(true);
  $("plSoProblemas").onchange = () => dados && desenhar();

  carregar(false);
})();
