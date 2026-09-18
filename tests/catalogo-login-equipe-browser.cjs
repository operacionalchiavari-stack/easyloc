const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Testa o login direto da equipe pela própria tela do catálogo (sem
// passar pelo dashboard): o mesmo formulário de e-mail/senha do
// decorador agora também reconhece a conta da equipe (Supabase Auth) e
// libera edição, sem exigir sessionStorage.login_ok.
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

function buildSupabaseMock(){
  // signedInId mora no sessionStorage (não numa variável de closure) de
  // propósito: addInitScript() reinjeta este script em TODA navegação,
  // inclusive page.reload() — uma variável comum resetaria a "sessão" a
  // cada reload, o que esconderia justamente o comportamento real que o
  // cenário 2 precisa comprovar (Supabase Auth persiste sozinho entre
  // recarregamentos). sessionStorage sobrevive a reload da mesma aba mas
  // começa vazio numa aba/página nova — isolamento igual entre cenários.
  return `(() => {
    function getSignedInId(){ return sessionStorage.getItem('test_signed_in_id') || null; }
    function setSignedInId(id){ if(id) sessionStorage.setItem('test_signed_in_id', id); else sessionStorage.removeItem('test_signed_in_id'); }
    window.testSignOutCalls = 0;
    function builder(resolveValue){
      return new Proxy({},{get(_t,prop){
        if(prop==='then') return (resolve)=>resolve(resolveValue());
        return ()=>builder(resolveValue);
      }});
    }
    window.supabaseClient = {
      auth: {
        getUser: async () => ({ data: { user: getSignedInId() ? { id: getSignedInId() } : null }, error: null }),
        getSession: async () => ({ data: { session: getSignedInId() ? { user: { id: getSignedInId() } } : null }, error: null }),
        signInWithPassword: async ({ email, password }) => {
          if(email === 'equipe@chiavari.com' && password === 'senha-equipe'){ setSignedInId('staff-1'); return { data: { user: { id: 'staff-1' } }, error: null }; }
          if(email === 'semperm@chiavari.com' && password === 'senha-sem-permissao'){ setSignedInId('staff-2'); return { data: { user: { id: 'staff-2' } }, error: null }; }
          return { data: null, error: { message: 'Invalid login credentials' } };
        },
        signOut: async () => { window.testSignOutCalls++; setSignedInId(null); return { error: null }; },
      },
      from(table){
        if(table === 'usuarios_empresas') return { select(){return this;}, eq(){return this;}, single: async () => {
          if(getSignedInId() === 'staff-1' || getSignedInId() === 'staff-2') return { data: { empresa_id: 'company' }, error: null };
          return { data: null, error: { message: 'not found' } };
        }};
        if(table === 'empresas') return { select(){return this;}, eq(){return this;}, maybeSingle: async () => ({ data: { nome: 'Chiavari', logo_url: null }, error: null }) };
        return builder(() => ({ data: [], error: null }));
      },
      rpc: async (name, params) => {
        if(name === 'catalogo_login'){
          if(params.p_email === 'decorador@chiavari.com' && params.p_senha === 'senha-decorador') return { data: { token: 'tok-1', cliente_id: 'client-1', empresa_id: 'company' }, error: null };
          return { data: null, error: null };
        }
        if(name === 'funcionario_contexto'){
          if(getSignedInId() === 'staff-1') return { data: { ativo: true, administrador_legado: true }, error: null };
          if(getSignedInId() === 'staff-2') return { data: { ativo: true, administrador_legado: false }, error: null };
          return { data: null, error: null };
        }
        if(name === 'get_permissoes_usuario_resolvidas') return { data: [], error: null };
        if(name === 'catalogo_carregar_interno' || name === 'catalogo_carregar') return { data: { empresa: { nome: 'Chiavari' }, decorador: name === 'catalogo_carregar' ? { nome: 'Kelly' } : null, itens: [
          { id: '1', tipo: 'Item', produto: 'Sofá Um', categoria: 'Sofás', foto_url: 'https://fixture/sofa.png', capa_categoria: true, itens_fotos: [] },
        ] } };
        if(name === 'catalogo_capas_carregar_interno' || name === 'catalogo_capas_carregar') return { data: {} };
        if(name === 'biblioteca_carregar_interno' || name === 'biblioteca_carregar') return { data: { fotos: [] } };
        return { data: null, error: null };
      },
      storage: { from(){ return { upload: async()=>({error:null}), remove: async()=>({error:null}), getPublicUrl:(p)=>({data:{publicUrl:'https://fixture/'+p}}) }; } },
    };
  })();`;
}

async function newCatalogPage(){
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.route('https://**/*', r=>r.fulfill({body:'',contentType:'text/javascript'}));
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
  await page.route('https://fixture/**', r=>r.fulfill({contentType:'image/svg+xml', body: svg}));
  return { page, errors };
}

// ===== Cenário 1: credenciais erradas (nem decorador, nem equipe) =====
{
  const { page, errors } = await newCatalogPage();
  await page.addInitScript(buildSupabaseMock());
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('#catalogLoginForm').waitFor();
  await page.locator('#catalogLoginEmail').fill('ninguem@chiavari.com');
  await page.locator('#catalogLoginPassword').fill('errada');
  await page.locator('#catalogLoginForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('catalogLoginStatus').textContent.length>0);
  assert.equal(await page.locator('#catalogLoginStatus').textContent(), 'E-mail ou senha inválidos.');
  assert.equal(await page.locator('#catalogLogin.hidden').count(), 0, 'Login continua visível com credenciais erradas');
  assert.deepEqual(errors, []);
  await page.close();
}

// ===== Cenário 2: login direto da equipe (credenciais próprias, com permissão) =====
{
  const { page, errors } = await newCatalogPage();
  await page.addInitScript(buildSupabaseMock());
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('#catalogLoginForm').waitFor();
  await page.locator('#catalogLoginEmail').fill('equipe@chiavari.com');
  await page.locator('#catalogLoginPassword').fill('senha-equipe');
  await page.locator('#catalogLoginForm button[type=submit]').click();
  await page.locator('.catalog-gateway').waitFor();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('catalog-modo-sistema')), false, 'Login direto pelo catálogo não deve esconder marca/cabeçalho (sem dashboard por cima)');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('catalogo_acesso_interno_direto')), '1');
  await page.locator('[data-gateway-tile="catalogo"]').click();
  await page.locator('[data-home-category="sofas"]').click();
  await page.locator('[data-grid-item]').first().click();
  await page.locator('#produto-1 [data-inline-edit="principal"]').waitFor();
  assert.equal(await page.locator('#produto-1 .catalog-capa-toggle').count(), 1, 'Equipe reconhecida vê controles de edição, incluindo capa da categoria');
  assert.deepEqual(errors, []);

  // Recarregar a página: a sessão do Supabase Auth persiste sozinha —
  // resolveAcessoInterno() deve reconhecer de novo sem pedir login.
  await page.reload();
  await page.locator('.catalog-gateway').waitFor();
  assert.equal(await page.locator('#catalogLoginForm:visible').count(), 0, 'Depois de recarregar, não volta a pedir login (sessão da equipe persistida)');
  await page.close();
}

// ===== Cenário 3: credenciais da equipe válidas, mas sem permissão de ver o catálogo =====
{
  const { page, errors } = await newCatalogPage();
  await page.addInitScript(buildSupabaseMock());
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('#catalogLoginForm').waitFor();
  await page.locator('#catalogLoginEmail').fill('semperm@chiavari.com');
  await page.locator('#catalogLoginPassword').fill('senha-sem-permissao');
  await page.locator('#catalogLoginForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('catalogLoginStatus').textContent.length>0);
  assert.equal(await page.locator('#catalogLoginStatus').textContent(), 'E-mail ou senha inválidos.', 'Sem permissão mostra a mesma mensagem genérica (não vaza que a conta existe)');
  assert.equal(await page.locator('#catalogLogin.hidden').count(), 0);
  assert.equal(await page.evaluate(()=>window.testSignOutCalls), 1, 'Login autenticado mas sem permissão precisa deslogar a sessão do Supabase Auth');
  assert.deepEqual(errors, []);
  await page.close();
}

// ===== Cenário 4: decorador continua funcionando pelo mesmo formulário (não tenta login de equipe à toa) =====
{
  const { page, errors } = await newCatalogPage();
  await page.addInitScript(buildSupabaseMock());
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('#catalogLoginForm').waitFor();
  await page.locator('#catalogLoginEmail').fill('decorador@chiavari.com');
  await page.locator('#catalogLoginPassword').fill('senha-decorador');
  await page.locator('#catalogLoginForm button[type=submit]').click();
  await page.locator('.catalog-gateway').waitFor();
  await page.locator('[data-gateway-tile="catalogo"]').click();
  await page.locator('[data-home-category="sofas"]').click();
  await page.locator('[data-grid-item]').first().click();
  await page.locator('.catalog-product-section').first().waitFor();
  assert.equal(await page.locator('[data-inline-edit]').count(), 0, 'Decorador continua sem nenhum controle de edição');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('catalogo_token')), 'tok-1');
  assert.deepEqual(errors, []);
  await page.close();
}

console.log('PASS: credenciais erradas mostram erro genérico, login direto da equipe libera edição sem passar pelo dashboard, permanece autenticado após recarregar, equipe sem permissão é deslogada com a mesma mensagem genérica, decorador continua funcionando pelo mesmo formulário');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
