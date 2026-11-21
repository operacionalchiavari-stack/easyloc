// 15/11/2026: aba só de visualização — códigos gerados e protegidos pelo banco (itens_patrimonios_garantir).
// QR fixo nos móveis (out/2026): cada unidade do item ganha um patrimônio (itens_patrimonios) com código próprio,
// impresso uma vez e colado no móvel. O QR leva ACERVO:PAT:<código>; na separação, o mesmo móvel nunca conta duas vezes.
const supabase = window.supabaseClient;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = { ativo: "Em uso", manutencao: "Manutenção", baixado: "Fora de uso" };
const estado = { item: null, lista: [], kit: false };

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
        <p>Cada unidade em estoque tem um código próprio, gerado automaticamente pelo sistema e que não pode ser alterado. Imprima e cole no móvel: na separação, o mesmo móvel nunca conta duas vezes.</p>
      </div>
      <span class="patrimonios-contagem" id="patrimoniosContagem">—</span>
    </div>
    <div class="patrimonios-gerar">
      <button type="button" class="btn primary" id="patrimoniosImprimirTodas">Imprimir todas</button>
    </div>
    <div class="patrimonios-lista" id="patrimoniosLista"></div>`;
  painel.appendChild(card);
  card.querySelector("#patrimoniosImprimirTodas").addEventListener("click", () => imprimir(estado.lista.filter((p) => p.status === "ativo")).catch(erro));
  card.querySelector("#patrimoniosLista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pat-acao=imprimir]");
    if(!b) return;
    const pat = estado.lista.find((p) => p.id === b.dataset.patId);
    if(pat) imprimir([pat]).catch(erro);
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
  card.querySelector("#patrimoniosContagem").textContent = estado.lista.length + " etiqueta(s)" + (estoque ? " · " + estoque + " no estoque" : "");
  card.querySelector("#patrimoniosImprimirTodas").disabled = !ativos;
  card.querySelector("#patrimoniosLista").innerHTML = estado.kit
    ? '<p class="patrimonios-vazio">Kit não tem etiqueta própria: cada componente tem as suas.</p>'
    : estado.lista.length
    ? estado.lista.map((p) => `<div class="patrimonio-linha${p.status !== "ativo" ? " is-fora" : ""}">
        <code>${esc(p.codigo_patrimonio)}</code><span>${esc(STATUS[p.status] || p.status)}</span>
        <button type="button" class="btn secondary" data-pat-acao="imprimir" data-pat-id="${esc(p.id)}">Imprimir</button>
      </div>`).join("")
    : '<p class="patrimonios-vazio">Sem unidades em estoque, ainda não há etiquetas. Elas são criadas sozinhas quando o item ganha estoque (implantação ou compra).</p>';
}

async function carregar(){
  await window.aguardarContexto?.();
  const id = window.itemAtualId;
  const card = montarCartao();
  if(!card) return;
  if(!id){ card.hidden = true; return; }
  card.hidden = false;
  const empresa = window.__CONTEXT?.empresa_id;
  // O banco cria os códigos que faltam (um por unidade em estoque) e devolve a lista; a tela não grava nada.
  const [{ data: item }, { data: res, error }] = await Promise.all([
    supabase.from("itens").select("id,tipo,codigo,referencia,produto,produto_base,descricao_total,estoque_total").eq("empresa_id", empresa).eq("id", id).maybeSingle(),
    supabase.rpc("itens_patrimonios_garantir", { p_empresa: empresa, p_item: id })
  ]);
  if(error) throw error;
  estado.item = item;
  estado.kit = item?.tipo === "Kit";
  estado.lista = (res?.etiquetas || []).map((p) => ({ id: p.id, codigo_patrimonio: p.codigo, status: p.status }));
  pintar();
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

export function initPatrimonios(){
  document.querySelector('[data-item-tab="qrcode"]')?.addEventListener("click", () => carregar().catch(erro));
  if(document.querySelector('[data-item-panel="qrcode"].active')) carregar().catch(erro);
}
