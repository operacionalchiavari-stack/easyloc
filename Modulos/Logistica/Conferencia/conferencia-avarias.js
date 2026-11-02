/* Triagem da volta: registrar item danificado (nov/2026).
   Botão "Item danificado" no topo da conferência de retorno. Quantidade e descrição obrigatórias, foto opcional.
   Vira retorno de avaria na Gestão do acervo (RPC operacao_avaria_retorno), já no galpão; a mesma quantidade sai da "revisão".
   As fotos vão para o bucket privado evidencias-operacionais em <empresa>/<pedido>/avaria-<uuid>.jpg. */
(function () {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const avisar = (t, tipo) => (typeof window.alerta === "function" ? window.alerta(t, "Item danificado", tipo || "aviso") : alert(t));

  async function prepararFoto(file) {
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw Error("Escolha uma foto de até 20 MB");
    const img = await createImageBitmap(file), escala = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); img.close();
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!blob) throw Error("Não foi possível preparar a foto");
    return { blob, url: URL.createObjectURL(blob) };
  }

  function montar(ctx) {
    const { sb, empresa, pedido, antes } = ctx;
    if (!antes || document.getElementById("cfAvariaBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "cfAvariaBtn"; btn.className = "btn secondary cf-avaria-btn";
    btn.innerHTML = '⚠ Item danificado <span class="cf-avaria-n" hidden></span>';
    antes.before(btn);

    const dlg = document.createElement("dialog");
    dlg.className = "cf-avaria-dlg"; dlg.id = "cfAvariaDlg";
    document.body.append(dlg);
    let pecas = [], avarias = [], fotos = [];

    async function recarregar() {
      const { data, error } = await sb.rpc("operacao_avarias_pedido", { p_pedido: pedido.id });
      if (error) throw Error(error.message);
      avarias = data || [];
      const n = avarias.reduce((t, a) => t + Number(a.quantidade || 0), 0), sel = btn.querySelector(".cf-avaria-n");
      sel.hidden = !n; sel.textContent = n;
    }
    function fotoUrl(e) {
      if (e.url) return Promise.resolve(e.url);
      if (!e.path) return Promise.resolve("");
      return sb.storage.from(e.bucket || "evidencias-operacionais").createSignedUrl(e.path, 600).then((r) => r.data?.signedUrl || "");
    }
    async function listaHtml() {
      if (!avarias.length) return '<p class="cf-avaria-vazio">Nenhum item danificado registrado neste pedido.</p>';
      const linhas = await Promise.all(avarias.map(async (a) => {
        const urls = (await Promise.all((a.evidencias || []).map(fotoUrl))).filter(Boolean);
        const origem = a.origem === "triagem_retorno" ? "Triagem da volta" : "Coleta / App";
        return '<li><div><b>' + esc(a.quantidade) + "× " + esc(a.nome) + "</b><small>" + esc(origem) + (a.motivo ? " · " + esc(a.motivo) : "") + "</small>" +
          (urls.length ? '<span class="cf-avaria-fotos">' + urls.map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt=""></a>').join("") + "</span>" : "") +
          "</div>" + (a.pode_remover ? '<button type="button" class="btn secondary" data-remover="' + esc(String(a.chave).replace(/^retorno:/, "")) + '">Desfazer</button>' : "") + "</li>";
      }));
      return '<ul class="cf-avaria-lista">' + linhas.join("") + "</ul>";
    }
    function fotosHtml() {
      return fotos.map((f, i) => '<span><img src="' + esc(f.url) + '" alt=""><button type="button" data-tirar="' + i + '">remover</button></span>').join("") +
        (fotos.length < 6 ? '<label class="cf-avaria-add"><input type="file" accept="image/*" capture="environment" hidden>📷 Foto (opcional)</label>' : "");
    }
    async function abrir() {
      try {
        if (!pecas.length) {
          const { data, error } = await sb.rpc("operacao_conferencia_pecas", { p_pedido: pedido.id, p_grupo: true });
          if (error) throw Error(error.message);
          pecas = data || [];
        }
        await recarregar();
      } catch (e) { avisar(e.message, "erro"); return; }
      fotos = [];
      dlg.innerHTML = '<form method="dialog" class="cf-avaria-form"><header><h3>Item danificado</h3><button type="button" class="cf-avaria-x" aria-label="Fechar">×</button></header>' +
        '<p class="cf-avaria-ajuda">Registre o que chegou danificado. A peça vai para a Gestão do acervo e fica indisponível até ser tratada.</p>' +
        '<label>Item<select name="chave" required><option value="">Escolha o item</option>' + pecas.map((p) => '<option value="' + esc(p.chave) + '">' + esc(p.nome + (p.kit_nome ? " · " + p.kit_nome : "") + (p.pedido_numero && pecas.some((x) => x.pedido_numero !== p.pedido_numero) ? " · Pedido " + p.pedido_numero : "")) + "</option>").join("") + "</select></label>" +
        '<label>Quantidade danificada<input type="number" name="qtd" min="1" step="1" value="1" required></label>' +
        '<label>O que aconteceu?<textarea name="desc" required minlength="3" placeholder="Ex.: pé quebrado, tecido rasgado, mancha"></textarea></label>' +
        '<div class="cf-avaria-novas"></div>' +
        '<div class="cf-avaria-acoes"><button type="button" class="btn secondary cf-avaria-cancelar">Fechar</button><button type="submit" class="btn primary">Registrar</button></div>' +
        "<h4>Registrados neste pedido</h4><div class=\"cf-avaria-registrados\">Carregando…</div></form>";
      const form = dlg.querySelector("form"), novas = dlg.querySelector(".cf-avaria-novas");
      const pintarFotos = () => {
        novas.innerHTML = fotosHtml();
        novas.querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => { URL.revokeObjectURL(fotos[Number(b.dataset.tirar)].url); fotos.splice(Number(b.dataset.tirar), 1); pintarFotos(); }));
        const inp = novas.querySelector("input[type=file]");
        if (inp) inp.onchange = async () => { try { if (inp.files[0]) fotos.push(await prepararFoto(inp.files[0])); } catch (e) { avisar(e.message, "erro"); } pintarFotos(); };
      };
      const pintarLista = async () => {
        const host = dlg.querySelector(".cf-avaria-registrados");
        host.innerHTML = await listaHtml();
        host.querySelectorAll("[data-remover]").forEach((b) => (b.onclick = async () => {
          b.disabled = true;
          const { error } = await sb.rpc("operacao_avaria_retorno", { p_pedido: pedido.id, p_chave: b.dataset.remover, p_quantidade: 0, p_descricao: "", p_fotos: [] });
          if (error) { b.disabled = false; avisar(error.message, "erro"); return; }
          await recarregar(); await pintarLista();
        }));
      };
      pintarFotos();
      dlg.querySelector(".cf-avaria-x").onclick = dlg.querySelector(".cf-avaria-cancelar").onclick = () => dlg.close();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const chave = form.chave.value, qtd = Number(form.qtd.value), desc = form.desc.value.trim();
        if (!chave) return avisar("Escolha o item.");
        if (!Number.isInteger(qtd) || qtd < 1) return avisar("Informe a quantidade danificada.");
        if (desc.length < 3) return avisar("Descreva o dano.");
        const enviar = form.querySelector('[type="submit"]'); enviar.disabled = true; enviar.textContent = "Registrando…";
        try {
          const ja = avarias.find((a) => a.chave === "retorno:" + chave);
          const paths = [];
          for (const f of fotos) {
            const path = empresa + "/" + pedido.id + "/avaria-" + crypto.randomUUID() + ".jpg";
            const { error } = await sb.storage.from("evidencias-operacionais").upload(path, f.blob, { contentType: "image/jpeg", upsert: false });
            if (error) throw Error("Não foi possível enviar a foto: " + error.message);
            paths.push(path);
          }
          const antigas = (ja?.evidencias || []).map((e) => e.path).filter(Boolean);
          const { error } = await sb.rpc("operacao_avaria_retorno", { p_pedido: pedido.id, p_chave: chave, p_quantidade: qtd + Number(ja?.quantidade || 0), p_descricao: desc, p_fotos: [...antigas, ...paths].slice(0, 6) });
          if (error) throw Error(error.message);
          fotos.forEach((f) => URL.revokeObjectURL(f.url)); fotos = [];
          form.reset(); form.qtd.value = 1; pintarFotos();
          await recarregar(); await pintarLista();
          avisar("Item danificado registrado. Ele já aparece na Gestão do acervo.", "sucesso");
        } catch (e) { avisar(e.message, "erro"); }
        enviar.disabled = false; enviar.textContent = "Registrar";
      };
      dlg.showModal();
      pintarLista();
    }
    btn.onclick = abrir;
    recarregar().catch(() => {});
  }
  window.ConferenciaAvarias = { montar };
})();
