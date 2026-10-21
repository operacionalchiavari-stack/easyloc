// Identidade configurável apenas nos controles de ação e no menu.
const fs=require('node:fs');
const path=require('node:path');
const write=process.argv.includes('--write');
const brand=/var\(--(?:el-button-primary[^,)]*|el-color-(?:accent|primary)[^,)]*|color-primary|color-sidebar|accent(?:-\w+)?|ch-primary[^,)]*|primary(?:-\w+)?|azul(?:-\w+)?|laranja|empresa-cor-principal-rgb)/i;
const action=selector=>/\bbutton\b|role\s*=\s*["']?(?:button|tab)|\.[\w-]*(?:btn|button|sidebar|submenu|dropdown|menu-|tab(?:-|\b))[\w-]*|#(?:sidebar|novoAvisoPortal)/i.test(selector);
function neutral(value,kind){
  if(kind==='color'||kind==='fill')return 'var(--el-color-text,#1f2020)';
  if(kind==='muted')return 'var(--el-color-muted,#6b6b6b)';
  if(kind.includes('border')||kind.includes('outline'))return value.replace(/var\(--(?:el-button-primary|el-color-accent|el-color-primary|color-primary|color-sidebar|accent|ch-primary|primary|azul)[\w-]*(?:,[^()]*)?\)/g,'var(--el-color-border,#e3e7ec)');
  return value.replace(/var\(--(?:el-button-primary-rgb|empresa-cor-principal-rgb)(?:,[^()]*)?\)/g,'31,32,32')
    .replace(/var\(--(?:el-button-primary|el-color-accent|el-color-primary|color-primary|color-sidebar|accent|ch-primary|primary|azul)[\w-]*(?:,[^()]*)?\)/g,'var(--el-color-surface-soft,#f6f7f9)');
}
function declarations(body,selector=''){
  return body.replace(/(^|;)(\s*)([\w-]+)(\s*:\s*)([^;]+)/g,(all,start,space,prop,sep,value)=>{
    const textoMarca=(prop==='color'||/muted|texto|text|label/.test(prop)) && /#(?:7d603d|7c6240|7a5f3d|987953|9b845f)\b/i.test(value);
    if(!brand.test(value) && !textoMarca)return all;
    const important=/\s*!important\s*$/.test(value)?' !important':'';
    let next=value;
    if(prop.startsWith('--')){
      if(/(?:muted|secundario|placeholder)/i.test(prop))next=neutral(value,'muted')+important;
      else if(/(?:text|texto|ink|label)/i.test(prop) && !/(?:button|on-accent|menu)/i.test(prop))next=neutral(value,'color')+important;
      else if(/(?:shadow|sombra|border|borda|line|surface|fundo|focus)/i.test(prop))next=neutral(value,prop);
    }else if(!action(selector)){
      if(prop==='color'||prop==='fill')next=neutral(value,prop)+important;
      else if(/^(?:background(?:-color)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow|text-shadow|stroke)$/.test(prop))next=neutral(value,prop);
    }
    return start+space+prop+sep+next;
  });
}
function css(source){return source.replace(/([^{}]+)\{([^{}]*)\}/g,(all,selector,body)=>{
  let next=declarations(body,selector);
  if(!action(selector) && /background(?:-color)?\s*:\s*var\(--el-color-surface-soft/.test(next)){
    next=next.replace(/(^|;)\s*color\s*:\s*(?:#fff(?:fff)?|white)(\s*!important)?(?=\s*(?:;|$))/gi,(_,start,important)=>start+'color:var(--el-color-text,#1f2020)'+(important||''));
  }
  return selector+'{'+next+'}';
});}
const changed=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,ent.name);
  if(ent.isDirectory()){walk(file);continue;}
  if(!/\.(css|html|js|mjs)$/.test(file)||file.endsWith('tokens.css'))continue;
  // Modelos de Contrato mantém a exceção azul solicitada, independente da empresa.
  if(file.replaceAll('\\','/').includes('/Contratos/'))continue;
  let old=fs.readFileSync(file,'utf8'),next=old;
  if(file.endsWith('.css'))next=css(old);
  else{
    next=next.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi,(all,body)=>all.replace(body,css(body)));
    next=next.replace(/\bstyle=(['"])([\s\S]*?)\1/gi,(all,q,body)=>all.replace(body,declarations(body)));
  }
  if(next!==old){changed.push(file);if(write)fs.writeFileSync(file,next);}
}}
['Modulos','styles','js/ui','js/empresa','js/pedido'].forEach(walk);
console.log(JSON.stringify({arquivos:changed.length,gravado:write,alterados:changed},null,2));
if(!write&&changed.length)process.exitCode=1;
