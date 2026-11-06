/* Sublocações (nov/2026; criado como "Terceirizações" — os nomes no código e no banco continuam terceirizacao_*): empresas que alugam itens para a Chiavari e os itens de cada uma.
   - Empresa = fornecedor do Cadastro de Fornecedores marcado como terceirização (fornecedores.terceirizacao).
   - Item: cadastro parecido com o nosso (nome, descrição, categoria, material, cor, medidas, código, foto) mais a
     quantidade que a empresa tem, o custo que pagamos e o valor cobrado do cliente.
   Banco: terceirizacao_itens (RLS), terceirizacao_empresas / terceirizacao_empresa_marcar (migration 20261105000400).
   No pedido comercial, o botão "Sublocação" busca estes itens (catalogo-projetos.mjs). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (v) => { const t = String(v ?? "").trim(); if (!t) return 0; return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };
  const medidas = (i) => [i.largura, i.altura, i.profundidade].some((x) => Number(x) > 0)
    ? ["L", "A", "P"].map((l, k) => "(" + l + ") " + String(Number([i.largura, i.altura, i.profundidade][k]) || 0).replace(".", ",") + " m").join(" ") : "";
  const vg = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));
  const S = { sb: null, emp: null, empresas: [], itens: [], atual: null, busca: "", pode: false, salvar: null };

  // Foto (logo) da empresa; sem foto, as iniciais num círculo.
  function avatar(e, grande) {
    const ini = String(e.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    return '<span class="tz-avatar' + (grande ? " grande" : "") + '">' + esc(ini) + (e.foto_url ? '<img src="' + esc(e.foto_url) + '" alt="" onerror="this.remove()">' : "") + "</span>";
  }
  // Escolhe e sobe a foto do fornecedor (bucket itens, pasta da empresa). Devolve true se gravou.
  function pedirFoto(fornecedorId, titulo, obrigatoria) {
    return new Promise((resolve) => {
      let arquivo = null;
      const emp = S.empresas.find((e) => e.id === fornecedorId) || {};
      dialogo(titulo,
        '<p class="tz-ajuda">' + (obrigatoria ? "Empresa de locação de móveis precisa de foto (o logo da empresa)." : "Foto ou logo da empresa.") + '</p>' +
        '<div class="tz-foto-campo"><span id="tzFotoEmpPrev">' + avatar(emp, true) + '</span><label class="btn secondary">Escolher foto<input type="file" accept="image/*" id="tzFotoEmp" hidden></label></div>',
        [{ rotulo: obrigatoria ? "Agora não" : "Cancelar", classe: "secondary", acao: () => { fechar(); resolve(false); } },
         { rotulo: "Salvar foto", classe: "primary", acao: async () => {
           if (!arquivo) { $("tzErro").textContent = "Escolha uma foto."; return; }
           try {
             const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
             const path = S.emp + "/fornecedores/" + fornecedorId + "-" + Date.now() + "." + ext;
             const up = await S.sb.storage.from("itens").upload(path, arquivo, { upsert: true, contentType: arquivo.type });
             if (up.error) throw up.error;
             const url = S.sb.storage.from("itens").getPublicUrl(path).data.publicUrl;
             await rpc("terceirizacao_empresa_foto", { p_empresa: S.emp, p_fornecedor: fornecedorId, p_url: url, p_path: path });
             if (emp.foto_path && emp.foto_path !== path) S.sb.storage.from("itens").remove([emp.foto_path]).catch(() => {});
             fechar(); resolve(true);
           } catch (err) { $("tzErro").textContent = err.message || String(err); }
         } }],
        (corpo) => corpo.querySelector("#tzFotoEmp").addEventListener("change", (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) { $("tzErro").textContent = "Escolha uma imagem de até 15 MB."; return; }
          arquivo = f; $("tzErro").textContent = "";
          corpo.querySelector("#tzFotoEmpPrev").innerHTML = '<span class="tz-avatar grande"><img src="' + URL.createObjectURL(f) + '" alt=""></span>';
        }));
    });
  }

  function avisar(msg, tipo = "aviso") { window.alerta ? window.alerta(msg, "Sublocações", tipo) : alert(msg); }
  async function rpc(nome, args) { const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message); return data; }

  async function carregar() {
    S.empresas = (await rpc("terceirizacao_empresas", { p_empresa: S.emp })) || [];
    const { data, error } = await S.sb.from("terceirizacao_itens").select("*").eq("empresa_id", S.emp).order("produto");
    if (error) throw new Error(error.message);
    S.itens = data || [];
    const marcadas = S.empresas.filter((e) => e.terceirizacao);
    if (!S.atual) S.atual = new URLSearchParams(location.search).get("empresa");
    if (!S.atual || !marcadas.some((e) => e.id === S.atual)) S.atual = marcadas[0]?.id || null;
    pintar();
  }

  function pintar() {
    const marcadas = S.empresas.filter((e) => e.terceirizacao);
    $("tzListaEmpresas").innerHTML = marcadas.length
      ? '<ul class="tz-lista">' + marcadas.map((e) => '<li><button type="button" class="tz-empresa' + (e.id === S.atual ? " is-ativa" : "") + '" data-empresa="' + esc(e.id) + '">' + avatar(e) + '<span><strong>' + esc(e.nome) + '</strong><small>' + e.itens + (e.itens === 1 ? " item" : " itens") + "</small></span></button></li>").join("") + "</ul>"
      : '<p class="tz-vazio">Nenhuma empresa ainda. Use "+ Empresa" para escolher um fornecedor do cadastro.</p>';
    const emp = marcadas.find((e) => e.id === S.atual);
    $("tzEmpresaNome").textContent = emp ? emp.nome : "Itens";
    const fotoTopo = $("tzEmpresaFoto");
    if (fotoTopo) { fotoTopo.hidden = !emp; fotoTopo.innerHTML = emp ? avatar(emp, true) + (S.pode ? '<button type="button" class="tz-link" data-trocar-foto="' + esc(emp.id) + '">' + (emp.foto_url ? "Trocar foto" : "Adicionar foto") + "</button>" : "") : ""; }
    $("tzEmpresaSub").innerHTML = emp ? (emp.razao && emp.razao !== emp.nome ? esc(emp.razao) + " · " : "") + (S.pode ? '<button type="button" class="tz-link" data-remover-empresa="' + esc(emp.id) + '">Tirar das sublocações</button>' : "") : "";
    $("tzNovoItem").disabled = !emp || !S.pode;
    const b = S.busca.trim().toLowerCase();
    const lista = emp ? S.itens.filter((i) => i.fornecedor_id === emp.id && (!b || [i.produto, i.descricao, i.categoria, i.codigo, i.material, i.cor].join(" ").toLowerCase().includes(b))) : [];
    $("tzListaItens").innerHTML = !emp ? '<p class="tz-vazio">Escolha uma empresa ao lado.</p>'
      : !lista.length ? '<p class="tz-vazio">' + (b ? "Nenhum item com essa pesquisa." : 'Nenhum item cadastrado para esta empresa. Use "+ Item".') + "</p>"
      : '<table class="tz-tabela"><thead><tr><th>Foto</th><th>Item</th><th>Código</th><th class="num">Quantidade</th><th class="num">Custo</th><th class="num">Valor ao cliente</th><th class="num">Margem</th><th>Situação</th></tr></thead><tbody>' +
        lista.map((i) => {
          const margem = Number(i.valor_locacao) > 0 ? Math.round(((Number(i.valor_locacao) - Number(i.custo)) / Number(i.valor_locacao)) * 100) : null;
          return '<tr class="tz-linha' + (i.ativo ? "" : " is-inativo") + '" data-item="' + esc(i.id) + '" tabindex="0" title="Editar"><td><span class="tz-foto">' + (i.foto_url ? '<img src="' + esc(i.foto_url) + '" alt="" loading="lazy">' : "") + "</span></td>" +
            "<td><strong>" + esc(i.produto) + "</strong>" + (i.descricao ? "<small>" + esc(i.descricao) + "</small>" : "") + "<small>" + esc([i.categoria, i.material, i.cor, medidas(i)].filter(Boolean).join(" · ")) + "</small></td>" +
            "<td>" + esc(i.codigo || "—") + '</td><td class="num">' + (Number(i.quantidade) || 0) + '</td><td class="num">' + brl(i.custo) + '</td><td class="num">' + brl(i.valor_locacao) + '</td><td class="num">' + (margem == null ? "—" : margem + "%") + "</td><td>" + (i.ativo ? '<span class="tz-sit ok">Ativo</span>' : '<span class="tz-sit">Inativo</span>') + "</td></tr>";
        }).join("") + "</tbody></table>";
  }

  function dialogo(titulo, corpo, botoes, montar) {
    $("tzDialogTitulo").textContent = titulo;
    $("tzDialogCorpo").innerHTML = corpo;
    $("tzErro").textContent = "";
    $("tzDialogRodape").innerHTML = botoes.map((b, i) => '<button type="button" class="btn ' + (b.classe || "") + '" data-bt="' + i + '">' + esc(b.rotulo) + "</button>").join("");
    S.botoes = botoes;
    if (!$("tzDialog").open) $("tzDialog").showModal();
    montar?.($("tzDialogCorpo"));
  }
  const fechar = () => { if ($("tzDialog").open) $("tzDialog").close(); };


  function escolherEmpresa() {
    const livres = S.empresas.filter((e) => !e.terceirizacao);
    dialogo("Adicionar empresa de sublocação",
      '<p class="tz-ajuda">As empresas vêm do Cadastro de Fornecedores. Escolha a que aluga itens para nós.</p>' +
      '<input type="search" id="tzBuscaEmp" placeholder="Pesquisar fornecedor" autocomplete="off" data-lpignore="true">' +
      '<div class="tz-escolha" id="tzEscolha">' + (livres.length ? "" : '<p class="tz-vazio">Todos os fornecedores já estão nas sublocações, ou não há fornecedores cadastrados.</p>') + "</div>" +
      '<p class="tz-ajuda"><a href="../../Estoque/CadastroFornecedores/fornecedores.html">Cadastrar um fornecedor novo</a></p>',
      [{ rotulo: "Cancelar", classe: "secondary", acao: fechar }],
      (corpo) => {
        const pintarLista = () => {
          const b = (corpo.querySelector("#tzBuscaEmp").value || "").toLowerCase();
          corpo.querySelector("#tzEscolha").innerHTML = livres.filter((e) => !b || (e.nome + " " + e.razao).toLowerCase().includes(b)).slice(0, 60)
            .map((e) => '<button type="button" class="tz-escolha-item" data-marcar="' + esc(e.id) + '"><strong>' + esc(e.nome) + "</strong>" + (e.razao && e.razao !== e.nome ? "<small>" + esc(e.razao) + "</small>" : "") + "</button>").join("") || '<p class="tz-vazio">Nenhum fornecedor encontrado.</p>';
        };
        if (livres.length) pintarLista();
        corpo.querySelector("#tzBuscaEmp").addEventListener("input", pintarLista);
        corpo.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-marcar]"); if (!b) return;
          try {
            await rpc("terceirizacao_empresa_marcar", { p_empresa: S.emp, p_fornecedor: b.dataset.marcar, p_sim: true }); S.atual = b.dataset.marcar; fechar(); await carregar();
            const nova = S.empresas.find((x) => x.id === b.dataset.marcar);
            if (nova && !nova.foto_url && nova.categoria === "locacao_moveis" && await pedirFoto(nova.id, "Foto de " + nova.nome, true)) await carregar();
          }
          catch (err) { $("tzErro").textContent = err.message; }
        });
      });
  }

  // O item abre na página própria (formato do Cadastro de Itens: foto, 3D, Dados Gerais e Galeria).
  function abrirItem(id) {
    location.href = "sublocacao-item.html?" + (id ? "id=" + encodeURIComponent(id) : "novo=1&empresa=" + encodeURIComponent(S.atual || ""));
  }

  function ligar() {
    $("tzNovaEmpresa").addEventListener("click", escolherEmpresa);
    $("tzNovoItem").addEventListener("click", () => abrirItem(null));
    $("tzBusca").addEventListener("input", (e) => { S.busca = e.target.value; pintar(); });
    $("tzListaEmpresas").addEventListener("click", (e) => { const b = e.target.closest("[data-empresa]"); if (b) { S.atual = b.dataset.empresa; pintar(); } });
    $("tzEmpresaFoto")?.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-trocar-foto]"); if (!b) return;
      const emp = S.empresas.find((x) => x.id === b.dataset.trocarFoto);
      if (await pedirFoto(b.dataset.trocarFoto, "Foto de " + (emp?.nome || "empresa"), false)) await carregar();
    });
    $("tzEmpresaSub").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-remover-empresa]"); if (!b) return;
      try { await rpc("terceirizacao_empresa_marcar", { p_empresa: S.emp, p_fornecedor: b.dataset.removerEmpresa, p_sim: false }); S.atual = null; await carregar(); }
      catch (err) { avisar(err.message, "erro"); }
    });
    $("tzListaItens").addEventListener("click", (e) => { const tr = e.target.closest("[data-item]"); if (tr) abrirItem(tr.dataset.item); });
    $("tzListaItens").addEventListener("keydown", (e) => { const tr = e.target.closest("[data-item]"); if (tr && e.key === "Enter") abrirItem(tr.dataset.item); });
    $("tzDialogRodape").addEventListener("click", (e) => { const b = e.target.closest("[data-bt]"); if (b) S.botoes[Number(b.dataset.bt)]?.acao(); });
    $("tzDialog").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fechar(); });
  }

  async function iniciar() {
    S.sb = window.supabaseClient;
    const ctx = await window.aguardarContexto?.();
    S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); } catch (_) {}
    S.pode = window.EasyLocPermissions?.hasPermission?.("comercial.pedidos.editar") !== false;
    if (!S.pode) { $("tzNovaEmpresa").hidden = true; }
    ligar();
    try { await carregar(); } catch (err) { $("tzListaEmpresas").innerHTML = '<p class="tz-vazio">Não foi possível carregar: ' + esc(err.message) + "</p>"; }
  }
  window.TerceirizacoesModulo = { recarregar: carregar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
