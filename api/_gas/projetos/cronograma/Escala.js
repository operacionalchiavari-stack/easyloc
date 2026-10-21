/****************************************************
 * PAINEL LOGÍSTICO — ESCALA AUTOMÁTICA (out/2026)
 *
 * Monta sozinho, a partir dos parâmetros (Gestão > Parâmetros > Escala),
 * o responsável, a equipe e o caminhão de cada etapa do cronograma:
 *  - pessoas: Cadastro de Funcionários (equipe operacional + líder) e,
 *    se faltar gente, free (primeiro os que confirmaram a vaga da etapa,
 *    depois os aprovados);
 *  - caminhão: o menor que comporta o volume (m³) do pedido; a montagem
 *    usa o caminhão do carregamento e o descarregamento o da desmontagem;
 *  - nunca põe a mesma pessoa ou o mesmo caminhão em horários que se cruzam.
 * Só preenche o que está vazio: o que alguém escolheu nunca é trocado.
 * A logística confere e ajusta no Painel Logístico; o cronograma só mostra.
 * Colunas da aba Cronograma: I caminhão (códigos separados por ","),
 * J responsável, K equipe (nomes separados por "|").
 ****************************************************/

const ESC_PLANILHA = "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";
const ESC_FUSO = "America/Sao_Paulo";
const ESC_COL = { id: 0, pedido: 1, dataEvento: 2, cliente: 3, local: 4, etapa: 5, data: 6, hora: 7, caminhao: 8, responsavel: 9, equipe: 10, obs: 11, pedidoSistema: 17 };

const ESC_PADRAO = {
  deslocamento_h: 1,
  volume_padrao_m3: 10,
  usar_free: true,
  etapas: {
    triagem:         { equipe: "triagem",      caminhao: false, m3_por_pessoa: 20, minimo: 1, maximo: 3, duracao_h: 3 },
    carregamento:    { equipe: "carregamento", caminhao: true,  m3_por_pessoa: 20, minimo: 2, maximo: 4, duracao_h: 2 },
    descarregamento: { equipe: "carregamento", caminhao: true,  m3_por_pessoa: 20, minimo: 2, maximo: 4, duracao_h: 2 },
    montagem:        { equipe: "montagem",     caminhao: true,  m3_por_pessoa: 8,  minimo: 2, maximo: 8, duracao_h: 5 },
    desmontagem:     { equipe: "montagem",     caminhao: true,  m3_por_pessoa: 10, minimo: 2, maximo: 8, duracao_h: 4 }
  }
};

/* ---------- utilitários ---------- */

function ESC_chave_(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/(.)\1+/g, "$1").replace(/\s+/g, " ").trim();
}

function ESC_mesmaPessoa_(a, b) {
  const x = ESC_chave_(a).split(" ").filter(String), y = ESC_chave_(b).split(" ").filter(String);
  if (!x.length || !y.length) return false;
  const menor = x.length <= y.length ? x : y, maior = x.length <= y.length ? y : x;
  return menor.every(function (p, i) { return p === maior[i]; });
}

function ESC_nomes_(texto) {
  return String(texto || "").split("|").map(function (s) { return s.trim(); })
    .filter(function (s) { return s && s !== "-"; });
}

function ESC_caminhoes_(texto) {
  return String(texto || "").split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s && s !== "-"; });
}

function ESC_tipo_(etapa) {
  const e = String(etapa || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (e.indexOf("triagem") >= 0) return "triagem";
  if (e === "carregamento") return "carregamento";
  if (e === "descarregamento") return "descarregamento";
  if (e === "montagem") return "montagem";
  if (e === "desmontagem") return "desmontagem";
  return "";
}

function ESC_dataIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ESC_FUSO, "yyyy-MM-dd");
  const t = String(v || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return m[3] + "-" + m[2] + "-" + m[1];
  return "";
}

function ESC_hora_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ESC_FUSO, "HH:mm");
  const m = String(v || "").replace(/^'/, "").match(/(\d{1,2}):(\d{2})/);
  return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : "";
}

function ESC_somarDias_(iso, dias) {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ESC_minutosAbs_(iso, hora) {
  const dia = Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000);
  const p = (hora || "08:00").split(":");
  return dia * 1440 + Number(p[0]) * 60 + Number(p[1] || 0);
}

function ESC_regras_(base) {
  const r = base && base.escala ? base.escala : {};
  const etapas = {};
  Object.keys(ESC_PADRAO.etapas).forEach(function (k) {
    etapas[k] = Object.assign({}, ESC_PADRAO.etapas[k], (r.etapas || {})[k] || {});
  });
  return Object.assign({}, ESC_PADRAO, r, { etapas: etapas });
}

/* ---------- leitura ---------- */

function ESC_aba_() {
  return SpreadsheetApp.openById(ESC_PLANILHA).getSheetByName("Cronograma");
}

// Etapas do intervalo [ini, fim] (datas ISO), com a linha da planilha
function ESC_lerEtapas_(valores, ini, fim) {
  const lista = [];
  for (let i = 1; i < valores.length; i++) {
    const r = valores[i];
    if (!r[ESC_COL.id] || !r[ESC_COL.etapa]) continue;
    const data = ESC_dataIso_(r[ESC_COL.data]);
    if (!data || data < ini || data > fim) continue;
    lista.push({
      linha: i + 1,
      id: String(r[ESC_COL.id]),
      pedido: String(r[ESC_COL.pedido] || ""),
      cliente: String(r[ESC_COL.cliente] || ""),
      local: String(r[ESC_COL.local] || ""),
      etapa: String(r[ESC_COL.etapa] || ""),
      tipo: ESC_tipo_(r[ESC_COL.etapa]),
      data: data,
      hora: ESC_hora_(r[ESC_COL.hora]),
      caminhoes: ESC_caminhoes_(r[ESC_COL.caminhao]),
      responsavel: String(r[ESC_COL.responsavel] || "").trim() === "-" ? "" : String(r[ESC_COL.responsavel] || "").trim(),
      equipe: ESC_nomes_(r[ESC_COL.equipe]),
      pedidoSistemaId: String(r[ESC_COL.pedidoSistema] || "")
    });
  }
  return lista;
}

function ESC_janela_(et, regras) {
  const conf = regras.etapas[et.tipo];
  const dur = Math.round((conf ? Number(conf.duracao_h) : 3) * 60) || 180;
  const ida = (et.tipo === "montagem" || et.tipo === "desmontagem") ? Math.round(Number(regras.deslocamento_h || 0) * 60) : 0;
  const ini = ESC_minutosAbs_(et.data, et.hora || "08:00");
  return [ini - ida, ini + dur + ida];
}

function ESC_cruza_(a, b) { return a[0] < b[1] && b[0] < a[1]; }

function ESC_free_() {
  const aprovados = [], porEtapa = {};
  try {
    FREE_lerLinhas_("cadastros").linhas.forEach(function (l) {
      if (String(l[8]).toUpperCase() === FREE_CAD_APROVADO && String(l[1] || "").trim()) aprovados.push(String(l[1]).trim());
    });
    const vagas = FREE_lerVagas_(false), etapaDaVaga = {};
    vagas.forEach(function (v) { etapaDaVaga[v.idVaga] = String(v.idEtapa || ""); });
    FREE_lerInscricoes_().forEach(function (ins) {
      if (String(ins.status).toUpperCase() !== FREE_INS_CONFIRMADO) return;
      const etapa = etapaDaVaga[ins.idVaga];
      if (!etapa) return;
      (porEtapa[etapa] = porEtapa[etapa] || []).push(String(ins.nome || "").trim());
    });
  } catch (e) {
    Logger.log("Escala: free indisponíveis: " + e.message);
  }
  return { aprovados: aprovados, porEtapa: porEtapa };
}

/* ---------- regras ---------- */

function ESC_volume_(et, volumes, regras) {
  const v = volumes[et.pedidoSistemaId];
  return v && v.m3 > 0 ? v : { m3: Number(regras.volume_padrao_m3) || 0, pecas: 0, estimado: true };
}

function ESC_sugerido_(et, volumes, regras) {
  const conf = regras.etapas[et.tipo];
  if (!conf) return 0;
  const m3 = ESC_volume_(et, volumes, regras).m3;
  const porPessoa = Math.max(0.5, Number(conf.m3_por_pessoa) || 1);
  return Math.min(Number(conf.maximo) || 99, Math.max(Number(conf.minimo) || 1, Math.ceil(m3 / porPessoa)));
}

// Pessoas da etapa (responsável + equipe)
function ESC_pessoasDa_(et) {
  return (et.responsavel ? [et.responsavel] : []).concat(et.equipe);
}

function ESC_conflitos_(etapas, regras) {
  etapas.forEach(function (e) { e.conflitos = []; e.janela = ESC_janela_(e, regras); });
  for (let i = 0; i < etapas.length; i++) {
    for (let j = i + 1; j < etapas.length; j++) {
      const a = etapas[i], b = etapas[j];
      if (!ESC_cruza_(a.janela, b.janela)) continue;
      ESC_pessoasDa_(a).forEach(function (p) {
        if (ESC_pessoasDa_(b).some(function (q) { return ESC_mesmaPessoa_(p, q); })) {
          a.conflitos.push(p + " também está em " + b.etapa + " do pedido " + b.pedido + " (" + b.hora + ")");
          b.conflitos.push(p + " também está em " + a.etapa + " do pedido " + a.pedido + " (" + a.hora + ")");
        }
      });
      if (a.pedido && a.pedido === b.pedido) continue; // o caminhão segue com o mesmo pedido
      a.caminhoes.forEach(function (c) {
        if (b.caminhoes.some(function (d) { return ESC_chave_(c) === ESC_chave_(d); })) {
          a.conflitos.push("Caminhão " + c + " também está em " + b.etapa + " do pedido " + b.pedido + " (" + b.hora + ")");
          b.conflitos.push("Caminhão " + c + " também está em " + a.etapa + " do pedido " + a.pedido + " (" + a.hora + ")");
        }
      });
    }
  }
}

function ESC_pessoaLivre_(nome, janela, etapas, ignorar) {
  return !etapas.some(function (e) {
    return e !== ignorar && ESC_cruza_(janela, e.janela) && ESC_pessoasDa_(e).some(function (p) { return ESC_mesmaPessoa_(p, nome); });
  });
}

function ESC_caminhaoLivre_(codigo, et, etapas) {
  return !etapas.some(function (e) {
    return e !== et && !(e.pedido && e.pedido === et.pedido) && ESC_cruza_(et.janela, e.janela)
      && e.caminhoes.some(function (c) { return ESC_chave_(c) === ESC_chave_(codigo); });
  });
}

// Horas já escaladas no período, para dividir o trabalho por igual
function ESC_carga_(nome, etapas) {
  return etapas.reduce(function (t, e) {
    return t + (ESC_pessoasDa_(e).some(function (p) { return ESC_mesmaPessoa_(p, nome); }) ? (e.janela[1] - e.janela[0]) : 0);
  }, 0);
}

function ESC_escolher_(candidatos, et, etapas, ja) {
  return candidatos
    .filter(function (n) { return !ja.some(function (j) { return ESC_mesmaPessoa_(j, n); }); })
    .filter(function (n) { return ESC_pessoaLivre_(n, et.janela, etapas, et); })
    .sort(function (a, b) { return ESC_carga_(a, etapas) - ESC_carga_(b, etapas) || a.localeCompare(b); });
}

// Preenche o que está vazio nas etapas "alvo". Devolve as etapas que mudaram.
function ESC_preencher_(alvo, etapas, base, regras, volumes, free, hoje) {
  const mudou = [];
  alvo.slice().sort(function (a, b) { return a.janela[0] - b.janela[0]; }).forEach(function (et) {
    const conf = regras.etapas[et.tipo];
    if (!conf || et.data < hoje) return;
    let alterou = false;
    const fixos = base.pessoas.filter(function (p) { return p.equipe === conf.equipe; });
    const precisa = ESC_sugerido_(et, volumes, regras);

    if (!et.responsavel) {
      const lideres = ESC_escolher_(fixos.filter(function (p) { return p.lider; }).map(function (p) { return p.nome; }), et, etapas, et.equipe);
      if (lideres.length) { et.responsavel = lideres[0]; alterou = true; }
    }

    if (!et.equipe.length) {
      const novos = [];
      const vagas = function () { return precisa - (et.responsavel ? 1 : 0) - novos.length; };
      const adicionar = function (lista) {
        ESC_escolher_(lista, et, etapas, novos.concat(et.responsavel ? [et.responsavel] : [])).forEach(function (n) {
          if (vagas() > 0) novos.push(n);
        });
      };
      adicionar(fixos.filter(function (p) { return !p.lider; }).map(function (p) { return p.nome; }));
      adicionar(fixos.filter(function (p) { return p.lider; }).map(function (p) { return p.nome; }));
      if (regras.usar_free && vagas() > 0) {
        adicionar(free.porEtapa[et.id] || []);
        adicionar(free.aprovados);
      }
      if (novos.length) { et.equipe = novos; alterou = true; }
    }

    if (conf.caminhao && !et.caminhoes.length) {
      const par = et.tipo === "montagem" ? "carregamento" : et.tipo === "descarregamento" ? "desmontagem" : "";
      const doPar = par ? etapas.filter(function (e) { return e.pedido === et.pedido && e.tipo === par && e.caminhoes.length; })[0] : null;
      if (doPar) {
        et.caminhoes = doPar.caminhoes.slice();
      } else {
        const m3 = ESC_volume_(et, volumes, regras).m3;
        const livres = base.caminhoes.filter(function (c) { return c.codigo && ESC_caminhaoLivre_(c.codigo, et, etapas); });
        const cabem = livres.filter(function (c) { return c.capacidade >= m3; }).sort(function (a, b) { return a.capacidade - b.capacidade; });
        const escolhido = cabem[0] || livres.slice().sort(function (a, b) { return b.capacidade - a.capacidade; })[0];
        if (escolhido) et.caminhoes = [escolhido.codigo];
      }
      if (et.caminhoes.length) alterou = true;
    }

    if (alterou) mudou.push(et);
  });
  return mudou;
}

function ESC_gravar_(aba, etapas) {
  etapas.forEach(function (et) {
    aba.getRange(et.linha, ESC_COL.caminhao + 1, 1, 3).setValues([[et.caminhoes.join(","), et.responsavel, et.equipe.join("|")]]);
  });
}

function ESC_avisos_(et, base, regras, volumes) {
  const conf = regras.etapas[et.tipo];
  const av = [];
  if (!conf) return av;
  const v = ESC_volume_(et, volumes, regras);
  const precisa = ESC_sugerido_(et, volumes, regras);
  const tem = ESC_pessoasDa_(et).length;
  if (tem < precisa) av.push("Equipe pequena: " + tem + " de " + precisa + " pessoas sugeridas");
  if (!et.responsavel) av.push("Sem responsável (nenhum líder livre)");
  if (conf.caminhao && !et.caminhoes.length) av.push("Sem caminhão");
  if (conf.caminhao && et.caminhoes.length) {
    const cap = et.caminhoes.reduce(function (t, c) {
      const cam = base.caminhoes.filter(function (x) { return ESC_chave_(x.codigo) === ESC_chave_(c); })[0];
      return t + (cam ? cam.capacidade : 0);
    }, 0);
    if (cap > 0 && v.m3 > cap) av.push("Caminhão pequeno: " + cap + " m³ para " + v.m3 + " m³");
    if (!cap) av.push("Capacidade do caminhão não cadastrada");
  }
  return av;
}

/* ---------- funções chamadas pela tela ---------- */

function ESC_exigirLogin_(editar) {
  if (!Acervo.usuario()) throw new Error("Entre no sistema para usar o Painel Logístico.");
  if (editar && !Acervo.pode("logistica.planejamento.editar")) throw new Error("Você não tem permissão para alterar a escala. Peça a liberação no Cadastro de Funcionários.");
}

function ESC_montar_(inicio, dias, preencher) {
  const base = Acervo.escalaBase();
  const regras = ESC_regras_(base);
  const aba = ESC_aba_();
  const valores = aba.getDataRange().getValues();
  const fim = ESC_somarDias_(inicio, dias - 1);
  // um dia de folga de cada lado para enxergar conflitos na virada
  const etapas = ESC_lerEtapas_(valores, ESC_somarDias_(inicio, -1), ESC_somarDias_(fim, 1));
  const volumes = Acervo.volumePedidos(etapas.map(function (e) { return e.pedidoSistemaId; }));
  ESC_conflitos_(etapas, regras);
  const free = ESC_free_();
  const hoje = Utilities.formatDate(new Date(), ESC_FUSO, "yyyy-MM-dd");
  let preenchidas = 0;
  if (preencher) {
    const alvo = etapas.filter(function (e) { return e.data >= inicio && e.data <= fim; });
    const mudou = ESC_preencher_(alvo, etapas, base, regras, volumes, free, hoje);
    if (mudou.length) { ESC_gravar_(aba, mudou); ESC_conflitos_(etapas, regras); }
    preenchidas = mudou.length;
  }
  const freeNomes = free.aprovados;
  return {
    inicio: inicio, fim: fim, hoje: hoje, preenchidas: preenchidas, regras: regras,
    pessoas: base.pessoas.concat(freeNomes.filter(function (n) {
      return !base.pessoas.some(function (p) { return ESC_mesmaPessoa_(p.nome, n); });
    }).map(function (n) { return { nome: n, equipe: "free", lider: false, free: true }; })),
    caminhoes: base.caminhoes,
    etapas: etapas.filter(function (e) { return e.data >= inicio && e.data <= fim; }).map(function (e) {
      const v = ESC_volume_(e, volumes, regras);
      return {
        id: e.id, pedido: e.pedido, cliente: e.cliente, local: e.local, etapa: e.etapa, tipo: e.tipo,
        data: e.data, hora: e.hora, responsavel: e.responsavel, equipe: e.equipe, caminhoes: e.caminhoes,
        pedidoSistemaId: e.pedidoSistemaId, m3: v.m3, pecas: v.pecas || 0, volumeEstimado: !!v.estimado,
        sugerido: ESC_sugerido_(e, volumes, regras), freeConfirmados: free.porEtapa[e.id] || [],
        conflitos: e.conflitos, avisos: ESC_avisos_(e, base, regras, volumes), passada: e.data < hoje
      };
    })
  };
}

// Abre o painel. Com "preencher", completa sozinho o que estiver vazio nos dias (botão "Preencher vazios").
// Abrir não preenche: se a logística esvaziou algo de propósito, não volta sozinho.
function ESC_painel(inicio, dias, preencher) {
  ESC_exigirLogin_(!!preencher);
  const ini = ESC_dataIso_(inicio) || Utilities.formatDate(new Date(), ESC_FUSO, "yyyy-MM-dd");
  return ESC_montar_(ini, Math.max(1, Math.min(14, Number(dias) || 7)), !!preencher);
}

// Salva a escolha da logística para uma etapa. Com conflito, só grava se "forcar".
function ESC_salvarEtapa(id, dados, forcar) {
  ESC_exigirLogin_(true);
  const base = Acervo.escalaBase();
  const regras = ESC_regras_(base);
  const aba = ESC_aba_();
  const valores = aba.getDataRange().getValues();
  let alvo = null;
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][ESC_COL.id]) === String(id)) { alvo = i; break; }
  }
  if (alvo === null) throw new Error("Etapa não encontrada. Atualize o painel.");
  const data = ESC_dataIso_(valores[alvo][ESC_COL.data]);
  const etapas = ESC_lerEtapas_(valores, ESC_somarDias_(data, -1), ESC_somarDias_(data, 1));
  const et = etapas.filter(function (e) { return e.id === String(id); })[0];
  if (!et) throw new Error("Etapa sem data válida no cronograma.");
  et.responsavel = String(dados && dados.responsavel || "").trim();
  et.equipe = (dados && dados.equipe || []).map(function (n) { return String(n).trim(); }).filter(String)
    .filter(function (n) { return !ESC_mesmaPessoa_(n, et.responsavel); });
  et.caminhoes = (dados && dados.caminhoes || []).map(function (c) { return String(c).trim(); }).filter(String);
  ESC_conflitos_(etapas, regras);
  if (et.conflitos.length && !forcar) return { ok: false, conflitos: et.conflitos };
  ESC_gravar_(aba, [et]);
  return { ok: true, conflitos: et.conflitos };
}

// Chamado depois que um pedido do Comercial cria/atualiza suas etapas
function ESC_preencherPedido_(pedidoSistemaId) {
  if (!pedidoSistemaId || !Acervo.usuario()) return 0;
  const base = Acervo.escalaBase();
  const regras = ESC_regras_(base);
  const aba = ESC_aba_();
  const valores = aba.getDataRange().getValues();
  const doPedido = ESC_lerEtapas_(valores, "0000-00-00", "9999-99-99").filter(function (e) { return e.pedidoSistemaId === String(pedidoSistemaId); });
  if (!doPedido.length) return 0;
  const datas = doPedido.map(function (e) { return e.data; }).sort();
  const etapas = ESC_lerEtapas_(valores, ESC_somarDias_(datas[0], -1), ESC_somarDias_(datas[datas.length - 1], 1));
  const alvo = etapas.filter(function (e) { return e.pedidoSistemaId === String(pedidoSistemaId); });
  const volumes = Acervo.volumePedidos([pedidoSistemaId]);
  ESC_conflitos_(etapas, regras);
  const hoje = Utilities.formatDate(new Date(), ESC_FUSO, "yyyy-MM-dd");
  const mudou = ESC_preencher_(alvo, etapas, base, regras, volumes, ESC_free_(), hoje);
  if (mudou.length) ESC_gravar_(aba, mudou);
  return mudou.length;
}

/* ---------- listas oficiais (substituem as abas antigas da planilha) ---------- */

function ESC_listas() {
  ESC_exigirLogin_(false);
  const base = Acervo.escalaBase();
  return {
    pessoas: base.pessoas,
    free: ESC_free_().aprovados,
    caminhoes: base.caminhoes
  };
}
