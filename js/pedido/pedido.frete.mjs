import { renderizarFreteCard } from "./pedido.ui-frete.mjs?v=20261031-ajuste-compacto";
import { atualizarMontagemSugerida } from "./pedido.montagem.mjs?v=20261107-teste-usuario";

export function initFrete(ctx){

  const supabase = ctx.supabase;
  let revisao = 0;
  // Categorias de caminhão quase nunca mudam: guardadas por 5 minutos (antes cada recálculo do frete ia ao banco,
  // várias vezes por troca de aba). Chamadas ao mesmo tempo esperam a mesma busca.
  let cacheCategorias = null;
  const buscarCategorias = (empresaId) => {
    if(cacheCategorias && cacheCategorias.empresa === empresaId && Date.now() - cacheCategorias.em < 300000) return cacheCategorias.promessa;
    const promessa = supabase.from("categorias_caminhao").select("id, nome, volume_maximo, valor_km, ativo")
      .eq("empresa_id", empresaId).eq("ativo", true)
      .then(r => { if(r.error) cacheCategorias = null; return r; });
    cacheCategorias = { empresa: empresaId, em: Date.now(), promessa };
    return promessa;
  };
  // A distância se ajusta na própria caixinha "Distância" da linha do Frete (out/2026): clicar mostra o campo,
  // Enter ou sair confirma, Esc desiste.
  const chipKm = document.querySelector(".frete-km-chip");
  const campoKm = document.getElementById("freteKmManual");
  const textoKm = document.getElementById("freteDistanciaKm");
  if(chipKm && campoKm && textoKm){
    let antes = "";
    const fechar = () => { campoKm.hidden = true; textoKm.hidden = false; chipKm.classList.remove("is-editando"); };
    chipKm.tabIndex = 0;
    chipKm.setAttribute("role", "button");
    const abrir = () => {
      if(!campoKm.hidden) return;
      antes = campoKm.value || String(window.kmPedido || "");
      campoKm.value = antes;
      textoKm.hidden = true; campoKm.hidden = false; chipKm.classList.add("is-editando");
      campoKm.focus(); campoKm.select();
    };
    chipKm.addEventListener("click", abrir);
    chipKm.addEventListener("keydown", e => { if(e.target === chipKm && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); abrir(); } });
    campoKm.addEventListener("keydown", e => {
      if(e.key === "Enter"){ e.preventDefault(); campoKm.blur(); }
      if(e.key === "Escape"){ campoKm.value = antes; fechar(); chipKm.focus(); }
    });
    campoKm.addEventListener("blur", fechar);
  }
  document.getElementById("freteKmManual")?.addEventListener("change", event => {
    const km = Number(event.target.value);
    if(!Number.isFinite(km) || km < 0) return;
    window.kmPedido = km;
    const label = document.getElementById("freteDistanciaKm");
    if(label) label.innerText = km + " km";
    window.calcularFreteInteligente?.();
  });

  window.calcularFreteInteligente = async function(){

    const atual = ++revisao;
    const volumeTotal = Number(window.volumeTotalPedido || 0);
    const distanciaKm = Number(window.kmPedido || 0);
    const empresaId = window.__CONTEXT?.empresa_id;

    if(!empresaId || volumeTotal <= 0){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

    const { data: categorias, error } = await buscarCategorias(empresaId);

    if(atual !== revisao) return;
    if(error || !categorias?.length){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

    const cats = categorias.map(c => ({
      nome: c.nome,
      cap: Number(c.volume_maximo || 0),
      valorKm: Number(c.valor_km || 0)
    })).filter(c => c.cap > 0 && Number.isFinite(c.cap) && c.valorKm >= 0);
    if(!cats.length){
      await renderizarFreteCard(null);
      await atualizarMontagemSugerida(empresaId, []);
      return;
    }

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

    function rec(usados, somaCap, somaValorKm, contagens, inicio = 0){

      if(somaCap >= volumeTotal){
        const custoTotal = somaValorKm * (distanciaKm > 0 ? distanciaKm : 1);
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
      if(melhor && somaValorKm * (distanciaKm > 0 ? distanciaKm : 1) > melhor.custoTotal) return;

      for(let i = inicio; i < cats.length; i++){
        const c = cats[i];
        contagens[c.nome] = (contagens[c.nome] || 0) + 1;

        rec(
          usados + 1,
          somaCap + c.cap,
          somaValorKm + c.valorKm,
          contagens, i
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

    const valorBrutoFrete = distanciaKm > 0 ? melhor.custoTotal : 0;

    const percentFrete = Number(window.__ABS_FRETE_PERCENT || 0);
    const valorAbsorcaoFrete = valorBrutoFrete * (percentFrete / 100);
    const valorFinalFrete = valorBrutoFrete - valorAbsorcaoFrete;

    const resumo = { 
      caminhoes: lista,
      distanciaPendente: distanciaKm <= 0,
      volumeTotal,
      capacidadeTotal: volumeTotal + melhor.excesso, 
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