const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
process.env.TZ='America/Sao_Paulo';
function ambiente(linhas,minutos=60){
  const rows=[[],...linhas];
  const sheet={getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),getRange:(r,c)=>({setValues:v=>{rows[r-1][c-1]=v[0][0];rows[r-1][c]=v[0][1];}})};
  const ctx={Acervo:{regrasCronograma:()=>({descarregamento_minutos_apos_desmontagem:minutos})},Session:{getScriptTimeZone:()=>process.env.TZ},Utilities:{formatDate:(d,t,f)=>f==='HH:mm'?String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/cronograma/PedidosAcervo.js','utf8'),ctx);
  return {ctx,rows,sheet};
}
const linha=(tipo,data,hora,id='p1')=>[tipo,id,'','','',tipo,data,hora,'','','','','','','','','',id];
test('descarga respeita a última desmontagem, parâmetro e virada de dia; retorno vem depois',()=>{
  const {ctx,rows,sheet}=ambiente([linha('Desmontagem','20/10/2026','20:00'),linha('Desmontagem','20/10/2026','23:30'),linha('Descarregamento','20/10/2026','08:00'),linha('Triagem (Conferência)','20/10/2026','08:00')]);
  ctx.CRON_ordenarDescarregamentos_(sheet);
  assert.deepEqual(rows[3].slice(6,8),['21/10/2026','00:30']);
  assert.deepEqual(rows[4].slice(6,8),['21/10/2026','00:31']);
  const antes=JSON.stringify(rows);ctx.CRON_ordenarDescarregamentos_(sheet);assert.equal(JSON.stringify(rows),antes);
});
test('horário posterior programado manualmente é preservado',()=>{
  const {ctx,rows,sheet}=ambiente([linha('Desmontagem','20/10/2026','19:00'),linha('Descarregamento','21/10/2026','09:00')],120);
  ctx.CRON_ordenarDescarregamentos_(sheet);assert.deepEqual(rows[2].slice(6,8),['21/10/2026','09:00']);
});
