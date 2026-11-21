// Compara a versão liberada com os arquivos locais, sem autenticar ou alterar dados de negócio.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{execFileSync}=require('node:child_process');
function hashConteudo(buffer,arquivo){
 let conteudo=buffer;
 if(arquivo.endsWith('.html')){
  let html=buffer.toString('utf8').replace(/\r\n/g,'\n');
  if(process.argv.includes('--preview'))html=html.replace(/<script\b[^>]*\bsrc="https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js"[^>]*><\/script>\s*$/,'');
  conteudo=html.trimEnd();
 }
 return crypto.createHash('sha256').update(conteudo).digest('hex');
}
async function executar(base){
 if(!base)throw Error('Informe o endereço HTTPS da versão');const origem=new URL(base);if(origem.protocol!=='https:')throw Error('Use HTTPS');
 const local=JSON.parse(fs.readFileSync('release.json','utf8')),resultados=[];
 for(const arquivo of Object.keys(local.arquivos)){
  const esperado=hashConteudo(fs.readFileSync(arquivo),arquivo);
  let resposta,conteudo;
  if(process.argv.includes('--preview')){
   const cli=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js');
   try{conteudo=execFileSync(process.execPath,[cli,'curl','/'+arquivo,'--deployment',origem.href],{stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:60000});}catch{throw Error('Não foi possível consultar a prévia: '+arquivo);}
  }else{
   resposta=await fetch(new URL(arquivo,origem),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});conteudo=Buffer.from(await resposta.arrayBuffer());
  }
  const hash=hashConteudo(conteudo,arquivo);
  resultados.push({arquivo,status:resposta?.status,igual:(!resposta||resposta.ok)&&hash===esperado});
 }
 const versao=process.argv.includes('--preview')?JSON.parse(execFileSync(process.execPath,[path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js'),'curl','/release.json','--deployment',origem.href],{stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:60000}).toString()):await fetch(new URL('release.json',origem),{signal:AbortSignal.timeout(30000)}).then(async r=>r.ok&&r.headers.get('content-type')?.includes('json')?await r.json():null);
 const ok=resultados.every(r=>r.igual)&&versao?.versao===local.versao;
 console.log(JSON.stringify({endereco:origem.href,versao:local.versao,ok,resultados},null,2));if(!ok)process.exitCode=1;
}
executar(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
