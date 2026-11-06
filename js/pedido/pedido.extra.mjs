/* Pedido extra (out/2026): o cliente acrescenta itens depois de o pedido fechar ou ser entregue.
   O extra (número "1/2", "1/3"…) tem entrega, itens, parcelas e contrato (opcional) próprios e segue Triagem →
   Carregamento → Entrega sozinho; da coleta em diante vira uma coisa só com o principal (feito no banco).
   Cliente, local, evento e coleta do extra são sempre os do principal: aqui ficam travados na tela. */

const TRAVADOS = ["clienteInput", "tipoEventoSelect", "localInput", "dataEvento", "dataEventoFim", "dataColeta", "horaColeta", "observacoesColeta"];

function esc(v){ return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const linkPedido = (id) => `pedido.html?pedido=${encodeURIComponent(id)}&modo=editar`;

// Monta o pedido novo (ainda não salvo) com os dados do principal; a tela aplica como se fosse um rascunho.
export async function dadosNovoExtra(supabase, empresaId, principalId){
  const { data: pr, error } = await supabase.from("separacoes_pedidos").select("*")
    .eq("empresa_id", empresaId).eq("id", principalId).maybeSingle();
  if(error || !pr) throw new Error("Pedido principal não encontrado.");
  if(pr.pedido_origem_id) throw new Error("Um pedido extra não pode ter outro pedido extra. Abra o pedido principal.");
  const obs = pr.observacoes && typeof pr.observacoes === "object" ? pr.observacoes : {};
  return {
    principal: pr,
    pedido: {
      empresa_id: pr.empresa_id, numero_pedido: "", cliente_id: pr.cliente_id, cliente_nome: pr.cliente_nome,
      contato_cliente: pr.contato_cliente, tipo_evento: pr.tipo_evento, local_id: pr.local_id, local_nome: pr.local_nome,
      data_evento: pr.data_evento, data_evento_fim: pr.data_evento_fim, data_coleta: pr.data_coleta, data_hora: pr.data_hora,
      data_entrega: null, valor_total: 0, status: "pendente", status_comercial: "orcamento", pre_reserva_ate: null,
      pedido_origem_id: pr.id,
      observacoes: {
        horario_coleta: obs.horario_coleta || obs.horarios_pedido?.coleta || "",
        observacoes_coleta: obs.observacoes_coleta || "",
        local_html: obs.local_html || "", local_tags_html: obs.local_tags_html || ""
      }
    }
  };
}

function travarCampos(){
  document.querySelector(".pedido-screen")?.classList.add("pedido-eh-extra");
  for(const id of TRAVADOS){
    const el = document.getElementById(id);
    if(!el) continue;
    el.disabled = true;
    el.title = "Segue o pedido principal";
  }
  document.querySelectorAll(".evento-modo button").forEach((b) => { b.disabled = true; });
}

function faixa(html){
  let el = document.getElementById("pedidoExtraFaixa");
  if(!el){
    el = document.createElement("div");
    el.id = "pedidoExtraFaixa";
    el.className = "pedido-extra-faixa";
    const alvo = document.querySelector(".entrada-identidade") || document.querySelector(".pedido-screen");
    if(alvo?.classList.contains("entrada-identidade")) alvo.before(el); else alvo?.prepend(el);
  }
  el.innerHTML = html;
  return el;
}

// Liga o modo extra (pedido novo ou já salvo) ou, no principal, mostra os extras e o botão "+ Pedido extra".
export async function prepararPedidoExtra({ supabase }){
  const atual = window.__PEDIDO_DADOS_ATUAL || {};
  const pedidoId = window.__PEDIDO_ATUAL_ID;
  if(window.__pedidoExtra){
    const { principalNumero, principalId } = window.__pedidoExtra;
    travarCampos();
    window.__pedidoSincronizarDatas?.();
    faixa(`<span class="pedido-extra-selo">Pedido extra</span>
      <p>Itens a mais do <a href="${esc(linkPedido(principalId))}">pedido ${esc(principalNumero)}</a>. Cliente, local, evento e coleta seguem o pedido principal.
      A entrega, as parcelas e o contrato (opcional) são deste pedido; da coleta em diante tudo é feito junto com o pedido ${esc(principalNumero)}.</p>`);
    return;
  }
  if(!pedidoId || !supabase) return;
  let info = null;
  try{
    const { data, error } = await supabase.rpc("pedido_extras", { p_pedido: pedidoId });
    if(error) throw error;
    info = data;
  }catch(e){ console.warn("[Pedido] extras:", e); return; }
  if(info?.eh_extra){
    window.__pedidoExtra = { principalId: info.principal.id, principalNumero: info.principal.numero };
    return prepararPedidoExtra({ supabase });
  }
  const extras = Array.isArray(info?.extras) ? info.extras : [];
  if(!extras.length && !info?.pode_criar) return;
  // Nov/2026 (pedido do usuário): no principal, em vez da faixa grande, um botão pequeno ao lado do nome do cliente
  // (fundo branco, texto e borda azuis) e os números dos extras que já existem.
  document.getElementById("pedidoExtraFaixa")?.remove();
  const nome = document.querySelector(".entrada-identidade h3");
  let el = document.getElementById("pedidoExtraMini");
  if(!el){ el = document.createElement("span"); el.id = "pedidoExtraMini"; el.className = "pedido-extra-mini"; }
  if(nome) nome.after(el); else return;
  el.innerHTML = extras.map((x) => `<a class="pedido-extra-chip" href="${esc(linkPedido(x.id))}" title="Pedido extra ${esc(x.numero)}">${esc(x.numero)}</a>`).join("")
    + (info?.pode_criar ? `<button type="button" class="pedido-extra-botao" data-pedido-extra-criar title="O cliente pediu mais itens depois de fechar? Crie um pedido extra ligado a este.">+ Pedido extra</button>`
      : "");
  if(info?.coleta_iniciada && info?.pode_criar === false) el.title = "A coleta já começou: não dá mais para criar pedido extra.";
  el.querySelector("[data-pedido-extra-criar]")?.addEventListener("click", () => {
    window.__pedidoGravarRascunho?.();
    location.href = `pedido.html?extra_de=${encodeURIComponent(atual.id || pedidoId)}`;
  });
}
