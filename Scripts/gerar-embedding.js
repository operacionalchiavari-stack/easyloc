import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Carregar variáveis de ambiente do .env
dotenv.config();

// ===============================
// CONFIGURAÇÕES (DO .env)
// ===============================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validar credenciais
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error(
    "❌ Erro: Variáveis de ambiente faltando. Verifique seu arquivo .env"
  );
  console.error("Necessário:");
  console.error("  - SUPABASE_URL");
  console.error("  - SUPABASE_SERVICE_ROLE_KEY");
  console.error("  - OPENAI_API_KEY");
  process.exit(1);
}

// ===============================
// CLIENTES
// ===============================
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ===============================
// EXECUÇÃO
// ===============================
async function gerarEmbeddings() {
  console.log("🔎 Buscando registros sem embedding...");

  const { data: registros, error } = await supabase
    .from("ia_conhecimento")
    .select("id, assunto, resposta_base, observacoes")
    .is("embedding", null)
    .eq("ativo", true);

  if (error) {
    console.error("❌ Erro ao buscar registros:", error);
    return;
  }

  if (!registros || registros.length === 0) {
    console.log("✅ Nenhum registro pendente.");
    return;
  }

  console.log(`📦 ${registros.length} registros encontrados`);

  for (const item of registros) {
    try {
      const textoBase = `
${item.assunto}

${item.resposta_base}

${item.observacoes ?? ""}
`.trim();

      console.log(`⚙️ Gerando embedding para ID ${item.id}`);

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textoBase,
      });

      const embedding = embeddingResponse.data[0].embedding;

      const { error: updateError } = await supabase
        .from("ia_conhecimento")
        .update({ embedding })
        .eq("id", item.id);

      if (updateError) {
        console.error(`❌ Erro ao salvar embedding (${item.id})`, updateError);
      } else {
        console.log(`✅ Embedding salvo (${item.id})`);
      }

    } catch (err) {
      console.error(`🔥 Erro no registro ${item.id}:`, err.message);
    }
  }

  console.log("🏁 Processo finalizado");
}

gerarEmbeddings();
