/* Remove o lote de demonstração DEMO-SISTEMA-20261031 seguindo as ligações (FK).
   node Scripts/remover-demo.cjs            -> ensaio (desfaz no fim)
   node Scripts/remover-demo.cjs --aplicar  -> grava */
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{Client}=require('pg');
const raiz=path.resolve(__dirname,'..');
const empresa='bb1260f0-99cd-4d17-ab9b-23c299b4c50b',lote='DEMO-SISTEMA-20261031';
const aplicar=process.argv.includes('--aplicar');
const ident=n=>'"'+n.replace(/"/g,'""')+'"';
async function conectar(){
 const script=execFileSync(process.execPath,[path.join(raiz,'node_modules/supabase/dist/supabase.js'),'db','dump','--linked','--dry-run','--workdir',raiz],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:60000});
 const pg={};for(const m of script.matchAll(/^export (PG\w+)="([^"\r\n]*)"/gm))pg[m[1]]=m[2];
 const db=new Client({host:pg.PGHOST,port:Number(pg.PGPORT),user:pg.PGUSER,password:pg.PGPASSWORD,database:pg.PGDATABASE,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(raiz,'Scripts/supabase-root.crt'),'utf8')},connectionTimeoutMillis:20000});
 await db.connect();await db.query('set role postgres');return db;
}
(async()=>{
 const db=await conectar();
 try{
  await db.query('begin');
  await db.query("set local statement_timeout='600s'");
  const r=(await db.query('select manifesto from sistema_demo_lotes where id=$1',[lote])).rows[0];
  if(!r)throw Error('Lote não encontrado (já removido?)');
  const m=r.manifesto;
  // FKs de coluna única do schema public
  const fks=(await db.query(`select c.conname, cl.relname filho, a.attname fcol, pl.relname pai, pa.attname pcol, c.confdeltype tipo
   from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace
   join pg_class pl on pl.oid=c.confrelid join pg_namespace pn on pn.oid=pl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
   where c.contype='f' and n.nspname='public' and pn.nspname='public' and array_length(c.conkey,1)=1`)).rows;
  const multi=(await db.query(`select count(*) n from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)>1`)).rows[0].n;
  // órfãos antes (para comparar depois)
  async function orfaos(){const o={};for(const f of fks){const q=`select count(*) n from ${ident(f.filho)} x where x.${ident(f.fcol)} is not null and not exists(select 1 from ${ident(f.pai)} p where p.${ident(f.pcol)}=x.${ident(f.fcol)})`;const n=Number((await db.query(q)).rows[0].n);if(n)o[f.conname]=n;}return o;}
  const antes=await orfaos();
  // alvo: tabela -> Set(ctid-free id via coluna chave)
  const alvo=new Map(); // tabela -> Map(col -> Set(valores))
  const add=(t,c,v)=>{if(v==null)return false;if(!alvo.has(t))alvo.set(t,new Map());const mc=alvo.get(t);if(!mc.has(c))mc.set(c,new Set());const s=mc.get(c),k=String(v);if(s.has(k))return false;s.add(k);return true;};
  const gs=[];
  for(const reg of m.registros){ if(reg.tabela==='gs_linhas'){gs.push(reg.chave);continue;} add(reg.tabela,reg.chave,reg.valor); }
  // expandir dependentes
  const fora={},setnull=[];
  const manifestoSet=new Set(m.registros.filter(x=>typeof x.chave==='string').map(x=>x.tabela+'|'+x.chave+'|'+x.valor));
  let mudou=true,voltas=0;
  const visto=new Set();
  while(mudou&&voltas<30){mudou=false;voltas++;
   for(const [t,mc] of [...alvo]){
    for(const [c,vals] of [...mc]){
     const lista=[...vals];
     for(const f of fks.filter(f=>f.pai===t)){
      // valores da coluna referenciada (pcol) nas linhas-alvo
      const key=t+'|'+c+'|'+f.conname+'|'+lista.length; if(visto.has(key))continue; visto.add(key);
      const pv=(await db.query(`select distinct ${ident(f.pcol)}::text v from ${ident(t)} where ${ident(c)}::text=any($1::text[])`,[lista])).rows.map(x=>x.v).filter(Boolean);
      if(!pv.length)continue;
      const pk=(await db.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0] where i.indrelid=$1::regclass and i.indisprimary and i.indnatts=1`,['public.'+f.filho])).rows[0]?.attname||f.fcol;
      const filhos=(await db.query(`select ${ident(pk)}::text id from ${ident(f.filho)} where ${ident(f.fcol)}::text=any($1::text[])`,[pv])).rows;
      for(const x of filhos){
       if(f.tipo==='n'&&!manifestoSet.has(f.filho+'|'+pk+'|'+x.id)){setnull.push([f.filho,f.fcol,pk,x.id]);continue;}
       if(add(f.filho,pk,x.id)){mudou=true;if(!manifestoSet.has(f.filho+'|'+pk+'|'+x.id)){fora[f.filho]=(fora[f.filho]||0)+1;}}
      }
     }
    }
   }
  }
  // sem FK: tabelas com colunas de referência comuns que apontam para registros apagados
  const ids=new Map(); // nome lógico -> Set
  const idsDe=t=>{const s=new Set();const mc=alvo.get(t);if(mc)for(const [c,v] of mc)if(c==='id')v.forEach(x=>s.add(x));return [...s];};
  const ref={pedido_id:idsDe('separacoes_pedidos'),separacao_pedido_id:idsDe('separacoes_pedidos'),item_id:idsDe('itens'),cliente_id:idsDe('clientes_empresas'),projeto_id:idsDe('projetos'),fornecedor_id:idsDe('fornecedores'),local_id:idsDe('locais_empresas'),funcionario_id:idsDe('funcionarios_acesso'),colaborador_id:idsDe('funcionarios_acesso'),conta_id:idsDe('fin_contas'),retorno_id:idsDe('acervo_retornos'),pessoa_id:idsDe('funcionarios_acesso')};
  const colsSemFk=(await db.query(`select table_name t,column_name c from information_schema.columns where table_schema='public' and column_name=any($1) and table_name not in (select table_name from information_schema.views where table_schema='public')`,[Object.keys(ref)])).rows;
  const fkCols=new Set(fks.map(f=>f.filho+'.'+f.fcol));
  const extras={};
  for(const {t,c} of colsSemFk){ if(fkCols.has(t+'.'+c)||!ref[c].length)continue;
   const pk=(await db.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0] where i.indrelid=$1::regclass and i.indisprimary and i.indnatts=1`,['public.'+t])).rows[0]?.attname;
   if(!pk)continue;
   const rows=(await db.query(`select ${ident(pk)}::text id from ${ident(t)} where ${ident(c)}::text=any($1::text[])`,[ref[c]])).rows;
   for(const x of rows)if(add(t,pk,x.id))extras[t]=(extras[t]||0)+1;
  }
  // relatório do que depende e não estava no manifesto
  console.log('Gerados a partir do DEMO (fora do manifesto):',JSON.stringify(fora));
  console.log('Sem FK, ligados a registros DEMO:',JSON.stringify(extras));
  console.log('Ficariam com a ligação apagada (set null):',setnull.length?JSON.stringify(setnull.slice(0,20)):'nenhum');
  // dados reais que dependem de demo? pedidos/clientes não-demo
  const realPed=(await db.query(`select count(*) n from separacoes_pedidos where id::text=any($1) and coalesce(observacoes->>'demo_lote','')<>$2`,[idsDe('separacoes_pedidos'),lote])).rows[0].n;
  console.log('Pedidos sem marca DEMO no conjunto:',realPed);
  if(Number(realPed)>0)throw Error('Há pedido real no conjunto; revise antes.');
  // apagar
  await db.query("set local session_replication_role=replica");
  const contagem={};
  for(const [t,mc] of alvo)for(const [c,vals] of mc){
   const res=await db.query(`delete from ${ident(t)} where ${ident(c)}::text=any($1::text[])`,[[...vals]]);contagem[t]=(contagem[t]||0)+res.rowCount;
  }
  // set null: linha ligada a vários registros DEMO (ou a um pedido DEMO) é derivada do DEMO -> apaga
  const porLinha=new Map();for(const s of setnull){const k=s[0]+'|'+s[3];if(!porLinha.has(k))porLinha.set(k,[]);porLinha.get(k).push(s);}
  for(const lista of porLinha.values()){const [t,,pk,id]=lista[0];
   if(alvo.get(t)?.get(pk)?.has(id))continue;
   const derivada=lista.length>1||fks.some(f=>f.filho===t&&f.pai==='separacoes_pedidos'&&lista.some(x=>x[1]===f.fcol));
   if(derivada){const res=await db.query(`delete from ${ident(t)} where ${ident(pk)}::text=$1`,[id]);contagem[t]=(contagem[t]||0)+res.rowCount;}
   else for(const [,c] of lista)await db.query(`update ${ident(t)} set ${ident(c)}=null where ${ident(pk)}::text=$1`,[id]);}
  // planilhas
  const abas=new Set();let gsn=0;
  for(const k of gs){const res=await db.query('delete from gs_linhas where planilha_id=$1 and aba=$2 and linha=$3',[k.planilha_id,k.aba,k.linha]);gsn+=res.rowCount;abas.add(k.planilha_id+'|'+k.aba);}
  for(const a of abas){const [p,aba]=a.split('|');await db.query('update gs_abas set versao=versao+1,atualizado_em=now() where planilha_id=$1 and nome=$2',[p,aba]);}
  contagem.gs_linhas=gsn;
  // configuração da produtividade comercial: tira os participantes fictícios
  const demoIds=m.participantes_demo||[];
  if(demoIds.length){
   const cfg=(await db.query('select config from comercial_prod_config where empresa_id=$1',[empresa])).rows[0]?.config;
   if(cfg){for(const k of ['participantes','acessos'])if(Array.isArray(cfg[k]))cfg[k]=cfg[k].filter(x=>!demoIds.includes(typeof x==='object'?(x.id||x.usuario_id||x.funcionario_id):x));
    if(!m.config_anterior&&!(cfg.participantes||[]).length)await db.query('delete from comercial_prod_config where empresa_id=$1',[empresa]);
    else await db.query('update comercial_prod_config set config=$2 where empresa_id=$1',[empresa,JSON.stringify(cfg)]);}
  }
  // ocorrências automáticas calculadas a partir dos registros DEMO (sem FK: chave e dados em texto)
  const todosIds=[...idsDe('separacoes_pedidos'),...idsDe('itens'),...idsDe('clientes_empresas'),...idsDe('funcionarios_acesso'),...idsDe('caminhoes'),...idsDe('operacao_etapas'),...idsDe('capas_modelos')];
  const casos=(await db.query(`select c.id from operacao_casos_automaticos c where exists(select 1 from unnest($1::text[]) i where c.chave like '%'||i||'%' or c.dados::text like '%'||i||'%')`,[todosIds])).rows.map(x=>x.id);
  for(const f of fks.filter(f=>f.pai==='operacao_casos_automaticos')){const res=await db.query(`delete from ${ident(f.filho)} where ${ident(f.fcol)}::text=any($1::text[])`,[casos]);contagem[f.filho]=(contagem[f.filho]||0)+res.rowCount;}
  contagem.operacao_casos_automaticos=(await db.query('delete from operacao_casos_automaticos where id::text=any($1::text[])',[casos])).rowCount;
  contagem.catalogo_creditos_movimentos=(await db.query('delete from catalogo_creditos_movimentos m where not exists(select 1 from catalogo_creditos_carteiras c where c.empresa_id=m.empresa_id and c.cliente_id=m.cliente_id)')).rowCount;
  await db.query('delete from sistema_demo_lotes where id=$1',[lote]);
  await db.query("set local session_replication_role=origin");
  console.log('Apagados:',JSON.stringify(contagem));
  // conferências
  const depois=await orfaos();
  const novos=Object.entries(depois).filter(([k,n])=>n>(antes[k]||0));
  console.log('FKs de várias colunas (não seguidas):',multi);
  console.log('Órfãos novos:',novos.length?JSON.stringify(novos):'nenhum');
  const tabs=(await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).rows.map(x=>x.relname);
  const sobras={};
  for(const t of tabs){const n=Number((await db.query(`select count(*) n from ${ident(t)} x where to_jsonb(x)::text like '%DEMO ·%' or to_jsonb(x)::text like '%${lote}%'`)).rows[0].n);if(n)sobras[t]=n;}
  console.log('Sobras com "DEMO":',JSON.stringify(sobras));
  if(novos.length)throw Error('Ficariam registros órfãos; nada foi gravado.');
  if(aplicar){await db.query('commit');console.log('GRAVADO.');}else{await db.query('rollback');console.log('ENSAIO: nada foi gravado.');}
 }catch(e){await db.query('rollback').catch(()=>{});console.error('ERRO:',e.message);process.exitCode=1;}
 finally{await db.end();}
})();
