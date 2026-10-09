const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function executar(falha=false, almoxCadastrado=true){
  const context = {
    liberarAcessoInterno_:()=>{},
    Utilities:{formatDate:()=> '2026-10'},
    CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{}})},
    COMISSAO_FUNCIONARIOS_PLANILHA_ID:'fixture',
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[['','','','Setor'],['','','','Comercial'],['','','','Financeiro'],['','','','Marcenaria']]})})})},
    calcularStatusSetores:()=>{
      if(falha) throw Error('offline');
      return [{setor:'Marcenaria',producao:15,metaProducao:10,gasto:20,metaGasto:100,status:true},{setor:'Solda',producao:2,metaProducao:10,gasto:20,metaGasto:100,status:false}];
    },
    getMetasAlmoxarifadoCentral:()=>({atual:{mes:'10/2026',metaContagem:100,assertividade:90,tetoGasto:10,status:true,bonus:1234},historico:almoxCadastrado?[{mes:'10/2026'}]:[]})
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('api/_gas/projetos/central/PortalMetas.js','utf8'),context);
  return JSON.parse(JSON.stringify(context.PORTAL_metasSetores_()));
}
test('inclui setores do cadastro e preserva status da Central sem dados individuais',()=>{
  const r=executar();
  const setor=nome=>r.setores.find(s=>s.setor===nome);
  assert.equal(setor('Comercial').status,null);
  assert.equal(setor('Financeiro').motivo,'Sem meta cadastrada');
  assert.equal(setor('Marcenaria').status,true);
  assert.equal(setor('Solda').status,false);
  assert.equal(setor('Almoxarifado').status,true);
  assert.equal(JSON.stringify(r).includes('bonus'),false);
});
test('registro padrão do Almoxarifado não equivale a uma meta cadastrada',()=>{
  assert.equal(executar(false,false).setores.find(s=>s.setor==='Almoxarifado').status,null);
});
test('falha operacional não produz aprovação nem alega ausência de cadastro',()=>{
  const r=executar(true);
  const s=r.setores.find(s=>s.setor==='Marcenaria');
  assert.equal(s.status,null);
  assert.equal(s.motivo,'Resultados indisponíveis');
  assert.ok(r.avisos.length);
});
