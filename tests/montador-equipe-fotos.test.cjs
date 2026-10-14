const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('equipe recebe miniaturas dos cadastros dos free confirmados, sem dados de acesso',()=>{
 let ids;
 const pessoa={idFree:'free-1',nome:'Carlos',telefone:'',status:'CONFIRMADO',token:'privado'};
 const ctx={FREE_INS_CONFIRMADO:'CONFIRMADO',FREE_VAGA_CANCELADA:'CANCELADA',FREE_lerVagas_:()=>[{idVaga:'vaga',idEtapa:'etapa',status:'ABERTA',quantidade:2}],FREE_lerInscricoes_:()=>[pessoa,{idFree:'free-2',status:'CANCELADO'}],FREE_agruparInscricoes_:()=>({vaga:[pessoa]}),FREE_mapaPontuacoes_:()=>({'free-1':{nota:5}}),FREE_mapaMiniaturas_:valores=>{ids=valores;return {'free-1':'data:image/png;base64,miniatura'};},FREE_fasePresenca_:()=> 'CHECKIN'};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/cronograma/Montador.js','utf8'),ctx);
 const resultado=ctx.MONT_freePorEtapa_();
 assert.deepEqual(Array.from(ids),['free-1']);assert.equal(resultado.etapa.pessoas[0].miniatura,'data:image/png;base64,miniatura');assert.equal(JSON.stringify(resultado).includes('privado'),false);
});
