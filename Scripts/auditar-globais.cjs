// Audita os documentos, fragmentos e cores locais. --write aplica a migração de estilos.
const fs=require('node:fs');
const path=require('node:path');
const gravar=process.argv.includes('--write');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}}
walk('Modulos');
walk('styles');
walk('js/ui');
walk('js/empresa');
walk('js/pedido');
const normal=p=>p.replaceAll('\\','/');
const catalogo=p=>/Modulos\/Comercial\/Catalogo\//.test(normal(p));
// Exceção aprovada: Modelos de Contrato usa azul próprio, limitado ao editor.
const contratos=p=>/Modulos\/Comercial\/Contratos\//.test(normal(p));
function azul(cor){
  let text=cor.slice(1);if(text.length===3)text=text.split('').map(x=>x+x).join('');
  if(text.length!==6 && text.length!==8)return null;
  const rgb=[0,2,4].map(i=>parseInt(text.slice(i,i+2),16));
  const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
  if(delta<12 || b!==max)return null;
  const hue=60*((r-g)/delta+4);
  if(hue<190 || hue>260)return null;
  return {rgb,claro:(max+min)/510>0.8,escuro:max<90,alpha:text.length===8?parseInt(text.slice(6),16)/255:1};
}
function token(info,prop=''){
  if(info.alpha<1)return `rgba(var(--el-button-primary-rgb,125,96,61),${Number(info.alpha.toFixed(3))})`;
  if(info.escuro && /^(color|--(?:text|ink|muted|label|texto|cor-texto))/.test(prop))return 'var(--el-color-text,#1f2020)';
  if(info.claro)return 'var(--el-button-primary-soft,#f4efe8)';
  if(/(?:dark|hover|strong)/.test(prop))return 'var(--el-button-primary-hover,#654d31)';
  return 'var(--el-button-primary-bg,#7d603d)';
}
function css(text){
  // Cores de etapas identificam operações; não são cores de marca.
  const etapas=[];
  text=text.replace(/--etapa-[\w-]+\s*:[^;{}]+;|#portalInicio\s+\.rd-(?:triagem|carregamento|montagem|desmontagem|descarregamento)\s*\{[^{}]*\}|\.m-(?:carregamento|montagem)\s+\.(?:mobile-card|mobile-dot|mobile-etapa)\s*\{[^{}]*\}/g,rule=>`ETAPA_PRESERVADA_${etapas.push(rule)-1}_FIM`);
  return text.replace(/#[\da-f]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[.\d]+)?\s*\)/gi,(value,index)=>{
    let info;
    if(value[0]==='#')info=azul(value);
    else{const nums=value.match(/[.\d]+/g).map(Number);info=azul('#'+nums.slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join(''));if(info)info.alpha=nums.length===4?nums[3]:1;}
    if(!info && ['#7d603d','#7c6240','#7a5f3d','#654d31'].includes(value.toLowerCase())){
      const prefix=text.slice(0,index);
      if(prefix.lastIndexOf('var(')>prefix.lastIndexOf(')'))return value;
      return value.toLowerCase()==='#654d31'?'var(--el-button-primary-hover,#654d31)':'var(--el-button-primary-bg,#7d603d)';
    }
    if(!info)return value;
    const prop=text.slice(Math.max(0,index-400),index).match(/(?:^|[;{])\s*([-\w]+)\s*:[^;{}]*$/)?.[1]||'';
    return token(info,prop);
  }).replace(/ETAPA_PRESERVADA_(\d+)_FIM/g,(_,index)=>etapas[Number(index)]);
}
function js(text){
  let out='',i=0;
  while(i<text.length){
    const ch=text[i];
    if(text.startsWith('//',i)){const end=text.indexOf('\n',i);const stop=end<0?text.length:end;out+=text.slice(i,stop);i=stop;continue;}
    if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);const stop=end<0?text.length:end+2;out+=text.slice(i,stop);i=stop;continue;}
    if(ch!=="'" && ch!=='"' && ch!=='`'){out+=ch;i++;continue;}
    let end=i+1;while(end<text.length){if(text[end]==='\\'){end+=2;continue;}if(text[end]===ch)break;end++;}
    const value=text.slice(i+1,end),info=/^#[\da-f]{3,8}$/i.test(value)?azul(value):null;
    if(ch!=='`' && info && !info.escuro){const role=info.claro?'soft':'accent';out+=`(window.EasyLocTheme?.color?.('${role}') || '${info.claro?'#f4efe8':'#7d603d'}')`;}
    else out+=text.slice(i,end+1);
    i=end+1;
  }
  return out;
}
const paginas=[],alterados=[];
for(const file of files){
  if(!/\.(html|css|js|mjs)$/.test(file))continue;
  if(normal(file)==='styles/tokens.css')continue;
  let text=fs.readFileSync(file,'utf8'),novo=text;
  const pagina=file.endsWith('.html');
  const doc=pagina && /<head[\s>]/i.test(text);
  const redirect=doc && (/<body[^>]*>\s*(?:<a[^>]*>[^<]*<\/a>)?\s*<\/body>/i.test(text) || /\/index\.html$/i.test(normal(file)));
  // A migração de cores antiga é opcional. A política atual é auditada por auditar-identidade.cjs.
  if(process.argv.includes('--migrate-legacy-colors') && !catalogo(file) && !contratos(file)){
    if(file.endsWith('.css'))novo=css(novo);
    else if(/\.(js|mjs)$/.test(file))novo=js(novo);
    else{
      novo=novo.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi,(all,body)=>all.replace(body,css(body)));
      novo=novo.replace(/\bstyle=(['"])([\s\S]*?)\1/gi,(all,quote,body)=>all.replace(body,css(body)));
      novo=novo.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,body)=>/src\s*=|importmap|application\/json/i.test(attrs)?all:all.replace(body,js(body)));
    }
  }
  if(doc && !redirect){
    const prefix=normal(path.relative(path.dirname(file),'.'))+'/';
    const local=p=>prefix+p;
    if(!/themePrepaint\.js/.test(novo))novo=novo.replace(/(<head[^>]*>)/i,`$1\n<script src="${local('js/core/themePrepaint.js')}?v=20261019-globais"></script>`);
    if(!/styles\/(?:global|tokens)\.css/.test(novo))novo=novo.replace(/(<head[^>]*>)/i,`$1\n<link rel="stylesheet" href="${local('styles/tokens.css')}?v=20261019-globais">`);
    const legado=!/styles\/global\.css/.test(text) && !catalogo(file);
    if(legado){novo=novo.replace(/<html\b(?![^>]*data-theme-legacy)/i,'<html data-theme-legacy');if(!/theme-compat\.css/.test(novo))novo=novo.replace(/<\/head>/i,`<link rel="stylesheet" href="${local('styles/theme-compat.css')}?v=20261019-globais">\n</head>`);}
    if(!/companyTheme\.js/.test(novo)){
      const marca=/<script\b[^>]*themePrepaint\.js[^>]*><\/script>/i;
      novo=novo.replace(marca,all=>all+`\n<script src="${local('js/core/companyTheme.js')}?v=20261019-globais"></script>\n<script src="${local('js/core/moduleTheme.js')}?v=20261019-globais"></script>`);
    }
    if(!/moduleTheme\.js/.test(novo))novo=novo.replace(/<\/body>/i,`<script src="${local('js/core/moduleTheme.js')}?v=20261019-globais"></script>\n</body>`);
  }
  if(novo!==text){alterados.push(normal(file));if(gravar)fs.writeFileSync(file,novo);}
  if(pagina)paginas.push({pagina:normal(file),tipo:!doc?'fragmento':redirect?'redirecionamento':catalogo(file)?'catalogo':'sistema',tema:redirect||!doc?'herdado':/moduleTheme\.js/.test(gravar?novo:text)?'integrado':'pendente'});
}
const resultado={paginas:paginas.length,documentos:paginas.filter(p=>!['fragmento','redirecionamento'].includes(p.tipo)).length,pendentes:paginas.filter(p=>p.tema==='pendente'),arquivosComAjustes:alterados,paginasAuditadas:paginas};
if(process.argv.includes('--json'))console.log(JSON.stringify(resultado,null,2));
else console.log(JSON.stringify({paginas:resultado.paginas,documentos:resultado.documentos,pendentes:resultado.pendentes.length,arquivosComAjustes:alterados.length,gravado:gravar},null,2));
if(!gravar && (resultado.pendentes.length || alterados.length))process.exitCode=1;
