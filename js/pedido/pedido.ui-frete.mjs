export async function renderizarFreteCard(resumo){

  const detalhe = document.getElementById("freteDetalheCaminhoes");
  const qtdEl = document.getElementById("freteQtdCaminhoes");
  const valorEl = document.getElementById("freteValor");

  if(!detalhe || !qtdEl || !valorEl) return;

  // =============================
  // CASO SEM RESUMO
  // =============================
  if(!resumo){

    detalhe.innerHTML = "";
    qtdEl.innerText = "0";
    valorEl.innerText = "R$ 0,00";

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

  // 🔥 SALVA PARA O RESUMO GLOBAL
  window.__FRETE_BRUTO = bruto;
  window.__FRETE_DESCONTO = desconto;
  window.__FRETE_FINAL = final;

  const totalCaminhoes = (resumo.caminhoes || [])
    .reduce((acc, c) => acc + Number(c.quantidade || 0), 0);

  // =============================
  // RENDERIZA
  // =============================
  detalhe.innerHTML = `

    ${(resumo.caminhoes || []).map(c => `
      <div style="
        display:flex;
        justify-content:space-between;
        margin-bottom:6px;
        font-size:13px;
      ">
        <span style="font-weight:600;color:#0f2a44;">
          ${c.nome}
        </span>
        <span style="color:#475569;">
          ${c.quantidade}
        </span>
      </div>
    `).join("")}

    <div style="margin:12px 0;border-top:1px solid #eef2f7;"></div>

    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
      <span style="font-weight:500;">Frete Bruto</span>
      <strong>${bruto.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    </div>

    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#16a34a;">
      <span style="font-weight:600;">Desconto (${percent}%)</span>
      <strong>- ${desconto.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    </div>

  `;

  qtdEl.innerText = String(totalCaminhoes);

  valorEl.innerText = final.toLocaleString("pt-BR", { 
    style:"currency", 
    currency:"BRL" 
  });

  const resumoFrete = document.getElementById("resumoFrete");
  if(resumoFrete) resumoFrete.innerText = valorEl.innerText;

  // 🔥 ATUALIZA RESUMO GERAL
  if (window.atualizarResumoGlobal) {
    window.atualizarResumoGlobal();
  }
}