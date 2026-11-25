// Peça danificada no depósito: conversa com o Marcos (tela), com o servidor simulado.
// Foto enviada pela câmera, resumo com o item e o setor, "Está certo" chama acervo_avaria_avulsa com a foto.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..");
const ok = (c, m) => { if (!c) throw Error("Falhou: " + m); console.log("ok", m); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const pagina = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles/assistente-solicitacao.css"><link rel="stylesheet" href="/styles/avaria-setor.css"></head><body>
<button id="abrir">abrir</button>
<script>
window.chamadas = []; window.conversas = [];
window.supabaseClient = {
  auth:{getUser:async()=>({data:{user:{id:"u1"}}})},
  functions:{invoke:async(nome,{body})=>{ conversas.push([nome,body]);
    const temFoto = body.mensagens.some(m=>m.fotos&&m.fotos.length);
    if(!temFoto) return {data:{resposta:"Me manda a foto da peça.",pronto:false,resumo:null}};
    return {data:{resposta:"Montei o resumo para você conferir.",pronto:true,resumo:{item_id:"i1",item_nome:"Poltrona Orka Off White (L) 0.80 m",item_codigo:"POL1",item_foto:"",estoque:6,quantidade:1,dano:"Tecido rasgado no braço esquerdo",setor:"Costura",local:"Galpão B",justificativa:"Rasgo no tecido."}}}; }},
  rpc:async(n,a)=>{chamadas.push([n,a]);return {data:{os_numero:12,setor:a.p_setor},error:null};},
  storage:{from:()=>({upload:async()=>({}),getPublicUrl:(c)=>({data:{publicUrl:"/ok.png?"+c}})})} };
document.getElementById("abrir").onclick=()=>EasyLocEnviarManutencao.abrir({empresa:"e1",ctx:{empresa_id:"e1",usuario_id:"u1",usuario_nome:"Paulo"}});
</script>
<script src="/js/ui/assistente-solicitacao.js"></script><script src="/js/ui/enviar-manutencao.js"></script>
</body></html>`;

const srv = http.createServer((req, res) => {
  if (req.url === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(pagina); }
  if (req.url.startsWith("/ok.png")) { res.setHeader("content-type", "image/png"); return res.end(PNG); }
  const f = path.join(raiz, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", f.endsWith(".css") ? "text/css" : f.endsWith(".jpg") ? "image/jpeg" : "text/javascript"); res.end(fs.readFileSync(f));
});
srv.listen(5611, async () => {
  const b = await chromium.launch({ channel: "msedge" });
  try {
    for (const [w, h, mobile] of [[1280, 900, false], [390, 800, true]]) {
      const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
      const erros = []; p.on("pageerror", (e) => erros.push(e.message));
      await p.goto("http://localhost:5611/");
      await p.click("#abrir");
      await p.waitForSelector(".as-dialog[open] .as-msgs .as-msg.ia");
      ok((await p.textContent(".as-msgs")).includes("foto"), w + "px: Marcos começa pedindo a foto");
      await p.fill(".as-dialog textarea", "Achei uma poltrona rasgada"); await p.press(".as-dialog textarea", "Enter");
      await p.waitForFunction(() => conversas.length === 1 && !document.querySelector(".as-digitando"));
      const [fn, corpo] = await p.evaluate(() => conversas[0]);
      ok(fn === "avaria-setor" && corpo.modo === "avulsa", "chama o Marcos (avaria-setor, modo avulsa)");
      ok(!(await p.locator(".as-resumo").count()), "sem foto não há resumo");
      await p.setInputFiles('.as-dialog [data-as="arquivo-foto"]', { name: "dano.png", mimeType: "image/png", buffer: PNG });
      await p.waitForSelector(".as-resumo");
      if (process.env.FOTO) await p.locator(".as-resumo").screenshot({ path: process.env.FOTO + "/resumo-" + w + ".png" });
      const resumo = await p.textContent(".as-resumo");
      ok(resumo.includes("Poltrona Orka") && resumo.includes("Costura") && resumo.includes("Tecido rasgado") && resumo.includes("Galpão B"), "resumo com item, dano e setor");
      ok((await p.locator(".as-resumo .as-fotos img").count()) === 1, "a foto aparece no resumo");
      await p.click('[data-as="aprovar"]');
      await p.waitForSelector(".as-msg-ok");
      const [nome, a] = await p.evaluate(() => chamadas[0]);
      ok(nome === "acervo_avaria_avulsa" && a.p_item === "i1" && a.p_setor === "Costura" && a.p_fotos.length === 1, "registra com a foto");
      ok((await p.textContent(".as-msg-ok")).includes("O.S 12"), "confirma o número da O.S");
      if (mobile) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "celular sem rolagem lateral");
      ok(!erros.length, "sem erros: " + erros.join(" | "));
      await p.evaluate(() => sessionStorage.clear());
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
});
