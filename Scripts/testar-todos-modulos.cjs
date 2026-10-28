// Auditoria local: fixtures e bancos isolados; nunca habilita testes live.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFile}=require('node:child_process');
const raiz=path.resolve(__dirname,'..'),dir=path.join(raiz,'.tmp',process.env.AUDITORIA_DIR||'auditoria-final');fs.mkdirSync(dir,{recursive:true});
const escolhidos=process.argv.slice(2);
const arquivos=(escolhidos.length?escolhidos:fs.readdirSync(path.join(raiz,'tests')).filter(n=>/\.test\.(cjs|mjs)$|-browser\.(cjs|mjs)$/.test(n)).concat('operacao-integrada-db.cjs')).sort();
for(const n of arquivos){if(!/^[\w.-]+\.(cjs|mjs)$/.test(n)||/live|fixture/.test(n))throw Error('Teste fora do escopo isolado: '+n);const s=fs.readFileSync(path.join(raiz,'tests',n),'utf8');if(/require\(['"]dotenv['"]\)|process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(s))throw Error('Teste exige revisao de acesso remoto: '+n);}
const inicio=new Date().toISOString(),resultados=[];let cursor=0;
function salvar(){fs.writeFileSync(path.join(dir,'resultado.json'),JSON.stringify({inicio,atualizado:new Date().toISOString(),previstos:arquivos.length,concluidos:resultados.length,resultados},null,2));}
function executar(nome){return new Promise(resolve=>{const t=Date.now(),log=fs.createWriteStream(path.join(dir,nome+'.log')),env={...process.env};for(const k of Object.keys(env))if(/^RUN_.*LIVE$/.test(k)||/SERVICE_ROLE/.test(k))delete env[k];const filho=spawn(process.execPath,[path.join('tests',nome)],{cwd:raiz,env,stdio:['ignore','pipe','pipe'],windowsHide:true});let timeout=false,encerrado=false;
 filho.stdout.pipe(log,{end:false});filho.stderr.pipe(log,{end:false});const timer=setTimeout(()=>{timeout=true;if(process.platform==='win32')execFile('taskkill',['/PID',String(filho.pid),'/T','/F'],{windowsHide:true},()=>{});else filho.kill('SIGKILL');},nome==='catalogo-projetos-browser.cjs'?600000:180000);
 function finalizar(codigo,erro){if(encerrado)return;encerrado=true;clearTimeout(timer);log.end();const r={arquivo:nome,ok:codigo===0&&!timeout,codigo,timeout,duracao_ms:Date.now()-t,...(erro?{erro:erro.message}:{} )};resultados.push(r);salvar();console.log((r.ok?'OK ':'FALHA ')+nome+' ('+Math.round(r.duracao_ms/1000)+'s)');resolve();}
 filho.on('error',e=>finalizar(null,e));filho.on('close',c=>finalizar(c));});}
async function worker(){while(cursor<arquivos.length){const nome=arquivos[cursor++];await executar(nome);}}
(async()=>{salvar();console.log('Auditoria isolada: '+arquivos.length+' arquivos de teste.');await Promise.all([worker(),worker()]);const falhas=resultados.filter(r=>!r.ok);console.log(JSON.stringify({arquivos:arquivos.length,aprovados:resultados.length-falhas.length,falhas:falhas.map(r=>r.arquivo)}));process.exitCode=falhas.length?1:0;})();
