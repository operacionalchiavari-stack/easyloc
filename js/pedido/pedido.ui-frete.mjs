import { corDoValor, colorirValor } from "./pedido.valores-ui.mjs";
export async function renderizarFreteCard(resumo){
  window.__ATUALIZAR_FRETE_CARD = () => {
    if(window.__FRETE_CARD_RESUMO) return renderizarFreteCard(window.__FRETE_CARD_RESUMO);
    window.atualizarResumoGlobal?.();
  };

  const detalhe = document.getElementById("freteDetalheCaminhoes");
  const qtdEl = document.getElementById("freteQtdCaminhoes");
  const valorEl = document.getElementById("freteValor");

  if(!detalhe || !qtdEl || !valorEl) return;
  detalhe.classList.remove("el-page");

  // =============================
  // CASO SEM RESUMO
  // =============================
  if(!resumo){
    window.__FRETE_CARD_RESUMO = null;

    detalhe.textContent = Number(window.volumeTotalPedido || 0) > 0
      ? "Cadastre categorias de caminhão ativas com capacidade em m³ para calcular o transporte."
      : "Adicione itens com cubagem cadastrada para calcular caminhões, frete e montagem.";
    qtdEl.innerText = "0";
    valorEl.innerText = "R$ 0,00";
    colorirValor(valorEl,0);
    const totalOperacao = document.getElementById("logisticaTotalOperacao");
    if(totalOperacao) totalOperacao.innerText = "R$ 0,00";

    window.__FRETE_BRUTO = 0;
    window.__FRETE_DESCONTO = 0;
    window.__FRETE_FINAL = 0;

    if (window.atualizarResumoGlobal) {
      window.atualizarResumoGlobal();
    }

    const resumoFrete = document.getElementById("resumoFrete");
    if(resumoFrete) resumoFrete.innerText = valorEl.innerText;

    return;
  }

  // =============================
  // VALORES
  // =============================
  const bruto = Number(resumo.freteBruto || 0);
  const desconto = Number(resumo.freteAbsorcao || 0);
  const final = Number(resumo.totalFrete || 0);
  const percent = Number(resumo.fretePercent || 0);
  const montagemFinal = Number(window.__MONTAGEM_FINAL || 0);

  // 🔥 SALVA PARA O RESUMO GLOBAL
  window.__FRETE_BRUTO = bruto;
  window.__FRETE_DESCONTO = desconto;
  window.__FRETE_FINAL = final;

  const totalCaminhoes = (resumo.caminhoes || [])
    .reduce((acc, c) => acc + Number(c.quantidade || 0), 0);

  // =============================
  // RENDERIZA
  // =============================
  const abreviarCaminhao = (nome) => {
    const texto = String(nome || "").trim();
    if(!texto) return "";
    const match = texto.match(/\b(P|M|G|GG)\b/i);
    return (match ? match[1].toUpperCase() : texto).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  };

  const descricaoCaminhoes = (resumo.caminhoes || [])
    .map(c => `${Number(c.quantidade || 0)} ${abreviarCaminhao(c.nome)}`.trim())
    .filter(Boolean)
    .join(" + ") || "0";

  detalhe.innerHTML = `
    <div class="logistica-detail-row">
      <span>Caminhoes</span>
      <strong>${descricaoCaminhoes}</strong>
    </div>

    <div class="logistica-detail-row">
      <span>Capacidade / ocupação</span>
      <strong>${Number(resumo.capacidadeTotal || 0).toLocaleString("pt-BR")} m³ / ${resumo.capacidadeTotal > 0 ? (100 * resumo.volumeTotal / resumo.capacidadeTotal).toFixed(1) : 0}%</strong>
    </div>
    ${resumo.distanciaPendente ? '<p>Informe a distância para calcular o valor do frete.</p>' : ''}
    <div class="logistica-detail-row">
      <span>Frete Bruto</span>
      <strong style="color:${corDoValor(bruto)}">${bruto.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    </div>

    <div class="logistica-detail-row is-discount">
      <span>Desconto Frete</span>
      <strong style="color:${corDoValor(-desconto)}">- ${desconto.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} (${percent}%)</strong>
    </div>

    <div class="logistica-detail-row is-total">
      <span>Total Frete</span>
      <strong style="color:${corDoValor(final)}">${final.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    </div>

  `;

  qtdEl.innerText = String(totalCaminhoes);

  valorEl.innerText = final.toLocaleString("pt-BR", { 
    style:"currency", 
    currency:"BRL" 
  });

  const totalOperacao = document.getElementById("logisticaTotalOperacao");
  if(totalOperacao){
    totalOperacao.innerText = (final + montagemFinal).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }
  colorirValor(valorEl,final);
  window.__FRETE_CARD_RESUMO = resumo;

  const resumoFrete = document.getElementById("resumoFrete");
  if(resumoFrete) resumoFrete.innerText = valorEl.innerText;

  // 🔥 ATUALIZA RESUMO GERAL
  if (window.atualizarResumoGlobal) {
    window.atualizarResumoGlobal();
  }
}
