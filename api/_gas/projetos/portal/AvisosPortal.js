function MURAL_publicarAviso_(dados){
  const usuario=Acervo.usuario();
  if(!usuario)throw new Error('Entre no sistema para publicar.');
  dados=dados || {};
  const titulo=String(dados.titulo || '').trim(),texto=String(dados.texto || '').trim();
  if(!titulo || !texto || titulo.length>120 || texto.length>1200)throw new Error('Informe título (até 120 caracteres) e texto (até 1200 caracteres).');
  const validade=String(dados.validoAte || '');
  if(validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade))throw new Error('Validade inválida.');
  const cor=['neutro','areia','verde','azul','lavanda'].includes(dados.cor)?dados.cor:'neutro';
  const aba=MURAL_aba_('avisos');
  aba.getRange(1,9).setValue('Cor');
  aba.appendRow(['AVI_'+Utilities.getUuid().slice(0,8),titulo,texto,dados.importante?'IMPORTANTE':'INFO',dados.fixado?'SIM':'',validade,usuario.nome || usuario.email,MURAL_agora_(),cor]);
  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return {ok:true};
}
function MURAL_corAviso_(dados){
  if(!Acervo.usuario())throw new Error('Entre no sistema.');
  if(!dados || !['neutro','areia','verde','azul','lavanda'].includes(dados.cor))throw new Error('Cor inválida.');
  const aviso=MURAL_ler_('avisos').find(x=>x.v[0]===dados.id);
  if(!aviso)throw new Error('Aviso não encontrado.');
  const aba=MURAL_aba_('avisos');aba.getRange(1,9).setValue('Cor');aba.getRange(aviso.linha,9).setValue(dados.cor);
  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return {ok:true};
}
