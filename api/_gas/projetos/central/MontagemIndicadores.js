/* Uniforme e atraso vêm do registro da equipe no cronograma, nunca de ocorrências. */
function operacaoMontagemIndicadores_(mes) {
  const etapas = operacaoValores_(OPERACAO_CRONOGRAMA_ID,'Cronograma');
  const registros = operacaoValores_(OPERACAO_CRONOGRAMA_ID,'EquipeTerceirizada');
  const porEtapa = {};
  registros.slice(1).forEach(function(l){ if(!porEtapa[String(l[1])]) porEtapa[String(l[1])] = l; });
  const resultado = {semUniforme:0,atraso:0,uniformePendente:0,localPendente:0,semRegistro:0,horarioPendente:0};
  etapas.slice(1).forEach(function(e){
    if(String(e[0] || '').indexOf('TESTE_MONTADOR_') === 0 || String(e[11] || '').indexOf('[TESTE_APP_MONTADOR]') >= 0)return;
    if(operacaoMesDe_(e[6]) !== mes || !/^(montagem|desmontagem)$/.test(operacaoTexto_(e[5]))) return;
    const r = porEtapa[String(e[0])];
    if(!r || !r[10]) {
      let data = e[6] instanceof Date ? Utilities.formatDate(e[6],Session.getScriptTimeZone(),'yyyy-MM-dd') : String(e[6] || '');
      const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(br) data=br[3]+'-'+br[2]+'-'+br[1];
      const hora = e[7] instanceof Date ? Utilities.formatDate(e[7],Session.getScriptTimeZone(),'HH:mm') : String(e[7] || '');
      const hm=hora.match(/^(\d{1,2}):(\d{2})/);
      const previsto=hm ? new Date(data+'T'+('0'+hm[1]).slice(-2)+':'+hm[2]+':00-03:00') : null;
      if(previsto && previsto.getTime() <= Date.now()) resultado.semRegistro++;
      return;
    }
    const uniforme = operacaoTexto_(r[14]);
    if(uniforme === 'nao') resultado.semUniforme++;
    else if(uniforme !== 'sim') resultado.uniformePendente++;
    // Somente envios novos possuem o horário previsto preservado e o GPS exigido.
    if(r[20] === 'CHEGADA_V1' && r[15]) {
      if(Number(r[16]) > 0) resultado.atraso++;
    } else resultado.horarioPendente++;
    if(r[17] !== 'NO_LOCAL') resultado.localPendente++;
  });
  return resultado;
}
