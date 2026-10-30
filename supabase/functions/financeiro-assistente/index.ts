// Clara, a assistente financeira da Conciliação (out/2026).
//  ler_extrato:   lê o extrato enviado (grade de Excel/CSV, linhas de OFX, ou PDF). Para planilhas aprende o formato
//                 de cada banco uma vez (fin_extrato_modelos) e depois lê sempre pelas mesmas regras (leitura.mjs).
//  organizar:     para cada linha ainda não conciliada da conta, grava uma SUGESTÃO (fin_extrato.sugestao):
//                 baixa de título(s), transferência entre contas, lançamento com categoria e centro de custo, ou ignorar.
//                 Nada é aplicado aqui: a pessoa confere e confirma pela tela (fin_assist_aplicar).
//  classificar_dre: sugere categoria e centro de custo para títulos sem classificação (a pessoa confirma).
//  sugerir_centros: propõe centros de custo a partir dos lançamentos.
//  conversar:     perguntas sobre o financeiro ("por que o saldo não bate?").
// Exige o login da equipe + 2FA. Ler o extrato e organizar exigem financeiro.fluxo.editar; o resto, visualizar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
// @ts-ignore módulo JS puro, compartilhado com os testes em node
import * as L from "./leitura.mjs";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const MODELO = Deno.env.get("FIN_ASSISTENTE_MODEL") || "gpt-4.1";
const NOME = Deno.env.get("FIN_ASSISTENTE_NOME") || "Clara";
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "");

async function openaiJson(messages: any[], nome: string, schema: any, timeout = 90000) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("A assistente não está configurada (OPENAI_API_KEY).");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.1, messages, response_format: { type: "json_schema", json_schema: { name: nome, strict: true, schema } } }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "A assistente está indisponível agora.");
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}
async function openaiTexto(messages: any[], timeout = 60000) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("A assistente não está configurada (OPENAI_API_KEY).");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.3, messages }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "A assistente está indisponível agora.");
  return String(data.choices?.[0]?.message?.content || "").trim();
}
// A IA às vezes devolve "k3 = Locação", o nome ("Comercial") ou "cc2 (Logística)" em vez do código: aceita os três.
function achar<T extends { ref: string; txt: string }>(refs: T[], valor: string, prefixo: string): T | undefined {
  const v = String(valor || "").trim();
  if (!v) return undefined;
  const m = v.match(new RegExp("(?:^|[^a-z])(" + prefixo + "[0-9]+)(?![0-9])", "i"));
  const porRef = m && refs.find((r) => r.ref.toLowerCase() === m[1].toLowerCase());
  if (porRef) return porRef;
  const limpa = (s: string) => L.normal(s).replace(/\s*\((entrada|saida)\)$/, "").replace(/^[0-9.]+\s+/, "");
  const nv = limpa(v.replace(/\s*\(.*\)$/, "").replace(/^[a-z]+[0-9]+\s*=\s*/i, ""));
  return refs.find((r) => limpa(r.txt) === nv) || refs.find((r) => nv.length >= 4 && limpa(r.txt).includes(nv));
}
const obj = (props: Record<string, any>) => ({ type: "object", additionalProperties: false, properties: props, required: Object.keys(props) });
const str = { type: "string" }, int = { type: "integer" }, numero = { type: "number" };

async function todos(db: any, tabela: string, colunas: string, ajustar: (q: any) => any, limite = 5000) {
  const out: any[] = [];
  for (let de = 0; de < limite; de += 1000) {
    const { data, error } = await ajustar(db.from(tabela).select(colunas)).range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ------------------------------------------------------------------ leitura do extrato
const ESQUEMA_MODELO = obj({
  banco: str, linha_cabecalho: int, linha_inicio: int,
  colunas: obj({ data: int, descricao: int, valor: int, credito: int, debito: int, tipo_dc: int, documento: int, contraparte: int, contraparte_doc: int, saldo: int }),
  descricao_extra: { type: "array", items: int },
  formato_valor: { type: "string", enum: ["sinal", "credito_debito", "valor_dc"] },
  saida_dc: { type: "array", items: str },
  formato_data: { type: "string", enum: ["dmy", "mdy"] },
  palavras_pular: { type: "array", items: str },
  inverter_sinal: { type: "boolean" },
  observacao: str,
});

async function aprenderModelo(grade: any[][]) {
  const amostra = grade.slice(0, 45).map((l, i) => `L${i + 1}: ` + l.slice(0, 24).map((c, k) => `[${k}] ${String(c ?? "").slice(0, 50)}`).join(" | ")).join("\n");
  const fim = grade.length > 60 ? "\n…\n" + grade.slice(-6).map((l, i) => `L${grade.length - 5 + i}: ` + l.slice(0, 24).map((c, k) => `[${k}] ${String(c ?? "").slice(0, 50)}`).join(" | ")).join("\n") : "";
  const m = await openaiJson([
    { role: "system", content: "Você é especialista em extratos bancários brasileiros. Recebe as primeiras linhas de uma planilha de extrato (cada célula com o índice da coluna entre colchetes) e descreve o FORMATO para que um programa leia todas as linhas. Regras: linha_cabecalho é o número (L) da linha com os títulos das colunas (Data, Histórico, Valor…), ou 0 se não houver; linha_inicio é o número (L) da PRIMEIRA linha de lançamento. Índices de coluna começam em 0; use -1 quando a coluna não existir. formato_valor: 'sinal' quando uma coluna tem o valor com sinal (negativo = saída); 'credito_debito' quando há colunas separadas de entrada e saída; 'valor_dc' quando o valor é sempre positivo e outra coluna diz C/D. saida_dc: os textos dessa coluna que significam saída (ex.: D, DÉBITO). descricao_extra: outras colunas de texto úteis para identificar o lançamento (histórico complementar, detalhe), sem repetir a descrição. contraparte = nome de quem pagou/recebeu, se houver coluna própria; contraparte_doc = CPF/CNPJ dela. palavras_pular: começos de descrição de linhas que NÃO são lançamentos (ex.: SALDO ANTERIOR, SALDO DO DIA, SALDO FINAL, TOTAL). formato_data: 'mdy' só se as datas forem claramente mês/dia. inverter_sinal: true só se as saídas aparecem como positivas e as entradas negativas. banco: nome do banco se aparecer." },
    { role: "user", content: amostra + fim },
  ], "modelo_extrato", ESQUEMA_MODELO);
  return m;
}

const ESQUEMA_PDF = obj({
  banco: str,
  lancamentos: { type: "array", items: obj({ data: str, descricao: str, valor: numero, documento: str, contraparte: str, saldo: { type: ["number", "null"] } }) },
});

async function lerPdf(base64: string, nome: string) {
  const r = await openaiJson([
    { role: "system", content: "Você é especialista em extratos bancários brasileiros. Leia o extrato em PDF e liste TODOS os lançamentos, na ordem do arquivo. data em AAAA-MM-DD; valor com sinal (entrada positiva, saída negativa); descricao exatamente como no extrato (histórico + complemento); documento = número do documento se houver, senão ''; contraparte = nome de quem pagou/recebeu se aparecer, senão ''; saldo = saldo da linha se houver, senão null. Não inclua linhas de saldo (SALDO ANTERIOR, SALDO DO DIA), totais nem cabeçalhos. banco = nome do banco." },
    { role: "user", content: [{ type: "file", file: { filename: /\.pdf$/i.test(nome) ? nome : nome + ".pdf", file_data: `data:application/pdf;base64,${base64}` } }, { type: "text", text: "Liste os lançamentos deste extrato." }] },
  ], "extrato_pdf", ESQUEMA_PDF, 140000);
  const linhas = (r.lancamentos || []).map((l: any, i: number) => ({
    data: L.lerData(l.data), valor: r2(l.valor), descricao: String(l.descricao || "").slice(0, 300),
    documento: l.documento || null, contraparte: l.contraparte || null, contraparte_doc: null,
    saldo: typeof l.saldo === "number" ? l.saldo : null, ordem: i,
  })).filter((l: any) => l.data && l.valor);
  return { banco: r.banco || "", linhas };
}

function limparGrade(g: any): any[][] {
  if (!Array.isArray(g)) return [];
  return g.slice(0, 8000).map((l: any) => (Array.isArray(l) ? l.slice(0, 40).map((c: any) => (typeof c === "number" ? c : String(c ?? "").slice(0, 200))) : []));
}

async function lerExtrato(ctx: any, body: any) {
  const arq = body.arquivo || {};
  const nome = String(arq.nome || "extrato").slice(0, 200);
  let linhas: any[] = [], banco = "", modeloNovo = false, formato = String(arq.formato || "");
  if (formato === "grade") {
    const grade = limparGrade(arq.grade);
    if (!grade.length) throw new Error("O arquivo está vazio.");
    const assinatura = L.assinaturaGrade(grade);
    const { data: salvo } = await admin.from("fin_extrato_modelos").select("id,modelo,banco,usos").eq("empresa_id", ctx.empresa).eq("assinatura", assinatura).maybeSingle();
    let modelo = salvo?.modelo, r: any = null;
    if (modelo) {
      r = L.aplicarModelo(grade, modelo);
      if (!r.linhas.length || r.linhas.length < r.candidatas * 0.6) modelo = null; // o banco mudou a planilha
    }
    if (!modelo) {
      modelo = await aprenderModelo(grade);
      r = L.aplicarModelo(grade, modelo);
      if (!r.linhas.length) throw new Error("Não consegui encontrar os lançamentos nesse arquivo. Confira se é o extrato da conta (com data, descrição e valor).");
      modeloNovo = true;
    }
    banco = modelo.banco || salvo?.banco || "";
    await admin.from("fin_extrato_modelos").upsert({ empresa_id: ctx.empresa, assinatura, banco, modelo, usos: (salvo?.usos || 0) + 1, updated_at: new Date().toISOString() }, { onConflict: "empresa_id,assinatura" });
    linhas = r.linhas;
  } else if (formato === "ofx") {
    linhas = (Array.isArray(arq.linhas) ? arq.linhas : []).slice(0, 8000).map((l: any, i: number) => ({
      data: L.lerData(l.data), valor: r2(l.valor), descricao: String(l.descricao || "").slice(0, 300), documento: l.fitid ? String(l.fitid).slice(0, 80) : null,
      contraparte: null, contraparte_doc: null, saldo: null, ordem: i,
    })).filter((l: any) => l.data && l.valor);
    banco = String(arq.banco || "");
  } else if (formato === "pdf") {
    const b64 = String(arq.pdf_base64 || "");
    if (!b64 || b64.length > 14_000_000) throw new Error("PDF vazio ou grande demais (até 10 MB).");
    const r = await lerPdf(b64, nome);
    linhas = r.linhas; banco = r.banco; modeloNovo = true;
  } else throw new Error("Formato de arquivo não suportado.");
  if (!linhas.length) throw new Error("Não encontrei lançamentos nesse arquivo.");
  const comId = L.comSeq(L.comFitid(linhas));
  return { formato, banco, modelo_novo: modeloNovo, arquivo: nome, linhas: comId, resumo: { ...L.resumoLinhas(linhas), total: linhas.length } };
}

// ------------------------------------------------------------------ organizar (sugestões)
async function organizar(ctx: any, body: any) {
  const db = ctx.db, conta = String(body.conta_id || "");
  if (!UUID.test(conta)) throw new Error("Escolha a conta");
  let q = db.from("fin_extrato").select("*").eq("empresa_id", ctx.empresa).eq("conta_id", conta).is("baixa_id", null).is("transferencia_grupo", null).is("conciliado_em", null).eq("ignorado", false);
  if (!body.refazer) q = q.is("sugestao", null);
  if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.filter((x: string) => UUID.test(x)).slice(0, 200));
  const { data: pend, error } = await q.order("data").limit(160);
  if (error) throw new Error(error.message);
  if (!pend?.length) return { total: 0, alta: 0, media: 0, baixa: 0, duvida: 0, restantes: 0 };
  const dIni = pend[0].data, dFim = pend[pend.length - 1].data;
  const desloca = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  const [rec, pag, cats, ccs, contas, regras, movs, ligados, outras, totalPend] = await Promise.all([
    todos(db, "fin_receber", "id,descricao,cliente_nome,pedido_numero,componente,vencimento,valor,aberto,conta_id,categoria_id,centro_custo_id,status", (x) => x.eq("empresa_id", ctx.empresa).in("status", ["aberto", "parcial"])),
    todos(db, "fin_pagar", "id,descricao,fornecedor_nome,vencimento,programado_para,valor,aberto,conta_id,categoria_id,centro_custo_id,status,requer_aprovacao,aprovacao", (x) => x.eq("empresa_id", ctx.empresa).not("status", "in", "(pago,cancelado)")),
    todos(db, "fin_categorias", "id,codigo,nome,tipo,chave,pai_id", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    todos(db, "fin_centros_custo", "id,codigo,nome", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    todos(db, "fin_contas", "id,nome,banco,tipo", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    todos(db, "fin_assist_regras", "*", (x) => x.eq("empresa_id", ctx.empresa)),
    todos(db, "fin_movimentos", "id,transferencia_grupo,direcao,data,valor,conta_id,descricao", (x) => x.eq("empresa_id", ctx.empresa).eq("tipo", "transferencia").is("cancelado_em", null).eq("conta_id", conta).gte("data", desloca(dIni, -5)).lte("data", desloca(dFim, 5))),
    todos(db, "fin_extrato", "transferencia_grupo", (x) => x.eq("empresa_id", ctx.empresa).eq("conta_id", conta).not("transferencia_grupo", "is", null)),
    todos(db, "fin_extrato", "id,conta_id,data,valor,descricao", (x) => x.eq("empresa_id", ctx.empresa).neq("conta_id", conta).is("baixa_id", null).is("transferencia_grupo", null).is("conciliado_em", null).eq("ignorado", false).gte("data", desloca(dIni, -4)).lte("data", desloca(dFim, 4))),
    db.from("fin_extrato").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.empresa).eq("conta_id", conta).is("baixa_id", null).is("transferencia_grupo", null).is("conciliado_em", null).eq("ignorado", false).is("sugestao", null),
  ]);
  const contaNome = (id: string) => contas.find((c: any) => c.id === id)?.nome || "outra conta";
  const catNome = (id: string) => { const c = cats.find((x: any) => x.id === id); return c ? (c.codigo ? c.codigo + " " : "") + c.nome : ""; };
  const ccNome = (id: string) => ccs.find((x: any) => x.id === id)?.nome || "";
  const DIVISAO: Record<string, string> = { locacao: "Locação", frete: "Frete", montagem: "Montagem" };
  const juntar = (partes: string[]) => partes.filter(Boolean).reduce((acc: string[], p) => (acc.some((a) => L.normal(a).includes(L.normal(p))) ? acc : [...acc, p]), []).join(" · ");
  const titulos = [
    ...rec.map((t: any) => ({ tipo: "receber", id: t.id, aberto: Number(t.aberto), valor: Number(t.valor), nome: t.cliente_nome || "", descricao: juntar([t.descricao, t.pedido_numero ? "Pedido " + t.pedido_numero : "", DIVISAO[t.componente] || ""]), vencimento: t.vencimento, pedido_numero: t.pedido_numero, conta_id: t.conta_id, centro: t.centro_custo_id, categoria: t.categoria_id })),
    ...pag.filter((t: any) => !(t.requer_aprovacao && t.aprovacao !== "aprovada")).map((t: any) => ({ tipo: "pagar", id: t.id, aberto: Number(t.aberto), valor: Number(t.valor), nome: t.fornecedor_nome || "", descricao: t.descricao || "", vencimento: t.programado_para || t.vencimento, pedido_numero: null, conta_id: t.conta_id, centro: t.centro_custo_id, categoria: t.categoria_id })),
  ];
  const tituloPorId = new Map(titulos.map((t) => [t.id, t]));
  const gruposLigados = new Set(ligados.map((x: any) => x.transferencia_grupo));
  const movLivres = movs.filter((m: any) => !gruposLigados.has(m.transferencia_grupo));
  const resumoTitulo = (t: any) => (t.tipo === "receber" ? "Recebimento" : "Pagamento") + " · " + [t.nome, t.descricao].filter(Boolean).join(" · ") + " · venc. " + dataBr(t.vencimento) + " · em aberto " + brl(t.aberto);

  const sugestoes = new Map<string, any>();
  const paraIa: any[] = [];
  const usadosMov = new Set<string>(), usadosPar = new Set<string>();
  for (const l of pend) {
    const v = Math.abs(Number(l.valor)), dir = l.valor > 0 ? "entrada" : "saida";
    const linha = { ...l, valor: Number(l.valor) };
    // 1) transferência já registrada no sistema
    const mov = movLivres.find((m: any) => !usadosMov.has(m.id) && m.direcao === dir && Math.abs(Number(m.valor) - v) < 0.01 && Math.abs(Date.parse(m.data) - Date.parse(l.data)) <= 3 * 86400000);
    if (mov) {
      usadosMov.add(mov.id);
      sugestoes.set(l.id, { acao: { tipo: "transferencia", grupo: mov.transferencia_grupo }, confianca: "alta", origem: "transferencia", motivo: "Já existe uma transferência de mesmo valor registrada nesta conta em " + dataBr(mov.data) + ".", resumo: "Transferência já registrada · " + (mov.descricao || "") });
      continue;
    }
    const cands = L.candidatosDaLinha(linha, titulos);
    const par = outras.find((o: any) => !usadosPar.has(o.id) && Math.abs(Number(o.valor) + Number(l.valor)) < 0.01 && Math.abs(Date.parse(o.data) - Date.parse(l.data)) <= 3 * 86400000);
    const regra = regras.find((g: any) => g.direcao === dir && g.chave && g.chave === L.chaveRegra(l.contraparte || l.descricao));
    const forte = cands[0] && cands[0].pontos >= 90 && Math.abs(cands[0].t.aberto - v) < 0.01 && (!cands[1] || cands[1].pontos <= cands[0].pontos - 30);
    // 2) regra aprendida (se não houver um título que claramente bate)
    if (regra && !(cands[0] && cands[0].pontos >= 80)) {
      const acao: any = regra.acao === "transferencia" ? { tipo: "transferencia", conta_id: regra.conta_destino, par_extrato: par?.id || "" }
        : regra.acao === "ignorar" ? { tipo: "ignorar" }
        : { tipo: "lancar", descricao: regra.descricao || l.descricao, nome: regra.nome || l.contraparte || "", categoria_id: regra.categoria_id, centro_custo_id: regra.centro_custo_id };
      if (acao.tipo !== "transferencia" || acao.conta_id) {
        if (par) usadosPar.add(par.id);
        sugestoes.set(l.id, { acao, confianca: "alta", origem: "regra", motivo: `Regra aprendida (usada ${regra.usos}×): ${regra.exemplo || ""}`.trim(),
          resumo: acao.tipo === "transferencia" ? "Transferência com " + contaNome(acao.conta_id) : acao.tipo === "ignorar" ? "Ignorar" : "Lançar · " + [catNome(acao.categoria_id), ccNome(acao.centro_custo_id), acao.nome].filter(Boolean).join(" · ") });
        continue;
      }
    }
    // 3) título que claramente bate (valor exato, sem concorrente)
    if (forte) {
      const t = cands[0].t;
      sugestoes.set(l.id, { acao: { tipo: "baixar", titulos: [{ tipo: t.tipo, id: t.id, valor: v }] }, confianca: "alta", origem: "valor", motivo: cands[0].motivos.join(", ") + ".", resumo: resumoTitulo(t) });
      continue;
    }
    paraIa.push({ l: linha, cands, par, regra });
  }

  // 4) o resto vai para a IA, em lotes
  const refsCat = cats.map((c: any, i: number) => ({ ref: "k" + (i + 1), id: c.id, txt: `${c.codigo || ""} ${c.nome} (${c.tipo === "entrada" ? "entrada" : "saída"})`.trim(), tipo: c.tipo }));
  const refsCc = ccs.map((c: any, i: number) => ({ ref: "cc" + (i + 1), id: c.id, txt: c.nome }));
  const refsConta = contas.map((c: any, i: number) => ({ ref: "c" + (i + 1), id: c.id, txt: c.nome + (c.banco ? " · " + c.banco : "") }));
  const ESQ = obj({ linhas: { type: "array", items: obj({
    n: str, acao: { type: "string", enum: ["baixar", "transferencia", "lancar", "ignorar", "duvida"] },
    titulos: { type: "array", items: obj({ ref: str, valor: numero }) },
    conta_ref: str, par_ref: str, categoria_ref: str, centro_ref: str, nome: str, descricao: str,
    confianca: { type: "string", enum: ["alta", "media", "baixa"] }, motivo: str }) } });
  const sistema = `Você é ${NOME}, especialista financeira (contadora experiente) que faz a conciliação bancária de uma empresa de locação de móveis para eventos (Chiavari). Para cada lançamento do extrato da conta "${contaNome(conta)}", decida:
- "baixar": o lançamento quita um ou mais títulos em aberto (contas a receber para entradas, a pagar para saídas). Use só os títulos candidatos listados (ref T…). Se um depósito paga vários títulos, liste todos com o valor de cada um (a soma deve ser o valor do lançamento). Pagamento parcial: um título só, valor = valor do lançamento.
- "transferencia": dinheiro entre contas da própria empresa (TED/PIX entre contas próprias, aplicação/resgate). conta_ref = a outra conta (c…). Se houver par_transferencia, use par_ref.
- "lancar": movimento que não tem título no sistema (tarifa bancária, IOF, juros, impostos, folha, combustível, compras, recebimento avulso…). Escolha categoria_ref compatível (entrada para valores positivos, saída para negativos), centro_ref (centro de custo mais provável) e nome (cliente/fornecedor, quando der para saber). descricao: texto curto e claro (ex.: "Tarifa de manutenção da conta").
- "ignorar": linha que não é movimento de dinheiro (estorno anulado na mesma data, bloqueio/desbloqueio, linha informativa).
- "duvida": quando não dá para saber; explique o que falta.
Confiança: "alta" só quando os dados batem sem ambiguidade (valor exato + nome ou pedido); "media" quando é provável; "baixa" quando é palpite. Sempre preencha motivo em uma frase curta em português explicando a escolha (ex.: "Valor igual ao em aberto e o nome MARIA SOUZA bate com a cliente do pedido 12."). Campos que não se aplicam: string vazia ou lista vazia. Nunca invente refs e NUNCA cite os códigos internos (L…, T…, X…, c…, k…, cc…) no motivo: fale do nome, do valor, da data, do pedido.
Contas da empresa: ${refsConta.map((c) => c.ref + "=" + c.txt).join("; ")}.
Categorias: ${refsCat.map((c) => c.ref + "=" + c.txt).join("; ")}.
Centros de custo: ${refsCc.length ? refsCc.map((c) => c.ref + "=" + c.txt).join("; ") : "(nenhum cadastrado)"}.`;
  const lotes: any[][] = [];
  for (let i = 0; i < paraIa.length; i += 25) lotes.push(paraIa.slice(i, i + 25));
  await Promise.all(lotes.map(async (lote) => {
    const mapaT = new Map<string, any>(), mapaPar = new Map<string, any>();
    const entrada = lote.map((x, i) => {
      const cands = x.cands.map((c: any, k: number) => { const ref = `T${i + 1}_${k + 1}`; mapaT.set(ref, c.t); return { ref, tipo: c.t.tipo, nome: c.t.nome, descricao: c.t.descricao, vencimento: c.t.vencimento, valor: c.t.valor, em_aberto: c.t.aberto, pontos: c.pontos, sinais: c.motivos }; });
      let par = null;
      if (x.par) { const ref = `X${i + 1}`; mapaPar.set(ref, x.par); par = { ref, conta: refsConta.find((c) => c.id === x.par.conta_id)?.ref, data: x.par.data, descricao: x.par.descricao }; }
      return { n: "L" + (i + 1), data: x.l.data, valor: x.l.valor, descricao: x.l.descricao, contraparte: x.l.contraparte || "", documento: x.l.documento || "", candidatos: cands, par_transferencia: par,
        regra_parecida: x.regra ? { acao: x.regra.acao, categoria: catNome(x.regra.categoria_id), centro: ccNome(x.regra.centro_custo_id), nome: x.regra.nome } : null };
    });
    let res: any = null;
    try { res = await openaiJson([{ role: "system", content: sistema }, { role: "user", content: JSON.stringify(entrada) }], "conciliacao", ESQ, 120000); }
    catch (e) { console.error("IA conciliação", e); }
    lote.forEach((x, i) => {
      const d = res?.linhas?.find((r: any) => r.n === "L" + (i + 1));
      const v = Math.abs(x.l.valor);
      const fallback = () => {
        const c = x.cands[0];
        if (c && Math.abs(c.t.aberto - v) < 0.01) return { acao: { tipo: "baixar", titulos: [{ tipo: c.t.tipo, id: c.t.id, valor: v }] }, confianca: "media", origem: "valor", motivo: c.motivos.join(", ") + ".", resumo: resumoTitulo(c.t) };
        return { acao: null, confianca: "baixa", origem: "nenhuma", motivo: res ? "Não encontrei um título ou classificação provável." : "A assistente não respondeu agora; escolha manualmente ou peça para organizar de novo.", resumo: "Sem sugestão" };
      };
      let s: any = null;
      const cat = achar(refsCat, d?.categoria_ref, "k"), cc = achar(refsCc, d?.centro_ref, "cc");
      if (d?.acao === "baixar") {
        const ts = (d.titulos || []).map((t: any) => ({ t: mapaT.get(t.ref), valor: r2(t.valor) })).filter((t: any) => t.t);
        let soma = ts.reduce((a: number, t: any) => a + (t.valor || 0), 0);
        if (ts.length === 1) { ts[0].valor = r2(Math.min(v, ts[0].t.aberto)); soma = ts[0].valor; }
        const ok = ts.length && ts.every((t: any) => t.valor > 0 && t.valor <= t.t.aberto + 0.01) && (ts.length === 1 ? soma <= v + 0.01 : Math.abs(soma - v) < 0.02);
        if (ok) {
          const parcial = ts.length === 1 && Math.abs(ts[0].t.aberto - v) >= 0.01;
          s = { acao: { tipo: "baixar", titulos: ts.map((t: any) => ({ tipo: t.t.tipo, id: t.t.id, valor: t.valor })), categoria_id: cat?.id || "", centro_custo_id: cc?.id || "" },
            confianca: parcial && d.confianca === "alta" ? "media" : d.confianca, origem: "ia", motivo: d.motivo + (parcial ? " (baixa parcial)" : ""),
            resumo: ts.map((t: any) => resumoTitulo(t.t)).join(" + ") };
        }
      } else if (d?.acao === "transferencia") {
        const outra = achar(refsConta, d.conta_ref, "c")?.id || mapaPar.get(d.par_ref)?.conta_id;
        if (outra && outra !== conta) {
          const parL = mapaPar.get(d.par_ref);
          s = { acao: { tipo: "transferencia", conta_id: outra, par_extrato: parL?.id || "", descricao: d.descricao || "" }, confianca: d.confianca, origem: "ia", motivo: d.motivo, resumo: "Transferência com " + contaNome(outra) + (parL ? " (linha do extrato da outra conta em " + dataBr(parL.data) + ")" : "") };
        }
      } else if (d?.acao === "lancar") {
        const tipoOk = cat && cat.tipo === (x.l.valor > 0 ? "entrada" : "saida");
        s = { acao: { tipo: "lancar", descricao: d.descricao || x.l.descricao, nome: d.nome || x.l.contraparte || "", categoria_id: tipoOk ? cat.id : "", centro_custo_id: cc?.id || "" },
          confianca: tipoOk ? d.confianca : "baixa", origem: "ia", motivo: d.motivo, resumo: "Lançar · " + [tipoOk ? cat.txt.replace(/ \((entrada|saída)\)$/, "") : "sem categoria", cc?.txt, d.nome].filter(Boolean).join(" · ") };
      } else if (d?.acao === "ignorar") {
        s = { acao: { tipo: "ignorar" }, confianca: d.confianca, origem: "ia", motivo: d.motivo, resumo: "Ignorar" };
      } else if (d?.acao === "duvida") {
        const f = fallback();
        s = { ...f, motivo: d.motivo || f.motivo, confianca: "baixa" };
      }
      if (!s) s = fallback();
      if (x.par && s.acao?.tipo === "transferencia") usadosPar.add(x.par.id);
      sugestoes.set(x.l.id, s);
    });
  }));

  const agora = new Date().toISOString();
  const cont: Record<string, number> = { alta: 0, media: 0, baixa: 0, duvida: 0 };
  const lista = [...sugestoes.entries()];
  for (let i = 0; i < lista.length; i += 20) {
    await Promise.all(lista.slice(i, i + 20).map(([id, s]) => admin.from("fin_extrato").update({ sugestao: { ...s, em: agora }, sugestao_em: agora }).eq("id", id).eq("empresa_id", ctx.empresa)));
  }
  lista.forEach(([, s]) => { if (!s.acao) cont.duvida++; else cont[s.confianca] = (cont[s.confianca] || 0) + 1; });
  const restantes = Math.max(0, (totalPend?.count || 0) - (body.refazer ? 0 : lista.length));
  return { total: lista.length, ...cont, restantes };
}

// ------------------------------------------------------------------ DRE
async function classificarDre(ctx: any) {
  const db = ctx.db;
  const desde = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  const [rec, pag, cats, ccs] = await Promise.all([
    todos(db, "fin_receber", "id,descricao,cliente_nome,pedido_numero,componente,vencimento,competencia,valor,categoria_id,centro_custo_id,status,origem", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").gte("vencimento", desde)),
    todos(db, "fin_pagar", "id,descricao,fornecedor_nome,vencimento,competencia,valor,categoria_id,centro_custo_id,status,origem", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").gte("vencimento", desde)),
    todos(db, "fin_categorias", "id,codigo,nome,tipo,chave", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    todos(db, "fin_centros_custo", "id,codigo,nome", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
  ]);
  const genericas = new Set(cats.filter((c: any) => ["outras_receitas", "outras_despesas"].includes(c.chave)).map((c: any) => c.id));
  const falta = [
    ...rec.map((t: any) => ({ ...t, tipo: "receber", nome: t.cliente_nome })),
    ...pag.map((t: any) => ({ ...t, tipo: "pagar", nome: t.fornecedor_nome })),
  ].filter((t: any) => !t.categoria_id || genericas.has(t.categoria_id) || !t.centro_custo_id).slice(0, 120);
  if (!ccs.length) return { sem_centros: true, itens: [] };
  if (!falta.length) return { itens: [] };
  const refsCat = cats.map((c: any, i: number) => ({ ref: "k" + (i + 1), id: c.id, txt: `${c.codigo || ""} ${c.nome}`.trim(), tipo: c.tipo }));
  const refsCc = ccs.map((c: any, i: number) => ({ ref: "cc" + (i + 1), id: c.id, txt: c.nome }));
  const entrada = falta.map((t: any, i: number) => ({ n: "D" + (i + 1), tipo: t.tipo === "receber" ? "receita" : "despesa", descricao: t.descricao, nome: t.nome || "", pedido: t.pedido_numero || "", divisao: t.componente || "", valor: t.valor,
    categoria_atual: refsCat.find((c) => c.id === t.categoria_id)?.ref || "", centro_atual: refsCc.find((c) => c.id === t.centro_custo_id)?.ref || "" }));
  const res = await openaiJson([
    { role: "system", content: `Você é ${NOME}, especialista financeira de uma empresa de locação de móveis para eventos. Classifique cada título para a DRE: categoria_ref (do plano de contas, receita só com categoria de entrada e despesa só com saída; mantenha a atual se já for adequada e específica) e centro_ref (centro de custo). Locação/frete/montagem de pedido são receitas do Comercial/Logística conforme a divisão. Em categoria_ref e centro_ref escreva SÓ o código (ex.: k3, cc2), nunca o nome. motivo: uma frase curta, sem códigos. Categorias: ${refsCat.map((c) => c.ref + "=" + c.txt + " (" + c.tipo + ")").join("; ")}. Centros: ${refsCc.map((c) => c.ref + "=" + c.txt).join("; ")}.` },
    { role: "user", content: JSON.stringify(entrada) },
  ], "dre", obj({ itens: { type: "array", items: obj({ n: str, categoria_ref: str, centro_ref: str, motivo: str }) } }), 120000);
  const itens = falta.map((t: any, i: number) => {
    const d = res.itens?.find((x: any) => String(x.n).trim().toUpperCase() === "D" + (i + 1)) || res.itens?.[i];
    const catAchada = achar(refsCat, d?.categoria_ref, "k");
    const cat = catAchada && catAchada.tipo === (t.tipo === "receber" ? "entrada" : "saida") ? catAchada : undefined;
    const cc = achar(refsCc, d?.centro_ref, "cc");
    return { tipo: t.tipo, id: t.id, descricao: t.descricao, nome: t.nome || "", valor: t.valor, vencimento: t.vencimento, pedido_numero: t.pedido_numero || null,
      categoria_atual: t.categoria_id, centro_atual: t.centro_custo_id, categoria_id: cat?.id || t.categoria_id || "", centro_custo_id: cc?.id || t.centro_custo_id || "", motivo: d?.motivo || "" };
  });
  return { itens };
}

async function sugerirCentros(ctx: any) {
  const db = ctx.db;
  const [pag, rec, ccs] = await Promise.all([
    todos(db, "fin_pagar", "descricao,fornecedor_nome", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").order("created_at", { ascending: false }), 1000),
    todos(db, "fin_receber", "descricao,componente", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").order("created_at", { ascending: false }), 1000),
    todos(db, "fin_centros_custo", "nome", (x) => x.eq("empresa_id", ctx.empresa)),
  ]);
  const amostra = [...new Set([...pag.slice(0, 150).map((p: any) => p.descricao + (p.fornecedor_nome ? " · " + p.fornecedor_nome : "")), ...rec.slice(0, 60).map((r: any) => r.descricao + " · " + r.componente)])].slice(0, 200);
  const r = await openaiJson([
    { role: "system", content: `Você é ${NOME}, especialista financeira. Proponha uma estrutura simples de centros de custo (4 a 8) para uma empresa de locação de móveis para eventos, a partir dos lançamentos. Não repita centros que já existem: ${ccs.map((c: any) => c.nome).join(", ") || "(nenhum)"}. Para cada um: codigo (CC-01…), nome curto e o que entra nele.` },
    { role: "user", content: amostra.join("\n") || "(sem lançamentos ainda)" },
  ], "centros", obj({ centros: { type: "array", items: obj({ codigo: str, nome: str, descricao: str }) } }));
  return { centros: r.centros || [] };
}

// ------------------------------------------------------------------ conversa
async function conversar(ctx: any, body: any) {
  const db = ctx.db;
  const hoje = new Date().toISOString().slice(0, 10), ini = hoje.slice(0, 8) + "01";
  const [contas, saldos, pend, lotes, rec, pag, dre, dreCc] = await Promise.all([
    todos(db, "fin_contas", "id,nome,banco,saldo_inicial,saldo_inicial_data", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    db.rpc("fin_saldos", { p_empresa: ctx.empresa }).then((r: any) => r.data || []),
    todos(db, "fin_extrato", "conta_id,data,valor,descricao,sugestao", (x) => x.eq("empresa_id", ctx.empresa).is("baixa_id", null).is("transferencia_grupo", null).is("conciliado_em", null).eq("ignorado", false).order("data", { ascending: false }), 2000),
    todos(db, "fin_extrato_lotes", "conta_id,arquivo_nome,banco_detectado,periodo_ini,periodo_fim,saldo_banco,saldo_data,novas,created_at", (x) => x.eq("empresa_id", ctx.empresa).order("created_at", { ascending: false }), 20),
    todos(db, "fin_receber", "aberto,vencimento,cliente_nome,pedido_numero", (x) => x.eq("empresa_id", ctx.empresa).in("status", ["aberto", "parcial"])),
    todos(db, "fin_pagar", "aberto,vencimento,fornecedor_nome,descricao", (x) => x.eq("empresa_id", ctx.empresa).not("status", "in", "(pago,cancelado)")),
    db.rpc("fin_dre", { p_empresa: ctx.empresa, p_ini: ini, p_fim: hoje }).then((r: any) => r.data || []),
    db.rpc("fin_dre_centros", { p_empresa: ctx.empresa, p_ini: ini, p_fim: hoje }).then((r: any) => r.data || []),
  ]);
  const saldosCmp = await Promise.all(lotes.filter((l: any) => l.saldo_banco != null).slice(0, 6).map(async (l: any) => {
    const { data } = await db.rpc("fin_saldo_em", { p_empresa: ctx.empresa, p_conta: l.conta_id, p_data: l.saldo_data });
    return { conta: contas.find((c: any) => c.id === l.conta_id)?.nome, data: l.saldo_data, saldo_banco: l.saldo_banco, saldo_sistema: data };
  }));
  const contexto = {
    hoje,
    contas: contas.map((c: any) => ({ nome: c.nome, banco: c.banco, saldo_sistema: saldos.find((s: any) => s.conta_id === c.id)?.saldo, saldo_inicial: c.saldo_inicial, saldo_inicial_data: c.saldo_inicial_data,
      pendentes_conciliar: pend.filter((p: any) => p.conta_id === c.id).length })),
    comparacao_saldo_banco: saldosCmp,
    extrato_pendente_exemplos: pend.slice(0, 40).map((p: any) => ({ conta: contas.find((c: any) => c.id === p.conta_id)?.nome, data: p.data, valor: p.valor, descricao: p.descricao, sugestao: p.sugestao?.resumo || null })),
    a_receber: { total: r2(rec.reduce((s: number, t: any) => s + Number(t.aberto), 0)), vencido: r2(rec.filter((t: any) => t.vencimento < hoje).reduce((s: number, t: any) => s + Number(t.aberto), 0)) },
    a_pagar: { total: r2(pag.reduce((s: number, t: any) => s + Number(t.aberto), 0)), vencido: r2(pag.filter((t: any) => t.vencimento < hoje).reduce((s: number, t: any) => s + Number(t.aberto), 0)) },
    dre_mes_atual: dre, dre_mes_por_centro: dreCc,
  };
  const msgs = (Array.isArray(body.mensagens) ? body.mensagens : []).slice(-12).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) }));
  const texto = await openaiTexto([
    { role: "system", content: `Você é ${NOME}, especialista financeira da empresa (Chiavari, locação de móveis para eventos), dentro da tela de Conciliação bancária do sistema. Responda em português, de forma direta e curta (até 6 frases ou uma lista curta), com valores em R$. Use SOMENTE os dados abaixo; se faltar informação, diga o que falta e onde a pessoa encontra no sistema. Se o saldo do banco não bate com o do sistema, explique as causas mais prováveis (linhas ainda não conciliadas, saldo inicial da conta errado, lançamentos fora do período). Você não aplica nada sozinha: as sugestões ficam na lista para a pessoa confirmar.\nDADOS: ${JSON.stringify(contexto).slice(0, 60000)}` },
    ...msgs,
  ]);
  return { resposta: texto };
}

// ------------------------------------------------------------------ servidor
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return resposta({ error: "Sessão necessária" }, 401);
    const { data: { user }, error: erroUser } = await admin.auth.getUser(token);
    if (erroUser || !user) return resposta({ error: "Sessão inválida" }, 401);
    if (await segundaEtapaPendente(authorization)) return resposta({ error: MENSAGEM_2FA }, 403);
    const body = await req.json().catch(() => ({}));
    const empresa = String(body.empresa_id || "");
    if (!UUID.test(empresa)) return resposta({ error: "Empresa inválida" }, 400);
    const pode = async (chave: string) => {
      const { data, error } = await admin.rpc("funcionario_pode", { p_empresa: empresa, p_usuario: user.id, p_chave: chave });
      if (error) throw new Error(error.message);
      return data === true;
    };
    const { data: vinculo } = await admin.from("usuarios_empresas").select("empresa_id").eq("empresa_id", empresa).eq("user_id", user.id).maybeSingle();
    if (!vinculo) return resposta({ error: "Sem acesso a esta empresa" }, 403);
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const ctx = { empresa, user, db };
    const editar = ["ler_extrato", "organizar"].includes(body.action);
    if (!await pode(editar ? "financeiro.fluxo.editar" : "financeiro.fluxo.visualizar")) return resposta({ error: "Você não tem permissão para isso no Financeiro." }, 403);
    if (body.action === "ler_extrato") return resposta(await lerExtrato(ctx, body));
    if (body.action === "organizar") return resposta(await organizar(ctx, body));
    if (body.action === "classificar_dre") return resposta(await classificarDre(ctx));
    if (body.action === "sugerir_centros") return resposta(await sugerirCentros(ctx));
    if (body.action === "conversar") return resposta(await conversar(ctx, body));
    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error(e);
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
});
