/* Etiquetas dos cadastros de Clientes e Locais (Estilo, Canal, Horário, Orçamento...), editadas em
   Parâmetros > Comercial (out/2026), tabela cadastro_etiquetas.
   EasyLocEtiquetas.aplicar("cliente"|"local", { filtros: { idDoSelect: "chave" } }) troca os grupos que vêm
   no HTML (.tag-group dentro do container dos grupos) pelos cadastrados e preenche os selects de filtro.
   Sem cadastro ou sem internet, ficam os do HTML. Valor salvo que não está mais na lista aparece mesmo assim
   (criarOpcao), para não sumir de quem já tinha. */
(function () {
  if (window.EasyLocEtiquetas) return;
  const CORES = ["azul", "verde", "amarelo", "laranja", "vermelho"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cache = {};

  async function ler(cadastro) {
    if (cache[cadastro]) return cache[cadastro];
    cache[cadastro] = (async () => {
      const ctx = await window.aguardarContexto?.();
      const empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
      if (!empresa || !window.supabaseClient) return null;
      const { data, error } = await window.supabaseClient.from("cadastro_etiquetas")
        .select("grupos").eq("empresa_id", empresa).eq("cadastro", cadastro).maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.grupos) && data.grupos.length ? data.grupos : null;
    })().catch((e) => { console.warn("Etiquetas do cadastro:", e?.message || e); delete cache[cadastro]; return null; });
    return cache[cadastro];
  }

  function htmlGrupo(g) {
    const cor = CORES.includes(g.cor) ? g.cor : "azul";
    return '<div class="tag-group ' + cor + (g.unica ? " single" : "") + '" data-group="' + esc(g.chave) + '" data-obrigatoria="' + (g.obrigatoria === false ? "false" : "true") + '">' +
      '<span class="tag-title">' + esc(g.titulo || g.chave) + "</span>" +
      '<div class="tags">' + (g.opcoes || []).map((o) => '<span class="tag">' + esc(o) + "</span>").join("") + "</div></div>";
  }

  function criarOpcao(group, valor) {
    if (!group || !valor) return null;
    const caixa = group.querySelector(".tags") || group;
    const el = document.createElement("span");
    el.className = "tag fora-da-lista";
    el.title = "Opção que não está mais em Parâmetros > Comercial";
    el.textContent = valor;
    caixa.appendChild(el);
    return el;
  }

  async function aplicar(cadastro, opcoes) {
    const grupos = await ler(cadastro);
    if (!grupos) return null;
    const primeiro = document.querySelector(".tag-group");
    const container = primeiro?.parentElement;
    if (container) {
      // guarda o que estava marcado (cadastro já aberto) e o modo somente leitura
      const marcados = {};
      container.querySelectorAll(".tag-group").forEach((g) => {
        marcados[g.dataset.group] = [...g.querySelectorAll(".tag.selected")].map((t) => t.textContent.trim());
      });
      const travado = primeiro.querySelector(".tag")?.style.pointerEvents === "none";
      container.querySelectorAll(".tag-group").forEach((g) => g.remove());
      container.insertAdjacentHTML("beforeend", grupos.map(htmlGrupo).join(""));
      container.querySelectorAll(".tag-group").forEach((g) => {
        (marcados[g.dataset.group] || []).forEach((v) => {
          const t = [...g.querySelectorAll(".tag")].find((x) => x.textContent.trim() === v) || criarOpcao(g, v);
          t.classList.add("selected");
        });
        if (travado) g.querySelectorAll(".tag").forEach((t) => { t.style.pointerEvents = "none"; t.style.opacity = 0.6; });
      });
    }
    Object.entries(opcoes?.filtros || {}).forEach(([id, chave]) => {
      const sel = document.getElementById(id);
      const g = grupos.find((x) => x.chave === chave);
      if (!sel || !g) return;
      const atual = sel.value, primeiraOpcao = sel.options[0]?.outerHTML || '<option value="">Todos</option>';
      sel.innerHTML = primeiraOpcao + (g.opcoes || []).map((o) => '<option value="' + esc(o) + '">' + esc(o) + "</option>").join("");
      sel.value = (g.opcoes || []).includes(atual) ? atual : "";
    });
    return grupos;
  }

  window.EasyLocEtiquetas = { aplicar, ler, criarOpcao, CORES, limparCache: (c) => { if (c) delete cache[c]; else Object.keys(cache).forEach((k) => delete cache[k]); } };
})();
