import { comUsoIA } from "../_shared/ia-uso.ts";
import { instrucoesEmpresa } from '../_shared/ia-config.ts';
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
import { esquemaCobranca, instrucoesCobranca, normalizarCobranca } from "./cobranca.mjs";

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

async function openaiJson(messages: any[], nome: string, schema: any, timeout = 90000, empresa?: string) {
  if(empresa)messages=[{role:"system",content:await instrucoesEmpresa(empresa,"financeiro")},...messages];
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

async function aprenderModelo(grade: any[][], empresa: string) {
  const amostra = grade.slice(0, 45).map((l, i) => `L${i + 1}: ` + l.slice(0, 24).map((c, k) => `[${k}] ${String(c ?? "").slice(0, 50)}`).join(" | ")).join("\n");
  const fim = grade.length > 60 ? "\n…\n" + grade.slice(-6).map((l, i) => `L${grade.length - 5 + i}: ` + l.slice(0, 24).map((c, k) => `[${k}] ${String(c ?? "").slice(0, 50)}`).join(" | ")).join("\n") : "";
  const m = await openaiJson([
    { role: "system", content: "Você é especialista em extratos bancários brasileiros. Recebe as primeiras linhas de uma planilha de extrato (cada célula com o índice da coluna entre colchetes) e descreve o FORMATO para que um programa leia todas as linhas. Regras: linha_cabecalho é o número (L) da linha com os títulos das colunas (Data, Histórico, Valor…), ou 0 se não houver; linha_inicio é o número (L) da PRIMEIRA linha de lançamento. Índices de coluna começam em 0; use -1 quando a coluna não existir. formato_valor: 'sinal' quando uma coluna tem o valor com sinal (negativo = saída); 'credito_debito' quando há colunas separadas de entrada e saída; 'valor_dc' quando o valor é sempre positivo e outra coluna diz C/D. saida_dc: os textos dessa coluna que significam saída (ex.: D, DÉBITO). descricao_extra: outras colunas de texto úteis para identificar o lançamento (histórico complementar, detalhe), sem repetir a descrição. contraparte = nome de quem pagou/recebeu, se houver coluna própria; contraparte_doc = CPF/CNPJ dela. palavras_pular: começos de descrição de linhas que NÃO são lançamentos (ex.: SALDO ANTERIOR, SALDO DO DIA, SALDO FINAL, TOTAL). formato_data: 'mdy' só se as datas forem claramente mês/dia. inverter_sinal: true só se as saídas aparecem como positivas e as entradas negativas. banco: nome do banco se aparecer." },
    { role: "user", content: amostra + fim },
  ], "modelo_extrato", ESQUEMA_MODELO,90000,empresa);
  return m;
}

const ESQUEMA_PDF = obj({
  banco: str,
  lancamentos: { type: "array", items: obj({ data: str, descricao: str, valor: numero, documento: str, contraparte: str, saldo: { type: ["number", "null"] } }) },
});

async function lerPdf(base64: string, nome: string, empresa: string) {
  const r = await openaiJson([
    { role: "system", content: "Você é especialista em extratos bancários brasileiros. Leia o extrato em PDF e liste TODOS os lançamentos, na ordem do arquivo. data em AAAA-MM-DD; valor com sinal (entrada positiva, saída negativa); descricao exatamente como no extrato (histórico + complemento); documento = número do documento se houver, senão ''; contraparte = nome de quem pagou/recebeu se aparecer, senão ''; saldo = saldo da linha se houver, senão null. Não inclua linhas de saldo (SALDO ANTERIOR, SALDO DO DIA), totais nem cabeçalhos. banco = nome do banco." },
    { role: "user", content: [{ type: "file", file: { filename: /\.pdf$/i.test(nome) ? nome : nome + ".pdf", file_data: `data:application/pdf;base64,${base64}` } }, { type: "text", text: "Liste os lançamentos deste extrato." }] },
  ], "extrato_pdf", ESQUEMA_PDF, 140000,empresa);
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

async function lerCobranca(ctx:any,body:any){
  const arq=body.arquivo||{},nome=String(arq.nome||'cobranca').slice(0,200);let conteudo:any;
  if(arq.formato==='pdf'){
    if(typeof arq.pdf_base64!=='string'||!arq.pdf_base64.length||arq.pdf_base64.length>14*1024*1024)throw Error('Envie um PDF de até 10 MB.');
    conteudo=[{type:'file',file:{filename:/\.pdf$/i.test(nome)?nome:nome+'.pdf',file_data:'data:application/pdf;base64,'+arq.pdf_base64}},{type:'text',text:'Leia os serviços desta cobrança.'}];
  }else if(arq.formato==='grade'){
    if(!Array.isArray(arq.grade)||arq.grade.length>8000||arq.grade.some((x:any)=>!Array.isArray(x)||x.length>40))throw Error('Planilha muito grande. Envie até 8.000 linhas e 40 colunas.');
    const grade=limparGrade(arq.grade);if(!grade.length)throw Error('A planilha está vazia.');
    conteudo=JSON.stringify(grade);if(conteudo.length>300000)throw Error('Divida a planilha em arquivos menores para conferir todos os serviços.');
  }else throw Error('Envie uma cobrança em PDF, Excel ou CSV.');
  const r=await openaiJson([{role:'system',content:instrucoesCobranca},{role:'user',content:conteudo}], 'cobranca_servicos',esquemaCobranca,140000,ctx.empresa);
  return {arquivo:nome,linhas:normalizarCobranca(r,L.lerData)};
}

// ------------------------------------------------------------------ fatura do cartão (2026-11-13)
// Linhas da fatura que não bateram com nenhuma compra do sistema (anuidade, IOF, juros, compra esquecida): a Clara sugere a categoria
// da DRE, o centro de custo e uma descrição curta, com confiança e motivo — igual às sugestões da conciliação do banco.
async function cartaoSugerir(ctx: any, body: any) {
  const fid = String(body.fatura_id || "");
  if (!UUID.test(fid)) throw new Error("Fatura inválida.");
  const db = ctx.db;
  const { data: f } = await db.from("fin_cartao_faturas").select("id,cartao_id").eq("id", fid).eq("empresa_id", ctx.empresa).maybeSingle();
  if (!f) throw new Error("Fatura não encontrada.");
  const { data: ls } = await db.from("fin_cartao_fatura_linhas").select("id,data,descricao,valor").eq("fatura_id", fid).eq("situacao", "pendente").is("titulo_id", null).gt("valor", 0).limit(200);
  if (!ls?.length) return { sugestoes: [] };
  const [cats, ccs, hist, regras] = await Promise.all([
    todos(db, "fin_categorias", "id,codigo,nome,tipo,chave", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true).eq("tipo", "saida")),
    todos(db, "fin_centros_custo", "id,nome", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    todos(db, "fin_pagar", "descricao,fornecedor_nome,categoria_id,centro_custo_id", (x) => x.eq("empresa_id", ctx.empresa).eq("cartao_id", f.cartao_id).not("categoria_id", "is", null), 300),
    todos(db, "fin_assist_regras", "chave,exemplo,categoria_id,centro_custo_id,acao", (x) => x.eq("empresa_id", ctx.empresa).eq("direcao", "saida"), 300),
  ]);
  const refsCat = cats.map((c: any, i: number) => ({ ref: "k" + (i + 1), id: c.id, txt: `${c.codigo || ""} ${c.nome}`.trim() }));
  const refsCc = ccs.map((c: any, i: number) => ({ ref: "cc" + (i + 1), id: c.id, txt: c.nome }));
  const catRef = (id: string) => refsCat.find((c) => c.id === id)?.ref || "";
  const ccRef = (id: string) => refsCc.find((c) => c.id === id)?.ref || "";
  const exemplos = [...hist.slice(0, 120).map((h: any) => `${h.fornecedor_nome || ""} ${h.descricao || ""} => ${catRef(h.categoria_id)}${h.centro_custo_id ? " / " + ccRef(h.centro_custo_id) : ""}`),
    ...regras.filter((r: any) => r.acao === "lancar" && r.categoria_id).slice(0, 80).map((r: any) => `${r.exemplo || r.chave} => ${catRef(r.categoria_id)}${r.centro_custo_id ? " / " + ccRef(r.centro_custo_id) : ""}`)].join("\n");
  const esq = obj({ linhas: { type: "array", items: obj({ n: str, categoria_ref: str, centro_ref: str, descricao: str, confianca: { type: "string", enum: ["alta", "media", "baixa"] }, motivo: str }) } });
  const r = await openaiJson([
    { role: "system", content: `Você é ${NOME}, especialista financeira de uma empresa de locação de móveis para eventos. Estas linhas estão na fatura do cartão de crédito da empresa e NÃO têm compra lançada no sistema (ex.: anuidade, IOF, juros, tarifa, assinatura, compra esquecida). Para cada uma, escolha a categoria da DRE (categoria_ref, entre as listadas), o centro de custo mais provável (centro_ref, ou '' se não der para saber), uma descrição curta e clara em português (ex.: 'Anuidade do cartão', 'IOF de compra internacional'), a confiança (alta só quando é óbvio, ex.: anuidade, IOF, juros; media quando é provável; baixa quando é palpite) e o motivo em uma frase, sem citar códigos internos (k…, cc…). Use os exemplos de como a empresa já classificou compras parecidas.
Categorias: ${refsCat.map((c) => c.ref + "=" + c.txt).join("; ")}.
Centros de custo: ${refsCc.length ? refsCc.map((c) => c.ref + "=" + c.txt).join("; ") : "(nenhum)"}.` },
    { role: "user", content: (exemplos ? "Como a empresa já classificou:\n" + exemplos + "\n\n" : "") + "Linhas da fatura:\n" + ls.map((l: any, i: number) => `L${i + 1}: ${l.data || ""} · ${l.descricao || ""} · ${brl(Number(l.valor))}`).join("\n") + "\nResponda n = L1, L2…" },
  ], "sugestoes_cartao", esq, 90000, ctx.empresa);
  const sugestoes = (r.linhas || []).map((x: any) => {
    const l = ls[Number(String(x.n || "").replace(/\D/g, "")) - 1]; if (!l) return null;
    const cat = achar(refsCat, x.categoria_ref, "k"), cc = achar(refsCc, x.centro_ref, "cc");
    return { linha_id: l.id, tipo: "lancar", categoria_id: cat?.id || "", centro_custo_id: cc?.id || "", descricao: String(x.descricao || l.descricao || "").slice(0, 200), confianca: cat ? x.confianca : "baixa", motivo: String(x.motivo || "").slice(0, 300) };
  }).filter(Boolean);
  return { sugestoes };
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
      modelo = await aprenderModelo(grade,ctx.empresa);
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
    const r = await lerPdf(b64, nome,ctx.empresa);
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
    todos(db, "fin_pagar", "id,descricao,fornecedor_nome,vencimento,programado_para,valor,aberto,conta_id,categoria_id,centro_custo_id,status,requer_aprovacao,aprovacao,fatura_id,fechamento_parcela_id,aguardando_fechamento", (x) => x.eq("empresa_id", ctx.empresa).not("status", "in", "(pago,cancelado)")),
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
    // compras no cartão são pagas pela FATURA e contas de parceiro com fechamento mensal pela parcela do fechamento (passo 1b)
    ...pag.filter((t: any) => !t.fatura_id && !t.fechamento_parcela_id && !t.aguardando_fechamento && !(t.requer_aprovacao && t.aprovacao !== "aprovada")).map((t: any) => ({ tipo: "pagar", id: t.id, aberto: Number(t.aberto), valor: Number(t.valor), nome: t.fornecedor_nome || "", descricao: t.descricao || "", vencimento: t.programado_para || t.vencimento, pedido_numero: null, conta_id: t.conta_id, centro: t.centro_custo_id, categoria: t.categoria_id })),
  ];
  const tituloPorId = new Map(titulos.map((t) => [t.id, t]));
  const gruposLigados = new Set(ligados.map((x: any) => x.transferencia_grupo));
  const movLivres = movs.filter((m: any) => !gruposLigados.has(m.transferencia_grupo));
  const resumoTitulo = (t: any) => (t.tipo === "receber" ? "Recebimento" : "Pagamento") + " · " + [t.nome, t.descricao].filter(Boolean).join(" · ") + " · venc. " + dataBr(t.vencimento) + " · em aberto " + brl(t.aberto);

  // faturas de cartão com algo em aberto: total em aberto = o que o banco debita no vencimento
  const fatAberto = new Map<string, { aberto: number; qtd: number }>();
  for (const t of pag as any[]) if (t.fatura_id && Number(t.aberto) > 0.005) { const f = fatAberto.get(t.fatura_id) || { aberto: 0, qtd: 0 }; f.aberto = r2(f.aberto + Number(t.aberto)); f.qtd++; fatAberto.set(t.fatura_id, f); }
  let faturas: any[] = [];
  if (fatAberto.size) {
    const { data: fs } = await db.from("fin_cartao_faturas").select("id,vencimento,cartao_id").eq("empresa_id", ctx.empresa).in("id", [...fatAberto.keys()]);
    const { data: cs } = await db.from("fin_cartoes").select("id,nome,final").eq("empresa_id", ctx.empresa);
    faturas = (fs || []).map((f: any) => { const c = (cs || []).find((x: any) => x.id === f.cartao_id) || {}; return { ...f, ...fatAberto.get(f.id), nome: (c.nome || "Cartão") + (c.final ? " final " + c.final : "") }; });
  }
  // parcelas de fechamento mensal de fornecedor com algo em aberto
  const fechAberto = new Map<string, { aberto: number; qtd: number }>();
  for (const t of pag as any[]) if (t.fechamento_parcela_id && Number(t.aberto) > 0.005) { const f = fechAberto.get(t.fechamento_parcela_id) || { aberto: 0, qtd: 0 }; f.aberto = r2(f.aberto + Number(t.aberto)); f.qtd++; fechAberto.set(t.fechamento_parcela_id, f); }
  if (fechAberto.size) {
    const { data: ps } = await db.from("fin_fechamento_parcelas").select("id,numero,vencimento,fechamento_id").eq("empresa_id", ctx.empresa).in("id", [...fechAberto.keys()]);
    const fids = [...new Set((ps || []).map((x: any) => x.fechamento_id))];
    const { data: fs } = fids.length ? await db.from("fin_fechamentos").select("id,referencia,fornecedor_id").in("id", fids) : { data: [] };
    const sids = [...new Set((fs || []).map((x: any) => x.fornecedor_id))];
    const { data: ss } = sids.length ? await db.from("fornecedores").select("id,nome_razao_social,nome_fantasia").in("id", sids) : { data: [] };
    for (const x of ps || []) {
      const fe: any = (fs || []).find((y: any) => y.id === x.fechamento_id) || {}, su: any = (ss || []).find((y: any) => y.id === fe.fornecedor_id) || {};
      faturas.push({ id: x.id, vencimento: x.vencimento, ...fechAberto.get(x.id), fechamento: true, nome: (su.nome_fantasia || su.nome_razao_social || "parceiro") + " · " + (fe.referencia || "") + " · parcela " + x.numero });
    }
  }
  const usadasFat = new Set<string>();
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
    // 1b) pagamento da fatura do cartão: saída igual ao total em aberto de uma fatura, perto do vencimento
    if (l.valor < 0) {
      const fat = faturas.filter((f) => !usadasFat.has(f.id) && Math.abs(f.aberto - v) < 0.01 && Math.abs(Date.parse(f.vencimento) - Date.parse(l.data)) <= 12 * 86400000)
        .sort((a, b) => Math.abs(Date.parse(a.vencimento) - Date.parse(l.data)) - Math.abs(Date.parse(b.vencimento) - Date.parse(l.data)))[0];
      if (fat) {
        usadasFat.add(fat.id);
        const resumo = fat.fechamento ? "Fechamento " + fat.nome + " · venc. " + dataBr(fat.vencimento) + " · " + fat.qtd + " conta(s)"
          : "Fatura do cartão " + fat.nome + " · venc. " + dataBr(fat.vencimento) + " · " + fat.qtd + " conta(s)";
        sugestoes.set(l.id, fat.fechamento
          ? { acao: { tipo: "fechamento", parcela_id: fat.id }, confianca: "alta", origem: "fechamento", resumo,
              motivo: "O valor é igual ao total em aberto do fechamento do parceiro " + fat.nome + " que vence em " + dataBr(fat.vencimento) + "; confirmar paga todas as contas dessa parcela." }
          : { acao: { tipo: "fatura", fatura_id: fat.id }, confianca: "alta", origem: "fatura", resumo,
              motivo: "O valor é igual ao total em aberto da fatura do cartão " + fat.nome + " que vence em " + dataBr(fat.vencimento) + "; confirmar paga todas as parcelas dela." });
        continue;
      }
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
    try { res = await openaiJson([{ role: "system", content: sistema }, { role: "user", content: JSON.stringify(entrada) }], "conciliacao", ESQ, 120000,ctx.empresa); }
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
  ], "dre", obj({ itens: { type: "array", items: obj({ n: str, categoria_ref: str, centro_ref: str, motivo: str }) } }), 120000,ctx.empresa);
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
  ], "centros", obj({ centros: { type: "array", items: obj({ codigo: str, nome: str, descricao: str }) } }),90000,ctx.empresa);
  return { centros: r.centros || [] };
}

// ------------------------------------------------------------------ conversa
// ------------------------------------------------------------------ Clara CFO (nov/2026, trazida da Tecnoweld)
// Indicadores calculados AQUI, a partir do banco (nunca pela IA): são as "provas" que a tela desenha em gráfico/tabela.
// A IA lê os mesmos números, analisa como uma diretora financeira e escolhe quais provas mostrar (só por chave).
// Adaptado à locação de móveis: margem por OP virou lucro por evento (fin_resultado_eventos + fin_custos_evento) e o
// "faturamento a emitir" virou as pré-reservas (fin_previsao_pre_reservas: parcelas previstas, fora do saldo).
const SERIES_CFO = ["indicadores", "resultado_12_meses", "caixa_previsto_90_dias", "inadimplencia_receber", "pagar_por_faixa",
  "receita_por_cliente", "despesas_por_categoria", "prazos_medios", "lucro_eventos", "recebimentos_previstos_por_mes", "despesas_fixas"];

async function calcularSeriesCfo(ctx: any, base: any) {
  const db = ctx.db, hoje = base.hoje;
  const desloca = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const mesIni = (d: string, n: number) => { const x = new Date(d.slice(0, 8) + "01T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  const mesFim = (d: string) => { const x = new Date(d.slice(0, 8) + "01T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return x.toISOString().slice(0, 10); };
  const nomeMes = (d: string) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(d.slice(5, 7)) - 1] + "/" + d.slice(2, 4);
  const dias = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 864e5);
  const desde365 = desloca(hoje, -365), desde180 = desloca(hoje, -180), desde90 = desloca(hoje, -90);
  const meses = Array.from({ length: 12 }, (_, i) => mesIni(hoje, i - 11));
  const [dres, fluxo, rec12, pag12, baixas180, evs, cats] = await Promise.all([
    Promise.all(meses.map((m) => db.rpc("fin_dre", { p_empresa: ctx.empresa, p_ini: m, p_fim: mesFim(m) }).then((r: any) => r.data || []))),
    db.rpc("fin_fluxo", { p_empresa: ctx.empresa, p_ini: hoje, p_fim: desloca(hoje, 90), p_conta: null }).then((r: any) => r.data || []),
    todos(db, "fin_receber", "id,cliente_id,cliente_nome,emissao,competencia,vencimento,valor,status", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").gte("vencimento", desde365), 5000),
    todos(db, "fin_pagar", "id,fornecedor_nome,emissao,competencia,vencimento,valor,status,categoria_id", (x) => x.eq("empresa_id", ctx.empresa).neq("status", "cancelado").gte("vencimento", desde365), 5000),
    todos(db, "fin_baixas", "tipo,data,valor,liquido,receber_id,pagar_id", (x) => x.eq("empresa_id", ctx.empresa).is("estornado_em", null).gte("data", desde180), 5000),
    db.rpc("fin_resultado_eventos", { p_empresa: ctx.empresa, p_inicio: desde365, p_fim: desloca(hoje, 180) }).then((r: any) => r.data?.eventos || [], () => []),
    todos(db, "fin_categorias", "id,nome,tipo,natureza,chave", (x) => x.eq("empresa_id", ctx.empresa)),
  ]);
  const S: Record<string, any> = {};
  const nomeCat = (id: string) => cats.find((c: any) => c.id === id)?.nome || "Sem categoria";
  const pre = (base.pre || []) as any[];

  // resultado mês a mês (DRE). Competência = títulos do mês; caixa = o que desses títulos já foi recebido/pago.
  const tot = (rows: any[], tipo: string, k: string) => r2(rows.filter((x: any) => x.tipo === tipo).reduce((s: number, x: any) => s + Number(x[k] || 0), 0));
  const receitas = dres.map((d: any[]) => tot(d, "entrada", "previsto")), despesas = dres.map((d: any[]) => tot(d, "saida", "previsto"));
  const recCaixa = dres.map((d: any[]) => tot(d, "entrada", "realizado")), despCaixa = dres.map((d: any[]) => tot(d, "saida", "realizado"));
  S.resultado_12_meses = { tipo: "barras", unidade: "brl", rotulos: meses.map(nomeMes),
    series: [{ nome: "Receitas (competência)", valores: receitas }, { nome: "Despesas (competência)", valores: despesas }],
    colunas: ["Mês", "Receitas", "Despesas", "Resultado (competência)", "Resultado (caixa)"],
    linhas: meses.map((m, i) => [nomeMes(m), receitas[i], despesas[i], r2(receitas[i] - despesas[i]), r2(recCaixa[i] - despCaixa[i])]),
    formatos: ["texto", "brl", "brl", "brl", "brl"],
    nota: "Competência = títulos do mês (venda/gasto do mês). Caixa = o que desses títulos já foi recebido/pago." };

  // caixa previsto 90 dias (semanal): real (contas lançadas) e com as parcelas previstas das pré-reservas
  const preAte = (dia: string) => pre.filter((p: any) => p.vencimento && p.vencimento <= dia && p.vencimento >= hoje).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
  const amostra = (f: any[]) => f.filter((_: any, i: number) => i % 7 === 0 || i === f.length - 1);
  const fr = amostra(fluxo);
  S.caixa_previsto_90_dias = { tipo: "linha", unidade: "brl", rotulos: fr.map((d: any) => dataBr(d.dia).slice(0, 5)),
    series: [{ nome: "Real (contas lançadas)", valores: fr.map((d: any) => r2(d.saldo_previsto)) }, { nome: "Com as pré-reservas", valores: fr.map((d: any) => r2(Number(d.saldo_previsto) + preAte(d.dia))) }],
    colunas: ["Dia", "Saldo real", "Com pré-reservas"], linhas: fr.map((d: any) => [dataBr(d.dia), r2(d.saldo_previsto), r2(Number(d.saldo_previsto) + preAte(d.dia))]),
    formatos: ["texto", "brl", "brl"],
    menor_saldo_real: fluxo.length ? fluxo.reduce((m: any, d: any) => Number(d.saldo_previsto) < Number(m.saldo_previsto) ? d : m) : null,
    nota: "Saldo ao fim do dia, somando o que vence a receber e a pagar. Pré-reserva ainda não é venda: só entra na segunda linha." };

  // envelhecimento (aging)
  const faixas = ["A vencer", "1–30 dias", "31–60 dias", "61–90 dias", "Mais de 90"];
  const faixa = (venc: string) => { const d = dias(venc, hoje); return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; };
  const aging = (lista: any[], quando: (t: any) => string) => { const v = [0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0]; lista.forEach((t: any) => { const k = faixa(quando(t)); v[k] = r2(v[k] + Number(t.aberto || 0)); n[k]++; }); return { v, n }; };
  const ar = aging(base.rec, (t: any) => t.vencimento), ap = aging(base.pag, (t: any) => String(t.programado_para || t.vencimento));
  S.inadimplencia_receber = { tipo: "barras", unidade: "brl", rotulos: faixas, series: [{ nome: "A receber em aberto", valores: ar.v }],
    colunas: ["Faixa de atraso", "Títulos", "Valor"], linhas: faixas.map((f, i) => [f, ar.n[i], ar.v[i]]), formatos: ["texto", "num", "brl"],
    pct_vencido: r2(100 * (ar.v.slice(1).reduce((a, b) => a + b, 0)) / Math.max(1, ar.v.reduce((a, b) => a + b, 0))) };
  S.pagar_por_faixa = { tipo: "barras", unidade: "brl", rotulos: faixas, series: [{ nome: "A pagar em aberto", valores: ap.v }],
    colunas: ["Faixa de atraso", "Títulos", "Valor"], linhas: faixas.map((f, i) => [f, ap.n[i], ap.v[i]]), formatos: ["texto", "num", "brl"] };

  // concentração de clientes (decoradores) nos últimos 12 meses, pelo cadastro
  const porCli = new Map<string, { nome: string; v: number }>();
  rec12.filter((t: any) => String(t.competencia || t.vencimento) <= hoje).forEach((t: any) => { const k = t.cliente_id || ("nome:" + String(t.cliente_nome || "Sem cliente").trim().toLowerCase()); const cur = porCli.get(k) || { nome: t.cliente_nome || "Sem cliente", v: 0 };
    cur.v += Number(t.valor || 0); porCli.set(k, cur); });
  const cli = [...porCli.values()].map((x) => [x.nome, x.v] as [string, number]).sort((a, b) => b[1] - a[1]), totCli = cli.reduce((s, x) => s + x[1], 0);
  const linhasCli = [...cli.slice(0, 7), ...(cli.length > 7 ? [["Outros (" + (cli.length - 7) + ")", cli.slice(7).reduce((s, x) => s + x[1], 0)]] : [])] as [string, number][];
  S.receita_por_cliente = { tipo: "barras_h", unidade: "brl", rotulos: linhasCli.map((x) => x[0]), series: [{ nome: "Faturado em 12 meses", valores: linhasCli.map((x) => r2(x[1])) }],
    colunas: ["Cliente", "Faturado 12 meses", "% do total"], linhas: linhasCli.map((x) => [x[0], r2(x[1]), r2(100 * x[1] / Math.max(1, totCli))]), formatos: ["texto", "brl", "pct"],
    maior_cliente_pct: cli.length ? r2(100 * cli[0][1] / Math.max(1, totCli)) : 0, tres_maiores_pct: r2(100 * cli.slice(0, 3).reduce((s, x) => s + x[1], 0) / Math.max(1, totCli)) };

  // para onde vai o dinheiro (últimos 90 dias, por categoria)
  const pag90 = pag12.filter((t: any) => String(t.competencia || t.vencimento) >= desde90 && String(t.competencia || t.vencimento) <= hoje);
  const porCat = new Map<string, number>(); pag90.forEach((t: any) => porCat.set(nomeCat(t.categoria_id), (porCat.get(nomeCat(t.categoria_id)) || 0) + Number(t.valor || 0)));
  const cat = [...porCat.entries()].sort((a, b) => b[1] - a[1]), totCat = cat.reduce((s, x) => s + x[1], 0);
  const linhasCat = [...cat.slice(0, 7), ...(cat.length > 7 ? [["Outras (" + (cat.length - 7) + ")", cat.slice(7).reduce((s, x) => s + x[1], 0)]] : [])] as [string, number][];
  S.despesas_por_categoria = { tipo: "barras_h", unidade: "brl", rotulos: linhasCat.map((x) => x[0]), series: [{ nome: "Despesas (90 dias)", valores: linhasCat.map((x) => r2(x[1])) }],
    colunas: ["Categoria", "Valor 90 dias", "% do total"], linhas: linhasCat.map((x) => [x[0], r2(x[1]), r2(100 * x[1] / Math.max(1, totCat))]), formatos: ["texto", "brl", "pct"] };

  // despesas fixas: categorias de saída marcadas como fixas (Plano de contas) ou, sem marcação, as que não são imposto/custo do evento
  const ehFixa = (c: any) => c && c.tipo === "saida" && (c.natureza ? c.natureza === "fixo" : !/impost|comiss|bv|frete|equipe|terceir|montag|uber/i.test((c.chave || "") + " " + (c.nome || "")));
  const porFixa = new Map<string, number>(); pag90.filter((t: any) => ehFixa(cats.find((c: any) => c.id === t.categoria_id))).forEach((t: any) => porFixa.set(nomeCat(t.categoria_id), (porFixa.get(nomeCat(t.categoria_id)) || 0) + Number(t.valor || 0)));
  const fixas = [...porFixa.entries()].sort((a, b) => b[1] - a[1]);
  S.despesas_fixas = { tipo: "tabela", unidade: "brl", colunas: ["Despesa fixa", "Últimos 90 dias", "Média por mês"],
    linhas: fixas.map((x) => [x[0], r2(x[1]), r2(x[1] / 3)]), formatos: ["texto", "brl", "brl"], total_mensal: r2(fixas.reduce((s, x) => s + x[1], 0) / 3),
    nota: "Categorias marcadas como fixas no Plano de contas (sem marcação, as que não são imposto nem custo do evento). Média = 90 dias ÷ 3." };

  // prazos médios e cobertura de caixa (ponderados pelo valor)
  const recPorId = new Map(rec12.map((t: any) => [t.id, t])), pagPorId = new Map(pag12.map((t: any) => [t.id, t]));
  const prazo = (tipo: string, mapa: Map<any, any>, campo: string) => { let s = 0, p = 0; baixas180.filter((b: any) => b.tipo === tipo).forEach((b: any) => {
    const t = mapa.get(b[campo]); const de = t?.emissao || t?.vencimento; if (!de) return; const d = dias(String(de).slice(0, 10), b.data); if (d < 0 || d > 365) return; const v = Number(b.valor || 0); s += d * v; p += v; }); return p ? Math.round(s / p) : null; };
  const pmr = prazo("receber", recPorId, "receber_id"), pmp = prazo("pagar", pagPorId, "pagar_id");
  const saidas90 = baixas180.filter((b: any) => b.tipo === "pagar" && b.data >= desde90).reduce((s: number, b: any) => s + Number(b.liquido || b.valor || 0), 0);
  const cobertura = saidas90 > 0 ? r2(base.saldo_total / (saidas90 / 3)) : null;
  S.prazos_medios = { tipo: "kpis", unidade: "misto", itens: [
    { rotulo: "Prazo médio de recebimento", valor: pmr, unidade: "dias", ajuda: "da emissão do título até o dinheiro entrar (180 dias)" },
    { rotulo: "Prazo médio de pagamento", valor: pmp, unidade: "dias", ajuda: "da emissão até pagar (180 dias)" },
    { rotulo: "Ciclo de caixa", valor: pmr != null && pmp != null ? pmr - pmp : null, unidade: "dias", ajuda: "positivo = a empresa financia o cliente" },
    { rotulo: "Cobertura de caixa", valor: cobertura, unidade: "meses", ajuda: "saldo atual ÷ média mensal paga nos últimos 90 dias" }] };

  // lucro por evento (mesma conta do Gerencial: receita = valor − créditos + reposição; custos lançados no evento)
  const ids = (evs as any[]).map((e: any) => e.id), custos: any[] = [];
  for (let k = 0; k < ids.length; k += 100) custos.push(...await todos(db, "fin_custos_evento", "pedido_id,valor,cancelado_em", (x) => x.eq("empresa_id", ctx.empresa).in("pedido_id", ids.slice(k, k + 100))).catch(() => []));
  const ev = (evs as any[]).map((e: any) => { const receita = (Number(e.valor_total) || 0) - (Number(e.credito) || 0) + (Number(e.reposicao) || 0);
    const custo = custos.filter((c: any) => c.pedido_id === e.id && !c.cancelado_em).reduce((s: number, c: any) => s + Number(c.valor || 0), 0);
    return { ...e, receita: r2(receita), custo: r2(custo), lucro: r2(receita - custo), margem: receita ? r2(100 * (receita - custo) / receita) : null }; });
  const comCusto = ev.filter((e: any) => e.custo > 0).sort((a: any, b: any) => (a.margem ?? 1e9) - (b.margem ?? 1e9)).slice(0, 12);
  S.lucro_eventos = { tipo: "tabela", unidade: "misto", colunas: ["Pedido", "Cliente", "Evento", "Receita", "Custos", "Lucro", "Margem %"],
    linhas: comCusto.map((e: any) => ["Pedido " + e.numero_pedido, e.cliente_nome, dataBr(String(e.data_evento || "")), e.receita, e.custo, e.lucro, e.margem]),
    formatos: ["texto", "texto", "texto", "brl", "brl", "brl", "pct"], eventos_sem_custo: ev.filter((e: any) => !e.custo).length, eventos_total: ev.length,
    nota: "Eventos dos últimos 12 meses com custo lançado (equipe, frete, terceiros, reparo…), da menor para a maior margem. Evento sem custo lançado fica de fora (o lucro dele estaria inflado)." };

  // recebimentos previstos por mês: contas a receber lançadas + parcelas das pré-reservas
  const mesesP = Array.from({ length: 6 }, (_, i) => mesIni(hoje, i));
  const vRec = mesesP.map((m) => r2(base.rec.filter((t: any) => String(t.vencimento).slice(0, 7) === m.slice(0, 7)).reduce((s: number, t: any) => s + Number(t.aberto || 0), 0)));
  const vPre = mesesP.map((m) => r2(pre.filter((p: any) => String(p.vencimento || "").slice(0, 7) === m.slice(0, 7)).reduce((s: number, p: any) => s + Number(p.valor || 0), 0)));
  S.recebimentos_previstos_por_mes = { tipo: "barras", unidade: "brl", rotulos: mesesP.map(nomeMes), series: [{ nome: "A receber lançado", valores: vRec }, { nome: "Pré-reservas", valores: vPre }],
    colunas: ["Mês", "A receber lançado", "Pré-reservas"], linhas: mesesP.map((m, i) => [nomeMes(m), vRec[i], vPre[i]]), formatos: ["texto", "brl", "brl"],
    nota: "Pré-reserva ainda não é venda: só vira conta a receber quando o pedido é confirmado." };

  // painel de indicadores
  const mesAtual = receitas.length - 1;
  S.indicadores = { tipo: "kpis", unidade: "misto", itens: [
    { rotulo: "Saldo nas contas", valor: base.saldo_total, unidade: "brl" },
    { rotulo: "A receber em aberto", valor: base.receber_aberto, unidade: "brl", ajuda: "vencido " + brl(base.receber_vencido) },
    { rotulo: "A pagar em aberto", valor: base.pagar_aberto, unidade: "brl", ajuda: "vencido " + brl(base.pagar_vencido) },
    { rotulo: "Resultado do mês (competência)", valor: r2(receitas[mesAtual] - despesas[mesAtual]), unidade: "brl", ajuda: "caixa: " + brl(recCaixa[mesAtual] - despCaixa[mesAtual]) },
    { rotulo: "Previsto nas pré-reservas", valor: r2(pre.reduce((s: number, p: any) => s + Number(p.valor || 0), 0)), unidade: "brl" },
    { rotulo: "Despesas fixas por mês", valor: S.despesas_fixas.total_mensal, unidade: "brl" }] };
  return S;
}

const ESQ_CFO = { type: "object", additionalProperties: false, required: ["resposta", "evidencias", "titulo_relatorio"], properties: {
  resposta: { type: "string" },
  titulo_relatorio: { type: "string" },
  evidencias: { type: "array", items: { type: "object", additionalProperties: false, required: ["serie", "titulo", "leitura"], properties: {
    serie: { type: "string", enum: SERIES_CFO }, titulo: { type: "string" }, leitura: { type: "string" } } } },
} };

const PAPEL_CFO = `Você é ${NOME}, a diretora financeira (CFO) da empresa, uma locadora de móveis para eventos (Chiavari): orçamento → pré-reserva → pedido reservado (gera as contas a receber) → separação, entrega e montagem → evento → coleta → posição final. Os clientes são principalmente decoradores, que podem receber comissão (BV). Os custos de cada evento (equipe/freelancers, frete, Uber, terceiros, reparo de peças) são lançados por pedido. Você não é uma atendente que só repete números: você ANALISA como uma consultora financeira experiente e diz o que a diretoria precisa saber e fazer.
Como você trabalha:
- Vá direto à conclusão (1–2 frases) e depois sustente com números dos DADOS. Separe FATO (está nos dados) de HIPÓTESE (sua leitura) e diga quando for hipótese.
- Pense como CFO: liquidez e caixa (cobertura, menor saldo previsto, quando o caixa aperta), capital de giro (prazo médio de recebimento x pagamento, ciclo de caixa), inadimplência por idade, rentabilidade (lucro por evento, resultado mês a mês, tendência), estrutura de custos (fixas x variáveis, para onde vai o dinheiro), risco de concentração (dependência de poucos decoradores: acima de 30% num cliente é risco alto), sazonalidade dos eventos e previsibilidade (pré-reservas que ainda não viraram venda).
- Sempre que fizer sentido, termine com "O que eu faria" — 2 a 4 ações concretas, priorizadas, com impacto estimado em R$ ou dias quando der (ex.: "cobrar os R$ X vencidos há mais de 60 dias", "renegociar o frete do fornecedor Y").
- Compare: mês contra mês anterior, contra a média, real contra previsto. Aponte o que é anormal.
- Benchmarks de referência (use com cuidado e diga que são referências gerais): cobertura de caixa < 1 mês = alerta; ciclo de caixa positivo alto = a empresa financia o cliente; evento com margem muito abaixo da média = investigar os custos dele.
- Português simples, sem jargão desnecessário (se usar um termo técnico, explique em meia frase). Valores em R$ e datas dd/mm/aaaa. Listas curtas.
- Nunca invente números: use só os DADOS. Se algo não está nos dados, diga o que falta e onde a pessoa encontra no sistema.
- Você não executa nada no sistema (não paga, não baixa, não altera); você analisa e recomenda. Na tela Bancos ficam as sugestões de conciliação para a pessoa confirmar.
- Se o saldo do banco não bate com o do sistema, explique as causas mais prováveis (linhas ainda não conciliadas, saldo inicial da conta errado, lançamentos fora do período).
SIMULAÇÕES ("e se…?"): quando pedirem uma hipótese (um pedido cancelar, uma pré-reserva confirmar, antecipar recebíveis, contratar alguém, cortar uma despesa), recalcule a partir de saldo_previsto_por_dia e dos títulos/pré-reservas: some ou subtraia os valores da hipótese nas datas certas, diga o novo menor saldo e a data, compare com o cenário atual e deixe explícitas as premissas que você assumiu. Mostre as provas do cenário atual (ex.: caixa_previsto_90_dias).
PROVAS: o campo "evidencias" escolhe, pela chave, os gráficos/tabelas que provam o que você disse (eles são desenhados com os números reais de SERIES_CALCULADAS). Escolha de 0 a 4, só as que sustentam a resposta, na ordem da explicação; "titulo" curto e "leitura" = 1 frase dizendo o que a pessoa deve enxergar naquele gráfico. Para perguntas simples ou conversa, pode não ter prova. Quando pedirem relatório, diagnóstico ou análise, traga provas e preencha "titulo_relatorio"; senão deixe "titulo_relatorio" vazio.
FORMATO de "resposta": texto com **negrito**, listas com "-" e parágrafos curtos.`;

async function conversar(ctx: any, body: any) {
  const db = ctx.db;
  const desloca = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const ini = hoje.slice(0, 8) + "01", ano = hoje.slice(0, 4) + "-01-01";
  const mesAnt = (() => { const d = new Date(ini + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const fimMesAnt = (() => { const d = new Date(ini + "T12:00:00Z"); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
  const ate = desloca(hoje, 185), desde90 = desloca(hoje, -90);
  const [contas, saldos, resumo, pend, lotes, rec, pag, baixas, fluxo, dre, dreAnt, dreAno, dreCc, cats, ccs, preRaw] = await Promise.all([
    todos(db, "fin_contas", "id,nome,banco,tipo,saldo_inicial,saldo_inicial_data,saldo_minimo", (x) => x.eq("empresa_id", ctx.empresa).eq("ativo", true)),
    db.rpc("fin_saldos", { p_empresa: ctx.empresa }).then((r: any) => r.data || []),
    db.rpc("fin_bancos_resumo", { p_empresa: ctx.empresa }).then((r: any) => r.data || [], () => []),
    todos(db, "fin_extrato", "conta_id,data,valor,descricao,sugestao", (x) => x.eq("empresa_id", ctx.empresa).is("baixa_id", null).is("transferencia_grupo", null).is("conciliado_em", null).eq("ignorado", false).order("data", { ascending: false }), 2000),
    todos(db, "fin_extrato_lotes", "conta_id,arquivo_nome,banco_detectado,periodo_ini,periodo_fim,saldo_banco,saldo_data,novas,status,created_at", (x) => x.eq("empresa_id", ctx.empresa).order("created_at", { ascending: false }), 20),
    todos(db, "fin_receber", "descricao,cliente_nome,pedido_numero,componente,documento,vencimento,valor,recebido,aberto,parcela,parcelas,status,conta_id,categoria_id,centro_custo_id", (x) => x.eq("empresa_id", ctx.empresa).in("status", ["aberto", "parcial"]).order("vencimento"), 1500),
    todos(db, "fin_pagar", "descricao,fornecedor_nome,documento,origem,vencimento,programado_para,valor,pago,aberto,parcela,parcelas,status,requer_aprovacao,aprovacao,conta_id,categoria_id,centro_custo_id", (x) => x.eq("empresa_id", ctx.empresa).not("status", "in", "(pago,cancelado)").order("vencimento"), 1500),
    todos(db, "fin_baixas", "tipo,data,valor,liquido,conta_id,origem,receber_id,pagar_id", (x) => x.eq("empresa_id", ctx.empresa).is("estornado_em", null).gte("data", desde90).order("data", { ascending: false }), 1500),
    db.rpc("fin_fluxo", { p_empresa: ctx.empresa, p_ini: hoje, p_fim: ate, p_conta: null }).then((r: any) => r.data || []),
    db.rpc("fin_dre", { p_empresa: ctx.empresa, p_ini: ini, p_fim: hoje }).then((r: any) => r.data || []),
    db.rpc("fin_dre", { p_empresa: ctx.empresa, p_ini: mesAnt, p_fim: fimMesAnt }).then((r: any) => r.data || []),
    db.rpc("fin_dre", { p_empresa: ctx.empresa, p_ini: ano, p_fim: hoje }).then((r: any) => r.data || []),
    db.rpc("fin_dre_centros", { p_empresa: ctx.empresa, p_ini: ini, p_fim: hoje }).then((r: any) => r.data || [], () => []),
    todos(db, "fin_categorias", "id,codigo,nome,tipo", (x) => x.eq("empresa_id", ctx.empresa)),
    todos(db, "fin_centros_custo", "id,nome", (x) => x.eq("empresa_id", ctx.empresa)),
    db.rpc("fin_previsao_pre_reservas", { p_empresa: ctx.empresa }).then((r: any) => r.data || [], () => []),
  ]);
  const pre = Array.isArray(preRaw) ? preRaw : [];
  const nomeConta = (id: string) => contas.find((c: any) => c.id === id)?.nome || null;
  const nomeCat = (id: string) => cats.find((c: any) => c.id === id)?.nome || null;
  const nomeCc = (id: string) => ccs.find((c: any) => c.id === id)?.nome || null;
  const saldosCmp = await Promise.all(lotes.filter((l: any) => l.saldo_banco != null).slice(0, 6).map(async (l: any) => {
    const { data } = await db.rpc("fin_saldo_em", { p_empresa: ctx.empresa, p_conta: l.conta_id, p_data: l.saldo_data });
    return { conta: nomeConta(l.conta_id), data: l.saldo_data, saldo_banco: l.saldo_banco, saldo_sistema: data };
  }));
  const soma = (l: any[], k = "aberto") => r2(l.reduce((s: number, t: any) => s + Number(t[k] || 0), 0));
  const quando = (t: any) => String(t.programado_para || t.vencimento || "");
  const recV = rec.filter((t: any) => t.vencimento < hoje), pagV = pag.filter((t: any) => quando(t) < hoje);
  const fl = (fluxo as any[]).filter((d: any, i: number, a: any[]) => i === 0 || i === a.length - 1 || Number(d.previsto_entrada) || Number(d.previsto_saida) || Number(d.realizado_entrada) || Number(d.realizado_saida))
    .map((d: any) => ({ dia: d.dia, entra_previsto: r2(d.previsto_entrada), sai_previsto: r2(d.previsto_saida), entrou: r2(d.realizado_entrada), saiu: r2(d.realizado_saida), saldo_previsto_fim_do_dia: r2(d.saldo_previsto) }));
  const contexto = {
    hoje,
    como_ler: "Saldos 'sistema' = saldo inicial + recebimentos/pagamentos registrados. 'saldo_banco' = pelo extrato importado. O fluxo previsto começa hoje: saldo_previsto_fim_do_dia = saldo atual de todas as contas + o que vence a receber − o que vence a pagar até aquele dia (contas a pagar contam pela data programada, se houver). Pré-reservas NÃO estão no saldo nem no fluxo: estão em pre_reservas_parcelas_previstas. Valores em R$.",
    contas: contas.map((c: any) => ({ nome: c.nome, banco: c.banco, tipo: c.tipo, saldo_sistema: saldos.find((s: any) => s.conta_id === c.id)?.saldo, saldo_banco_pelo_extrato: resumo.find((s: any) => s.conta_id === c.id)?.saldo,
      saldo_minimo: c.saldo_minimo, saldo_inicial: c.saldo_inicial, saldo_inicial_data: c.saldo_inicial_data, linhas_a_conciliar: pend.filter((p: any) => p.conta_id === c.id).length })),
    saldo_total_sistema: r2(saldos.reduce((s: number, x: any) => s + Number(x.saldo || 0), 0)),
    saldo_previsto_por_dia: Object.fromEntries((fluxo as any[]).slice(0, 121).map((d: any) => [d.dia, r2(d.saldo_previsto)])),
    fluxo_previsto_proximos_6_meses: fl,
    receber_resumo: { em_aberto: soma(rec), vencido: soma(recV), qtd_titulos: rec.length },
    pagar_resumo: { em_aberto: soma(pag), vencido: soma(pagV), aguardando_aprovacao: soma(pag.filter((t: any) => t.requer_aprovacao && t.aprovacao === "pendente")), qtd_titulos: pag.length },
    receber_em_aberto: rec.slice(0, 600).map((t: any) => ({ cliente: t.cliente_nome, pedido: t.pedido_numero, divisao: t.componente, descricao: t.descricao, vencimento: t.vencimento, parcela: t.parcela + "/" + t.parcelas, valor: r2(t.valor), em_aberto: r2(t.aberto), vencido: t.vencimento < hoje, conta: nomeConta(t.conta_id), categoria: nomeCat(t.categoria_id), centro: nomeCc(t.centro_custo_id) })),
    pagar_em_aberto: pag.slice(0, 600).map((t: any) => ({ fornecedor: t.fornecedor_nome, descricao: t.descricao, documento: t.documento, origem: t.origem, vencimento: t.vencimento, programado_para: t.programado_para, parcela: t.parcela + "/" + t.parcelas, valor: r2(t.valor), em_aberto: r2(t.aberto), vencido: quando(t) < hoje,
      aprovacao: t.requer_aprovacao ? t.aprovacao : null, conta: nomeConta(t.conta_id), categoria: nomeCat(t.categoria_id), centro: nomeCc(t.centro_custo_id) })),
    pre_reservas_parcelas_previstas: pre.slice(0, 300),
    realizado_ultimos_90_dias: (baixas as any[]).slice(0, 600).map((b: any) => ({ tipo: b.tipo === "receber" ? "recebimento" : "pagamento", data: b.data, valor: r2(b.liquido || b.valor), conta: nomeConta(b.conta_id), origem: b.origem })),
    realizado_90_dias_totais: { recebido: soma(baixas.filter((b: any) => b.tipo === "receber"), "liquido"), pago: soma(baixas.filter((b: any) => b.tipo === "pagar"), "liquido") },
    comparacao_saldo_banco: saldosCmp,
    extrato_pendente: { qtd: pend.length, total: soma(pend, "valor"), exemplos: pend.slice(0, 40).map((p: any) => ({ conta: nomeConta(p.conta_id), data: p.data, valor: p.valor, descricao: p.descricao, sugestao: p.sugestao?.resumo || null })) },
    ultimos_extratos_importados: lotes.slice(0, 8).map((l: any) => ({ conta: nomeConta(l.conta_id), arquivo: l.arquivo_nome, banco: l.banco_detectado, de: l.periodo_ini, ate: l.periodo_fim, situacao: l.status })),
    dre_mes_atual: dre, dre_mes_anterior: dreAnt, dre_ano_ate_hoje: dreAno, dre_mes_por_centro: dreCc,
  };
  const msgs = (Array.isArray(body.mensagens) ? body.mensagens : []).slice(-12).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 4000) }));
  const series = await calcularSeriesCfo(ctx, { hoje, rec, pag, pre, saldo_total: contexto.saldo_total_sistema,
    receber_aberto: contexto.receber_resumo.em_aberto, receber_vencido: contexto.receber_resumo.vencido, pagar_aberto: contexto.pagar_resumo.em_aberto, pagar_vencido: contexto.pagar_resumo.vencido });
  const out = await openaiJson([
    { role: "system", content: PAPEL_CFO + "\nHOJE: " + hoje + "\nSERIES_CALCULADAS (números oficiais, use-os): " + JSON.stringify(series).slice(0, 60000) +
      "\nDADOS (detalhe dos títulos, fluxo, DRE e extrato): " + JSON.stringify(contexto).slice(0, 140000) + "\nComo ler os DADOS: " + contexto.como_ler },
    ...msgs,
  ], "clara_cfo", ESQ_CFO, 120000, ctx.empresa);
  const evidencias = (out.evidencias || []).filter((e: any) => series[e.serie]).slice(0, 4).map((e: any) => ({ ...e, dados: series[e.serie] }));
  return { resposta: out.resposta, evidencias, titulo_relatorio: out.titulo_relatorio || "" };
}

// ------------------------------------------------------------------ servidor
Deno.serve(comUsoIA("clara", async (req) => {
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
    if (!await pode(body.action==='ler_cobranca' ? 'financeiro.contas_pagar.editar' : editar ? "financeiro.fluxo.editar" : "financeiro.fluxo.visualizar")) return resposta({ error: "Você não tem permissão para isso no Financeiro." }, 403);
    if (body.action === 'ler_cobranca') return resposta(await lerCobranca(ctx,body));
    if (body.action === "ler_extrato") return resposta(await lerExtrato(ctx, body));
    if (body.action === "organizar") return resposta(await organizar(ctx, body));
    if (body.action === "cartao_sugerir") return resposta(await cartaoSugerir(ctx, body));
    if (body.action === "classificar_dre") return resposta(await classificarDre(ctx));
    if (body.action === "sugerir_centros") return resposta(await sugerirCentros(ctx));
    if (body.action === "conversar") return resposta(await conversar(ctx, body));
    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error(e);
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
}));
