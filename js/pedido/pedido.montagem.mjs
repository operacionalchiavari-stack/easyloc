import { renderMontagemSugerida } from "./pedido.ui-montagem.mjs";

function _parseCombToMap(str){
  const s = String(str || "").toUpperCase().replace(/\s+/g, "");
  const partes = s.match(/(\d*[A-Z]+)/g) || [];
  const map = {};
  for(const p of partes){
    const m = p.match(/^(\d+)?([A-Z]+)/);
    if(!m) continue;
    const qtd = m[1] ? parseInt(m[1],10) : 1;
    const tipo = m[2];
    map[tipo] = (map[tipo] || 0) + qtd;
  }
  return map;
}

function normalizarCombinacao(str){
  const ordem = ["P","M","G","XL"];
  const map = _parseCombToMap(str);
  const out = [];

  for(const k of ordem){
    if(map[k]){
      out.push(map[k] > 1 ? `${map[k]}${k}` : k);
      delete map[k];
    }
  }

  Object.keys(map).sort().forEach(k=>{
    out.push(map[k] > 1 ? `${map[k]}${k}` : k);
  });

  return out.join(" + ");
}

function combinacaoCobre(regraNorm, pedidoNorm){
  const r = _parseCombToMap(regraNorm);
  const p = _parseCombToMap(pedidoNorm);
  return Object.keys(r).every(k => (p[k] || 0) >= r[k]);
}

function scoreEspecificidade(combNorm){
  const m = _parseCombToMap(combNorm);
  return Object.values(m).reduce((a,b)=>a+b,0);
}

function montarCombinacaoDoFrete(listaCaminhoes){
  const ordem = ["P","M","G","XL"];
  const map = {};

  (listaCaminhoes || []).forEach(c=>{
    const nome = String(c.nome || "").toUpperCase().trim();
    const qtd = Number(c.quantidade || 0);
    if(!nome || qtd <= 0) return;
    map[nome] = (map[nome] || 0) + qtd;
  });

  const out = [];
  for(const k of ordem){
    if(map[k]){
      out.push(map[k] > 1 ? `${map[k]}${k}` : k);
      delete map[k];
    }
  }
  Object.keys(map).sort().forEach(k=>{
    out.push(map[k] > 1 ? `${map[k]}${k}` : k);
  });

  return out.join(" + ");
}

async function sugerirMontagemPorCombinacao(empresaId, combinacaoPedido){
  if(!empresaId || !combinacaoPedido) return null;

  const pedidoNorm = normalizarCombinacao(combinacaoPedido);

  const { data: regras, error } = await window.supabaseClient
    .from("categorias_montagem")
    .select("id, combinacao, qtd_montadores, ordem, ativo")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if(error){
    console.error("❌ Erro ao buscar categorias_montagem:", error);
    return null;
  }

  const regrasNorm = (regras || []).map(r => ({
    ...r,
    comb_norm: normalizarCombinacao(r.combinacao)
  }));

  const exata = regrasNorm.find(r => r.comb_norm === pedidoNorm);
  if(exata){
    return { match:"exato", pedidoNorm, regra: exata };
  }

  const candidatas = regrasNorm.filter(r => combinacaoCobre(r.comb_norm, pedidoNorm));
  if(!candidatas.length){
    return { match:"nenhum", pedidoNorm, regra:null };
  }

  candidatas.sort((a,b)=> scoreEspecificidade(b.comb_norm) - scoreEspecificidade(a.comb_norm));
  return { match:"fallback", pedidoNorm, regra: candidatas[0] };
}

async function obterConfigMontagem(empresaId){
  window.__MONTAGEM_CONFIG_CACHE = window.__MONTAGEM_CONFIG_CACHE || {};
  if(window.__MONTAGEM_CONFIG_CACHE[empresaId]) return window.__MONTAGEM_CONFIG_CACHE[empresaId];

  const { data, error } = await window.supabaseClient
    .from("empresas_configuracoes")
    .select("montagem_minima, montagem_maxima, diaria_montador")
    .eq("empresa_id", empresaId)
    .single();

  if(error){
    console.error("❌ Erro ao buscar empresas_configuracoes (montagem):", error);
    window.__MONTAGEM_CONFIG_CACHE[empresaId] = { montagem_minima:0, montagem_maxima:0, diaria_montador:0 };
    return window.__MONTAGEM_CONFIG_CACHE[empresaId];
  }

  const cfg = {
    montagem_minima: Number(data?.montagem_minima || 0),
    montagem_maxima: Number(data?.montagem_maxima || 0),
    diaria_montador: Number(data?.diaria_montador || 0),
  };

  window.__MONTAGEM_CONFIG_CACHE[empresaId] = cfg;
  return cfg;
}

function calcularCustoMontagem(qtdMontadores, cfg){
  const diaria = Number(cfg?.diaria_montador || 0);
  const min = Number(cfg?.montagem_minima || 0);
  const max = Number(cfg?.montagem_maxima || 0);

  let custo = qtdMontadores * diaria;
  if(min > 0) custo = Math.max(min, custo);
  if(max > 0) custo = Math.min(max, custo);

  return custo;
}

export async function atualizarMontagemSugerida(empresaId, caminhoesLista){

  try{
    if(!empresaId){
      renderMontagemSugerida({ qtd:null, custoFmt:"—", info:"—" });
      return;
    }

    const combinacaoFrete = montarCombinacaoDoFrete(caminhoesLista || []);
    const combNorm = normalizarCombinacao(combinacaoFrete);

    const sugestao = await sugerirMontagemPorCombinacao(empresaId, combinacaoFrete);

    if(!sugestao || !sugestao.regra){
      renderMontagemSugerida({
        qtd: null,
        custoFmt: "—",
        info: `Combinação: ${combNorm} • Nenhuma regra encontrada`
      });
      return;
    }

    const cfg = await obterConfigMontagem(empresaId);
    const qtd = Number(sugestao.regra.qtd_montadores || 0);

    const custoBruto = calcularCustoMontagem(qtd, cfg);

    // ==============================
    // APLICA ABSORÇÃO FINANCEIRA
    // ==============================
const percentMontagem = Number(window.__ABS_MONTAGEM_PERCENT ?? 0);

console.log("🔎 Percent montagem:", percentMontagem);

const valorAbsorcaoMontagem = custoBruto * (percentMontagem / 100);
const custoFinal = custoBruto - valorAbsorcaoMontagem;

console.log("💰 Montagem:", {
  bruto: custoBruto,
  absorcao: valorAbsorcaoMontagem,
  final: custoFinal
});
window.__RESUMO_MONTAGEM = custoFinal;

window.__MONTAGEM_BRUTA = custoBruto;
window.__MONTAGEM_DESCONTO = valorAbsorcaoMontagem;
window.__MONTAGEM_FINAL = custoFinal;

// dispara atualização do resumo geral
window.atualizarResumoGlobal?.();

renderMontagemSugerida({
  qtd,
  custoFmt: custoFinal.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }),
  info: `Combinação: ${combNorm} • Match: ${sugestao.match === "exato" ? "exato" : "fallback"}`,
  custoBruto: custoBruto,
  valorAbsorcao: valorAbsorcaoMontagem,
  percent: percentMontagem
});

  }catch(err){
    console.error("❌ Erro ao sugerir montagem:", err);
    renderMontagemSugerida({ qtd:null, custoFmt:"—", info:"Erro ao sugerir montagem" });
  }
}