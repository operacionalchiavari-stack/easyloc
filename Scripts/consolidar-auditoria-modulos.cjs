const fs=require('node:fs'),path=require('node:path');
const raiz=path.resolve(__dirname,'..'),tmp=path.join(raiz,'.tmp');
const ativos=fs.readdirSync(path.join(raiz,'tests')).filter(n=>/\.test\.(cjs|mjs)$|-browser\.(cjs|mjs)$/.test(n)).concat('operacao-integrada-db.cjs');
const permitidos=new Set(ativos),ultimos=new Map();
const execucoes=fs.readdirSync(tmp).filter(n=>/^auditoria-/.test(n)&&fs.existsSync(path.join(tmp,n,'resultado.json'))).map(n=>({pasta:n,...JSON.parse(fs.readFileSync(path.join(tmp,n,'resultado.json'),'utf8'))})).sort((a,b)=>a.inicio.localeCompare(b.inicio));
for(const e of execucoes)for(const t of e.resultados)if(permitidos.has(t.arquivo))ultimos.set(t.arquivo,{...t,execucao:e.inicio,log:'.tmp/'+e.pasta+'/'+t.arquivo+'.log'});
for(const arquivo of permitidos)if(!ultimos.has(arquivo))ultimos.set(arquivo,{arquivo,ok:false,erro:'Ainda nao executado'});
const resultados=[...ultimos.values()].sort((a,b)=>a.arquivo.localeCompare(b.arquivo)),pendencias=resultados.filter(x=>!x.ok);
const r={total:permitidos.size,aprovados:resultados.length-pendencias.length,pendencias,resultados};
fs.writeFileSync(path.join(tmp,'auditoria-final/consolidado.json'),JSON.stringify(r,null,2));
const md=['# Pendências da auditoria ampliada','',`Resultado consolidado: **${r.aprovados} de ${r.total} arquivos aprovados; ${pendencias.length} pendentes**. Foram preservadas as falhas; isto não é uma aprovação de produção.`,'','Cada linha aponta o último teste executado. Uma falha pode indicar defeito do produto, simulação incompleta, teste instável ou expectativa de uma interface antiga. A causa deve ser comprovada antes de encerrar a pendência.','','| Arquivo | Evidência |','|---|---|'];
for(const p of pendencias){const s=(p.log?fs.readFileSync(path.join(raiz,p.log),'utf8'):p.erro).replace(/\u001b\[[\d;]*m/g,'');const linhas=s.split(/\r?\n/);const erro=linhas.find(l=>/AssertionError|TypeError|ReferenceError|Timeout|ENOENT|Error:/.test(l))||'Consultar log completo';md.push('| `'+p.arquivo+'` | '+erro.replaceAll('|','\\|').slice(0,240)+' |');}
md.push('','Os logs locais estão em `.tmp/auditoria-final/consolidado.json` e nas pastas `.tmp/auditoria-reteste-*`. Ver o [relatório da auditoria](auditoria-final-modulos.md) para correções, cobertura e limites.','');
fs.writeFileSync(path.join(raiz,'docs/auditoria-final-pendencias.md'),md.join('\n'));console.log(JSON.stringify({arquivos:r.total,aprovados:r.aprovados,pendentes:pendencias.length}));
