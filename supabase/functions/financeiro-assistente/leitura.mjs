// Leitura de extratos bancários (sem IA): aplica o MODELO de um banco a uma grade de células.
// Usado pela Edge Function financeiro-assistente e pelos testes (node --test tests/fin-assistente-leitura.test.mjs).
// O modelo é aprendido pela IA uma vez por banco (cabeçalho) e depois a leitura é sempre esta, fixa e previsível.

export const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normal = (s) => semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();

// "1.234,56" | "1,234.56" | "-320,00" | "(320,00)" | "320,00 D" | 1234.56 → número (null se não for valor)
export function lerNumero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ""); }
  if (/\s[dD]$/.test(s)) { neg = true; s = s.replace(/\s[dD]$/, ""); }
  s = s.replace(/\s[cC]$/, "");
  s = s.replace(/r\$|\s| /gi, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const ponto = s.lastIndexOf("."), virg = s.lastIndexOf(",");
  if (ponto >= 0 && virg >= 0) {
    s = virg > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virg >= 0) {
    s = (s.match(/,/g).length === 1) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const dois = (n) => String(n).padStart(2, "0");
function dataValida(a, m, d) {
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(Date.UTC(a, m - 1, d));
  if (x.getUTCMonth() !== m - 1) return null;
  return `${a}-${dois(m)}-${dois(d)}`;
}
// Texto/número de data → "AAAA-MM-DD" (null se não for data). formato: "dmy" (padrão) ou "mdy".
export function lerData(v, formato = "dmy") {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) { // número de série do Excel
      const x = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return dataValida(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\D|$)/);
  if (m) {
    let a = +m[3]; if (a < 100) a += 2000;
    return formato === "mdy" ? dataValida(a, +m[1], +m[2]) : dataValida(a, +m[2], +m[1]);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX / AAAAMMDD
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  return null;
}

const texto = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const col = (linha, i) => (Number.isInteger(i) && i >= 0 ? linha[i] : undefined);

// Assinatura do layout: a linha de cabeçalho (a primeira com 3+ textos e nenhuma data) + nº de colunas.
export function assinaturaGrade(grade) {
  const topo = grade.slice(0, 40);
  let cab = null;
  for (const l of topo) {
    const cel = l.map(texto).filter(Boolean);
    if (cel.length >= 3 && !cel.some((c) => lerData(c)) && cel.filter((c) => lerNumero(c) == null).length >= 3) { cab = cel; break; }
  }
  const largura = Math.max(0, ...topo.map((l) => l.length));
  return normal((cab || ["sem-cabecalho"]).join("|")).replace(/[^a-z0-9|]/g, "").slice(0, 240) + "#" + largura;
}

export function hashCurto(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Aplica o modelo e devolve os lançamentos. Modelo:
// { linha_cabecalho (1 = primeira linha da grade; 0 = sem cabeçalho), linha_inicio, colunas:{data,descricao,valor,credito,debito,tipo_dc,documento,contraparte,contraparte_doc,saldo},
//   descricao_extra:[índices], formato_valor:"sinal"|"credito_debito"|"valor_dc", saida_dc:["D",…], formato_data:"dmy"|"mdy",
//   palavras_pular:["SALDO",…], inverter_sinal:false }
export function aplicarModelo(grade, modelo) {
  const c = modelo?.colunas || {};
  const pular = (modelo?.palavras_pular || []).map(normal).filter(Boolean);
  const saidaDc = (modelo?.saida_dc?.length ? modelo.saida_dc : ["d", "debito", "deb", "saida", "-"]).map(normal);
  // começa logo depois do CABEÇALHO (fixo em cada banco); a primeira linha de lançamento muda de um extrato para outro
  // (ex.: um tem "SALDO ANTERIOR" antes, o outro não). Sem cabeçalho, usa a linha de início.
  const cab = Number(modelo?.linha_cabecalho) || 0;
  const inicio = cab > 0 ? cab : Math.max(0, (Number(modelo?.linha_inicio) || 1) - 1);
  const out = [];
  let candidatas = 0;
  for (let i = inicio; i < grade.length; i++) {
    const l = grade[i] || [];
    if (!l.some((x) => texto(x))) continue;
    const data = lerData(col(l, c.data), modelo?.formato_data === "mdy" ? "mdy" : "dmy");
    if (!data) continue;
    candidatas++;
    const partes = [texto(col(l, c.descricao)), ...(modelo?.descricao_extra || []).map((k) => texto(col(l, k)))].filter(Boolean);
    const descricao = [...new Set(partes)].join(" · ");
    if (pular.length && pular.some((p) => normal(descricao).startsWith(p) || normal(descricao) === p)) continue;
    let valor = null;
    if (modelo?.formato_valor === "credito_debito") {
      const cr = lerNumero(col(l, c.credito)), db = lerNumero(col(l, c.debito));
      if (cr) valor = Math.abs(cr); else if (db) valor = -Math.abs(db);
    } else if (modelo?.formato_valor === "valor_dc") {
      const v = lerNumero(col(l, c.valor)); const dc = normal(col(l, c.tipo_dc));
      if (v != null) valor = saidaDc.includes(dc) || dc.startsWith("d") ? -Math.abs(v) : Math.abs(v);
    } else {
      valor = lerNumero(col(l, c.valor));
    }
    if (!valor) continue;
    if (modelo?.inverter_sinal) valor = -valor;
    out.push({
      data, valor: Math.round(valor * 100) / 100, descricao: descricao.slice(0, 300),
      documento: texto(col(l, c.documento)).slice(0, 80) || null,
      contraparte: texto(col(l, c.contraparte)).slice(0, 160) || null,
      contraparte_doc: texto(col(l, c.contraparte_doc)).replace(/\D/g, "").slice(0, 20) || null,
      saldo: c.saldo != null && c.saldo >= 0 ? lerNumero(col(l, c.saldo)) : null,
      ordem: i,
    });
  }
  return { linhas: out, candidatas };
}

// Identificador estável de cada lançamento (importar o mesmo extrato de novo não duplica).
export function comFitid(linhas) {
  const vistos = {};
  return linhas.map((l) => {
    const base = l.documento ? `doc-${l.documento}-${l.data}-${l.valor}` : `h-${l.data}-${l.valor}-${hashCurto(normal(l.descricao))}`;
    vistos[base] = (vistos[base] || 0) + 1;
    return { ...l, fitid: vistos[base] > 1 ? `${base}-${vistos[base]}` : base };
  });
}

// Período e saldo final do banco (saldo da última linha em ordem de data).
export function resumoLinhas(linhas) {
  if (!linhas.length) return { periodo_ini: null, periodo_fim: null, saldo_banco: null, saldo_data: null, entradas: 0, saidas: 0 };
  const datas = linhas.map((l) => l.data).sort();
  const crescente = linhas[0].data <= linhas[linhas.length - 1].data;
  const ordenadas = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || (crescente ? a.ordem - b.ordem : b.ordem - a.ordem));
  const ult = [...ordenadas].reverse().find((l) => l.saldo != null);
  return {
    periodo_ini: datas[0], periodo_fim: datas[datas.length - 1],
    saldo_banco: ult ? ult.saldo : null, saldo_data: ult ? ult.data : null,
    entradas: Math.round(linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0) * 100) / 100,
    saidas: Math.round(linhas.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0) * 100) / 100,
  };
}

// ---------------------------------------------------------------- candidatos para cada linha
const PALAVRAS_VAZIAS = new Set(["pix", "ted", "doc", "transf", "transferencia", "recebido", "recebida", "enviado", "enviada", "pagamento", "pgto", "pag", "credito", "debito", "de", "da", "do", "dos", "das", "para", "em", "ltda", "me", "sa", "eireli", "conta", "cc", "boleto", "tarifa", "compra", "cartao"]);
export const palavras = (s) => normal(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p) && !/^\d+$/.test(p));
export function semelhanca(a, b) {
  const pa = new Set(palavras(a)), pb = palavras(b);
  if (!pa.size || !pb.length) return 0;
  const comuns = pb.filter((p) => pa.has(p)).length;
  return comuns / Math.min(pa.size, new Set(pb).size);
}
const diasEntre = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

// títulos: [{tipo:'receber'|'pagar', id, aberto, valor, nome, descricao, vencimento, pedido_numero, conta_id}]
export function candidatosDaLinha(linha, titulos, max = 6) {
  const v = Math.abs(linha.valor), tipo = linha.valor > 0 ? "receber" : "pagar";
  const textoLinha = `${linha.descricao || ""} ${linha.contraparte || ""}`;
  const nums = new Set((textoLinha.match(/\d{1,6}/g) || []));
  return titulos.filter((t) => t.tipo === tipo && t.aberto > 0).map((t) => {
    let p = 0; const motivos = [];
    if (Math.abs(t.aberto - v) < 0.01) { p += 50; motivos.push("valor igual ao em aberto"); }
    else if (Math.abs(t.valor - v) < 0.01) { p += 30; motivos.push("valor igual ao título"); }
    else if (t.aberto > v) { p += 6; motivos.push("pagamento parcial possível"); }
    const sim = Math.max(semelhanca(textoLinha, t.nome || ""), semelhanca(textoLinha, t.descricao || "") * 0.8);
    if (sim > 0) { p += Math.round(sim * 35); if (sim >= 0.5) motivos.push("nome parecido"); }
    if (t.pedido_numero && nums.has(String(t.pedido_numero).replace(/\D/g, ""))) { p += 40; motivos.push("número do pedido na descrição"); }
    const d = diasEntre(linha.data, t.vencimento);
    if (d <= 3) { p += 10; motivos.push("perto do vencimento"); } else if (d <= 20) p += 5;
    if (t.conta_id && t.conta_id === linha.conta_id) p += 4;
    return { t, pontos: p, motivos };
  }).filter((x) => x.pontos >= 20).sort((a, b) => b.pontos - a.pontos).slice(0, max);
}

// Mesma chave de fin_assist_chave() no banco (regras aprendidas).
export const chaveRegra = (s) => normal(s).replace(/[0-9]+/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

// Ordem cronológica (seq) de cada linha, para o saldo do fim do dia: bancos que listam do mais novo para o mais
// antigo têm a ordem dentro do dia invertida.
export function comSeq(linhas) {
  if (!linhas.length) return linhas;
  const crescente = linhas[0].data <= linhas[linhas.length - 1].data;
  const ord = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || (crescente ? a.ordem - b.ordem : b.ordem - a.ordem));
  const seq = new Map(ord.map((l, i) => [l, i]));
  return linhas.map((l) => ({ ...l, seq: seq.get(l) }));
}
