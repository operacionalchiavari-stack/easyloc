// Retoma somente arquivos de um snapshot cujo banco ja foi restaurado e conferido.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js'),{cifrar,decifrar}=require('./backup-operacional.cjs');
async function executar(){
 const root=path.resolve(__dirname,'..'),out=process.env.ACERVO_BACKUP_DIR||path.join(root,'.backups'),arquivo=process.argv[2];
 if(!arquivo)throw Error('Informe o snapshot cifrado ja verificado');
 const key=fs.readFileSync(process.env.ACERVO_BACKUP_KEY_FILE||path.join(process.env.LOCALAPPDATA||require('os').homedir(),'Acervo','backup.key'));
 const encrypted=fs.readFileSync(arquivo),hash=crypto.createHash('sha256').update(encrypted).digest('hex'),s=JSON.parse(zlib.gunzipSync(decifrar(encrypted,key))),status=JSON.parse(fs.readFileSync(path.join(out,'ultimo-relatorio.json'),'utf8'));
 if(!status.banco_verificado||status.bytes!==encrypted.length||status.tabelas!==s.tabelas.length||status.registros!==s.tabelas.reduce((n,t)=>n+t.linhas.length,0)||(status.snapshot_sha256&&status.snapshot_sha256!==hash))throw Error('O relatorio nao comprova a verificacao deste snapshot. Execute o backup completo');
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(u,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(180000)})}}),falhas=[];
 const objetos=s.tabelas.find(t=>t.esquema==='storage'&&t.tabela==='objects')?.linhas||[];let protegidos=0;
 for(const obj of objetos){const id=crypto.createHash('sha256').update(obj.bucket_id+'/'+obj.name+':'+(obj.updated_at||obj.created_at||'')).digest('hex'),file=path.join(out,'arquivos',id+'.enc');
  try{let valido=false;try{decifrar(fs.readFileSync(file),key);valido=true;}catch{}
   if(!valido){console.log('Recuperando arquivo pendente '+(protegidos+falhas.length+1)+'/'+objetos.length);let buffer;
    if(obj.name.split('/').at(-1)==='.emptyFolderPlaceholder'&&obj.metadata?.size!=null&&Number(obj.metadata.size)===0)buffer=Buffer.alloc(0);
    else{const {data,error}=await sb.storage.from(obj.bucket_id).download(obj.name);if(error)throw error;buffer=Buffer.from(await data.arrayBuffer());}
    fs.writeFileSync(file+'.tmp',cifrar(buffer,key),{mode:0o600});decifrar(fs.readFileSync(file+'.tmp'),key);fs.renameSync(file+'.tmp',file);
   }protegidos++;
  }catch(e){falhas.push({id,bucket:obj.bucket_id,path:obj.name,codigo:e.statusCode||e.code||'falha'});}
 }
 const novo={...status,snapshot_sha256:hash,arquivos:protegidos,arquivos_pendentes:falhas.length,verificado:falhas.length===0,criado_em:new Date().toISOString()};
 fs.writeFileSync(path.join(out,'ultimo-relatorio.json'),JSON.stringify(novo,null,2));fs.writeFileSync(path.join(out,'arquivos-pendentes.json.enc'),cifrar(Buffer.from(JSON.stringify(falhas)),key),{mode:0o600});
 for(const emp of s.tabelas.find(t=>t.esquema==='public'&&t.tabela==='empresas').linhas){const {error}=await sb.from('sistema_backups').insert({empresa_id:emp.id,tabelas:novo.tabelas,registros:novo.registros,bytes:novo.bytes,arquivos:novo.arquivos,arquivos_pendentes:novo.arquivos_pendentes,verificado:novo.verificado,erro:falhas.length?'Arquivos ainda pendentes de copia.':null});if(error)throw error;}
 console.log(JSON.stringify(novo));if(falhas.length)process.exitCode=2;
}
executar().catch(e=>{console.error('Retomada nao concluida: '+e.message);process.exitCode=1;});
