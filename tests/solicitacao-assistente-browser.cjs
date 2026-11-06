// Solicitação de compra e de manutenção com a especialista (nov/2026): "+ Nova solicitação" abre a conversa, a resposta
// pronta mostra o resumo, "Está certo, registrar" grava pela mesma RPC do formulário e o formulário continua acessível.
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), assert = require("assert/strict");
const RAIZ = path.resolve(__dirname, ".."), BASE = "http://localhost:9931/";
const tipos = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const MOCK = `window.__CONTEXT={empresa_id:'e1',usuario_id:'u1',usuario_nome:'Igor Ramos'};window.aguardarContexto=async()=>window.__CONTEXT;
window.EasyLocPermissions={load:async()=>{},canNavigate:()=>true,guardPage:()=>{}};window.alerta=()=>{};window.__rpc=[];window.__ia=[];
window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:'u1'}}})},storage:{from:b=>({upload:async(p)=>{window.__up=(window.__up||[]).concat(p);return{error:null};},getPublicUrl:p=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/'+b+'/'+p}})})},rpc:async(n,a)=>{window.__rpc.push({n,a});if(a.p_acao==='listar')return{data:n==='compras_galpao'?[]:{itens:[],criar:true}};if(a.p_acao==='criar')return{data:{id:'r1',numero:42}};return{data:null};},
 functions:{invoke:async(n,o)=>{window.__ia.push({n,b:o.body});const b=o.body;if(b.acao==='transcrever')return{data:{texto:'x'}};
  const passos=b.mensagens.filter(m=>m.papel==='pessoa').length;if(passos<2)return{data:{resposta:'Qual a quantidade?',pronto:false,resumo:null}};
  return{data:{resposta:'Vou mostrar o resumo para você conferir.',pronto:true,resumo:b.tipo==='compra'?{descricao_item:'Fita dupla face 19 mm',quantidade:6,unidade:'rolo',data_necessidade:'2026-11-18',pedido:'Pedido 9',motivo:'Colar espelhos',justificativa:'A fita atual acabou e os espelhos soltam.',alternativas:'Não tem no almoxarifado.',produto_url:'',observacao:'Aceita similar'}:{titulo:'Vazamento na descarga',local:'Galpão 2 · banheiro',categoria:'hidraulica',prioridade:'alta',necessario_ate:'',descricao:'A descarga não para de correr água.'}}};}}};`;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    for (const [pagina, tipo] of [["Modulos/Geral/SolicitacoesCompra/solicitacoes.html", "compra"], ["Modulos/Geral/SolicitacoesManutencao/solicitacoes.html", "manutencao"]]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 } }), erros = [];
      page.on("pageerror", (e) => erros.push(e.message));
      await page.route(BASE + "**", (r) => {
        const u = new URL(r.request().url()), f = path.join(RAIZ, decodeURIComponent(u.pathname));
        if (/supabase\.js$|context\.js$|permissions\.js$|limpezaDados\.js$/.test(u.pathname)) return r.fulfill({ contentType: "text/javascript", body: u.pathname.endsWith("supabase.js") ? MOCK : "" });
        if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
        r.fulfill({ contentType: tipos[path.extname(f)] || "text/plain", body: fs.readFileSync(f) });
      });
      await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
      await page.goto(BASE + pagina);
      await page.waitForFunction(() => window.__rpc.some((c) => c.a.p_acao === "listar"));
      await page.waitForSelector("#slChat section.as-inline");
      assert.ok(await page.locator("#painelNova .sl-intro").isVisible(), tipo + ": duas colunas, explicação à esquerda");
      const [ie, ch] = [await page.locator(".sl-intro").boundingBox(), await page.locator("#slChat").boundingBox()];
      assert.ok(ch.x > ie.x + ie.width - 5 && Math.abs(ch.y - ie.y) < 60, "conversa à direita da explicação");
      assert.ok(await page.locator("#painelLista").isHidden(), "lista na outra aba");
      assert.match(await page.locator(".as-msg.ia").first().textContent(), /Oi, Igor!/);
      
      await page.fill(".as-campo textarea", "Preciso de algo"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelectorAll(".as-msg.ia").length === 2);
      assert.equal(await page.locator(".as-resumo").count(), 0, "ainda perguntando");
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      await page.fill(".as-campo textarea", "Olha a foto");
      await page.setInputFiles('[data-as="arquivo-foto"]', { name: "evidencia.png", mimeType: "image/png", buffer: png });
      await page.waitForSelector(".as-resumo [data-as=aprovar]");
      const up = await page.evaluate(() => window.__up || []);
      assert.equal(up.length, 1); assert.match(up[0], /^e1\/u1\/.+\.jpg$/, "foto na pasta da empresa e do usuário");
      assert.equal(await page.locator(".as-msg.pessoa .as-fotos img").count(), 1, "foto aparece na conversa");
      assert.equal(await page.locator(".as-resumo .as-fotos img").count(), 1, "foto no resumo");
      const ultimo = await page.evaluate(() => window.__ia[window.__ia.length - 1].b.mensagens.slice(-1)[0]);
      assert.equal(ultimo.fotos.length, 1, "a foto vai para a especialista"); assert.equal(ultimo.texto, "Olha a foto");
      assert.equal((await page.evaluate(() => window.__ia.map((c) => c.b.tipo)))[0], tipo, "manda o tipo certo");
      await page.click(".as-resumo [data-as=aprovar]");
      await page.waitForSelector(".as-msg-ok");
      assert.match(await page.locator(".as-msg-ok").textContent(), /#42/);
      const criar = await page.evaluate(() => window.__rpc.find((c) => c.a.p_acao === "criar"));
      const ev = await page.evaluate(() => window.__rpc.find((c) => c.n === "solicitacao_evidencias_salvar"));
      assert.ok(ev && ev.a.p_tipo === tipo && ev.a.p_fotos.length === 1, "fotos ligadas à solicitação");
      if (tipo === "compra") {
        assert.equal(criar.n, "compras_galpao"); assert.equal(criar.a.p_dados.quantidade, 6); assert.equal(criar.a.p_dados.data_necessidade, "2026-11-18");
        assert.match(criar.a.p_dados.observacao, /Para que: Colar espelhos[\s\S]*Por que precisa: A fita atual[\s\S]*Alternativas avaliadas: Não tem[\s\S]*Pedido 9[\s\S]*Aceita similar[\s\S]*Fotos de evidência \(1\)/);
      } else {
        assert.equal(criar.n, "manutencao_predial_operar"); assert.equal(criar.a.p_dados.categoria, "hidraulica"); assert.equal(criar.a.p_dados.prioridade, "alta"); assert.ok(criar.a.p_dados.token);
      }
      await page.click("[data-as=ver-lista]");
      assert.ok(await page.locator("#painelLista").isVisible() && await page.locator("#painelNova").isHidden(), "Ver minhas solicitações abre a lista");
      await page.click('.sl-abas [data-aba="nova"]'); await page.click("[data-as=nova]");
      assert.equal(await page.locator(".as-msg").count(), 1, "conversa nova depois de registrar");
      await page.click("[data-as=formulario]");
      assert.equal(await page.locator("#solicitacaoDialog[open]").count(), 1, "formulário ainda acessível");
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 800 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem rolagem lateral no celular");
      assert.deepEqual(erros, []);
      console.log("ok - " + tipo);
      await page.close();
    }
    console.log("todos os testes passaram");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
