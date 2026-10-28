const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {decifrar,restaurarVerificar}=require('./backup-operacional.cjs');
async function executar(dir){
 if(!dir)throw Error('Informe a pasta do artefato baixado');
 const arquivo=fs.readdirSync(dir).find(n=>/^acervo-.*\.json\.gz\.enc$/.test(n));if(!arquivo)throw Error('Snapshot cifrado não encontrado');
 const key=process.env.ACERVO_BACKUP_KEY?Buffer.from(process.env.ACERVO_BACKUP_KEY,'base64'):fs.readFileSync(process.env.ACERVO_BACKUP_KEY_FILE||path.join(process.env.LOCALAPPDATA||require('os').homedir(),'Acervo/backup.key'));
 const snapshot=JSON.parse(zlib.gunzipSync(decifrar(fs.readFileSync(path.join(dir,arquivo)),key))),r=await restaurarVerificar(snapshot);
 const objetos=snapshot.tabelas.find(t=>t.esquema==='storage'&&t.tabela==='objects')?.linhas||[];let arquivos=0;
 for(const obj of objetos){const id=crypto.createHash('sha256').update(obj.bucket_id+'/'+obj.name+':'+(obj.updated_at||obj.created_at||'')).digest('hex'),file=path.join(dir,'arquivos',id+'.enc');if(!fs.existsSync(file))throw Error('Arquivo de mídia ausente na cópia recuperada');const dados=decifrar(fs.readFileSync(file),key);if(obj.metadata?.size!=null&&Number.isFinite(Number(obj.metadata.size))&&dados.length!==Number(obj.metadata.size))throw Error('Tamanho divergente em arquivo recuperado');arquivos++;}
 console.log(JSON.stringify({...r,arquivos,recuperacao_artefato:true}));
}
module.exports={executar};if(require.main===module)executar(process.argv[2]).catch(e=>{console.error('Recuperação não validada: '+e.message);process.exitCode=1;});
