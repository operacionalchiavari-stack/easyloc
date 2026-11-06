// Solicitação de compra e de manutenção com a especialista (nov/2026): "+ Nova solicitação" abre a conversa, a resposta
// pronta mostra o resumo, "Está certo, registrar" grava pela mesma RPC do formulário e o formulário continua acessível.
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), assert = require("assert/strict");
const RAIZ = path.resolve(__dirname, ".."), BASE = "http://localhost:9931/";
const tipos = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const MOCK = `window.__CONTEXT={empresa_id:'e1',usuario_id:'u1',usuario_nome:'Igor Ramos'};window.aguardarContexto=async()=>window.__CONTEXT;
window.EasyLocPermissions={load:async()=>{},canNavigate:()=>true,guardPage:()=>{}};window.alerta=()=>{};window.__rpc=[];window.__ia=[];
window.supabaseClient={rpc:async(n,a)=>{window.__rpc.push({n,a});if(a.p_acao==='listar')return{data:n==='compras_galpao'?[]:{itens:[],criar:true}};if(a.p_acao==='criar')return{data:{numero:42}};return{data:null};},
 functions:{invoke:async(n,o)=>{window.__ia.push({n,b:o.body});const b=o.body;if(b.acao==='transcrever')return{data:{texto:'x'}};
  const passos=b.mensagens.filter(m=>m.papel==='pessoa').length;if(passos<2)return{data:{resposta:'Qual a quantidade?',pronto:false,resumo:null}};
  return{data:{resposta:'Vou mostrar o resumo para você conferir.',pronto:true,resumo:b.tipo==='compra'?{descricao_item:'Fita dupla face 19 mm',quantidade:6,unidade:'rolo',data_necessidade:'2026-11-18',pedido:'Pedido 9',motivo:'Colar espelhos',produto_url:'',observacao:'Aceita similar'}:{titulo:'Vazamento na descarga',local:'Galpão 2 · banheiro',categoria:'hidraulica',prioridade:'alta',necessario_ate:'',descricao:'A descarga não para de correr água.'}}};}}};`;
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
      await page.click("#novaSolicitacao");
      await page.waitForSelector("dialog.as-dialog[open]");
      assert.match(await page.locator(".as-msg.ia").first().textContent(), /Oi, Igor!/);
      assert.equal(await page.locator("#solicitacaoDialog[open]").count(), 0, tipo + ": não abre mais o formulário direto");
      await page.fill(".as-campo textarea", "Preciso de algo"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelectorAll(".as-msg.ia").length === 2);
      assert.equal(await page.locator(".as-resumo").count(), 0, "ainda perguntando");
      await page.fill(".as-campo textarea", "Mais detalhes"); await page.click(".as-enviar");
      await page.waitForSelector(".as-resumo [data-as=aprovar]");
      assert.equal((await page.evaluate(() => window.__ia.map((c) => c.b.tipo)))[0], tipo, "manda o tipo certo");
      await page.click(".as-resumo [data-as=aprovar]");
      await page.waitForSelector(".as-msg-ok");
      assert.match(await page.locator(".as-msg-ok").textContent(), /#42/);
      const criar = await page.evaluate(() => window.__rpc.find((c) => c.a.p_acao === "criar"));
      if (tipo === "compra") {
        assert.equal(criar.n, "compras_galpao"); assert.equal(criar.a.p_dados.quantidade, 6); assert.equal(criar.a.p_dados.data_necessidade, "2026-11-18");
        assert.match(criar.a.p_dados.observacao, /Para que: Colar espelhos[\s\S]*Pedido 9[\s\S]*Aceita similar/);
      } else {
        assert.equal(criar.n, "manutencao_predial_operar"); assert.equal(criar.a.p_dados.categoria, "hidraulica"); assert.equal(criar.a.p_dados.prioridade, "alta"); assert.ok(criar.a.p_dados.token);
      }
      // reabre limpo e o formulário continua como alternativa
      await page.click("[data-as=fechar]"); await page.click("#novaSolicitacao");
      assert.equal(await page.locator(".as-msg").count(), 1, "conversa nova depois de registrar");
      await page.click("[data-as=formulario]");
      assert.equal(await page.locator("#solicitacaoDialog[open]").count(), 1, "formulário ainda acessível");
      await page.setViewportSize({ width: 390, height: 800 }); await page.keyboard.press("Escape"); await page.click("#novaSolicitacao");
      const caixa = await page.locator("dialog.as-dialog").boundingBox();
      assert.ok(caixa.width <= 390 && caixa.height <= 800, "cabe no celular");
      assert.deepEqual(erros, []);
      console.log("ok - " + tipo);
      await page.close();
    }
    console.log("todos os testes passaram");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
