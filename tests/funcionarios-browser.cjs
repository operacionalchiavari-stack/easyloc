const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const catalog = [
 ['rh.funcionarios.visualizar', 'Cadastros', 'Funcionários', 'Ver funcionários'],
 ['rh.funcionarios.criar', 'Cadastros', 'Funcionários', 'Cadastrar funcionário'],
 ['rh.funcionarios.editar', 'Cadastros', 'Funcionários', 'Editar funcionário'],
 ['configuracoes.permissoes.editar', 'Configurações', 'Permissões', 'Gerenciar permissões'],
 ['comercial.catalogo.visualizar', 'Comercial', 'Catálogo', 'Acessar catálogo'],
 ['financeiro.fluxo.visualizar', 'Financeiro', 'Fluxo de caixa', 'Visualizar fluxo'],
 ['financeiro.fluxo.editar', 'Financeiro', 'Fluxo de caixa', 'Editar fluxo'],
].map(([chave,modulo,submodulo,descricao]) => ({chave,modulo,submodulo,descricao}));
(async () => {
 const server = http.createServer((req,res) => {
   const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
   if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
   const ext = path.extname(file); res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[ext] || 'text/plain');
   res.end(fs.readFileSync(file));
 });
 await new Promise(r => server.listen(0,'127.0.0.1',r));
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',e => errors.push(e.message));
  await page.route('https://**/*',r => r.fulfill({contentType:'text/javascript',body:''}));
  const iconFixture=path.join(os.tmpdir(),'funcionarios-lucide.js');
  if(fs.existsSync(iconFixture)) await page.route('https://unpkg.com/lucide@*/**',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(iconFixture,'utf8')}));
  await page.route('**/js/core/context.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.aguardarContexto=async()=>window.__CONTEXT'}));
  await page.route('**/js/core/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.addInitScript(({catalog}) => {
   window.__CONTEXT={empresa_id:'company',usuario_id:'owner'};
   window.fixtureEmployees=[{id:'employee',nome:'Ana Silva',setor:'Comercial',cargo:'Consultora',login:'ana',email:'ana@example.com',nivel_acesso:'Visualizador',ativo:true,foto_url:'',telefone:'',cpf:'•••.•••.•••-09',salario_mascara:'R$ ••••••',protegidos:['cpf','salario'],pode_revelar:true}];
   window.fixturePermission=[];window.fixtureAccess=true;window.fixtureAdmin=true;window.saved=[];
   window.supabaseClient={
    storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})},
    rpc:async(name)=>({data:name==='funcionario_contexto'?{ativo:window.fixtureAccess,administrador_legado:window.fixtureAdmin}:name==='funcionarios_listar'?window.fixtureEmployees:catalog.map(p=>({...p,permitido:window.fixturePermission.includes(p.chave)}))}),
    from:(table)=>{const query={select:()=>query,eq:()=>query,order:async()=>({data:table==='rh_cadastro_opcoes'?[{tipo:'setor',nome:'Comercial',ativo:true},{tipo:'cargo',nome:'Consultora',ativo:true}]:catalog})};return query;},
    functions:{invoke:async(name,{body})=>{window.saved.push({...body,funcao:name});return name==='rh-protegido'?{data:{valores:{cpf:'12345678909'}}}:{data:{id:'new'}};}}
   };
   window.alerta=(text)=>{window.lastAlert=text};
   window.google={maps:{places:{Autocomplete:class{constructor(input,opcoes){window.__places={input:input.id,opcoes};window.__autocomplete=this;}addListener(nome,fn){this.listener=fn;}getPlace(){return {formatted_address:'Rua das Flores, 120 - Centro, Rio de Janeiro - RJ, Brasil'};}}}}};
  },{catalog});
  await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/RH/CadastroFuncionarios/cadastro-funcionarios.html`);
  await page.locator('#funcTotal').filter({hasText:'1'}).waitFor();
  assert.equal(await page.locator('.table-group-row').textContent(),'Comercial1');
  await page.screenshot({path:path.join(os.tmpdir(),'chiavari-funcionarios-lista.png')});
  await page.locator('#funcBusca').click();await page.locator('#funcBusca').fill('ninguemencontrado');assert.equal(await page.locator('[data-funcionario-id=employee]').count(),0);assert.equal(await page.locator('#funcTotal').innerText(),'1');
  await page.locator('#funcBusca').fill('ana');assert.equal(await page.locator('[data-funcionario-id=employee]').count(),1);await page.locator('#funcBusca').fill('');
  await page.locator('#newFuncionarioBtn').click();
  assert.equal(await page.locator('#funcionariosView').isVisible(),false);assert.equal(await page.locator('#funcionarioFormCard').getAttribute('role'),null);assert.equal(await page.locator('#funcionarioFormCard').evaluate(el=>getComputedStyle(el).position),'static');
  assert.equal(await page.locator('#funcionariosTableBody button').count(),0);
  assert.deepEqual(await page.locator('#funcSetor option').allTextContents(),['Selecione','Comercial']);
  assert.deepEqual(await page.locator('#funcCargo option').allTextContents(),['Selecione','Consultora']);
  assert.equal(await page.locator('#funcAcesso').inputValue(),'false');
  assert.equal(await page.locator('#funcLogin').isVisible(),false);
  await page.locator('#funcAcesso').selectOption('true');
  await page.locator('#funcNome').fill('Maria Teste');
  await page.locator('#funcSetor').selectOption('Comercial');
  await page.locator('#funcLogin').fill('maria.teste');
  await page.locator('#funcSenha').fill('StrongPassword!');
  await page.locator('#funcWarehousePin').fill('0123');
  await page.locator('#funcEmail').fill('maria@example.com');
  await page.locator('#funcNivel').selectOption('Financeiro');
  await page.locator('#funcSalario').fill('345678');assert.match(await page.locator('#funcSalario').inputValue(),/3\.456,78/);
  await page.locator('#funcTelefone').fill('21999999999');
  assert.match(await page.locator('label').filter({has:page.locator('#funcTelefone')}).innerText(),/Contato de emerg/i);
  await page.locator('#funcEndereco').focus();await page.waitForFunction(()=>window.__autocomplete);
  await page.evaluate(()=>__autocomplete.listener());assert.match(await page.locator('#funcEndereco').inputValue(),/Rua das Flores/);
  assert.equal(await page.evaluate(()=>__places.input),'funcEndereco');

  assert.equal(await page.locator('[data-permission-item]:checked').count(),2);
  const group=page.locator('.permission-module').filter({hasText:'Fluxo de caixa'});
  await group.locator('[data-permission-item]').first().uncheck();
  assert.equal(await group.locator('[data-module-toggle]').evaluate(e=>e.indeterminate),true);
  await group.locator('[data-module-toggle]').check();
  const png = await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL().split(',')[1]});
  await page.locator('#funcFotoInput').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelector('#funcFotoPreview').src.startsWith('data:image/jpeg'));
  await page.screenshot({path:path.join(os.tmpdir(),'chiavari-funcionarios-modal.png')});
  await page.locator('#saveFuncionarioBtn').click();
  await page.waitForFunction(()=>window.saved.some(x=>x.action==='save'));
  const saved=await page.evaluate(()=>window.saved.find(x=>x.action==='save'));
  assert.equal(saved.employee.pin,'0123');assert.ok(saved.photo.startsWith('data:image/jpeg'));assert.equal(saved.permissions.length,2);
  await page.locator('.el-alert-stack .el-alert').waitFor();assert.equal(await page.locator('.el-alert-confirm').count(),0);await page.locator('.el-alert-stack .secondary').click();
  assert.equal(await page.locator('#funcMessage').isVisible(),false);
  await page.locator('[data-funcionario-id=employee]').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#funcSenha').inputValue(),'');
  assert.equal(await page.locator('#funcSenha').getAttribute('required'),null);
  const primeiroSalvo=await page.evaluate(()=>saved.find(x=>x.action==='save').employee);
  assert.equal(primeiroSalvo.salario_bruto,'3456.78');assert.equal(primeiroSalvo.telefone,'21999999999');assert.match(primeiroSalvo.dados_rh.endereco,/Rua das Flores/);
  // Cofre: CPF e salário protegidos chegam vazios, com a máscara de dica, e não vão no salvar se ninguém mexer
  assert.equal(await page.locator('#funcCpf').inputValue(),'');
  assert.match(await page.locator('#funcCpf').getAttribute('placeholder'),/•••-09.*protegido/);
  assert.match(await page.locator('#funcSalario').getAttribute('placeholder'),/••••••.*protegido/);
  await page.locator('[data-func-status=Inativo]').click();
  await page.locator('#saveFuncionarioBtn').click();
  await page.waitForFunction(()=>window.saved.filter(x=>x.action==='save').length===2);
  const editado=await page.evaluate(()=>window.saved.filter(x=>x.action==='save')[1].employee);
  assert.equal(editado.ativo,false);
  assert.ok(!('cpf' in editado) && !('salario_bruto' in editado),'campo protegido sem mexer não é enviado');
  await page.locator('.el-alert-stack .el-alert').waitFor();assert.equal(await page.locator('.el-alert-confirm').count(),0);await page.locator('.el-alert-stack .secondary').click();
  assert.equal(await page.locator('#funcMessage').isVisible(),false);
  await page.locator('[data-funcionario-id=employee]').click();
  await page.locator('#funcCpf + .cofre-ver').click();
  await page.waitForFunction(()=>document.getElementById('funcCpf').value==='12345678909');
  assert.ok(await page.evaluate(()=>window.saved.some(x=>x.funcao==='rh-protegido'&&x.action==='revelar'&&x.campos[0]==='cpf'&&x.funcionario_id==='employee')));
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{fixtureAdmin=false;fixturePermission=['rh.funcionarios.visualizar','rh.funcionarios.criar'];const p=EasyLocPermissions;p._cache.loaded=false;p._cache.loading=null;await p.load();});
  await page.locator('[data-funcionario-id=employee]').click();
  assert.equal(await page.locator('#funcNome').isDisabled(),true);assert.equal(await page.locator('[data-func-status=Inativo]').isDisabled(),true);
  assert.equal(await page.locator('#saveFuncionarioBtn').isVisible(),false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-funcionario-id=employee]').evaluate(e=>e===document.activeElement),true);
  await page.evaluate(async()=>{fixtureAdmin=true;const p=EasyLocPermissions;p._cache.loaded=false;p._cache.loading=null;await p.load();});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#newFuncionarioBtn').click();
  const geometry=await page.locator('.cadastro-form-card').boundingBox();
  assert.ok(geometry.x>=0 && geometry.x+geometry.width<=391);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(os.tmpdir(),'chiavari-funcionarios-mobile.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{window.fixtureAdmin=false;window.fixturePermission=[];const p=window.EasyLocPermissions;p._cache.loaded=false;p._cache.loading=null;await p.load();});
  assert.equal(await page.evaluate(()=>window.EasyLocPermissions.hasPermission('financeiro.fluxo.visualizar')),false);
  assert.equal(await page.evaluate(()=>window.EasyLocPermissions.canNavigate('/Modulos/Financeiro/fluxodecaixa.html')),false);
  assert.equal(await page.evaluate(()=>window.EasyLocPermissions.hasPermission('rh.funcionarios.visualizar')),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: lista, cadastro, perfil, seleção parcial/Todos, foto, salvar, editar, inativar, visualização, foco, mobile e bloqueio de todas as permissões');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
