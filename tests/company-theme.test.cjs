const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function ambiente(cache){
  const props=new Map();
  const storage=new Map(cache?[['easyloc_theme_e1',JSON.stringify(cache)]]:[]);
  const contexto={console,document:{documentElement:{style:{setProperty:(k,v)=>props.set(k,v)}},getElementById:()=>null,body:{classList:{add(){},toggle(){}}}},
    sessionStorage:{getItem:()=> 'e1'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
  contexto.window={__CONTEXT:{empresa_id:'e1'}};vm.createContext(contexto);
  return {contexto,props,storage};
}
test('cores personalizadas persistem e o fundo ignora valores antigos',()=>{
  const {contexto,props,storage}=ambiente();
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const theme=contexto.window.EasyLocTheme;
  theme.applyTheme({cor_sidebar:'#123456',cor_destaque:'#246b48',cor_fundo:'#ff0000'});
  assert.equal(props.get('--color-sidebar'),'#123456');
  assert.equal(props.get('--el-button-primary-bg'),'#246b48');
  assert.equal(props.get('--color-bg'),'#f3f5f6');
  assert.equal(JSON.parse(storage.get('easyloc_theme_e1')).cor_fundo,'#f3f5f6');
  assert.equal(theme.validateTheme({cor_destaque:'invalid'}).theme.cor_destaque,'#7d603d');
});
test('primeira pintura aplica o cache de cores mantendo o cinza fixo',()=>{
  const {contexto,props}=ambiente({cor_sidebar:'#123456',cor_destaque:'#246b48',cor_fundo:'#ff0000'});
  vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
  assert.equal(props.get('--color-sidebar'),'#123456');
  assert.equal(props.get('--el-button-primary-bg'),'#246b48');
  assert.equal(props.get('--color-bg'),'#f3f5f6');
});
test('troca de identidade mantém as cores de texto fixas',()=>{
  const {contexto,props}=ambiente();
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const theme=contexto.window.EasyLocTheme;
  const tokens=['--el-color-title','--el-color-text','--el-color-text-secondary','--el-color-muted','--el-color-placeholder'];
  theme.applyTheme({cor_sidebar:'#123456',cor_destaque:'#246b48'});
  const antes=tokens.map(key=>props.get(key));
  theme.applyTheme({cor_sidebar:'#541234',cor_destaque:'#8b3d56'});
  assert.deepEqual(tokens.map(key=>props.get(key)),antes);
  assert.equal(props.get('--el-button-primary-bg'),'#8b3d56');
});
test('tema carregado da empresa inclui as duas cores salvas',async()=>{
  const {contexto,props}=ambiente();
  let campos;
  contexto.window.supabaseClient={from(){const q={select(value){campos=value;return q},eq(){return q},maybeSingle:async()=>({data:{cor_sidebar:'#123456',cor_destaque:'#246b48',cor_fundo:'#ff0000'},error:null})};return q;}};
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  await contexto.window.EasyLocTheme.applyForEmpresa('e1');
  assert.ok(campos.includes('cor_sidebar') && campos.includes('cor_destaque'));
  assert.equal(props.get('--el-button-primary-bg'),'#246b48');
  assert.equal(props.get('--el-color-bg'),'#f3f5f6');
});
