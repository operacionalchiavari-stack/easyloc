// Marcos (manutenção): peça danificada achada no depósito, sem pedido (22/11/2026).
// Ele vê a foto (obrigatória), descreve o dano, descobre o item (ferramenta buscar_itens, com o login de quem conversa),
// a quantidade, onde estava e o setor, e devolve o resumo. Quem grava é o navegador (RPC acervo_avaria_avulsa).
const SETORES = ["Marcenaria", "Solda", "Acabamento e Pintura", "Costura", "Forração", "Limpeza de Estofados"];
const MODELO = Deno.env.get("AVARIA_SETOR_MODEL") || "gpt-4.1";

const SISTEMA = (hoje: string, nome: string) => `Você é o Marcos, da manutenção da Chiavari (locação de móveis para eventos). ${nome ? nome + ", um colega," : "Um colega"} achou uma peça
danificada no depósito, fora de qualquer pedido, e conversa com você para mandá-la à manutenção. Hoje é ${hoje}.
Sua função: entender o dano, identificar a peça e mandar para o setor certo. Uma pergunta por mensagem, curto (no máximo 2 frases),
português do Brasil, simpático e direto. Siga esta ordem:
1) FOTO é obrigatória: se ainda não há foto na conversa, peça a foto da peça mostrando o dano, de perto. Não avance sem foto.
   Se a foto não mostra bem o dano, peça outra. A foto é o que a equipe da manutenção vai ver na O.S.
2) Olhe a foto e DESCREVA o dano com palavras técnicas (o que está quebrado, rasgado, riscado, solto e onde na peça) e confirme com a pessoa.
3) Descubra QUAL ITEM é: use a ferramenta buscar_itens com o nome que a pessoa disser ou com o que você vê na foto
   (ex.: "poltrona", "cadeira tiffany", o código). Diga as opções encontradas pelo nome e pergunte qual é (ou confirme a única).
   Kit não serve: é preciso a peça. Nunca invente item: só use refs (i1, i2...) devolvidos por buscar_itens NESTA resposta.
   Se você já sabe o item por mensagens anteriores, chame buscar_itens de novo com o nome dele para ter o ref.
4) Quantas peças estão assim (não pode passar do estoque do item).
5) Onde estava no depósito (prateleira, galpão). Se a pessoa não souber, aceite "não sei".
6) Escolha o setor pela foto e pela descrição:
- Marcenaria: madeira quebrada, trincada, solta ou empenada; pé ou encaixe de madeira; tampo; MDF estufado.
- Solda: estrutura de metal/ferro/inox quebrada, solta, torta, solda rompida.
- Acabamento e Pintura: risco, lascado, descascado, mancha na pintura, verniz ou laca; retoque; ferrugem superficial.
- Costura: tecido rasgado ou descosturado, zíper, capa, almofada aberta, costura solta.
- Forração: estofado afundado ou duro, espuma danificada, trocar o tecido do estofado, forro solto, grampo.
- Limpeza de Estofados: sujeira, mancha, cheiro ou bebida em estofado ou tecido (sem rasgo).
Se precisar de mais de um setor, indique o primeiro (o setor encaminha depois). Diga o setor e o porquê em uma frase.
Quando tiver TUDO (foto, item com ref, quantidade, dano descrito, setor; local ou "não sei"), marque pronto=true e preencha o resumo;
na resposta diga só que montou o resumo para conferir (não repita o resumo). Se pedirem ajuste, ajuste e mande de novo.
Enquanto faltar algo: pronto=false e resumo com campos vazios e quantidade 0.`;

const ESQUEMA = {
  name: "marcos_avaria",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["resposta", "pronto", "resumo"],
    properties: {
      resposta: { type: "string" }, pronto: { type: "boolean" },
      resumo: {
        type: "object", additionalProperties: false, required: ["item_ref", "quantidade", "dano", "setor", "local", "justificativa"],
        properties: {
          item_ref: { type: "string" }, quantidade: { type: "integer" }, dano: { type: "string" },
          setor: { type: "string" }, local: { type: "string" }, justificativa: { type: "string" },
        },
      },
    },
  },
};
const FERRAMENTAS = [{
  type: "function",
  function: {
    name: "buscar_itens",
    description: "Procura itens do acervo pelo nome, código ou referência. Devolve até 8 opções com ref, nome, código, tipo e estoque.",
    parameters: { type: "object", additionalProperties: false, required: ["termo"], properties: { termo: { type: "string" } } },
  },
}];

async function buscarItens(usuario: any, empresa: string, termo: string) {
  const palavras = String(termo || "").replace(/[,()%*]/g, " ").split(/\s+/).filter((p) => p.length >= 2).slice(0, 4);
  if (!palavras.length) return [];
  let q = usuario.from("itens").select("id,produto,descricao_total,codigo,referencia,foto_url,estoque_total,tipo").eq("empresa_id", empresa).neq("tipo", "Kit");
  if (palavras.length === 1) {
    const p = "%" + palavras[0] + "%";
    q = q.or(`descricao_total.ilike.${p},produto.ilike.${p},codigo.ilike.${p},referencia.ilike.${p}`);
  } else for (const w of palavras) q = q.ilike("descricao_total", "%" + w + "%");
  const { data } = await q.order("produto").limit(8);
  return data || [];
}

export async function conversarAvulsa(body: any, usuario: any, nome: string, json: (b: unknown, s?: number) => Response) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "O Marcos está indisponível agora." }, 500);
  const empresa = String(body.empresa_id);
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "") + "/storage/v1/object/";
  const lista = Array.isArray(body?.mensagens) ? body.mensagens.slice(-30) : [];
  let temFoto = false;
  const msgs: any[] = [];
  for (const m of lista) {
    const texto = String(m?.texto || "").slice(0, 3000);
    if (m?.papel === "ia") { if (texto.trim()) msgs.push({ role: "assistant", content: texto }); continue; }
    const fotos = (Array.isArray(m?.fotos) ? m.fotos : []).map(String).filter((u: string) => u.startsWith(base)).slice(0, 4);
    if (fotos.length) temFoto = true;
    if (!texto.trim() && !fotos.length) continue;
    msgs.push({
      role: "user",
      content: fotos.length
        ? [{ type: "text", text: texto || "(foto da peça)" }, ...fotos.map((url: string) => ({ type: "image_url", image_url: { url, detail: "high" } }))]
        : texto,
    });
  }
  if (!msgs.length) return json({ erro: "Mande a foto da peça para começar." }, 400);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const conversa: any[] = [{ role: "system", content: SISTEMA(hoje, nome.split(/\s+/)[0] || "") + (temFoto ? "" : "\nATENÇÃO: ainda não há nenhuma foto na conversa.") }, ...msgs];
  const refs = new Map<string, any>();
  let n = 0;
  for (let rodada = 0; rodada < 6; rodada++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, temperature: 0.2, tools: FERRAMENTAS, response_format: { type: "json_schema", json_schema: ESQUEMA }, messages: conversa }),
      signal: AbortSignal.timeout(90000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(d?.error?.message || "");
      console.warn("openai:", msg);
      if (/quota|billing|credit/i.test(msg)) return json({ erro: "A IA está sem créditos agora." }, 502);
      return json({ erro: "O Marcos não conseguiu responder agora. Tente de novo." }, 502);
    }
    const msg = d?.choices?.[0]?.message || {};
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      conversa.push(msg);
      for (const t of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(t.function?.arguments || "{}"); } catch { /* sem argumentos */ }
        const achados = await buscarItens(usuario, empresa, args.termo);
        const saida = achados.map((i: any) => {
          const ref = "i" + (++n);
          refs.set(ref, i);
          return { ref, nome: i.descricao_total || i.produto, codigo: i.codigo, tipo: i.tipo, estoque: i.estoque_total ?? 0 };
        });
        conversa.push({ role: "tool", tool_call_id: t.id, content: JSON.stringify(saida.length ? saida : { aviso: "Nada encontrado. Peça outro nome ou o código da peça." }) });
      }
      continue;
    }
    let s: any;
    try { s = JSON.parse(msg.content || "{}"); } catch { s = {}; }
    const rs = s?.resumo || {};
    const item = refs.get(String(rs.item_ref || ""));
    let pronto = Boolean(s?.pronto);
    if (pronto && !item && rodada < 5) {
      conversa.push({ role: "assistant", content: msg.content || "" }, { role: "system", content: "Você marcou pronto sem um item_ref válido desta resposta. Chame buscar_itens com o nome do item e responda de novo." });
      continue;
    }
    const setor = SETORES.includes(String(rs.setor)) ? String(rs.setor) : "";
    const qtd = Math.trunc(Number(rs.quantidade) || 0);
    let resposta = String(s?.resposta || "").slice(0, 1500);
    if (pronto && !temFoto) { pronto = false; resposta = "Antes de mandar para o setor, preciso de uma foto da peça mostrando o dano. Toque na câmera e tire a foto, por favor."; }
    if (pronto && (!item || !setor || qtd < 1 || String(rs.dano || "").trim().length < 5)) pronto = false;
    if (pronto && qtd > Number(item.estoque_total || 0)) { pronto = false; resposta = `Esse item tem ${item.estoque_total ?? 0} peça(s) no estoque. Quantas estão danificadas?`; }
    return json({
      resposta: resposta || "Pode me mandar a foto da peça?",
      pronto,
      resumo: pronto ? {
        item_id: item.id, item_nome: item.descricao_total || item.produto, item_codigo: item.codigo || "", item_foto: item.foto_url || "",
        estoque: item.estoque_total ?? 0, quantidade: qtd, dano: String(rs.dano).trim().slice(0, 400), setor,
        local: String(rs.local || "").trim().replace(/^n[aã]o sei\.?$/i, "").slice(0, 80),
        justificativa: String(rs.justificativa || "").slice(0, 400),
      } : null,
    });
  }
  return json({ erro: "O Marcos se enrolou na busca do item. Pode repetir o nome da peça?" }, 502);
}

export async function transcrever(body: any, json: (b: unknown, s?: number) => Response) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "Transcrição indisponível agora." }, 500);
  const m = String(body?.audio || "").match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return json({ erro: "Áudio inválido." }, 400);
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length < 800) return json({ erro: "O áudio ficou curto demais. Fale de novo, um pouco mais." }, 400);
  if (bytes.length > 12 * 1024 * 1024) return json({ erro: "Áudio longo demais. Mande em partes de até 3 minutos." }, 400);
  const tipo = m[1].toLowerCase();
  const ext = /mp4|m4a|aac/.test(tipo) ? "m4a" : tipo.includes("ogg") ? "ogg" : tipo.includes("wav") ? "wav" : /mpeg|mp3/.test(tipo) ? "mp3" : "webm";
  const tentar = async (modelo: string) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: tipo }), `audio.${ext}`);
    form.append("model", modelo);
    form.append("language", "pt");
    form.append("prompt", "Peça danificada no depósito da Chiavari: poltrona, sofá, cadeira, mesa, aparador, banqueta, tampo, pé, tecido rasgado, estofado, pintura, solda, prateleira, galpão.");
    form.append("response_format", "json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `Falha na transcrição (${r.status})`);
    return String(d?.text || "").trim();
  };
  let texto = "";
  try { texto = await tentar("gpt-4o-transcribe"); } catch (e) { console.warn("transcrição principal falhou:", e); texto = await tentar("whisper-1"); }
  if (!texto) return json({ erro: "Não consegui entender o áudio. Pode falar de novo?" }, 422);
  return json({ texto: texto.slice(0, 4000) });
}
