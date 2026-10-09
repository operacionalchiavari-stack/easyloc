// Resumo agregado para o portal: não divulga salários, bônus ou ocorrências individuais.
// O sufixo _ impede chamada direta pelo endpoint público /api/gs.
function PORTAL_metasSetores_(){
  liberarAcessoInterno_();
  const mes = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM");
  const cache = CacheService.getScriptCache();
  const chave = "portal-metas-setores-" + mes;
  const guardado = cache.get(chave);
  if(guardado) return JSON.parse(guardado);
  const setores = {};
  const avisos = [];
  function key(nome){ return String(nome || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function cadastrar(nome){
    const k = key(nome);
    if(!k) return null;
    if(!setores[k]) setores[k] = { setor:String(nome).trim(), status:null, indicadores:[], motivo:"Sem meta cadastrada" };
    return setores[k];
  }
  function indicador(nome,real,meta,unidade,menor,estrito){
    const r = Number(real), m = Number(meta);
    if(!Number.isFinite(r) || !Number.isFinite(m)) return { nome:nome, real:null, meta:meta, unidade:unidade, atingiu:null };
    return { nome:nome, real:r, meta:m, unidade:unidade, atingiu:menor ? (estrito ? r < m : r <= m) : r >= m };
  }
  try {
    const sh = SpreadsheetApp.openById(COMISSAO_FUNCIONARIOS_PLANILHA_ID).getSheetByName("Funcionarios");
    if(sh) sh.getDataRange().getValues().slice(1).forEach(l => cadastrar(l[3]));
  } catch(e){ avisos.push("Não foi possível conferir o cadastro de setores."); }
  try {
    calcularStatusSetores(mes).forEach(r => {
      const s = cadastrar(r.setor); if(!s) return;
      [["Produção",r.producao,r.metaProducao,"itens",false], ["Qualidade",r.qualidade,r.metaQualidade,"%",false], ["Prazo",r.prazo,r.metaPrazo,"%",false], ["Tempo",r.tempo,r.metaTempo,"dias",true]].forEach(i => {
        if(Number(i[2]) > 0) s.indicadores.push(indicador.apply(null,i));
      });
      if(s.indicadores.length){
        s.indicadores.push(indicador("Uso do teto de gastos",r.gasto,r.metaGasto,"%",true,true));
        s.status = r.status === true; s.motivo = "";
      }
    });
  } catch(e){
    ["Marcenaria","Acabamento e Pintura","Solda","Costura","Forração","Limpeza de Estofados"].forEach(nome => { cadastrar(nome).motivo = "Resultados indisponíveis"; });
    avisos.push("Resultados operacionais indisponíveis no momento.");
  }
  const almox = cadastrar("Almoxarifado");
  try {
    const dados = getMetasAlmoxarifadoCentral(mes);
    const r = dados.atual;
    if(r && (dados.historico || []).some(h => h.mes === r.mes)){
      almox.indicadores = [indicador("Contagem",r.metaContagem,100,"%",false),indicador("Assertividade",r.assertividade,85,"%",false),indicador("Uso do teto de gastos",r.tetoGasto,100,"%",true)];
      almox.status = r.status === true; almox.motivo = "";
    }
  } catch(e){ almox.motivo = "Resultados indisponíveis"; avisos.push("Resultados do Almoxarifado indisponíveis no momento."); }
  const resultado = { mes:mes, atualizadoEm:new Date().toISOString(), setores:Object.keys(setores).map(k=>setores[k]).sort((a,b)=>a.setor.localeCompare(b.setor)), avisos:avisos };
  if(!avisos.length) cache.put(chave,JSON.stringify(resultado),60);
  return resultado;
}
