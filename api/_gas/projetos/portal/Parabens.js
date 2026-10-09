function MURAL_parabensAba_(){
  const ss=SpreadsheetApp.openById(PORTAL_SHEET_ID);
  let aba=ss.getSheetByName('Mural_Parabens');
  if(!aba){aba=ss.insertSheet('Mural_Parabens');aba.appendRow(['ID','Destinatário','Mês','Autor ID','Autor','Mensagem','Data','Foto']);}
  else aba.getRange(1,8).setValue('Foto');
  return aba;
}
function MURAL_parabensLer_(id){
  const aba=MURAL_parabensAba_();
  const mes=Utilities.formatDate(new Date(),'America/Sao_Paulo','yyyy-MM');
  if(aba.getLastRow()<2)return [];
  return aba.getDataRange().getValues().slice(1).filter(r=>String(r[1])===String(id)&&r[2]===mes).slice(-30).reverse().map(r=>({autorId:r[3],autor:r[4],texto:r[5],data:r[6],foto:r[7] || ''}));
}
function MURAL_enviarParabens_(id,texto,autor){
  texto=String(texto || '').trim();
  if(!texto || texto.length>300)throw new Error('Escreva uma mensagem de até 300 caracteres.');
  if(!autor || !autor.id)throw new Error('Entre no sistema para enviar.');
  const c=MURAL_ler_('colaboradores').find(x=>x.v[0]===id && x.v[6]!=='NAO');
  const mes=Utilities.formatDate(new Date(),'America/Sao_Paulo','MM');
  if(!c || String(c.v[3]).slice(3,5)!==mes)throw new Error('Aniversariante indisponível.');
  MURAL_parabensAba_().appendRow([Utilities.getUuid(),id,Utilities.formatDate(new Date(),'America/Sao_Paulo','yyyy-MM'),autor.id,autor.nome,texto,MURAL_agora_(),autor.foto || '']);
  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return MURAL_parabensLer_(id);
}
