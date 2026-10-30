/* Uber no Painel Logístico (out/2026): no painel de cada etapa, ao lado de "Montagem da equipe" e "Distribuição de
   caminhões", entra o bloco "Uber". A logística pede quantos carros, o ponto de encontro e o destino (km pelo mapa ou
   digitado); o valor sai das faixas de km de Parâmetros. A vaga aparece no App do Motorista; quem aceitar aparece aqui
   com nome, telefone e carro. Check-in e check-out pelo QR do responsável (App do Montador).
   Arquivo próprio: não mexe na escala (painel-logistico.js); só acrescenta o bloco depois que o painel é desenhado. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const S = { sb: null, emp: null, vagas: [], faixas: [], pronto: false, editavel: true };
  const iconeCarro = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M8 22l6-12h36l6 12v10H8z" fill="currentColor"/><circle cx="18" cy="32" r="6" fill="currentColor" stroke="white" stroke-width="3"/><circle cx="46" cy="32" r="6" fill="currentColor" stroke="white" stroke-width="3"/></svg>';

  const iso = (d) => d.toISOString().slice(0, 10);
  async function carregar() {
    if (!S.sb || !S.emp) return;
    const hoje = new Date(), de = new Date(hoje.getTime() - 30 * 864e5), ate = new Date(hoje.getTime() + 400 * 864e5);
    const { data, error } = await S.sb.rpc("uber_painel", { p_empresa: S.emp, p_inicio: iso(de), p_fim: iso(ate) });
    if (error) { console.warn("Uber do painel:", error.message); return; }
    S.vagas = data?.vagas || []; S.faixas = data?.faixas || []; S.pronto = true;
    document.querySelectorAll(".pl-etapa.pl-painel[data-id]").forEach(pintarEm);
  }

  function valorTrecho(km) {
    const f = S.faixas.filter((x) => km >= Number(x.de || 0) && (x.ate == null || km <= Number(x.ate))).sort((a, b) => Number(b.de || 0) - Number(a.de || 0))[0];
    return f ? Number(f.valor) : 0;
  }

  function blocoHtml(etapaId, passada) {
    const vagas = S.vagas.filter((v) => v.etapa_id === etapaId);
    const total = vagas.reduce((s, v) => s + Number(v.quantidade || 0), 0), conf = vagas.reduce((s, v) => s + Number(v.confirmadas || 0), 0);
    const pode = S.editavel && !passada;
    const lista = vagas.map((v) => {
      const corridas = v.corridas || [];
      const slots = corridas.map((c) => {
        const sit = c.checkout_em ? "Concluída" : c.checkin_em ? "Em andamento" : "Confirmado";
        const fone = String(c.telefone || "").replace(/\D/g, "");
        return '<div class="pl-vaga pl-vaga-uber is-preenchida"><div class="pl-caminhao-icone">' + iconeCarro + "</div><strong>" + esc(c.motorista) + "</strong>" +
          '<small><a href="https://wa.me/55' + fone + '" target="_blank" rel="noopener">' + esc(c.telefone) + "</a></small><small>" + esc(c.carro || "") + '</small><span class="pl-uber-sit is-' + (c.checkout_em ? "ok" : c.checkin_em ? "and" : "conf") + '">' + sit + "</span>" +
          (pode && !c.checkin_em ? '<button type="button" class="pl-vaga-remover" data-uber-tirar="' + c.id + '" aria-label="Cancelar a corrida de ' + esc(c.motorista) + '">×</button>' : "") + "</div>";
      }).join("") + Array.from({ length: Math.max(0, v.quantidade - corridas.length) }, () =>
        '<div class="pl-vaga pl-vaga-uber is-vazia"><div class="pl-caminhao-icone">' + iconeCarro + "</div><strong>Aguardando motorista</strong><small>Disponível no App do Motorista</small></div>").join("");
      return '<div class="pl-uber-pedido"><div class="pl-uber-linha"><b>' + v.quantidade + " carro(s) · " + (v.ida_volta ? "Ida e volta" : "Só ida") + "</b><span>" + esc(v.ponto_encontro) + " → " + esc(v.destino) + " · " + String(v.km).replace(".", ",") + " km · " + (v.hora ? v.hora + " · " : "") + brl(v.valor) + " por carro</span>" +
        (pode ? '<span class="pl-uber-acoes"><button type="button" data-uber-editar="' + v.id + '">Editar</button><button type="button" data-uber-cancelar="' + v.id + '">Cancelar</button></span>' : "") + "</div>" +
        (v.obs ? '<small class="pl-dica">' + esc(v.obs) + "</small>" : "") + '<div class="pl-vagas">' + slots + "</div></div>";
    }).join("");
    return '<header class="pl-painel-cab"><h2>Uber</h2><b>' + conf + "/" + total + "</b></header>" +
      '<div class="pl-etapa-escala">' + (lista || '<p class="pl-dica">Nenhum Uber pedido para esta etapa.</p>') +
      (pode ? '<button type="button" class="btn pl-uber-novo" data-uber-novo="' + etapaId + '">+ Pedir Uber</button>' : "") + "</div>";
  }

  function pintarEm(art) {
    if (!S.pronto) return;
    let sec = art.querySelector(":scope > section.pl-uber");
    if (!sec) { sec = document.createElement("section"); sec.className = "pl-distribuicao pl-uber"; art.appendChild(sec); }
    const html = blocoHtml(art.dataset.id, art.classList.contains("is-passada"));
    if (sec.dataset.html !== html) { sec.innerHTML = html; sec.dataset.html = html; }
  }

  function infoEtapa(id) {
    const s = document.querySelector('.pl-servico[data-selecionar="' + CSS.escape(id) + '"]');
    return { local: s?.querySelector(".pl-local")?.textContent?.trim() || "", hora: s?.querySelector(".pl-hora")?.textContent?.trim() || "" };
  }

  // ---------------------------------------------------------------- janela "Pedir Uber"
  function dialogo() {
    let d = $("plUberDialog");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "plUberDialog"; d.className = "pl-uber-dialog";
    d.innerHTML = '<form method="dialog"><h2>Pedir Uber</h2><div class="pl-uber-grade">' +
      '<label>Carros<input name="quantidade" type="number" min="1" max="30" value="1" required></label>' +
      '<label>Trajeto<select name="ida_volta"><option value="false">Só ida</option><option value="true">Ida e volta</option></select></label>' +
      '<label>Horário do encontro<input name="hora" type="time"></label>' +
      '<label class="pl-uber-inteiro pl-uber-endereco">Ponto de encontro<input name="ponto_encontro" required autocomplete="off" placeholder="Digite o endereço e escolha na lista" aria-autocomplete="list" aria-controls="plUberSugestoes"><ul class="pl-uber-sugestoes" id="plUberSugestoes" role="listbox" hidden></ul></label>' +
      '<input type="hidden" name="ponto_lat"><input type="hidden" name="ponto_lng">' +
      '<label class="pl-uber-inteiro">Destino<input name="destino" required></label>' +
      '<label>Km (por trecho)<input name="km" type="number" min="0.1" step="0.1" required></label>' +
      '<div class="pl-uber-km"><button type="button" class="btn" data-uber-calc>Recalcular pelo mapa</button><small data-uber-km-status></small></div>' +
      '<label class="pl-uber-inteiro">Observação para o motorista<input name="obs" placeholder="opcional"></label></div>' +
      '<p class="pl-uber-valor" data-uber-valor></p><p class="pl-uber-erro" data-uber-erro role="alert"></p>' +
      '<div class="pl-uber-dialog-acoes"><button type="button" class="btn" value="cancel" data-uber-fechar>Cancelar</button><button type="submit" class="btn primary">Salvar e liberar no app</button></div></form>';
    document.body.appendChild(d);
    const f = d.querySelector("form");
    const recalcular = () => {
      const km = Number(f.km.value || 0), ivt = f.ida_volta.value === "true", v = valorTrecho(km) * (ivt ? 2 : 1);
      d.querySelector("[data-uber-valor]").textContent = !km ? "" : v ? "Valor total da corrida (por carro): " + brl(v) + (ivt ? " · ida e volta" : " · só ida") : "Nenhuma faixa de km cadastrada para " + km + " km (Parâmetros > Logística e operação > Valores do Uber por km).";
    };
    f.addEventListener("input", recalcular);
    d.querySelector("[data-uber-fechar]").onclick = () => d.close();
    // km automático (pelo Google Maps) assim que ponto e destino estão definidos; a pessoa pode alterar o número
    const calcularKm = async () => {
      const st = d.querySelector("[data-uber-km-status]");
      if (!f.ponto_encontro.value.trim() || !f.destino.value.trim()) { st.textContent = "Preencha ponto de encontro e destino."; return; }
      st.textContent = "Calculando a distância…";
      const origem = f.ponto_lat.value && f.ponto_lng.value ? f.ponto_lat.value + "," + f.ponto_lng.value : f.ponto_encontro.value.trim();
      try {
        const { data, error } = await S.sb.functions.invoke("calcular-distancia", { body: { origem, destino: f.destino.value.trim() } });
        if (error || !data?.km) throw new Error(data?.error || error?.message || "Não encontrei esse trajeto no mapa.");
        f.km.value = Math.round(Number(data.km) * 10) / 10; f.km.dataset.auto = f.km.value;
        st.textContent = "Calculado pelo Google Maps · pode alterar"; recalcular();
      } catch (e) { st.textContent = e.message + " Digite os km à mão."; }
    };
    d._calcularKm = calcularKm;
    d.querySelector("[data-uber-calc]").onclick = calcularKm;
    f.km.addEventListener("input", () => { const st = d.querySelector("[data-uber-km-status]"); if (f.km.dataset.auto && f.km.value !== f.km.dataset.auto) st.textContent = "Km alterado à mão"; });

    // Autocomplete do Google no ponto de encontro. As sugestões ficam dentro da própria janela (a lista nativa do Google
    // fica escondida atrás de janelas <dialog>): AutocompleteService + Geocoder pelo placeId para pegar as coordenadas.
    const lista = d.querySelector(".pl-uber-sugestoes");
    let timer = null, ativo = -1, sugestoes = [], servico = null, geocoder = null, sessao = null;
    const fecharLista = () => { lista.hidden = true; lista.innerHTML = ""; ativo = -1; };
    const google = async () => {
      if (servico) return true;
      if (!window.google?.maps?.places) {
        if (typeof window.carregarGooglePlaces !== "function") return false;
        try { await window.carregarGooglePlaces(); } catch (_) { return false; }
      }
      servico = new window.google.maps.places.AutocompleteService(); geocoder = new window.google.maps.Geocoder();
      return true;
    };
    const mostrarSugestoes = (itens) => {
      sugestoes = itens || []; ativo = -1;
      lista.innerHTML = sugestoes.map((p, i) => '<li role="option" data-i="' + i + '"><b>' + esc(p.structured_formatting?.main_text || p.description) + "</b><small>" + esc(p.structured_formatting?.secondary_text || "") + "</small></li>").join("");
      lista.hidden = !sugestoes.length;
    };
    const escolher = (p) => {
      f.ponto_encontro.value = p.description; fecharLista(); f.ponto_lat.value = ""; f.ponto_lng.value = "";
      geocoder.geocode({ placeId: p.place_id }, (r, st) => {
        if (st === "OK" && r[0]) { const l = r[0].geometry.location; f.ponto_lat.value = l.lat(); f.ponto_lng.value = l.lng(); }
        sessao = null; calcularKm();
      });
    };
    f.ponto_encontro.addEventListener("input", () => {
      f.ponto_lat.value = ""; f.ponto_lng.value = "";
      clearTimeout(timer);
      const texto = f.ponto_encontro.value.trim();
      if (texto.length < 3) return fecharLista();
      timer = setTimeout(async () => {
        if (!(await google())) return;
        sessao = sessao || new window.google.maps.places.AutocompleteSessionToken();
        servico.getPlacePredictions({ input: texto, componentRestrictions: { country: "br" }, sessionToken: sessao }, (r) => { if (f.ponto_encontro.value.trim() === texto) mostrarSugestoes(r); });
      }, 250);
    });
    f.ponto_encontro.addEventListener("keydown", (e) => {
      if (lista.hidden) return;
      const itens = lista.querySelectorAll("li");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); ativo = (ativo + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length; itens.forEach((li, i) => li.classList.toggle("ativo", i === ativo)); }
      else if (e.key === "Enter" && ativo >= 0) { e.preventDefault(); escolher(sugestoes[ativo]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharLista(); }
    });
    lista.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); escolher(sugestoes[Number(li.dataset.i)]); } });
    f.ponto_encontro.addEventListener("blur", () => setTimeout(fecharLista, 150));
    // trocou o destino à mão: refaz o km
    f.destino.addEventListener("change", () => { if (f.ponto_encontro.value.trim()) calcularKm(); });
    google();
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const dados = Object.fromEntries(new FormData(f).entries());
      dados.etapa_id = d.dataset.etapa; if (d.dataset.vaga) dados.id = d.dataset.vaga;
      dados.ida_volta = dados.ida_volta === "true";
      d.querySelector("[data-uber-erro]").textContent = "";
      const { error } = await S.sb.rpc("uber_vaga_salvar", { p_empresa: S.emp, p_dados: dados });
      if (error) { d.querySelector("[data-uber-erro]").textContent = error.message; return; }
      d.close(); await carregar();
    });
    d._recalcular = recalcular;
    return d;
  }

  function abrirDialogo(etapaId, vaga) {
    const d = dialogo(), f = d.querySelector("form"), info = infoEtapa(etapaId);
    d.dataset.etapa = etapaId; d.dataset.vaga = vaga?.id || "";
    d.querySelector("h2").textContent = vaga ? "Editar Uber" : "Pedir Uber";
    f.quantidade.value = vaga?.quantidade || 1;
    f.ida_volta.value = String(!!vaga?.ida_volta);
    f.hora.value = vaga?.hora || (/^\d\d:\d\d$/.test(info.hora) ? info.hora : "");
    f.ponto_encontro.value = vaga?.ponto_encontro || "";
    f.ponto_lat.value = vaga?.ponto_lat ?? ""; f.ponto_lng.value = vaga?.ponto_lng ?? "";
    f.destino.value = vaga?.destino || info.local;
    f.km.value = vaga?.km || ""; delete f.km.dataset.auto;
    f.obs.value = vaga?.obs || "";
    d.querySelector("[data-uber-erro]").textContent = ""; d.querySelector("[data-uber-km-status]").textContent = "";
    d._recalcular(); d.showModal(); f.ponto_encontro.focus();
  }

  async function confirmar(msg, titulo) { return window.confirmarGlobal ? window.confirmarGlobal(msg, titulo) : confirm(msg); }

  document.addEventListener("click", async (e) => {
    const n = e.target.closest("[data-uber-novo]"); if (n) return abrirDialogo(n.dataset.uberNovo);
    const ed = e.target.closest("[data-uber-editar]"); if (ed) { const v = S.vagas.find((x) => x.id === ed.dataset.uberEditar); return abrirDialogo(v.etapa_id, v); }
    const c = e.target.closest("[data-uber-cancelar]");
    if (c && await confirmar("Cancelar este pedido de Uber? Os motoristas que aceitaram são avisados no app.", "Cancelar Uber")) {
      const { error } = await S.sb.rpc("uber_vaga_cancelar", { p_empresa: S.emp, p_vaga: c.dataset.uberCancelar });
      if (error) return window.alerta ? window.alerta(error.message, "Uber") : alert(error.message);
      return carregar();
    }
    const t = e.target.closest("[data-uber-tirar]");
    if (t && await confirmar("Cancelar a corrida deste motorista? A vaga volta a ficar disponível no app.", "Cancelar corrida")) {
      const { error } = await S.sb.rpc("uber_corrida_cancelar_logistica", { p_empresa: S.emp, p_corrida: t.dataset.uberTirar });
      if (error) return window.alerta ? window.alerta(error.message, "Uber") : alert(error.message);
      return carregar();
    }
  });

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); if (window.EasyLocPermissions?.hasPermission) S.editavel = !!window.EasyLocPermissions.hasPermission("logistica.planejamento.editar"); } catch (_) {}
    const dias = $("plDias");
    if (dias) new MutationObserver(() => document.querySelectorAll(".pl-etapa.pl-painel[data-id]").forEach(pintarEm)).observe(dias, { childList: true, subtree: true });
    await carregar();
    setInterval(() => { if (!document.hidden && !$("plUberDialog")?.open) carregar(); }, 30000);
  }
  window.PainelUber = { recarregar: carregar };
  iniciar();
})();
