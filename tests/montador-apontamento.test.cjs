const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ambiente(){
 let rows=null,seq=0;
 const sheet={appendRow:l=>{rows.push([...l]);},getDataRange:()=>({getValues:()=>rows.map(l=>[...l])}),getRange:(r,c)=>({setValues:ls=>ls.forEach((l,i)=>l.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;}))})};
 const ctx={FREE_SPREADSHEET_ID:'fixture',SpreadsheetApp:{openById:()=>({getSheetByName:()=>rows?sheet:null,insertSheet:()=>{rows=[];return sheet;}})},Utilities:{getUuid:()=>String(++seq)},MONT_autenticar_:token=>{if(!['Ana','Bruno'].includes(token))throw Error('Sessão inválida');return {nome:token};},getEtapaOperacao:id=>['a','b'].includes(id)?{id,pedido:'123',responsavel:'Ana',etapa:'montagem'}:null,MONT_podeVer_:(u,e)=>u.nome===e.responsavel,MONT_ehOperacao_:()=>true,FREE_comLock_:f=>f()};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/cronograma/ApontamentoMontador.js','utf8'),ctx);
 return {ctx,rows:()=>rows};
}
test('início persiste no servidor e repetição não reinicia o cronômetro',()=>{
 const {ctx,rows}=ambiente();assert.equal(ctx.MONT_apontamentoAtual('Ana'),null);
 const p=ctx.MONT_iniciarApontamento('Ana','a');assert.equal(p.idEtapa,'a');assert.ok(Date.parse(p.inicio));
 assert.equal(ctx.MONT_iniciarApontamento('Ana','a').id,p.id);assert.equal(ctx.MONT_apontamentoAtual('Ana').inicio,p.inicio);assert.equal(rows().length,2);
 assert.throws(()=>ctx.MONT_iniciarApontamento('Ana','b'),/Encerre/);
});
test('somente o responsável pode iniciar e encerrar seu apontamento',()=>{
 const {ctx}=ambiente();assert.throws(()=>ctx.MONT_iniciarApontamento('Bruno','a'),/acesso/);
 const p=ctx.MONT_iniciarApontamento('Ana','a');assert.throws(()=>ctx.MONT_finalizarApontamento('Bruno',p.id),/não encontrado/);
 const encerrado=ctx.MONT_finalizarApontamento('Ana',p.id);assert.equal(encerrado.status,'ENCERRADO');assert.ok(Date.parse(encerrado.fim));assert.equal(ctx.MONT_apontamentoAtual('Ana'),null);assert.equal(ctx.MONT_finalizarApontamento('Ana',p.id).fim,encerrado.fim);
 assert.equal(ctx.MONT_iniciarApontamento('Ana','b').idEtapa,'b');
});
test('foto e avaria exigem o evento ativo e rejeitam formulários antigos',()=>{
 const {ctx}=ambiente();assert.throws(()=>ctx.MONT_exigirApontamento_('Ana','a'),/Inicie/);
 const p=ctx.MONT_iniciarApontamento('Ana','a');assert.equal(ctx.MONT_exigirApontamento_('Ana','a',p.id).id,p.id);
 assert.throws(()=>ctx.MONT_exigirApontamento_('Ana','b',p.id),/Inicie/);assert.throws(()=>ctx.MONT_exigirApontamento_('Ana','a','antigo'),/Inicie/);
 ctx.MONT_finalizarApontamento('Ana',p.id);assert.throws(()=>ctx.MONT_exigirApontamento_('Ana','a',p.id),/Inicie/);
});
