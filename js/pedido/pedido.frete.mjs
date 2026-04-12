import { renderizarFreteCard } from "./pedido.ui-frete.mjs";
import { atualizarMontagemSugerida } from "./pedido.montagem.mjs";

export function initFrete(ctx){

  const supabase = ctx.supabase;

  window.calcularFreteInteligente = async function(){

    const volumeTotal = Number(window.volumeTotalPedido || 0);
    const distanciaKm = Number(window.kmPedido || 0);
    const empresaId = window.__CONTEXT?.empresa_id;

    if(!empresaId || volumeTotal <= 0 || distanciaKm <= 0){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

    const { data: categorias, error } = await supabase
      .from("categorias_caminhao")
      .select("id, nome, volume_maximo, valor_km, ativo")
      .eq("empresa_id", empresaId)
      .eq("ativo", true);

    if(error || !categorias?.length){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

    const cats = categorias.map(c => ({
      nome: c.nome,
      cap: Number(c.volume_maximo || 0),
      valorKm: Number(c.valor_km || 0)
    })).filter(c => c.cap > 0);

    let melhor = null;

    const maxTeorico = Math.ceil(volumeTotal / Math.min(...cats.map(c => c.cap)));
    const LIMITE_MAX_CAMINHOES = 50;

    if(maxTeorico > LIMITE_MAX_CAMINHOES){
      window.abrirModalAvisoFrete?.(
        "O volume do pedido é muito alto para cálculo completo. " +
        "Aplicamos um limite de segurança para manter o sistema rápido e estável."
      );
    }

    const maxPossivel = Math.min(maxTeorico, LIMITE_MAX_CAMINHOES);

    function rec(usados, somaCap, somaValorKm, contagens){

      if(somaCap >= volumeTotal){
        const custoTotal = somaValorKm * distanciaKm;
        const excesso = somaCap - volumeTotal;

        if(!melhor){
          melhor = { contagens:{...contagens}, custoTotal, usados, excesso };
        } else {
          if(
            custoTotal < melhor.custoTotal ||
            (custoTotal === melhor.custoTotal && usados < melhor.usados) ||
            (custoTotal === melhor.custoTotal && usados === melhor.usados && excesso < melhor.excesso)
          ){
            melhor = { contagens:{...contagens}, custoTotal, usados, excesso };
          }
        }
        return;
      }

      if(usados >= maxPossivel) return;

      for(let c of cats){
        contagens[c.nome] = (contagens[c.nome] || 0) + 1;

        rec(
          usados + 1,
          somaCap + c.cap,
          somaValorKm + c.valorKm,
          contagens
        );

        contagens[c.nome]--;
        if(contagens[c.nome] === 0) delete contagens[c.nome];
      }
    }

    rec(0, 0, 0, {});

    if(!melhor){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

    const lista = Object.entries(melhor.contagens).map(([nome, quantidade]) => {
      const cat = cats.find(c => c.nome === nome);
      return {
        nome,
        quantidade,
        valorKm: cat?.valorKm || 0
      };
    });

    // ==============================
    // APLICA ABSORÇÃO FINANCEIRA
    // ==============================

    const valorBrutoFrete = melhor.custoTotal;

    const percentFrete = Number(window.__ABS_FRETE_PERCENT || 0);
    const valorAbsorcaoFrete = valorBrutoFrete * (percentFrete / 100);
    const valorFinalFrete = valorBrutoFrete - valorAbsorcaoFrete;

    const resumo = { 
      caminhoes: lista, 
      totalFrete: valorFinalFrete,
      freteBruto: valorBrutoFrete,
      freteAbsorcao: valorAbsorcaoFrete,
      fretePercent: percentFrete
    };

    await renderizarFreteCard(resumo);

    // Montagem sempre atualiza após frete
    await atualizarMontagemSugerida(empresaId, resumo.caminhoes || []);
  };
}