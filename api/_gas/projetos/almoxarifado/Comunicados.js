function enviarComunicadoPortal(dados){
  if(!Acervo.pode('estoque.almoxarifado.visualizar')) throw new Error('Sem acesso ao Almoxarifado.');
  dados = dados || {};
  const titulo = String(dados.titulo || '').trim();
  const texto = String(dados.texto || '').trim();
  if(!titulo || !texto) throw new Error('Informe o título e a orientação.');
  if(titulo.length > 120 || texto.length > 1200) throw new Error('Título ou orientação muito longos.');
  const validade = String(dados.validoAte || '');
  if(validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error('Validade inválida.');
  const ss = SpreadsheetApp.openById('133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk');
  let aba = ss.getSheetByName('Mural_Avisos');
  if(!aba){
    aba = ss.insertSheet('Mural_Avisos');
    aba.appendRow(['ID','Título','Texto','Prioridade','Fixado','Válido até','Publicado por','Publicado em']);
  }
  const usuario = Acervo.usuario();
  aba.appendRow(['AVI_' + Utilities.getUuid().slice(0,8), titulo, texto, dados.importante ? 'IMPORTANTE' : 'INFO', '', validade, 'Almoxarifado · ' + (usuario.nome || usuario.email || ''), Utilities.formatDate(new Date(),'America/Sao_Paulo','dd/MM/yyyy HH:mm:ss')]);
  return {ok:true};
}
