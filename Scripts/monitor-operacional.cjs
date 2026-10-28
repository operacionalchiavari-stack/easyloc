const {createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
async function executar(){
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(u,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(30000)})}});
 const {data:empresas,error}=await sb.from('empresas').select('id');if(error)throw Error('Falha ao consultar a saúde do banco');
 const falhas=[];
 for(const e of empresas||[]){const {data,error}=await sb.from('sistema_backups').select('criado_em,verificado,arquivos_pendentes').eq('empresa_id',e.id).order('criado_em',{ascending:false}).limit(1);const b=data?.[0];if(error||!b||!b.verificado||b.arquivos_pendentes||Date.now()-new Date(b.criado_em).getTime()>36*3600000)falhas.push('Backup ausente, incompleto ou antigo para uma empresa');}
 if(process.env.ACERVO_APP_URL){const u=new URL(process.env.ACERVO_APP_URL);if(u.protocol!=='https:')throw Error('O monitor exige HTTPS');const r=await fetch(u,{signal:AbortSignal.timeout(30000),redirect:'follow'});if(!r.ok)falhas.push('A página de entrada não respondeu corretamente');}
 if(process.env.ACERVO_BACKUP_REPOSITORY){
  const r=await fetch('https://api.github.com/repos/'+process.env.ACERVO_BACKUP_REPOSITORY+'/actions/artifacts?per_page=30',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
  if(!r.ok)falhas.push('Não foi possível verificar as cópias remotas');else{const b=await r.json();if(!b.artifacts?.some(a=>a.name.startsWith('acervo-')&&!a.expired&&Date.now()-new Date(a.created_at).getTime()<36*3600000))falhas.push('Não há artefato remoto recente disponível para recuperação');}
 }
 if(falhas.length)throw Error([...new Set(falhas)].join('; '));console.log('Monitor: banco acessível e cópias recentes verificadas para '+(empresas||[]).length+' empresa(s).');
}
module.exports={executar};if(require.main===module)executar().catch(e=>{console.error('Monitor: '+e.message);process.exitCode=1;});
