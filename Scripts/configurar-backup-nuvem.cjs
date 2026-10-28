// Administração local: credenciais seguem por stdin para secrets do repositório privado.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{Client}=require('pg');
const raiz=path.resolve(__dirname,'..'),repo=process.argv[2];
require('dotenv').config({path:path.join(raiz,'.env'),quiet:true});
async function executar(){
 if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('Informe o repositório privado de automação');
 const vis=JSON.parse(execFileSync('gh',['repo','view',repo,'--json','visibility'],{encoding:'utf8',windowsHide:true}));if(vis.visibility!=='PRIVATE')throw Error('O backup exige repositório privado');
 const cli=path.join(raiz,'node_modules/supabase/dist/supabase.js');
 const script=execFileSync(process.execPath,[cli,'db','dump','--linked','--dry-run','--workdir',raiz],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});const pg={};for(const m of script.matchAll(/^export (PG\w+)="([^"\r\n]*)"/gm))pg[m[1]]=m[2];
 if(!pg.PGHOST||!pg.PGPASSWORD)throw Error('Não foi possível obter a conexão administrativa temporária');
 const ssl={rejectUnauthorized:true,ca:fs.readFileSync(path.join(__dirname,'supabase-root.crt'),'utf8')};
 const db=new Client({host:pg.PGHOST,port:Number(pg.PGPORT),user:pg.PGUSER,password:pg.PGPASSWORD,database:pg.PGDATABASE,ssl,connectionTimeoutMillis:30000});
 const password=crypto.randomBytes(36).toString('hex'),usuario='acervo_backup_executor';
 try{await db.connect();await db.query('set role postgres');await db.query("do $$begin if not exists(select 1 from pg_roles where rolname='acervo_backup_executor') then create role acervo_backup_executor login noinherit;end if;end $$");
  const sql=(await db.query("select format('alter role acervo_backup_executor password %L',$1::text) s",[password])).rows[0].s;await db.query(sql);
  await db.query("grant connect on database postgres to acervo_backup_executor;grant usage on schema public to acervo_backup_executor;grant execute on function public.sistema_backup_exportar(),public.sistema_backup_estrutura(),public.sistema_backup_linhas(text,text,integer,integer) to acervo_backup_executor;alter role acervo_backup_executor set default_transaction_read_only=on;alter role acervo_backup_executor set statement_timeout='240s'");
 }finally{await db.end();}
 const ref=fs.readFileSync(path.join(raiz,'supabase/.temp/project-ref'),'utf8').trim();
 const poolFile=path.join(raiz,'supabase/.temp/pooler-url'),pool=fs.existsSync(poolFile)?new URL(fs.readFileSync(poolFile,'utf8').trim()):null;
 const host=pool?.hostname||pg.PGHOST,port=pool?.port||pg.PGPORT,pguser=host.includes('pooler')?usuario+'.'+ref:usuario;
 const teste=new Client({host,port:Number(port),user:pguser,password,database:pg.PGDATABASE,ssl,connectionTimeoutMillis:30000});try{await teste.connect();await teste.query('select 1');}finally{await teste.end();}
 const keyFile=process.env.ACERVO_BACKUP_KEY_FILE||path.join(process.env.LOCALAPPDATA||require('os').homedir(),'Acervo','backup.key'),key=fs.readFileSync(keyFile);if(key.length!==32)throw Error('Chave de recuperação inválida');
 const secrets={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,ACERVO_BACKUP_KEY:key.toString('base64'),ACERVO_BACKUP_PG_HOST:host,ACERVO_BACKUP_PG_PORT:port,ACERVO_BACKUP_PG_USER:pguser,ACERVO_BACKUP_PG_PASSWORD:password};
 for(const [nome,valor]of Object.entries(secrets)){if(!valor)throw Error('Credencial necessária ausente: '+nome);execFileSync('gh',['secret','set',nome,'--repo',repo],{input:valor,stdio:['pipe','pipe','pipe'],windowsHide:true});}
 console.log('Conexão restrita testada e credenciais configuradas no repositório privado. Nenhuma chave foi gravada no código.');
}
executar().catch(e=>{console.error('Configuração interrompida: '+e.message);process.exitCode=1;});
