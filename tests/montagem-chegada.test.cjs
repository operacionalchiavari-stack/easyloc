const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function chegada(){
 const ctx={MONT_normalizar_:s=>String(s).toLowerCase(),MONT_PERFIL_SUPERVISOR:'SUPERVISOR',MONT_ehResponsavel_:(a,b)=>a===b,MONT_autenticar_:()=>({nome:'Ana',perfil:'RESPONSAVEL'}),calcularDistanciaMetros:()=>20};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/cronograma/EquipeChegada.js','utf8'),ctx);
 const etapa=['etapa','123','','','','montagem','2026-10-14','08:00','','Ana','','','',-23,-46];
 const dados={idCronograma:'etapa',token:'sessao',foto:'foto',latitude:-23,longitude:-46,precisaoGPS:10};
 return {ctx,etapa,dados,enviar:()=>ctx.MONT_prepararChegada_(dados,[[],etapa],new Date('2026-10-14T08:20:00-03:00'))};
}
test('08:00 previsto e 08:20 recebido gera vinte minutos, com previsão preservada',()=>{
 const f=chegada(),r=f.enviar();assert.equal(r.atraso,20);assert.equal(r.previsto,'2026-10-14T11:00:00.000Z');assert.equal(r.localStatus,'NO_LOCAL');
 f.dados.horario='08:00';assert.equal(f.enviar().atraso,20);
});
test('foto, GPS preciso e responsável correto são obrigatórios',()=>{
 for(const [campo,valor] of [['foto',''],['latitude',''],['longitude',999],['precisaoGPS',500],['token','']]){
  const f=chegada();f.dados[campo]=valor;assert.throws(f.enviar);
 }
 const f=chegada();f.etapa[9]='Outra pessoa';assert.throws(f.enviar,/responsável/);
});
test('fora do evento e evento sem coordenadas nunca aparecem como presença validada',()=>{
 const f=chegada();f.ctx.calcularDistanciaMetros=()=>900;assert.equal(f.enviar().localStatus,'FORA_DO_LOCAL');
 f.etapa[13]='';assert.equal(f.enviar().localStatus,'SEM_COORDENADAS_EVENTO');
 f.etapa[7]='';assert.equal(f.enviar().atraso,'');
});
test('indicadores usam avaliação do RH, mês da etapa e um atraso por etapa',()=>{
 const etapas=[[],['a','','','','','montagem','2026-10-14'],['b','','','','','desmontagem','2026-10-14'],['c','','','','','montagem','2026-09-14'],['TESTE_MONTADOR_IGOR_20261014','','','','','montagem','2026-10-14']];
 function registro(id,uniforme,atraso){const r=[];r[1]=id;r[10]='foto';r[14]=uniforme;r[15]='2026-10-14T11:00Z';r[16]=atraso;r[17]='NO_LOCAL';r[20]='CHEGADA_V1';return r;}
 const rows=[[],registro('a','NAO',20),registro('a','SIM',0),registro('b','',0),registro('c','NAO',20),registro('TESTE_MONTADOR_IGOR_20261014','NAO',20)];
 const ctx={OPERACAO_CRONOGRAMA_ID:'fixture',operacaoTexto_:s=>String(s||'').toLowerCase(),operacaoMesDe_:s=>String(s).slice(0,7),operacaoValores_:(_,aba)=>aba==='Cronograma'?etapas:rows};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/central/MontagemIndicadores.js','utf8'),ctx);
 const r=ctx.operacaoMontagemIndicadores_('2026-10');assert.equal(r.semUniforme,1);assert.equal(r.atraso,1);assert.equal(r.uniformePendente,1);
});
test('avaliação do uniforme rejeita usuário sem permissão do RH',()=>{
 const ctx={Acervo:{pode:()=>false}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/cronograma/ResumoMontagem.js','utf8'),ctx);
 assert.throws(()=>ctx.MON_salvarUniformizacaoEquipe('etapa','SIM'),/Somente o RH/);
});
