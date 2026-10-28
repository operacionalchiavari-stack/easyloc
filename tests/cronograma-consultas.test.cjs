const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('cronograma nativo busca dados independentes em paralelo e interrompe cedo semanas vazias',async()=>{
 let ativos=0,pico=0,vazia=false,falhar=false;const chamadas=[];
 const pedido={id:'p1',numero_pedido:'1',cliente_nome:'Kelly',local_nome:'Local',local_id:'l1',data_evento:'2026-10-31',status_comercial:'aprovado',status:'separado',operacao:{}};
 const etapa={id:'e1',pedido_id:'p1',nome:'Carregamento',tipo:'carregamento',data:'2026-10-30',hora:'08:00',pessoas:[],cams:[]};
 const client={rpc:async()=>({data:'empresa',error:null}),from(tabela){let campos='';const q={select(v){campos=v;return q;},eq(){return q;},gte(){return q;},lte(){return q;},in(){return q;},neq(){return q;},order(){return q;},range(){return q;},then(ok,erro){chamadas.push(tabela);ativos++;pico=Math.max(pico,ativos);return new Promise(resolve=>setTimeout(()=>{ativos--;const data=tabela==='operacao_etapas'?(vazia?[]:[etapa]):tabela==='separacoes_pedidos'?[pedido]:tabela==='locais_empresas'?[{id:'l1',endereco:'Rua Teste',numero_endereco:'10'}]:[];resolve({data,error:falhar&&tabela==='operacao_pedidos_info'?{message:'Falha simulada'}:null});},5)).then(ok,erro);}};return q;}};
 const window={supabaseClient:client};window.top=window;const ctx={window,document:{currentScript:{src:'http://teste/Modulos/Chiavari/operacao-sem-motor.js'}},URL,Date,Intl,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js','utf8'),ctx);
 const dados=await window.ACERVO_LOCAL.getCronogramaSemana('2026-10-27');assert.equal(dados.length,1);assert.equal(dados[0].cliente,'Kelly');assert.equal(dados[0].etapas[0].id,'e1');assert.ok(pico>=4,'consultas independentes sobrepostas');
 falhar=true;await assert.rejects(window.ACERVO_LOCAL.getCronogramaSemana('2026-10-27'),/Falha simulada/);await new Promise(resolve=>setTimeout(resolve,25));
 falhar=false;vazia=true;chamadas.length=0;assert.equal((await window.ACERVO_LOCAL.getCronogramaSemana('2026-11-03')).length,0);assert.deepEqual(chamadas,['operacao_etapas']);
});
