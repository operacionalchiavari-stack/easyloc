const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../Modulos/RH/CadastroFuncionarios/funcionarios-resumo.js'),'utf8');
function modulo(instante='2026-11-23T01:30:00Z') {
 const sandbox={window:{},Intl,Date:class extends Date{constructor(...args){super(...(args.length?args:[instante]));}}};vm.runInNewContext(script,sandbox);return sandbox.window.FuncionariosResumo;
}
test('usa a data do Brasil mesmo antes da meia-noite em São Paulo',()=>{assert.equal(modulo().hoje(),'2026-11-22');});
test('tempo de empresa respeita aniversário mensal, admissão futura e desligamento',()=>{
 const r=modulo(),e={id:'p',ativo:true,data_admissao:'2023-03-24'};
 assert.equal(r.tempo(e,{data:'2026-11-23'}),'3 anos e 7 meses de empresa');
 assert.equal(r.tempo({...e,data_admissao:'2026-11-24'},{data:'2026-11-23'}),'Admissão futura');
 assert.equal(r.tempo({...e,ativo:false},{data:'2026-11-23'}),'');
});
test('jornada cíclica calcula média e desconta intervalo em turno noturno',()=>{
 const r=modulo(),e={id:'p',setor:'Logística'},dados={data:'2026-11-22',escala:{regras:[{funcionario_id:'p',vigencia:'2026-01-01',configuracao:{tipo:'ciclo',trabalho:6,folga:1,horarios:{ciclo:{inicio:'22:00',fim:'06:00',intervalo:60}}}}]}};
 assert.equal(r.jornada(e,dados).texto,'6 trabalho / 1 folga');
 assert.equal(r.jornada(e,dados).detalhe,'22:00–06:00 · 42 h/sem em média');
});
test('validade de hoje não fica vencida e registros posteriores substituem os antigos',()=>{
 const r=modulo(),e={id:'p',setor:'Montagem',cargo:'Montador',ativo:true,data_admissao:'2020-01-01',tem_pin:true,dados_rh:{whatsapp:'21999990000'}},dados={data:'2026-11-22',pessoas:[{id:'p',ficha:{tipo_contrato:'clt'}}],examesCad:[{id:'aso',nome:'ASO',ativo:true,validade_meses:12}],exames:[{funcionario_id:'p',exame_cadastro_id:'aso',data_realizacao:'2025-01-01',validade:'2025-11-22'},{funcionario_id:'p',exame_cadastro_id:'aso',data_realizacao:'2026-01-01',validade:'2026-11-22'}],documentos:[],treinos:[]};
 const p=r.pendencias(e,dados,true);assert.equal(p.completo,true);assert.equal(p.itens.length,1);assert.equal(p.itens[0].texto,'ASO vence em 22/11/2026');assert.equal(p.itens[0].cor,'atencao');
});
test('consulta lista todas as páginas com empresa e conserva erro como dado indisponível',async()=>{
 const r=modulo(),chamadas=[];
 const client={rpc:async n=>({data:n==='rh_pessoas'?[]:{dias:[],regras:[]}}),from:t=>{
  let inicio=0;const q={select:()=>q,eq:(campo,valor)=>{assert.equal(campo,'empresa_id');assert.equal(valor,'empresa');return q;},range:(de,ate)=>{inicio=de;chamadas.push({t,de,ate});return q;},then:(ok,erro)=>Promise.resolve(t==='rh_exames'?{error:{message:'Falhou'}}:{data:t==='rh_documentos'&&inicio===0?Array.from({length:1000},(_,id)=>({id})):[]}).then(ok,erro)};return q;
 }};
 const dados=await r.carregar(client,'empresa');assert.equal(dados.documentos.length,1000);assert.equal(dados.exames,null);assert.ok(chamadas.some(c=>c.t==='rh_documentos'&&c.de===1000&&c.ate===1999));
});
