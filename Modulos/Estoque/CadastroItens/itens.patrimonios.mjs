// QR fixo nos móveis (out/2026): cada unidade do item ganha um patrimônio (itens_patrimonios) com código próprio,
// impresso uma vez e colado no móvel. O QR leva ACERVO:PAT:<código>; na separação, o mesmo móvel nunca conta duas vezes.
const supabase = window.supabaseClient;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = { ativo: "Em uso", manutencao: "Manutenção", baixado: "Fora de uso" };
const estado = { item: null, lista: [] };

function avisar(msg, titulo = "Etiquetas fixas", tipo = "aviso"){ window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }

function montarCartao(){
  if(document.getElementById("patrimoniosCard")) return document.getElementById("patrimoniosCard");
  const painel = document.querySelector('[data-item-panel="qrcode"]');
  if(!painel) return null;
  const card = document.createElement("article");
  card.className = "item-card patrimonios-card";
  card.id = "patrimoniosCard";
  card.innerHTML = `
    <div class="patrimonios-topo">
      <div>
        <span class="qr-section-label">Etiquetas fixas dos móveis</span>
        <strong>QR por unidade (patrimônio)</strong>
        <p>Cada móvel deste item ganha um QR próprio, colado nele de forma permanente. Na separação, o mesmo móvel nunca conta duas vezes.</p>
      </div>
      <span class="patrimonios-contagem" id="patrimoniosContagem">—</span>
    </div>
    <div class="patrimonios-gerar">
      <label>Gerar <input type="number" min="1" max="500" id="patrimoniosQtd" value="1"> etiqueta(s) nova(s)</label>
      <button type="button" class="btn primary" id="patrimoniosGerar">Gerar e imprimir</button>
      <button type="button" class="btn secondary" id="patrimoniosImprimirTodas">Imprimir todas em uso</button>
    </div>
    <div class="patrimonios-lista" id="patrimoniosLista"></div>`;
  painel.appendChild(card);
  card.querySelector("#patrimoniosGerar").addEventListener("click", () => gerar().catch(erro));
  card.querySelector("#patrimoniosImprimirTodas").addEventListener("click", () => imprimir(estado.lista.filter((p) => p.status === "ativo")).catch(erro));
  card.querySelector("#patrimoniosLista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pat-acao]");
    if(!b) return;
    const pat = estado.lista.find((p) => p.id === b.dataset.patId);
    if(!pat) return;
    if(b.dataset.patAcao === "imprimir") imprimir([pat]).catch(erro);
    if(b.dataset.patAcao === "status") mudarStatus(pat, b.dataset.status).catch(erro);
  });
  return card;
}

function erro(e){ console.error(e); avisar(e?.message || "Algo deu errado.", "Etiquetas fixas", "erro"); }

function nomeItem(item){
  return String(item?.descricao_total || "").trim() || [item?.produto_base, item?.produto].filter(Boolean).join(" ") || "Item";
}

function pintar(){
  const card = montarCartao();
  if(!card) return;
  const ativos = estado.lista.filter((p) => p.status === "ativo").length;
  const estoque = Number(estado.item?.estoque_total) || 0;
  card.querySelector("#patrimoniosContagem").textContent = ativos + " em uso" + (estoque ? " de " + estoque + " no estoque" : "");
  const sugerido = Math.max(1, estoque - estado.lista.length);
  const qtd = card.querySelector("#patrimoniosQtd");
  if(!qtd.dataset.mexido) qtd.value = sugerido;
  qtd.oninput = () => { qtd.dataset.mexido = "1"; };
  card.querySelector("#patrimoniosImprimirTodas").disabled = !ativos;
  card.querySelector("#patrimoniosLista").innerHTML = estado.lista.length
    ? estado.lista.map((p) => `<div class="patrimonio-linha${p.status !== "ativo" ? " is-fora" : ""}">
        <code>${esc(p.codigo_patrimonio)}</code><span>${esc(STATUS[p.status] || p.status)}</span>
        <button type="button" class="btn secondary" data-pat-acao="imprimir" data-pat-id="${esc(p.id)}">Reimprimir</button>
        ${p.status === "ativo"
          ? `<button type="button" class="btn secondary" data-pat-acao="status" data-status="baixado" data-pat-id="${esc(p.id)}">Tirar de uso</button>`
          : `<button type="button" class="btn secondary" data-pat-acao="status" data-status="ativo" data-pat-id="${esc(p.id)}">Voltar a usar</button>`}
      </div>`).join("")
    : '<p class="patrimonios-vazio">Nenhuma etiqueta fixa ainda.</p>';
}

async function carregar(){
  await window.aguardarContexto?.();
  const id = window.itemAtualId;
  const card = montarCartao();
  if(!card) return;
  if(!id){ card.hidden = true; return; }
  card.hidden = false;
  const empresa = window.__CONTEXT?.empresa_id;
  const [{ data: item }, { data: lista, error }] = await Promise.all([
    supabase.from("itens").select("id,codigo,referencia,produto,produto_base,descricao_total,estoque_total").eq("empresa_id", empresa).eq("id", id).maybeSingle(),
    supabase.from("itens_patrimonios").select("*").eq("empresa_id", empresa).eq("item_id", id).order("codigo_patrimonio")
  ]);
  if(error) throw error;
  estado.item = item; estado.lista = lista || [];
  pintar();
}

async function gerar(){
  const item = estado.item;
  if(!item) return avisar("Salve o item antes de gerar as etiquetas.");
  const qtd = Number(document.getElementById("patrimoniosQtd").value);
  if(!Number.isInteger(qtd) || qtd < 1 || qtd > 500) return avisar("Use de 1 a 500 etiquetas por vez.");
  const formato = await window.EasyLocEtiquetas.escolherFormato("100x50");
  if(!formato) return;
  const base = String(item.referencia || item.codigo || "ITEM").trim().replace(/\s+/g, "").toUpperCase();
  let maior = estado.lista.reduce((m, p) => Math.max(m, Number(String(p.codigo_patrimonio).split("-").pop()) || 0), 0);
  const novas = Array.from({ length: qtd }, () => ({ empresa_id: window.__CONTEXT.empresa_id, item_id: item.id, codigo_patrimonio: base + "-" + String(++maior).padStart(3, "0") }));
  const { data, error } = await supabase.from("itens_patrimonios").insert(novas).select("*");
  if(error) throw new Error(/duplicate|unique/i.test(error.message) ? "Algum código já existe. Atualize a página e tente de novo." : error.message);
  estado.lista = [...estado.lista, ...(data && data.length ? data : novas)].sort((a, b) => String(a.codigo_patrimonio).localeCompare(String(b.codigo_patrimonio)));
  delete document.getElementById("patrimoniosQtd").dataset.mexido;
  pintar();
  await imprimir(data && data.length ? data : novas, formato);
}

async function imprimir(lista, formatoEscolhido){
  if(!lista.length) return;
  const formato = formatoEscolhido || await window.EasyLocEtiquetas.escolherFormato("100x50");
  if(!formato) return;
  await window.EasyLocEtiquetas.imprimir({
    formato,
    etiquetas: lista.map((p) => ({ qr: "ACERVO:PAT:" + p.codigo_patrimonio, marca: window.__CONTEXT?.empresa_nome || "", titulo: nomeItem(estado.item), codigo: p.codigo_patrimonio, linhas: [] }))
  });
}

async function mudarStatus(pat, status){
  const { error } = await supabase.from("itens_patrimonios").update({ status }).eq("id", pat.id).eq("empresa_id", window.__CONTEXT.empresa_id);
  if(error) throw error;
  pat.status = status;
  pintar();
}

export function initPatrimonios(){
  document.querySelector('[data-item-tab="qrcode"]')?.addEventListener("click", () => carregar().catch(erro));
  if(document.querySelector('[data-item-panel="qrcode"].active')) carregar().catch(erro);
}
