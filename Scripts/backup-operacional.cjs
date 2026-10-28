/* Backup cifrado + restauração isolada. Nunca restaura sobre o servidor. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {createClient}=require('@supabase/supabase-js'),{PGlite}=require('@electric-sql/pglite');
const raiz=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(raiz,'.env'),quiet:true});
const out=process.env.ACERVO_BACKUP_DIR||path.join(raiz,'.backups'),keyFile=process.env.ACERVO_BACKUP_KEY_FILE||path.join(process.env.LOCALAPPDATA||process.env.HOME||raiz,'Acervo','backup.key');
const qi=v=>'"'+String(v).replace(/"/g,'""')+'"',ql=v=>"'"+String(v).replace(/'/g,"''")+"'";
const fetchBackup=(url,options={})=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(60000)});
function chave(){if(process.env.ACERVO_BACKUP_KEY){const b=Buffer.from(process.env.ACERVO_BACKUP_KEY,'base64');if(b.length!==32)throw Error('Chave de backup inválida');return b;}if(process.env.CI&&!fs.existsSync(keyFile))throw Error('Configure a chave persistente antes de agendar o backup');fs.mkdirSync(path.dirname(keyFile),{recursive:true});if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{mode:0o600,flag:'wx'});const b=fs.readFileSync(keyFile);if(b.length!==32)throw Error('Chave de backup inválida');return b;}
function cifrar(buffer,key){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(buffer),c.final()]);return Buffer.concat([Buffer.from('ACERVO1'),iv,c.getAuthTag(),data]);}
function decifrar(buffer,key){if(buffer.subarray(0,7).toString()!=='ACERVO1')throw Error('Arquivo de backup inválido');const d=crypto.createDecipheriv('aes-256-gcm',key,buffer.subarray(7,19));d.setAuthTag(buffer.subarray(19,35));return Buffer.concat([d.update(buffer.subarray(35)),d.final()]);}
function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v);}
const hashRows=rows=>crypto.createHash('sha256').update(rows.map(canon).sort().join('\n')).digest('hex');
function normalizarFusos(t,rows){
 const colunas=t.colunas.filter(c=>c.tipo==='timestamp with time zone'||/^timestamp\(\d+\) with time zone$/.test(c.tipo));
 return rows.map(row=>{const r={...row};for(const c of colunas){const v=r[c.nome];if(typeof v==='string'&&Number.isFinite(Date.parse(v))){const fracao=(v.match(/\.(\d+)/)?.[1]||'').padEnd(6,'0');r[c.nome]=new Date(v).toISOString().slice(0,19)+'.'+fracao+'Z';}}return r;});
}
async function exportarSnapshot(){
 if(process.env.ACERVO_BACKUP_PG_HOST){
  const {Client}=require('pg');const db=new Client({host:process.env.ACERVO_BACKUP_PG_HOST,port:Number(process.env.ACERVO_BACKUP_PG_PORT||5432),user:process.env.ACERVO_BACKUP_PG_USER,password:process.env.ACERVO_BACKUP_PG_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(__dirname,'supabase-root.crt'),'utf8')},connectionTimeoutMillis:30000,query_timeout:240000});
  try{await db.connect();console.log('Conexao restrita estabelecida.');await db.query("set statement_timeout='240s'");await db.query('begin isolation level repeatable read read only');await db.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");console.log('Solicitando exportacao consistente.');const snapshot=(await db.query('select public.sistema_backup_estrutura() snapshot')).rows[0].snapshot;
  let conferidas=0;for(const tabela of snapshot.tabelas){for(let de=0;;de+=200){const lote=(await db.query('select public.sistema_backup_linhas($1,$2,$3,200) linhas',[tabela.esquema,tabela.tabela,de])).rows[0].linhas;tabela.linhas.push(...lote);if(lote.length<200)break;}if(++conferidas%25===0)console.log('Tabelas exportadas: '+conferidas+'/'+snapshot.tabelas.length);}
  console.log('Snapshot recebido.');await db.query('commit');return snapshot;}finally{await Promise.race([db.end(),new Promise(resolve=>{const timer=setTimeout(()=>{db.connection?.stream?.destroy();resolve();},5000);timer.unref?.();})]);}
 }
 if(process.env.ACERVO_BACKUP_EXPORT==='rpc'){
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(u,o={})=>fetchBackup(u,{...o,signal:AbortSignal.timeout(180000)})}});
  const {data,error}=await sb.rpc('sistema_backup_exportar');if(error)throw Error('Falha na exportação do snapshot: '+error.message);
  if(!data?.tabelas?.length)throw Error('O snapshot exportado está vazio');return data;
 }
 // O CLI fornece credenciais temporarias; a senha nunca e gravada ou exibida.
 const {execFileSync}=require('node:child_process'),{Client}=require('pg');
 const cli=path.join(raiz,'node_modules','supabase','dist','supabase.js');
 const script=execFileSync(process.execPath,[cli,'db','dump','--linked','--dry-run','--workdir',raiz],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 const ambiente={};for(const m of script.matchAll(/^export (PG\w+)="([^"\r\n]*)"/gm))ambiente[m[1]]=m[2];
 if(!ambiente.PGHOST||!ambiente.PGPASSWORD)throw Error('Nao foi possivel obter o acesso temporario do backup');
 const db=new Client({host:ambiente.PGHOST,port:Number(ambiente.PGPORT),user:ambiente.PGUSER,password:ambiente.PGPASSWORD,database:ambiente.PGDATABASE,
  ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(__dirname,'supabase-root.crt'),'utf8')},connectionTimeoutMillis:20000});
 try{await db.connect();console.log('Conexao de backup protegida por TLS.');await db.query('set role postgres');console.log('Abrindo snapshot de leitura...');await db.query('begin isolation level repeatable read read only');
  await db.query("set local statement_timeout='180s'");await db.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  const tables=(await db.query("select n.nspname esquema,c.relname tabela,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','p') and not c.relispartition order by n.nspname,c.relname")).rows;
  const snapshot={versao:1,criado_em:new Date().toISOString(),tabelas:[],tipos:[],funcoes:[]};
  snapshot.tipos=(await db.query("select n.nspname||'.'||t.typname nome,jsonb_agg(e.enumlabel order by e.enumsortorder) valores from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','auth','storage') group by t.oid,n.nspname,t.typname")).rows;
  for(const t of tables){
   t.colunas=(await db.query("select a.attname nome,format_type(a.atttypid,a.atttypmod) tipo,a.atttypid in (20,1700) texto_numerico,a.attgenerated<>'' gerada,not a.attnotnull nulo from pg_attribute a where a.attrelid=$1 and a.attnum>0 and not a.attisdropped order by a.attnum",[t.oid])).rows;
   t.restricoes=(await db.query("select conname nome,contype tipo,pg_get_constraintdef(oid,true) sql from pg_constraint where conrelid=$1 and contype in ('p','u','f','c')",[t.oid])).rows;
   const numericos=t.colunas.filter(c=>c.texto_numerico),extra=numericos.length?'||jsonb_build_object('+numericos.map(c=>ql(c.nome)+',x.'+qi(c.nome)+'::text').join(',')+')':'';
   t.linhas=(await db.query('select to_jsonb(x)'+extra+' r from '+qi(t.esquema)+'.'+qi(t.tabela)+' x')).rows.map(r=>r.r);delete t.oid;snapshot.tabelas.push(t);
   if(snapshot.tabelas.length%25===0)console.log('Tabelas exportadas: '+snapshot.tabelas.length+'/'+tables.length);
  }
  snapshot.funcoes=(await db.query("select pg_get_functiondef(p.oid) sql from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ('public','auth','storage') and p.prokind='f' and l.lanname in ('sql','plpgsql')")).rows.map(r=>r.sql);
  snapshot.migracoes=(await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  await db.query('commit');return snapshot;
 }finally{await db.end();}
}
async function restaurarVerificar(snapshot){
 const {vector}=require('@electric-sql/pglite-pgvector');const db=new PGlite({extensions:{vector}});let registros=0,conferidas=0;try{
  await db.exec('create extension if not exists vector');await db.exec('begin');
  for(const schema of [...new Set(snapshot.tabelas.map(t=>t.esquema))])await db.exec('create schema if not exists '+qi(schema));
  for(const e of snapshot.tipos||[])await db.exec('create type '+e.nome.split('.').map(qi).join('.')+' as enum('+e.valores.map(ql).join(',')+')');
  for(const t of snapshot.tabelas){const tabela=qi(t.esquema)+'.'+qi(t.tabela);await db.exec('create table '+tabela+'('+t.colunas.map(c=>qi(c.nome)+' '+c.tipo).join(',')+')');
   for(let i=0;i<t.linhas.length;i+=500)await db.query('insert into '+tabela+' select * from jsonb_populate_recordset(null::'+tabela+',$1::jsonb)',[JSON.stringify(t.linhas.slice(i,i+500))]);
   const numericos=t.colunas.filter(c=>c.texto_numerico),extra=numericos.length?'||jsonb_build_object('+numericos.map(c=>ql(c.nome)+',x.'+qi(c.nome)+'::text').join(',')+')':'';
   const rows=(await db.query('select to_jsonb(x)'+extra+' r from '+tabela+' x')).rows.map(r=>r.r);
   if(rows.length!==t.linhas.length||hashRows(normalizarFusos(t,rows))!==hashRows(normalizarFusos(t,t.linhas)))throw Error('Divergência na restauração de '+t.esquema+'.'+t.tabela);registros+=rows.length;
   if(require.main===module&&++conferidas%25===0)console.log('Tabelas restauradas e conferidas: '+conferidas+'/'+snapshot.tabelas.length);
  }
  for(const tipo of ['p','u','f'])for(const t of snapshot.tabelas)for(const c of t.restricoes||[])if(c.tipo===tipo)await db.exec('alter table '+qi(t.esquema)+'.'+qi(t.tabela)+' add constraint '+qi(c.nome)+' '+c.sql);
  await db.exec('commit');return {tabelas:snapshot.tabelas.length,registros,verificado:true};
 }finally{await db.close();}
}
async function executar(){
 fs.mkdirSync(out,{recursive:true});const key=chave(),arquivo=process.argv[2];
 if(arquivo&&arquivo.endsWith('.enc')&&!process.argv.includes('--completo')){const snapshot=JSON.parse(zlib.gunzipSync(decifrar(fs.readFileSync(arquivo),key)));const r=await restaurarVerificar(snapshot);console.log(JSON.stringify(r));return r;}
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configure o acesso de serviço no ambiente do backup');
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:fetchBackup}});
 let snapshot,encrypted,destino;
 if(arquivo&&arquivo.endsWith('.enc')){destino=arquivo;encrypted=fs.readFileSync(arquivo);snapshot=JSON.parse(zlib.gunzipSync(decifrar(encrypted,key)));}
 else{console.log('Exportando snapshot consistente do banco…');snapshot=await exportarSnapshot();
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');destino=path.join(out,'acervo-'+stamp+'.json.gz.enc');encrypted=cifrar(zlib.gzipSync(Buffer.from(JSON.stringify(snapshot))),key);
  fs.writeFileSync(destino+'.tmp',encrypted,{mode:0o600});fs.renameSync(destino+'.tmp',destino);
 }
 console.log('Validando a restauração em PostgreSQL isolado…');const relatorio=await restaurarVerificar(snapshot);
 const objetos=snapshot.tabelas.find(t=>t.esquema==='storage'&&t.tabela==='objects')?.linhas||[],midia=path.join(out,'arquivos');fs.mkdirSync(midia,{recursive:true});let arquivos=0,pendentes=0;const falhas=[];
 let proximo=0;
 async function copiar(obj){const id=crypto.createHash('sha256').update(obj.bucket_id+'/'+obj.name+':'+(obj.updated_at||obj.created_at||'')).digest('hex'),file=path.join(midia,id+'.enc');
  try{let valido=false;if(fs.existsSync(file)){try{decifrar(fs.readFileSync(file),key);valido=true;}catch{}}
   if(!valido){let buffer;
    if(obj.name.split('/').at(-1)==='.emptyFolderPlaceholder'&&obj.metadata?.size!=null&&Number(obj.metadata.size)===0)buffer=Buffer.alloc(0);
    else{let data,error;for(let tentativa=0;tentativa<3;tentativa++){({data,error}=await sb.storage.from(obj.bucket_id).download(obj.name));if(!error)break;}if(error)throw error;buffer=Buffer.from(await data.arrayBuffer());}
    fs.writeFileSync(file+'.tmp',cifrar(buffer,key),{mode:0o600});decifrar(fs.readFileSync(file+'.tmp'),key);fs.renameSync(file+'.tmp',file);}arquivos++;}catch(e){pendentes++;falhas.push({id,bucket:obj.bucket_id,path:obj.name,codigo:e.statusCode||e.code||'falha'});}
  if((arquivos+pendentes)%25===0)console.log('Arquivos protegidos: '+arquivos+'; pendentes: '+pendentes);
 }
 await Promise.all(Array.from({length:4},async()=>{while(proximo<objetos.length){const obj=objetos[proximo++];await copiar(obj);}}));
 const status={...relatorio,snapshot_sha256:crypto.createHash('sha256').update(encrypted).digest('hex'),banco_verificado:true,verificado:!pendentes,bytes:encrypted.length,arquivos,arquivos_pendentes:pendentes,criado_em:new Date().toISOString()};fs.writeFileSync(path.join(out,'ultimo-relatorio.json'),JSON.stringify(status,null,2));
 fs.writeFileSync(path.join(out,'arquivos-pendentes.json.enc'),cifrar(Buffer.from(JSON.stringify(falhas)),key),{mode:0o600});
 const empresas=snapshot.tabelas.find(t=>t.esquema==='public'&&t.tabela==='empresas')?.linhas||[];
 for(const emp of empresas){const {error}=await sb.from('sistema_backups').insert({empresa_id:emp.id,tabelas:status.tabelas,registros:status.registros,bytes:status.bytes,arquivos,arquivos_pendentes:pendentes,verificado:!pendentes,erro:pendentes?'Há arquivos pendentes de cópia; o banco foi restaurado e conferido.':null});if(error)throw Error(error.message);}
 console.log(JSON.stringify(status));if(pendentes)process.exitCode=2;return status;
}
async function registrarFalha(){
 fs.mkdirSync(out,{recursive:true});const erro='Execucao interrompida. Consulte o processo local de backup antes de considerar a copia valida.';
 fs.writeFileSync(path.join(out,'ultima-falha.json'),JSON.stringify({criado_em:new Date().toISOString(),erro}));
 try{const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),{data}=await sb.from('empresas').select('id');
  for(const e of data||[])await sb.from('sistema_backups').insert({empresa_id:e.id,tabelas:0,registros:0,bytes:0,arquivos:0,arquivos_pendentes:0,verificado:false,erro});
 }catch{}
}
module.exports={cifrar,decifrar,restaurarVerificar,hashRows,executar};
if(require.main===module)executar().catch(async e=>{console.error('Backup não concluído: '+e.message);await registrarFalha();process.exitCode=1;});
