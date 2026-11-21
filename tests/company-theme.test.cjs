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

test('destaques herdam a cor do menu com contraste em paletas claras, escuras e intermediárias',()=>{
  const {contexto,props}=ambiente();
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const api=contexto.window.EasyLocTheme;
  for(const color of ['#1e2c46','#173f37','#46206b','#5a5a55','#ffffff','#f7e9ba','#777777','#ff0000','#00ff00','#0000ff','#000000']){
    api.applyTheme({cor_sidebar:color});
    const palette=api.portalPalette(color);
    assert.equal(props.get('--portal-hero-bg'),color);
    for(const role of ['text','muted','accent'])for(const surface of ['bg','glow','soft'])assert.ok(api.contrast(palette[surface],palette[role])>=4.5,`${role} em ${surface} de ${color}`);
    assert.ok(api.contrast(palette.bg,palette.art)>=3,`ilustração em ${color}`);
    assert.ok(api.contrast(palette.paper,palette.ink)>=4.5,`papel em ${color}`);
    assert.equal(props.get('--el-color-text'),'#142033','texto das telas operacionais preservado');
  }
});

test('menu superior e previa usam o cinza atual no lugar do antigo padrao lateral',()=>{
  const {contexto,props}=ambiente({cor_sidebar:'#290610'});
  vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
  assert.equal(props.get('--color-sidebar'),'#5a5a55');
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const theme=contexto.window.EasyLocTheme;
  assert.equal(theme.DEFAULT_THEME.cor_sidebar,'#5a5a55');
  assert.equal(theme.validateTheme({cor_sidebar:'#290610'}).theme.cor_sidebar,'#5a5a55');
  theme.applyTheme({cor_sidebar:'#123456'});
  assert.equal(props.get('--color-sidebar'),'#123456');
  const css=fs.readFileSync('styles/menu-topo.css','utf8');
  assert.ok(!css.includes('background:#5a5a55'));
  assert.ok(css.includes('background:var(--color-sidebar,#5a5a55)'));
});
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
  assert.ok(campos === '*' || (campos.includes('cor_sidebar') && campos.includes('cor_destaque')));
  assert.equal(props.get('--el-button-primary-bg'),'#246b48');
  assert.equal(props.get('--el-color-bg'),'#f3f5f6');
});

test('tema festivo muda a interface, mantém as cores originais no cache e pode ser removido',()=>{
  const {contexto,props,storage}=ambiente();
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const theme=contexto.window.EasyLocTheme;
  for (const id of ['carnaval','natal','pascoa','ano_novo']) {
    theme.applyTheme({cor_sidebar:'#123456',cor_destaque:'#246b48',tema_festivo:id,tema_festivo_inicio:'2020-01-01',tema_festivo_fim:'2099-12-31'});
    assert.equal(props.get('--color-sidebar'),theme.FESTIVE_THEMES[id].cor_sidebar);
    assert.equal(props.get('--el-button-primary-bg'),theme.FESTIVE_THEMES[id].cor_destaque);
    assert.equal(contexto.window.__COMPANY_THEME.cor_destaque,'#246b48','impressão usa a cor original');
    const cached=JSON.parse(storage.get('easyloc_theme_e1'));
    assert.equal(cached.cor_sidebar,'#123456');
    assert.equal(cached.tema_festivo,id);
    vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
    assert.equal(props.get('--el-button-primary-bg'),theme.FESTIVE_THEMES[id].cor_destaque,'primeira pintura mantém o tema festivo');
  }
  theme.applyTheme({cor_sidebar:'#123456',cor_destaque:'#246b48',tema_festivo:''});
  assert.equal(props.get('--color-sidebar'),'#123456');
  assert.equal(props.get('--el-button-primary-bg'),'#246b48');
  assert.equal(theme.validateTheme({tema_festivo:'desconhecido'}).theme.tema_festivo,'');
  assert.equal(theme.validateTheme({tema_festivo:'__proto__'}).theme.tema_festivo,'');
});

test('período inclui o primeiro e o último dia e respeita o fuso de Brasília',()=>{
  const {contexto}=ambiente();
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const api=contexto.window.EasyLocTheme;
  const scheduled={tema_festivo:'natal',tema_festivo_inicio:'2026-12-20',tema_festivo_fim:'2026-12-25'};
  for (const [day,active] of [['2026-12-19',false],['2026-12-20',true],['2026-12-25',true],['2026-12-26',false]]) {
    assert.equal(Boolean(api.activeFestiveTheme(scheduled,day)),active,day);
  }
  assert.equal(api.todayISO(new Date('2026-12-26T02:59:59Z')),'2026-12-25');
  assert.equal(api.todayISO(new Date('2026-12-26T03:00:00Z')),'2026-12-26');
  assert.equal(api.validateTheme({tema_festivo:'natal'}).ok,false);
  assert.equal(api.validateTheme({...scheduled,tema_festivo_fim:'2026-12-19'}).ok,false);
  assert.equal(api.validateTheme({...scheduled,tema_festivo_inicio:'2026-02-30'}).ok,false);
  assert.equal(api.validateTheme({...scheduled,tema_festivo_inicio:'2028-02-29',tema_festivo_fim:'2028-02-29'}).ok,true);
  assert.equal(api.validateTheme({tema_festivo:''}).ok,true);
});

test('tema agendado entra e sai com a página aberta e o cache não antecipa nem prolonga o período',()=>{
  const {contexto,props,storage}=ambiente();
  let now='2026-12-19T15:00:00Z',tick;
  contexto.Date=class extends Date {constructor(...args){super(...(args.length?args:[now]));}};
  contexto.window.setInterval=callback=>{tick=callback;return 1;};
  contexto.window.clearInterval=()=>{};
  vm.runInContext(fs.readFileSync('js/core/companyTheme.js','utf8'),contexto);
  const api=contexto.window.EasyLocTheme;
  api.applyTheme({cor_sidebar:'#123456',cor_destaque:'#246b48',tema_festivo:'natal',tema_festivo_inicio:'2026-12-20',tema_festivo_fim:'2026-12-25'});
  assert.equal(props.get('--color-sidebar'),'#123456');
  assert.equal(JSON.parse(storage.get('easyloc_theme_e1')).tema_festivo_inicio,'2026-12-20');
  vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
  assert.equal(props.get('--color-sidebar'),'#123456','primeira pintura antes do início');
  now='2026-12-20T03:00:00Z';
  vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
  assert.equal(props.get('--color-sidebar'),'#173f37','cache de programação já permite a primeira pintura correta no início');
  tick();assert.equal(props.get('--color-sidebar'),'#173f37','ativa sem recarregar');
  now='2026-12-26T03:00:00Z';tick();
  assert.equal(props.get('--color-sidebar'),'#123456','retira sem recarregar');
  vm.runInContext(fs.readFileSync('js/core/themePrepaint.js','utf8'),contexto);
  assert.equal(props.get('--color-sidebar'),'#123456','cache vencido não reaplica o tema');
  assert.equal(contexto.window.__COMPANY_THEME.cor_destaque,'#246b48');
});
