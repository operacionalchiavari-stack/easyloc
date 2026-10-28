// Parâmetros > Catálogo (out/2026): o catálogo mostra o preço, o estoque e o disponível? Para quem?
// Grava em catalogo_parametros.config = { preco|estoque|disponivel: { equipe, decoradores: todos|escolhidos|nenhum,
// decoradores_ids: [...], visitantes } }. A regra vale no servidor (catalogo_carregar*, catalogo_estoque e a Helena).
(function(){
  "use strict";
  const RECURSOS = [
    { chave: "preco", titulo: "Preço", ajuda: "Valor de locação (e de reposição) das peças. Quem não pode ver encontra \"Sob consulta\", e a Helena não informa valores." },
    { chave: "estoque", titulo: "Quantidade em estoque", ajuda: "Quantas unidades da peça a empresa tem (selo \"Estoque\" nos cards)." },
    { chave: "disponivel", titulo: "Quantidade disponível", ajuda: "Quantas unidades estão livres na data do evento do projeto (sem projeto, hoje), descontando reservas e manutenção (selo \"Disponível\"). Quem não pode ver o número ainda é avisado pela Helena quando a peça está esgotada na data." }
  ];
  const PADRAO = { equipe: true, decoradores: "todos", decoradores_ids: [], visitantes: false };
  const form = document.getElementById("formCatalogoParametros");
  const status = document.getElementById("catalogoParametrosStatus");
  const botao = document.getElementById("btnSalvarCatalogo");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let empresaId = null, decoradores = [];

  function cartao(r, cfg){
    const c = Object.assign({}, PADRAO, cfg || {});
    const ids = new Set((c.decoradores_ids || []).map(String));
    return '<section class="pr-card pr-cat" data-recurso="' + r.chave + '"><h3>' + esc(r.titulo) + '</h3><p class="pr-ajuda">' + esc(r.ajuda) + '</p>' +
      '<div class="pr-cat-linha"><span class="pr-cat-rotulo">Mostrar para</span><div class="pr-opcoes">' +
      '<label class="pr-check"><input type="checkbox" data-campo="equipe"' + (c.equipe ? " checked" : "") + '><span>Equipe interna</span></label>' +
      '<label class="pr-check"><input type="checkbox" data-campo="visitantes"' + (c.visitantes ? " checked" : "") + '><span>Visitantes (sem login)</span></label></div></div>' +
      '<div class="pr-cat-linha"><span class="pr-cat-rotulo">Decoradores</span><div class="pr-opcoes" role="radiogroup" aria-label="' + esc(r.titulo) + ': decoradores">' +
      [["todos", "Todos"], ["escolhidos", "Só os escolhidos"], ["nenhum", "Nenhum"]].map(([v, t]) =>
        '<label class="pr-check"><input type="radio" name="dec-' + r.chave + '" value="' + v + '"' + (c.decoradores === v ? " checked" : "") + '><span>' + t + '</span></label>').join("") +
      '</div></div>' +
      '<div class="pr-cat-decoradores"' + (c.decoradores === "escolhidos" ? "" : " hidden") + '>' +
      (decoradores.length ? decoradores.map((d) => '<label class="pr-cat-dec"><input type="checkbox" data-decorador="' + esc(d.id) + '"' + (ids.has(String(d.id)) ? " checked" : "") + '><span>' + esc(d.nome || "Sem nome") + (d.ativo ? "" : ' <small>(acesso inativo)</small>') + '</span></label>').join("")
        : '<p class="pr-ajuda">Nenhum decorador com acesso ao catálogo ainda.</p>') +
      '</div></section>';
  }

  function ler(){
    const config = {};
    for(const r of RECURSOS){
      const sec = form.querySelector('[data-recurso="' + r.chave + '"]');
      const modo = sec.querySelector('input[type=radio]:checked')?.value || "todos";
      const ids = [...sec.querySelectorAll("[data-decorador]:checked")].map((i) => i.dataset.decorador);
      if(modo === "escolhidos" && !ids.length) throw [sec.querySelector("[data-decorador]") || sec, r.titulo + ": escolha pelo menos um decorador (ou marque Todos/Nenhum)."];
      config[r.chave] = { equipe: sec.querySelector('[data-campo="equipe"]').checked, visitantes: sec.querySelector('[data-campo="visitantes"]').checked, decoradores: modo, decoradores_ids: modo === "escolhidos" ? ids : [] };
    }
    return config;
  }

  async function carregar(){
    const ctx = await window.aguardarContexto?.();
    empresaId = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if(!empresaId){ status.textContent = "Empresa não identificada."; return; }
    const sb = window.supabaseClient;
    const [{ data: cfg, error }, { data: lista }] = await Promise.all([
      sb.from("catalogo_parametros").select("config").eq("empresa_id", empresaId).maybeSingle(),
      sb.rpc("catalogo_decoradores_lista", { p_empresa_id: empresaId })
    ]);
    if(error){ console.error(error); status.textContent = "Não foi possível carregar os parâmetros do catálogo."; }
    decoradores = lista || [];
    const config = cfg?.config || {};
    document.getElementById("catalogoRecursos").innerHTML = RECURSOS.map((r) => cartao(r, config[r.chave])).join("");
  }

  form.addEventListener("change", (e) => {
    if(e.target.type !== "radio") return;
    const sec = e.target.closest("[data-recurso]");
    sec.querySelector(".pr-cat-decoradores").hidden = e.target.value !== "escolhidos";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let config;
    try { config = ler(); }
    catch(erro){ if(Array.isArray(erro)){ erro[0]?.focus?.(); window.alerta?.(erro[1], "Parâmetros", "aviso"); return; } throw erro; }
    botao.disabled = true; status.textContent = "Salvando…";
    const { error } = await window.supabaseClient.from("catalogo_parametros")
      .upsert({ empresa_id: empresaId, config, updated_at: new Date().toISOString(), updated_by: window.__CONTEXT?.usuario_id || null }, { onConflict: "empresa_id" });
    botao.disabled = false;
    if(error){ console.error(error); status.textContent = ""; window.alerta?.("Não foi possível salvar: " + error.message, "Parâmetros", "erro"); return; }
    status.textContent = "Salvo. O catálogo já segue as novas regras (quem estiver com ele aberto vê ao recarregar).";
  });

  carregar();
})();
