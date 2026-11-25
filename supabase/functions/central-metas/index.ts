// @ts-nocheck
// Central de Metas, bônus da Operação, Premiações e Meu Bônus sem as planilhas do Google (nov/2026).
// Substitui o projeto "central" do servidor antigo (api/_gas/projetos/central). As telas continuam chamando as
// mesmas funções (mesmos nomes e respostas); o navegador manda { fn, args } e esta função responde.
// Fontes: Cadastro de Funcionários (salário pelo cofre), Controle RH (controle_rh_ocorrencias), O.S do acervo
// (acervo_os), pedidos + complexidade (central_eventos_mes + js/shared/complexidade.js, cópia em _shared),
// escala do cronograma (operacao_etapas), teto de gastos (almox_teto_gastos) e as tabelas central_*.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
import { abrirRh, indice } from "../_shared/cofre.ts";
import "../_shared/complexidade.js";

const CX = (globalThis as any).CXRegras;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const responder = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "America/Sao_Paulo";

/* ---------------- utilidades ---------------- */
const texto = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const mesHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const mesDe = (iso: any) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).slice(0, 7) : "";
const dataBR = (iso: any) => { if (!iso) return ""; const d = String(iso).slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso); };
const dataHoraBR = (iso: any) => iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "";
function validarMes(m: any, bloquearFuturo = false) {
  const mes = String(m || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mês inválido.");
  if (bloquearFuturo && mes > mesHoje()) throw new Error("Não é possível fechar um mês futuro.");
  return mes;
}
const limitesMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); const fim = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`; return { ini: `${mes}-01`, fim }; };
async function sel(q: any) { const { data, error } = await q; if (error) throw new Error(error.message); return data; }
async function rpc(nome: string, args: any, cliente = admin) { const { data, error } = await cliente.rpc(nome, args); if (error) throw new Error(error.message); return data; }

const SETORES = ["Marcenaria", "Acabamento e Pintura", "Solda", "Costura", "Forração", "Limpeza de Estofados"];
function setorChave(v: any) {
  const s = texto(v);
  if (s.includes("marcenaria")) return "marcenaria";
  if (s.includes("acabamento") || s.includes("pintura")) return "acabamento e pintura";
  if (s.includes("solda")) return "solda";
  if (s.includes("costura")) return "costura";
  if (s.includes("forracao")) return "forracao";
  if (s.includes("limpeza") && s.includes("estof")) return "limpeza de estofados";
  return s;
}
const NOME_SETOR: Record<string, string> = { "marcenaria": "Marcenaria", "acabamento e pintura": "Acabamento e Pintura", "solda": "Solda", "costura": "Costura", "forracao": "Forração", "limpeza de estofados": "Limpeza de Estofados" };
function grupoDoSetor(setor: any) {
  const t = texto(setor);
  if (t.includes("limpeza") || t.includes("forracao") || t.includes("costura") || t === "estofados" || t === "estofado") return "estofados";
  if (t.includes("solda") || t.includes("acabamento") || t.includes("pintura") || t.includes("marcenaria")) return "estrutura";
  return "";
}
const ehSupervisor = (cargo: any) => { const c = texto(cargo); return c.includes("supervisor") && c.includes("departamento de manutencao"); };

/* ---------------- configuração ---------------- */
const OPERACAO_EQUIPES = [
  { chave: "triagem", nome: "Triagem", etapas: ["triagem"], indicativos: "internos" },
  { chave: "carregamento", nome: "Carregamento", etapas: ["carregamento"], indicativos: "carregamento" },
  { chave: "montagem", nome: "Montagem", etapas: ["montagem", "desmontagem"], indicativos: "externos" },
];
function operacaoPadrao() {
  return {
    percentual: { triagem: 0.3, carregamento: 0.3, montagem: 0.5 },
    scorePadrao: { triagem: 50, carregamento: 50, montagem: 50 },
    descontoPercentual: 5, tetoDescontoItem: 0, tetoSalario: 25,
    metasCarregamento: [{ nome: "Itens esquecidos", meta: 3 }, { nome: "Itens sem capa de proteção", meta: 4 }, { nome: "Itens danificados", meta: 5 }],
    indicativos: { internos: [{ nome: "Itens danificados", meta: 5 }], externos: [{ nome: "Itens danificados", meta: 5 }] },
    membros: { triagem: [], carregamento: [], montagem: [] },
    setoresRH: { triagem: [], carregamento: [], montagem: [] }, extras: [],
  };
}
function configPadrao() {
  return {
    metasRH: { atraso: 0, semUniforme: 0, semEpi: 0, usoCelular: 0, falta: 0, advertencia: 0, ausenciaJornada: 0 },
    comissoes: { estofados: 0, pintura: 0, supervisao: 0, os: {} as Record<string, number> },
    almoxarifado: { metaContagem: 100, metaAssertividade: 85, percentualBonus: 0 },
    operacao: operacaoPadrao(),
  };
}
async function lerConfig(emp: string) {
  const linha = await sel(admin.from("central_config").select("config").eq("empresa_id", emp).maybeSingle());
  const salvo = linha?.config || {}, p = configPadrao();
  const op = { ...p.operacao, ...(salvo.operacao || {}) };
  for (const k of ["percentual", "scorePadrao", "membros", "setoresRH", "indicativos"]) op[k] = { ...p.operacao[k], ...((salvo.operacao || {})[k] || {}) };
  if (!Array.isArray(op.metasCarregamento)) op.metasCarregamento = p.operacao.metasCarregamento;
  if (!Array.isArray(op.extras)) op.extras = [];
  return {
    metasRH: { ...p.metasRH, ...(salvo.metasRH || {}) },
    comissoes: { ...p.comissoes, ...(salvo.comissoes || {}), os: { ...((salvo.comissoes || {}).os || {}) } },
    almoxarifado: { ...p.almoxarifado, ...(salvo.almoxarifado || {}) },
    operacao: op,
  };
}
async function gravarConfig(ctx: any, parte: Record<string, any>) {
  const linha = await sel(admin.from("central_config").select("config").eq("empresa_id", ctx.emp).maybeSingle());
  const config = { ...(linha?.config || {}), ...parte };
  await sel(admin.from("central_config").upsert({ empresa_id: ctx.emp, config, atualizado_em: new Date().toISOString(), atualizado_por: ctx.user?.id || null }));
}

/* ---------------- dados ---------------- */
async function funcionarios(emp: string) {
  const lista = await sel(admin.from("funcionarios_acesso").select("id,nome,setor,cargo,cpf,salario_bruto,salario_cifrado,ativo,equipe_operacional,foto_url,pin_hash").eq("empresa_id", emp).eq("ativo", true).order("nome"));
  const saida = [];
  for (const f of lista || []) {
    let salario = num(f.salario_bruto);
    if (f.salario_cifrado) { try { salario = num(String(await abrirRh(emp, "salario", f.salario_cifrado)).replace(",", ".")); } catch (_) { salario = 0; } }
    saida.push({ id: f.id, nome: String(f.nome || "").trim(), setor: f.setor || "", cargo: f.cargo || "", salario, equipe: f.equipe_operacional || "",
      temPin: !!f.pin_hash, fotoUrl: !f.foto_url ? "" : /^https?:\/\//.test(f.foto_url) ? f.foto_url : `${URL_SB}/storage/v1/object/public/avatares/${emp}/${f.id}.jpg` });
  }
  return saida;
}
function tipoRH(v: any) {
  const t = texto(v);
  if (t.includes("atraso")) return "atraso";
  if (t.includes("uniforme")) return "semUniforme";
  if (t.includes("epi")) return "semEpi";
  if (t.includes("celular")) return "usoCelular";
  if (t.includes("falta")) return "falta";
  if (t.includes("advertencia")) return "advertencia";
  if (t.includes("ausencia") || t.includes("jornada")) return "ausenciaJornada";
  return "";
}
const TIPOS_RH = ["atraso", "semUniforme", "semEpi", "usoCelular", "falta", "advertencia", "ausenciaJornada"];

async function avaliacaoRH(ctx: any, mes: string, extras: any[] = [], pessoas?: any[]) {
  const cfg = ctx.cfg, metas = cfg.metasRH, { ini, fim } = limitesMes(mes);
  const permitidos = Object.keys(NOME_SETOR);
  (Array.isArray(extras) ? extras : []).forEach((x) => { const k = setorChave(x); if (k && !permitidos.includes(k)) permitidos.push(k); });
  const lista = pessoas || await funcionarios(ctx.emp);
  const mapa: Record<string, any> = {};
  for (const f of lista) {
    const k = setorChave(f.setor);
    if (!permitidos.includes(k)) continue;
    mapa[f.id] = { nome: f.nome, setor: NOME_SETOR[k] || f.setor, id: f.id, atraso: 0, semUniforme: 0, semEpi: 0, usoCelular: 0, falta: 0, advertencia: 0, ausenciaJornada: 0 };
  }
  const ocorrencias = await sel(admin.from("controle_rh_ocorrencias").select("funcionario_id,funcionario_nome,setor,tipo")
    .eq("empresa_id", ctx.emp).gte("data_ocorrencia", ini).lt("data_ocorrencia", fim));
  for (const o of ocorrencias || []) {
    const tipo = tipoRH(o.tipo); if (!tipo) continue;
    let alvo = o.funcionario_id ? mapa[o.funcionario_id] : null;
    if (!alvo) alvo = Object.values(mapa).find((m: any) => texto(m.nome) === texto(o.funcionario_nome));
    if (!alvo) {
      const k = setorChave(o.setor); if (!o.funcionario_nome || !permitidos.includes(k)) continue;
      alvo = mapa["nome:" + texto(o.funcionario_nome)] = { nome: o.funcionario_nome, setor: NOME_SETOR[k] || o.setor, id: null, atraso: 0, semUniforme: 0, semEpi: 0, usoCelular: 0, falta: 0, advertencia: 0, ausenciaJornada: 0 };
    }
    alvo[tipo]++;
  }
  return Object.values(mapa).map((f: any) => {
    const ultrapassou = TIPOS_RH.some((t) => f[t] > num(metas[t]));
    const possui = TIPOS_RH.some((t) => f[t] > 0);
    const r: any = { id: f.id, nome: f.nome, setor: f.setor };
    TIPOS_RH.forEach((t) => { r[t] = f[t]; r["meta" + t[0].toUpperCase() + t.slice(1)] = num(metas[t]); });
    r.status = ultrapassou ? "Meta não atingida" : possui ? "Atenção" : "OK";
    r.apto = !ultrapassou;
    return r;
  }).sort((a: any, b: any) => String(a.setor).localeCompare(String(b.setor), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}
function motivosRH(a: any) {
  if (!a) return [];
  const nomes: Record<string, string> = { atraso: "atraso", semUniforme: "sem uniforme", semEpi: "sem EPI", usoCelular: "uso de celular", falta: "falta", advertencia: "advertência", ausenciaJornada: "ausência de jornada" };
  return TIPOS_RH.filter((t) => num(a[t]) > num(a["meta" + t[0].toUpperCase() + t.slice(1)])).map((t) => nomes[t] + " acima da meta");
}

async function metasDoMes(ctx: any, mes: string) {
  const n = Number(mes.split("-")[1]);
  const linhas = await sel(admin.from("central_metas").select("*").eq("empresa_id", ctx.emp).eq("mes", n));
  const rh = ctx.cfg.metasRH;
  return SETORES.map((setor) => {
    const l = (linhas || []).find((x: any) => setorChave(x.setor) === setorChave(setor)) || {};
    return { setor, producao: l.producao ?? "", tempo: l.tempo ?? "", qualidade: l.qualidade ?? "", prazo: l.prazo ?? "", ...rh };
  });
}

/* O.S do acervo concluídas no mês (com o item e o pedido de origem). */
async function ordensDoMes(ctx: any, mes: string) {
  const { ini, fim } = limitesMes(mes);
  const lista = await sel(admin.from("acervo_os").select("id,numero,setor,fluxo,status,prazo,quantidade,criado_em,concluido_em,historico,item_id,retorno_id")
    .eq("empresa_id", ctx.emp).gte("concluido_em", ini + "T00:00:00-03:00").lt("concluido_em", fim + "T00:00:00-03:00"));
  const ids = [...new Set((lista || []).map((o: any) => o.item_id).filter(Boolean))];
  const itens = ids.length ? await sel(admin.from("itens").select("id,descricao_total,produto,valor_reposicao").in("id", ids)) : [];
  const rets = [...new Set((lista || []).map((o: any) => o.retorno_id).filter(Boolean))];
  const retornos = rets.length ? await sel(admin.from("acervo_retornos").select("id,pedido_id,motivo,origem").in("id", rets)) : [];
  const peds = [...new Set((retornos || []).map((r: any) => r.pedido_id).filter(Boolean))];
  const pedidos = peds.length ? await sel(admin.from("separacoes_pedidos").select("id,numero_pedido").in("id", peds)) : [];
  const mi = new Map((itens || []).map((i: any) => [i.id, i])), mr = new Map((retornos || []).map((r: any) => [r.id, r])), mp = new Map((pedidos || []).map((p: any) => [p.id, p]));
  return (lista || []).filter((o: any) => o.status === "concluida").map((o: any) => {
    const item: any = mi.get(o.item_id) || {}, ret: any = mr.get(o.retorno_id) || {};
    const fluxo = (Array.isArray(o.fluxo) && o.fluxo.length ? o.fluxo : [o.setor]).map((s: any) => String(s || "").trim()).filter(Boolean);
    const criada = (o.historico || []).find((h: any) => h.acao === "criada");
    return { ...o, item: item.descricao_total || item.produto || "", reposicaoUnit: num(item.valor_reposicao), fluxoLista: fluxo,
      setorFinal: fluxo[fluxo.length - 1] || o.setor, pedido: (mp.get(ret.pedido_id) as any)?.numero_pedido || "",
      dano: ret.motivo || criada?.motivo || "", reprovada: (o.historico || []).some((h: any) => h.acao === "reprovada") };
  });
}

async function realSetores(ctx: any, mes: string) {
  const os = await ordensDoMes(ctx, mes), r: Record<string, any> = {};
  for (const s of SETORES) r[setorChave(s)] = { concluidas: 0, tempos: [] as number[], noPrazo: 0, comPrazo: 0, aprovadas: 0, total: 0 };
  for (const o of os) {
    const setoresFluxo = [...new Set(o.fluxoLista.map(setorChave))];
    setoresFluxo.forEach((k: any) => { if (r[k]) r[k].concluidas += num(o.quantidade) || 1; });
    if (setoresFluxo.length === 1 && r[setoresFluxo[0] as string] && o.criado_em && o.concluido_em) r[setoresFluxo[0] as string].tempos.push((Date.parse(o.concluido_em) - Date.parse(o.criado_em)) / 86400000);
    const kf = setorChave(o.setorFinal);
    if (r[kf]) {
      r[kf].total++; if (!o.reprovada) r[kf].aprovadas++;
      if (o.prazo) { r[kf].comPrazo++; if (String(o.concluido_em).slice(0, 10) <= String(o.prazo).slice(0, 10)) r[kf].noPrazo++; }
    }
  }
  const saida: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    saida[k] = { concluidas: v.concluidas, tempo: v.tempos.length ? r2(v.tempos.reduce((a: number, b: number) => a + b, 0) / v.tempos.length) : 0,
      prazo: v.comPrazo ? r2(v.noPrazo / v.comPrazo * 100) : 100, qualidade: v.total ? r2(v.aprovadas / v.total * 100) : 100 };
  }
  return saida;
}

async function tetoGastos(ctx: any, mes: string) {
  try {
    const t = await rpc("almox_teto_gastos", { p_empresa: ctx.emp, p_mes: mes + "-01" }, ctx.comoUsuario || admin);
    return ((t && t.setores) || []).map((s: any) => ({ setor: s.setor, teto: num(s.teto), gasto: num(s.gasto), percentual: num(s.teto) > 0 ? Math.min(100, num(s.gasto) / num(s.teto) * 100) : 0 }));
  } catch (_) { return []; }
}

async function statusSetores(ctx: any, mes: string) {
  const metas = await metasDoMes(ctx, mes), real = await realSetores(ctx, mes), gastos = await tetoGastos(ctx, mes);
  return metas.map((m: any) => {
    const rl = real[setorChave(m.setor)] || {}, g = gastos.find((x: any) => setorChave(x.setor) === setorChave(m.setor)) || {};
    const producao = num(rl.concluidas), qualidade = num(rl.qualidade), prazo = num(rl.prazo), tempo = num(rl.tempo), gasto = r2(num(g.percentual));
    const mp = num(m.producao), mq = num(m.qualidade), mz = num(m.prazo), mt = num(m.tempo);
    const ok = (mp === 0 || producao >= mp) && (mq === 0 || qualidade >= mq) && (mz === 0 || prazo >= mz) && (mt === 0 || tempo <= mt) && gasto < 100;
    return { setor: m.setor, producao, qualidade, prazo, tempo, metaProducao: mp, metaQualidade: mq, metaPrazo: mz, metaTempo: mt, gasto, metaGasto: 100, status: ok };
  });
}
function motivosSetor(a: any) {
  if (!a) return [];
  const m = [];
  if (a.metaProducao > 0 && a.producao < a.metaProducao) m.push("produção abaixo da meta");
  if (a.metaQualidade > 0 && a.qualidade < a.metaQualidade) m.push("qualidade abaixo da meta");
  if (a.metaPrazo > 0 && a.prazo < a.metaPrazo) m.push("prazo abaixo da meta");
  if (a.metaTempo > 0 && a.tempo > a.metaTempo) m.push("tempo acima da meta");
  if (a.gasto >= 100) m.push("gasto no limite ou acima");
  if (a.status !== true && !m.length) m.push("meta operacional não atingida");
  return m;
}

/* Eventos do mês com a nota de complexidade de cada setor (mesma regra do Painel de Complexidade). */
async function eventosMes(ctx: any, mes: string) {
  const { ini, fim } = limitesMes(mes);
  const contextos = await rpc("central_eventos_mes", { p_empresa: ctx.emp, p_ini: ini, p_fim: fim });
  const c = ctx.cfg.comissoes;
  return (contextos || []).map((ctxPedido: any) => {
    const p = CX.paraPainel(ctxPedido), set = p.complexidade?.setores || {};
    const nota = (id: string) => (set[id] && set[id].status === "completo") ? num(set[id].score) : 0;
    const score = nota("personalizacao"), scorePintura = nota("pintura"), valor = num(p.valorLocacao);
    return {
      data: dataBR(p.data), numero: String(p.numero || ""), cliente: p.cliente || "", valorLocacao: valor,
      score, comissao: num(c.estofados), valorComissao: r2(valor * score / 100 * num(c.estofados) / 100),
      scorePintura, comissaoPintura: num(c.pintura), valorComissaoPintura: r2(valor * scorePintura / 100 * num(c.pintura) / 100),
      scores: { triagem: set.triagem?.status === "completo" ? num(set.triagem.score) : null, carregamento: set.carregamento?.status === "completo" ? num(set.carregamento.score) : null, montagem: set.montagem?.status === "completo" ? num(set.montagem.score) : null },
      pedidoId: ctxPedido.id, complexidade: set,
    };
  });
}

async function listarOS(ctx: any, mes: string) {
  const os = await ordensDoMes(ctx, mes), pct = ctx.cfg.comissoes.os || {};
  return os.map((o: any) => {
    const setor = NOME_SETOR[setorChave(o.setorFinal)] || o.setorFinal;
    const comissao = num(pct[setor] ?? pct[setorChave(setor)]), reposicao = r2(o.reposicaoUnit * (num(o.quantidade) || 1));
    return { data: dataBR(o.concluido_em ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(o.concluido_em)) : ""), os: String(o.numero), item: o.item,
      qtd: num(o.quantidade), fluxo: o.fluxoLista.join(" → "), dano: o.dano, pedido: o.pedido, detalhes: o.dano,
      reposicao, comissao, total: r2(reposicao * comissao / 100), setor };
  });
}

async function supervisor(ctx: any, pessoas?: any[]) {
  const lista = pessoas || await funcionarios(ctx.emp);
  const s = lista.find((f: any) => ehSupervisor(f.cargo));
  const percentual = num(ctx.cfg.comissoes.supervisao);
  return { ok: true, percentual, fator: percentual / 100, id: s?.id || null, nomeSupervisor: s?.nome || "", salarioSupervisor: s?.salario || 0,
    tetoSupervisor: r2((s?.salario || 0) * 0.30), aviso: s ? "" : 'Nenhum funcionário com o cargo "Supervisor Departamento de Manutenção".' };
}

async function distribuicao(ctx: any, mes: string) {
  const pessoas = await funcionarios(ctx.emp);
  const setores = await statusSetores(ctx, mes);
  const rh = await avaliacaoRH(ctx, mes, [], pessoas);
  const mapaSetor: Record<string, any> = {}; setores.forEach((s: any) => { mapaSetor[setorChave(s.setor)] = { ...s, atingiuMeta: s.status === true, motivos: motivosSetor(s) }; });
  const estofados: any[] = [], estrutura: any[] = [];
  for (const f of pessoas) {
    if (ehSupervisor(f.cargo)) continue;
    const grupo = grupoDoSetor(f.setor); if (!grupo) continue;
    const aS = mapaSetor[setorChave(f.setor)] || null, aR = rh.find((r: any) => r.id === f.id) || null;
    const setorOk = !!aS && aS.atingiuMeta === true, rhOk = !!aR && aR.apto === true;
    let motivo = "";
    if (!aS) motivo = "Setor sem avaliação no mês";
    else if (!setorOk) motivo = aS.motivos.length ? "Setor: " + aS.motivos.join(", ") : "Setor não atingiu a meta";
    else if (!aR) motivo = "RH: avaliação não encontrada";
    else if (!rhOk) { const mr = motivosRH(aR); motivo = mr.length ? "RH: " + mr.join(", ") : "RH: meta individual não atingida"; }
    const [primeiroNome, ...resto] = f.nome.split(" ");
    const item = { id: f.id, chave: "RH:" + f.id, nome: f.nome, nomeCompleto: f.nome, primeiroNome, sobrenome: resto.join(" "), cpf: "", setor: f.setor, cargo: f.cargo,
      salarioBruto: f.salario, tetoBonus: r2(f.salario * 0.25), setorAtingiuMeta: setorOk, rhAtingiuMeta: rhOk, aptoBonus: setorOk && rhOk, motivoBonus: motivo };
    (grupo === "estofados" ? estofados : estrutura).push(item);
  }
  const ord = (a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR");
  estofados.sort(ord); estrutura.sort(ord);
  return { ok: true, mes, estofados, estrutura, totalEstofados: estofados.length, totalEstrutura: estrutura.length,
    aptosEstofados: estofados.filter((f) => f.aptoBonus).length, aptosEstrutura: estrutura.filter((f) => f.aptoBonus).length, _pessoas: pessoas };
}

/* ---------------- fechamento ---------------- */
function distribuir(total: number, lista: any[], grupo: string) {
  if (!lista.length) return [];
  const totalC = Math.max(0, Math.round(total * 100)), base = Math.floor(totalC / lista.length), resto = totalC % lista.length;
  return lista.map((f, i) => {
    const calc = base + (i < resto ? 1 : 0), sal = Math.max(0, Math.round(num(f.salarioBruto) * 100)), teto = Math.max(0, Math.round(sal * 0.25));
    const apto = f.aptoBonus === true, temSal = sal > 0, limitado = apto && temSal && calc > teto;
    const pago = apto && temSal ? Math.min(calc, teto) : 0;
    return { ordem: i + 1, grupo, id: f.id, chave: f.chave, cpf: "", nome: f.nome, setor: f.setor, cargo: f.cargo,
      salarioBruto: sal / 100, tetoBonus: teto / 100, valorCalculadoFechado: calc / 100, valorPagoFechado: pago / 100,
      valorExcedenteFechado: limitado ? (calc - teto) / 100 : 0, valorNaoDistribuidoFechado: Math.max(0, calc - pago) / 100,
      aptoBonus: apto, setorAtingiuMeta: f.setorAtingiuMeta === true, rhAtingiuMeta: f.rhAtingiuMeta === true, limitadoPeloTeto: limitado, motivoBonus: f.motivoBonus || "", fechamentoMensal: true };
  });
}
async function snapshot(ctx: any, mes: string) {
  const dist = await distribuicao(ctx, mes), eventos = await eventosMes(ctx, mes), ordens = await listarOS(ctx, mes), sup = await supervisor(ctx, dist._pessoas);
  let eventosEstofados = 0, eventosEstrutura = 0, osEstofados = 0, osEstrutura = 0;
  eventos.forEach((e: any) => { eventosEstofados += num(e.valorComissao); eventosEstrutura += num(e.valorComissaoPintura); });
  ordens.forEach((o: any) => { const g = grupoDoSetor(o.setor); if (g === "estofados") osEstofados += num(o.total); if (g === "estrutura") osEstrutura += num(o.total); });
  [eventosEstofados, eventosEstrutura, osEstofados, osEstrutura] = [eventosEstofados, eventosEstrutura, osEstofados, osEstrutura].map(r2);
  const fe = distribuir(eventosEstofados + osEstofados, dist.estofados, "estofados"), fs = distribuir(eventosEstrutura + osEstrutura, dist.estrutura, "estrutura");
  const baseC = [...fe, ...fs].reduce((t, f) => t + Math.round(f.valorPagoFechado * 100), 0);
  const salSupC = Math.round(num(sup.salarioSupervisor) * 100), tetoSupC = Math.round(salSupC * 0.30);
  const calcSupC = Math.round(baseC * num(sup.percentual) / 100), pagoSupC = salSupC > 0 ? Math.min(calcSupC, tetoSupC) : 0;
  return { eventosEstofados, osEstofados, eventosEstrutura, osEstrutura, funcionariosEstofados: fe, funcionariosEstrutura: fs,
    percentualSupervisor: num(sup.percentual), nomeSupervisor: sup.nomeSupervisor, supervisorId: sup.id, salarioSupervisor: salSupC / 100,
    tetoSupervisor: tetoSupC / 100, baseElegivelSupervisor: baseC / 100, valorCalculadoSupervisor: calcSupC / 100, valorPagoSupervisor: pagoSupC / 100,
    totalPagoFuncionarios: baseC / 100, totalGeral: (baseC + pagoSupC) / 100 };
}
const retornoFechamento = (l: any) => ({ ok: true, fechado: true, idFechamento: l.id, mes: l.mes, dataFechamento: dataHoraBR(l.fechado_em), fechadoPor: l.fechado_por || "", ...l.dados });
async function fechamentos(ctx: any) { return await sel(admin.from("central_fechamentos").select("*").eq("empresa_id", ctx.emp).order("mes")) || []; }

/* ---------------- pagamentos / premiações ---------------- */
async function pagamentos(ctx: any, anoFiltro?: any) {
  const todos = await fechamentos(ctx);
  const anos = [...new Set([...todos.map((f: any) => f.mes.slice(0, 4)), mesHoje().slice(0, 4)])].sort();
  const ano = /^\d{4}$/.test(String(anoFiltro || "")) ? String(anoFiltro) : mesHoje().slice(0, 4);
  const doAno = todos.filter((f: any) => f.mes.slice(0, 4) === ano);
  const pessoas: Record<string, any> = {};
  const pessoa = (chave: string, base: any) => (pessoas[chave] = pessoas[chave] || { chave, ...base, valores: {} });
  for (const f of doAno) {
    const d = f.dados || {};
    if (d.supervisorId || d.nomeSupervisor) pessoa("SUP:" + (d.supervisorId || texto(d.nomeSupervisor)), { nome: d.nomeSupervisor, setor: "Supervisão", cargo: "Supervisor", grupo: "SUPERVISOR" }).valores[f.mes] = { devido: num(d.valorPagoSupervisor), pago: null, atualizadoEm: "" };
    [...(d.funcionariosEstofados || []), ...(d.funcionariosEstrutura || [])].forEach((x: any) => {
      pessoa(x.chave || "RH:" + x.id, { nome: x.nome, setor: x.setor, cargo: x.cargo, grupo: String(x.grupo || "").toUpperCase() }).valores[f.mes] = { devido: num(x.valorPagoFechado), pago: null, atualizadoEm: "" };
    });
  }
  const pags = await sel(admin.from("central_pagamentos").select("*").eq("empresa_id", ctx.emp).like("mes", ano + "-%"));
  for (const p of pags || []) {
    const pe = pessoas[p.chave]; if (!pe) continue;
    pe.valores[p.mes] = pe.valores[p.mes] || { devido: 0, pago: null, atualizadoEm: "" };
    pe.valores[p.mes].pago = num(p.valor_pago); pe.valores[p.mes].atualizadoEm = dataHoraBR(p.atualizado_em);
  }
  const ordem: Record<string, number> = { SUPERVISOR: 0, ESTOFADOS: 1, ESTRUTURA: 2 };
  return { ok: true, ano, anosDisponiveis: anos,
    meses: doAno.map((f: any) => ({ mes: f.mes, idFechamento: f.id, dataFechamento: dataHoraBR(f.fechado_em) })),
    pessoas: Object.values(pessoas).sort((a: any, b: any) => ((ordem[a.grupo] ?? 9) - (ordem[b.grupo] ?? 9)) || a.nome.localeCompare(b.nome)) };
}
const ehMesPremiacao = (mes: string) => { const n = Number(String(mes).split("-")[1]); return n >= 1 && n <= 12 && Math.floor((n - 1) / 2) % 2 === 0; };
async function premiacoes(ctx: any, anoFiltro?: any) {
  const painel = await pagamentos(ctx, anoFiltro), ano = painel.ano;
  const paineis = [];
  for (const a of painel.anosDisponiveis.filter((x: string) => x < ano)) paineis.push(await pagamentos(ctx, a));
  paineis.push(painel);
  const pessoas: Record<string, any> = {}, fechados: Record<string, boolean> = {};
  paineis.forEach((p: any) => {
    p.meses.forEach((m: any) => fechados[m.mes] = true);
    p.pessoas.forEach((pe: any) => { pessoas[pe.chave] = pessoas[pe.chave] || { chave: pe.chave, nome: pe.nome, setor: pe.setor, cargo: pe.cargo, grupo: pe.grupo, bonus: {} };
      Object.keys(pe.valores).forEach((m) => pessoas[pe.chave].bonus[m] = num(pe.valores[m].devido)); });
  });
  const itens = await sel(admin.from("central_premiacoes").select("*").eq("empresa_id", ctx.emp).order("criado_em"));
  const porMesChave: Record<string, any[]> = {};
  (itens || []).forEach((i: any) => {
    const item = { id: i.id, mes: i.mes, chave: i.chave, nome: i.nome || "", descricao: i.descricao, valor: num(i.valor), fotoId: i.foto_url || "", link: i.link || "", dataCompra: i.data_compra || "", fotoEntregaId: i.foto_entrega_url || "" };
    (porMesChave[i.mes + "|" + i.chave] = porMesChave[i.mes + "|" + i.chave] || []).push(item);
    if (!pessoas[i.chave]) pessoas[i.chave] = { chave: i.chave, nome: i.nome, setor: "", cargo: "", grupo: "OUTROS", bonus: {} };
  });
  const saldo: Record<string, number> = {}, porMes: Record<string, any[]> = {};
  Object.keys(fechados).filter(ehMesPremiacao).sort().forEach((mes) => {
    const linhas: any[] = [];
    Object.values(pessoas).forEach((pe: any) => {
      const bonusC = Math.round((pe.bonus[mes] || 0) * 100), antC = saldo[pe.chave] || 0, its = porMesChave[mes + "|" + pe.chave] || [];
      const usadoC = its.reduce((t, i) => t + Math.round(i.valor * 100), 0);
      if (!(mes in pe.bonus) && antC === 0 && !its.length) return;
      const disp = bonusC + antC, s = disp - usadoC; saldo[pe.chave] = s;
      linhas.push({ chave: pe.chave, nome: pe.nome, setor: pe.setor, cargo: pe.cargo, grupo: pe.grupo, bonus: bonusC / 100, saldoAnterior: antC / 100, disponivel: disp / 100, usado: usadoC / 100, saldo: s / 100, itens: its });
    });
    const ordem: Record<string, number> = { SUPERVISOR: 0, ESTOFADOS: 1, ESTRUTURA: 2 };
    linhas.sort((a, b) => ((ordem[a.grupo] ?? 9) - (ordem[b.grupo] ?? 9)) || a.nome.localeCompare(b.nome));
    porMes[mes] = linhas;
  });
  const meses = [];
  for (let n = 1; n <= 12; n++) { const mes = `${ano}-${String(n).padStart(2, "0")}`; if (ehMesPremiacao(mes)) meses.push({ mes, fechado: !!fechados[mes], pessoas: porMes[mes] || [] }); }
  return { ok: true, ano, anosDisponiveis: painel.anosDisponiveis, meses };
}
async function enviarFoto(ctx: any, foto: any, mes: string) {
  if (!foto || !foto.base64) return null;
  const tipo = /png/.test(foto.mimeType || foto.tipo || "") ? "png" : /webp/.test(foto.mimeType || foto.tipo || "") ? "webp" : "jpeg";
  const bytes = Uint8Array.from(atob(String(foto.base64).replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error("A foto passa de 10 MB.");
  const caminho = `${ctx.emp}/${mes}/${crypto.randomUUID()}.${tipo === "jpeg" ? "jpg" : tipo}`;
  const { error } = await admin.storage.from("central-premiacoes").upload(caminho, bytes, { contentType: "image/" + tipo });
  if (error) throw new Error("Não foi possível guardar a foto: " + error.message);
  return admin.storage.from("central-premiacoes").getPublicUrl(caminho).data.publicUrl;
}
async function apagarFoto(url: any) {
  const m = String(url || "").match(/\/object\/public\/central-premiacoes\/(.+)$/);
  if (m) await admin.storage.from("central-premiacoes").remove([decodeURIComponent(m[1])]).catch(() => {});
}

/* ---------------- Meu Bônus ---------------- */
async function extrato(ctx: any, funcionarioId: string) {
  const f = await sel(admin.from("funcionarios_acesso").select("id,nome,setor,cargo,foto_url").eq("id", funcionarioId).maybeSingle());
  if (!f) throw new Error("Cadastro não encontrado.");
  ctx.cfg = ctx.cfg || await lerConfig(ctx.emp);
  const chave = "RH:" + f.id, atual = await pagamentos(ctx, "");
  const pessoa = { nome: f.nome, setor: f.setor || "", cargo: f.cargo || "", grupo: "" };
  const meses: Record<string, any> = {};
  const todos = await fechamentos(ctx);
  for (const ano of atual.anosDisponiveis) {
    const painel = ano === atual.ano ? atual : await pagamentos(ctx, ano);
    const achada = painel.pessoas.find((p: any) => p.chave === chave);
    if (!achada) continue;
    Object.assign(pessoa, { nome: achada.nome || pessoa.nome, setor: achada.setor, cargo: achada.cargo, grupo: achada.grupo });
    Object.keys(achada.valores).forEach((mes) => {
      const v = achada.valores[mes], fe = todos.find((x: any) => x.mes === mes);
      const linha = fe ? [...(fe.dados.funcionariosEstofados || []), ...(fe.dados.funcionariosEstrutura || [])].find((x: any) => x.chave === chave) : null;
      meses[mes] = { mes, premiacao: ehMesPremiacao(mes), abastecido: num(v.devido), pago: v.pago == null ? null : num(v.pago),
        setorAtingiuMeta: linha ? linha.setorAtingiuMeta : null, rhAtingiuMeta: linha ? linha.rhAtingiuMeta : null, motivo: linha?.motivoBonus || "", itensPremiacao: null };
    });
  }
  let saldoPremiacao = null;
  for (const ano of atual.anosDisponiveis) {
    for (const mp of (await premiacoes(ctx, ano)).meses) {
      const l = mp.pessoas.find((p: any) => p.chave === chave); if (!l) continue;
      meses[mp.mes] = meses[mp.mes] || { mes: mp.mes, premiacao: true, abastecido: 0, pago: null, setorAtingiuMeta: null, rhAtingiuMeta: null, motivo: "", itensPremiacao: null };
      meses[mp.mes].itensPremiacao = { saldoAnterior: l.saldoAnterior, disponivel: l.disponivel, usado: l.usado, saldo: l.saldo,
        itens: l.itens.map((i: any) => ({ descricao: i.descricao, valor: i.valor, dataCompra: i.dataCompra, fotoId: i.fotoId, fotoEntregaId: i.fotoEntregaId })) };
      saldoPremiacao = l.saldo;
    }
  }
  return { ok: true, pessoa: { ...pessoa, fotoId: "", fotoUrl: !f.foto_url ? "" : /^https?:\/\//.test(f.foto_url) ? f.foto_url : `${URL_SB}/storage/v1/object/public/avatares/${ctx.emp}/${f.id}.jpg` },
    saldoPremiacao, meses: Object.keys(meses).sort().map((m) => meses[m]), atualizadoEm: dataHoraBR(new Date().toISOString()) };
}

/* ---------------- Operação ---------------- */
function mesmoNome(a: any, b: any) {
  const tk = (n: any) => texto(String(n || "").replace(/\(.*?\)/g, " ")).replace(/[^a-z ]/g, " ").split(" ").filter(Boolean);
  const ta = tk(a), tb = tk(b);
  if (!ta.length || !tb.length || ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return true;
  return ta[1].slice(0, 3) === tb[1].slice(0, 3);
}
async function assinaturaDano(d: any) {
  const bruto = new TextEncoder().encode(JSON.stringify([d.id, d.itemId, d.quantidade, d.detalhes, d.pedido, d.equipePadrao]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bruto))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const EQUIPE_POR_ORIGEM: Record<string, string> = { separacao: "triagem", inventario: "triagem", coleta: "montagem", triagem_retorno: "" };
async function danosMes(ctx: any, mes: string) {
  const { ini, fim } = limitesMes(mes);
  const lista = await sel(admin.from("acervo_retornos").select("id,pedido_id,item_id,quantidade,motivo,origem,criado_em").eq("empresa_id", ctx.emp).eq("tipo", "avaria")
    .gte("criado_em", ini + "T00:00:00-03:00").lt("criado_em", fim + "T00:00:00-03:00"));
  const itens = await mapaPor("itens", "id,descricao_total,produto,valor_reposicao", (lista || []).map((x: any) => x.item_id));
  const pedidos = await mapaPor("separacoes_pedidos", "id,numero_pedido", (lista || []).map((x: any) => x.pedido_id));
  const ciencias = await rpc("rh_danos_ciencias", { p_empresa: ctx.emp });
  const saida = [];
  for (const r of lista || []) {
    const it: any = itens.get(r.item_id) || {}, q = num(r.quantidade) || 1, padrao = EQUIPE_POR_ORIGEM[r.origem] ?? "";
    const c = (ciencias || []).find((x: any) => x.dano_id === r.id);
    const equipe = c?.equipe || padrao;
    const base = { id: r.id, itemId: r.item_id, quantidade: q, detalhes: r.motivo || "", pedido: (pedidos.get(r.pedido_id) as any)?.numero_pedido || "", equipePadrao: padrao };
    const assinatura = await assinaturaDano(base);
    let ciencia: any = { status: "legado", equipe: "" };
    if (equipe) ciencia = !c || c.assinatura !== assinatura ? { status: "pendente", equipe, assinatura }
      : { status: c.status, equipe, assinatura, nome: c.confirmado_nome, em: c.confirmado_em, justificativa: c.justificativa, podeRevisar: ctx.podeAdmin };
    saida.push({ ...base, ciencia, os: "", item: it.descricao_total || it.produto || "", setor: "", fluxo: "", dano: equipe ? equipe[0].toUpperCase() + equipe.slice(1) : (r.origem === "avulsa" ? "Depósito" : "Evento"),
      local: equipe || (r.pedido_id ? "evento" : "interno"), reposicaoTotal: r2(num(it.valor_reposicao) * q), data: dataBR(String(r.criado_em).slice(0, 10)) });
  }
  return saida;
}
async function mapaPor(tabela: string, campos: string, ids: any[]) {
  const u = [...new Set(ids.filter(Boolean))];
  return new Map(((u.length ? await sel(admin.from(tabela).select(campos).in("id", u)) : []) || []).map((x: any) => [x.id, x]));
}
async function cronogramaMes(ctx: any, eventos: any[]) {
  const ids = eventos.map((e: any) => e.pedidoId).filter(Boolean);
  if (!ids.length) return { mapa: {}, etapas: [] };
  const etapas = await sel(admin.from("operacao_etapas").select("id,pedido_id,tipo,data,hora").in("pedido_id", ids));
  const pessoas = etapas.length ? await sel(admin.from("operacao_etapa_pessoas").select("etapa_id,nome,funcionario_id").in("etapa_id", etapas.map((e: any) => e.id))) : [];
  const numero = new Map(eventos.map((e: any) => [e.pedidoId, e.numero])), mapa: Record<string, any[]> = {};
  for (const e of etapas) {
    const nomes = pessoas.filter((p: any) => p.etapa_id === e.id).map((p: any) => p.nome).filter(Boolean);
    (mapa[numero.get(e.pedido_id) as string] = mapa[numero.get(e.pedido_id) as string] || []).push({ etapa: texto(e.tipo), nomes, ids: pessoas.filter((p: any) => p.etapa_id === e.id).map((p: any) => p.funcionario_id).filter(Boolean) });
  }
  return { mapa, etapas };
}
async function montagemIndicadores(ctx: any, etapas: any[]) {
  const r = { semUniforme: 0, atraso: 0, uniformePendente: 0, localPendente: 0, semRegistro: 0, horarioPendente: 0 };
  const alvo = etapas.filter((e: any) => /^(montagem|desmontagem)$/.test(texto(e.tipo)));
  if (!alvo.length) return r;
  const regs = await sel(admin.from("operacao_registros").select("etapa_id,dados").eq("tipo", "equipe").in("etapa_id", alvo.map((e: any) => e.id)));
  // Uniforme: avaliação do RH pela foto da equipe (free_rh_uniforme, por inscrição do free na vaga da etapa).
  const vagas = await sel(admin.from("free_vagas").select("id,etapa_id").in("etapa_id", alvo.map((e: any) => e.id))).catch(() => []);
  const insc = (vagas || []).length ? await sel(admin.from("free_inscricoes").select("id,vaga_id").in("vaga_id", vagas.map((v: any) => v.id))).catch(() => []) : [];
  const avals = (insc || []).length ? await sel(admin.from("free_rh_uniforme").select("inscricao_id,avaliacao").in("inscricao_id", insc.map((i: any) => i.id))).catch(() => []) : [];
  const etapaDaVaga = new Map((vagas || []).map((v: any) => [v.id, v.etapa_id])), etapaDaInsc = new Map((insc || []).map((i: any) => [i.id, etapaDaVaga.get(i.vaga_id)]));
  const uni = (avals || []).map((a: any) => ({ etapa_id: etapaDaInsc.get(a.inscricao_id), avaliacao: a.avaliacao }));
  for (const e of alvo) {
    const reg = (regs || []).find((x: any) => x.etapa_id === e.id);
    if (!reg) { const prev = e.data ? Date.parse(`${e.data}T${String(e.hora || "08:00").slice(0, 5)}:00-03:00`) : NaN; if (prev <= Date.now()) r.semRegistro++; continue; }
    const ch = reg.dados?.chegada || {};
    if (num(ch.atraso) > 0) r.atraso++;
    if (ch.localStatus && ch.localStatus !== "NO_LOCAL") r.localPendente++;
    if ((uni || []).some((u: any) => u.etapa_id === e.id && u.avaliacao === "SEM")) r.semUniforme++;
  }
  return r;
}
// Cálculo puro do bônus da Operação (mesma regra da Central antiga, OperacaoCentral.js).
function operacaoCalcular(d: any) {
  const p = d.parametros, avisos: string[] = [], cronograma = d.cronograma || {}, equipes: Record<string, any> = {};
  OPERACAO_EQUIPES.forEach((e) => {
    const k = e.chave;
    let membros;
    if (!d.exemplo) membros = d.funcionarios.filter((f: any) => f.equipe === k).map((f: any) => ({ id: f.id, nome: f.nome, setor: f.setor, salario: f.salario, noRH: true }));
    else membros = (p.membros[k] || []).map((nome: string) => { const rh = d.funcionarios.find((f: any) => mesmoNome(f.nome, nome)); return { nome: rh ? rh.nome : nome, setor: rh ? rh.setor : "", salario: rh ? rh.salario : 0, noRH: !!rh }; });
    equipes[k] = { chave: k, nome: e.nome, percentual: p.percentual[k], bolo: 0, eventos: [], membros: membros.map((m: any) => Object.assign(m, { participacoes: 0 })),
      foraDoCadastro: {}, semEquipe: 0, danos: [], desconto: 0, indicadores: [], metaOk: true };
  });
  (d.eventos || []).forEach((ev: any) => {
    const linhas = cronograma[ev.numero || ev.pedido] || [];
    OPERACAO_EQUIPES.forEach((e) => {
      const eq = equipes[e.chave], usouPadrao = ev.scores[e.chave] == null, score = usouPadrao ? p.scorePadrao[e.chave] : ev.scores[e.chave];
      const comissao = Math.round(ev.valorLocacao * (score / 100) * (eq.percentual / 100) * 100) / 100;
      eq.bolo += comissao;
      const minhas = linhas.filter((l: any) => e.etapas.indexOf(l.etapa) >= 0), presentes: Record<number, boolean> = {};
      minhas.forEach((l: any) => {
        (l.ids || []).forEach((id: string) => { const i = eq.membros.findIndex((m: any) => m.id === id); if (i >= 0) presentes[i] = true; });
        l.nomes.forEach((nome: string) => {
          const i = eq.membros.findIndex((m: any) => mesmoNome(m.nome, nome));
          if (i >= 0) { presentes[i] = true; return; }
          if (!/\bfree\b|freela/.test(texto(nome)) && !(l.ids || []).length) eq.foraDoCadastro[nome] = (eq.foraDoCadastro[nome] || 0) + 1;
        });
      });
      const qtd = Object.keys(presentes).length;
      Object.keys(presentes).forEach((i) => eq.membros[Number(i)].participacoes++);
      if (minhas.length && !qtd) eq.semEquipe++;
      eq.eventos.push({ pedido: ev.numero || ev.pedido, cliente: ev.cliente, data: ev.data, valorLocacao: ev.valorLocacao, score, scorePadrao: usouPadrao, comissao,
        complexidadeStatus: ev.complexidade?.[e.chave]?.status || null, noCronograma: minhas.length > 0, pessoas: qtd });
    });
  });
  const cm = d.montagemRH;
  if (cm) {
    if (cm.localPendente) avisos.push("Montagem: " + cm.localPendente + " envio(s) precisam de conferência de localização no cronograma.");
    if (cm.semRegistro) avisos.push("Montagem: " + cm.semRegistro + " etapa(s) sem foto da equipe no mês.");
  }
  const semValor = (d.eventos || []).filter((ev: any) => !ev.valorLocacao).length;
  if (semValor) avisos.push(semValor + " evento(s) do mês sem valor de locação: entram com R$ 0 no bolo.");
  const confirmado = (x: any) => !x.ciencia || x.ciencia.status === "legado" || x.ciencia.status === "confirmado";
  const danosQtd = { internos: 0, externos: 0 };
  (d.danos || []).forEach((x: any) => {
    if (!confirmado(x)) return;
    if (x.local === "interno" || x.local === "triagem") danosQtd.internos += x.quantidade;
    else if (x.local === "evento" || x.local === "montagem") danosQtd.externos += x.quantidade;
  });
  const desc = p.descontoPercentual / 100;
  (d.danos || []).forEach((x: any) => {
    let alvo: string[];
    if (["triagem", "carregamento", "montagem"].indexOf(x.local) >= 0) alvo = [x.local];
    else if (x.local === "interno") alvo = ["triagem"];
    else {
      const linhas = cronograma[x.pedido] || [];
      alvo = ["carregamento", "montagem"].filter((k) => { const e = OPERACAO_EQUIPES.find((q) => q.chave === k)!; return linhas.some((l: any) => e.etapas.indexOf(l.etapa) >= 0); });
      if (!alvo.length) alvo = ["montagem"];
    }
    let valor = x.reposicaoTotal * desc;
    if (p.tetoDescontoItem > 0) valor = Math.min(valor, p.tetoDescontoItem * x.quantidade);
    const parte = Math.round(valor / alvo.length * 100) / 100, ok = confirmado(x);
    alvo.forEach((k) => { equipes[k].danos.push(Object.assign({}, x, { desconto: ok ? parte : 0, descontoPrevisto: parte, dividido: alvo.length > 1 })); if (ok) equipes[k].desconto += parte; });
  });
  OPERACAO_EQUIPES.forEach((e) => {
    const eq = equipes[e.chave];
    let lista = (e.indicativos === "carregamento" ? p.metasCarregamento : (p.indicativos?.[e.indicativos] || d.indicativos?.[e.indicativos] || [])).map((m: any) => ({ nome: m.nome, meta: m.meta }));
    if (e.chave === "montagem" && !d.exemplo) lista = lista.concat([{ nome: "Sem uniforme", meta: num(p.metaSemUniforme ?? 0) }, { nome: "Atraso", meta: num(p.metaAtraso ?? 0) }]);
    lista.forEach((m: any) => {
      const chave = texto(m.nome);
      let valor = d.ocorrencias?.[e.indicativos]?.[chave] || 0;
      if (chave === "itens danificados" || chave === "item danificado") {
        if (e.chave === "triagem") valor = danosQtd.internos;
        else if (e.chave === "montagem") valor = danosQtd.externos;
        else valor = eq.danos.reduce((s: number, x: any) => s + (confirmado(x) ? x.quantidade : 0), 0);
      }
      if (e.chave === "montagem" && (chave === "sem uniforme" || chave === "atraso")) valor = num(chave === "sem uniforme" ? cm?.semUniforme : cm?.atraso);
      m.valor = valor; m.ok = valor <= m.meta; if (!m.ok) eq.metaOk = false;
    });
    eq.indicadores = lista;
    const setoresEquipe: Record<string, boolean> = {};
    eq.membros.forEach((m: any) => { if (m.setor && !m.extra) setoresEquipe[texto(m.setor)] = true; });
    eq.gastos = (d.gastos || []).filter((g: any) => setoresEquipe[texto(g.setor)]).map((g: any) => { const v = Math.round(num(g.percentual) * 10) / 10; return { setor: String(g.setor || ""), percentual: v, ok: v < 100 }; });
    eq.gastoOk = eq.gastos.every((g: any) => g.ok);
    if (!eq.gastoOk) eq.metaOk = false;
    eq.bolo = r2(eq.bolo); eq.desconto = r2(eq.desconto); eq.sobra = Math.max(0, r2(eq.bolo - eq.desconto));
    const sobraC = Math.round(eq.sobra * 100), n = eq.membros.length, base = n ? Math.floor(sobraC / n) : 0, restantes = n ? sobraC % n : 0;
    let distribuido = 0; eq.aptos = 0;
    eq.membros.forEach((m: any, i: number) => {
      m.calculado = (base + (i < restantes ? 1 : 0)) / 100;
      m.teto = m.salario > 0 ? Math.round(m.salario * p.tetoSalario) / 100 : 0;
      const item = Array.isArray(d.rh) && !m.extra ? d.rh.find((r: any) => (m.id && r.id === m.id) || mesmoNome(r.nome, m.nome)) : null;
      const rh = !Array.isArray(d.rh) || m.extra ? { ok: true } : !item ? { ok: false, motivo: "RH: avaliação não encontrada" } : item.apto ? { ok: true, item }
        : { ok: false, item, motivo: (motivosRH(item).length ? "RH: " + motivosRH(item).join(", ") : "RH: meta individual não atingida") };
      m.rh = rh.item ? { ...rh.item } : null;
      m.motivo = "";
      if (!eq.metaOk) { const fora = eq.indicadores.filter((x: any) => !x.ok).map((x: any) => x.nome); if (!eq.gastoOk) fora.push("Teto de gastos"); m.motivo = "Equipe: " + (fora.length ? fora.join(", ") : "meta não atingida"); }
      else if (!rh.ok) m.motivo = rh.motivo;
      else if (!(m.salario > 0)) m.motivo = "Salário não informado";
      m.apto = !m.motivo; m.recebe = m.apto ? Math.min(m.calculado, m.teto) : 0;
      m.limitadoPeloTeto = m.apto && m.calculado > m.teto; m.excedente = m.limitadoPeloTeto ? r2(m.calculado - m.teto) : 0;
      if (m.apto) eq.aptos++; distribuido += m.recebe;
    });
    eq.totalPago = r2(distribuido); eq.naoPago = r2(eq.sobra - eq.totalPago); eq.foraDoCadastro = Object.keys(eq.foraDoCadastro).sort();
    if (!eq.membros.length) avisos.push(eq.nome + ": nenhum membro na equipe (marque a equipe operacional no Cadastro de Funcionários).");
  });
  return { mes: d.mes, exemplo: !!d.exemplo, parametros: p, totalEventos: (d.eventos || []).length, equipes: OPERACAO_EQUIPES.map((e) => equipes[e.chave]), avisos };
}
async function operacaoMes(ctx: any, mes: string) {
  const pessoas = await funcionarios(ctx.emp), eventos = await eventosMes(ctx, mes), cron = await cronogramaMes(ctx, eventos);
  return operacaoCalcular({ mes, parametros: ctx.cfg.operacao, funcionarios: pessoas, gastos: await tetoGastos(ctx, mes), eventos, cronograma: cron.mapa,
    ocorrencias: { internos: {}, externos: {}, carregamento: {} }, danos: await danosMes(ctx, mes), montagemRH: await montagemIndicadores(ctx, cron.etapas),
    rh: await avaliacaoRH(ctx, mes, pessoas.map((f: any) => f.setor).filter(Boolean), pessoas) });
}
function operacaoExemplo(cfg: any) {
  const p = JSON.parse(JSON.stringify(cfg.operacao));
  p.membros = { triagem: ["Pessoa A", "Pessoa B", "Pessoa C"], carregamento: ["Pessoa D", "Pessoa E"], montagem: ["Pessoa F", "Pessoa G", "Pessoa H", "Pessoa I"] };
  const pessoas = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((l) => ({ nome: "Pessoa " + l, setor: "", cargo: "", salario: 2500 }));
  const pres: Record<string, number[]> = { triagem: [40, 30, 10], carregamento: [35, 25], montagem: [40, 40, 30, 20] }, eventos = [], cronograma: Record<string, any[]> = {};
  for (let i = 1; i <= 40; i++) {
    const pedido = "EX" + i;
    eventos.push({ pedido, numero: pedido, cliente: "Evento de exemplo " + i, data: "", valorLocacao: 15000, scores: { triagem: 45, carregamento: 45, montagem: 45 } });
    cronograma[pedido] = OPERACAO_EQUIPES.map((e) => ({ etapa: e.etapas[0], nomes: p.membros[e.chave].filter((_: any, j: number) => i <= pres[e.chave][j]) }));
  }
  p.indicativos = { internos: [{ nome: "Itens danificados", meta: 10 }, { nome: "Prazo", meta: 6 }], externos: [{ nome: "Itens danificados", meta: 10 }, { nome: "Feedback negativo do decorador", meta: 7 }] };
  p.metasCarregamento = [{ nome: "Itens danificados", meta: 10 }, { nome: "Itens esquecidos", meta: 3 }];
  cronograma["EX-CARREGAMENTO"] = [{ etapa: "carregamento", nomes: [] }]; cronograma["EX-MONTAGEM"] = [{ etapa: "montagem", nomes: [] }];
  const danos = [["Cadeira", 2, "interno", "", 500], ["Espelho", 1, "interno", "", 1200], ["Aparador", 1, "interno", "", 2000], ["Sofá", 1, "evento", "EX-CARREGAMENTO", 6000], ["Banqueta", 5, "evento", "EX-MONTAGEM", 2000], ["Mesa", 1, "evento", "EX-MONTAGEM", 3000]]
    .map(([item, quantidade, local, pedido, reposicaoTotal]) => ({ item, quantidade, local, pedido, reposicaoTotal, data: "" }));
  return operacaoCalcular({ mes: "exemplo", exemplo: true, parametros: p, funcionarios: pessoas, eventos, cronograma, ocorrencias: { internos: {}, externos: { "feedback negativo do decorador": 2 }, carregamento: {} }, danos });
}

/* ---------------- Almoxarifado (meta do mês e bônus) ---------------- */
async function metasAlmox(ctx: any, mes: string) {
  const { ini, fim } = limitesMes(mes), cfg = ctx.cfg.almoxarifado;
  const itens = await sel(admin.from("warehouse_count_items").select("id,material_id,divergencia,valor_divergencia,finalizada,created_at,quantidade_sistema,quantidade_contada")
    .eq("empresa_id", ctx.emp).gte("created_at", ini + "T00:00:00-03:00").lt("created_at", fim + "T00:00:00-03:00"));
  const materiais = await sel(admin.from("warehouse_materials").select("id,nome,codigo,valor_unitario").eq("empresa_id", ctx.emp).neq("status", "inativo"));
  const contados = new Set((itens || []).filter((i: any) => i.finalizada).map((i: any) => i.material_id));
  const metaContagem = materiais.length ? r2(contados.size / materiais.length * 100) : 0;
  const fin = (itens || []).filter((i: any) => i.finalizada), certos = fin.filter((i: any) => !num(i.divergencia)).length;
  const assertividade = fin.length ? r2(certos / fin.length * 100) : 0;
  const gastos = await tetoGastos(ctx, mes), teto = gastos.reduce((t: number, g: any) => t + g.teto, 0), gasto = gastos.reduce((t: number, g: any) => t + g.gasto, 0);
  const tetoGasto = teto > 0 ? r2(gasto / teto * 100) : 0;
  const compras = await sel(admin.from("warehouse_movements").select("valor_total").eq("empresa_id", ctx.emp).eq("tipo", "entrada")
    .gte("created_at", ini + "T00:00:00-03:00").lt("created_at", fim + "T00:00:00-03:00")).catch(() => []);
  const pessoas = await funcionarios(ctx.emp), almox = pessoas.filter((f: any) => texto(f.setor).includes("almox"));
  const rh = await avaliacaoRH(ctx, mes, ["almoxarifado"], almox);
  const soma = (t: string) => rh.reduce((s: number, r: any) => s + num(r[t]), 0), metas = ctx.cfg.metasRH;
  const atual: any = { mes, metaContagem, assertividade, tetoGasto, comprasMes: r2((compras || []).reduce((t: number, m: any) => t + num(m.valor_total), 0)) };
  TIPOS_RH.forEach((t) => { atual[t] = soma(t); atual["meta" + t[0].toUpperCase() + t.slice(1)] = num(metas[t]); });
  const ocOk = TIPOS_RH.every((t) => atual[t] <= atual["meta" + t[0].toUpperCase() + t.slice(1)]);
  atual.status = metaContagem >= num(cfg.metaContagem) && assertividade >= num(cfg.metaAssertividade) && tetoGasto <= 100 && ocOk;
  const nomes = new Map((materiais || []).map((m: any) => [m.id, m]));
  const divergencias = fin.filter((i: any) => num(i.divergencia) < 0).map((i: any) => {
    const m: any = nomes.get(i.material_id) || {};
    return { data: dataBR(String(i.created_at).slice(0, 10)), codigo: m.codigo || "", item: m.nome || "", descricao: m.nome || "", diferenca: num(i.divergencia),
      quantidadePerdida: Math.abs(num(i.divergencia)), valorPerda: Math.abs(num(i.valor_divergencia)) || r2(Math.abs(num(i.divergencia)) * num(m.valor_unitario)) };
  });
  const perdas = r2(divergencias.reduce((t: number, d: any) => t + d.valorPerda, 0)), ajustado = r2(gasto + perdas), economia = r2(Math.max(0, teto - ajustado));
  const pct = num(cfg.percentualBonus);
  const bonusAlmoxarifado = { ok: true, status: !teto ? "SEM_TETO" : atual.status ? "OK" : "META_NAO_ATINGIDA", tetoTotal: r2(teto), gastoTotal: r2(gasto), valorPerdas: perdas,
    gastoAjustado: ajustado, economiaValida: economia, percentualBonus: pct, valorBonus: atual.status ? r2(economia * pct / 100) : 0,
    mensagem: !teto ? "Sem teto de gastos para o mês (Parâmetros › Almoxarifado)." : atual.status ? "" : "Meta do almoxarifado não atingida no mês." };
  return { atual, historico: [], divergencias, bonusAlmoxarifado };
}


/* ---------------- Mural da Início (avisos, aniversários, reconhecimentos, metas por setor) ---------------- */
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
async function assinarFotoFuncionario(emp: string, f: any) {
  let foto = f.foto_url || "";
  if (foto && !/^https?:\/\//i.test(foto)) {
    if (!foto.startsWith(emp + "/")) foto = "";
    else { const { data } = await admin.storage.from("funcionarios-fotos").createSignedUrl(foto, 3600); foto = data?.signedUrl || ""; }
  }
  return foto || `${URL_SB}/storage/v1/object/public/avatares/${emp}/${f.id}.jpg`;
}
async function perfisMensagens(emp: string, mensagens: any[]) {
  const ids = [...new Set(mensagens.map((m) => m.autorId).filter(Boolean))];
  if (!ids.length) return;
  const funcs = await sel(admin.from("funcionarios_acesso").select("id,nome,foto_url").in("id", ids));
  const users = await sel(admin.from("usuarios").select("id,nome").in("id", ids));
  for (const m of mensagens) {
    const f = (funcs || []).find((x: any) => x.id === m.autorId);
    const nome = f?.nome || (users || []).find((u: any) => u.id === m.autorId)?.nome;
    if (nome) m.autor = nome;
    m.foto = f ? await assinarFotoFuncionario(emp, f) : (m.foto || `${URL_SB}/storage/v1/object/public/avatares/${emp}/${m.autorId}.jpg`);
  }
}
async function colaboradoresMural(emp: string) {
  const pessoas = await sel(admin.from("funcionarios_acesso").select("id,nome,setor,data_admissao,dados_rh,foto_url").eq("empresa_id", emp).eq("ativo", true));
  const lista = [];
  for (const f of pessoas || []) {
    const nasc = String(f.dados_rh?.data_nascimento || "");
    lista.push({ id: f.id, nome: f.nome, setor: f.setor, admissao: f.data_admissao || "", foto_url: f.foto_url,
      aniversario: /^\d{4}-\d{2}-\d{2}$/.test(nasc) ? nasc.slice(8, 10) + "/" + nasc.slice(5, 7) : (f.dados_rh?.aniversario_legado || ""),
      foto: !f.foto_url ? "" : /^https?:\/\//i.test(f.foto_url) ? f.foto_url : `${URL_SB}/storage/v1/object/public/avatares/${emp}/${f.id}.jpg` });
  }
  return lista;
}
const mapaRecado = (r: any) => ({ autorId: r.autor_id, autor: r.autor, texto: r.texto, data: dataHoraBR(r.criado_em), foto: r.foto || "" });
async function recados(emp: string, destinatario?: string) {
  let q = admin.from("portal_parabens").select("*").eq("empresa_id", emp).eq("mes", mesHoje()).order("criado_em", { ascending: false }).limit(destinatario ? 30 : 40);
  if (destinatario) q = q.eq("destinatario", destinatario);
  const lista = (await sel(q) || []).map(mapaRecado);
  await perfisMensagens(emp, lista);
  return lista;
}
async function metasSetoresPortal(ctx: any, pessoas: any[]) {
  const mes = mesHoje(), setores: Record<string, any> = {}, avisos: string[] = [];
  const cad = (nome: any) => { const k = texto(nome); if (!k) return null; return setores[k] = setores[k] || { setor: String(nome).trim(), status: null, indicadores: [], motivo: "Sem meta cadastrada" }; };
  const ind = (nome: string, real: any, meta: any, unidade: string, menor = false, estrito = false) => {
    const r = Number(real), m = Number(meta);
    return !isFinite(r) || !isFinite(m) ? { nome, real: null, meta, unidade, atingiu: null } : { nome, real: r, meta: m, unidade, atingiu: menor ? (estrito ? r < m : r <= m) : r >= m };
  };
  pessoas.forEach((f) => cad(f.setor));
  try {
    (await statusSetores(ctx, mes)).forEach((r: any) => {
      const s = cad(r.setor);
      [["Produção", r.producao, r.metaProducao, "itens", false], ["Qualidade", r.qualidade, r.metaQualidade, "%", false], ["Prazo", r.prazo, r.metaPrazo, "%", false], ["Tempo", r.tempo, r.metaTempo, "dias", true]]
        .forEach((i: any) => { if (num(i[2]) > 0) s.indicadores.push(ind(i[0], i[1], i[2], i[3], i[4])); });
      if (s.indicadores.length) { s.indicadores.push(ind("Uso do teto de gastos", r.gasto, r.metaGasto, "%", true, true)); s.status = r.status === true; s.motivo = ""; }
    });
  } catch (_) { avisos.push("Resultados operacionais indisponíveis no momento."); }
  const almox = cad("Almoxarifado");
  try {
    const r = (await metasAlmox(ctx, mes)).atual, cfg = ctx.cfg.almoxarifado;
    almox.indicadores = [ind("Contagem", r.metaContagem, num(cfg.metaContagem), "%"), ind("Assertividade", r.assertividade, num(cfg.metaAssertividade), "%"), ind("Uso do teto de gastos", r.tetoGasto, 100, "%", true)];
    almox.status = r.status === true; almox.motivo = "";
  } catch (_) { almox.motivo = "Resultados indisponíveis"; }
  // Conquistas: só os meses já fechados na Central (o retrato do fechamento; recalcular mudaria o passado).
  const ano = mes.slice(0, 4), porSetor: Record<string, Record<string, any>> = {};
  for (const f of await fechamentos(ctx)) {
    if (f.mes.slice(0, 4) !== ano || f.mes > mes) continue;
    [...(f.dados.funcionariosEstofados || []), ...(f.dados.funcionariosEstrutura || [])].forEach((x: any) => {
      const k = texto(x.setor); if (!k) return;
      const m = porSetor[k] = porSetor[k] || {};
      m[f.mes] = m[f.mes] === undefined ? x.setorAtingiuMeta === true : (m[f.mes] === (x.setorAtingiuMeta === true) ? m[f.mes] : null);
    });
  }
  Object.keys(setores).forEach((k) => {
    const s = setores[k], h = porSetor[k] || {};
    s.historicoDisponivel = true;
    s.historico = Object.keys(h).sort().map((m) => ({ mes: m, status: h[m] }));
    s.trofeusAno = s.historico.filter((x: any) => x.status === true).length;
  });
  const itens = await sel(admin.from("central_premiacoes").select("mes,nome,descricao,foto_entrega_url").eq("empresa_id", ctx.emp).lte("mes", mes).not("foto_entrega_url", "is", null).order("mes", { ascending: false }));
  const fotos = new Map();
  (itens || []).forEach((i: any) => {
    if (!fotos.has(i.foto_entrega_url)) fotos.set(i.foto_entrega_url, { foto: i.foto_entrega_url, mes: i.mes, nomes: new Set(), titulos: new Set() });
    const f = fotos.get(i.foto_entrega_url); if (i.nome) f.nomes.add(i.nome); if (i.descricao) f.titulos.add(i.descricao);
  });
  const grupos = new Map();
  for (const f of pessoas.filter((p) => String(p.setor || "").trim() && String(p.nome || "").trim())) {
    const k = texto(f.setor);
    if (!grupos.has(k)) grupos.set(k, { setor: f.setor.trim(), equipe: [] });
    grupos.get(k).equipe.push({ id: f.id, nome: f.nome.trim(), foto: await assinarFotoFuncionario(ctx.emp, f) });
  }
  return { mes, ano: Number(ano), atualizadoEm: new Date().toISOString(), setores: Object.values(setores).sort((a: any, b: any) => a.setor.localeCompare(b.setor)),
    premiacoes: { itens: [...fotos.values()].slice(0, 24).map((i: any) => ({ nome: [...i.nomes].join(" · "), titulo: [...i.titulos].join(" · "), foto: i.foto, mes: i.mes })), indisponivel: false },
    avisos, equipes: [...grupos.values()].map((g: any) => ({ ...g, equipe: g.equipe.sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")) })) };
}
async function muralDados(ctx: any) {
  const hoje = hojeISO(), mesAtual = hoje.slice(5, 7), dia = hoje.slice(8, 10);
  const pessoas = await colaboradoresMural(ctx.emp);
  const avisos = ((await sel(admin.from("portal_avisos").select("*").eq("empresa_id", ctx.emp))) || [])
    .map((a: any) => ({ id: a.id, titulo: a.titulo, texto: a.texto, prioridade: a.prioridade, fixado: a.fixado, validoAte: a.valido_ate || "", publicadoEm: dataHoraBR(a.publicado_em), _em: a.publicado_em, cor: a.cor }))
    .filter((a: any) => !a.validoAte || a.validoAte >= hoje)
    .sort((a: any, b: any) => (a.fixado !== b.fixado ? (a.fixado ? -1 : 1) : a.prioridade !== b.prioridade ? (a.prioridade === "IMPORTANTE" ? -1 : 1) : String(b._em).localeCompare(String(a._em))))
    .map(({ _em, ...a }: any) => a);
  const aniversariantes = [];
  for (const c of pessoas.filter((c: any) => String(c.aniversario).slice(3, 5) === mesAtual)) {
    aniversariantes.push({ id: c.id, mensagens: await recados(ctx.emp, c.id), nome: c.nome, setor: c.setor, foto: c.foto, dia: String(c.aniversario).slice(0, 2), hoje: String(c.aniversario).slice(0, 2) === dia });
  }
  aniversariantes.sort((a, b) => a.dia.localeCompare(b.dia));
  const limite = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const novos = pessoas.filter((c: any) => c.admissao && c.admissao >= limite && c.admissao <= hoje).map((c: any) => ({ nome: c.nome, setor: c.setor, foto: c.foto, admissao: c.admissao }));
  const limite12 = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 7);
  const prem = await sel(admin.from("central_premiacoes").select("nome,descricao,mes,data_compra,foto_url,foto_entrega_url").eq("empresa_id", ctx.emp).gte("mes", limite12));
  const reconhecimentos: any[] = [];
  (prem || []).forEach((p: any) => {
    const foto = p.foto_entrega_url || p.foto_url; if (!p.nome || !foto) return;
    const data = p.data_compra || p.mes + "-01", igual = reconhecimentos.find((x) => x.foto === foto || (texto(x.nome) === texto(p.nome) && String(x.data).slice(0, 7) === data.slice(0, 7)));
    if (igual) { if (p.descricao && !igual.titulo.split(" · ").includes(p.descricao)) igual.titulo = igual.titulo ? igual.titulo + " · " + p.descricao : p.descricao; if (data > igual.data) igual.data = data; }
    else reconhecimentos.push({ nome: p.nome, titulo: p.descricao || "", texto: "", data, foto, origem: "Central de Metas" });
  });
  reconhecimentos.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  let metasSetores = null;
  try { metasSetores = await metasSetoresPortal(ctx, pessoas); } catch (e) { console.error("metas por setor", e); }
  return { hoje, avisos, aniversariantes, parabensTodos: aniversariantes.length ? await recados(ctx.emp) : [], novos, reconhecimentos: reconhecimentos.slice(0, 24),
    numeros: null, resumoDia: null, metasSetores };
}
const CORES = ["neutro", "areia", "verde", "azul", "lavanda"];
const FUNCOES_MURAL: Record<string, (ctx: any, a: any[]) => Promise<any>> = {
  muralDados: async (ctx) => muralDados(ctx),
  muralPublicarAviso: async (ctx, [dados]) => {
    const d = dados || {}, titulo = String(d.titulo || "").trim(), corpo = String(d.texto || "").trim();
    if (!titulo || !corpo || titulo.length > 120 || corpo.length > 1200) throw new Error("Informe título (até 120 caracteres) e texto (até 1200 caracteres).");
    const validade = String(d.validoAte || ""); if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error("Validade inválida.");
    await sel(admin.from("portal_avisos").insert({ id: "AVI_" + crypto.randomUUID().slice(0, 8), empresa_id: ctx.emp, titulo, texto: corpo, prioridade: d.importante ? "IMPORTANTE" : "INFO",
      fixado: !!d.fixado, valido_ate: validade || null, autor: await nomeUsuario(ctx), autor_id: ctx.user.id, cor: CORES.includes(d.cor) ? d.cor : "neutro" }));
    return { ok: true };
  },
  muralCorAviso: async (ctx, [dados]) => {
    if (!dados || !CORES.includes(dados.cor)) throw new Error("Cor inválida.");
    const r = await sel(admin.from("portal_avisos").update({ cor: dados.cor }).eq("empresa_id", ctx.emp).eq("id", String(dados.id || "")).select("id"));
    if (!r?.length) throw new Error("Aviso não encontrado.");
    return { ok: true };
  },
  muralParabens: async (ctx, [destinatario, textoRecado]) => {
    const t = String(textoRecado || "").trim(); if (!t || t.length > 300) throw new Error("Escreva uma mensagem de até 300 caracteres.");
    const id = String(destinatario || ""), mes = hojeISO().slice(5, 7);
    const ok = (await colaboradoresMural(ctx.emp)).some((c: any) => String(c.aniversario).slice(3, 5) === mes && (id === "todos" || c.id === id));
    if (!ok) throw new Error("Aniversariante indisponível.");
    await sel(admin.from("portal_parabens").insert({ empresa_id: ctx.emp, destinatario: id, mes: mesHoje(), autor_id: ctx.user.id, autor: await nomeUsuario(ctx), texto: t }));
    return id === "todos" ? recados(ctx.emp) : recados(ctx.emp, id);
  },
};


/* ---------------- roteador ---------------- */
type Ctx = { emp: string; user?: any; cfg?: any; comoUsuario?: any; podeAdmin?: boolean; pode: (k: string) => Promise<boolean> };
const FUNCOES: Record<string, (ctx: Ctx, a: any[]) => Promise<any>> = {
  centralEntrar: async () => ({ ok: true, chave: "acervo" }),
  // Parâmetros > Recursos humanos > Central de Metas (comissões, metas do RH e do almoxarifado).
  centralConfigObter: async (ctx) => ({ comissoes: ctx.cfg.comissoes, metasRH: ctx.cfg.metasRH, almoxarifado: ctx.cfg.almoxarifado, setores: SETORES }),
  centralConfigSalvar: async (ctx, [novo]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const n = novo || {}, pct = (v: any) => { const x = Number(String(v ?? "").replace(",", ".")); if (!isFinite(x) || x < 0 || x > 100) throw new Error("Use percentuais entre 0 e 100."); return r2(x); };
    const os: Record<string, number> = {}; SETORES.forEach((s) => os[s] = pct(n.comissoes?.os?.[s] ?? 0));
    const metasRH: any = {}; TIPOS_RH.forEach((t) => { const x = Number(n.metasRH?.[t] ?? 0); if (!isFinite(x) || x < 0) throw new Error("Meta do RH inválida."); metasRH[t] = Math.round(x); });
    const parte = { comissoes: { estofados: pct(n.comissoes?.estofados), pintura: pct(n.comissoes?.pintura), supervisao: pct(n.comissoes?.supervisao), os }, metasRH,
      almoxarifado: { metaContagem: pct(n.almoxarifado?.metaContagem ?? 100), metaAssertividade: pct(n.almoxarifado?.metaAssertividade ?? 85), percentualBonus: pct(n.almoxarifado?.percentualBonus) } };
    await gravarConfig(ctx, parte);
    return { ok: true, ...parte, setores: SETORES };
  },
  getMetasConfiguradas: async (ctx, [mes]) => metasDoMes(ctx, validarMes(mes || mesHoje())),
  salvarMetasEmLote: async (ctx, [mes, dados]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const n = Number(validarMes(mes).split("-")[1]), lista = Array.isArray(dados) ? dados : [];
    const linhas = lista.filter((d: any) => SETORES.some((s) => setorChave(s) === setorChave(d.setor))).map((d: any) => ({
      empresa_id: ctx.emp, mes: n, setor: SETORES.find((s) => setorChave(s) === setorChave(d.setor)), producao: d.producao === "" ? null : num(d.producao),
      tempo: d.tempo === "" ? null : num(d.tempo), qualidade: d.qualidade === "" ? null : num(d.qualidade), prazo: d.prazo === "" ? null : num(d.prazo), atualizado_em: new Date().toISOString() }));
    if (linhas.length) await sel(admin.from("central_metas").upsert(linhas));
    if (lista[0]) { const rh: any = {}; TIPOS_RH.forEach((t) => rh[t] = num(lista[0][t])); await gravarConfig(ctx, { metasRH: rh }); }
    return { ok: true };
  },
  calcularStatusSetores: async (ctx, [mes]) => statusSetores(ctx, validarMes(mes || mesHoje())),
  getAvaliacaoIndividualRH: async (ctx, [mes, extras]) => avaliacaoRH(ctx, validarMes(mes || mesHoje()), extras),
  listarEventosMes: async (ctx, [mes]) => (await eventosMes(ctx, validarMes(mes || mesHoje()))).map(({ pedidoId, complexidade, scores, ...e }: any) => e),
  listarOSMes: async (ctx, [mes]) => listarOS(ctx, validarMes(mes || mesHoje())),
  listarFuncionariosDistribuicaoCentral: async (ctx, [mes]) => { const { _pessoas, ...r } = await distribuicao(ctx, validarMes(mes || mesHoje())); return r; },
  getPercentualSupervisorComissaoCentral: async (ctx) => supervisor(ctx),
  getMetasAlmoxarifadoCentral: async (ctx, [mes]) => metasAlmox(ctx, validarMes(mes || mesHoje())),
  fechamentoCentralObter: async (ctx, [mes]) => {
    const m = validarMes(mes), l = await sel(admin.from("central_fechamentos").select("*").eq("empresa_id", ctx.emp).eq("mes", m).maybeSingle());
    return l ? retornoFechamento(l) : { ok: true, fechado: false, mes: m };
  },
  fechamentoCentralSalvar: async (ctx, [mes]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const m = validarMes(mes, true);
    const existe = await sel(admin.from("central_fechamentos").select("id").eq("empresa_id", ctx.emp).eq("mes", m).maybeSingle());
    if (existe) throw new Error("Este mês já foi fechado.");
    const dados = await snapshot(ctx, m), nome = await nomeUsuario(ctx);
    const id = `FC-${m}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const l = await sel(admin.from("central_fechamentos").insert({ id, empresa_id: ctx.emp, mes: m, fechado_por: nome, fechado_por_id: ctx.user.id, dados }).select().single());
    return retornoFechamento(l);
  },
  pagamentosBonusCentralObter: async (ctx, [ano]) => pagamentos(ctx, ano),
  pagamentosBonusCentralValidarSenha: async () => ({ ok: true }),
  pagamentosBonusCentralSalvar: async (ctx, [lancamentos, _senha, ano]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    if (!Array.isArray(lancamentos) || !lancamentos.length) throw new Error("Nenhum valor alterado para salvar.");
    const validos: Record<string, string> = {};
    for (const f of await fechamentos(ctx)) {
      const d = f.dados || {};
      if (d.supervisorId || d.nomeSupervisor) validos[f.mes + "|SUP:" + (d.supervisorId || texto(d.nomeSupervisor))] = d.nomeSupervisor;
      [...(d.funcionariosEstofados || []), ...(d.funcionariosEstrutura || [])].forEach((x: any) => validos[f.mes + "|" + x.chave] = x.nome);
    }
    for (const l of lancamentos) {
      const mes = validarMes(l?.mes), chave = String(l?.chave || "").trim(), nome = validos[mes + "|" + chave];
      if (!nome) throw new Error("Pessoa não encontrada no fechamento de " + mes + ". Atualize o painel e tente novamente.");
      const bruto = l.valorPago;
      if (bruto === null || bruto === undefined || String(bruto).trim() === "") { await sel(admin.from("central_pagamentos").delete().eq("empresa_id", ctx.emp).eq("mes", mes).eq("chave", chave)); continue; }
      const v = Number(bruto); if (!isFinite(v) || v < 0) throw new Error("Valor pago inválido para " + nome + " em " + mes + ".");
      await sel(admin.from("central_pagamentos").upsert({ empresa_id: ctx.emp, mes, chave, valor_pago: r2(v), atualizado_em: new Date().toISOString(), atualizado_por: ctx.user.id }));
    }
    return pagamentos(ctx, ano);
  },
  premiacoesObter: async (ctx, [ano]) => premiacoes(ctx, ano),
  premiacoesValidarSenha: async () => ({ ok: true }),
  premiacoesSalvarItem: async (ctx, [item]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const d = item || {}, mes = String(d.mes || "").trim();
    if (!/^\d{4}-\d{2}$/.test(mes) || !ehMesPremiacao(mes)) throw new Error("Escolha um mês de premiação.");
    if (!await sel(admin.from("central_fechamentos").select("id").eq("empresa_id", ctx.emp).eq("mes", mes).maybeSingle())) throw new Error("Este mês ainda não foi fechado.");
    const chave = String(d.chave || "").trim(); if (!chave) throw new Error("Pessoa não informada.");
    const descricao = String(d.descricao || "").trim(); if (!descricao) throw new Error("Descreva o que foi comprado.");
    const valor = Number(d.valor); if (!isFinite(valor) || valor < 0) throw new Error("Valor inválido.");
    const dataCompra = String(d.dataCompra || "").trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCompra)) throw new Error("Informe a data da compra.");
    let atual: any = null;
    if (d.id) { atual = await sel(admin.from("central_premiacoes").select("*").eq("empresa_id", ctx.emp).eq("id", d.id).maybeSingle()); if (!atual) throw new Error("Item não encontrado. Recarregue a página."); }
    const foto = (await enviarFoto(ctx, d.foto, mes)) || atual?.foto_url || null, fotoEntrega = (await enviarFoto(ctx, d.fotoEntrega, mes)) || atual?.foto_entrega_url || null;
    if (atual && atual.foto_url && atual.foto_url !== foto) await apagarFoto(atual.foto_url);
    if (atual && atual.foto_entrega_url && atual.foto_entrega_url !== fotoEntrega) await apagarFoto(atual.foto_entrega_url);
    const id = d.id || "PR-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await sel(admin.from("central_premiacoes").upsert({ id, empresa_id: ctx.emp, mes, chave, nome: String(d.nome || "").trim(), descricao, valor: r2(valor),
      foto_url: foto, foto_entrega_url: fotoEntrega, link: String(d.link || "").trim() || null, data_compra: dataCompra, atualizado_em: new Date().toISOString() }));
    return { ok: true, id };
  },
  premiacoesExcluirItem: async (ctx, [id]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const atual = await sel(admin.from("central_premiacoes").select("*").eq("empresa_id", ctx.emp).eq("id", String(id || "")).maybeSingle());
    if (!atual) throw new Error("Item não encontrado.");
    await sel(admin.from("central_premiacoes").delete().eq("id", atual.id));
    await apagarFoto(atual.foto_url); await apagarFoto(atual.foto_entrega_url);
    return { ok: true };
  },
  appEquipeListar: async (ctx) => ({ ok: true, link: "", pessoas: (await funcionarios(ctx.emp)).map((f: any) => ({ id: f.id, chave: "RH:" + f.id, nome: f.nome, setor: f.setor, cargo: f.cargo,
    grupo: f.equipe ? "OPERACOES" : /costura|forracao|estofados/.test(texto(f.setor)) ? "ESTOFADOS" : "ESTRUTURA", cpf: "", precisaCpf: false, temPin: f.temPin, fotoId: "", fotoUrl: f.fotoUrl })) }),
  operacaoObterParametros: async (ctx) => ctx.cfg.operacao,
  operacaoSalvarParametros: async (ctx, [novos]) => {
    await exigir(ctx, "rh.colaboradores.editar");
    const a = ctx.cfg.operacao, n = novos || {};
    const lim = (v: any, mi: number, ma: number, pd: number) => { const x = Number(String(v ?? "").replace(",", ".")); return isFinite(x) ? Math.min(ma, Math.max(mi, x)) : pd; };
    const metas = (v: any, pd: any[]) => (Array.isArray(v) ? v : pd).map((m: any) => ({ nome: String(m?.nome || "").trim().slice(0, 80), meta: lim(m?.meta, 0, 100000, 0) })).filter((m: any) => m.nome).slice(0, 20);
    const p: any = { ...a, descontoPercentual: lim(n.descontoPercentual, 0, 100, a.descontoPercentual), tetoDescontoItem: lim(n.tetoDescontoItem, 0, 1e6, a.tetoDescontoItem),
      tetoSalario: lim(n.tetoSalario, 0, 100, a.tetoSalario), metasCarregamento: metas(n.metasCarregamento, a.metasCarregamento), percentual: {}, scorePadrao: {},
      indicativos: { internos: metas(n.indicativos?.internos, a.indicativos.internos), externos: metas(n.indicativos?.externos, a.indicativos.externos) },
      metaSemUniforme: lim(n.metaSemUniforme, 0, 1000, num(a.metaSemUniforme)), metaAtraso: lim(n.metaAtraso, 0, 1000, num(a.metaAtraso)) };
    OPERACAO_EQUIPES.forEach((e) => { p.percentual[e.chave] = lim(n.percentual?.[e.chave], 0, 100, a.percentual[e.chave]); p.scorePadrao[e.chave] = lim(n.scorePadrao?.[e.chave], 0, 100, a.scorePadrao[e.chave]); });
    await gravarConfig(ctx, { operacao: p });
    return p;
  },
  operacaoCalcularMes: async (ctx, [mes]) => operacaoMes(ctx, /^\d{4}-\d{2}$/.test(String(mes || "")) ? mes : mesHoje()),
  operacaoCalcularExemplo: async (ctx) => operacaoExemplo(ctx.cfg),
  danoCienciaFuncionarios: async (ctx, [equipe]) => {
    const k = texto(equipe); if (!["triagem", "carregamento", "montagem", "producao"].includes(k)) throw new Error("Equipe inválida");
    return (await funcionarios(ctx.emp)).filter((f: any) => f.equipe === k).map((f: any) => ({ id: f.id, nome: f.nome, temPin: f.temPin }));
  },
  danoCienciaResponder: async (ctx, [id, funcionarioId, pin, acao, justificativa, assinaturaVista]) => {
    if (!["confirmar", "contestar"].includes(acao)) throw new Error("Ação inválida");
    const dano = await acharDano(ctx, id);
    if (!assinaturaVista || assinaturaVista !== dano.ciencia.assinatura) throw new Error("Os dados deste dano foram alterados. Atualize a tabela e confira novamente antes de confirmar.");
    if (!dano.ciencia.equipe) throw new Error("Registro anterior à confirmação de ciência");
    return rpc("rh_dano_ciencia_salvar", { p_empresa: ctx.emp, p_ator: ctx.user.id, p_dados: { id: dano.id, equipe: dano.ciencia.equipe, assinatura: dano.ciencia.assinatura, funcionario_id: funcionarioId, pin: String(pin || ""), acao, justificativa: String(justificativa || "") } });
  },
  danoCienciaRevisar: async (ctx, [id, equipe, justificativa]) => {
    if (!await ctx.pode("configuracoes.permissoes.editar")) throw new Error("A revisão da atribuição deve ser feita por um administrador.");
    const k = texto(equipe); if (!["triagem", "carregamento", "montagem", "producao"].includes(k) || String(justificativa || "").trim().length < 5) throw new Error("Escolha a equipe e explique a revisão.");
    const dano = await acharDano(ctx, id);
    return rpc("rh_dano_ciencia_salvar", { p_empresa: ctx.emp, p_ator: ctx.user.id, p_dados: { id: dano.id, equipe: k, assinatura: dano.ciencia.assinatura || "revisado", acao: "reabrir", justificativa: String(justificativa) } });
  },
};
async function acharDano(ctx: any, id: any) {
  const r = await sel(admin.from("acervo_retornos").select("criado_em").eq("empresa_id", ctx.emp).eq("id", String(id || "")).maybeSingle());
  if (!r) throw new Error("Dano não encontrado.");
  const dano = (await danosMes(ctx, mesDe(r.criado_em))).find((d: any) => d.id === String(id));
  if (!dano) throw new Error("Dano não encontrado.");
  return dano;
}
async function exigir(ctx: Ctx, chave: string) { if (!await ctx.pode(chave)) throw new Error("Você não tem permissão para alterar a Central de Metas."); }
async function nomeUsuario(ctx: any) {
  const f = await sel(admin.from("funcionarios_acesso").select("nome").eq("id", ctx.user.id).maybeSingle());
  if (f?.nome) return f.nome;
  const u = await sel(admin.from("usuarios").select("nome").eq("id", ctx.user.id).maybeSingle()).catch(() => null);
  return u?.nome || ctx.user.email || "";
}
// Funções que os apps de campo chamam sem o login do sistema (sessão própria do Meu Bônus / App do Montador).
const PUBLICAS: Record<string, (a: any[]) => Promise<any>> = {
  equipeEntrar: async ([cpfInformado, pinInformado]) => {
    const cpf = String(cpfInformado || "").replace(/\D/g, ""), pin = String(pinInformado || "").replace(/\D/g, "");
    if (cpf.length !== 11) throw new Error("Digite o CPF completo (11 números).");
    if (pin.length !== 4) throw new Error("O PIN tem 4 números.");
    let f = await rpc("rh_equipe_cadastro", { p_cpf: await indice(cpf, "cpf") });
    if (!f) f = await rpc("rh_equipe_cadastro", { p_cpf: cpf });
    const ok = f && await rpc("rh_pin_conferir", { p_empresa: f.empresa_id, p_funcionario: f.id, p_pin: pin });
    if (!ok) { await new Promise((r) => setTimeout(r, 800)); throw new Error(f ? "PIN incorreto." : "CPF ou PIN incorreto. Se ainda não tem PIN, peça ao seu gestor."); }
    const s = await rpc("central_equipe_sessao", { p_empresa: f.empresa_id, p_funcionario: f.id });
    return { ok: true, token: s.token };
  },
  equipeSair: async ([token]) => { if (token) await rpc("central_equipe_sair", { p_token: String(token) }).catch(() => {}); return { ok: true }; },
  equipeExtrato: async ([token]) => extratoPorToken(token),
  equipeExtratoMontador: async ([token]) => extratoPorToken(token),
};
async function extratoPorToken(token: any) {
  let s;
  try { s = await rpc("central_sessao_funcionario", { p_token: String(token || "") }); } catch (e) { throw new Error(/SESSAO_EXPIRADA/.test(String(e)) ? "SESSAO_EXPIRADA" : String(e instanceof Error ? e.message : e)); }
  return extrato({ emp: s.empresa_id }, s.funcionario_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const fn = String(body.fn || ""), args = Array.isArray(body.args) ? body.args : [];
    if (PUBLICAS[fn]) return responder({ resultado: await PUBLICAS[fn](args) });
    const mural = FUNCOES_MURAL[fn], f = FUNCOES[fn] || mural;
    if (!f) return responder({ error: "Função não encontrada: " + fn }, 404);
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return responder({ error: "Entre no sistema para usar esta tela." }, 401);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return responder({ error: "Entre no sistema para usar esta tela." }, 401);
    if (await segundaEtapaPendente(authorization)) return responder({ error: MENSAGEM_2FA }, 403);
    let emp = String(body.empresa_id || "");
    const vinculos = await sel(admin.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id));
    if (!emp) emp = vinculos?.[0]?.empresa_id || "";
    if (!emp || !(vinculos || []).some((v: any) => v.empresa_id === emp)) return responder({ error: "Sem acesso a esta empresa." }, 403);
    const pode = async (chave: string) => (await rpc("funcionario_pode", { p_empresa: emp, p_usuario: user.id, p_chave: chave })) === true;
    // O mural e a ciência de danos são da equipe toda (quem é da empresa); o resto da Central exige o RH.
    const ver = mural || fn.startsWith("danoCiencia") ? true : await pode("rh.colaboradores.visualizar");
    if (!ver) return responder({ error: "Sem permissão para a Central de Metas." }, 403);
    const comoUsuario = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const ctx: Ctx = { emp, user, pode, comoUsuario, cfg: await lerConfig(emp) };
    ctx.podeAdmin = await pode("configuracoes.permissoes.editar");
    return responder({ resultado: await f(ctx, args) });
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
