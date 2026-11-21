// deno test --allow-env tests/ia-uso.test.ts  — o vigia de uso de IA grava o consumo devolvido pela OpenAI.
const gravados: any[] = [];
const respostas: Record<string, any> = {
  "chat/completions": { model: "gpt-4.1-2025", usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 100 } } },
  "images/edits": { usage: { input_tokens: 1800, output_tokens: 6000, input_tokens_details: { text_tokens: 300, image_tokens: 1500 } } },
  "audio/transcriptions": { text: "oi", usage: { type: "tokens", input_tokens: 90, output_tokens: 10, input_token_details: { audio_tokens: 80, text_tokens: 10 } } },
};
Deno.env.set("SUPABASE_URL", "https://banco.teste"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave");
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = String(input?.url || input);
  if (url.startsWith("https://api.openai.com/")) {
    const ep = url.replace("https://api.openai.com/v1/", "");
    if (ep === "audio/speech") return new Response(new Uint8Array([1, 2]), { headers: { "content-type": "audio/mpeg" } });
    return new Response(JSON.stringify(respostas[ep]), { headers: { "content-type": "application/json" } });
  }
  if (url.includes("/rpc/catalogo_validar_sessao")) return new Response(JSON.stringify({ valido: true, empresa_id: "11111111-1111-1111-1111-111111111111", cliente_id: "33333333-3333-3333-3333-333333333333" }));
  if (url.endsWith("/rest/v1/ia_uso")) { gravados.push(JSON.parse(String(init?.body))); return new Response(""); }
  return new Response("[]");
}) as typeof fetch;
const { comUsoIA } = await import("../supabase/functions/_shared/ia-uso.ts");
const jwt = (sub: string) => "x." + btoa(JSON.stringify({ sub, role: "authenticated" })) + ".y";
const handler = comUsoIA((b) => b.tipo === "compra" ? "carla" : "clara", async () => {
  await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "gpt-4.1" }) });
  const f = new FormData(); f.append("model", "gpt-4o-transcribe"); f.append("file", new Blob([new Uint8Array(8000)], { type: "audio/webm" }));
  await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", body: f });
  await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", body: JSON.stringify({ model: "gpt-4o-mini-tts", input: "Olá, tudo bem?" }) });
  await fetch("https://api.openai.com/v1/images/edits", { method: "POST", body: (() => { const g = new FormData(); g.append("model", "gpt-image-2"); return g; })() });
  await fetch("https://outro.site/x");
  return new Response("ok");
});
Deno.test("equipe: registra cada chamada com empresa, usuário e origem", async () => {
  gravados.length = 0;
  await handler(new Request("https://f/", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + jwt("22222222-2222-2222-2222-222222222222") }, body: JSON.stringify({ empresa_id: "11111111-1111-1111-1111-111111111111", tipo: "compra", action: "conversar" }) }));
  if (gravados.length !== 4) throw new Error("esperava 4, veio " + gravados.length);
  const ep = (e: string) => gravados.find((g) => g.endpoint === e);
  const chat = ep("chat/completions"), tr = ep("audio/transcriptions"), voz = ep("audio/speech"), img = ep("images/edits");
  if (chat.origem !== "carla" || chat.usuario_id !== "22222222-2222-2222-2222-222222222222" || chat.acao !== "conversar") throw new Error(JSON.stringify(chat));
  if (chat.tokens_entrada !== 1000 || chat.tokens_cache !== 100 || chat.tokens_saida !== 200 || chat.modelo !== "gpt-4.1") throw new Error(JSON.stringify(chat));
  if (tr.tokens_audio_entrada !== 80 || tr.modelo !== "gpt-4o-transcribe") throw new Error(JSON.stringify(tr));
  if (voz.caracteres !== 14) throw new Error(JSON.stringify(voz));
  if (img.tokens_imagem_saida !== 6000 || img.tokens_imagem_entrada !== 1500 || img.tokens_entrada !== 300) throw new Error(JSON.stringify(img));
});
Deno.test("decorador: o catalog_token vira o cliente, sem usuário", async () => {
  gravados.length = 0;
  await handler(new Request("https://f/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalog_token: "abc" }) }));
  if (gravados.length !== 4 || gravados[0].cliente_id !== "33333333-3333-3333-3333-333333333333" || gravados[0].usuario_id !== null || gravados[0].empresa_id !== "11111111-1111-1111-1111-111111111111" || gravados[0].origem !== "clara") throw new Error(JSON.stringify(gravados[0]));
});
