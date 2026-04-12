import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // =========================
    // 1️⃣ Ler body enviado pelo trigger
    // =========================
    const body = await req.json().catch(() => null);

    const id = body?.id;
    const assunto = body?.assunto;
    const respostaBase = body?.resposta_base;
    const observacoes = body?.observacoes ?? "";

    if (!id || !assunto || !respostaBase) {
      return new Response(
        JSON.stringify({ erro: "Dados insuficientes para gerar embedding" }),
        { status: 400 }
      );
    }

    // =========================
    // 2️⃣ Variáveis de ambiente
    // =========================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !openaiKey) {
      throw new Error("Variáveis de ambiente ausentes");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================
    // 3️⃣ Montar texto base (SEM SELECT)
    // =========================
    const textoBase = `
${assunto}

${respostaBase}

${observacoes}
`.trim();

    if (!textoBase) {
      throw new Error("Texto base vazio para embedding");
    }

    // =========================
    // 4️⃣ Gerar embedding (OpenAI)
    // =========================
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const embeddingRes = await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: textoBase,
        }),
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout));

    if (!embeddingRes.ok) {
      const errText = await embeddingRes.text();
      throw new Error("Erro OpenAI: " + errText);
    }

    const embeddingData = await embeddingRes.json();
    const embeddingArray = embeddingData?.data?.[0]?.embedding;

    if (!Array.isArray(embeddingArray) || embeddingArray.length === 0) {
      throw new Error("Embedding inválido retornado pela OpenAI");
    }

    // =========================
    // 5️⃣ Converter para pgvector
    // =========================
    const embeddingVector = `[${embeddingArray.join(",")}]`;

    // =========================
    // 6️⃣ Salvar embedding (agora SEM race condition)
    // =========================
    const { data: updated, error: updateError } = await supabase
      .from("ia_conhecimento")
      .update({ embedding: embeddingVector })
      .eq("id", id)
      .select("id");

    if (updateError) {
      throw updateError;
    }

    if (!updated || updated.length === 0) {
      throw new Error(
        "UPDATE não afetou nenhuma linha (id não encontrado)"
      );
    }

    // =========================
    // 7️⃣ Sucesso
    // =========================
    return new Response(
      JSON.stringify({ status: "ok", id }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ Erro gerar-embedding:", err);

    return new Response(
      JSON.stringify({ erro: String(err) }),
      { status: 500 }
    );
  }
});
