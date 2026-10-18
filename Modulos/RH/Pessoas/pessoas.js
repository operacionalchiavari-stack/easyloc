/* =====================================================
   GESTÃO DE PESSOAS (out/2026) — baseado no RH da Tecnoweld.
   Banco: supabase/migrations/20261018000200_rh.sql. A pessoa é a do Cadastro de
   Funcionários (lida por rh_pessoas); a ficha grava por rh_ficha_salvar e a situação
   (afastado/desligado/ativo) por rh_status — desligar deixa o funcionário inativo.
   Documentos, exames, treinamentos, benefícios, férias e checklists gravam direto nas
   tabelas rh_* (RLS: rh.colaboradores.visualizar / editar).
   Ocorrências: só leitura, do Controle RH (planilha da Chiavari, /api/gs).
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dt = (s) => new Date(String(s).slice(0, 10) + "T12:00:00");
  const iso = (d) => d.toISOString().slice(0, 10);
  const dataBr = (d) => (d ? dt(d).toLocaleDateString("pt-BR") : "-");
  const somaDias = (d, n) => { const x = dt(d); x.setDate(x.getDate() + n); return iso(x); };
  const somaMeses = (d, n) => { const x = dt(d); const dia = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); const ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(dia, ult)); return iso(x); };
  const dias = (a, b) => Math.round((dt(b) - dt(a)) / 86400000);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const num = (v) => { const t = String(v ?? "").trim(); if (!t) return null; const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  const CONTRATOS = { clt: "CLT", pj: "PJ", estagio: "Estágio", aprendiz: "Aprendiz", temporario: "Temporário", freelancer: "Freelancer", terceiro: "Terceiro" };
  const TIPOS_EXAME = { admissional: "Admissional", periodico: "Periódico", retorno: "Retorno ao trabalho", mudanca_funcao: "Mudança de função", demissional: "Demissional", complementar: "Complementar" };
  const RESULTADOS = { apto: "Apto", apto_restricao: "Apto com restrição", inapto: "Inapto" };
  const CAT_DOC = { documento: "Documento pessoal", cnh: "CNH", nr: "NR / certificado", contrato: "Contrato", treinamento: "Treinamento", outro: "Outro" };
  const TIPOS_DESLIG = ["Sem justa causa", "Pedido de demissão", "Justa causa", "Fim do contrato de experiência", "Fim de contrato", "Acordo entre as partes", "Outro"];
  const CHECK_ADMISSAO = ["Exame admissional (ASO)", "Documentos pessoais recebidos (RG, CPF, comprovante de residência, foto)", "Contrato de trabalho assinado", "Registro na carteira / eSocial", "Dados bancários / PIX cadastrados", "Uniforme entregue", "Integração realizada", "Acesso ao sistema e senha operacional", "Inclusão nos benefícios"];

  const S = {
    sb: null, emp: null, aba: "pessoas", podeEditar: false,
    pessoas: [], docs: [], exames: [], examesCad: [], treinos: [], turmas: [], benef: [], adesoes: [], ferias: [], checks: [],
    ficha: null, fichaAba: "dados", filtro: { busca: "", setor: "", situacao: "ativos" }, ocorr: null, ocorrErro: ""
  };

  function avisar(msg, titulo = "Gestão de Pessoas", tipo = "aviso") { window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }
  async function confirmar(msg, titulo = "Confirmar") {
    return typeof window.confirmarGlobal === "function" ? window.confirmarGlobal(msg, titulo, { confirmarTexto: "Confirmar", cancelarTexto: "Voltar", tipo: "warning" }) : confirm(msg);
  }
  async function rpc(nome, args) { const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message); return data; }
  async function todos(tabela, ajustar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      let q = S.sb.from(tabela).select("*").eq("empresa_id", S.emp).range(de, de + 999);
      if (ajustar) q = ajustar(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function gravar(prom) { const r = await prom; if (r.error) throw new Error(r.error.message); return r.data; }

  // ---------------------------------------------------------------- dados
  async function carregar() {
    const [pessoas, docs, exames, examesCad, treinos, turmas, benef, adesoes, ferias, checks] = await Promise.all([
      rpc("rh_pessoas", { p_empresa: S.emp }),
      todos("rh_documentos"), todos("rh_exames"), todos("rh_exames_cadastro", (q) => q.order("nome")),
      todos("rh_treinamentos", (q) => q.order("nome")), todos("rh_turmas", (q) => q.order("data", { ascending: false })),
      todos("rh_beneficios", (q) => q.order("nome")), todos("rh_beneficio_adesoes"), todos("rh_ferias", (q) => q.order("inicio")),
      todos("rh_checklists", (q) => q.order("created_at", { ascending: false }))
    ]);
    Object.assign(S, { pessoas: pessoas || [], docs, exames, examesCad, treinos, turmas, benef, adesoes, ferias, checks });
    contadores();
  }
  const pessoa = (id) => S.pessoas.find((p) => p.id === id);
  const ficha = (p) => p?.ficha || {};
  const situacao = (p) => { const f = ficha(p); if (f.status === "afastado" && p.ativo) return "afastado"; if (f.status === "desligado" || !p.ativo) return "desligado"; return "ativo"; };
  const contrato = (p) => ficha(p).tipo_contrato || "clt";
  const setores = () => [...new Set(S.pessoas.map((p) => p.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const nomeTreino = (id) => S.treinos.find((t) => t.id === id)?.nome || "Treinamento";

  function fotoHtml(p, grande) {
    const ini = String(p?.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
    const { data } = S.sb.storage.from("avatares").getPublicUrl(S.emp + "/" + p.id + ".jpg");
    return '<span class="rh-foto' + (grande ? " grande" : "") + '">' + esc(ini) + (data?.publicUrl ? '<img src="' + esc(data.publicUrl) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function seloSituacao(p) {
    const s = situacao(p), f = ficha(p);
    if (s === "afastado") return '<span class="rh-selo amar">Afastado' + (f.afastamento_fim ? " até " + dataBr(f.afastamento_fim) : "") + "</span>";
    if (s === "desligado") return '<span class="rh-selo">' + (f.desligamento_data ? "Desligado em " + dataBr(f.desligamento_data) : "Inativo") + "</span>";
    return "";
  }
  function tempoDeCasa(p) {
    if (!p.data_admissao) return "";
    const fim = situacao(p) === "desligado" && ficha(p).desligamento_data ? ficha(p).desligamento_data : hoje();
    const m = Math.max(0, Math.floor(dias(p.data_admissao, fim) / 30.44));
    if (m < 12) return m + (m === 1 ? " mês" : " meses") + " de casa";
    const a = Math.floor(m / 12), r = m % 12;
    return a + (a === 1 ? " ano" : " anos") + (r ? " e " + r + (r === 1 ? " mês" : " meses") : "") + " de casa";
  }

  // ---------------------------------------------------------------- pendências (exames, treinamentos, documentos, férias)
  function ultimoExame(p, c) {
    return S.exames.filter((e) => e.funcionario_id === p.id && (e.exame_cadastro_id === c.id || (!e.exame_cadastro_id && norm(e.nome) === norm(c.nome))))
      .sort((a, b) => String(b.data_realizacao || "").localeCompare(String(a.data_realizacao || "")))[0];
  }
  function ultimoCertificado(p, t) {
    return S.docs.filter((d) => d.funcionario_id === p.id && d.treinamento_id === t.id).sort((a, b) => String(b.emissao || "").localeCompare(String(a.emissao || "")))[0];
  }
  // PJ, freelancer e terceiro não fazem ASO pela empresa
  const examesObrigatorios = (p) => ["pj", "freelancer", "terceiro"].includes(contrato(p)) ? [] : S.examesCad.filter((c) => c.ativo && c.validade_meses && (!c.setores_obrigatorios?.length || c.setores_obrigatorios.includes(p.setor)));
  const treinosObrigatorios = (p) => S.treinos.filter((t) => t.ativo && t.setores_obrigatorios?.includes(p.setor));
  function prazo(validade) {
    if (!validade) return null;
    const d = dias(hoje(), validade);
    return d < 0 ? { nivel: "verm", texto: "vencido em " + dataBr(validade), d } : d <= 30 ? { nivel: "amar", texto: "vence em " + dataBr(validade), d } : { nivel: "", texto: "válido até " + dataBr(validade), d };
  }
  function pendencias(p) {
    if (situacao(p) === "desligado") return [];
    const out = [];
    S.docs.filter((d) => d.funcionario_id === p.id && !d.treinamento_id && d.validade).forEach((d) => {
      const z = prazo(d.validade); if (z?.nivel) out.push({ nivel: z.nivel, grupo: "documentos", texto: d.nome + " " + z.texto });
    });
    examesObrigatorios(p).forEach((c) => {
      const e = ultimoExame(p, c);
      if (!e) out.push({ nivel: "verm", grupo: "exames", texto: "Sem " + c.nome });
      else { const z = prazo(e.validade); if (z?.nivel) out.push({ nivel: z.nivel, grupo: "exames", texto: c.nome + " " + z.texto }); }
    });
    treinosObrigatorios(p).forEach((t) => {
      const c = ultimoCertificado(p, t);
      if (!c) out.push({ nivel: "amar", grupo: "treinamentos", texto: "Falta o treinamento " + t.nome });
      else { const z = prazo(c.validade); if (z?.nivel) out.push({ nivel: z.nivel, grupo: "treinamentos", texto: t.nome + " " + z.texto }); }
    });
    const fe = feriasStatus(p);
    if (fe?.vencidas) out.push({ nivel: "verm", grupo: "ferias", texto: "Férias vencidas (" + fe.vencidas + " período" + (fe.vencidas > 1 ? "s" : "") + ")" });
    const exp = ficha(p).experiencia_fim;
    if (exp && dias(hoje(), exp) >= 0 && dias(hoje(), exp) <= 15) out.push({ nivel: "amar", grupo: "contrato", texto: "Experiência termina em " + dataBr(exp) });
    return out;
  }

  // ---------------------------------------------------------------- férias (período aquisitivo de 12 meses, concessivo de mais 12)
  function feriasStatus(p) {
    if (!p.data_admissao || !["clt", "aprendiz"].includes(contrato(p)) || situacao(p) === "desligado") return null;
    const hj = hoje(), periodos = [];
    for (let k = 0; k < 60; k++) {
      const inicio = somaMeses(p.data_admissao, k * 12);
      if (inicio > hj) break;
      const fimAq = somaDias(somaMeses(inicio, 12), -1), limite = somaDias(somaMeses(inicio, 24), -1);
      const usados = S.ferias.filter((f) => f.funcionario_id === p.id && f.status !== "cancelada" && f.periodo_inicio === inicio).reduce((s, f) => s + f.dias + (f.abono_dias || 0), 0);
      const completo = fimAq < hj, saldo = Math.max(0, 30 - usados);
      periodos.push({ inicio, fimAq, limite, usados, saldo, completo, vencida: completo && saldo > 0 && limite < hj });
    }
    const pendentes = periodos.filter((x) => x.completo && x.saldo > 0);
    return { periodos, pendentes, vencidas: pendentes.filter((x) => x.vencida).length, atual: periodos[periodos.length - 1] };
  }
  const feriasAbertas = (p) => S.ferias.filter((f) => f.funcionario_id === p.id && f.status !== "cancelada");

  function contadores() {
    const ativos = S.pessoas.filter((p) => situacao(p) !== "desligado");
    const venc = ativos.reduce((s, p) => s + pendencias(p).filter((x) => x.nivel === "verm" && x.grupo !== "ferias" && x.grupo !== "contrato").length, 0);
    const fer = ativos.reduce((s, p) => s + (feriasStatus(p)?.vencidas || 0), 0);
    const mov = S.checks.filter((c) => !c.concluido_em).length;
    const set = (k, n) => { const el = document.querySelector('[data-cont="' + k + '"]'); if (el) el.textContent = n || ""; };
    set("vencimentos", venc); set("ferias", fer); set("movimentacoes", mov);
  }

  // ---------------------------------------------------------------- modal
  let botoes = [];
  function modal(titulo, corpo, bts, montar) {
    $("rhModalTitulo").textContent = titulo;
    // caixa nova a cada janela: os eventos da janela anterior não podem disparar nesta
    const velho = $("rhModalCorpo"), novo = velho.cloneNode(false); velho.replaceWith(novo);
    $("rhModalCorpo").innerHTML = corpo;
    botoes = (bts || []).filter(Boolean);
    $("rhModalRodape").innerHTML = botoes.map((b, i) => '<button type="button" class="fin-btn ' + (b.classe || "") + '" data-bt="' + i + '">' + esc(b.rotulo) + "</button>").join("");
    if (!$("rhModal").open) $("rhModal").showModal();
    montar?.($("rhModalCorpo"));
  }
  function fechar() { if ($("rhModal").open) $("rhModal").close(); }
  function campos(raiz) { const o = {}; raiz.querySelectorAll("[name]").forEach((el) => { if (el.type === "checkbox" && el.dataset.lista) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.type === "checkbox" ? el.checked : el.type === "file" ? el.files?.[0] || null : el.value; }); return o; }
  function erroModal(msg) { let e = $("rhModalCorpo").querySelector(".fin-erro"); if (!e) { e = document.createElement("p"); e.className = "fin-erro"; $("rhModalCorpo").appendChild(e); } e.textContent = msg; }
  async function executar(fn, ok) {
    const bt = $("rhModalRodape").querySelectorAll("button"); bt.forEach((b) => (b.disabled = true));
    try { await fn(); fechar(); if (ok) avisar(ok, "Gestão de Pessoas", "sucesso"); await recarregar(); }
    catch (e) { console.error(e); erroModal(e.message || String(e)); }
    finally { bt.forEach((b) => (b.disabled = false)); }
  }
  const opc = (obj, sel, vazio) => (vazio !== undefined ? '<option value="">' + esc(vazio) + "</option>" : "") + Object.entries(obj).map(([v, r]) => '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(r) + "</option>").join("");
  const opcPessoas = (sel, filtro) => '<option value="">Escolha a pessoa</option>' + S.pessoas.filter((p) => situacao(p) !== "desligado" && (!filtro || filtro(p))).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((p) => '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.nome) + (p.setor ? " · " + esc(p.setor) : "") + "</option>").join("");
  const marcarHtml = (nome, lista, marcados = []) => '<div class="rh-marcar">' + lista.map((p) => '<label><input type="checkbox" name="' + nome + '" data-lista="1" value="' + esc(p.id) + '"' + (marcados.includes(p.id) ? " checked" : "") + "> " + esc(p.nome) + (p.setor ? ' <small style="color:#9a958d">' + esc(p.setor) + "</small>" : "") + "</label>").join("") + "</div>";

  // arquivos: bucket privado rh-documentos, pasta <empresa>/rh/<pessoa>/
  async function enviarArquivo(file, pastaPessoa) {
    if (!file) return null;
    if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo maior que 15 MB.");
    const nome = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    const path = S.emp + "/rh/" + (pastaPessoa || "geral") + "/" + uid() + "-" + nome;
    const { error } = await S.sb.storage.from("rh-documentos").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw new Error("Não foi possível enviar o arquivo: " + error.message);
    return { path, nome: file.name };
  }
  async function abrirArquivo(path) {
    const janela = window.open("", "_blank");
    const { data, error } = await S.sb.storage.from("rh-documentos").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { janela?.close(); avisar("Não foi possível abrir o arquivo."); return; }
    if (janela) janela.location = data.signedUrl; else location.href = data.signedUrl;
  }
  const arquivoHtml = (path) => (path ? '<button type="button" class="rh-arquivo" data-arquivo="' + esc(path) + '">Abrir</button>' : '<span style="color:#9a958d">-</span>');

  // ---------------------------------------------------------------- navegação
  async function recarregar() {
    try { await carregar(); } catch (e) { console.error(e); mostrarAviso("Não foi possível carregar: " + (e.message || e)); return; }
    mostrarAviso(""); pintar();
  }
  function mostrarAviso(m) { $("rhAviso").hidden = !m; $("rhAviso").textContent = m || ""; }
  function pintar() {
    document.querySelectorAll("#rhAbas [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === S.aba));
    if (S.aba === "pessoas" && S.ficha && pessoa(S.ficha)) return pintarFicha();
    ({ pessoas: pintarPessoas, vencimentos: pintarVencimentos, beneficios: pintarBeneficios, ferias: pintarFerias, movimentacoes: pintarMovimentacoes })[S.aba]();
  }
  const card = (rot, val, sub, cls = "") => '<div class="fin-card ' + cls + '"><span>' + esc(rot) + "</span><strong>" + val + "</strong><small>" + esc(sub) + "</small></div>";

  // ---------------------------------------------------------------- colaboradores
  function pintarPessoas() {
    const f = S.filtro, b = norm(f.busca);
    const lista = S.pessoas.filter((p) => {
      const s = situacao(p);
      if (f.situacao === "ativos" && s === "desligado") return false;
      if (f.situacao === "afastados" && s !== "afastado") return false;
      if (f.situacao === "desligados" && s !== "desligado") return false;
      if (f.setor && p.setor !== f.setor) return false;
      if (b && !norm([p.nome, p.cargo, p.setor, p.cpf, ficha(p).matricula].join(" ")).includes(b)) return false;
      return true;
    }).sort((a, z) => a.nome.localeCompare(z.nome, "pt-BR"));
    const grupos = new Map();
    lista.forEach((p) => { const k = p.setor || "Sem setor"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
    const ativos = S.pessoas.filter((p) => situacao(p) === "ativo").length, afast = S.pessoas.filter((p) => situacao(p) === "afastado").length;
    const comPend = S.pessoas.filter((p) => pendencias(p).some((x) => x.nivel === "verm")).length;
    $("rhConteudo").innerHTML =
      '<section class="fin-cards">' + card("Ativos", ativos, "trabalhando") + card("Afastados", afast, "fora por um tempo", afast ? "" : "") +
      card("Desligados", S.pessoas.filter((p) => situacao(p) === "desligado").length, "não usam mais o sistema") +
      card("Com pendência", comPend, "exame, documento ou férias vencidos", comPend ? "is-vermelho" : "") + "</section>" +
      '<div class="fin-barra-ferr"><input type="search" id="rpBusca" placeholder="Buscar por nome, cargo, CPF ou matrícula" value="' + esc(f.busca) + '">' +
      '<select id="rpSetor"><option value="">Todos os setores</option>' + setores().map((s) => '<option' + (s === f.setor ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select>" +
      '<select id="rpSit">' + [["ativos", "Ativos e afastados"], ["afastados", "Só afastados"], ["desligados", "Desligados"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.situacao === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn" data-acao="admissao">+ Nova admissão</button>' : "") + "</div>" +
      (lista.length ? [...grupos].sort(([a], [z]) => a.localeCompare(z, "pt-BR")).map(([setor, ps]) =>
        '<h4 class="rh-grupo-titulo">' + esc(setor) + " <span>" + ps.length + "</span></h4>" +
        '<div class="rh-pessoas">' + ps.map((p) => {
          const pend = pendencias(p), v = pend.filter((x) => x.nivel === "verm").length, a = pend.length - v;
          return '<button type="button" class="rh-pessoa ' + situacao(p) + '" data-pessoa="' + p.id + '">' + fotoHtml(p) +
            '<span class="rh-pessoa-info"><strong>' + esc(p.nome) + "</strong><small>" + esc([p.cargo, CONTRATOS[contrato(p)]].filter(Boolean).join(" · ")) + "</small>" +
            '<span class="rh-pessoa-selos">' + seloSituacao(p) + (v ? '<span class="rh-selo verm">' + v + " vencido" + (v > 1 ? "s" : "") + "</span>" : "") + (a ? '<span class="rh-selo amar">' + a + " atenção</span>" : "") + "</span></span></button>";
        }).join("") + "</div>").join("") : '<div class="fin-vazio">Ninguém encontrado com esses filtros.</div>');
    const at = () => { S.filtro = { busca: $("rpBusca").value, setor: $("rpSetor").value, situacao: $("rpSit").value }; pintarPessoas(); };
    $("rpBusca").addEventListener("input", () => { clearTimeout(at.t); at.t = setTimeout(at, 250); });
    $("rpSetor").addEventListener("change", at); $("rpSit").addEventListener("change", at);
  }

  // ---------------------------------------------------------------- ficha
  function abrirFicha(id, aba) { S.ficha = id; S.fichaAba = aba || "dados"; S.aba = "pessoas"; window.scrollTo(0, 0); pintar(); }
  function pintarFicha() {
    const p = pessoa(S.ficha), f = ficha(p), s = situacao(p), ed = S.podeEditar;
    const abas = [["dados", "Dados"], ["documentos", "Documentos"], ["exames", "Exames"], ["treinamentos", "Treinamentos"], ["beneficios", "Benefícios"], ["ferias", "Férias"], ["ocorrencias", "Ocorrências"]];
    $("rhConteudo").innerHTML =
      '<button class="fin-btn claro rh-voltar" data-acao="voltar-lista">← Colaboradores</button>' +
      '<section class="rh-ficha-topo">' + fotoHtml(p, true) + '<div><h3>' + esc(p.nome) + "</h3><p>" + esc([p.cargo, p.setor, CONTRATOS[contrato(p)]].filter(Boolean).join(" · ")) + "</p>" +
      "<p>" + (p.data_admissao ? "Admissão " + dataBr(p.data_admissao) + " · " + esc(tempoDeCasa(p)) : "Sem data de admissão") + " " + seloSituacao(p) + "</p></div>" +
      '<div class="rh-ficha-acoes">' + (ed ? '<button class="fin-btn" data-acao="editar-ficha">Editar dados</button>' +
        (s === "ativo" ? '<button class="fin-btn claro" data-acao="afastar">Afastar</button><button class="fin-btn verm" data-acao="desligar">Registrar desligamento</button>' : "") +
        (s === "afastado" ? '<button class="fin-btn claro" data-acao="reativar">Voltou ao trabalho</button><button class="fin-btn verm" data-acao="desligar">Registrar desligamento</button>' : "") +
        (s === "desligado" && !p.eu ? '<button class="fin-btn claro" data-acao="reativar">Reativar</button>' : "") : "") +
      '<a class="fin-btn claro" href="../CadastroFuncionarios/cadastro-funcionarios.html?funcionario=' + encodeURIComponent(p.id) + '">Cadastro e acesso</a></div></section>' +
      '<nav class="rh-subabas">' + abas.map(([k, r]) => '<button type="button" data-subaba="' + k + '"' + (k === S.fichaAba ? ' class="ativa"' : "") + ">" + r + "</button>").join("") + "</nav>" +
      '<div id="rhFichaCorpo"></div>';
    ({ dados: fichaDados, documentos: fichaDocumentos, exames: fichaExames, treinamentos: fichaTreinamentos, beneficios: fichaBeneficios, ferias: fichaFerias, ocorrencias: fichaOcorrencias })[S.fichaAba](p, f);
  }
  function dl(itens) { return itens.map(([r, v]) => (r === "#" ? '<div class="rh-dados-titulo">' + esc(v) + "</div>" : "<div><dt>" + esc(r) + "</dt><dd>" + (v === "" || v == null ? "-" : esc(v)) + "</dd></div>")).join(""); }
  function fichaDados(p, f) {
    const d = p.dados_rh || {}, pend = pendencias(p);
    const idade = d.data_nascimento ? Math.floor(dias(d.data_nascimento, hoje()) / 365.25) : null;
    $("rhFichaCorpo").innerHTML =
      (pend.length ? '<section class="fin-bloco"><h3>Pendências</h3><div class="rh-pessoa-selos">' + pend.map((x) => '<span class="rh-selo ' + x.nivel + '">' + esc(x.texto) + "</span>").join("") + "</div></section>" : "") +
      (f.status === "desligado" || f.desligamento_data ? '<section class="fin-bloco"><h3>Desligamento</h3><dl class="rh-dados">' + dl([["Data", dataBr(f.desligamento_data)], ["Tipo", f.desligamento_tipo], ["Motivo", f.desligamento_motivo]]) + "</dl></section>" : "") +
      (f.status === "afastado" ? '<section class="fin-bloco"><h3>Afastamento</h3><dl class="rh-dados">' + dl([["Desde", dataBr(f.afastamento_inicio)], ["Previsão de volta", dataBr(f.afastamento_fim)], ["Motivo", f.afastamento_motivo]]) + "</dl></section>" : "") +
      '<section class="fin-bloco"><dl class="rh-dados">' + dl([
        ["#", "Pessoais"], ["CPF", p.cpf ? String(p.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : ""], ["RG", d.rg], ["Nascimento", d.data_nascimento ? dataBr(d.data_nascimento) + (idade != null ? " (" + idade + " anos)" : "") : ""],
        ["Estado civil", f.estado_civil], ["Escolaridade", f.escolaridade], ["Dependentes", f.dependentes ?? 0], ["Telefone", p.telefone], ["WhatsApp", d.whatsapp], ["E-mail", p.email], ["Endereço", d.endereco],
        ["#", "Contrato"], ["Matrícula", f.matricula], ["Tipo de contrato", CONTRATOS[contrato(p)]], ["Admissão", dataBr(p.data_admissao)], ["Fim da experiência", f.experiencia_fim ? dataBr(f.experiencia_fim) : ""], ["Jornada", f.jornada], ["PIS", f.pis], ["CTPS", f.ctps],
        ["#", "Contato de emergência"], ["Nome", f.contato_emergencia], ["Telefone", f.contato_emergencia_telefone],
        ["#", "Pagamento"], ["Banco", f.banco], ["Agência", f.agencia], ["Conta", f.conta], ["PIX", f.pix],
        ["#", "Uniforme"], ["Camisa", f.tamanho_camisa], ["Calça", f.tamanho_calca], ["Calçado", f.tamanho_calcado],
        ["#", "Transporte"], ["Tipo", f.transporte_tipo], ["Passagens por dia", f.transporte_passagens_dia], ["Tarifa", f.transporte_tarifa != null ? brl(f.transporte_tarifa) : ""],
        ["#", "Observações"], ["", f.observacoes]
      ]) + "</dl></section>";
  }
  function fichaDocumentos(p) {
    const lista = S.docs.filter((d) => d.funcionario_id === p.id && !d.treinamento_id).sort((a, b) => String(b.emissao || "").localeCompare(String(a.emissao || "")));
    $("rhFichaCorpo").innerHTML = '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn" data-acao="novo-doc">+ Adicionar documento</button>' : "") + "</div>" +
      (lista.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Documento</th><th>Tipo</th><th>Emissão</th><th>Validade</th><th>Arquivo</th><th></th></tr></thead><tbody>' +
        lista.map((d) => { const z = prazo(d.validade); return "<tr><td><b>" + esc(d.nome) + "</b>" + (d.observacao ? "<br><small>" + esc(d.observacao) + "</small>" : "") + "</td><td>" + esc(CAT_DOC[d.categoria] || d.categoria) + "</td><td>" + dataBr(d.emissao) + "</td><td>" + (z ? '<span class="rh-selo ' + (z.nivel || "verde") + '">' + esc(z.texto) + "</span>" : "Sem validade") + "</td><td>" + arquivoHtml(d.arquivo_path) + '</td><td class="num">' + (S.podeEditar ? '<button class="fin-btn peq verm" data-apagar="rh_documentos" data-id="' + d.id + '">Excluir</button>' : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhum documento. Guarde aqui CNH, contrato, documentos pessoais e certificados com validade.</div>');
  }
  function fichaExames(p) {
    const lista = S.exames.filter((e) => e.funcionario_id === p.id).sort((a, b) => String(b.data_realizacao || "").localeCompare(String(a.data_realizacao || "")));
    const obr = examesObrigatorios(p);
    $("rhFichaCorpo").innerHTML = '<div class="fin-barra-ferr">' + (obr.length ? '<span class="rh-pessoa-selos">' + obr.map((c) => { const e = ultimoExame(p, c), z = e && prazo(e.validade); return '<span class="rh-selo ' + (!e ? "verm" : z?.nivel || "verde") + '">' + esc(c.nome) + ": " + (!e ? "não feito" : z ? z.texto : "feito") + "</span>"; }).join("") + "</span>" : "") +
      '<span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn" data-acao="novo-exame">+ Registrar exame</button>' : "") + "</div>" +
      (lista.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Exame</th><th>Tipo</th><th>Data</th><th>Validade</th><th>Resultado</th><th>Clínica</th><th>Arquivo</th><th></th></tr></thead><tbody>' +
        lista.map((e) => { const z = prazo(e.validade); return "<tr><td><b>" + esc(e.nome) + "</b></td><td>" + esc(TIPOS_EXAME[e.tipo] || e.tipo) + "</td><td>" + dataBr(e.data_realizacao) + "</td><td>" + (z ? '<span class="rh-selo ' + (z.nivel || "verde") + '">' + esc(z.texto) + "</span>" : "-") + "</td><td>" + esc(RESULTADOS[e.resultado] || "-") + "</td><td>" + esc(e.clinica || "-") + "</td><td>" + arquivoHtml(e.arquivo_path) + '</td><td class="num">' + (S.podeEditar ? '<button class="fin-btn peq verm" data-apagar="rh_exames" data-id="' + e.id + '">Excluir</button>' : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhum exame registrado.</div>');
  }
  function fichaTreinamentos(p) {
    const certs = S.docs.filter((d) => d.funcionario_id === p.id && d.treinamento_id).sort((a, b) => String(b.emissao || "").localeCompare(String(a.emissao || "")));
    const obr = treinosObrigatorios(p);
    $("rhFichaCorpo").innerHTML = (obr.length ? '<section class="fin-bloco"><h3>Obrigatórios para ' + esc(p.setor) + '</h3><div class="rh-pessoa-selos">' + obr.map((t) => { const c = ultimoCertificado(p, t), z = c && prazo(c.validade); return '<span class="rh-selo ' + (!c ? "amar" : z?.nivel || "verde") + '">' + esc(t.nome) + ": " + (!c ? "falta" : z ? z.texto : "feito") + "</span>"; }).join("") + "</div></section>" : "") +
      '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn" data-acao="nova-turma" data-pessoa-turma="' + p.id + '">+ Lançar treinamento</button>' : "") + "</div>" +
      (certs.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Treinamento</th><th>Data</th><th>Validade</th><th>Arquivo</th><th></th></tr></thead><tbody>' +
        certs.map((d) => { const z = prazo(d.validade); return "<tr><td><b>" + esc(d.nome) + "</b></td><td>" + dataBr(d.emissao) + "</td><td>" + (z ? '<span class="rh-selo ' + (z.nivel || "verde") + '">' + esc(z.texto) + "</span>" : "Sem validade") + "</td><td>" + arquivoHtml(d.arquivo_path) + '</td><td class="num">' + (S.podeEditar ? '<button class="fin-btn peq verm" data-apagar="rh_documentos" data-id="' + d.id + '">Excluir</button>' : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhum treinamento lançado.</div>');
  }
  function beneficioPara(b, p) {
    if (!b.ativo) return { aplica: false, texto: "Benefício inativo" };
    if (!(b.tipos_contrato || []).includes(contrato(p))) return { aplica: false, texto: "Não vale para " + (CONTRATOS[contrato(p)] || contrato(p)) };
    if (!p.data_admissao) return { aplica: false, texto: "Sem data de admissão" };
    const comeca = somaMeses(p.data_admissao, b.meses_carencia || 0);
    const aderiu = S.adesoes.find((a) => a.beneficio_id === b.id && a.funcionario_id === p.id);
    if (comeca > hoje()) { const d = dias(hoje(), comeca); return { aplica: true, tem: false, comeca, aderiu, texto: "Começa em " + dataBr(comeca) + " (" + d + " dia" + (d === 1 ? "" : "s") + ")", nivel: d <= 30 ? "amar" : "azul" }; }
    if (b.adesao === "quem_aderir" && !aderiu) return { aplica: true, tem: false, comeca, aderiu, texto: "Pode aderir desde " + dataBr(comeca), nivel: "" };
    return { aplica: true, tem: true, comeca, aderiu, texto: "Tem desde " + dataBr(aderiu?.desde && aderiu.desde > comeca ? aderiu.desde : comeca), nivel: "verde" };
  }
  function fichaBeneficios(p) {
    $("rhFichaCorpo").innerHTML = S.benef.length ? '<section class="fin-bloco"><table class="fin-tabela"><thead><tr><th>Benefício</th><th>Situação</th><th></th></tr></thead><tbody>' +
      S.benef.map((b) => { const r = beneficioPara(b, p); return "<tr><td><b>" + esc(b.nome) + "</b><br><small>" + esc(resumoBeneficio(b)) + "</small></td><td>" + (r.aplica ? '<span class="rh-selo ' + (r.nivel || "") + '">' + esc(r.texto) + "</span>" : '<span style="color:#9a958d">' + esc(r.texto) + "</span>") + '</td><td class="num">' + (S.podeEditar && r.aplica && b.adesao === "quem_aderir" ? (r.aderiu ? '<button class="fin-btn peq claro" data-adesao="' + b.id + '" data-pessoa-adesao="' + p.id + '">Tirar adesão</button>' : '<button class="fin-btn peq" data-adesao="' + b.id + '" data-pessoa-adesao="' + p.id + '">Marcar adesão</button>') : "") + "</td></tr>"; }).join("") +
      "</tbody></table></section>" : '<div class="fin-vazio">Nenhum benefício cadastrado. Cadastre na aba Benefícios.</div>';
  }
  function fichaFerias(p) {
    const fe = feriasStatus(p), progs = S.ferias.filter((f) => f.funcionario_id === p.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
    $("rhFichaCorpo").innerHTML = (fe ? '<section class="fin-bloco"><h3>Períodos aquisitivos ' + (S.podeEditar ? '<button class="fin-btn peq" data-acao="programar-ferias" data-pessoa-ferias="' + p.id + '">Programar férias</button>' : "") + '</h3><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Período</th><th class="num">Tirados</th><th class="num">Saldo</th><th>Tirar até</th><th>Situação</th></tr></thead><tbody>' +
      fe.periodos.slice().reverse().map((x) => "<tr><td>" + dataBr(x.inicio) + " a " + dataBr(x.fimAq) + '</td><td class="num">' + x.usados + '</td><td class="num"><b>' + x.saldo + "</b></td><td>" + dataBr(x.limite) + "</td><td>" + (!x.completo ? '<span class="rh-selo azul">Em aquisição</span>' : !x.saldo ? '<span class="rh-selo verde">Concluído</span>' : x.vencida ? '<span class="rh-selo verm">Vencida</span>' : '<span class="rh-selo amar">A tirar</span>') + "</td></tr>").join("") +
      "</tbody></table></div></section>" : '<div class="fin-aviso">' + (p.data_admissao ? "Férias são calculadas para CLT e aprendiz." : "Informe a data de admissão para calcular as férias.") + "</div>") +
      tabelaFerias(progs, false);
  }
  function tabelaFerias(lista, comPessoa) {
    if (!lista.length) return '<div class="fin-vazio">Nenhuma férias programada.</div>';
    const hj = hoje();
    return '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr>' + (comPessoa ? "<th>Pessoa</th>" : "") + '<th>Saída</th><th>Volta</th><th class="num">Dias</th><th class="num">Abono</th><th>Período</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map((f) => {
        const p = pessoa(f.funcionario_id), agora = f.status !== "cancelada" && f.inicio <= hj && f.fim >= hj;
        const st = f.status === "cancelada" ? '<span class="rh-selo">Cancelada</span>' : agora ? '<span class="rh-selo lilas">Em férias</span>' : f.status === "aprovada" ? '<span class="rh-selo verde">Aprovada</span>' : '<span class="rh-selo amar">Programada</span>';
        return "<tr>" + (comPessoa ? "<td><b>" + esc(p?.nome || "-") + "</b><br><small>" + esc(p?.setor || "") + "</small></td>" : "") + "<td>" + dataBr(f.inicio) + "</td><td>" + dataBr(somaDias(f.fim, 1)) + '</td><td class="num">' + f.dias + '</td><td class="num">' + (f.abono_dias || 0) + "</td><td>" + dataBr(f.periodo_inicio) + "</td><td>" + st + (f.coletiva_nome ? '<br><small>Coletiva: ' + esc(f.coletiva_nome) + "</small>" : "") + "</td>" +
          '<td class="num"><div class="acoes">' + (S.podeEditar && f.status === "programada" ? '<button class="fin-btn peq verde" data-ferias-aprovar="' + f.id + '">Aprovar</button>' : "") + (S.podeEditar && f.status !== "cancelada" && f.fim >= hj ? '<button class="fin-btn peq verm" data-ferias-cancelar="' + f.id + '">Cancelar</button>' : "") + "</div></td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  // ocorrências: Controle RH (planilha da Chiavari, servidor /api/gs)
  async function carregarOcorrencias() {
    if (S.ocorr) return S.ocorr;
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const servidor = (local && location.port === "3000") || /\.vercel\.app$/i.test(location.hostname) ? "" : "https://easyloc-zeta.vercel.app";
    const { data } = await S.sb.auth.getSession();
    const r = await fetch(servidor + "/api/gs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") }, body: JSON.stringify({ projeto: "controlerh", fn: "getHistoricoRH", args: [] }) });
    const j = await r.json().catch(() => null);
    if (!j?.ok) throw new Error(j?.erro || "Não foi possível ler o Controle RH.");
    S.ocorr = j.resultado || [];
    return S.ocorr;
  }
  function ocorrenciasDe(p, lista) {
    const n = norm(p.nome), partes = n.split(" ");
    return lista.filter((o) => { const m = norm(o.funcionario); if (!m) return false; if (m === n) return true; const q = m.split(" "); return q[0] === partes[0] && (q.length === 1 || partes.includes(q[q.length - 1])); });
  }
  async function fichaOcorrencias(p) {
    const corpo = $("rhFichaCorpo");
    corpo.innerHTML = '<div class="fin-vazio">Lendo o Controle RH…</div>';
    try {
      const lista = ocorrenciasDe(p, await carregarOcorrencias());
      if (S.ficha !== p.id || S.fichaAba !== "ocorrencias") return;
      const porTipo = {}; lista.forEach((o) => { porTipo[o.tipo || "Outro"] = (porTipo[o.tipo || "Outro"] || 0) + 1; });
      corpo.innerHTML = '<p class="fin-info" style="margin-bottom:12px">As ocorrências são lançadas no <b>Controle RH</b>. Aqui aparecem as registradas com o nome desta pessoa.</p>' +
        (lista.length ? '<div class="rh-pessoa-selos" style="margin-bottom:12px">' + Object.entries(porTipo).map(([t, n]) => '<span class="rh-selo">' + esc(t) + ": " + n + "</span>").join("") + "</div>" +
          '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Observação</th><th>Registrado por</th></tr></thead><tbody>' +
          lista.map((o) => "<tr><td>" + esc(o.dataOcorrencia || o.data) + (o.horaOcorrencia ? " " + esc(o.horaOcorrencia) : "") + "</td><td><b>" + esc(o.tipo) + "</b></td><td>" + esc(o.observacao) + "</td><td>" + esc(o.responsavel) + "</td></tr>").join("") +
          "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhuma ocorrência no Controle RH com este nome.</div>');
    } catch (e) { corpo.innerHTML = '<div class="fin-aviso">' + esc(e.message) + "</div>"; }
  }

  // ---------------------------------------------------------------- formulários da ficha
  function editarFicha(p) {
    const f = ficha(p), d = p.dados_rh || {};
    const t = (n, r, v, x = "") => '<label' + (x.includes("inteiro") ? ' class="inteiro"' : "") + ">" + r + '<input type="text" name="' + n + '" value="' + esc(v ?? "") + '" ' + x.replace("inteiro", "") + "></label>";
    const dtc = (n, r, v) => '<label>' + r + '<input type="date" name="' + n + '" value="' + esc(v || "") + '"></label>';
    const sel = (n, r, lista, v) => '<label>' + r + '<select name="' + n + '"><option value="">-</option>' + lista.map((o) => "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select></label>";
    modal("Editar dados · " + p.nome,
      '<div class="fin-form">' +
      '<p class="fin-sub">Pessoais</p>' + t("cpf", "CPF", p.cpf, 'inputmode="numeric" maxlength="14"') + t("rg", "RG", d.rg) + dtc("data_nascimento", "Nascimento", d.data_nascimento) +
      sel("estado_civil", "Estado civil", ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"], f.estado_civil) +
      sel("escolaridade", "Escolaridade", ["Fundamental incompleto", "Fundamental", "Médio incompleto", "Médio", "Técnico", "Superior incompleto", "Superior", "Pós-graduação"], f.escolaridade) +
      '<label>Dependentes<input type="number" name="dependentes" min="0" max="20" value="' + esc(f.dependentes ?? 0) + '"></label>' +
      t("telefone", "Telefone", p.telefone) + t("whatsapp", "WhatsApp", d.whatsapp) + t("endereco", "Endereço", d.endereco, "inteiro") +
      '<p class="fin-sub">Contrato</p>' + t("cargo", "Cargo / função", p.cargo) + t("matricula", "Matrícula", f.matricula) +
      '<label>Tipo de contrato<select name="tipo_contrato">' + opc(CONTRATOS, contrato(p)) + "</select></label>" +
      dtc("data_admissao", "Admissão", p.data_admissao) + dtc("experiencia_fim", "Fim da experiência", f.experiencia_fim) + t("jornada", "Jornada", f.jornada, 'placeholder="Ex.: 08:00 às 17:00, seg a sex"') + t("pis", "PIS", f.pis) + t("ctps", "CTPS", f.ctps) +
      '<p class="fin-sub">Contato de emergência</p>' + t("contato_emergencia", "Nome", f.contato_emergencia) + t("contato_emergencia_telefone", "Telefone", f.contato_emergencia_telefone) +
      '<p class="fin-sub">Pagamento</p>' + t("banco", "Banco", f.banco) + t("agencia", "Agência", f.agencia) + t("conta", "Conta", f.conta) + t("pix", "Chave PIX", f.pix) +
      '<p class="fin-sub">Uniforme</p>' + sel("tamanho_camisa", "Camisa", ["PP", "P", "M", "G", "GG", "XG", "XGG"], f.tamanho_camisa) + t("tamanho_calca", "Calça", f.tamanho_calca) + t("tamanho_calcado", "Calçado", f.tamanho_calcado) +
      '<p class="fin-sub">Transporte</p>' + sel("transporte_tipo", "Tipo", ["Não usa", "Ônibus", "Riocard", "Bilhete único", "Vale mobilidade", "Carro próprio", "Moto", "Outro"], f.transporte_tipo) +
      t("transporte_passagens_dia", "Passagens por dia", f.transporte_passagens_dia, 'inputmode="decimal"') + t("transporte_tarifa", "Tarifa (R$)", f.transporte_tarifa != null ? String(f.transporte_tarifa).replace(".", ",") : "", 'inputmode="decimal"') +
      '<label class="inteiro">Observações<textarea name="observacoes">' + esc(f.observacoes || "") + "</textarea></label>" +
      '<p class="fin-info">Nome, setor, e-mail, nível de acesso e senha ficam no <b>Cadastro de Funcionários</b>.</p></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Salvar", acao: async () => {
        const v = campos($("rhModalCorpo"));
        v.transporte_passagens_dia = num(v.transporte_passagens_dia) ?? ""; v.transporte_tarifa = num(v.transporte_tarifa) ?? "";
        await executar(() => rpc("rh_ficha_salvar", { p_empresa: S.emp, p_funcionario: p.id, p_dados: v }), "Dados salvos.");
      } }]);
  }
  function statusModal(p, tipo) {
    if (tipo === "reativar") {
      return confirmar("Marcar " + p.nome + " como ativo de novo?" + (situacao(p) === "desligado" ? " O acesso ao sistema volta a funcionar." : ""), "Reativar").then(async (ok) => {
        if (!ok) return; try { await rpc("rh_status", { p_empresa: S.emp, p_funcionario: p.id, p_status: "ativo", p_dados: {} }); await recarregar(); } catch (e) { avisar(e.message, "Gestão de Pessoas", "erro"); }
      });
    }
    const desl = tipo === "desligar";
    modal(desl ? "Registrar desligamento" : "Afastar",
      '<div class="fin-form"><p class="fin-info">' + esc(p.nome) + (desl ? " — o acesso ao sistema é bloqueado e o checklist de desligamento aparece em Admissão e desligamento." : " — continua no sistema; aparece como afastado.") + "</p>" +
      '<label>' + (desl ? "Data do desligamento" : "Desde") + '<input type="date" name="data" value="' + hoje() + '"></label>' +
      (desl ? '<label>Tipo<select name="tipo">' + TIPOS_DESLIG.map((x) => "<option>" + x + "</option>").join("") + "</select></label>" : '<label>Previsão de volta<input type="date" name="fim"></label>') +
      '<label class="inteiro">Motivo<textarea name="motivo" placeholder="' + (desl ? "Motivo do desligamento" : "Ex.: licença médica, INSS, maternidade") + '"></textarea></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: desl ? "Registrar desligamento" : "Afastar", classe: desl ? "verm" : "", acao: async () => {
        const v = campos($("rhModalCorpo"));
        if (!v.data) return erroModal("Informe a data.");
        await executar(() => rpc("rh_status", { p_empresa: S.emp, p_funcionario: p.id, p_status: desl ? "desligado" : "afastado", p_dados: v }), desl ? "Desligamento registrado." : "Afastamento registrado.");
      } }]);
  }
  function docModal(p) {
    modal("Adicionar documento · " + p.nome,
      '<datalist id="rhDocNomes">' + ["CNH", "Contrato de trabalho", "RG", "CPF", "Comprovante de residência", "Certidão de nascimento", "Título de eleitor", "Reservista", "Certificado NR-35", "Certificado NR-11", "Carteira de vacinação"].map((n) => '<option value="' + n + '">').join("") + "</datalist>" +
      '<div class="fin-form"><label class="inteiro">Nome<input type="text" name="nome" list="rhDocNomes" required></label>' +
      '<label>Tipo<select name="categoria">' + opc(CAT_DOC, "documento") + "</select></label><label></label>" +
      '<label>Emissão<input type="date" name="emissao"></label><label>Validade (se tiver)<input type="date" name="validade"></label>' +
      '<label class="inteiro">Arquivo (PDF ou foto)<input type="file" name="arquivo" accept="application/pdf,image/*"></label>' +
      '<label class="inteiro">Observação<input type="text" name="observacao"></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Salvar", acao: async () => {
        const v = campos($("rhModalCorpo"));
        if (!v.nome.trim()) return erroModal("Informe o nome do documento.");
        await executar(async () => {
          const a = await enviarArquivo(v.arquivo, p.id);
          await gravar(S.sb.from("rh_documentos").insert({ empresa_id: S.emp, funcionario_id: p.id, categoria: v.categoria, nome: v.nome.trim(), emissao: v.emissao || null, validade: v.validade || null, arquivo_path: a?.path || null, arquivo_nome: a?.nome || null, observacao: v.observacao || null }));
        }, "Documento salvo.");
      } }]);
  }
  function exameModal(p) {
    const cads = S.examesCad.filter((c) => c.ativo);
    modal("Registrar exame",
      '<div class="fin-form">' + (p ? '<p class="fin-info inteiro">' + esc(p.nome) + "</p>" : '<label class="inteiro">Pessoa<select name="pessoa">' + opcPessoas() + "</select></label>") +
      '<label>Exame<select name="cad"><option value="">Outro (digitar)</option>' + cads.map((c) => '<option value="' + c.id + '">' + esc(c.nome) + "</option>").join("") + "</select></label>" +
      '<label>Nome do exame<input type="text" name="nome" placeholder="Ex.: Audiometria"></label>' +
      '<label>Tipo<select name="tipo">' + opc(TIPOS_EXAME, "periodico") + "</select></label>" +
      '<label>Data<input type="date" name="data" value="' + hoje() + '"></label>' +
      '<label>Repetir a cada<select name="meses"><option value="">Não repete</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="24">24 meses</option></select></label>' +
      '<label>Resultado<select name="resultado">' + opc(RESULTADOS, "apto", "-") + "</select></label>" +
      '<label>Clínica<input type="text" name="clinica"></label><label></label>' +
      '<label class="inteiro">Arquivo<input type="file" name="arquivo" accept="application/pdf,image/*"></label>' +
      '<label class="inteiro">Observação<input type="text" name="observacao"></label><p class="fin-info" id="rhExameVal"></p></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Salvar", acao: async () => {
        const v = campos($("rhModalCorpo")), quem = p || pessoa(v.pessoa), cad = S.examesCad.find((c) => c.id === v.cad);
        if (!quem) return erroModal("Escolha a pessoa.");
        const nome = cad ? cad.nome : v.nome.trim();
        if (!nome) return erroModal("Escolha o exame ou digite o nome.");
        if (!v.data) return erroModal("Informe a data.");
        await executar(async () => {
          const a = await enviarArquivo(v.arquivo, quem.id);
          await gravar(S.sb.from("rh_exames").insert({ empresa_id: S.emp, funcionario_id: quem.id, exame_cadastro_id: cad?.id || null, tipo: v.tipo, nome, data_realizacao: v.data, validade: v.meses ? somaMeses(v.data, Number(v.meses)) : null, resultado: v.resultado || null, clinica: v.clinica || null, arquivo_path: a?.path || null, arquivo_nome: a?.nome || null, observacao: v.observacao || null }));
        }, "Exame registrado.");
      } }],
      (corpo) => {
        const at = () => { const v = campos(corpo); const c = S.examesCad.find((x) => x.id === v.cad); corpo.querySelector('[name="nome"]').closest("label").style.display = c ? "none" : ""; $("rhExameVal").textContent = v.meses && v.data ? "Validade: " + dataBr(somaMeses(v.data, Number(v.meses))) : "Sem validade."; };
        corpo.querySelector('[name="cad"]').addEventListener("change", (e) => { const c = S.examesCad.find((x) => x.id === e.target.value); if (c) { corpo.querySelector('[name="tipo"]').value = c.tipo; corpo.querySelector('[name="meses"]').value = c.validade_meses ? String(c.validade_meses) : ""; } at(); });
        corpo.addEventListener("input", at); at();
      });
  }
  function cadastroModal(tabela, item) {
    const ex = tabela === "rh_exames_cadastro", it = item || { ativo: true, setores_obrigatorios: [], tipo: "periodico", categoria: "treinamento" };
    modal((item ? "Editar " : "Novo ") + (ex ? "exame" : "treinamento"),
      '<div class="fin-form"><label class="inteiro">Nome<input type="text" name="nome" value="' + esc(it.nome || "") + '"></label>' +
      (ex ? '<label>Tipo<select name="tipo">' + opc(TIPOS_EXAME, it.tipo) + "</select></label>" : '<label>Categoria<select name="categoria">' + opc({ treinamento: "Treinamento", nr: "Norma regulamentadora (NR)", integracao: "Integração", reciclagem: "Reciclagem" }, it.categoria) + "</select></label>" + '<label>Carga horária (h)<input type="text" name="carga" inputmode="decimal" value="' + esc(it.carga_horaria ?? "") + '"></label>') +
      '<label>Validade<select name="meses"><option value="">Não vence</option>' + [6, 12, 24, 36].map((m) => '<option value="' + m + '"' + (Number(it.validade_meses) === m ? " selected" : "") + ">" + m + " meses</option>").join("") + "</select></label>" +
      '<label class="check"><input type="checkbox" name="ativo"' + (it.ativo ? " checked" : "") + "> Em uso</label>" +
      '<p class="fin-sub">' + (ex ? "Obrigatório para (vazio = todos)" : "Obrigatório para os setores") + "</p>" +
      '<div class="inteiro rh-marcar">' + setores().map((s) => '<label><input type="checkbox" name="setores" data-lista="1" value="' + esc(s) + '"' + ((it.setores_obrigatorios || []).includes(s) ? " checked" : "") + "> " + esc(s) + "</label>").join("") + "</div></div>",
      [item && S.podeEditar ? { rotulo: "Excluir", classe: "verm", acao: async () => { if (!(await confirmar("Excluir " + it.nome + "?" + (ex ? " Os exames já registrados continuam." : " Os certificados já lançados continuam."), "Excluir"))) return; await executar(() => gravar(S.sb.from(tabela).delete().eq("id", it.id).eq("empresa_id", S.emp)), "Excluído."); } } : null,
        { rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Salvar", acao: async () => {
        const v = campos($("rhModalCorpo"));
        if (!v.nome.trim()) return erroModal("Informe o nome.");
        const linha = { empresa_id: S.emp, nome: v.nome.trim(), validade_meses: v.meses ? Number(v.meses) : null, setores_obrigatorios: v.setores || [], ativo: !!v.ativo };
        if (ex) linha.tipo = v.tipo; else { linha.categoria = v.categoria; linha.carga_horaria = num(v.carga); }
        await executar(() => gravar(item ? S.sb.from(tabela).update(linha).eq("id", it.id).eq("empresa_id", S.emp) : S.sb.from(tabela).insert(linha)), "Salvo.");
      } }]);
  }
  function turmaModal(pessoaId) {
    const ativos = S.pessoas.filter((p) => situacao(p) !== "desligado").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    modal("Registrar treinamento realizado",
      '<div class="fin-form"><label class="inteiro">Treinamento<select name="treino"><option value="">Escolha</option>' + S.treinos.filter((t) => t.ativo).map((t) => '<option value="' + t.id + '">' + esc(t.nome) + (t.validade_meses ? " (vale " + t.validade_meses + " meses)" : "") + "</option>").join("") + "</select></label>" +
      '<label>Data<input type="date" name="data" value="' + hoje() + '"></label><label>Carga horária (h)<input type="text" name="carga" inputmode="decimal"></label>' +
      '<label>Instrutor<input type="text" name="instrutor"></label><label>Local<input type="text" name="local"></label>' +
      '<p class="fin-sub">Participantes</p><div class="inteiro rh-links"><button type="button" data-marca="precisa">marcar quem precisa</button><button type="button" data-marca="todos">marcar todos</button><button type="button" data-marca="nenhum">desmarcar</button></div>' +
      '<div class="inteiro">' + marcarHtml("pessoas", ativos, pessoaId ? [pessoaId] : []) + "</div>" +
      '<label class="inteiro">Lista de presença / certificado<input type="file" name="arquivo" accept="application/pdf,image/*"></label>' +
      '<label class="inteiro">Observação<input type="text" name="observacao"></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Registrar", acao: async () => {
        const v = campos($("rhModalCorpo"));
        if (!v.treino) return erroModal("Escolha o treinamento.");
        if (!v.pessoas?.length) return erroModal("Marque pelo menos um participante.");
        await executar(async () => {
          const a = await enviarArquivo(v.arquivo, "turmas");
          await rpc("rh_turma_registrar", { p_empresa: S.emp, p_treinamento: v.treino, p_data: v.data, p_instrutor: v.instrutor || null, p_local: v.local || null, p_carga: num(v.carga), p_observacao: v.observacao || null, p_funcionarios: v.pessoas, p_arquivo: a?.path || null });
        }, "Treinamento registrado para " + v.pessoas.length + " pessoa(s).");
      } }],
      (corpo) => corpo.addEventListener("click", (e) => {
        const b = e.target.closest("[data-marca]"); if (!b) return;
        const t = S.treinos.find((x) => x.id === corpo.querySelector('[name="treino"]').value);
        corpo.querySelectorAll('[name="pessoas"]').forEach((cx) => {
          const p = pessoa(cx.value);
          cx.checked = b.dataset.marca === "todos" ? true : b.dataset.marca === "nenhum" ? false : !!(t && t.setores_obrigatorios?.includes(p.setor) && (() => { const c = ultimoCertificado(p, t); return !c || (c.validade && dias(hoje(), c.validade) <= 30); })());
        });
        if (b.dataset.marca === "precisa" && !t) erroModal("Escolha o treinamento primeiro.");
      }));
  }

  // ---------------------------------------------------------------- exames e treinamentos (vencimentos)
  function pintarVencimentos() {
    const ativos = S.pessoas.filter((p) => situacao(p) !== "desligado");
    const itens = [];
    ativos.forEach((p) => {
      examesObrigatorios(p).forEach((c) => { const e = ultimoExame(p, c); if (!e) itens.push({ p, oque: c.nome, d: null, falta: true }); });
      treinosObrigatorios(p).forEach((t) => { if (!ultimoCertificado(p, t)) itens.push({ p, oque: t.nome, d: null, falta: true }); });
      const vistos = new Set();
      S.exames.filter((e) => e.funcionario_id === p.id && e.validade).sort((a, b) => String(b.data_realizacao).localeCompare(String(a.data_realizacao))).forEach((e) => { const k = "e" + (e.exame_cadastro_id || norm(e.nome)); if (vistos.has(k)) return; vistos.add(k); itens.push({ p, oque: e.nome, d: dias(hoje(), e.validade), validade: e.validade }); });
      S.docs.filter((d) => d.funcionario_id === p.id && d.validade).sort((a, b) => String(b.emissao || "").localeCompare(String(a.emissao || ""))).forEach((d) => { const k = "d" + (d.treinamento_id || norm(d.nome)); if (vistos.has(k)) return; vistos.add(k); itens.push({ p, oque: d.nome, d: dias(hoje(), d.validade), validade: d.validade }); });
    });
    const faixas = [["Vencidos", (x) => x.d != null && x.d < 0, "verm"], ["Faltando (obrigatório)", (x) => x.falta, "verm"], ["Vencem em até 30 dias", (x) => x.d != null && x.d >= 0 && x.d <= 30, "amar"], ["Em 31 a 60 dias", (x) => x.d > 30 && x.d <= 60, "azul"], ["Em 61 a 90 dias", (x) => x.d > 60 && x.d <= 90, ""]];
    const ed = S.podeEditar;
    $("rhConteudo").innerHTML =
      '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (ed ? '<button class="fin-btn claro" data-acao="nova-turma">Registrar treinamento realizado</button><button class="fin-btn" data-acao="novo-exame">+ Registrar exame</button>' : "") + "</div>" +
      '<div class="fin-grade"><section class="fin-bloco"><h3>Vencimentos e pendências</h3>' +
      (faixas.map(([rot, f, cls]) => { const l = itens.filter(f).sort((a, b) => (a.d ?? -9999) - (b.d ?? -9999)); return l.length ? '<h4 class="rh-grupo-titulo">' + rot + " <span>" + l.length + '</span></h4><table class="fin-tabela"><tbody>' + l.map((x) => '<tr><td><button type="button" class="rh-arquivo" data-pessoa="' + x.p.id + '">' + esc(x.p.nome) + "</button><br><small>" + esc(x.p.setor || "") + "</small></td><td>" + esc(x.oque) + '</td><td class="num"><span class="rh-selo ' + cls + '">' + (x.falta ? "Não feito" : dataBr(x.validade)) + "</span></td></tr>").join("") + "</tbody></table>" : ""; }).join("") || '<div class="fin-vazio">Nada vencendo nos próximos 90 dias.</div>') +
      "</section><div>" +
      '<section class="fin-bloco"><h3>Exames ' + (ed ? '<button class="fin-btn peq" data-acao="novo-cad-exame">+ Exame</button>' : "") + "</h3>" + listaCadastro(S.examesCad, "rh_exames_cadastro") + "</section>" +
      '<section class="fin-bloco"><h3>Treinamentos ' + (ed ? '<button class="fin-btn peq" data-acao="novo-cad-treino">+ Treinamento</button>' : "") + "</h3>" + listaCadastro(S.treinos, "rh_treinamentos") + "</section>" +
      '<section class="fin-bloco"><h3>Turmas realizadas</h3>' + (S.turmas.length ? '<table class="fin-tabela"><tbody>' + S.turmas.slice(0, 15).map((t) => "<tr><td>" + dataBr(t.data) + "</td><td><b>" + esc(nomeTreino(t.treinamento_id)) + "</b><br><small>" + S.docs.filter((d) => d.turma_id === t.id).length + " participante(s)" + (t.instrutor ? " · " + esc(t.instrutor) : "") + '</small></td><td class="num">' + arquivoHtml(t.arquivo_path) + "</td></tr>").join("") + "</tbody></table>" : '<div class="fin-vazio">Nenhuma turma ainda.</div>') + "</section>" +
      "</div></div>";
  }
  function listaCadastro(lista, tabela) {
    if (!lista.length) return '<div class="fin-vazio">Nada cadastrado.</div>';
    return '<table class="fin-tabela"><tbody>' + lista.map((c) => "<tr" + (c.ativo ? "" : ' style="opacity:.5"') + "><td><b>" + esc(c.nome) + "</b><br><small>" + esc([c.validade_meses ? "vale " + c.validade_meses + " meses" : "não vence", c.setores_obrigatorios?.length ? "obrigatório: " + c.setores_obrigatorios.join(", ") : tabela === "rh_exames_cadastro" && c.validade_meses ? "obrigatório para todos" : ""].filter(Boolean).join(" · ")) + '</small></td><td class="num">' + (S.podeEditar ? '<button class="fin-btn peq claro" data-editar-cad="' + tabela + '" data-id="' + c.id + '">Editar</button>' : "") + "</td></tr>").join("") + "</tbody></table>";
  }

  // ---------------------------------------------------------------- benefícios
  function resumoBeneficio(b) {
    return [b.meses_carencia ? "após " + b.meses_carencia + " meses de casa" : "desde a admissão", (b.tipos_contrato || []).map((t) => CONTRATOS[t] || t).join("/"),
      b.adesao === "quem_aderir" ? "só quem aderir" : "para todos", b.valor ? brl(b.valor) + (b.valor_dependente ? " + " + brl(b.valor_dependente) + "/dependente" : "") : "",
      { empresa: "empresa paga", desconto: "desconto na folha", dividido: "dividido" }[b.cobranca]].filter(Boolean).join(" · ");
  }
  function pintarBeneficios() {
    const ativos = S.pessoas.filter((p) => situacao(p) !== "desligado").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    $("rhConteudo").innerHTML = '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn" data-acao="novo-beneficio">+ Novo benefício</button>' : "") + "</div>" +
      (S.benef.length ? S.benef.map((b) => {
        const rs = ativos.map((p) => ({ p, r: beneficioPara(b, p) })).filter((x) => x.r.aplica);
        const tem = rs.filter((x) => x.r.tem).length, logo = rs.filter((x) => !x.r.tem && x.r.comeca > hoje() && dias(hoje(), x.r.comeca) <= 30).length;
        return '<section class="fin-bloco"' + (b.ativo ? "" : ' style="opacity:.6"') + '><h3><span>' + esc(b.nome) + ' <small>' + esc(resumoBeneficio(b)) + "</small></span>" + (S.podeEditar ? '<button class="fin-btn peq claro" data-editar-beneficio="' + b.id + '">Editar</button>' : "") + "</h3>" +
          (b.descricao ? '<p class="fin-info">' + esc(b.descricao) + "</p>" : "") +
          '<div class="rh-pessoa-selos" style="margin:8px 0"><span class="rh-selo verde">' + tem + " com o benefício</span>" + (logo ? '<span class="rh-selo amar">' + logo + " começam em até 30 dias</span>" : "") + "</div>" +
          '<details><summary style="cursor:pointer;font-size:13px;color:#8a6c48;font-weight:600">Ver pessoas (' + rs.length + ")</summary>" +
          '<div class="fin-rolar"><table class="fin-tabela"><tbody>' + rs.map(({ p, r }) => '<tr><td><button type="button" class="rh-arquivo" data-pessoa="' + p.id + '">' + esc(p.nome) + "</button></td><td>" + esc(CONTRATOS[contrato(p)]) + '</td><td><span class="rh-selo ' + (r.nivel || "") + '">' + esc(r.texto) + '</span></td><td class="num">' + (S.podeEditar && b.adesao === "quem_aderir" ? '<button class="fin-btn peq ' + (r.aderiu ? "claro" : "") + '" data-adesao="' + b.id + '" data-pessoa-adesao="' + p.id + '">' + (r.aderiu ? "Tirar adesão" : "Marcar adesão") + "</button>" : "") + "</td></tr>").join("") + "</tbody></table></div></details></section>";
      }).join("") : '<div class="fin-vazio">Nenhum benefício cadastrado. Ex.: vale-alimentação, plano de saúde, cesta básica, seguro de vida.</div>');
  }
  function beneficioModal(item) {
    const b = item || { ativo: true, tipos_contrato: ["clt"], adesao: "todos", cobranca: "empresa", meses_carencia: 0 };
    modal(item ? "Editar benefício" : "Novo benefício",
      '<div class="fin-form"><label class="inteiro">Nome<input type="text" name="nome" value="' + esc(b.nome || "") + '" placeholder="Ex.: Vale-alimentação"></label>' +
      '<label>Começa depois de (meses de casa)<input type="number" name="carencia" min="0" max="120" value="' + esc(b.meses_carencia || 0) + '"></label>' +
      '<label>Quem recebe<select name="adesao">' + opc({ todos: "Todos que se encaixam", quem_aderir: "Só quem aderir" }, b.adesao) + "</select></label>" +
      '<label>Valor por pessoa (R$)<input type="text" name="valor" inputmode="decimal" value="' + esc(b.valor != null ? String(b.valor).replace(".", ",") : "") + '"></label>' +
      '<label>Valor por dependente (R$)<input type="text" name="valor_dep" inputmode="decimal" value="' + esc(b.valor_dependente != null ? String(b.valor_dependente).replace(".", ",") : "") + '"></label>' +
      '<label>Quem paga<select name="cobranca">' + opc({ empresa: "Empresa", desconto: "Desconto na folha", dividido: "Dividido" }, b.cobranca) + "</select></label>" +
      '<label class="check"><input type="checkbox" name="ativo"' + (b.ativo ? " checked" : "") + "> Em uso</label>" +
      '<p class="fin-sub">Vale para os contratos</p><div class="inteiro rh-marcar">' + Object.entries(CONTRATOS).map(([k, r]) => '<label><input type="checkbox" name="contratos" data-lista="1" value="' + k + '"' + ((b.tipos_contrato || []).includes(k) ? " checked" : "") + "> " + r + "</label>").join("") + "</div>" +
      '<label class="inteiro">Descrição<textarea name="descricao">' + esc(b.descricao || "") + "</textarea></label></div>",
      [item ? { rotulo: "Excluir", classe: "verm", acao: async () => { if (!(await confirmar("Excluir o benefício " + b.nome + "?", "Excluir"))) return; await executar(() => gravar(S.sb.from("rh_beneficios").delete().eq("id", b.id).eq("empresa_id", S.emp)), "Benefício excluído."); } } : null,
        { rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Salvar", acao: async () => {
        const v = campos($("rhModalCorpo"));
        if (!v.nome.trim()) return erroModal("Informe o nome.");
        if (!v.contratos?.length) return erroModal("Marque pelo menos um tipo de contrato.");
        const linha = { empresa_id: S.emp, nome: v.nome.trim(), meses_carencia: Math.max(0, parseInt(v.carencia, 10) || 0), adesao: v.adesao, valor: num(v.valor), valor_dependente: num(v.valor_dep), cobranca: v.cobranca, ativo: !!v.ativo, tipos_contrato: v.contratos, descricao: v.descricao || null };
        await executar(() => gravar(item ? S.sb.from("rh_beneficios").update(linha).eq("id", b.id).eq("empresa_id", S.emp) : S.sb.from("rh_beneficios").insert(linha)), "Benefício salvo.");
      } }]);
  }
  async function alternarAdesao(bId, pId) {
    const a = S.adesoes.find((x) => x.beneficio_id === bId && x.funcionario_id === pId);
    try {
      if (a) await gravar(S.sb.from("rh_beneficio_adesoes").delete().eq("id", a.id).eq("empresa_id", S.emp));
      else await gravar(S.sb.from("rh_beneficio_adesoes").insert({ empresa_id: S.emp, funcionario_id: pId, beneficio_id: bId, desde: hoje() }));
      await recarregar();
    } catch (e) { avisar(e.message, "Benefícios", "erro"); }
  }

  // ---------------------------------------------------------------- férias
  function pintarFerias() {
    const ativos = S.pessoas.filter((p) => situacao(p) !== "desligado");
    const precisa = [];
    ativos.forEach((p) => { const fe = feriasStatus(p); fe?.pendentes.forEach((x) => precisa.push({ p, x })); });
    precisa.sort((a, b) => a.x.limite.localeCompare(b.x.limite));
    const hj = hoje(), proximas = S.ferias.filter((f) => f.status !== "cancelada" && f.fim >= hj).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const agora = proximas.filter((f) => f.inicio <= hj).length, venc = precisa.filter((y) => y.x.vencida).length;
    const semAdm = ativos.filter((p) => ["clt", "aprendiz"].includes(contrato(p)) && !p.data_admissao).length;
    $("rhConteudo").innerHTML =
      '<section class="fin-cards">' + card("Em férias agora", agora, "pessoas") + card("Programadas", proximas.length - agora, "próximas saídas") + card("A tirar", precisa.length, "períodos com saldo") + card("Vencidas", venc, "passaram do prazo", venc ? "is-vermelho" : "") + "</section>" +
      (semAdm ? '<p class="fin-aviso">' + semAdm + " pessoa(s) CLT sem data de admissão: as férias delas não são calculadas. Complete em Editar dados.</p>" : "") +
      '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (S.podeEditar ? '<button class="fin-btn claro" data-acao="coletiva">Férias coletivas</button><button class="fin-btn" data-acao="programar-ferias">+ Programar férias</button>' : "") + "</div>" +
      '<section class="fin-bloco"><h3>Quem precisa tirar</h3>' + (precisa.length ? '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Pessoa</th><th>Período aquisitivo</th><th class="num">Saldo</th><th>Tirar até</th><th>Situação</th><th></th></tr></thead><tbody>' +
        precisa.map(({ p, x }) => '<tr><td><button type="button" class="rh-arquivo" data-pessoa="' + p.id + '" data-ir-aba="ferias">' + esc(p.nome) + "</button><br><small>" + esc(p.setor || "") + "</small></td><td>" + dataBr(x.inicio) + " a " + dataBr(x.fimAq) + '</td><td class="num"><b>' + x.saldo + " dias</b></td><td>" + dataBr(x.limite) + "</td><td>" + (x.vencida ? '<span class="rh-selo verm">Vencida</span>' : dias(hj, x.limite) <= 60 ? '<span class="rh-selo amar">Faltam ' + dias(hj, x.limite) + " dias</span>" : '<span class="rh-selo">Programar</span>') + '</td><td class="num">' + (S.podeEditar ? '<button class="fin-btn peq" data-acao="programar-ferias" data-pessoa-ferias="' + p.id + '" data-periodo="' + x.inicio + '">Programar</button>' : "") + "</td></tr>").join("") +
        "</tbody></table></div>" : '<div class="fin-vazio">Ninguém com férias a tirar.</div>') + "</section>" +
      '<h4 class="rh-grupo-titulo">Programadas e em andamento <span>' + proximas.length + "</span></h4>" + tabelaFerias(proximas, true);
  }
  function feriasModal(pId, periodo) {
    modal("Programar férias",
      '<div class="fin-form"><label class="inteiro">Pessoa<select name="pessoa">' + opcPessoas(pId, (p) => feriasStatus(p)) + "</select></label>" +
      '<label class="inteiro">Período aquisitivo<select name="periodo"></select></label>' +
      '<label>Saída<input type="date" name="inicio" value="' + somaDias(hoje(), 30) + '"></label>' +
      '<label>Dias de férias<input type="number" name="dias" min="5" max="30" value="30"></label>' +
      '<label>Abono (dias vendidos)<input type="number" name="abono" min="0" max="10" value="0"></label>' +
      '<label class="check"><input type="checkbox" name="aprovada" checked> Já aprovada</label>' +
      '<label class="inteiro">Observação<input type="text" name="observacao"></label><p class="fin-info" id="rhFeriasInfo"></p></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Programar", acao: async () => {
        const v = campos($("rhModalCorpo")), p = pessoa(v.pessoa), fe = p && feriasStatus(p), per = fe?.periodos.find((x) => x.inicio === v.periodo);
        const d = parseInt(v.dias, 10) || 0, ab = parseInt(v.abono, 10) || 0;
        if (!p) return erroModal("Escolha a pessoa.");
        if (!per) return erroModal("Escolha o período aquisitivo.");
        if (d < 5) return erroModal("O mínimo é 5 dias.");
        if (d + ab > per.saldo) return erroModal("Passa do saldo do período (" + per.saldo + " dias).");
        const fim = somaDias(v.inicio, d - 1);
        if (feriasAbertas(p).some((f) => f.inicio <= fim && f.fim >= v.inicio)) return erroModal("Já existe férias de " + p.nome + " nesse período.");
        await executar(() => gravar(S.sb.from("rh_ferias").insert({ empresa_id: S.emp, funcionario_id: p.id, periodo_inicio: per.inicio, inicio: v.inicio, fim, dias: d, abono_dias: ab, status: v.aprovada ? "aprovada" : "programada", aprovado_em: v.aprovada ? new Date().toISOString() : null, aprovado_por: v.aprovada ? (window.__CONTEXT?.usuario_id || null) : null, observacao: v.observacao || null })), "Férias programadas.");
      } }],
      (corpo) => {
        const pintarPer = () => {
          const p = pessoa(corpo.querySelector('[name="pessoa"]').value), fe = p && feriasStatus(p), sel = corpo.querySelector('[name="periodo"]');
          const lista = fe ? fe.periodos.filter((x) => x.saldo > 0) : [];
          sel.innerHTML = lista.length ? lista.map((x) => '<option value="' + x.inicio + '"' + ((periodo ? x.inicio === periodo : x === (fe.pendentes[0] || lista[0])) ? " selected" : "") + ">" + dataBr(x.inicio) + " a " + dataBr(x.fimAq) + " · saldo " + x.saldo + " dias" + (x.completo ? "" : " (em aquisição)") + "</option>").join("") : '<option value="">Sem saldo</option>';
          info();
        };
        const info = () => {
          const v = campos(corpo), d = parseInt(v.dias, 10) || 0;
          if (!v.inicio || !d) { $("rhFeriasInfo").textContent = ""; return; }
          const sem = dt(v.inicio).getDay(), aviso = sem === 0 || sem === 6 ? " Atenção: a saída cai no fim de semana." : sem === 5 ? " Atenção: a saída cai na sexta (a CLT não permite começar 2 dias antes de folga/feriado)." : "";
          $("rhFeriasInfo").textContent = "Volta em " + dataBr(somaDias(v.inicio, d)) + "." + aviso;
        };
        corpo.querySelector('[name="pessoa"]').addEventListener("change", pintarPer);
        corpo.addEventListener("input", info); pintarPer();
      });
  }
  function coletivaModal() {
    const elig = S.pessoas.filter((p) => feriasStatus(p)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    modal("Férias coletivas",
      '<div class="fin-form"><label class="inteiro">Nome<input type="text" name="nome" value="Coletiva de fim de ano"></label>' +
      '<label>Saída<input type="date" name="inicio"></label><label>Dias<input type="number" name="dias" min="10" max="30" value="15"></label>' +
      '<p class="fin-sub">Quem entra</p><div class="inteiro rh-links"><button type="button" data-marca="todos">marcar todos</button><button type="button" data-marca="nenhum">desmarcar</button>' + setores().map((s) => '<button type="button" data-marca-setor="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div>" +
      '<div class="inteiro">' + marcarHtml("pessoas", elig) + '</div><p class="fin-info">Desconta do período mais antigo com saldo de cada pessoa (ou do período em aquisição). Quem já tem férias nessas datas fica de fora.</p></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Programar coletiva", acao: async () => {
        const v = campos($("rhModalCorpo")), d = parseInt(v.dias, 10) || 0;
        if (!v.inicio) return erroModal("Informe a saída.");
        if (d < 10) return erroModal("Coletiva tem no mínimo 10 dias.");
        if (!v.pessoas?.length) return erroModal("Marque as pessoas.");
        const fim = somaDias(v.inicio, d - 1), grupo = uid(), linhas = [], fora = [];
        v.pessoas.forEach((id) => {
          const p = pessoa(id), fe = feriasStatus(p), per = fe.pendentes[0] || fe.periodos.filter((x) => x.saldo > 0).pop();
          if (!per || feriasAbertas(p).some((f) => f.inicio <= fim && f.fim >= v.inicio)) { fora.push(p.nome); return; }
          linhas.push({ empresa_id: S.emp, funcionario_id: id, periodo_inicio: per.inicio, inicio: v.inicio, fim, dias: Math.min(d, per.saldo), abono_dias: 0, status: "aprovada", coletiva_id: grupo, coletiva_nome: v.nome || "Coletiva", aprovado_em: new Date().toISOString(), aprovado_por: window.__CONTEXT?.usuario_id || null });
        });
        if (!linhas.length) return erroModal("Ninguém pôde entrar (sem saldo ou já com férias nessas datas).");
        await executar(() => gravar(S.sb.from("rh_ferias").insert(linhas)), "Coletiva programada para " + linhas.length + " pessoa(s)." + (fora.length ? " Ficaram de fora: " + fora.join(", ") + "." : ""));
      } }],
      (corpo) => corpo.addEventListener("click", (e) => {
        const b = e.target.closest("[data-marca],[data-marca-setor]"); if (!b) return;
        corpo.querySelectorAll('[name="pessoas"]').forEach((cx) => { if (b.dataset.marcaSetor) { if (pessoa(cx.value).setor === b.dataset.marcaSetor) cx.checked = true; } else cx.checked = b.dataset.marca === "todos"; });
      }));
  }
  async function feriasAcao(id, acao) {
    const f = S.ferias.find((x) => x.id === id);
    if (acao === "cancelar" && !(await confirmar("Cancelar as férias de " + (pessoa(f.funcionario_id)?.nome || "") + " (" + dataBr(f.inicio) + ")?", "Cancelar férias"))) return;
    try {
      await gravar(S.sb.from("rh_ferias").update(acao === "aprovar" ? { status: "aprovada", aprovado_em: new Date().toISOString(), aprovado_por: window.__CONTEXT?.usuario_id || null } : { status: "cancelada" }).eq("id", id).eq("empresa_id", S.emp));
      await recarregar();
    } catch (e) { avisar(e.message, "Férias", "erro"); }
  }

  // ---------------------------------------------------------------- admissão e desligamento
  function pintarMovimentacoes() {
    const abertos = S.checks.filter((c) => !c.concluido_em), feitos = S.checks.filter((c) => c.concluido_em).slice(0, 12);
    const recentes = S.pessoas.filter((p) => situacao(p) !== "desligado" && p.data_admissao && dias(p.data_admissao, hoje()) <= 120 && dias(p.data_admissao, hoje()) >= -60 && !S.checks.some((c) => c.funcionario_id === p.id && c.tipo === "admissao"));
    const ed = S.podeEditar;
    $("rhConteudo").innerHTML =
      '<div class="fin-barra-ferr"><span class="fin-esp"></span>' + (ed ? '<button class="fin-btn claro" data-acao="desligar-escolher">Registrar desligamento</button><button class="fin-btn" data-acao="admissao">+ Nova admissão</button>' : "") + "</div>" +
      (recentes.length ? '<section class="fin-bloco"><h3>Admissões recentes sem checklist</h3><table class="fin-tabela"><tbody>' + recentes.map((p) => '<tr><td><button type="button" class="rh-arquivo" data-pessoa="' + p.id + '">' + esc(p.nome) + "</button><br><small>" + esc([p.cargo, p.setor].filter(Boolean).join(" · ")) + "</small></td><td>Admissão " + dataBr(p.data_admissao) + '</td><td class="num">' + (ed ? '<button class="fin-btn peq" data-iniciar-check="' + p.id + '">Iniciar checklist</button>' : "") + "</td></tr>").join("") + "</tbody></table></section>" : "") +
      '<h4 class="rh-grupo-titulo">Em andamento <span>' + abertos.length + "</span></h4>" +
      (abertos.length ? '<div class="fin-contas-grade">' + abertos.map(checklistHtml).join("") + "</div>" : '<div class="fin-vazio">Nenhuma admissão ou desligamento em andamento.</div>') +
      (feitos.length ? '<h4 class="rh-grupo-titulo">Concluídos recentemente</h4><section class="fin-bloco"><table class="fin-tabela"><tbody>' + feitos.map((c) => { const p = pessoa(c.funcionario_id); return "<tr><td><b>" + esc(p?.nome || "-") + "</b></td><td>" + (c.tipo === "admissao" ? "Admissão" : "Desligamento") + "</td><td>Concluído em " + dataBr(c.concluido_em) + "</td></tr>"; }).join("") + "</tbody></table></section>" : "");
  }
  function checklistHtml(c) {
    const p = pessoa(c.funcionario_id), it = c.itens || [], feitos = it.filter((x) => x.feito).length;
    return '<article class="fin-conta"><h4>' + (c.tipo === "admissao" ? '<span class="rh-selo verde">Admissão</span> ' : '<span class="rh-selo verm">Desligamento</span> ') + esc(p?.nome || "-") + "</h4>" +
      '<div class="linha">' + esc([p?.cargo, p?.setor].filter(Boolean).join(" · ")) + (c.tipo === "admissao" && p?.data_admissao ? " · admissão " + dataBr(p.data_admissao) : "") + (c.tipo === "desligamento" && ficha(p).desligamento_data ? " · desligado em " + dataBr(ficha(p).desligamento_data) : "") + "</div>" +
      '<div class="rh-barra"><i style="width:' + (it.length ? Math.round((feitos / it.length) * 100) : 0) + '%"></i></div><div class="linha">' + feitos + " de " + it.length + "</div>" +
      '<ul class="rh-check">' + it.map((x, i) => '<li class="' + (x.feito ? "feito" : "") + '"><input type="checkbox" data-check="' + c.id + '" data-i="' + i + '"' + (x.feito ? " checked" : "") + (S.podeEditar ? "" : " disabled") + "><span>" + esc(x.texto) + "</span></li>").join("") + "</ul>" +
      (S.podeEditar ? '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="fin-btn peq ' + (feitos === it.length ? "verde" : "claro") + '" data-concluir-check="' + c.id + '">Concluir</button><button class="fin-btn peq claro" data-pessoa="' + c.funcionario_id + '">Abrir ficha</button></div>' : "") + "</article>";
  }
  async function marcarItem(id, i, marcado) {
    const c = S.checks.find((x) => x.id === id); if (!c) return;
    const itens = (c.itens || []).map((x, k) => (k === i ? { ...x, feito: marcado, em: marcado ? new Date().toISOString() : null } : x));
    try { await gravar(S.sb.from("rh_checklists").update({ itens }).eq("id", id).eq("empresa_id", S.emp)); c.itens = itens; pintarMovimentacoes(); }
    catch (e) { avisar(e.message, "Checklist", "erro"); pintarMovimentacoes(); }
  }
  async function concluirCheck(id) {
    const c = S.checks.find((x) => x.id === id), falta = (c.itens || []).filter((x) => !x.feito).length;
    if (falta && !(await confirmar("Ainda falta" + (falta > 1 ? "m " + falta + " itens" : " 1 item") + ". Concluir mesmo assim?", "Concluir checklist"))) return;
    try { await gravar(S.sb.from("rh_checklists").update({ concluido_em: new Date().toISOString() }).eq("id", id).eq("empresa_id", S.emp)); await recarregar(); }
    catch (e) { avisar(e.message, "Checklist", "erro"); }
  }
  async function iniciarCheck(pId) {
    try { await gravar(S.sb.from("rh_checklists").insert({ empresa_id: S.emp, funcionario_id: pId, tipo: "admissao", itens: CHECK_ADMISSAO.map((t) => ({ texto: t, feito: false })) })); await recarregar(); }
    catch (e) { avisar(e.message, "Checklist", "erro"); }
  }
  function desligarEscolher() {
    modal("Registrar desligamento", '<div class="fin-form"><label class="inteiro">Pessoa<select name="pessoa">' + opcPessoas(null, (p) => !p.eu) + "</select></label></div>",
      [{ rotulo: "Cancelar", classe: "claro", acao: fechar }, { rotulo: "Continuar", acao: () => { const p = pessoa(campos($("rhModalCorpo")).pessoa); if (!p) return erroModal("Escolha a pessoa."); statusModal(p, "desligar"); } }]);
  }
  function novaAdmissao() { location.href = "../CadastroFuncionarios/cadastro-funcionarios.html?novo=1"; }

  // ---------------------------------------------------------------- eventos
  async function apagar(tabela, id) {
    if (!(await confirmar("Excluir este registro? O arquivo anexado também é apagado.", "Excluir"))) return;
    const lista = tabela === "rh_exames" ? S.exames : S.docs, item = lista.find((x) => x.id === id);
    try {
      await gravar(S.sb.from(tabela).delete().eq("id", id).eq("empresa_id", S.emp));
      if (item?.arquivo_path && !item.turma_id) await S.sb.storage.from("rh-documentos").remove([item.arquivo_path]);
      await recarregar();
    } catch (e) { avisar(e.message, "Gestão de Pessoas", "erro"); }
  }
  function ligar() {
    $("rhAbas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (!b) return; S.aba = b.dataset.aba; S.ficha = null; window.scrollTo(0, 0); pintar(); });
    $("rhModalRodape").addEventListener("click", (e) => { const b = e.target.closest("[data-bt]"); if (b) botoes[Number(b.dataset.bt)]?.acao(); });
    $("rhModal").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fechar(); });
    $("rhConteudo").addEventListener("change", (e) => { const cx = e.target.closest("[data-check]"); if (cx) marcarItem(cx.dataset.check, Number(cx.dataset.i), cx.checked); });
    $("rhConteudo").addEventListener("click", (e) => {
      const b = e.target.closest("button,[data-pessoa]"); if (!b || b.matches("[data-check]")) return;
      const d = b.dataset, p = S.ficha ? pessoa(S.ficha) : null;
      if (d.arquivo) return abrirArquivo(d.arquivo);
      if (d.subaba) { S.fichaAba = d.subaba; return pintarFicha(); }
      if (d.pessoa && !d.acao) return abrirFicha(d.pessoa, d.irAba);
      if (d.apagar) return apagar(d.apagar, d.id);
      if (d.adesao) return alternarAdesao(d.adesao, d.pessoaAdesao);
      if (d.feriasAprovar) return feriasAcao(d.feriasAprovar, "aprovar");
      if (d.feriasCancelar) return feriasAcao(d.feriasCancelar, "cancelar");
      if (d.iniciarCheck) return iniciarCheck(d.iniciarCheck);
      if (d.concluirCheck) return concluirCheck(d.concluirCheck);
      if (d.editarCad) return cadastroModal(d.editarCad, (d.editarCad === "rh_exames_cadastro" ? S.examesCad : S.treinos).find((x) => x.id === d.id));
      if (d.editarBeneficio) return beneficioModal(S.benef.find((x) => x.id === d.editarBeneficio));
      switch (d.acao) {
        case "voltar-lista": S.ficha = null; return pintar();
        case "editar-ficha": return editarFicha(p);
        case "afastar": return statusModal(p, "afastar");
        case "desligar": return statusModal(p, "desligar");
        case "reativar": return statusModal(p, "reativar");
        case "novo-doc": return docModal(p);
        case "novo-exame": return exameModal(S.aba === "pessoas" ? p : null);
        case "nova-turma": return turmaModal(d.pessoaTurma || null);
        case "novo-cad-exame": return cadastroModal("rh_exames_cadastro");
        case "novo-cad-treino": return cadastroModal("rh_treinamentos");
        case "novo-beneficio": return beneficioModal();
        case "programar-ferias": return feriasModal(d.pessoaFerias || null, d.periodo || null);
        case "coletiva": return coletivaModal();
        case "admissao": return novaAdmissao();
        case "desligar-escolher": return desligarEscolher();
      }
    });
  }

  async function iniciar() {
    ligar();
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient;
    S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if (!S.sb || !S.emp) { $("rhConteudo").innerHTML = '<div class="fin-vazio">Entre no sistema para ver a Gestão de Pessoas.</div>'; return; }
    try { await window.EasyLocPermissions?.load?.(); } catch (e) { /* segue: o banco confere de novo */ }
    S.podeEditar = !!window.EasyLocPermissions?.hasPermission?.("rh.colaboradores.editar", false);
    const q = new URLSearchParams(location.search);
    if (q.get("aba") && document.querySelector('#rhAbas [data-aba="' + q.get("aba") + '"]')) S.aba = q.get("aba");
    await recarregar();
    if (q.get("pessoa") && pessoa(q.get("pessoa"))) abrirFicha(q.get("pessoa"));
  }
  iniciar().catch((e) => { console.error(e); $("rhConteudo").innerHTML = '<div class="fin-vazio">Não foi possível abrir a Gestão de Pessoas.</div>'; });
})();
