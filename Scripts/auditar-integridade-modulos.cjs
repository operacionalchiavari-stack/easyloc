const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const vm=require('node:vm');
if(!vm.SourceTextModule){const r=spawnSync(process.execPath,['--experimental-vm-modules',__filename],{stdio:'inherit',windowsHide:true});process.exit(r.status??1);}
const raiz=path.resolve(__dirname,'..'),out=path.join(raiz,'.tmp/auditoria-final');fs.mkdirSync(out,{recursive:true});
const arquivos=[];function walk(dir){for(const e of fs.readdirSync(path.join(raiz,dir),{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(!/^(vendor|libs|node_modules|pdfjs|three)$/i.test(e.name))walk(p);}else if(/\.(html|m?js|cjs)$/.test(e.name))arquivos.push(p);}}
for(const d of ['Modulos','js','api','server'])walk(d);for(const n of fs.readdirSync(raiz))if(/\.html$/.test(n))arquivos.push(n);
const erros=[],referencias=[],sintaxe=[];
function check(p,s,modulo=false){try{if(modulo)new vm.SourceTextModule(s,{identifier:p});else new vm.Script(s,{filename:p});}catch(e){erros.push({arquivo:p,tipo:'sintaxe',detalhe:e.stack.slice(0,1500)});}sintaxe.push(p);}
for(const p of arquivos){const s=fs.readFileSync(path.join(raiz,p),'utf8');
 for(const m of s.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){const v=m[1].split(/[?#]/)[0];if(/[${}]/.test(v))continue;const destino=path.resolve(path.dirname(path.join(raiz,p)),v);referencias.push({arquivo:p,referencia:m[1]});if(!fs.existsSync(destino))erros.push({arquivo:p,tipo:'import_ausente',referencia:m[1]});}
 if(!p.endsWith('.html')){check(p,s,p.endsWith('.mjs')||/^\s*(?:import\s+(?:[\w{*]|['"])|export\s+)/m.test(s));continue;}
 for(const m of s.matchAll(/<(script|link)\b([^>]*)>/gi)){const v=m[2].match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];if(!v||/^(https?:|\/\/|data:|blob:|#)/i.test(v)||/[${}<>]/.test(v))continue;const local=decodeURIComponent(v.split(/[?#]/)[0]);const destino=path.resolve(local.startsWith('/')?raiz:path.dirname(path.join(raiz,p)),'.'+(local.startsWith('/')?local:'/'+local));referencias.push({arquivo:p,referencia:v});if(!fs.existsSync(destino))erros.push({arquivo:p,tipo:'recurso_ausente',referencia:v});}
 for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=/.test(m[1])||/\btype\s*=\s*["'](?:application\/[^"']+|importmap)/i.test(m[1])||!m[2].trim())continue;check(p+'#inline',m[2],/\btype\s*=\s*["']module["']/i.test(m[1]));}}
const r={arquivos:arquivos.length,scriptsVerificados:sintaxe.length,referenciasLocais:referencias.length,erros};fs.writeFileSync(path.join(out,'integridade.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r));process.exitCode=erros.length?1:0;
