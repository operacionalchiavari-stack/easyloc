const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Home usa funcionários do RH, reconhecimentos da Central e não lê a galeria',()=>{
 const ctx={CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},Utilities:{formatDate:()=> '2026-08-15'}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/portal/Mural.js','utf8'),ctx);
 const leituras=[];ctx.MURAL_ler_=tipo=>{leituras.push(tipo);if(tipo!=='avisos')throw Error('Fonte antiga: '+tipo);return [];};
 ctx.MURAL_hojeISO_=()=> '2026-10-14';ctx.MURAL_parabensLer_=()=>[];ctx.MURAL_numerosMes_=()=>null;
 ctx.MURAL_premiacoesCentral_=()=>[{nome:'Ana',titulo:'Meta atingida',data:'2026-10-01'}];
 const r=ctx.MURAL_dadosPublicos_(true,[{id:'rh-ana',nome:'Ana',ativo:true,aniversario:'14/10',admissao:'2026-10-01'},{id:'inativo',nome:'Inativo',ativo:false,aniversario:'14/10'}]);
 assert.deepEqual(leituras,['avisos']);assert.equal(r.aniversariantes.length,1);assert.equal(r.aniversariantes[0].id,'rh-ana');
 assert.equal(r.reconhecimentos[0].titulo,'Meta atingida');assert.equal('galeria' in r,false);
});
test('parabéns valida o aniversariante pelo cadastro recebido do RH',()=>{
 const ctx={MURAL_CACHE_PUBLICO:'fixture',Utilities:{formatDate:(_,__,format)=>format==='MM'?'10':'2026-10'},CacheService:{getScriptCache:()=>({remove(){}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/portal/Parabens.js','utf8'),ctx);
 const gravados=[];ctx.Utilities.getUuid=()=> 'mensagem-teste';ctx.MURAL_agora_=()=> '2026-10-14';ctx.MURAL_parabensAba_=()=>({appendRow:r=>gravados.push(r)});ctx.MURAL_parabensLer_=()=>[];
 const pessoas=[{id:'rh-ana',ativo:true,aniversario:'14/10'}];
 ctx.MURAL_enviarParabens_('rh-ana','Parabéns!',{id:'autor',nome:'Colega'},pessoas);assert.equal(gravados[0][1],'rh-ana');
 assert.throws(()=>ctx.MURAL_enviarParabens_('cadastro-antigo','Parabéns!',{id:'autor'},pessoas),/indisponível/);
});
