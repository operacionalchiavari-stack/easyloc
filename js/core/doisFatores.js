/* Verificação em duas etapas por WhatsApp (out/2026) — tela compartilhada.
   EasyLoc2FA.garantir({ supabase, forcar }) -> Promise<boolean>
   - pergunta à Edge Function seguranca-2fa se a empresa exige e se ESTA sessão já confirmou;
   - se precisar, mostra a tela do código (envia sozinho ao abrir), aceita código de recuperação e,
     no primeiro acerto, mostra os 8 códigos de recuperação UMA vez;
   - resolve true quando liberado; false se a pessoa sair (quem chama faz o signOut).
   `forcar: true` abre mesmo com a exigência desligada (botão "Testar agora" em Parâmetros > Segurança). */
(function () {
  const FN = "seguranca-2fa";
  const css = `
.e2f-fundo{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:16px;font-family:Inter,system-ui,sans-serif}
.e2f{width:min(420px,100%);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,.35);padding:28px 26px 22px;color:#1f2020;text-align:center}
.e2f-ico{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:#e7f7ee;color:#1f8a4c}
.e2f h2{margin:0 0 6px;font:600 20px Inter,system-ui,sans-serif;letter-spacing:0;text-transform:none}
.e2f p{margin:0 0 14px;font-size:14px;line-height:1.45;color:#4f4f4f}
.e2f-codigo{width:100%;box-sizing:border-box;font:600 30px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.45em;text-align:center;padding:14px 0 14px .45em;border:2px solid #dce1e6;border-radius:12px;outline:none}
.e2f-codigo:focus{border-color:#123f86}
.e2f-rec{font-size:20px;letter-spacing:.2em;text-transform:uppercase}
.e2f-erro{min-height:20px;margin:10px 0 0;font-size:13px;color:#b42318}
.e2f-ok{color:#1f7a44}
.e2f-btn{width:100%;margin-top:14px;min-height:48px;border:0;border-radius:12px;background:#123f86;color:#fff;font:600 15px Inter,system-ui,sans-serif;cursor:pointer}
.e2f-btn:disabled{opacity:.55;cursor:wait}
.e2f-links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}
.e2f-link{background:none;border:0;padding:4px 0;color:#123f86;font:500 13px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.e2f-link:disabled{color:#9aa4ae;cursor:default;text-decoration:none}
.e2f-lista{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 4px;font:600 15px ui-monospace,Menlo,Consolas,monospace}
.e2f-lista span{background:#f3f5f6;border-radius:8px;padding:8px 0}
.e2f-aviso{background:#fff8e6;border-left:4px solid #e0a82e;text-align:left;padding:10px 12px;border-radius:8px;font-size:13px;color:#5f4300;margin:10px 0 0}`;
  const icone = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

  async function chamar(sb, body) {
    const r = await sb.functions.invoke(FN, { body });
    if (r.error) {
      let det = {};
      try { det = await r.error.context.json(); } catch (_) { /* sem corpo */ }
      return { erro: det.error || "Não foi possível falar com o servidor. Confira a internet.", espera: det.espera };
    }
    return r.data || {};
  }

  function montar() {
    if (!document.getElementById("e2f-estilo")) {
      const st = document.createElement("style");
      st.id = "e2f-estilo"; st.textContent = css; document.head.appendChild(st);
    }
    const fundo = document.createElement("div");
    fundo.className = "e2f-fundo";
    fundo.innerHTML = `<div class="e2f" role="dialog" aria-modal="true" aria-labelledby="e2f-titulo"></div>`;
    document.body.appendChild(fundo);
    return { fundo, caixa: fundo.firstElementChild };
  }

  async function garantir({ supabase, forcar = false } = {}) {
    const sb = supabase || window.supabaseClient;
    const st = await chamar(sb, { action: "status" });
    if (st.erro) throw new Error(st.erro);
    if (st.verificado || (!st.obrigatorio && !forcar)) return true;

    const { fundo, caixa } = montar();
    return new Promise((resolve) => {
      let espera = 0, relogio = 0, modo = "whatsapp";
      const fechar = (ok) => { clearInterval(relogio); fundo.remove(); resolve(ok); };

      function semWhatsapp() {
        caixa.innerHTML = `<div class="e2f-ico">${icone}</div><h2 id="e2f-titulo">Verificação em duas etapas</h2>
          <p>Seu WhatsApp não está cadastrado. Peça ao RH ou ao administrador para cadastrar no Cadastro de Funcionários.</p>
          <div class="e2f-links"><button type="button" class="e2f-link" data-rec>Usar código de recuperação</button><button type="button" class="e2f-link" data-sair>Sair</button></div>`;
        caixa.querySelector("[data-sair]").onclick = () => fechar(false);
        caixa.querySelector("[data-rec]").onclick = () => { modo = "recuperacao"; tela(); };
      }

      function tela(msg = "", tipo = "erro") {
        const rec = modo === "recuperacao";
        caixa.innerHTML = `<div class="e2f-ico">${icone}</div><h2 id="e2f-titulo">Verificação em duas etapas</h2>
          <p>${rec ? "Digite um dos seus códigos de recuperação. Cada código funciona uma vez só."
            : `Enviamos um código de 6 números para o seu WhatsApp <b>${st.whatsapp || ""}</b>.`}</p>
          <form><input class="e2f-codigo${rec ? " e2f-rec" : ""}" ${rec ? 'maxlength="9" placeholder="XXXX-XXXX" autocapitalize="characters"'
            : 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"'} aria-label="${rec ? "Código de recuperação" : "Código do WhatsApp"}" required>
          <p class="e2f-erro ${tipo === "ok" ? "e2f-ok" : ""}" role="alert">${msg}</p>
          <button class="e2f-btn" type="submit">Confirmar</button></form>
          <div class="e2f-links">${rec ? '<button type="button" class="e2f-link" data-voltar>Receber pelo WhatsApp</button>'
            : `<button type="button" class="e2f-link" data-reenviar ${espera > 0 ? "disabled" : ""}>${espera > 0 ? `Reenviar em ${espera}s` : "Reenviar código"}</button><button type="button" class="e2f-link" data-rec>Perdi o celular</button>`}
          <button type="button" class="e2f-link" data-sair>Sair</button></div>`;
        const input = caixa.querySelector("input"), btn = caixa.querySelector(".e2f-btn"), erro = caixa.querySelector(".e2f-erro");
        setTimeout(() => input.focus(), 30);
        if (!rec) input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); if (input.value.length === 6) btn.click(); });
        caixa.querySelector("[data-sair]").onclick = () => fechar(false);
        caixa.querySelector("[data-rec]")?.addEventListener("click", () => { modo = "recuperacao"; tela(); });
        caixa.querySelector("[data-voltar]")?.addEventListener("click", () => { modo = "whatsapp"; tela(); });
        caixa.querySelector("[data-reenviar]")?.addEventListener("click", () => enviar());
        caixa.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          if (btn.disabled) return;
          btn.disabled = true; btn.textContent = "Confirmando…"; erro.textContent = "";
          const r = await chamar(sb, { action: rec ? "recuperar" : "verificar", codigo: input.value });
          if (r.erro) { btn.disabled = false; btn.textContent = "Confirmar"; erro.className = "e2f-erro"; erro.textContent = r.erro; input.select(); return; }
          if (rec && typeof r.recuperacao_restantes === "number" && r.recuperacao_restantes <= 2) {
            return mostrarAviso(`Restam ${r.recuperacao_restantes} código(s) de recuperação. Gere novos em Parâmetros > Segurança.`);
          }
          if (Array.isArray(r.recuperacao) && r.recuperacao.length) return mostrarCodigos(r.recuperacao);
          fechar(true);
        };
      }

      function mostrarAviso(texto) {
        caixa.innerHTML = `<div class="e2f-ico">${icone}</div><h2 id="e2f-titulo">Acesso confirmado</h2><p class="e2f-aviso">${texto}</p><button type="button" class="e2f-btn">Continuar</button>`;
        caixa.querySelector(".e2f-btn").onclick = () => fechar(true);
      }

      function mostrarCodigos(codigos) {
        caixa.innerHTML = `<div class="e2f-ico">${icone}</div><h2 id="e2f-titulo">Guarde seus códigos de recuperação</h2>
          <p>Se perder o celular, cada código abaixo libera uma entrada. <b>Eles aparecem só agora.</b> Anote ou guarde num lugar seguro.</p>
          <div class="e2f-lista">${codigos.map((c) => `<span>${c}</span>`).join("")}</div>
          <div class="e2f-links"><button type="button" class="e2f-link" data-copiar>Copiar códigos</button></div>
          <button type="button" class="e2f-btn">Já guardei os códigos</button>`;
        caixa.querySelector("[data-copiar]").onclick = async (ev) => {
          try { await navigator.clipboard.writeText(codigos.join("\n")); ev.target.textContent = "Copiados ✓"; } catch (_) { ev.target.textContent = "Copie manualmente"; }
        };
        caixa.querySelector(".e2f-btn").onclick = () => fechar(true);
      }

      function contar(seg) {
        espera = seg; clearInterval(relogio);
        relogio = setInterval(() => {
          espera -= 1;
          const b = caixa.querySelector("[data-reenviar]");
          if (b) { b.disabled = espera > 0; b.textContent = espera > 0 ? `Reenviar em ${espera}s` : "Reenviar código"; }
          if (espera <= 0) clearInterval(relogio);
        }, 1000);
      }

      async function enviar() {
        tela("Enviando código…", "ok");
        const r = await chamar(sb, { action: "enviar" });
        if (r.erro) { contar(r.espera || 0); return tela(r.erro); }
        contar(60);
        tela(`Código enviado. Ele vale por ${r.validade_min || 5} minutos.`, "ok");
      }

      if (!st.tem_whatsapp) return semWhatsapp();
      enviar();
    });
  }

  window.EasyLoc2FA = { garantir, chamar: (body, sb) => chamar(sb || window.supabaseClient, body) };
})();
