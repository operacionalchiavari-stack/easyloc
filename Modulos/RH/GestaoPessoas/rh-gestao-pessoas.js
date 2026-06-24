(function () {
  "use strict";

  const T = {
    colaboradores: "rh_colaboradores",
    documentos: "rh_colaborador_documentos",
    ocorrencias: "rh_ocorrencias",
    solicitacoes: "rh_solicitacoes",
    comentarios: "rh_solicitacao_comentarios",
    anexos: "rh_anexos"
  };

  const OCORRENCIA_TIPOS = [
    "Atraso", "Falta", "Sem Uniforme", "Sem EPI", "Uso Indevido de Celular",
    "Advertencia Verbal", "Advertencia Escrita", "Elogio", "Destaque do Mes",
    "Dano Material", "Retrabalho", "Outros"
  ];

  const SOLICITACAO_TIPOS = [
    "Folga", "Troca de Escala", "Justificativa de Falta", "Adiantamento",
    "Uniforme", "EPI", "Manutencao de Ferramenta", "Solicitacao Geral"
  ];

  const state = {
    activeTab: "colaboradores",
    colaboradores: [],
    documentos: [],
    ocorrencias: [],
    solicitacoes: [],
    comentarios: [],
    sort: {
      colaboradores: { key: "nome_completo", dir: "asc" },
      ocorrencias: { key: "data_ocorrencia", dir: "desc" },
      solicitacoes: { key: "updated_at", dir: "desc" }
    },
    page: { colaboradores: 1, ocorrencias: 1, solicitacoes: 1 },
    pageSize: 20,
    initialized: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sb = () => window.supabaseClient || window.supabase || null;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;
  const usuarioId = () => window.__CONTEXT?.usuario_id || window.usuario_id || null;
  const usuarioNome = () => window.__CONTEXT?.usuario_nome || window.__USER?.nome || "Usuario logado";

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function dateBR(value) {
    if (!value) return "-";
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR");
  }

  function shortDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
    }[m]));
  }

  function notify(message, title = "RH") {
    if (typeof window.alerta === "function") return window.alerta(message, title, "aviso");
    if (typeof window.mostrarAlerta === "function") return window.mostrarAlerta(message, title);
    alert(message);
  }

  async function confirmAction(message) {
    if (typeof window.confirmarGlobal === "function") {
      return window.confirmarGlobal(message, "Confirmar", { confirmarTexto: "Confirmar", tipo: "warning" });
    }
    return confirm(message);
  }

  function finishLoading() {
    if (typeof window.finalizarCarregamentoModulo === "function") {
      window.finalizarCarregamentoModulo();
    }
  }

  function setLoading(isLoading) {
    const btn = $("#rhRefreshBtn");
    if (btn) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? "Carregando..." : "Atualizar";
    }
  }

  function statusClass(value) {
    return normalize(value).replace(/\s+/g, "-");
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0] || "").join("").toUpperCase() || "?";
  }

  function getColaborador(id) {
    return state.colaboradores.find(item => String(item.id) === String(id));
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([
        loadTable("colaboradores"),
        loadTable("documentos"),
        loadTable("ocorrencias"),
        loadTable("solicitacoes"),
        loadTable("comentarios")
      ]);
      hydrateFilters();
      renderAll();
    } catch (error) {
      console.error("[RH] erro ao carregar:", error);
      notify("Nao foi possivel carregar o RH. Verifique se a migration foi aplicada.");
    } finally {
      setLoading(false);
      finishLoading();
    }
  }

  async function loadTable(key) {
    const client = sb();
    if (!client || !empresaId()) {
      state[key] = [];
      return;
    }
    const table = T[key];
    let query = client.from(table).select("*").eq("empresa_id", empresaId());
    if (key === "colaboradores") query = query.order("nome_completo", { ascending: true });
    if (key === "ocorrencias") query = query.order("data_ocorrencia", { ascending: false });
    if (key === "solicitacoes" || key === "comentarios") query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.warn(`[RH] ${table}:`, error);
      state[key] = [];
      return;
    }
    state[key] = data || [];
  }

  function hydrateFilters() {
    fillOptions("#rhColSetor", unique(state.colaboradores.map(i => i.setor)), "Todos os setores");
    fillOptions("#rhColFuncao", unique(state.colaboradores.map(i => i.funcao)), "Todas as funcoes");
    fillOptions("#rhOcSetor", unique(state.colaboradores.map(i => i.setor)), "Todos os setores");
    fillOptions("#rhOcTipo", OCORRENCIA_TIPOS, "Todos os tipos");
    fillOptions("#rhSolTipo", SOLICITACAO_TIPOS, "Todos os tipos");
    fillColaboradorOptions("#rhOcColaborador", "Todos os colaboradores");
    fillColaboradorOptions("#rhSolColaborador", "Todos os colaboradores");
    fillColaboradorOptions("#rhOcFormColaborador", "Selecione");
    fillColaboradorOptions("#rhSolFormColaborador", "Selecione");
    fillOptions("#rhOcFormTipo", OCORRENCIA_TIPOS, "Selecione");
    fillOptions("#rhSolFormTipo", SOLICITACAO_TIPOS, "Selecione");
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }

  function fillOptions(selector, values, first) {
    const el = $(selector);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option>${escapeHtml(v)}</option>`).join("");
    if (values.includes(current)) el.value = current;
  }

  function fillColaboradorOptions(selector, first) {
    const el = $(selector);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${first}</option>` + state.colaboradores.map(item =>
      `<option value="${item.id}">${escapeHtml(item.nome_completo)}</option>`
    ).join("");
    if (current) el.value = current;
  }

  function renderAll() {
    renderColaboradores();
    renderOcorrencias();
    renderSolicitacoes();
    updatePrimaryButton();
  }

  function sortRows(rows, tab) {
    const cfg = state.sort[tab];
    const dir = cfg.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => String(a[cfg.key] || "").localeCompare(String(b[cfg.key] || ""), "pt-BR") * dir);
  }

  function paginate(rows, tab) {
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page[tab] = Math.min(state.page[tab], totalPages);
    const start = (state.page[tab] - 1) * state.pageSize;
    return { rows: rows.slice(start, start + state.pageSize), totalPages };
  }

  function renderPagination(tab, selector, total, totalPages) {
    const el = $(selector);
    if (!el) return;
    const buttons = [];
    for (let i = 1; i <= totalPages; i++) {
      buttons.push(`<button class="rh-page-btn ${i === state.page[tab] ? "active" : ""}" data-page-tab="${tab}" data-page="${i}">${i}</button>`);
    }
    const start = total ? ((state.page[tab] - 1) * state.pageSize) + 1 : 0;
    const end = Math.min(total, state.page[tab] * state.pageSize);
    el.innerHTML = `<span>Mostrando ${start}-${end} de ${total} registros</span><div>${buttons.join("")}</div>`;
  }

  function renderColaboradores() {
    const q = normalize($("#rhColSearch")?.value);
    const setor = $("#rhColSetor")?.value || "";
    const funcao = $("#rhColFuncao")?.value || "";
    const status = $("#rhColStatus")?.value || "";
    let rows = state.colaboradores.filter(item => {
      const text = normalize([item.nome_completo, item.cpf, item.rg, item.telefone, item.email, item.setor, item.funcao].join(" "));
      return (!q || text.includes(q)) && (!setor || item.setor === setor) && (!funcao || item.funcao === funcao) && (!status || item.status === status);
    });
    rows = sortRows(rows, "colaboradores");
    const page = paginate(rows, "colaboradores");
    $("#rhColaboradoresBody").innerHTML = page.rows.length ? page.rows.map(item => `
      <tr>
        <td>${item.foto_url ? `<img class="rh-avatar" src="${escapeHtml(item.foto_url)}" alt="">` : `<span class="rh-avatar">${initials(item.nome_completo)}</span>`}</td>
        <td><strong>${escapeHtml(item.nome_completo)}</strong><br><span class="rh-muted">${escapeHtml(item.email || "")}</span></td>
        <td>${escapeHtml(item.setor || "-")}</td>
        <td>${escapeHtml(item.funcao || "-")}</td>
        <td>${escapeHtml(item.telefone || "-")}</td>
        <td>${dateBR(item.data_admissao)}</td>
        <td><span class="rh-status ${statusClass(item.status)}">${escapeHtml(item.status || "Ativo")}</span></td>
        <td><div class="rh-row-actions">
          <button class="rh-icon-btn" title="Abrir" data-action="open-col" data-id="${item.id}">Ver</button>
          <button class="rh-icon-btn danger" title="Excluir" data-action="delete-col" data-id="${item.id}">X</button>
        </div></td>
      </tr>
    `).join("") : `<tr><td colspan="8" class="rh-empty">Nenhum colaborador encontrado.</td></tr>`;
    renderPagination("colaboradores", "#rhColaboradoresPagination", rows.length, page.totalPages);
  }

  function renderOcorrencias() {
    const data = $("#rhOcData")?.value || "";
    const colaboradorId = $("#rhOcColaborador")?.value || "";
    const setor = $("#rhOcSetor")?.value || "";
    const tipo = $("#rhOcTipo")?.value || "";
    let rows = state.ocorrencias.filter(item =>
      (!data || item.data_ocorrencia === data) &&
      (!colaboradorId || item.colaborador_id === colaboradorId) &&
      (!setor || item.setor === setor) &&
      (!tipo || item.tipo === tipo)
    );
    rows = sortRows(rows, "ocorrencias");
    const page = paginate(rows, "ocorrencias");
    $("#rhOcorrenciasBody").innerHTML = page.rows.length ? page.rows.map(item => `
      <tr>
        <td>${dateBR(item.data_ocorrencia)}</td>
        <td><strong>${escapeHtml(item.colaborador_nome || "-")}</strong></td>
        <td>${escapeHtml(item.setor || "-")}</td>
        <td><span class="rh-chip">${escapeHtml(item.tipo || "-")}</span></td>
        <td>${escapeHtml(item.responsavel_nome || "-")}</td>
        <td>${escapeHtml((item.descricao || "").slice(0, 90))}${(item.descricao || "").length > 90 ? "..." : ""}</td>
        <td><div class="rh-row-actions">
          <button class="rh-icon-btn" data-action="open-oc" data-id="${item.id}">Ver</button>
          <button class="rh-icon-btn danger" data-action="delete-oc" data-id="${item.id}">X</button>
        </div></td>
      </tr>
    `).join("") : `<tr><td colspan="7" class="rh-empty">Nenhuma ocorrencia registrada.</td></tr>`;
    renderPagination("ocorrencias", "#rhOcorrenciasPagination", rows.length, page.totalPages);
  }

  function renderSolicitacoes() {
    const q = normalize($("#rhSolSearch")?.value);
    const colaboradorId = $("#rhSolColaborador")?.value || "";
    const tipo = $("#rhSolTipo")?.value || "";
    const status = $("#rhSolStatus")?.value || "";
    let rows = state.solicitacoes.filter(item => {
      const text = normalize([item.colaborador_nome, item.tipo, item.status, item.responsavel_nome, item.descricao].join(" "));
      return (!q || text.includes(q)) && (!colaboradorId || item.colaborador_id === colaboradorId) && (!tipo || item.tipo === tipo) && (!status || item.status === status);
    });
    rows = sortRows(rows, "solicitacoes");
    const page = paginate(rows, "solicitacoes");
    $("#rhSolicitacoesBody").innerHTML = page.rows.length ? page.rows.map(item => `
      <tr>
        <td>${shortDateTime(item.created_at)}</td>
        <td><strong>${escapeHtml(item.colaborador_nome || "-")}</strong></td>
        <td>${escapeHtml(item.tipo || "-")}</td>
        <td><span class="rh-status ${statusClass(item.status)}">${escapeHtml(item.status || "Pendente")}</span></td>
        <td>${escapeHtml(item.responsavel_nome || "-")}</td>
        <td>${shortDateTime(item.updated_at || item.created_at)}</td>
        <td><div class="rh-row-actions">
          <button class="rh-icon-btn" data-action="open-sol" data-id="${item.id}">Ver</button>
          <button class="rh-icon-btn danger" data-action="delete-sol" data-id="${item.id}">X</button>
        </div></td>
      </tr>
    `).join("") : `<tr><td colspan="7" class="rh-empty">Nenhuma solicitacao encontrada.</td></tr>`;
    renderPagination("solicitacoes", "#rhSolicitacoesPagination", rows.length, page.totalPages);
  }

  function updatePrimaryButton() {
    const labels = {
      colaboradores: "Novo Colaborador",
      ocorrencias: "Nova Ocorrencia",
      solicitacoes: "Nova Solicitacao"
    };
    $("#rhPrimaryBtn").textContent = labels[state.activeTab];
  }

  function switchTab(tab) {
    state.activeTab = tab;
    $$(".rh-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    $$(".rh-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab));
    updatePrimaryButton();
  }

  function openModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function openColaborador(item = null) {
    $("#rhColModalTitle").textContent = item ? "Editar colaborador" : "Novo colaborador";
    $("#rhColId").value = item?.id || "";
    $("#rhNomeCompleto").value = item?.nome_completo || "";
    $("#rhCpf").value = item?.cpf || "";
    $("#rhRg").value = item?.rg || "";
    $("#rhDataNascimento").value = item?.data_nascimento || "";
    $("#rhTelefone").value = item?.telefone || "";
    $("#rhWhatsapp").value = item?.whatsapp || "";
    $("#rhEmail").value = item?.email || "";
    $("#rhEndereco").value = item?.endereco || "";
    $("#rhSetor").value = item?.setor || "";
    $("#rhFuncao").value = item?.funcao || "";
    $("#rhDataAdmissao").value = item?.data_admissao || "";
    $("#rhStatus").value = item?.status || "Ativo";
    $("#rhObservacoes").value = item?.observacoes || "";
    $$(".rh-doc-grid input[type=file]").forEach(input => input.value = "");
    renderColaboradorHistorico(item?.id || "");
    switchColInnerTab("dados");
    openModal("rhColaboradorModal");
  }

  function switchColInnerTab(tab) {
    $$(".rh-inner-tabs button").forEach(btn => btn.classList.toggle("active", btn.dataset.coltab === tab));
    $$(".rh-col-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.colpanel === tab));
  }

  function renderColaboradorHistorico(colaboradorId) {
    const docs = state.documentos.filter(item => item.colaborador_id === colaboradorId);
    $("#rhDocumentosList").innerHTML = docs.length ? docs.map(doc => `
      <div class="rh-doc-item"><strong>${escapeHtml(doc.tipo)}</strong><br><span class="rh-muted">${escapeHtml(doc.nome_arquivo || doc.storage_path || "-")}</span></div>
    `).join("") : `<div class="rh-empty">Os documentos aparecerao aqui depois de salvar.</div>`;
    const ocorrencias = state.ocorrencias.filter(item => item.colaborador_id === colaboradorId);
    $("#rhColOcorrenciasHistorico").innerHTML = ocorrencias.length ? ocorrencias.map(item => `
      <div class="rh-history-item"><strong>${dateBR(item.data_ocorrencia)} - ${escapeHtml(item.tipo)}</strong><br>${escapeHtml(item.descricao || "")}</div>
    `).join("") : `<div class="rh-empty">Sem ocorrencias.</div>`;
    const solicitacoes = state.solicitacoes.filter(item => item.colaborador_id === colaboradorId);
    $("#rhColSolicitacoesHistorico").innerHTML = solicitacoes.length ? solicitacoes.map(item => `
      <div class="rh-history-item"><strong>${escapeHtml(item.tipo)} - ${escapeHtml(item.status)}</strong><br>${escapeHtml(item.descricao || "")}</div>
    `).join("") : `<div class="rh-empty">Sem solicitacoes.</div>`;
  }

  async function saveColaborador() {
    const client = sb();
    if (!client || !empresaId()) return notify("Supabase ou empresa nao encontrados.");
    const id = $("#rhColId").value;
    const payload = {
      empresa_id: empresaId(),
      nome_completo: $("#rhNomeCompleto").value.trim(),
      cpf: $("#rhCpf").value.trim(),
      rg: $("#rhRg").value.trim(),
      data_nascimento: $("#rhDataNascimento").value || null,
      telefone: $("#rhTelefone").value.trim(),
      whatsapp: $("#rhWhatsapp").value.trim(),
      email: $("#rhEmail").value.trim(),
      endereco: $("#rhEndereco").value.trim(),
      setor: $("#rhSetor").value.trim(),
      funcao: $("#rhFuncao").value.trim(),
      data_admissao: $("#rhDataAdmissao").value || null,
      status: $("#rhStatus").value,
      observacoes: $("#rhObservacoes").value.trim(),
      atualizado_por: usuarioId()
    };
    if (!payload.nome_completo) return notify("Informe o nome do colaborador.");
    const query = id
      ? client.from(T.colaboradores).update(payload).eq("id", id).select().single()
      : client.from(T.colaboradores).insert({ ...payload, criado_por: usuarioId() }).select().single();
    const { data, error } = await query;
    if (error) {
      console.error("[RH] salvar colaborador:", error);
      return notify("Nao foi possivel salvar o colaborador.");
    }
    await uploadPendingFiles(data.id, "colaborador");
    closeModal("rhColaboradorModal");
    await loadAll();
    notify("Colaborador salvo.");
  }

  async function uploadPendingFiles(recordId, origemTipo) {
    const files = [];
    if (origemTipo === "colaborador") {
      $$(".rh-doc-grid input[type=file]").forEach(input => {
        Array.from(input.files || []).forEach(file => files.push({ file, tipo: input.dataset.docType || "Outros" }));
      });
    }
    if (!files.length) return;
    const client = sb();
    for (const item of files) {
      const safeName = item.file.name.replace(/[^\w.\-]+/g, "-");
      const path = `${empresaId()}/${recordId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await client.storage.from("rh-documentos").upload(path, item.file, { upsert: false });
      if (uploadError) {
        console.warn("[RH] upload documento:", uploadError);
        continue;
      }
      await client.from(T.documentos).insert({
        empresa_id: empresaId(),
        colaborador_id: recordId,
        tipo: item.tipo,
        nome_arquivo: item.file.name,
        storage_path: path,
        mime_type: item.file.type,
        tamanho: item.file.size,
        criado_por: usuarioId()
      });
    }
  }

  function openOcorrencia(item = null) {
    $("#rhOcModalTitle").textContent = item ? "Editar ocorrencia" : "Nova ocorrencia";
    $("#rhOcId").value = item?.id || "";
    $("#rhOcFormColaborador").value = item?.colaborador_id || "";
    $("#rhOcFormTipo").value = item?.tipo || "";
    $("#rhOcFormData").value = item?.data_ocorrencia || new Date().toISOString().slice(0, 10);
    $("#rhOcFormResponsavel").value = item?.responsavel_nome || usuarioNome();
    $("#rhOcFormDescricao").value = item?.descricao || "";
    $("#rhOcFormAnexos").value = "";
    openModal("rhOcorrenciaModal");
  }

  async function saveOcorrencia() {
    const client = sb();
    if (!client || !empresaId()) return notify("Supabase ou empresa nao encontrados.");
    const colaborador = getColaborador($("#rhOcFormColaborador").value);
    if (!colaborador) return notify("Selecione o colaborador.");
    const id = $("#rhOcId").value;
    const payload = {
      empresa_id: empresaId(),
      colaborador_id: colaborador.id,
      colaborador_nome: colaborador.nome_completo,
      setor: colaborador.setor || "",
      tipo: $("#rhOcFormTipo").value,
      data_ocorrencia: $("#rhOcFormData").value || new Date().toISOString().slice(0, 10),
      descricao: $("#rhOcFormDescricao").value.trim(),
      responsavel_id: usuarioId(),
      responsavel_nome: $("#rhOcFormResponsavel").value.trim() || usuarioNome()
    };
    if (!payload.tipo) return notify("Selecione o tipo da ocorrencia.");
    const query = id
      ? client.from(T.ocorrencias).update(payload).eq("id", id).select().single()
      : client.from(T.ocorrencias).insert(payload).select().single();
    const { error } = await query;
    if (error) {
      console.error("[RH] salvar ocorrencia:", error);
      return notify("Nao foi possivel salvar a ocorrencia.");
    }
    closeModal("rhOcorrenciaModal");
    await loadAll();
    notify("Ocorrencia salva.");
  }

  function openSolicitacao(item = null) {
    $("#rhSolModalTitle").textContent = item ? "Editar solicitacao" : "Nova solicitacao";
    $("#rhSolId").value = item?.id || "";
    $("#rhSolFormColaborador").value = item?.colaborador_id || "";
    $("#rhSolFormTipo").value = item?.tipo || "";
    $("#rhSolFormStatus").value = item?.status || "Pendente";
    $("#rhSolFormResponsavel").value = item?.responsavel_nome || usuarioNome();
    $("#rhSolFormDescricao").value = item?.descricao || "";
    $("#rhSolFormComentario").value = "";
    $("#rhSolFormAnexos").value = "";
    renderSolicitacaoHistorico(item?.id || "");
    openModal("rhSolicitacaoModal");
  }

  function renderSolicitacaoHistorico(solicitacaoId) {
    const rows = state.comentarios.filter(item => item.solicitacao_id === solicitacaoId);
    $("#rhSolHistorico").innerHTML = solicitacaoId
      ? (rows.length ? rows.map(item => `
        <div class="rh-history-item">
          <strong>${shortDateTime(item.created_at)} - ${escapeHtml(item.usuario_nome || "-")}</strong>
          <br>${escapeHtml(item.comentario || "Status atualizado.")}
          ${item.status_para ? `<br><span class="rh-muted">${escapeHtml(item.status_de || "-")} -> ${escapeHtml(item.status_para)}</span>` : ""}
        </div>
      `).join("") : `<div class="rh-empty">Sem historico ainda.</div>`)
      : `<div class="rh-empty">O historico sera criado ao salvar.</div>`;
  }

  async function saveSolicitacao() {
    const client = sb();
    if (!client || !empresaId()) return notify("Supabase ou empresa nao encontrados.");
    const colaborador = getColaborador($("#rhSolFormColaborador").value);
    if (!colaborador) return notify("Selecione o colaborador.");
    const id = $("#rhSolId").value;
    const previous = state.solicitacoes.find(item => item.id === id);
    const payload = {
      empresa_id: empresaId(),
      colaborador_id: colaborador.id,
      colaborador_nome: colaborador.nome_completo,
      tipo: $("#rhSolFormTipo").value,
      status: $("#rhSolFormStatus").value,
      descricao: $("#rhSolFormDescricao").value.trim(),
      responsavel_id: usuarioId(),
      responsavel_nome: $("#rhSolFormResponsavel").value.trim() || usuarioNome(),
      updated_at: new Date().toISOString()
    };
    if (!payload.tipo) return notify("Selecione o tipo da solicitacao.");
    const query = id
      ? client.from(T.solicitacoes).update(payload).eq("id", id).select().single()
      : client.from(T.solicitacoes).insert(payload).select().single();
    const { data, error } = await query;
    if (error) {
      console.error("[RH] salvar solicitacao:", error);
      return notify("Nao foi possivel salvar a solicitacao.");
    }
    const comentario = $("#rhSolFormComentario").value.trim();
    if (comentario || !id || previous?.status !== payload.status) {
      await client.from(T.comentarios).insert({
        empresa_id: empresaId(),
        solicitacao_id: data.id,
        comentario: comentario || (id ? "Status atualizado." : "Solicitacao criada."),
        status_de: previous?.status || null,
        status_para: payload.status,
        usuario_id: usuarioId(),
        usuario_nome: usuarioNome()
      });
    }
    closeModal("rhSolicitacaoModal");
    await loadAll();
    notify("Solicitacao salva.");
  }

  async function deleteRow(table, id) {
    const ok = await confirmAction("Deseja excluir este registro?");
    if (!ok) return;
    const { error } = await sb().from(table).delete().eq("id", id).eq("empresa_id", empresaId());
    if (error) {
      console.error("[RH] excluir:", error);
      return notify("Nao foi possivel excluir.");
    }
    await loadAll();
  }

  function bindEvents() {
    $$(".rh-tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    $("#rhRefreshBtn").addEventListener("click", loadAll);
    $("#rhPrimaryBtn").addEventListener("click", () => {
      if (state.activeTab === "colaboradores") return openColaborador();
      if (state.activeTab === "ocorrencias") return openOcorrencia();
      return openSolicitacao();
    });
    ["rhColSearch", "rhColSetor", "rhColFuncao", "rhColStatus"].forEach(id => $(`#${id}`)?.addEventListener("input", () => { state.page.colaboradores = 1; renderColaboradores(); }));
    ["rhOcData", "rhOcColaborador", "rhOcSetor", "rhOcTipo"].forEach(id => $(`#${id}`)?.addEventListener("input", () => { state.page.ocorrencias = 1; renderOcorrencias(); }));
    ["rhSolSearch", "rhSolColaborador", "rhSolTipo", "rhSolStatus"].forEach(id => $(`#${id}`)?.addEventListener("input", () => { state.page.solicitacoes = 1; renderSolicitacoes(); }));
    $("#rhSalvarColaborador").addEventListener("click", saveColaborador);
    $("#rhSalvarOcorrencia").addEventListener("click", saveOcorrencia);
    $("#rhSalvarSolicitacao").addEventListener("click", saveSolicitacao);
    document.addEventListener("click", onDocumentClick);
  }

  function onDocumentClick(event) {
    const close = event.target.closest("[data-close-modal]");
    if (close) closeModal(close.dataset.closeModal);
    const pageBtn = event.target.closest("[data-page-tab]");
    if (pageBtn) {
      state.page[pageBtn.dataset.pageTab] = Number(pageBtn.dataset.page || 1);
      renderAll();
    }
    const sortTh = event.target.closest(".rh-table th[data-sort]");
    if (sortTh) {
      const panel = sortTh.closest(".rh-panel")?.dataset.panel;
      const cfg = state.sort[panel];
      cfg.dir = cfg.key === sortTh.dataset.sort && cfg.dir === "asc" ? "desc" : "asc";
      cfg.key = sortTh.dataset.sort;
      renderAll();
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const id = action.dataset.id;
    if (action.dataset.action === "open-col") openColaborador(getColaborador(id));
    if (action.dataset.action === "delete-col") deleteRow(T.colaboradores, id);
    if (action.dataset.action === "open-oc") openOcorrencia(state.ocorrencias.find(i => i.id === id));
    if (action.dataset.action === "delete-oc") deleteRow(T.ocorrencias, id);
    if (action.dataset.action === "open-sol") openSolicitacao(state.solicitacoes.find(i => i.id === id));
    if (action.dataset.action === "delete-sol") deleteRow(T.solicitacoes, id);
  }

  function initRh() {
    if (state.initialized) return;
    state.initialized = true;
    bindEvents();
    hydrateFilters();
    loadAll();
  }

  window.__moduleInit = initRh;
  window.initRhGestaoPessoas = initRh;
})();
