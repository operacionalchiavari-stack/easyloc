// Recebimento de mercadorias do Almoxarifado (out/2026, modelo da Tecnoweld).
// Chega a mercadoria de um pedido de compra (feito por Compras) -> o almoxarifado recebe com ou sem o XML da nota,
// em 5 etapas: Identificar nota, Vincular produtos, Conferir, Divergências, Revisar e concluir.
// Concluir dá entrada no estoque (planilha do Almoxarifado), atualiza o pedido em Compras e manda o avariado
// para Compras decidir ("Divergência no recebimento"). Valores e pagamento (Contas a Pagar) são de Compras; o
// Almoxarifado só mexe neles quando Gestão > Parâmetros > Almoxarifado permite.
// Tudo passa pelas funções almox_receb_* do banco. Usa da página: almoxBanco, empresaAlmox, escAlmox,
// formatarNumero, formatarMoedaBR, numeroAlmox, produtosDashboard.
(function(){
  "use strict";
  const ETAPAS = ["Identificar nota", "Vincular produtos", "Conferir mercadorias", "Divergências", "Revisar e concluir"];
  const FORMAS = { boleto: "Boleto", pix: "PIX", transferencia: "Transferência", cartao: "Cartão", dinheiro: "Dinheiro" };
  const R = { pedidos: [], lista: [], rec: null, etapa: 1, previa: null, fin: null, salvando: false };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => escAlmox(v);
  const num = (v) => numeroAlmox(v);
  const qtd = (v) => formatarNumero(Number(v || 0));
  const dinheiro = (v) => formatarMoedaBR(Number(v || 0));
  const pc = (n) => "PC-" + String(n || 0).padStart(6, "0");
  const rnum = (n) => "R-" + String(n || 0).padStart(5, "0");
  const dataBR = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "-";
  const hoje = () => new Date().toISOString().slice(0, 10);
  const somarDias = (iso, dias) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
  const somenteLeitura = () => R.rec && R.rec.status === "concluido";

  async function rpc(nome, args){
    const c = await almoxBanco();
    const empresa = empresaAlmox();
    if(!c || !empresa) throw new Error("Sem conexão com o banco.");
    const { data, error } = await c.rpc(nome, { p_empresa: empresa, ...args });
    if(error) throw new Error(error.message || "Não foi possível concluir.");
    return data;
  }
  function aviso(msg, tipo){
    const el = $("recebAviso");
    if(!el){ alert(msg); return; }
    el.textContent = msg;
    el.className = "receb-aviso" + (tipo === "ok" ? " is-ok" : "");
    el.hidden = false;
    clearTimeout(aviso._t);
    aviso._t = setTimeout(() => { el.hidden = true; }, tipo === "ok" ? 4000 : 9000);
  }

  // ------------------------------------------------------------------ lista
  async function carregar(){
    try{
      const [pedidos, lista] = await Promise.all([rpc("almox_receb_pedidos", {}), rpc("almox_receb_listar", {})]);
      R.pedidos = Array.isArray(pedidos) ? pedidos : [];
      R.lista = Array.isArray(lista) ? lista : [];
    }catch(e){ console.warn("Recebimento não carregou:", e); }
    const badge = $("badgeRecebimento");
    if(badge){ const n = R.pedidos.length; badge.textContent = n ? String(n) : ""; badge.title = n === 1 ? "1 pedido a receber" : n + " pedidos a receber"; }
    renderLista();
  }
  function renderLista(){
    const tb = $("tbodyRecebPedidos");
    if(tb){
      tb.innerHTML = R.pedidos.length ? R.pedidos.map((p) => {
        const itens = (p.itens || []).filter((i) => num(i.saldo) > 0);
        const resumo = itens.slice(0, 3).map((i) => `${esc(i.nome || i.material_nome || "Item")} (${qtd(i.saldo)} ${esc(i.unidade || "")})`).join(", ") + (itens.length > 3 ? ` +${itens.length - 3}` : "");
        const locacao = itens.length > 0 && itens.every(i => i.destino === 'locacao');
        const acoes = locacao
          ? `<button type="button" class="btn btn-sm" data-receb-locacao="${esc(p.id)}">Conferir itens de locação</button>`
          : p.rascunho
          ? `<button type="button" class="btn btn-sm" data-receb-abrir="${esc(p.rascunho.id)}">Continuar ${rnum(p.rascunho.numero)}</button>`
          : `<button type="button" class="btn btn-sm" data-receb-xml="${esc(p.id)}">Receber com XML</button><button type="button" class="btn btn-outline btn-sm" data-receb-manual="${esc(p.id)}">Sem XML</button>`;
        return `<tr><td><strong>${pc(p.numero)}</strong>${p.status === "parcialmente_recebido" ? '<small class="compras-origem">Recebido em parte</small>' : ""}</td>
          <td>${esc(p.fornecedor || "-")}</td><td>${dataBR(p.prazo)}</td><td class="receb-resumo">${resumo || "-"}${locacao ? '<small>Entrada no estoque de locação</small>' : ''}</td>
          <td class="col-qtd">${p.valor_total != null ? dinheiro(p.valor_total) : "-"}</td><td class="compras-acoes">${acoes}</td></tr>`;
      }).join("") : `<tr><td colspan="6" class="hist-vazio">Nenhum pedido de compra aguardando recebimento.</td></tr>`;
    }
    const tl = $("tbodyRecebLista");
    if(tl){
      const filtro = $("recebFiltro")?.value || "";
      const lista = R.lista.filter((r) => !filtro || r.status === filtro);
      tl.innerHTML = lista.length ? lista.map((r) => `<tr class="receb-linha" data-receb-abrir="${esc(r.id)}" tabindex="0">
          <td><strong>${rnum(r.numero)}</strong></td><td>${dataBR(r.concluido_em || r.created_at)}</td>
          <td>NF ${esc(r.numero_nf || "-")}${r.serie ? "/" + esc(r.serie) : ""}<small class="compras-origem">${r.origem === "xml" ? "Com XML" : "Sem XML"}</small></td>
          <td>${r.pedido_numero ? pc(r.pedido_numero) : "-"}</td><td>${esc(r.fornecedor_nome || "-")}</td>
          <td class="col-qtd">${r.itens_count}</td>
          <td>${r.status === "concluido" ? '<span class="badge badge-ok">Concluído</span>' : `<span class="badge badge-atencao">Em andamento · etapa ${r.etapa}</span>`}${num(r.divergencias) > 0 ? `<small class="compras-origem">${r.divergencias} com divergência</small>` : ""}</td>
          <td>${esc(r.concluido_por_nome || r.criado_por_nome || "")}</td></tr>`).join("")
        : `<tr><td colspan="8" class="hist-vazio">Nenhum recebimento.</td></tr>`;
    }
  }

  // ------------------------------------------------------------------ iniciar
  function escolherXml(pedidoId){
    let input = $("recebXmlInput");
    if(!input){
      input = document.createElement("input");
      input.type = "file"; input.accept = ".xml,application/xml,text/xml"; input.id = "recebXmlInput"; input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const f = input.files && input.files[0];
        input.value = "";
        if(!f) return;
        try{
          if(!window.AcervoNfeParser) throw new Error("Leitor de XML indisponível.");
          const nota = window.AcervoNfeParser.parse(await f.text());
          if(!nota.items.length) throw new Error("A nota não tem itens.");
          abrirPrevia(nota, input.dataset.pedido || "");
        }catch(e){ aviso(e.message || "Não foi possível ler o XML."); }
      });
    }
    input.dataset.pedido = pedidoId || "";
    input.click();
  }
  function soDigitos(v){ return String(v || "").replace(/\D/g, ""); }
  function abrirPrevia(nota, pedidoId){
    let escolhido = pedidoId;
    if(!escolhido){
      const mesmos = R.pedidos.filter((p) => !p.rascunho && soDigitos(p.fornecedor_cnpj) && soDigitos(p.fornecedor_cnpj) === soDigitos(nota.cnpj_fornecedor));
      if(mesmos.length === 1) escolhido = mesmos[0].id;
    }
    R.previa = { nota, pedidoId: escolhido };
    R.rec = null; R.etapa = 1;
    mostrarFluxo(true);
    renderFluxo();
  }
  function iniciarManual(pedidoId){
    const p = R.pedidos.find((x) => x.id === pedidoId);
    if(!p) return;
    let dlg = $("recebManualDialog");
    if(!dlg){ dlg = document.createElement("dialog"); dlg.id = "recebManualDialog"; dlg.className = "almox-reservas-dialog receb-dialog"; document.body.appendChild(dlg); }
    dlg.innerHTML = `<form class="receb-manual-form">
      <div class="almox-reservas-topo"><div><small>Receber sem XML · ${pc(p.numero)}</small><h3>${esc(p.fornecedor || "-")}</h3>
      <p>Os itens vêm do saldo do pedido. A conferência começa já na etapa 3.</p></div></div>
      <div class="receb-campos3">
        <label>Número da nota fiscal *<input name="numero" required maxlength="20" inputmode="numeric" autocomplete="off"></label>
        <label>Série<input name="serie" maxlength="5" autocomplete="off"></label>
        <label>Emissão<input name="emissao" type="date" value="${hoje()}"></label>
      </div>
      <p class="almox-cancelar-erro" hidden></p>
      <div class="almox-cancelar-acoes"><button type="button" class="btn btn-outline" onclick="this.closest('dialog').close()">Voltar</button><button type="submit" class="btn">Iniciar recebimento</button></div>
    </form>`;
    const form = dlg.querySelector("form"), erro = dlg.querySelector(".almox-cancelar-erro");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      if(!String(fd.get("numero") || "").trim()){ erro.textContent = "Informe o número da nota."; erro.hidden = false; return; }
      form.querySelector("[type=submit]").disabled = true;
      try{
        const id = await rpc("almox_receb_criar", { p_dados: { origem: "manual", pedido_id: p.id, nota: { numero: String(fd.get("numero")).trim(), serie: fd.get("serie"), emissao: fd.get("emissao") } } });
        dlg.close();
        await abrir(id);
        carregar();
      }catch(e){ erro.textContent = e.message; erro.hidden = false; form.querySelector("[type=submit]").disabled = false; }
    });
    dlg.showModal();
    dlg.querySelector("[name=numero]").focus();
  }
  async function criarComXml(){
    const pv = R.previa;
    const pedidoId = $("recebPreviaPedido")?.value || pv.pedidoId;
    if(!pedidoId){ aviso("Escolha o pedido de compra desta nota."); return; }
    const n = pv.nota;
    const btn = $("recebPreviaIniciar");
    if(btn) btn.disabled = true;
    try{
      const id = await rpc("almox_receb_criar", { p_dados: { origem: "xml", pedido_id: pedidoId, nota: {
        chave: n.chave_nfe, numero: n.numero_nfe, serie: n.serie, emissao: n.data_emissao, fornecedor: n.fornecedor, cnpj: n.cnpj_fornecedor,
        valor_produtos: n.valor_produtos, valor_outros: Math.round((n.valor_total - n.valor_produtos) * 100) / 100, valor_total: n.valor_total,
        duplicatas: n.duplicatas || [] },
        itens: n.items.map((i) => ({ descricao: i.descricao_xml, codigo_fornecedor: i.codigo_fornecedor, gtin: /^\d{8,14}$/.test(i.gtin || "") ? i.gtin : null, unidade: i.unidade_xml, quantidade: i.quantidade_xml, valor_unitario: i.valor_unitario })) } });
      R.previa = null;
      await abrir(id);
      carregar();
    }catch(e){ aviso(e.message); if(btn) btn.disabled = false; }
  }

  // ------------------------------------------------------------------ fluxo
  function mostrarFluxo(sim){
    $("recebListaView").hidden = sim;
    $("recebFluxoView").hidden = !sim;
    if(sim) window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function abrir(id){
    try{
      R.rec = await rpc("almox_receb_obter", { p_id: id });
      R.previa = null;
      R.etapa = somenteLeitura() ? 5 : Math.min(Math.max(R.rec.etapa || 1, 1), 5);
      R.fin = null;
      mostrarFluxo(true);
      renderFluxo();
    }catch(e){ aviso(e.message); }
  }
  function voltarLista(){
    R.rec = null; R.previa = null;
    mostrarFluxo(false);
    carregar();
  }
  function itemDiverge(i){ return num(i.quantidade_recebida) !== num(i.quantidade_nf) || num(i.quantidade_avariada) > 0; }

  function renderFluxo(){
    const box = $("recebFluxoView");
    if(!box) return;
    const r = R.rec, pv = R.previa;
    const titulo = r ? `Recebimento ${rnum(r.numero)}` : "Nova nota (XML)";
    const sub = r ? `NF ${esc(r.numero_nf)}${r.serie ? "/" + esc(r.serie) : ""} · ${r.pedido ? pc(r.pedido.numero) : ""} · ${esc(r.fornecedor_nome || "")}`
      : `NF ${esc(pv.nota.numero_nfe)} · ${esc(pv.nota.fornecedor)}`;
    const max = r ? (somenteLeitura() ? 5 : Math.max(r.etapa, R.etapa)) : 1;
    const steps = ETAPAS.map((nome, k) => {
      const n = k + 1, ativo = n === R.etapa, feito = r && (somenteLeitura() || n < max || n < r.etapa);
      const pulada = r && r.origem === "manual" && n === 2;
      return `<button type="button" class="receb-step${ativo ? " is-ativo" : ""}${feito ? " is-feito" : ""}" data-receb-etapa="${n}" ${!r || n > max || pulada ? "disabled" : ""}><span>${feito && !ativo ? "✓" : n}</span>${nome}</button>`;
    }).join('<i class="receb-step-linha"></i>');
    box.innerHTML = `<div class="receb-topo">
        <button type="button" class="btn btn-outline btn-sm" data-receb-voltar>← Voltar</button>
        <div><h2>${titulo}${somenteLeitura() ? ' <span class="badge badge-ok">Concluído</span>' : ""}</h2><p>${sub}</p></div>
        ${r && !somenteLeitura() ? '<button type="button" class="btn btn-outline btn-sm receb-descartar" data-receb-descartar>Descartar</button>' : ""}
      </div>
      <nav class="receb-steps" aria-label="Etapas">${steps}</nav>
      <div class="receb-corpo">${corpoEtapa()}</div>
      <div class="receb-rodape">${rodape()}</div>`;
    ligarFluxo();
  }

  function rodape(){
    const r = R.rec;
    if(!r){
      return `<span></span><button type="button" class="btn" id="recebPreviaIniciar">Iniciar recebimento →</button>`;
    }
    if(somenteLeitura()) return `<span></span><button type="button" class="btn btn-outline" data-receb-voltar>Fechar</button>`;
    const anterior = R.etapa > (r.origem === "manual" ? 3 : 2) ? `<button type="button" class="btn btn-outline" data-receb-ir="${R.etapa - (R.etapa === 3 && r.origem === "manual" ? 2 : 1)}">← Etapa anterior</button>` : "<span></span>";
    if(R.etapa < 5) return `${anterior}<button type="button" class="btn" data-receb-ir="${R.etapa + 1}">Salvar e avançar →</button>`;
    return `${anterior}<button type="button" class="btn receb-concluir" data-receb-concluir>Concluir recebimento</button>`;
  }

  function corpoEtapa(){
    if(!R.rec) return etapaNota(R.previa.nota, true);
    switch(R.etapa){
      case 1: return etapaNota(R.rec, false);
      case 2: return etapaVincular();
      case 3: return etapaConferir();
      case 4: return etapaDivergencias();
      default: return etapaRevisar();
    }
  }

  function etapaNota(n, previa){
    const r = R.rec;
    const dados = previa
      ? { numero: n.numero_nfe, serie: n.serie, emissao: n.data_emissao, chave: n.chave_nfe, fornecedor: n.fornecedor, cnpj: n.cnpj_fornecedor, total: n.valor_total, dup: n.duplicatas || [], itens: n.items.map((i) => ({ d: i.descricao_xml, c: i.codigo_fornecedor, q: i.quantidade_xml, u: i.unidade_xml, v: i.valor_unitario })) }
      : { numero: r.numero_nf, serie: r.serie, emissao: r.emissao, chave: r.chave_nfe, fornecedor: r.fornecedor_nome, cnpj: r.fornecedor_cnpj, total: r.valor_total, dup: r.duplicatas || [], itens: (r.itens || []).map((i) => ({ d: i.descricao_nf, c: i.codigo_fornecedor, q: i.quantidade_nf, u: i.unidade_nf, v: i.valor_unitario_nf })) };
    const opcoesPedido = previa ? `<label class="receb-pedido-escolha">Pedido de compra desta nota *
        <select id="recebPreviaPedido"><option value="">Escolha…</option>${R.pedidos.filter((p) => !p.rascunho).map((p) => `<option value="${esc(p.id)}"${p.id === R.previa.pedidoId ? " selected" : ""}>${pc(p.numero)} · ${esc(p.fornecedor || "")}</option>`).join("")}</select></label>` : "";
    return `${opcoesPedido}<div class="receb-nota">
        <div><small>Nota fiscal</small><strong>${esc(dados.numero || "-")}${dados.serie ? " / série " + esc(dados.serie) : ""}</strong></div>
        <div><small>Emissão</small><strong>${dataBR(dados.emissao)}</strong></div>
        <div><small>Fornecedor</small><strong>${esc(dados.fornecedor || "-")}</strong>${dados.cnpj ? `<span>${esc(dados.cnpj)}</span>` : ""}</div>
        <div><small>Valor da nota</small><strong>${dados.total != null ? dinheiro(dados.total) : "-"}</strong></div>
        ${dados.chave ? `<div class="receb-nota-chave"><small>Chave de acesso</small><span>${esc(dados.chave)}</span></div>` : ""}
        ${dados.dup.length ? `<div class="receb-nota-chave"><small>Parcelas da nota</small><span>${dados.dup.map((d) => `${dataBR(d.vencimento)}: ${dinheiro(d.valor)}`).join(" · ")}</span></div>` : ""}
      </div>
      <div class="table-wrap"><table class="receb-tabela"><thead><tr><th>Item da nota</th><th>Cód. fornecedor</th><th class="col-qtd">Qtd.</th><th class="col-qtd">Valor un.</th></tr></thead>
      <tbody>${dados.itens.map((i) => `<tr><td>${esc(i.d)}</td><td>${esc(i.c || "-")}</td><td class="col-qtd">${qtd(i.q)} ${esc(i.u || "")}</td><td class="col-qtd">${dinheiro(i.v)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function opcoesPedidoItem(i){
    const itens = (R.rec.pedido && R.rec.pedido.itens) || [];
    return `<option value="">— nenhum —</option>` + itens.map((p) => `<option value="${esc(p.id)}"${p.id === i.pedido_item_id ? " selected" : ""}>${esc(p.nome || p.material_nome || "Item")} · saldo ${qtd(p.saldo)} ${esc(p.unidade || "")}</option>`).join("");
  }
  function rotuloMaterial(p){ return [p.Codigo, p.Produto].filter(Boolean).join(" · "); }
  function garantirListaMateriais(){
    let dl = $("recebMateriaisLista");
    if(!dl){ dl = document.createElement("datalist"); dl.id = "recebMateriaisLista"; document.body.appendChild(dl); }
    if(dl.dataset.n !== String((produtosDashboard || []).length)){
      dl.innerHTML = (produtosDashboard || []).filter((p) => String(p.Status || "").toLowerCase() !== "inativo").map((p) => `<option value="${esc(rotuloMaterial(p))}">`).join("");
      dl.dataset.n = String((produtosDashboard || []).length);
    }
  }
  function etapaVincular(){
    garantirListaMateriais();
    const itens = R.rec.itens || [];
    const faltam = itens.filter((i) => i.controla_estoque && !i.produto_id).length;
    return `<p class="receb-dica">Diga qual material do Almoxarifado é cada item da nota. O sistema lembra: na próxima nota deste fornecedor o vínculo já vem pronto. Use o <strong>fator</strong> quando a unidade da nota for diferente (ex.: nota em caixa com 12 → fator 12).</p>
      ${faltam ? `<p class="receb-alerta">${faltam} ${faltam === 1 ? "item ainda não vinculado" : "itens ainda não vinculados"}.</p>` : ""}
      <div class="table-wrap"><table class="receb-tabela"><thead><tr><th>Item da nota</th><th class="col-qtd">Qtd. nota</th><th>Material do Almoxarifado</th><th class="col-qtd">Fator</th><th>Item do pedido</th><th>Estoque</th></tr></thead>
      <tbody>${itens.map((i) => {
        const p = (produtosDashboard || []).find((x) => String(x.ID) === String(i.produto_id));
        const rot = p ? rotuloMaterial(p) : (i.produto_id ? [i.produto_codigo, i.produto_nome].filter(Boolean).join(" · ") : "");
        return `<tr data-item="${esc(i.id)}"><td>${esc(i.descricao_nf)}${i.codigo_fornecedor ? `<small class="compras-origem">Cód. ${esc(i.codigo_fornecedor)}</small>` : ""}</td>
          <td class="col-qtd">${qtd(i.quantidade_nf)} ${esc(i.unidade_nf || "")}</td>
          <td><input type="text" class="receb-input receb-material${i.controla_estoque && !i.produto_id ? " is-pendente" : ""}" list="recebMateriaisLista" value="${esc(rot)}" placeholder="Código ou nome do material" data-campo="material" ${i.controla_estoque ? "" : "disabled"}>${i.unidade_interna ? `<small class="compras-origem">Unidade no estoque: ${esc(i.unidade_interna)}</small>` : ""}</td>
          <td class="col-qtd"><input type="text" inputmode="decimal" class="receb-input receb-num" value="${esc(String(num(i.fator_conversao) || 1).replace(".", ","))}" data-campo="fator_conversao"></td>
          <td><select class="receb-input" data-campo="pedido_item_id">${opcoesPedidoItem(i)}</select></td>
          <td><label class="receb-check"><input type="checkbox" data-campo="controla_estoque" ${i.controla_estoque ? "checked" : ""}> Controla</label></td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function etapaConferir(){
    const itens = R.rec.itens || [];
    return `<p class="receb-dica">Conte o que chegou. <strong>Recebido</strong> é tudo que veio (inclusive o que veio com problema); <strong>Avariado</strong> é a parte com defeito — ela não entra no estoque e vai para Compras decidir.</p>
      <div class="receb-acoes-linha"><button type="button" class="btn btn-outline btn-sm" data-receb-tudo>Tudo conferido igual à nota</button></div>
      <div class="table-wrap"><table class="receb-tabela"><thead><tr><th>Material</th><th class="col-qtd">Na nota</th><th class="col-qtd">Recebido</th><th class="col-qtd">Avariado</th><th class="col-qtd">Entra no estoque</th></tr></thead>
      <tbody>${itens.map((i) => `<tr data-item="${esc(i.id)}"><td>${esc(i.produto_nome || i.descricao_nf)}${i.produto_nome && i.produto_nome !== i.descricao_nf ? `<small class="compras-origem">Nota: ${esc(i.descricao_nf)}</small>` : ""}</td>
          <td class="col-qtd">${qtd(i.quantidade_nf)} ${esc(i.unidade_nf || "")}</td>
          <td class="col-qtd"><input type="text" inputmode="decimal" class="receb-input receb-num" value="${num(i.quantidade_recebida) ? esc(String(num(i.quantidade_recebida)).replace(".", ",")) : ""}" placeholder="0" data-campo="quantidade_recebida"></td>
          <td class="col-qtd"><input type="text" inputmode="decimal" class="receb-input receb-num" value="${num(i.quantidade_avariada) ? esc(String(num(i.quantidade_avariada)).replace(".", ",")) : ""}" placeholder="0" data-campo="quantidade_avariada"></td>
          <td class="col-qtd" data-entra>${entraTexto(i)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function entraTexto(i){
    if(!i.controla_estoque) return '<span class="almox-cel-vazia">não controla</span>';
    const e = Math.max(0, (num(i.quantidade_recebida) - num(i.quantidade_avariada)) * (num(i.fator_conversao) || 1));
    return `${qtd(e)} ${esc(i.unidade_interna || i.unidade_nf || "")}`;
  }
  function etapaDivergencias(){
    const itens = (R.rec.itens || []).filter(itemDiverge);
    if(!itens.length) return `<div class="receb-ok">Nenhuma divergência: tudo chegou igual à nota. Pode avançar.</div>`;
    return `<p class="receb-dica">Explique cada diferença. Item com avaria precisa de pelo menos uma foto e vira uma <strong>Divergência no recebimento</strong> para Compras decidir (aceitar, abater, devolver).</p>
      ${itens.map((i) => {
        const fotos = Array.isArray(i.divergencia_fotos) ? i.divergencia_fotos : [];
        const falta = num(i.quantidade_nf) - num(i.quantidade_recebida);
        const resumo = [falta > 0 ? `faltaram ${qtd(falta)}` : falta < 0 ? `vieram ${qtd(-falta)} a mais` : "", num(i.quantidade_avariada) > 0 ? `${qtd(i.quantidade_avariada)} com avaria` : ""].filter(Boolean).join(" · ");
        return `<div class="receb-div" data-item="${esc(i.id)}">
          <div class="receb-div-topo"><strong>${esc(i.produto_nome || i.descricao_nf)}</strong><span class="badge badge-atencao">${resumo}</span></div>
          <label>O que aconteceu *<textarea class="receb-input" rows="2" maxlength="1000" data-campo="divergencia_descricao" placeholder="Ex.: 2 latas amassadas, caixa molhada…">${esc(i.divergencia_descricao || "")}</textarea></label>
          ${num(i.quantidade_avariada) > 0 ? `<div class="receb-fotos">${fotos.map((f, k) => `<figure><img src="${esc(f.conteudo)}" alt="Foto ${k + 1}"><button type="button" class="receb-foto-tirar" data-foto-tirar="${k}" aria-label="Tirar foto">×</button></figure>`).join("")}
            ${fotos.length < 6 ? `<label class="receb-foto-add">+ Foto${fotos.length ? "" : " *"}<input type="file" accept="image/*" capture="environment" multiple hidden data-foto-add></label>` : ""}</div>
            ${!i.pedido_item_id ? `<p class="receb-alerta">Ligue este item a um item do pedido na etapa 2 para registrar a avaria.</p>` : ""}` : ""}
        </div>`;
      }).join("")}`;
  }

  // ---------- etapa 5: revisão + valores e pagamento
  function finPadrao(){
    const r = R.rec;
    const totalItens = (r.itens || []).reduce((s, i) => s + num(i.quantidade_recebida) * num(i.valor_unitario), 0);
    const total = Math.round((num(r.valor_total) || totalItens) * 100) / 100;
    const dup = Array.isArray(r.duplicatas) ? r.duplicatas.filter((d) => d.vencimento && num(d.valor) > 0) : [];
    return {
      lancar: true,
      forma: "boleto",
      total,
      parcelas: dup.length ? dup.map((d) => ({ vencimento: String(d.vencimento).slice(0, 10), valor: num(d.valor) })) : [{ vencimento: somarDias(hoje(), 30), valor: total }],
      valores: Object.fromEntries((r.itens || []).map((i) => [i.id, num(i.valor_unitario)]))
    };
  }
  function etapaRevisar(){
    const r = R.rec;
    const ped = r.pedido || {};
    const pagoDefinido = Array.isArray(ped.parcelas) && ped.parcelas.length;
    const podeEditar = r.edita_financeiro && !somenteLeitura() && !pagoDefinido;
    if(podeEditar && !R.fin) R.fin = finPadrao();
    const linhas = (r.itens || []).map((i) => {
      const vu = podeEditar ? R.fin.valores[i.id] : num(i.valor_unitario);
      return `<tr data-item="${esc(i.id)}"><td>${esc(i.produto_nome || i.descricao_nf)}${itemDiverge(i) ? ' <span class="badge badge-atencao">divergência</span>' : ""}</td>
        <td class="col-qtd">${qtd(i.quantidade_nf)}</td><td class="col-qtd">${qtd(i.quantidade_recebida)}</td><td class="col-qtd">${qtd(i.quantidade_avariada)}</td>
        <td class="col-qtd">${entraTexto(i)}</td>
        <td class="col-qtd">${podeEditar ? `<input type="text" inputmode="decimal" class="receb-input receb-num" data-fin-vu value="${esc(String(vu).replace(".", ","))}">` : dinheiro(vu)}</td>
        <td class="col-qtd" data-subtotal>${dinheiro(num(i.quantidade_recebida) * vu)}</td></tr>`;
    }).join("");
    const divs = (r.divergencias || []);
    let fin;
    if(pagoDefinido){
      fin = `<div class="receb-fin is-lido"><h3>Valores e pagamento</h3><p>Definido ${ped.pagamento_por ? "por " + esc(ped.pagamento_por) : "por Compras"}${ped.pagamento_em ? " em " + dataBR(ped.pagamento_em) : ""}: <strong>${esc(FORMAS[ped.forma_pagamento] || ped.forma_pagamento || "-")}</strong>, ${ped.parcelas.length} parcela(s) no Contas a Pagar.</p>
        <ul class="receb-parcelas-lidas">${ped.parcelas.map((p, k) => `<li>${k + 1}ª · ${dataBR(p.due_date)} · ${dinheiro(p.amount)}</li>`).join("")}</ul></div>`;
    } else if(podeEditar){
      const f = R.fin;
      const soma = f.parcelas.reduce((s, p) => s + num(p.valor), 0);
      fin = `<div class="receb-fin"><div class="receb-fin-topo"><h3>Valores e pagamento</h3>
          <label class="receb-check"><input type="checkbox" data-fin="lancar" ${f.lancar ? "checked" : ""}> Lançar no Contas a Pagar agora</label></div>
        <div class="receb-fin-corpo"${f.lancar ? "" : " hidden"}>
          <div class="receb-campos3">
            <label>Forma de pagamento<select class="receb-input" data-fin="forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}"${k === f.forma ? " selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Total a pagar<input type="text" inputmode="decimal" class="receb-input" data-fin="total" value="${esc(String(f.total).replace(".", ","))}"></label>
            <label>Parcelas<span class="receb-parc-gerar"><input type="number" min="1" max="24" class="receb-input" data-fin="n" value="${f.parcelas.length}"><button type="button" class="btn btn-outline btn-sm" data-fin-gerar>Dividir</button></span></label>
          </div>
          <table class="receb-tabela receb-parcelas"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="col-qtd">Valor</th></tr></thead><tbody>
            ${f.parcelas.map((p, k) => `<tr data-parc="${k}"><td>${k + 1}ª</td><td><input type="date" class="receb-input" data-parc-campo="vencimento" value="${esc(p.vencimento)}"></td><td class="col-qtd"><input type="text" inputmode="decimal" class="receb-input receb-num" data-parc-campo="valor" value="${esc(String(p.valor).replace(".", ","))}"></td></tr>`).join("")}
          </tbody></table>
          <p class="receb-soma${Math.abs(soma - num(f.total)) > 0.05 ? " is-erro" : ""}" data-fin-soma>Soma das parcelas: ${dinheiro(soma)}${Math.abs(soma - num(f.total)) > 0.05 ? " — diferente do total" : ""}</p>
        </div></div>`;
    } else {
      fin = `<div class="receb-fin is-lido"><h3>Valores e pagamento</h3><p>${somenteLeitura() ? "Ainda não definidos." : "Ficam com Compras: o valor final e a condição de pagamento são lançados por lá no pedido de compra."}</p></div>`;
    }
    return `${somenteLeitura() ? `<p class="receb-dica">Concluído em ${dataBR(r.concluido_em)} por ${esc(r.concluido_por_nome || "-")}.</p>` : `<p class="receb-dica">Confira tudo antes de concluir. Ao concluir, o que foi aceito entra no estoque e o pedido ${r.pedido ? pc(r.pedido.numero) : ""} é atualizado em Compras.</p>`}
      <div class="table-wrap"><table class="receb-tabela"><thead><tr><th>Material</th><th class="col-qtd">Nota</th><th class="col-qtd">Recebido</th><th class="col-qtd">Avariado</th><th class="col-qtd">Entra no estoque</th><th class="col-qtd">Valor un.</th><th class="col-qtd">Subtotal</th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${divs.length ? `<div class="receb-divs-lista"><h3>Divergências no recebimento</h3><ul>${divs.map((d) => `<li><strong>DR-${d.numero}</strong> · ${esc(d.material_nome || "")} · ${qtd(d.quantidade_bloqueada)} ${esc(d.material_unidade || "")} · <span class="badge ${d.status === "aberta" ? "badge-atencao" : "badge-ok"}">${d.status === "aberta" ? "Aguardando Compras" : esc(d.decisao || d.status)}</span></li>`).join("")}</ul></div>` : ""}
      ${somenteLeitura() && !r.observacao ? "" : `<label class="receb-obs">Observação do recebimento<textarea class="receb-input" rows="2" maxlength="1000" data-obs ${somenteLeitura() ? "disabled" : ""}>${esc(r.observacao || "")}</textarea></label>`}
      ${fin}`;
  }

  // ------------------------------------------------------------------ eventos do fluxo
  function itemPorId(id){ return (R.rec.itens || []).find((i) => String(i.id) === String(id)); }
  function lerNumero(v){ const t = String(v || "").trim(); if(!t) return 0; const n = num(t); return Number.isFinite(n) ? n : NaN; }
  function ligarFluxo(){
    const box = $("recebFluxoView");
    box.querySelectorAll("[data-campo]").forEach((el) => {
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => campoAlterado(el));
      if(el.dataset.campo === "material") el.addEventListener("change", () => campoAlterado(el, true));
    });
    if(somenteLeitura()) box.querySelectorAll(".receb-corpo input, .receb-corpo select, .receb-corpo textarea").forEach((el) => { el.disabled = true; });
    box.querySelectorAll("[data-foto-add]").forEach((el) => el.addEventListener("change", () => adicionarFotos(el)));
    box.querySelectorAll("[data-fin], [data-fin-vu], [data-parc-campo]").forEach((el) => el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => finAlterado(el)));
    const obs = box.querySelector("[data-obs]");
    if(obs) obs.addEventListener("input", () => { R.rec.observacao = obs.value; R.obsAlterada = true; });
  }
  function campoAlterado(el, confirmado){
    const tr = el.closest("[data-item]");
    const i = tr && itemPorId(tr.dataset.item);
    if(!i) return;
    const campo = el.dataset.campo;
    i._alterado = true;
    if(campo === "material"){
      const p = (produtosDashboard || []).find((x) => rotuloMaterial(x) === el.value.trim());
      if(p){
        i.produto_id = String(p.ID); i.produto_nome = p.Produto; i.produto_codigo = p.Codigo; i.unidade_interna = p.Unidade;
        if(!i.pedido_item_id){
          const pit = ((R.rec.pedido && R.rec.pedido.itens) || []).find((x) => String(x.material_id) === String(p.ID));
          if(pit){ i.pedido_item_id = pit.id; const sel = tr.querySelector('[data-campo="pedido_item_id"]'); if(sel) sel.value = pit.id; }
        }
        el.classList.remove("is-pendente");
      } else if(confirmado || !el.value.trim()){
        if(!el.value.trim()){ i.produto_id = null; i.produto_nome = null; }
        el.classList.toggle("is-pendente", !i.produto_id);
      }
      return;
    }
    if(campo === "controla_estoque"){
      i.controla_estoque = el.checked;
      const m = tr.querySelector('[data-campo="material"]');
      if(m){ m.disabled = !el.checked; m.classList.toggle("is-pendente", el.checked && !i.produto_id); }
      return;
    }
    if(campo === "pedido_item_id"){ i.pedido_item_id = el.value || null; return; }
    if(campo === "divergencia_descricao"){ i.divergencia_descricao = el.value; return; }
    const v = lerNumero(el.value);
    el.classList.toggle("is-erro", !Number.isFinite(v) || v < 0 || (campo === "fator_conversao" && v <= 0));
    if(!Number.isFinite(v) || v < 0) return;
    i[campo] = campo === "fator_conversao" ? (v || 1) : v;
    const entra = tr.querySelector("[data-entra]");
    if(entra) entra.innerHTML = entraTexto(i);
  }
  async function adicionarFotos(input){
    const tr = input.closest("[data-item]");
    const i = tr && itemPorId(tr.dataset.item);
    if(!i) return;
    const fotos = Array.isArray(i.divergencia_fotos) ? [...i.divergencia_fotos] : [];
    for(const f of [...(input.files || [])].slice(0, 6 - fotos.length)){
      try{ fotos.push({ nome: f.name || "foto.jpg", conteudo: await reduzirFoto(f) }); }catch(e){ aviso("Não foi possível ler a foto " + f.name + "."); }
    }
    i.divergencia_fotos = fotos; i._fotos = true; i._alterado = true;
    renderFluxo();
  }
  function reduzirFoto(file){
    return new Promise((ok, erro) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1280, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("imagem")); };
      img.src = url;
    });
  }
  function finAlterado(el){
    const f = R.fin;
    if(!f) return;
    if(el.dataset.fin === "lancar"){ f.lancar = el.checked; const c = $("recebFluxoView").querySelector(".receb-fin-corpo"); if(c) c.hidden = !el.checked; return; }
    if(el.dataset.fin === "forma"){ f.forma = el.value; return; }
    if(el.dataset.fin === "n") return;
    if(el.dataset.fin === "total"){ f.total = lerNumero(el.value) || 0; atualizarSoma(); return; }
    if(el.hasAttribute("data-fin-vu")){
      const tr = el.closest("[data-item]"); const i = itemPorId(tr.dataset.item); const v = lerNumero(el.value);
      if(!Number.isFinite(v) || v < 0){ el.classList.add("is-erro"); return; }
      el.classList.remove("is-erro");
      f.valores[i.id] = v;
      tr.querySelector("[data-subtotal]").textContent = dinheiro(num(i.quantidade_recebida) * v);
      return;
    }
    const tr = el.closest("[data-parc]");
    const p = tr && f.parcelas[Number(tr.dataset.parc)];
    if(!p) return;
    if(el.dataset.parcCampo === "vencimento") p.vencimento = el.value;
    else { p.valor = lerNumero(el.value) || 0; atualizarSoma(); }
  }
  function atualizarSoma(){
    const f = R.fin, el = $("recebFluxoView").querySelector("[data-fin-soma]");
    if(!el) return;
    const soma = f.parcelas.reduce((s, p) => s + num(p.valor), 0), errado = Math.abs(soma - num(f.total)) > 0.05;
    el.textContent = "Soma das parcelas: " + dinheiro(soma) + (errado ? " — diferente do total" : "");
    el.classList.toggle("is-erro", errado);
  }
  function gerarParcelas(){
    const f = R.fin, box = $("recebFluxoView");
    const n = Math.min(24, Math.max(1, parseInt(box.querySelector('[data-fin="n"]').value, 10) || 1));
    const total = num(f.total), base = Math.floor((total / n) * 100) / 100;
    const inicio = f.parcelas[0]?.vencimento || somarDias(hoje(), 30);
    f.parcelas = Array.from({ length: n }, (_, k) => ({ vencimento: somarDias(inicio, 30 * k), valor: k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base }));
    renderFluxo();
  }

  function payloadItens(){
    return (R.rec.itens || []).filter((i) => i._alterado).map((i) => {
      const o = { id: i.id, produto_id: i.produto_id || "", pedido_item_id: i.pedido_item_id || "", fator_conversao: num(i.fator_conversao) || 1,
        controla_estoque: Boolean(i.controla_estoque), quantidade_recebida: num(i.quantidade_recebida), quantidade_avariada: num(i.quantidade_avariada),
        divergencia_descricao: i.divergencia_descricao || "" };
      if(i._fotos) o.divergencia_fotos = i.divergencia_fotos || [];
      if(i._vu) o.valor_unitario = num(i.valor_unitario);
      return o;
    });
  }
  function validarEtapa(e){
    const itens = R.rec.itens || [];
    if(e === 2){
      const sem = itens.filter((i) => i.controla_estoque && !i.produto_id);
      if(sem.length) return `Vincule ${sem.length === 1 ? `"${sem[0].descricao_nf}"` : sem.length + " itens"} a um material do Almoxarifado (ou desmarque "Controla" se não entra no estoque).`;
    }
    if(e === 3){
      if(!itens.some((i) => num(i.quantidade_recebida) > 0)) return "Informe quanto chegou de pelo menos um item.";
      const av = itens.find((i) => num(i.quantidade_avariada) > num(i.quantidade_recebida));
      if(av) return `A quantidade avariada de "${av.produto_nome || av.descricao_nf}" passa da recebida.`;
    }
    if(e === 4){
      for(const i of itens.filter(itemDiverge)){
        const nome = i.produto_nome || i.descricao_nf;
        if(!String(i.divergencia_descricao || "").trim()) return `Descreva a divergência de "${nome}".`;
        if(num(i.quantidade_avariada) > 0 && !(i.divergencia_fotos || []).length) return `Tire pelo menos uma foto do avariado de "${nome}".`;
        if(num(i.quantidade_avariada) > 0 && !i.pedido_item_id) return `Ligue "${nome}" a um item do pedido (etapa 2) para registrar a avaria.`;
      }
    }
    return "";
  }
  async function salvar(proxEtapa){
    if(R.salvando) return false;
    R.salvando = true;
    try{
      const dados = { etapa: proxEtapa, itens: payloadItens() };
      if(R.obsAlterada) dados.observacao = R.rec.observacao || "";
      const novo = await rpc("almox_receb_salvar", { p_id: R.rec.id, p_dados: dados });
      R.rec = novo; R.obsAlterada = false;
      return true;
    }catch(e){ aviso(e.message); return false; }
    finally{ R.salvando = false; }
  }
  async function irPara(e){
    if(!R.rec || somenteLeitura()){ R.etapa = e; renderFluxo(); return; }
    if(e > R.etapa){
      for(let k = R.etapa; k < e; k++){ const erro = validarEtapa(k); if(erro){ aviso(erro); return; } }
    }
    if(await salvar(Math.max(e, R.rec.etapa))){ R.etapa = e; renderFluxo(); }
  }
  async function concluir(){
    for(let k = 2; k <= 4; k++){ const erro = validarEtapa(k); if(erro){ aviso(erro); return; } }
    let financeiro = null;
    if(R.fin && R.fin.lancar && R.rec.edita_financeiro){
      const f = R.fin;
      if(!(num(f.total) > 0)){ aviso("Informe o total a pagar."); return; }
      const soma = f.parcelas.reduce((s, p) => s + num(p.valor), 0);
      if(Math.abs(soma - num(f.total)) > 0.05){ aviso("A soma das parcelas está diferente do total a pagar."); return; }
      if(f.parcelas.some((p) => !p.vencimento || !(num(p.valor) > 0))){ aviso("Cada parcela precisa de vencimento e valor."); return; }
      financeiro = { forma: f.forma, total: num(f.total), parcelas: f.parcelas.map((p) => ({ vencimento: p.vencimento, valor: num(p.valor) })), itens: Object.entries(f.valores).map(([id, v]) => ({ id, valor_unitario: v })) };
      // o valor unitário vai antes no rascunho: é ele que vira o custo da entrada no estoque
      (R.rec.itens || []).forEach((i) => { if(f.valores[i.id] != null && f.valores[i.id] !== num(i.valor_unitario)){ i.valor_unitario = f.valores[i.id]; i._alterado = true; i._vu = true; } });
    }
    const divs = (R.rec.itens || []).filter((i) => num(i.quantidade_avariada) > 0).length;
    const msg = `Concluir o recebimento ${rnum(R.rec.numero)}?\n\nO que foi aceito entra no estoque agora.` + (divs ? `\n${divs} ${divs === 1 ? "item com avaria vai" : "itens com avaria vão"} para Compras decidir.` : "") + (financeiro ? `\n${financeiro.parcelas.length} parcela(s) vão para o Contas a Pagar.` : "");
    if(!confirm(msg)) return;
    const btn = $("recebFluxoView").querySelector("[data-receb-concluir]");
    if(btn) btn.disabled = true;
    if(!(await salvar(5))){ if(btn) btn.disabled = false; return; }
    try{
      const res = await rpc("almox_receb_concluir", { p_id: R.rec.id, p_financeiro: financeiro });
      const id = R.rec.id;
      await abrir(id);
      aviso("Recebimento concluído." + (res && res.divergencias ? ` ${res.divergencias} divergência(s) enviada(s) para Compras.` : ""), "ok");
      carregar();
      try{ if(typeof carregarDashboard === "function") carregarDashboard(); }catch(e){}
      try{ if(typeof carregarSolicitacoesCompra === "function") carregarSolicitacoesCompra(); }catch(e){}
    }catch(e){ aviso(e.message); if(btn) btn.disabled = false; }
  }
  async function descartar(){
    if(!confirm(`Descartar o recebimento ${rnum(R.rec.numero)}? Nada entrou no estoque ainda.`)) return;
    try{ await rpc("almox_receb_excluir", { p_id: R.rec.id }); voltarLista(); }catch(e){ aviso(e.message); }
  }

  // ------------------------------------------------------------------ cliques (delegados)
  document.addEventListener("click", (ev) => {
    const locacaoBtn = ev.target.closest && ev.target.closest('#tab-recebimento [data-receb-locacao]');
    if (locacaoBtn) {
      const p = R.pedidos.find(p => p.id === locacaoBtn.dataset.recebLocacao);
      if (!p) return;
      const itens = (p.itens || []).filter(i => num(i.saldo) > 0);
      const texto = itens.map(i => `${i.nome}: ${qtd(i.saldo)} ${i.unidade || 'un'}`).join('\n');
      (async () => {
        const mensagem = `Confirma a chegada e conferência de todos estes itens?\n\n${texto}\n\nA quantidade será adicionada ao estoque de locação.`;
        const ok = window.confirmarGlobal ? await window.confirmarGlobal(mensagem, 'Receber itens de locação') : confirm(mensagem);
        if (!ok) return;
        locacaoBtn.disabled = true;
        try { await rpc('compras_receber_locacao', { p_pedido: p.id }); await carregar(); aviso('Recebimento confirmado. Estoque de locação atualizado.', 'ok'); }
        catch (e) { aviso(e.message); locacaoBtn.disabled = false; }
      })();
      return;
    }
    const alvo = ev.target.closest && ev.target.closest("#tab-recebimento [data-receb-abrir], #tab-recebimento [data-receb-xml], #tab-recebimento [data-receb-manual], #tab-recebimento [data-receb-nova-xml], #tab-recebimento [data-receb-voltar], #tab-recebimento [data-receb-ir], #tab-recebimento [data-receb-etapa], #tab-recebimento [data-receb-concluir], #tab-recebimento [data-receb-descartar], #tab-recebimento [data-receb-tudo], #tab-recebimento [data-foto-tirar], #tab-recebimento [data-fin-gerar], #tab-recebimento #recebPreviaIniciar");
    if(!alvo) return;
    const d = alvo.dataset;
    if(d.recebAbrir) abrir(d.recebAbrir);
    else if(d.recebXml) escolherXml(d.recebXml);
    else if("recebNovaXml" in d) escolherXml("");
    else if(d.recebManual) iniciarManual(d.recebManual);
    else if("recebVoltar" in d) voltarLista();
    else if(d.recebIr) irPara(Number(d.recebIr));
    else if(d.recebEtapa) irPara(Number(d.recebEtapa));
    else if("recebConcluir" in d) concluir();
    else if("recebDescartar" in d) descartar();
    else if("recebTudo" in d){ (R.rec.itens || []).forEach((i) => { i.quantidade_recebida = num(i.quantidade_nf); i._alterado = true; }); renderFluxo(); }
    else if(d.fotoTirar != null){
      const i = itemPorId(alvo.closest("[data-item]").dataset.item);
      i.divergencia_fotos = (i.divergencia_fotos || []).filter((_, k) => k !== Number(d.fotoTirar)); i._fotos = true; i._alterado = true;
      renderFluxo();
    }
    else if("finGerar" in d) gerarParcelas();
    else if(alvo.id === "recebPreviaIniciar") criarComXml();
  });
  document.addEventListener("keydown", (ev) => {
    const tr = ev.target.closest && ev.target.closest("#tab-recebimento tr[data-receb-abrir]");
    if(tr && (ev.key === "Enter" || ev.key === " ")){ ev.preventDefault(); abrir(tr.dataset.recebAbrir); }
  });

  window.AlmoxRecebimento = {
    carregar,
    abrirAba(){ if(!R.rec && !R.previa) mostrarFluxo(false); carregar(); },
    filtrar: renderLista
  };
})();
