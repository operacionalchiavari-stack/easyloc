const MONT_APONTAMENTOS_ABA = 'Montador_Apontamentos';
function MONT_apontamentosAba_(criar){
  const ss=SpreadsheetApp.openById(FREE_SPREADSHEET_ID);
  let sh=ss.getSheetByName(MONT_APONTAMENTOS_ABA);
  if(!sh && criar){
    sh=ss.insertSheet(MONT_APONTAMENTOS_ABA);
    sh.appendRow(['ID','Responsável','Etapa','Pedido','Início','Fim','Status']);
  }
  return sh;
}
function MONT_apontamentoObjeto_(l){
  return {id:String(l[0]),nome:String(l[1]),idEtapa:String(l[2]),pedido:String(l[3]),inicio:String(l[4]),fim:String(l[5]||''),status:String(l[6])};
}
function MONT_apontamentoDaSessao_(sessao){
  const sh=MONT_apontamentosAba_(false);
  if(!sh)return null;
  const linhas=sh.getDataRange().getValues();
  for(let i=linhas.length-1;i>0;i--){
    if(String(linhas[i][1])===sessao.nome && linhas[i][6]==='ATIVO')return MONT_apontamentoObjeto_(linhas[i]);
  }
  return null;
}
function MONT_apontamentoAtual(token){return MONT_apontamentoDaSessao_(MONT_autenticar_(token));}
function MONT_exigirApontamento_(token,idEtapa,idApontamento){
  const atual=MONT_apontamentoAtual(token);
  if(!atual || atual.idEtapa!==String(idEtapa) || (idApontamento && atual.id!==String(idApontamento)))throw new Error('Inicie este evento no cronograma antes de enviar. O apontamento pode ter sido encerrado em outro aparelho.');
  if(typeof Acervo !== 'undefined' && Acervo.validarEtapaCampo) Acervo.validarEtapaCampo(idEtapa);
  return atual;
}
function MONT_iniciarApontamento(token,idEtapa){
  const sessao=MONT_autenticar_(token);
  const etapa=getEtapaOperacao(idEtapa);
  if(!etapa || !MONT_podeVer_(sessao,etapa))throw new Error('Você não tem acesso a esta etapa.');
  if(!MONT_ehOperacao_(etapa.etapa))throw new Error('O apontamento está disponível para montagem e desmontagem.');
  if(typeof Acervo !== 'undefined' && Acervo.validarEtapaCampo) Acervo.validarEtapaCampo(idEtapa);
  return FREE_comLock_(function(){
    const atual=MONT_apontamentoDaSessao_(sessao);
    if(atual){
      if(atual.idEtapa===String(idEtapa))return atual;
      throw new Error('Encerre o evento em andamento antes de iniciar outro.');
    }
    const linha=[Utilities.getUuid(),sessao.nome,String(etapa.id),String(etapa.pedido||''),new Date().toISOString(),'','ATIVO'];
    MONT_apontamentosAba_(true).appendRow(linha);
    return MONT_apontamentoObjeto_(linha);
  });
}
function MONT_finalizarApontamento(token,id){
  const sessao=MONT_autenticar_(token);
  return FREE_comLock_(function(){
    const sh=MONT_apontamentosAba_(false);
    if(!sh)throw new Error('Apontamento não encontrado.');
    const linhas=sh.getDataRange().getValues();
    for(let i=1;i<linhas.length;i++){
      const l=linhas[i];
      if(String(l[0])!==String(id) || String(l[1])!==sessao.nome)continue;
      if(l[6]==='ATIVO'){
        l[5]=new Date().toISOString();l[6]='ENCERRADO';
        sh.getRange(i+1,6,1,2).setValues([[l[5],l[6]]]);
      }
      return MONT_apontamentoObjeto_(l);
    }
    throw new Error('Apontamento não encontrado para este responsável.');
  });
}
