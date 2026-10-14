const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {linhasFuncionarios}=require('../api/_gas/rh-cadastro');
function ambiente(){
 const ctx={exigirAcessoCentral_(){},PropertiesService:{getScriptProperties(){return {getProperty(){return null;}}}},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest(_,value){return [...crypto.createHash('sha256').update(value).digest()];}}};
 vm.createContext(ctx);
 for(const name of ['OperacaoCentral.js','CienciaDanos.js'])vm.runInContext(fs.readFileSync('api/_gas/projetos/central/'+name,'utf8'),ctx);
 return ctx;
}
test('cadastro único preserva CPF, salário, admissão e status nas leituras antigas',()=>{
 const rows=linhasFuncionarios('1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo',[{nome:'Ana Silva',cpf:'01234567890',setor:'Triagem',salario_bruto:2500,data_admissao:'2026-01-02',ativo:false}]);
 assert.equal(rows[1][2],'01234567890');assert.equal(rows[1][5],2500);assert.equal(rows[1][7],'Inativo');
});
test('pendente e contestado não descontam nem prejudicam a meta; confirmado desconta somente da equipe indicada',()=>{
 const ctx=ambiente();const calc=ctx.operacaoCalcular_;ctx.operacaoCalcular_=d=>d;const input=ctx.operacaoCalcularExemplo();
 input.danos=[{id:'1',local:'montagem',quantidade:2,reposicaoTotal:1000,ciencia:{status:'pendente'}}];
 for(const status of ['pendente','contestado','confirmado']){
  input.danos[0].ciencia.status=status;const r=calc(input);const eq=r.equipes.find(x=>x.chave==='montagem');
  assert.equal(eq.desconto,status==='confirmado'?50:0);assert.equal(eq.indicadores.find(x=>x.nome==='Sem uniforme').valor,0);assert.equal(eq.indicadores.some(x=>x.nome==='Itens danificados'),false);
  assert.equal(r.equipes.find(x=>x.chave==='carregamento').desconto,0);
 }
});
test('mudança nos dados relevantes exige nova ciência',()=>{
 const ctx=ambiente();const l=Array(23).fill('');l[0]='OS_1';l[4]=5479;l[5]='Mesa';l[6]=1;l[12]='Montagem';l[14]='Pé quebrado';l[18]=1000;
 const ciencia={dano_id:'OS_1',equipe:'montagem',status:'confirmado',assinatura:ctx.cienciaDanoAssinatura_(l)};
 assert.equal(ctx.cienciaDanoDaLinha_(l,[ciencia]).status,'confirmado');l[6]=2;
 assert.equal(ctx.cienciaDanoDaLinha_(l,[ciencia]).status,'pendente');
});
test('Produção não entra no desconto; registros antigos preservam a regra histórica',()=>{
 const ctx=ambiente();ctx.Acervo={ciencias(){return []}};ctx.operacaoMesDe_=()=> '2026-10';
 ctx.operacaoValores_=()=>[[],...['Triagem','Carregamento','Montagem','Produção','Evento','Dano Interno'].map((s,i)=>{const l=Array(23).fill('');l[0]='OS_'+i;l[4]=i;l[6]=1;l[12]=s;l[18]=100;return l;})];
 const danos=ctx.operacaoDanosMes_('2026-10');assert.equal(danos.length,5);assert.equal(danos[0].ciencia.status,'pendente');assert.equal(danos[3].ciencia.status,'legado');
});
test('atalhos antigos não mantêm uma segunda implementação de cadastro',()=>{
 for(const [file,names] of [['api/_gas/projetos/almoxarifado/Code.js',['buscarUsuarios','salvarUsuario']],['Modulos/Configuracoes/Permissoes/permissoes.js',['createUser']],['Modulos/Chiavari/Almoxarifado/almoxarifado.html',['salvarUsuarioFront']]]){
  const s=fs.readFileSync(file,'utf8');
  for(const name of names)assert.equal([...s.matchAll(new RegExp('^[ \\t]*(?:async )?function '+name+'\\(','gm'))].length,1,file+' '+name);
 }
});
test('recusa confirmação quando os dados vistos já não correspondem ao dano atual',()=>{
 const ctx=ambiente();const l=Array(23).fill('');l[0]='OS_1';l[12]='Montagem';
 ctx.getSheet=()=>({getDataRange:()=>({getValues:()=>[[],l]})});
 assert.throws(()=>ctx.danoCienciaResponder('OS_1','pessoa','0123','confirmar','','assinatura-anterior'),/alterados/);
});
