/* Ciência individual: cadastro e PIN exclusivamente no RH. */
function cienciaDanoEquipe_(valor){
  const equipe = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return ['triagem','carregamento','montagem','producao'].indexOf(equipe)>=0 ? equipe : '';
}
function cienciaDanoAssinatura_(l){
  const conteudo = JSON.stringify([String(l[0]),l[4],l[5],l[6],l[12],l[13],l[14],l[18]]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,conteudo,Utilities.Charset.UTF_8)
    .map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');
}
function cienciaDanoDaLinha_(l,ciencias){
  const equipe=cienciaDanoEquipe_(l[12]);
  if(!equipe) return {status:'legado',equipe:''};
  const assinatura=cienciaDanoAssinatura_(l);
  const c=(ciencias || []).filter(function(c){return c.dano_id===String(l[0]);})[0];
  if(!c || c.assinatura!==assinatura || c.equipe!==equipe) return {status:'pendente',equipe:equipe,assinatura:assinatura};
  return {status:c.status,equipe:equipe,assinatura:assinatura,nome:c.confirmado_nome,em:c.confirmado_em,justificativa:c.justificativa,
    podeRevisar:typeof Acervo!=='undefined' && Acervo.pode('configuracoes.permissoes.editar')};
}
function danoCienciaRevisar(id,equipe,justificativa){
  if(!Acervo.pode('configuracoes.permissoes.editar')) throw new Error('A revisão da atribuição deve ser feita por um administrador.');
  const k=cienciaDanoEquipe_(equipe);
  if(!k || String(justificativa || '').trim().length<5) throw new Error('Escolha a equipe e explique a revisão.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const sh=getSheet();const linhas=sh.getDataRange().getValues();const indice=linhas.findIndex(function(l,i){return i>0 && String(l[0])===String(id);});
    if(indice<0)throw new Error('O.S. não encontrada');
    const rotulos={triagem:'Triagem',carregamento:'Carregamento',montagem:'Montagem',producao:'Produção'};
    sh.getRange(indice+1,13).setValue(rotulos[k]);linhas[indice][12]=rotulos[k];
    return Acervo.cienciaSalvar({id:String(id),equipe:k,assinatura:cienciaDanoAssinatura_(linhas[indice]),acao:'reabrir',justificativa:String(justificativa)});
  }finally{lock.releaseLock();}
}
function danoCienciaFuncionarios(equipe){
  const k=cienciaDanoEquipe_(equipe);
  if(!k) throw new Error('Equipe inválida');
  return Acervo.funcionarios().filter(function(f){return f.ativo && f.equipe_operacional===k;})
    .map(function(f){return {id:f.id,nome:f.nome,temPin:f.tem_pin};});
}
function danoCienciaResponder(id,funcionarioId,pin,acao,justificativa,assinaturaVista){
  if(['confirmar','contestar'].indexOf(acao)<0) throw new Error('Ação inválida');
  const l=getSheet().getDataRange().getValues().slice(1).filter(function(l){return String(l[0])===String(id);})[0];
  if(!l) throw new Error('O.S. não encontrada');
  if(!assinaturaVista || assinaturaVista!==cienciaDanoAssinatura_(l)) throw new Error('Os dados deste dano foram alterados. Atualize a tabela e confira novamente antes de confirmar.');
  const equipe=cienciaDanoEquipe_(l[12]);
  if(!equipe) throw new Error('Registro anterior à confirmação de ciência');
  return Acervo.cienciaSalvar({id:String(l[0]),equipe:equipe,assinatura:cienciaDanoAssinatura_(l),
    funcionario_id:funcionarioId,pin:String(pin || ''),acao:acao,justificativa:String(justificativa || '')});
}
