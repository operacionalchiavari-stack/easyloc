import { aplicarLogisticaManual } from './pedido.logistica-manual.mjs?v=20261031-ajuste-compacto';
import { colorirValor } from "./pedido.valores-ui.mjs";
﻿export function renderMontagemSugerida(payload){
  const automatico = payload;
  const finalManual = aplicarLogisticaManual('montagem', payload?.custoFinal ?? (Number(payload?.custoBruto || 0) - Number(payload?.valorAbsorcao || 0)), () => renderMontagemSugerida(automatico));
  if(window.__PEDIDO_LOGISTICA_MANUAL?.montagem) payload = { ...(payload || {}), qtd: payload?.qtd ?? 0, custoBruto: finalManual, custoFinal: finalManual, valorAbsorcao: 0, percent: 0 };


  const qtdEl        = document.getElementById("montagemQtd");
  const custoEl      = document.getElementById("montagemCusto");
  const infoEl       = document.getElementById("montagemInfo");
  const descontoEl   = document.getElementById("montagemDesconto");
  const valorFinalEl = document.getElementById("montagemValorFinal");

  if(!qtdEl || !custoEl || !infoEl || !descontoEl || !valorFinalEl){
    console.warn("⚠️ Estrutura fixa do card Montagem não encontrada.");
    return;
  }

  // ==============================
  // CASO SEM DADOS
  // ==============================
  if(!payload || payload.qtd == null){
    window.__RESUMO_MONTAGEM = 0;
    window.__MONTAGEM_BRUTA = 0;
    window.__MONTAGEM_DESCONTO = 0;
    window.__MONTAGEM_FINAL = 0;
    qtdEl.innerText        = "—";
    custoEl.innerText      = "—";
    infoEl.innerText       = payload?.info || "Montagem aguardando cálculo.";
    descontoEl.innerText   = "- R$ 0,00";
    colorirValor(descontoEl,0);
    colorirValor(custoEl,0);
    colorirValor(valorFinalEl,0);
    valorFinalEl.innerText = "R$ 0,00";
    if(typeof window.__ATUALIZAR_FRETE_CARD === "function"){
      window.__ATUALIZAR_FRETE_CARD();
    }else{
      window.atualizarResumoGlobal?.();
    }
    return;
  }

  const qtd      = Number(payload.qtd || 0);
  const bruto    = Number(payload.custoBruto || 0);
  const absorcao = Number(payload.valorAbsorcao || 0);
  const percent  = Number(payload.percent || 0);
  const final    = Number(payload.custoFinal ?? (bruto - absorcao));

  // ==============================
  // PREENCHER CAMPOS
  // ==============================

  window.__MONTAGEM_BRUTA = bruto;
  window.__MONTAGEM_DESCONTO = absorcao;
  window.__MONTAGEM_FINAL = final;
  window.__RESUMO_MONTAGEM = final;
  qtdEl.innerText = String(qtd);

  // 🔹 Valor Bruto
  custoEl.innerText = bruto.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  infoEl.innerText = payload?.info || "—";

  // 🔹 Absorção Empresa (VERDE PADRONIZADO)
  descontoEl.innerText = `- ${absorcao.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  })} (${percent}%)`;

  colorirValor(descontoEl,-absorcao);
  colorirValor(custoEl,bruto);
  descontoEl.style.fontWeight = "600";

valorFinalEl.innerText = final.toLocaleString("pt-BR",{
  style:"currency",
  currency:"BRL"
});

valorFinalEl.style.fontSize = "15px";
valorFinalEl.style.fontWeight = "700";
colorirValor(valorFinalEl,final);

if(typeof window.__ATUALIZAR_FRETE_CARD === "function"){
  window.__ATUALIZAR_FRETE_CARD();
}else{
  window.atualizarResumoGlobal?.();
}
}
