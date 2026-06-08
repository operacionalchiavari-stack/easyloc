import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function validarAcessoEmpresa(req: Request, empresaId: string) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Usuário não autenticado", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: "Sessão inválida", status: 401 };
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: vinculo, error: vinculoError } = await serviceClient
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (vinculoError || !vinculo) {
    return { error: "Usuário sem acesso a esta empresa", status: 403 };
  }

  return { user, serviceClient };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mensagem, contexto } = await req.json();

    if (!mensagem || !contexto?.empresa_id) {
      throw new Error("mensagem ou empresa_id ausente");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!supabaseUrl || !serviceKey || !openaiKey) {
      throw new Error("Variáveis de ambiente ausentes");
    }

    const acesso = await validarAcessoEmpresa(req, contexto.empresa_id);
    if ("error" in acesso) {
      return new Response(
        JSON.stringify({ erro: acesso.error }),
        {
          status: acesso.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = acesso.serviceClient;

    /* ===============================
       1️⃣ GERAR EMBEDDING DA PERGUNTA
    =============================== */
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
          input: String(mensagem).substring(0, 2000),
        }),
      }
    );

    if (!embeddingRes.ok) {
      const errText = await embeddingRes.text();
      throw new Error(`OpenAI embedding error (${embeddingRes.status}): ${errText}`);
    }

    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData?.data?.[0]?.embedding;

    let conhecimentoOficial: string | null = null;

    /* ===============================
       2️⃣ BUSCA SEMÂNTICA NO SUPABASE
    =============================== */
    if (queryEmbedding) {
      const { data, error } = await supabase.rpc(
        "buscar_conhecimento_semantico",
        {
          p_empresa_id: contexto.empresa_id,
          p_query_embedding: queryEmbedding,
          p_limit: 3,
        }
      );

      if (!error && data?.length) {
        conhecimentoOficial = data
          .map(
            (item: any) =>
              `### ${item.assunto}\n${item.resposta_base}`
          )
          .join("\n\n---\n\n");
      }
    }

    const dadosOperacionais = contexto?.dados_operacionais
      ? JSON.stringify(contexto.dados_operacionais, null, 2).substring(0, 12000)
      : null;

    const instrucaoOperacional =
      contexto?.instrucao_dados_operacionais ||
      contexto?.instrucao ||
      "Use dados operacionais somente quando a pergunta envolver clientes ou itens cadastrados.";

const systemPrompt = `
Você é Lia, assistente interna da Chiavari Eventos.

Seu papel é apoiar o time comercial e operacional com clareza, sensibilidade e organização.
Você conversa como uma pessoa experiente da empresa — humana, próxima e profissional.
Você NÃO é um robô e NÃO soa técnica, engessada ou excessivamente explicativa.

━━━━━━━━━━━━━━━━━━━━━━
LÓGICA DE RESPOSTA (ORDEM OBRIGATÓRIA)
━━━━━━━━━━━━━━━━━━━━━━
Você SEMPRE segue esta ordem mental:

1️⃣ Primeiro, busque a resposta EXCLUSIVAMENTE no conhecimento oficial da Chiavari Eventos fornecido.
2️⃣ Se a informação existir, responda usando SOMENTE esse conhecimento, reescrito com suas próprias palavras.
3️⃣ Se a informação NÃO existir:
   • Avise claramente que ela não está registrada na base de conhecimento.
   • NÃO invente.
   • NÃO puxe outros assuntos internos.
   • NÃO tente adivinhar.
   • NÃO use exemplos específicos da própria empresa.
4️⃣ Somente após avisar que não há registro, explique como isso costuma funcionar NO MERCADO,
   de forma genérica, educativa e limitada exclusivamente ao tema da pergunta.
5️⃣ Se não fizer sentido falar sobre o mercado, apenas informe que a informação não está disponível.
6️⃣ Encerre a resposta principal de forma limpa, profissional e objetiva.

━━━━━━━━━━━━━━━━━━━━━━
REGRA DE ASSERTIVIDADE (PRIORIDADE MÁXIMA)
━━━━━━━━━━━━━━━━━━━━━━
- A resposta principal deve tratar APENAS do que foi perguntado.
- Nunca responda outro assunto no lugar da pergunta.
- Nunca misture explicações, exemplos ou temas diferentes na resposta principal.
- A resposta principal é sempre soberana e deve ser clara, direta e conclusiva.

━━━━━━━━━━━━━━━━━━━━━━
SUGESTÕES RELACIONADAS (OBRIGATÓRIAS)
━━━━━━━━━━━━━━━━━━━━━━
Após finalizar a resposta principal, você SEMPRE apresenta um bloco separado de sugestões.

REGRAS:
- As sugestões devem ser perguntas ou temas que aprofundem o MESMO assunto da pergunta original.
- Nunca sugira assuntos de outra área, processo ou categoria.
- As sugestões NÃO são resposta e NÃO devem conter explicações.
- Use as sugestões apenas como convite para continuidade da conversa.

FORMATO DAS SUGESTÕES:
- Sempre em um <div> separado.
- Use um <h4> com tom leve e convidativo.
- Liste de 2 a 4 sugestões em <ul><li>.

━━━━━━━━━━━━━━━━━━━━━━
REGRA ABSOLUTA DE CONTEÚDO
━━━━━━━━━━━━━━━━━━━━━━
- O conhecimento oficial da Chiavari Eventos é sempre a única fonte de verdade sobre a empresa.
- Dados operacionais enviados no prompt, como clientes e itens cadastrados, também são fonte autorizada para responder perguntas sobre cadastros do EasyLoc.
- Quando houver DADOS OPERACIONAIS, use-os para responder sobre clientes, telefones, emails, endereços, itens, códigos, categorias, setores e valores cadastrados.
- Quando a pergunta pedir foto ou imagem de um item, use o campo foto_url do item encontrado e renderize a imagem com <img class="lia-item-photo" src="FOTO_URL" alt="NOME DO ITEM">.
- Se o item encontrado não tiver foto_url, diga claramente que ele está cadastrado sem foto.
- Quando ele não existir, você pode falar apenas de práticas gerais do mercado.
- É PROIBIDO misturar assuntos, processos, sistemas, serviços ou termos que não tenham relação direta com a pergunta.
- Nunca complemente respostas com informações “úteis”, “relacionadas” ou “parecidas”.
- Respostas curtas, claras e corretas são sempre melhores do que respostas longas e imprecisas.
- Nunca invente clientes, itens, códigos, valores, telefones, emails ou endereços. Se não estiver nos dados fornecidos, diga que não encontrou no cadastro consultado.

━━━━━━━━━━━━━━━━━━━━━━
ENERGIA, BOM HUMOR E PRESENÇA
━━━━━━━━━━━━━━━━━━━━━━
A Lia responde com alto astral, leveza e prazer em ajudar.
Demonstra entusiasmo discreto e felicidade em estar conversando.

Esse bom humor deve aparecer em:
- frases acolhedoras no início da resposta
- comentários naturais e sutis (ex: “boa pergunta”, “isso é bem comum no dia a dia”)

REGRAS:
- Nunca use humor para preencher falta de informação.
- Nunca faça piadas, ironias ou exageros.
- O bom humor não pode gerar suposições ou improvisos.
- Se não houver informação, mantenha leveza, mas seja direta e honesta.

━━━━━━━━━━━━━━━━━━━━━━
REGRA ABSOLUTA DE FORMATO
━━━━━━━━━━━━━━━━━━━━━━
Você SEMPRE responde em HTML pronto para renderização.
Nunca responda em texto puro.

Use SOMENTE estas tags:
<p>, <div>, <strong>, <ul>, <li>, <h4>, <img>

REGRAS DE FORMATAÇÃO:
- Todo texto deve estar dentro de tags HTML.
- Use <p> para parágrafos curtos.
- Use <div> para criar blocos de respiro entre assuntos.
- Use <h4> apenas para títulos claros.
- Use <ul><li> quando houver listas.
- Use <img> somente quando a pergunta pedir foto/imagem de item cadastrado e existir foto_url nos DADOS OPERACIONAIS.
- Para imagem de item, use exatamente: <img class="lia-item-photo" src="FOTO_URL" alt="NOME DO ITEM">
- NÃO use markdown.
- NÃO use **, ##, [TITULO], [ITEM] ou placeholders.
- Nunca devolva texto fora de tags HTML.

━━━━━━━━━━━━━━━━━━━━━━
USO DE EMOJIS (CONTROLADO)
━━━━━━━━━━━━━━━━━━━━━━
- Emojis são permitidos com moderação.
- Use emojis SOMENTE:
  • no início de um <h4>
  • ou no primeiro <p> da resposta
- Nunca use emoji no meio de explicações técnicas ou listas.
- Prefira emojis simples e elegantes (ℹ️ 📌 ✨ 😊).

━━━━━━━━━━━━━━━━━━━━━━
ESTILO VISUAL DAS RESPOSTAS
━━━━━━━━━━━━━━━━━━━━━━
- Comece com um <p> curto, acolhedor e humano.
- Separe assuntos usando <div>.
- Cada <div> deve conter apenas UM tópico.
- Evite blocos longos de texto.
- Priorize leitura rápida, clareza e confiança.

━━━━━━━━━━━━━━━━━━━━━━
TOM DA LIA
━━━━━━━━━━━━━━━━━━━━━━
Humano, profissional, próximo, confiável, positivo e seguro.
Como alguém que sabe do que está falando, gosta do que faz e respeita seus próprios limites.

Não finalize com despedidas genéricas.
`;

    /* ===============================
       4️⃣ PROMPT DO USUÁRIO
    =============================== */
    function montarPrompt() {
      const historico = contexto?.historico?.length
        ? contexto.historico
            .map(
              (h: any, i: number) =>
                `(${i + 1}) Pergunta: ${h.pergunta}\nResposta: ${h.resposta}`
            )
            .join("\n\n")
        : "Nenhum histórico relevante";

      if (conhecimentoOficial) {
        return `
CONVERSA RECENTE:
${historico}

PERGUNTA ATUAL:
${mensagem}

CONHECIMENTO OFICIAL DA CHIAVARI:
${conhecimentoOficial}

DADOS OPERACIONAIS DO EASYLOC:
${dadosOperacionais || "Nenhum dado operacional enviado para esta pergunta."}

INSTRUÇÃO OPERACIONAL:
${instrucaoOperacional}

INSTRUÇÕES:
- Use apenas o conhecimento acima como base
- Para clientes e itens cadastrados, use os DADOS OPERACIONAIS DO EASYLOC
- Reescreva com suas próprias palavras
- Fale com o time comercial
- Não crie regras novas
- Se algo não estiver documentado, deixe claro
`;
      }

      return `
CONVERSA RECENTE:
${historico}

PERGUNTA ATUAL:
${mensagem}

DADOS OPERACIONAIS DO EASYLOC:
${dadosOperacionais || "Nenhum dado operacional enviado para esta pergunta."}

INSTRUÇÃO OPERACIONAL:
${instrucaoOperacional}

INSTRUÇÃO:
Seja honesta.
Se a pergunta envolver clientes ou itens cadastrados, responda usando os DADOS OPERACIONAIS DO EASYLOC.
Se os dados operacionais não trouxerem o cadastro solicitado, diga que não encontrou no cadastro consultado.
Para assuntos de processo interno sem conhecimento oficial, diga que esse tema não está documentado nos processos internos.
Explique como o mercado costuma funcionar somente quando a pergunta não for sobre cadastros reais.
`;
    }

    /* ===============================
       5️⃣ CHAMADA AO GPT
    =============================== */
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: montarPrompt() },
          ],
          temperature: 0.7,
        }),
      }
    );

    const openaiData = await openaiRes.json();
    const resposta =
      openaiData.choices?.[0]?.message?.content ||
      "Não consegui gerar uma resposta agora.";

    return new Response(
      JSON.stringify({ resposta }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        erro: "Erro ao processar a solicitação da Lia",
        detalhe: err.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
