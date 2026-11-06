(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const client = window.supabaseClient;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const levels = ['Administrador', 'Recursos Humanos', 'Gestor', 'Financeiro', 'Líder de setor', 'Operador', 'Qualidade', 'Almoxarifado', 'Visualizador'];
  let opcoesRh = [];
  let proprio = false, context, employees = [], catalog = [], mode = 'create', photo = '', preview = '', busy = false, returnFocus, listaScroll=0;
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
  /* Foto do menu (perfil "Minha conta"): bucket público avatares em <empresa>/<usuário>.jpg.
     Quem não tem foto de funcionário (ex.: o dono) aparece com ela — se não existir, o <img>
     quebra e o listener de erro mostra as iniciais. */
  function avatarDoMenu(id) {
    if (!id || !context?.empresa_id) return '';
    const { data } = client.storage.from('avatares').getPublicUrl(`${context.empresa_id}/${id}.jpg`);
    return data?.publicUrl ? `${data.publicUrl}?v=${avatarVersao}` : '';
  }
  const avatarVersao = Date.now();
  function fotoDe(e) { return imageUrl(e?.foto_url) || avatarDoMenu(e?.id); }
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
    const busca=$('funcBusca').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
    employees.filter(e=>[e.nome,e.setor,e.cargo,e.login,e.email].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(busca)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(e => {
      const key = e.setor || 'Sem setor';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    $('funcionariosTableBody').innerHTML = [...groups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([sector, rows]) => `
      <tr class="table-group-row"><td colspan="5">${esc(sector)}<span class="table-group-count">${rows.length}</span></td></tr>
      ${rows.map(e => `<tr class="funcionario-linha" data-funcionario-id="${esc(e.id)}" tabindex="0" aria-label="Abrir cadastro de ${esc(e.nome)}">
      <td><div class="funcionario-identidade"><span class="employee-table-photo"><span>${esc(initials(e.nome))}</span>${fotoDe(e)?`<img src="${esc(fotoDe(e))}" alt="" loading="lazy">`:''}</span><span class="funcionario-identidade-texto"><strong>${esc(e.nome)}</strong>${e.email?`<span class="subtext">${esc(e.email)}</span>`:''}</span></div></td>
      <td>${esc(e.cargo||'—')}</td>
      <td><span class="funcionario-acesso">${e.acesso_sistema===false?'Sem login':esc(e.nivel_acesso||'Visualizador')}</span><span class="subtext">${[e.acesso_sistema!==false?e.login:'',e.tem_pin?'PIN cadastrado':'PIN pendente'].filter(Boolean).map(esc).join(' &#183; ')}</span></td>
      <td><span class="status-pill ${e.ativo?'active':'inactive'}">${e.ativo?'Ativo':'Inativo'}</span></td>
      <td class="funcionario-ultimo-acesso">${e.ultimo_acesso?esc(new Date(e.ultimo_acesso).toLocaleString('pt-BR')):'—'}</td></tr>`).join('')}`).join('') || '<tr><td colspan="5" class="empty-state">Nenhum funcionário encontrado.</td></tr>';
    $('newFuncionarioBtn').hidden = !can('rh.funcionarios.criar');
    icons();
  }
  function renderPermissions(selected = []) {
    const groups = new Map();
    catalog.forEach(p => {
      const key = `${p.modulo} / ${p.submodulo}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const disabled = mode === 'view' || proprio || !can('configuracoes.permissoes.editar');
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
      if (level === 'Recursos Humanos') return p.chave.startsWith('rh.');
      if (level === 'Gestor') return !p.chave.startsWith('configuracoes.') && !p.chave.startsWith('rh.funcionarios.');
      if (level === 'Financeiro') return p.chave.startsWith('financeiro.') || p.chave === 'comercial.clientes.visualizar';
      if (level === 'Almoxarifado') return p.chave.startsWith('estoque.almoxarifado.') || p.chave.startsWith('logistica.separacao.');
      if (level === 'Líder de setor') return p.chave.startsWith('logistica.') || p.chave === 'estoque.itens.visualizar';
      if (level === 'Operador' || level === 'Qualidade') return ['logistica.separacao.visualizar', 'logistica.separacao.executar', 'estoque.itens.visualizar'].includes(p.chave);
      return p.chave === 'comercial.catalogo.visualizar';
    }).map(p => p.chave);
  }
  const moeda=valor=>Number(valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const salarioParaSalvar=()=>{const digitos=$('funcSalario').value.replace(/\D/g,'');return digitos?(Number(digitos)/100).toFixed(2):'';};
  $('funcSalario').addEventListener('input',()=>{const el=$('funcSalario'),digitos=el.value.replace(/\D/g,'').slice(0,14);el.value=digitos?moeda(Number(digitos)/100):'';});
  $('funcBusca').addEventListener('input',render);
  function syncStatus(){
    document.querySelectorAll('[data-func-status]').forEach(el=>{el.setAttribute('aria-pressed',String(el.dataset.funcStatus===$('funcStatus').value));el.disabled=busy||$('funcStatus').disabled;});
  }
  document.querySelectorAll('[data-func-status]').forEach(el=>el.addEventListener('click',()=>{if(busy||$('funcStatus').disabled)return;$('funcStatus').value=el.dataset.funcStatus;syncStatus();}));
  let enderecoAutocomplete,enderecoCarregando=false;
  $('funcEndereco').addEventListener('focus',async()=>{
    if(enderecoAutocomplete||enderecoCarregando||$('funcEndereco').disabled)return;
    enderecoCarregando=true;
    try{
      await window.carregarGooglePlaces();
      enderecoAutocomplete=new google.maps.places.Autocomplete($('funcEndereco'),{types:['address'],componentRestrictions:{country:'br'},fields:['formatted_address']});
      enderecoAutocomplete.addListener('place_changed',()=>{const endereco=enderecoAutocomplete.getPlace()?.formatted_address;if(endereco&&!$('funcEndereco').disabled)$('funcEndereco').value=endereco;});
    }catch(error){console.warn('Autocomplete de endereço:',error.message);}
    finally{enderecoCarregando=false;}
  });
  function setPhoto(src) {
    if (src) $('funcFotoPreview').src = src; else $('funcFotoPreview').removeAttribute('src');
    $('funcFotoPreview').classList.toggle('show', Boolean(src));
    $('funcFotoFallback').textContent = initials($('funcNome').value);
  }
  function syncAccess() {
    const acesso = $('funcAcesso').value === 'true';
    const employee = employees.find(e => e.id === $('funcionarioId').value);
    const senhaNova = acesso && (mode === 'create' || employee?.acesso_sistema === false);
    ['funcLogin','funcSenha','funcNivel'].forEach(id => { $(id).closest('label').hidden = !acesso; });
    $('funcLogin').required = $('funcEmail').required = acesso;
    $('funcSenha').required = senhaNova;
    $('funcWarehousePin').required = mode === 'create' || employee?.tem_pin === false || senhaNova;
    $('permissionsGrid').closest('fieldset').hidden = !acesso;
    if ((!employee || employee.acesso_sistema === false) && !can('configuracoes.permissoes.editar')) $('funcAcesso').disabled = true;
    if (!acesso && !proprio && mode !== 'view') $('funcStatus').disabled = false;
    syncStatus();
  }
  $('funcAcesso').addEventListener('change', syncAccess);
  async function openForm(nextMode, id) {
    if (busy) return;
    mode = nextMode;
    const employee = employees.find(e => e.id === id);
    if (mode !== 'create' && !employee) return;
    if (mode === 'create' && !can('rh.funcionarios.criar')) return;
    // Meu próprio cadastro (out/2026): só dados pessoais e senhas; nível, status, login e
    // permissões ficam travados (o servidor também confere — funcionario_salvar_proprio).
    proprio = mode === 'edit' && id === context.usuario_id;
    if (mode === 'edit' && !proprio && !can('rh.funcionarios.editar')) return;
    let selected = [];
    try {
      if (employee && employee.acesso_sistema !== false) selected = (await rpc('get_permissoes_usuario_resolvidas', { p_empresa_id: context.empresa_id, p_usuario_id: id })).filter(p => p.permitido).map(p => p.chave);
    } catch (error) { message(error.message, true); return; }
    $('funcionarioForm').reset(); photo = ''; preview = '';
    const opcoesResult=await client.from('rh_cadastro_opcoes').select('*').eq('empresa_id',context.empresa_id).eq('ativo',true).order('nome');
    if(opcoesResult.error){message(opcoesResult.error.message,true);return;}
    opcoesRh=opcoesResult.data || [];
    for(const [campo,tipo,valor] of [['funcSetor','setor',employee?.setor],['funcCargo','cargo',employee?.cargo]]){
      const nomes=[...new Set([...opcoesRh.filter(o=>o.tipo===tipo).map(o=>o.nome),...(valor?[valor]:[])])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      $(campo).innerHTML='<option value="">Selecione</option>'+nomes.map(nome=>'<option>'+esc(nome)+'</option>').join('');
    }
    $('funcNivel').innerHTML = levels.map(s => `<option>${esc(s)}</option>`).join('');
    $('funcionarioId').value = id || '';
    const fields = { funcNome: 'nome', funcSetor: 'setor', funcCargo: 'cargo', funcLogin: 'login', funcEmail: 'email', funcTelefone: 'telefone', funcFotoValue: 'foto_url', funcCpf: 'cpf',funcSalario:'salario_bruto',funcAdmissao:'data_admissao',funcEquipe:'equipe_operacional' };
    Object.entries(fields).forEach(([field, key]) => { $(field).value = employee?.[key] ?? ''; });
    if($('funcSalario').value!=='')$('funcSalario').value=moeda($('funcSalario').value);
    Object.entries({funcRg:'rg',funcNascimento:'data_nascimento',funcWhatsapp:'whatsapp',funcEndereco:'endereco',funcObservacoes:'observacoes'}).forEach(([id,key])=>{$(id).value=employee?.dados_rh?.[key] || '';});
    // Cofre: CPF, RG e salário cifrados chegam só como máscara; "Ver" mostra o valor (com registro).
    const protegidos = employee?.protegidos || [];
    const revelar = campo => async () => {const valor=(await window.EasyLocCofre.revelarRh(client,context.empresa_id,id,[campo]))[campo];return campo==='salario'&&valor!=null?moeda(valor):valor;};
    [['funcCpf','cpf',employee?.cpf],['funcRg','rg',employee?.dados_rh?.rg],['funcSalario','salario',employee?.salario_mascara]].forEach(([campoId, campo, mascara]) =>
      window.EasyLocCofre.preparar($(campoId), { protegido: protegidos.includes(campo), mascara, podeRevelar: employee?.pode_revelar && mode !== 'create', revelar: revelar(campo) }));
    $('funcLider').checked = !!employee?.lider_operacao;
    $('funcNivel').value = employee?.nivel_acesso || 'Visualizador';
    $('funcStatus').value = employee?.ativo === false ? 'Inativo' : 'Ativo';
    $('funcAcesso').value = employee ? String(employee.acesso_sistema !== false) : 'false';
    $('funcWarehousePin').required = mode === 'create' || employee?.tem_pin === false;
    $('funcSenha').placeholder = mode === 'create' ? 'Mínimo de 8 caracteres' : 'Em branco para manter a senha';
    $('funcWarehousePin').placeholder = mode === 'create' ? '4 dígitos' : 'Em branco para manter';
    $('funcEmail').readOnly = false;
    $('funcEmail').title = 'E-mail usado na conta de acesso';
    $('funcionarioFormTitle').textContent = mode === 'create' ? 'Novo funcionário' : mode === 'view' ? 'Dados do funcionário' : proprio ? 'Meu cadastro' : 'Editar funcionário';
    $('funcionarioForm').querySelectorAll('input,select,button').forEach(el => { el.disabled = mode === 'view' && el.id !== 'cancelFuncionarioBtn'; });
    $('funcStatus').disabled = $('funcNivel').disabled = mode === 'view' || proprio || !can('configuracoes.permissoes.editar');
    $('funcLogin').disabled = mode === 'view' || proprio;
    $('funcAcesso').disabled = mode === 'view' || proprio || (employee?.acesso_sistema !== false && Boolean(employee));
    if (!proprio && employee && employee.acesso_sistema !== false && !can('configuracoes.permissoes.editar')) ['funcLogin','funcSenha','funcEmail'].forEach(id=>{$(id).disabled=true;});
    if (proprio) ['funcSetor','funcCargo','funcCpf','funcSalario','funcAdmissao','funcEquipe','funcLider','funcRg','funcNascimento','funcWhatsapp','funcEndereco','funcObservacoes'].forEach(id => {$(id).disabled=true;});
    const avisoProprio = $('funcionarioProprioAviso');
    if (avisoProprio) avisoProprio.hidden = !proprio;
    $('saveFuncionarioBtn').hidden = mode === 'view';
    renderPermissions(employee ? selected : profile('Visualizador'));
    syncAccess();
    setPhoto(fotoDe(employee));
    returnFocus = document.activeElement;
    $('funcionarioFormCard').classList.remove('hidden');
    listaScroll=window.scrollY;$('funcionariosView').hidden=true;
    window.scrollTo(0,0);
    (mode === 'view' ? $('closeFuncionarioForm') : $('funcNome')).focus();
  }
  function closeForm() {
    if (busy) return;
    $('funcionarioFormCard').classList.add('hidden');
    $('funcionariosView').hidden=false;
    window.scrollTo(0,listaScroll);
    photo = ''; preview = '';
    returnFocus?.focus();
  }
  $('newFuncionarioBtn').addEventListener('click', () => openForm('create'));
  ['closeFuncionarioForm', 'cancelFuncionarioBtn'].forEach(id => $(id).addEventListener('click', closeForm));
  function abrirLinhaFuncionario(evento){
    const linha=evento.target.closest('[data-funcionario-id]');if(!linha)return;
    const id=linha.dataset.funcionarioId;linha.focus();openForm(can('rh.funcionarios.editar')||id===context.usuario_id?'edit':'view',id);
  }
  $('funcionariosTableBody').addEventListener('click',abrirLinhaFuncionario);
  $('funcionariosTableBody').addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||!e.target.matches('[data-funcionario-id]'))return;e.preventDefault();abrirLinhaFuncionario(e);});
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

  });
  $('funcionarioForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy || mode === 'view') return;
    busy = true; syncStatus(); $('saveFuncionarioBtn').disabled = true; $('closeFuncionarioForm').disabled = true; $('cancelFuncionarioBtn').disabled = true;
    try {
      const result = await api({ action: 'save', id: $('funcionarioId').value || null, photo: photo || null,
        employee: { nome: $('funcNome').value, setor: $('funcSetor').value, cargo: $('funcCargo').value, login: $('funcLogin').value, senha: $('funcSenha').value, pin: $('funcWarehousePin').value, nivel_acesso: $('funcNivel').value, ativo: $('funcStatus').value === 'Ativo', email: $('funcEmail').value, telefone: $('funcTelefone').value, foto_url: $('funcFotoValue').value,...(window.EasyLocCofre.mudou($('funcCpf')) ? {cpf:$('funcCpf').value} : {}),...(window.EasyLocCofre.mudou($('funcSalario')) ? {salario_bruto:salarioParaSalvar()} : {}),data_admissao:$('funcAdmissao').value,equipe_operacional:$('funcEquipe').value,acesso_sistema:$('funcAcesso').value==='true',dados_rh:{...(window.EasyLocCofre.mudou($('funcRg')) ? {rg:$('funcRg').value} : {}),data_nascimento:$('funcNascimento').value,whatsapp:$('funcWhatsapp').value,endereco:$('funcEndereco').value,observacoes:$('funcObservacoes').value} },
        permissions: $('funcAcesso').value==='true' && !proprio && can('configuracoes.permissoes.editar') ? [...document.querySelectorAll('[data-permission-item]:checked')].map(x => x.value) : null });
      // Líder (Painel Logístico): gravado à parte, só por quem edita funcionários
      const idSalvo = result.id || $('funcionarioId').value;
      const liderAntes = !!employees.find(x => x.id === idSalvo)?.lider_operacao;
      if (idSalvo && !proprio && liderAntes !== $('funcLider').checked) await rpc('rh_definir_lider', { p_empresa_id: context.empresa_id, p_funcionario: idSalvo, p_lider: $('funcLider').checked });
      busy = false; closeForm();
      message('');
      window.alerta(result.warning || 'Funcionário salvo com sucesso.', result.warning ? 'Atenção' : 'Sucesso', result.warning ? 'aviso' : 'sucesso');
      await loadEmployees();
    } catch (error) {
      if (!$('funcionarioFormCard').classList.contains('hidden')) { if (window.alerta) window.alerta(error.message); else alert(error.message); }
      else message(error.message, true);
    } finally { busy = false; syncStatus(); $('saveFuncionarioBtn').disabled = false; $('closeFuncionarioForm').disabled = false; $('cancelFuncionarioBtn').disabled = false; }
  });
  try {
    context = await window.aguardarContexto();
    await window.EasyLocPermissions.load();
    if (!can('rh.funcionarios.visualizar')) throw new Error('Sem permissão para visualizar funcionários.');
    const result = await client.from('permissoes_catalogo').select('*').order('ordem');
    if (result.error) throw result.error;
    catalog = result.data;
    await loadEmployees();
    const solicitado=new URLSearchParams(location.search).get('funcionario');
    if(solicitado && employees.some(e=>e.id===solicitado)) await openForm(can('rh.funcionarios.editar')?'edit':'view',solicitado);
    // "Nova admissão" da Gestão de Pessoas abre direto o cadastro novo
    else if(new URLSearchParams(location.search).get('novo')==='1' && can('rh.funcionarios.criar')) await openForm('create');
  } catch (error) { $('newFuncionarioBtn').hidden = true; message(error.message || 'Não foi possível carregar o cadastro.', true); }
  icons();
})();
