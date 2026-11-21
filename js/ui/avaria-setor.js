/* Escolha do setor de manutenção para uma peça danificada (16/11/2026).
   Usado na Triagem da volta (conferência) e na Separação. Mostra os 6 setores; quem estiver em dúvida
   clica em "Não sei, perguntar à IA" e conversa com a assistente (Edge Function avaria-setor), que indica o setor.
   EasyLocAvariaSetor.montar(host, {sb, empresa, item:()=>texto, descricao:()=>texto, fotos:()=>[urls]}) -> {valor(), limpar()}
   EasyLocAvariaSetor.escolher({sb, empresa, item, descricao, fotos, titulo}) -> Promise<setor|null> (janela). */
(function () {
  "use strict";
  const SETORES = ["Marcenaria", "Solda", "Acabamento e Pintura", "Costura", "Forração", "Limpeza de Estofados"];
  const DICAS = {
    "Marcenaria": "madeira quebrada, solta, trincada",
    "Solda": "estrutura de metal quebrada ou torta",
    "Acabamento e Pintura": "risco, lascado, pintura, verniz",
    "Costura": "tecido rasgado, descosturado, capa",
    "Forração": "estofado, espuma, trocar tecido",
    "Limpeza de Estofados": "sujeira ou mancha sem rasgo",
  };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function montar(host, cfg) {
    let setor = "", conversa = [], ocupado = false;
    host.classList.add("as-setor");
    host.innerHTML =
      '<div class="as-titulo">Para qual setor de manutenção a peça vai?</div>' +
      '<div class="as-grade" role="radiogroup" aria-label="Setor de manutenção">' +
      SETORES.map((s) => '<button type="button" role="radio" aria-checked="false" data-setor="' + esc(s) + '"><b>' + esc(s) + "</b><small>" + esc(DICAS[s]) + "</small></button>").join("") +
      "</div>" +
      '<button type="button" class="as-duvida" data-duvida>💬 Não sei, perguntar à IA</button>' +
      '<div class="as-chat" hidden><div class="as-msgs" aria-live="polite"></div>' +
      '<div class="as-campo"><input type="text" maxlength="600" placeholder="Conte onde está o dano e de que material é a peça"><button type="button" class="btn primary" data-enviar>Enviar</button></div></div>';
    const chat = host.querySelector(".as-chat"), msgs = host.querySelector(".as-msgs"), inp = chat.querySelector("input");
    const marcar = (s) => {
      setor = s || "";
      host.querySelectorAll("[data-setor]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.setor === setor)));
      host.dispatchEvent(new CustomEvent("setor", { detail: setor }));
    };
    host.querySelectorAll("[data-setor]").forEach((b) => (b.onclick = () => marcar(b.dataset.setor)));
    const pintar = () => {
      msgs.innerHTML = conversa.map((m) => '<div class="as-msg ' + (m.papel === "ia" ? "ia" : "eu") + '">' + esc(m.texto) +
        (m.setor ? '<button type="button" class="as-usar" data-usar="' + esc(m.setor) + '">Usar ' + esc(m.setor) + "</button>" : "") + "</div>").join("") +
        (ocupado ? '<div class="as-msg ia as-digitando">Pensando…</div>' : "");
      msgs.querySelectorAll("[data-usar]").forEach((b) => (b.onclick = () => marcar(b.dataset.usar)));
      msgs.scrollTop = msgs.scrollHeight;
    };
    async function perguntar(texto) {
      if (!texto || ocupado) return;
      conversa.push({ papel: "pessoa", texto });
      ocupado = true; pintar();
      try {
        const item = typeof cfg.item === "function" ? cfg.item() : cfg.item;
        const fotos = typeof cfg.fotos === "function" ? cfg.fotos() : cfg.fotos || [];
        const { data, error } = await cfg.sb.functions.invoke("avaria-setor", { body: { empresa_id: cfg.empresa, item, fotos, mensagens: conversa.map(({ papel, texto }) => ({ papel, texto })) } });
        let erro = data?.erro || (error && error.message);
        if (error && error.context && typeof error.context.json === "function") { try { erro = (await error.context.json()).erro || erro; } catch {} }
        if (erro) throw Error(erro);
        conversa.push({ papel: "ia", texto: data.resposta + (data.pronto && data.justificativa && !data.resposta.includes(data.justificativa) ? " " + data.justificativa : ""), setor: data.pronto ? data.setor : "" });
        if (data.pronto) marcar(data.setor);
      } catch (e) {
        conversa.push({ papel: "ia", texto: e.message || "Não consegui responder agora. Escolha o setor pela lista." });
      }
      ocupado = false; pintar();
    }
    host.querySelector("[data-duvida]").onclick = () => {
      chat.hidden = false;
      const desc = String((typeof cfg.descricao === "function" ? cfg.descricao() : cfg.descricao) || "").trim();
      if (!conversa.length && desc) perguntar("O dano: " + desc);
      else { pintar(); inp.focus(); }
    };
    const enviar = () => { const t = inp.value.trim(); inp.value = ""; perguntar(t); };
    chat.querySelector("[data-enviar]").onclick = enviar;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
    return { valor: () => setor, limpar: () => { conversa = []; chat.hidden = true; msgs.innerHTML = ""; marcar(""); } };
  }

  function escolher(cfg) {
    return new Promise((ok) => {
      const dlg = document.createElement("dialog");
      dlg.className = "as-dlg";
      dlg.innerHTML = '<form method="dialog"><header><h3>' + esc(cfg.titulo || "Mandar para a manutenção") + '</h3><button type="button" class="as-x" aria-label="Fechar">×</button></header>' +
        (cfg.item ? '<p class="as-item">' + esc(cfg.item) + (cfg.descricao ? " · " + esc(cfg.descricao) : "") + "</p>" : "") +
        '<div class="as-host"></div><div class="as-acoes"><button type="button" class="btn secondary" data-cancelar>' + esc(cfg.cancelar || "Agora não") + '</button><button type="submit" class="btn primary" disabled>Enviar para o setor</button></div></form>';
      document.body.append(dlg);
      const ctl = montar(dlg.querySelector(".as-host"), cfg), enviar = dlg.querySelector('[type="submit"]');
      dlg.querySelector(".as-host").addEventListener("setor", (e) => { enviar.disabled = !e.detail; enviar.textContent = e.detail ? "Enviar para " + e.detail : "Enviar para o setor"; });
      let resposta = null;
      const fechar = () => dlg.close();
      dlg.querySelector(".as-x").onclick = dlg.querySelector("[data-cancelar]").onclick = fechar;
      dlg.querySelector("form").onsubmit = (e) => { e.preventDefault(); resposta = ctl.valor() || null; fechar(); };
      dlg.addEventListener("close", () => { dlg.remove(); ok(resposta); });
      dlg.showModal();
    });
  }

  window.EasyLocAvariaSetor = { montar, escolher, SETORES };
})();
