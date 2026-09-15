(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const client = window.supabaseClient;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const levels = ['Administrador', 'Gestor', 'Financeiro', 'Líder de setor', 'Operador', 'Qualidade', 'Almoxarifado', 'Visualizador'];
  const sectors = ['Administrativo', 'Comercial', 'Financeiro', 'Logística', 'Estoque', 'Almoxarifado', 'Montagem', 'Manutenção'];
  let context, employees = [], catalog = [], mode = 'create', photo = '', preview = '', busy = false, returnFocus;
  const photoUrls = new Map();
  const can = key => window.EasyLocPermissions.hasPermission(key, false);
  const initials = name => String(name || 'FT').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const icons = () => window.lucide?.createIcons();
  function message(text, error = false) {
    $('funcMessage').textContent = text;
    $('funcMessage').hidden = !text;
    $('funcMessage').dataset.error = String(error);
  }
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  async function api(body) {
    const { data, error } = await client.functions.invoke('funcionarios-admin', { body: { ...body, empresa_id: context.empresa_id } });
    if (error) {
      let detail;
      try { detail = await error.context?.json(); } catch (_) { /* Resposta sem JSON */ }
      throw new Error(detail?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  function imageUrl(path) {
    if (photoUrls.has(path)) return photoUrls.get(path);
    // URLs de avatar anteriores ao cadastro continuam válidas; nunca injeta esquemas executáveis.
    return /^https?:\/\//i.test(path || '') ? path : '';
  }
  async function loadEmployees() {
    employees = await rpc('funcionarios_listar', { p_empresa_id: context.empresa_id });
    const paths = [...new Set(employees.map(e => e.foto_url).filter(p => p?.startsWith(`${context.empresa_id}/`)))];
    for (let i = 0; i < paths.length; i += 100) {
      const result = await api({ action: 'photo-urls', paths: paths.slice(i, i + 100) });
      result.urls.forEach(item => { if (item.signedUrl) photoUrls.set(item.path, item.signedUrl); });
    }
    render();
  }
  function render() {
    $('funcTotal').textContent = employees.length;
    $('funcAtivos').textContent = employees.filter(e => e.ativo).length;
    $('funcInativos').textContent = employees.filter(e => !e.ativo).length;
    $('funcAdmins').textContent = employees.filter(e => e.nivel_acesso === 'Administrador').length;
    const groups = new Map();
    employees.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(e => {
      const key = e.setor || 'Sem setor';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    $('funcionariosTableBody').innerHTML = [...groups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([sector, rows]) => `
      <tr class="table-group-row"><td colspan="9">${esc(sector)}<span class="table-group-count">${rows.length}</span></td></tr>
      ${rows.map(e => `<tr><td class="photo-column"><span class="employee-table-photo"><span>${esc(initials(e.nome))}</span>${imageUrl(e.foto_url) ? `<img src="${esc(imageUrl(e.foto_url))}" alt="Foto de ${esc(e.nome)}" loading="lazy">` : ''}</span></td>
      <td><strong>${esc(e.nome)}</strong><span class="subtext">${esc(e.email)}</span></td><td>${esc(e.setor)}</td><td>${esc(e.cargo || '-')}</td><td>${esc(e.login)}</td>
      <td><span class="status-pill">${esc(e.nivel_acesso)}</span></td><td><span class="status-pill ${e.ativo ? 'active' : 'inactive'}">${e.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>${e.ultimo_acesso ? esc(new Date(e.ultimo_acesso).toLocaleString('pt-BR')) : '-'}</td><td class="action-buttons">
      <button class="icon-btn" data-action="view" data-id="${esc(e.id)}" aria-label="Ver ${esc(e.nome)}" title="Ver"><i data-lucide="eye"></i></button>
      ${can('rh.funcionarios.editar') && e.id !== context.usuario_id ? `<button class="icon-btn" data-action="edit" data-id="${esc(e.id)}" aria-label="Editar ${esc(e.nome)}" title="Editar"><i data-lucide="pencil"></i></button>` : ''}</td></tr>`).join('')}`).join('') || '<tr><td colspan="9" class="empty-state">Nenhum funcionário cadastrado.</td></tr>';
    $('newFuncionarioBtn').hidden = !can('rh.funcionarios.criar') || !can('configuracoes.permissoes.editar');
    icons();
  }
  function renderPermissions(selected = []) {
    const groups = new Map();
    catalog.forEach(p => {
      const key = `${p.modulo} / ${p.submodulo}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const disabled = mode === 'view' || !can('configuracoes.permissoes.editar');
    $('permissionsGrid').innerHTML = [...groups].map(([key, rows]) => `<section class="permission-module"><header>
      <div class="permission-module-title"><span><i data-lucide="shield-check"></i></span><div><strong>${esc(rows[0].submodulo)}</strong><small>${esc(rows[0].modulo)}</small></div></div>
      <label class="permission-toggle-all"><input type="checkbox" data-module-toggle ${disabled ? 'disabled' : ''} aria-label="Todas as permissões de ${esc(key)}">Todos</label></header>
      <div class="permission-module-grid">${rows.map(p => `<label class="permission-check"><input type="checkbox" data-permission-item value="${esc(p.chave)}" ${selected.includes(p.chave) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(p.descricao || p.acao)}</span></label>`).join('')}</div></section>`).join('');
    $('permissionsGrid').classList.toggle('is-disabled', disabled);
    syncToggles(); icons();
  }
  function syncToggles() {
    document.querySelectorAll('.permission-module').forEach(group => {
      const items = [...group.querySelectorAll('[data-permission-item]')], checked = items.filter(x => x.checked).length;
      const toggle = group.querySelector('[data-module-toggle]');
      toggle.checked = checked === items.length;
      toggle.indeterminate = checked > 0 && checked < items.length;
    });
  }
  function profile(level) {
    return catalog.filter(p => {
      if (level === 'Administrador') return true;
      if (level === 'Gestor') return !p.chave.startsWith('configuracoes.') && !p.chave.startsWith('rh.funcionarios.');
      if (level === 'Financeiro') return p.chave.startsWith('financeiro.') || p.chave === 'comercial.clientes.visualizar';
      if (level === 'Almoxarifado') return p.chave.startsWith('estoque.almoxarifado.') || p.chave.startsWith('logistica.separacao.');
      if (level === 'Líder de setor') return p.chave.startsWith('logistica.') || p.chave === 'estoque.itens.visualizar';
      if (level === 'Operador' || level === 'Qualidade') return ['logistica.separacao.visualizar', 'logistica.separacao.executar', 'estoque.itens.visualizar'].includes(p.chave);
      return p.chave === 'comercial.catalogo.visualizar';
    }).map(p => p.chave);
  }
  function setPhoto(src) {
    if (src) $('funcFotoPreview').src = src; else $('funcFotoPreview').removeAttribute('src');
    $('funcFotoPreview').classList.toggle('show', Boolean(src));
    $('funcFotoFallback').textContent = initials($('funcNome').value);
  }
  async function openForm(nextMode, id) {
    if (busy) return;
    mode = nextMode;
    const employee = employees.find(e => e.id === id);
    if (mode !== 'create' && !employee) return;
    if (mode === 'create' && (!can('rh.funcionarios.criar') || !can('configuracoes.permissoes.editar'))) return;
    if (mode === 'edit' && !can('rh.funcionarios.editar')) return;
    let selected = [];
    try {
      if (employee) selected = (await rpc('get_permissoes_usuario_resolvidas', { p_empresa_id: context.empresa_id, p_usuario_id: id })).filter(p => p.permitido).map(p => p.chave);
    } catch (error) { message(error.message, true); return; }
    $('funcionarioForm').reset(); photo = ''; preview = '';
    const options = [...new Set([...sectors, ...employees.map(e => e.setor).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('funcSetor').innerHTML = '<option value="">Selecione</option>' + options.map(s => `<option>${esc(s)}</option>`).join('');
    $('funcNivel').innerHTML = levels.map(s => `<option>${esc(s)}</option>`).join('');
    $('funcionarioId').value = id || '';
    const fields = { funcNome: 'nome', funcSetor: 'setor', funcCargo: 'cargo', funcLogin: 'login', funcEmail: 'email', funcTelefone: 'telefone', funcFotoValue: 'foto_url' };
    Object.entries(fields).forEach(([field, key]) => { $(field).value = employee?.[key] || ''; });
    $('funcNivel').value = employee?.nivel_acesso || 'Visualizador';
    $('funcStatus').value = employee?.ativo === false ? 'Inativo' : 'Ativo';
    $('funcSenha').required = mode === 'create'; $('funcWarehousePin').required = mode === 'create';
    $('funcSenha').placeholder = mode === 'create' ? 'Mínimo de 8 caracteres' : 'Em branco para manter a senha';
    $('funcWarehousePin').placeholder = mode === 'create' ? '4 dígitos' : 'Em branco para manter';
    $('funcEmail').readOnly = false;
    $('funcEmail').title = 'E-mail usado na conta de acesso';
    $('funcionarioFormTitle').textContent = mode === 'create' ? 'Novo funcionário' : mode === 'view' ? 'Dados do funcionário' : 'Editar funcionário';
    $('funcionarioForm').querySelectorAll('input,select,button').forEach(el => { el.disabled = mode === 'view' && el.id !== 'cancelFuncionarioBtn'; });
    $('funcStatus').disabled = $('funcNivel').disabled = mode === 'view' || !can('configuracoes.permissoes.editar');
    $('saveFuncionarioBtn').hidden = mode === 'view';
    renderPermissions(employee ? selected : profile('Visualizador'));
    setPhoto(imageUrl(employee?.foto_url));
    returnFocus = document.activeElement;
    $('funcionarioFormCard').classList.remove('hidden');
    $('funcionariosView').querySelector('.section-head').inert = true;
    document.body.style.overflow = 'hidden';
    (mode === 'view' ? $('closeFuncionarioForm') : $('funcNome')).focus();
  }
  function closeForm() {
    if (busy) return;
    $('funcionarioFormCard').classList.add('hidden');
    $('funcionariosView').querySelector('.section-head').inert = false;
    document.body.style.overflow = '';
    photo = ''; preview = '';
    returnFocus?.focus();
  }
  $('newFuncionarioBtn').addEventListener('click', () => openForm('create'));
  ['closeFuncionarioForm', 'cancelFuncionarioBtn'].forEach(id => $(id).addEventListener('click', closeForm));
  $('funcionariosTableBody').addEventListener('click', e => { const button = e.target.closest('[data-action]'); if (button) openForm(button.dataset.action, button.dataset.id); });
  $('funcNivel').addEventListener('change', () => renderPermissions(profile($('funcNivel').value)));
  $('permissionsGrid').addEventListener('change', e => {
    if (e.target.matches('[data-module-toggle]')) e.target.closest('.permission-module').querySelectorAll('[data-permission-item]').forEach(input => { input.checked = e.target.checked; });
    syncToggles();
  });
  $('funcFotoButton').addEventListener('click', () => $('funcFotoInput').click());
  $('funcNome').addEventListener('input', () => { $('funcFotoFallback').textContent = initials($('funcNome').value); });
  $('funcFotoInput').addEventListener('change', async () => {
    const file = $('funcFotoInput').files?.[0];
    if (!file) return;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Selecione uma foto JPG, PNG ou WebP de até 5 MB.');
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      photo = canvas.toDataURL('image/jpeg', .88); preview = photo; setPhoto(preview);
    } catch (error) { window.alerta ? window.alerta(error.message) : alert(error.message); }
  });
  $('funcFotoPreview').addEventListener('error', () => $('funcFotoPreview').classList.remove('show'));
  $('funcionariosTableBody').addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  document.addEventListener('keydown', e => {
    if ($('funcionarioFormCard').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeForm();
    if (e.key === 'Tab') {
      const targets = [...$('funcionarioFormCard').querySelectorAll('button,input,select')].filter(x => !x.disabled && x.type !== 'hidden' && x.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('funcionarioForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy || mode === 'view') return;
    busy = true; $('saveFuncionarioBtn').disabled = true; $('closeFuncionarioForm').disabled = true; $('cancelFuncionarioBtn').disabled = true;
    try {
      const result = await api({ action: 'save', id: $('funcionarioId').value || null, photo: photo || null,
        employee: { nome: $('funcNome').value, setor: $('funcSetor').value, cargo: $('funcCargo').value, login: $('funcLogin').value, senha: $('funcSenha').value, pin: $('funcWarehousePin').value, nivel_acesso: $('funcNivel').value, ativo: $('funcStatus').value === 'Ativo', email: $('funcEmail').value, telefone: $('funcTelefone').value, foto_url: $('funcFotoValue').value },
        permissions: can('configuracoes.permissoes.editar') ? [...document.querySelectorAll('[data-permission-item]:checked')].map(x => x.value) : null });
      busy = false; closeForm();
      message(result.warning || 'Funcionário salvo com sucesso.', Boolean(result.warning));
      await loadEmployees();
    } catch (error) {
      if (!$('funcionarioFormCard').classList.contains('hidden')) { if (window.alerta) window.alerta(error.message); else alert(error.message); }
      else message(error.message, true);
    } finally { busy = false; $('saveFuncionarioBtn').disabled = false; $('closeFuncionarioForm').disabled = false; $('cancelFuncionarioBtn').disabled = false; }
  });
  try {
    context = await window.aguardarContexto();
    await window.EasyLocPermissions.load();
    if (!can('rh.funcionarios.visualizar')) throw new Error('Sem permissão para visualizar funcionários.');
    const result = await client.from('permissoes_catalogo').select('*').order('ordem');
    if (result.error) throw result.error;
    catalog = result.data;
    await loadEmployees();
  } catch (error) { $('newFuncionarioBtn').hidden = true; message(error.message || 'Não foi possível carregar o cadastro.', true); }
  icons();
})();
