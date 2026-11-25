const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const { chromium } = require('playwright');

(async () => {
  const app = express();
  app.get('/peca.svg', (req, res) => res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="white"/><path d="M160 90h160v122H160z" fill="#c5b293" stroke="#9c8767" stroke-width="8"/><path d="M150 212h180v25H150zM166 237h12v75h-12zM302 237h12v75h-12z" fill="#9c8767"/><path d="M175 228h130" stroke="#b5a183" stroke-width="6"/></svg>'));
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    fs.mkdirSync('.tmp/montador-interface', { recursive: true });
    for (const width of [320, 390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => route.fulfill({ body: '' }));
      await page.route('**/gas-cliente.js*', route => route.fulfill({ body: '' }));
      await page.route('**/operacao-sem-motor.js*', route => route.fulfill({ body: '' }));
      await page.addInitScript(() => {
        localStorage.setItem('easyloc:limpeza-dados', '20261026-zerado');
        window.chamadas = [];
        const etapa = { id: 'm1', pedido: '2178', cliente: 'Carolina Vieira', local: 'Pousada Bosque das Hortênsias', endereco: 'Rua das Hortênsias, 120 · Centro', particularidades: 'Entrada pela lateral. Proteger o piso de madeira.', observacao: 'Montar o lounge próximo ao jardim.', etapa: 'Montagem', operacao: 'montagem', horario: '09:00', dataISO: '2026-11-21', dataEvento: '21/11/2026', responsavel: 'Rodrigo Teixeira', equipe: ['Rodrigo Teixeira', 'Felipe Andrade', 'Ana Carolina de Oliveira Santos'], caminhao: 'Mercedes-Benz 710 · HMS0554', info: { escada: 'Não', baldeacao: 'Sim', caminhaoPerto: 'Não' }, free: { quantidade: 1, pessoas: [{ nome: 'Bruno Silva', miniatura: location.origin + '/assets/demo/equipe/integrante-03.jpg', checkinEm: '08:55', telefone: '(11) 99999-0000' }] }, trocas: [], outrasEtapas: [] };
        const apontamento = { id: 'a1', idEtapa: 'm1', status: 'ATIVO', inicio: new Date().toISOString() };
        const itens = ['Cadeira Empório Madeira Castanho Médio Claro', 'Cadeira Soleil em Madeira Natural com Assento em Linho', 'Mesa de Apoio Jardim em Madeira', 'Banco Cerimônia em Madeira Natural'].map((nome, i) => ({ chave: 'i' + i, nome, esperado: i === 0 ? 8 : 2, foto: i === 3 ? '' : location.origin + '/peca.svg', ambiente_id: 'jardim', ambiente: 'Jardim · cerimônia', ambiente_ordem: 1, kit_nome: i === 2 ? 'Composição do lounge' : '' }));
        function result(fn, args) {
          window.chamadas.push({ fn, args });
          if (fn === 'MONT_usuarioSistema') return 'u1';
          if (fn === 'MONT_loginConta') return { token: 'fixture', nome: 'Rodrigo Teixeira', perfil: 'RESPONSAVEL' };
          if (fn === 'MONT_appCarregar') return { nome: 'Rodrigo Teixeira', perfil: 'RESPONSAVEL', etapas: [etapa], apontamento };
          if (fn === 'MONT_sincronizarCheckin') return apontamento;
          if (fn === 'MONT_entregaItens') return { itens, conferencia: {}, enviado: false };
          if (fn === 'MONT_entregaSalvar') { window.conferenciaSalva = args[2]; return { conferencia: args[2], enviado: true, autor: 'Rodrigo Teixeira' }; }
          if (fn === 'MONT_fotosEtapa') return { pessoas: etapa.equipe.map((nome, i) => ({ nome, papel: i ? 'equipe' : 'responsavel', foto: location.origin + '/assets/demo/equipe/integrante-0' + (i + 1) + '.jpg' })), caminhoes: [], solicitante: { nome: etapa.cliente } };
          if (fn === 'MONT_uberQr') return { vagas: [] };
          if (fn === 'MONT_freteQr') return { fretes: [] };
          return {};
        }
        function runner(ok, no) { return new Proxy({}, { get: (_, fn) => fn === 'withSuccessHandler' ? f => runner(f, no) : fn === 'withFailureHandler' ? f => runner(ok, f) : (...args) => Promise.resolve().then(() => result(fn, args)).then(r => ok?.(r)).catch(e => no?.(e)) }); }
        window.google = { script: { run: runner(), url: { getLocation(cb) { cb({ parameter: {} }); } } } };
        window.supabaseClient = { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, rpc: async () => ({ data: { empresa_id: 'e1', usuario_id: 'u1', etapa: 'montagem', pedido: '2178', relatos: [] } }), functions: { invoke: async () => ({ data: { resposta: 'O piso precisa ser protegido antes da montagem.', pronto: false } }) } };
      });
      await page.goto('http://127.0.0.1:' + server.address().port + '/Modulos/Chiavari/Cronograma/montador.html');
      await page.locator('#telaInicio .etapa').getByText('Carolina Vieira', { exact: true }).click();
      await page.locator('#etapaEquipe img').first().waitFor();
      await page.locator('.entrega-item').first().waitFor({ state: 'attached' });
      assert.ok(await page.locator('.pessoa-free .pessoa-nome').evaluate(el => el.clientWidth >= 130), 'nome do freelancer tem espaço para leitura');
      assert.ok(await page.locator('#etapaEtiquetas .pedido').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'número do pedido sem corte');
      const conferirLargura = async aba => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), aba + ': sem corte lateral');
        assert.equal(await page.locator('[role=tab][aria-selected=true]').count(), 1);
        assert.equal(await page.locator('.etapa-aba-painel:visible').count(), 1);
      };
      await conferirLargura('equipe');
      assert.ok(await page.getByText('Ana Carolina de Oliveira Santos', { exact: true }).isVisible());
      await page.screenshot({ path: '.tmp/montador-interface/' + width + '-equipe.png', fullPage: true });
      await page.locator('[data-etapa-aba=info]').click();
      await page.locator('#etapaAssistenteIa textarea').waitFor();
      assert.equal(await page.locator('[data-etapa-aba=info]').innerText(),'Assistente');
      await conferirLargura('assistente');
      assert.ok(await page.locator('#etapaEtiquetas').isHidden(),'sem Montagem e pedido duplicados no chat');
      const voltar=await page.locator('#btnVoltar').boundingBox(),cabecalho=await page.locator('#etapaAssistenteIa .as-topo').boundingBox();
      assert.ok(Math.abs(voltar.y+voltar.height/2-cabecalho.y-cabecalho.height/2)<=14,'Voltar e identidade do assistente na mesma linha');
      assert.equal(await page.locator('#etapaAssistenteIa .as-topo strong').innerText(),'Luísa');
      assert.ok(await page.locator('#etapaInfo').isHidden(),'terceira aba somente com a conversa');
      await page.waitForFunction(()=>document.querySelector('#etapaAssistenteIa img[data-ia-foto]')?.naturalWidth>0);
      const campo=await page.locator('#etapaAssistenteIa textarea').boundingBox(),abas=await page.locator('#etapaAbas').boundingBox();
      assert.ok(campo.y+campo.height<=abas.y,'campo acima das abas');
      assert.ok(campo.width>=130,'espaço para digitar');
      await page.locator('#etapaAssistenteIa textarea').fill('A entrega veio completa, o decorador elogiou e a equipe não teve dificuldades.');
      await page.locator('#etapaAssistenteIa .as-enviar').click();
      await page.locator('.as-digitando').waitFor({state:'detached'});
      assert.ok(await page.locator('#etapaAssistenteIa .as-msg.pessoa').isVisible());
      for(let i=0;i<8;i++){await page.locator('#etapaAssistenteIa textarea').fill('Complemento '+i+': a equipe organizou os materiais e deixou o local em ordem.');await page.locator('#etapaAssistenteIa .as-enviar').click();await page.locator('.as-digitando').waitFor({state:'detached'});}
      await page.setViewportSize({width,height:420});
      const limites=await page.evaluate(()=>({campo:document.querySelector('#etapaAssistenteIa .as-campo').getBoundingClientRect().bottom,abas:document.getElementById('etapaAbas').getBoundingClientRect().top,rolagem:document.querySelector('.as-msgs').scrollHeight>document.querySelector('.as-msgs').clientHeight}));
      assert.ok(limites.campo<=limites.abas+1&&limites.rolagem,'campo acessível acima das abas com histórico longo e teclado');
      await page.setViewportSize({width,height:900});
      await page.screenshot({ path: '.tmp/montador-interface/' + width + '-assistente.png', fullPage: true });
      await page.locator('#etapaAssistenteIa textarea').fill('Rascunho do evento');
      await page.locator('[data-etapa-aba=lista]').click();
      await page.locator('[data-etapa-aba=info]').click();
      assert.equal(await page.locator('#etapaAssistenteIa textarea').inputValue(),'Rascunho do evento');
      await page.locator('[data-etapa-aba=lista]').click();
      await conferirLargura('lista');
      assert.equal(await page.locator('.entrega-item:visible').count(), 4);
      for (const foto of await page.locator('.entrega-foto img').all()) await foto.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.entrega-foto img')].every(img => img.complete && img.naturalWidth > 0));
      const grid = await page.locator('#entregaItens').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(grid, width >= 900 ? 4 : 2, 'duas colunas no celular como o catálogo');
      assert.equal(await page.locator('#entregaBusca,[data-entrega-filtro],.entrega-painel,.entrega-instrucao,.entrega-item-status').count(), 0, 'lista somente com itens e conferência');
      for (const sel of ['#etapaResumo', '#etapaCabeca', '#apontamentoEtapa']) assert.ok(await page.locator(sel).isHidden());
      assert.equal((await page.locator('.entrega-previsto').first().innerText()).replace(/\s+/g,' '), 'Previsto 8');
      assert.equal(await page.locator('.entrega-item h3').first().evaluate(el => getComputedStyle(el).textAlign), 'center');
      await page.locator('.entrega-foto:not(.sem-foto)').first().click();
      await page.locator('#folha .foto-free-ampliada').waitFor();
      await page.getByRole('button', { name: 'Fechar foto', exact: true }).click();
      const cards = page.locator('.entrega-item');
      await cards.nth(0).locator('[data-entregue]').fill('8');
      assert.equal(await cards.nth(0).locator('[data-entregue]').inputValue(), '8');
      await cards.nth(1).locator('[data-entregue]').fill('1');
      await cards.nth(1).locator('[data-abrir-dano]').click();
      await cards.nth(1).locator('[data-dano]').fill('1');
      assert.ok(await cards.nth(1).locator('.entrega-dano').isVisible());
      await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
      assert.equal(await page.evaluate(() => window.conferenciaSalva), undefined, 'não salva dano sem descrição');
      await cards.nth(1).locator('[data-obs]').fill('Assento chegou rasgado.');
      for (const i of [2, 3]) await cards.nth(i).locator('[data-entregue]').fill('2');
      await page.locator('[data-etapa-aba=equipe]').click();
      await page.locator('[data-etapa-aba=equipe]').press('ArrowRight');
      assert.equal(await page.locator('[data-etapa-aba=lista]').getAttribute('aria-selected'), 'true', 'navegação por teclado');
      assert.equal(await cards.nth(1).locator('[data-obs]').inputValue(), 'Assento chegou rasgado.', 'trocar abas mantém o preenchimento');
      await page.screenshot({ path: '.tmp/montador-interface/' + width + '-lista.png', fullPage: true });
      assert.equal(await page.locator('.entrega-item:visible').count(), 4);
      await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
      await page.locator('.conferencia-enviada').waitFor();
      assert.equal(await page.evaluate(() => window.conferenciaSalva.i1.danificados), 1);
      assert.ok(await cards.nth(0).locator('[data-entregue]').isVisible(), 'quantidade encontrada continua visível depois de salvar');
      await conferirLargura('conferência salva');
      assert.deepEqual(errors, []);
      await page.close();
      console.log('OK: lista igual ao catálogo, duas colunas no celular, quantidades, danos, validação, preservação entre abas e salvamento em ' + width + 'px.');
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
