// Pós-venda · Conversas no WhatsApp (nov/2026): lista Agora/Anteriores, mensagens com foto/áudio, resultado
// (elogios/críticas/sugestões), assumir a conversa e responder pelo WhatsApp. Também o modo ?exemplo=1.
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), assert = require("assert/strict");
const RAIZ = path.resolve(__dirname, ".."), BASE = "http://localhost:9933/", SHOT = process.env.SHOT_DIR || "";
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function mock() {
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Jonatan" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.EasyLocPermissions = { load: async () => {}, canNavigate: () => true, guardPage: () => {} };
  window.alerta = (m) => { window.__alertas = (window.__alertas || []).concat(m); };
  window.confirmarGlobal = async () => true;
  const agora = Date.now(), min = (n) => new Date(agora - n * 60000).toISOString(), base = location.origin + "/";
  window.__db = {
    conversas: [
      { id: "c1", empresa_id: "e1", contato_id: "k1", cliente_nome: "Ana Decor", telefone: "5524999112233", status: "ativa", ia_ativa: true, iniciada_em: min(30), ultima_mensagem_em: min(1),
        resultado: { nota: 8, sentimento: "positivo", resumo: "Gostou.", elogios: ["Montagem caprichada"], criticas: ["Atraso de 40 min"], sugestoes: [] } },
      { id: "c2", empresa_id: "e1", cliente_nome: "Lírio", telefone: "5521988776655", status: "concluida", ia_ativa: true, iniciada_em: min(3000), ultima_mensagem_em: min(2900), encerrada_em: min(2900),
        resultado: { nota: 5, sentimento: "negativo", criticas: ["Poltrona rasgada"] } },
    ],
    mensagens: [
      { id: "m1", conversa_id: "c1", direcao: "saida", autor: "ia", tipo: "texto", texto: "Oi Ana! Como foi o evento?", status: "lido", created_at: min(30) },
      { id: "m2", conversa_id: "c1", direcao: "entrada", autor: "cliente", tipo: "imagem", midia_url: base + "foto.png", texto: "Olha", status: "recebido", created_at: min(20) },
      { id: "m3", conversa_id: "c1", direcao: "entrada", autor: "cliente", tipo: "audio", midia_url: base + "a.ogg", status: "recebido", created_at: min(1) },
      { id: "m4", conversa_id: "c2", direcao: "entrada", autor: "cliente", tipo: "texto", texto: "A poltrona veio rasgada", status: "recebido", created_at: min(2900) },
    ],
  };
  window.__rpc = []; window.__inv = [];
  const q = (tab) => {
    let rows = tab === "posvenda_conversas" ? window.__db.conversas.slice() : window.__db.mensagens.slice();
    const o = { select: () => o, eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return o; }, in: (k, v) => { rows = rows.filter((r) => v.includes(r[k])); return o; },
      order: () => o, limit: () => o, then: (ok) => Promise.resolve({ data: rows, error: null }).then(ok) };
    return o;
  };
  window.supabaseClient = {
    from: q,
    rpc: async (n, a) => {
      window.__rpc.push({ n, a });
      if (n === "posvenda_lista") return { data: { contatos: [{ id: "k1", status: "concluido", pedidos: [{ numero: "9", data_evento: "2026-11-01", local: "Villa" }] }], config: {}, hoje: "2026-11-06" } };
      const c = window.__db.conversas.find((x) => x.id === a.p_id || x.id === a.p_conversa);
      if (n === "posvenda_conversa_assumir") { c.ia_ativa = !a.p_assumir; c.assumida_por_nome = a.p_assumir ? "Jonatan" : null; return { data: { ...c } }; }
      if (n === "posvenda_mensagem_equipe") { const m = { id: "n" + Date.now(), conversa_id: a.p_conversa, direcao: "saida", autor: "equipe", autor_nome: "Jonatan", tipo: "texto", texto: a.p_texto, status: a.p_erro ? "falha" : "enviado", erro: a.p_erro, created_at: new Date().toISOString() }; window.__db.mensagens.push(m); return { data: m }; }
      if (n === "posvenda_conversa_resultado") { c.status = a.p_status; c.encerrada_em = new Date().toISOString(); return { data: { ...c } }; }
      return { data: null };
    },
    functions: { invoke: async (n, o) => { window.__inv.push({ n, b: o.body }); return { data: { ok: true, response: { messageId: "Z1" } } }; } },
  };
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }), erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.route(BASE + "**", (r) => {
      const u = new URL(r.request().url()), f = path.join(RAIZ, decodeURIComponent(u.pathname));
      if (/foto\.png$/.test(u.pathname)) return r.fulfill({ contentType: "image/png", body: PNG });
      if (/\.ogg$/.test(u.pathname)) return r.fulfill({ status: 404, body: "" });
      if (/supabase\.js$|context\.js$|permissions\.js$|limpezaDados\.js$/.test(u.pathname)) return r.fulfill({ contentType: "text/javascript", body: u.pathname.endsWith("supabase.js") ? "(" + mock.toString() + ")();" : "" });
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      r.fulfill({ contentType: tipos[path.extname(f)] || "text/plain", body: fs.readFileSync(f) });
    });
    await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
    await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
    await page.route("https://images.unsplash.com/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
    await page.goto(BASE + "Modulos/Chiavari/Feedback/feedback.html");
    await page.waitForFunction(() => window.__rpc && window.__rpc.some((c) => c.n === "posvenda_lista"));
    await page.waitForFunction(() => document.getElementById("pvContConversas").textContent === "1");
    await page.click('#pvAbas [data-aba="conversas"]');
    await page.waitForSelector(".pvc-msg");
    assert.ok(await page.locator("#pvLista").isHidden(), "tabela some na aba de conversas");
    assert.equal(await page.locator(".pvc-item").count(), 1, "Agora: só a conversa ativa");
    assert.match(await page.locator(".pvc-item").textContent(), /Ana Decor[\s\S]*IA conversando[\s\S]*8\/10/);
    assert.equal(await page.locator(".pvc-msg.saida.ia").count(), 1);
    assert.equal(await page.locator(".pvc-msg.entrada .pvc-img img").count(), 1, "foto recebida");
    assert.equal(await page.locator(".pvc-msg.entrada audio").count(), 1, "áudio recebido");
    assert.match(await page.locator(".pvc-res-bloco.elogio").textContent(), /Montagem caprichada/);
    assert.match(await page.locator(".pvc-res-bloco.critica").textContent(), /Atraso/);
    assert.match(await page.locator("#pvcResultado").textContent(), /Pedido 9/);
    if (SHOT) await page.screenshot({ path: SHOT + "/pvc-real.png" });
    // assumir e responder pelo WhatsApp
    await page.click('[data-pvc="assumir"]');
    await page.fill("#pvcEscrever textarea", "Oi Ana, aqui é o Jonatan!");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__rpc.some((c) => c.n === "posvenda_mensagem_equipe"));
    const inv = await page.evaluate(() => window.__inv[0]);
    assert.equal(inv.n, "zapi-integration"); assert.equal(inv.b.message.phone, "5524999112233"); assert.equal(inv.b.message.origem, "posvenda");
    const reg = await page.evaluate(() => window.__rpc.find((c) => c.n === "posvenda_mensagem_equipe").a);
    assert.equal(reg.p_zapi_id, "Z1"); assert.equal(reg.p_erro, null);
    await page.waitForSelector(".pvc-msg.saida.equipe");
    await page.click('[data-pvc="devolver"]');
    await page.waitForSelector('[data-pvc="assumir"]');
    // anteriores
    await page.click('[data-pvc-filtro="anteriores"]');
    await page.click('[data-conversa="c2"]');
    await page.waitForSelector(".pvc-rodape-fim");
    assert.match(await page.locator(".pvc-item.is-sel").textContent(), /Concluída/);
    assert.match(await page.locator(".pvc-res-bloco.critica").textContent(), /Poltrona rasgada/);
    // celular
    await page.setViewportSize({ width: 390, height: 820 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "sem rolagem lateral");
    // modo exemplo (só na tela)
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto(BASE + "Modulos/Chiavari/Feedback/feedback.html?exemplo=1");
    await page.waitForSelector(".pvc-msg");
    assert.equal(await page.locator(".pvc-item").count(), 2, "exemplo: 2 conversas acontecendo");
    await page.waitForTimeout(400);
    if (SHOT) await page.screenshot({ path: SHOT + "/pvc-exemplo.png" });
    assert.deepEqual(erros, []);
    console.log("ok - conversas do pós-venda");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
