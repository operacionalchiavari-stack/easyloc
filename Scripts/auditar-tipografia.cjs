const fs=require('node:fs'),path=require('node:path');
const write=process.argv.includes('--write'),changed=[];
function css(source){
  return source.replace(/([^{}]+)\{([^{}]*)\}/g,(all,selector,body)=>{
    const numero=/pedido-destaque|pedido-tag|ct-numero|item-requested\s+strong|kpi|metric|(?:valor|amount|percent|progress)[\w-]*\s*(?:strong|b)\b/.test(selector.replace(/\/\*[\s\S]*?\*\//g,''));
    body=body.replace(/(font-weight\s*:\s*)(\d+)/gi,(all,prefix,value)=>{
      const weight=Number(value);
      if(weight>700 || (weight===700 && !numero))return prefix+(numero?700:600);
      if(weight>600 && weight<700)return prefix+600;
      if(weight>500 && weight<600)return prefix+500;
      return all;
    });
    body=body.replace(/(font\s*:\s*)([789]\d{2})(?=\s)/gi,(_,prefix)=>prefix+(numero?700:600));
    return selector+'{'+body+'}';
  });
}
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,ent.name);if(ent.isDirectory()){walk(file);continue;}
  if(!/\.(css|html|js|mjs)$/.test(file))continue;
  // A apresentação pública do catálogo e documentos impressos mantêm sua tipografia própria.
  if(file.replaceAll('\\','/').includes('/Catalogo/'))continue;
  const old=fs.readFileSync(file,'utf8');
  let next=file.endsWith('.css')?css(old):old.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi,(all,body)=>all.replace(body,css(body)))
    .replace(/\bstyle=(['"])([\s\S]*?)\1/gi,(all,q,body)=>all.replace(body,body.replace(/(font-weight\s*:\s*)([789]\d{2})/gi,(_,prefix,value)=>prefix+(Number(value)>700?600:value))));
  if(next!==old){changed.push(file);if(write)fs.writeFileSync(file,next);}
}}
['Modulos','styles','js/ui','js/empresa','js/pedido'].forEach(walk);
console.log(JSON.stringify({arquivos:changed.length,gravado:write},null,2));
if(!write&&changed.length)process.exitCode=1;
