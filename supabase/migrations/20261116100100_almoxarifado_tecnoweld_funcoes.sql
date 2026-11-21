alter table public.supplier_product_links add column if not exists fornecedor_nome text;

-- Funções do Almoxarifado novo, portadas da Tecnoweld (16/11/2026).
-- Diferenças de propósito: "OP" daqui = número do pedido (separacoes_pedidos.numero_pedido);
-- PIN = senha de 4 dígitos do Cadastro de Funcionários; EPI é entregue à pessoa do Cadastro de Funcionários.

create or replace function public.almox_nome_func(p uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nome from public.funcionarios_acesso where id = p),
                  (select nome from public.usuarios where id = p),
                  (select email from auth.users where id = p))
$$;

create or replace function public.almox_pedido_existe(p_empresa uuid, p_numero text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from public.separacoes_pedidos where empresa_id = p_empresa and numero_pedido::text = trim(p_numero)
                and coalesce(status_comercial,'') <> 'cancelado')
$$;

-- Lista de pessoas para as telas (Entrada/Saída/Retiradas/EPI). Sem dado sensível.
create or replace function public.almox_pessoas() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e uuid := public.almox_empresa();
begin
  if not (public.almox_tw_pode('Acessar almoxarifado') or public.almox_tw_pode('Acessar gestao de pessoas')) then
    raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'setor_id', f.setor_id, 'setor', f.setor_nome,
      'foto_url', f.foto_url, 'cargo', f.cargo, 'ativo', f.ativo, 'tem_pin', f.tem_pin) order by f.nome)
    from public.almox_funcionarios f where f.empresa_id = e and f.ativo), '[]'::jsonb);
end $$;

create or replace function public.almox_setores_lista() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'tipo', s.tipo) order by s.nome), '[]'::jsonb)
  from public.almox_setores s where s.empresa_id = public.almox_empresa() and s.ativo
$$;

-- ---------- Código do material ----------
create or replace function public.warehouse_material_spec_key(p text) returns text
language sql immutable as $$ select upper(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

create or replace function public.warehouse_material_assign_code(p_new public.warehouse_materials) returns public.warehouse_materials
language plpgsql security definer set search_path to 'public' as $$
declare t public.warehouse_material_types; v_item int; v_med int; v_dup text;
begin
  select * into t from public.warehouse_material_types where id = p_new.type_id for update;
  if t.id is null then raise exception 'Tipo de item não encontrado.'; end if;
  select m.item_numero into v_item from public.warehouse_materials m
   where m.type_id = t.id and m.item_numero is not null and m.id <> p_new.id
     and public.warehouse_material_spec_key(m.especificacao) = public.warehouse_material_spec_key(p_new.especificacao) limit 1;
  if v_item is null then
    update public.warehouse_material_types set ultimo_numero = ultimo_numero + 1 where id = t.id returning ultimo_numero into v_item;
  else
    select m.codigo into v_dup from public.warehouse_materials m
     where m.type_id = t.id and m.item_numero = v_item and m.id <> p_new.id
       and (not t.requer_comprimento or m.comprimento_maximo is not distinct from p_new.comprimento_maximo)
       and (not t.requer_largura or m.largura_maxima is not distinct from p_new.largura_maxima)
       and (not t.requer_espessura or m.espessura is not distinct from p_new.espessura)
       and (not t.requer_diametro or m.diametro is not distinct from p_new.diametro)
     limit 1;
    if v_dup is not null then
      raise exception 'Já existe este item com as mesmas medidas: %. Para colocar mais estoque use a Entrada.', v_dup using errcode = '23505';
    end if;
  end if;
  select coalesce(max(m.medida_numero), 0) + 1 into v_med from public.warehouse_materials m
   where m.type_id = t.id and m.item_numero = v_item and m.id <> p_new.id;
  p_new.item_numero := v_item; p_new.medida_numero := v_med;
  p_new.codigo := t.sigla || '-' || lpad(v_item::text, 3, '0') || '-' || lpad(v_med::text, 2, '0');
  return p_new;
end $$;

create or replace function public.set_warehouse_material_codigo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.type_id is not null then
      new := public.warehouse_material_assign_code(new);
    elsif new.codigo is null or trim(new.codigo) = '' then
      new.codigo := 'INS-' || lpad(nextval('public.warehouse_materials_codigo_seq')::text, 4, '0');
    end if;
    if new.qr_code is null or new.qr_code = '' then new.qr_code := new.codigo; end if;
    return new;
  end if;
  if old.type_id is not null and new.type_id is distinct from old.type_id then
    raise exception 'O tipo do item não pode ser trocado (o código % é ligado a ele). Inative o item e cadastre outro.', old.codigo using errcode = '23514';
  end if;
  if old.type_id is null and new.type_id is not null then
    new := public.warehouse_material_assign_code(new);
    if old.qr_code is null or old.qr_code = old.codigo then new.qr_code := new.codigo; end if;
  end if;
  return new;
end $$;
create trigger set_warehouse_material_codigo before insert or update of type_id, codigo on public.warehouse_materials
  for each row execute function public.set_warehouse_material_codigo();

create or replace function public.warehouse_material_code_preview(p_type_id uuid, p_especificacao text, p_comprimento numeric default null,
  p_largura numeric default null, p_espessura numeric default null, p_diametro numeric default null, p_parede numeric default null,
  p_diametro_interno numeric default null, p_diametro_externo numeric default null) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare t public.warehouse_material_types; v_item int; v_med int; v_dup text;
begin
  select * into t from public.warehouse_material_types where id = p_type_id and empresa_id = public.almox_empresa();
  if t.id is null then return null; end if;
  select m.item_numero into v_item from public.warehouse_materials m
   where m.type_id = t.id and m.item_numero is not null
     and public.warehouse_material_spec_key(m.especificacao) = public.warehouse_material_spec_key(p_especificacao) limit 1;
  if v_item is null then
    return jsonb_build_object('codigo', t.sigla || '-' || lpad((t.ultimo_numero + 1)::text, 3, '0') || '-01', 'novo_item', true);
  end if;
  select m.codigo into v_dup from public.warehouse_materials m
   where m.type_id = t.id and m.item_numero = v_item
     and (not t.requer_comprimento or m.comprimento_maximo is not distinct from p_comprimento)
     and (not t.requer_largura or m.largura_maxima is not distinct from p_largura)
     and (not t.requer_espessura or m.espessura is not distinct from p_espessura)
     and (not t.requer_diametro or m.diametro is not distinct from p_diametro) limit 1;
  select coalesce(max(m.medida_numero), 0) + 1 into v_med from public.warehouse_materials m where m.type_id = t.id and m.item_numero = v_item;
  return jsonb_build_object('codigo', t.sigla || '-' || lpad(v_item::text, 3, '0') || '-' || lpad(v_med::text, 2, '0'),
    'novo_item', false, 'existente', v_dup, 'medidas', (select count(*) from public.warehouse_materials m where m.type_id = t.id and m.item_numero = v_item));
end $$;

create or replace function public.warehouse_material_types_list() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'sigla', t.sigla, 'ativo', t.ativo,
    'requer_comprimento', t.requer_comprimento, 'requer_largura', t.requer_largura, 'requer_espessura', t.requer_espessura,
    'requer_diametro', t.requer_diametro, 'requer_parede', t.requer_parede, 'requer_diametro_interno', t.requer_diametro_interno,
    'requer_diametro_externo', t.requer_diametro_externo, 'unidade', t.unidade,
    'itens', (select count(*) from public.warehouse_materials m where m.type_id = t.id), 'proximo', t.ultimo_numero + 1) order by t.nome), '[]'::jsonb)
  from public.warehouse_material_types t where t.empresa_id = public.almox_empresa()
$$;

create or replace function public.warehouse_material_type_save(p_id uuid, p_nome text, p_sigla text, p_ativo boolean default true,
  p_comprimento boolean default false, p_largura boolean default false, p_espessura boolean default false, p_unidade text default 'UN',
  p_diametro boolean default false, p_parede boolean default false, p_diametro_interno boolean default false, p_diametro_externo boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_sigla text := upper(regexp_replace(coalesce(p_sigla, ''), '[^A-Za-z0-9]', '', 'g')); v_old text;
  v_unid text := upper(coalesce(nullif(trim(p_unidade), ''), 'UN')); v_emp uuid := public.almox_empresa();
begin
  if not public.almox_tw_pode('Editar parametros do sistema') and not public.operacao_pode(v_emp, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do tipo.'; end if;
  if v_sigla !~ '^[A-Z0-9]{2,}$' then raise exception 'A sigla deve ter pelo menos 2 letras ou números (ex.: TEC).'; end if;
  if exists (select 1 from public.warehouse_material_types where empresa_id = v_emp and sigla = v_sigla and id is distinct from p_id) then
    raise exception 'A sigla % já é usada por outro tipo.', v_sigla; end if;
  if exists (select 1 from public.warehouse_material_types where empresa_id = v_emp and lower(nome) = lower(trim(p_nome)) and id is distinct from p_id) then
    raise exception 'Já existe um tipo com esse nome.'; end if;
  if p_id is null then
    insert into public.warehouse_material_types (empresa_id, nome, sigla, ativo, requer_comprimento, requer_largura, requer_espessura, requer_diametro,
      requer_parede, requer_diametro_interno, requer_diametro_externo, unidade)
    values (v_emp, trim(p_nome), v_sigla, coalesce(p_ativo, true), coalesce(p_comprimento, false), coalesce(p_largura, false), coalesce(p_espessura, false),
      coalesce(p_diametro, false), coalesce(p_parede, false), coalesce(p_diametro_interno, false), coalesce(p_diametro_externo, false), v_unid)
    returning id into v_id;
    return v_id;
  end if;
  select sigla into v_old from public.warehouse_material_types where id = p_id and empresa_id = v_emp;
  if v_old is null then raise exception 'Tipo não encontrado.'; end if;
  if v_old <> v_sigla and exists (select 1 from public.warehouse_materials where type_id = p_id) then
    raise exception 'A sigla não pode mudar: já existem itens com o código %-…', v_old; end if;
  update public.warehouse_material_types set nome = trim(p_nome), sigla = v_sigla, ativo = coalesce(p_ativo, true),
    requer_comprimento = coalesce(p_comprimento, false), requer_largura = coalesce(p_largura, false), requer_espessura = coalesce(p_espessura, false),
    requer_diametro = coalesce(p_diametro, false), requer_parede = coalesce(p_parede, false),
    requer_diametro_interno = coalesce(p_diametro_interno, false), requer_diametro_externo = coalesce(p_diametro_externo, false), unidade = v_unid
   where id = p_id;
  return p_id;
end $$;

create or replace function public.warehouse_material_type_delete(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.almox_tw_pode('Editar parametros do sistema') and not public.operacao_pode(public.almox_empresa(), 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501'; end if;
  if exists (select 1 from public.warehouse_materials where type_id = p_id) then
    raise exception 'Este tipo já tem itens cadastrados: desative em vez de excluir.'; end if;
  delete from public.warehouse_material_types where id = p_id and empresa_id = public.almox_empresa();
end $$;

-- ---------- Endereço ----------
create or replace function public.warehouse_sync_material_location() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.location_id is distinct from (case when tg_op = 'UPDATE' then old.location_id end) and new.location_id is not null then
    select codigo into new.localizacao from public.warehouse_locations where id = new.location_id;
  elsif new.localizacao is distinct from (case when tg_op = 'UPDATE' then old.localizacao end) then
    new.location_id := (select id from public.warehouse_locations
      where empresa_id = new.empresa_id and codigo = upper(trim(coalesce(new.localizacao, ''))) and ativo limit 1);
  end if;
  return new;
end $$;
create trigger warehouse_sync_material_location before insert or update of location_id, localizacao on public.warehouse_materials
  for each row execute function public.warehouse_sync_material_location();

create or replace function public.create_warehouse_location(p_code text, p_name text, p_description text, p_sector_id uuid)
returns public.warehouse_locations language plpgsql security definer set search_path to 'public' as $$
declare r public.warehouse_locations;
begin
  if not public.almox_tw_pode('Editar material') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if coalesce(trim(p_code), '') = '' then raise exception 'Informe o código do endereço.'; end if;
  insert into public.warehouse_locations(empresa_id, codigo, nome, descricao, setor_id)
  values (public.almox_empresa(), upper(trim(p_code)), p_name, p_description, p_sector_id)
  on conflict (empresa_id, codigo) do update set nome = excluded.nome, descricao = excluded.descricao, setor_id = excluded.setor_id, ativo = true
  returning * into r;
  return r;
end $$;

create or replace function public.update_warehouse_location(p_id uuid, p_name text, p_description text, p_active boolean)
returns public.warehouse_locations language plpgsql security definer set search_path to 'public' as $$
declare r public.warehouse_locations;
begin
  if not public.almox_tw_pode('Editar material') then raise exception 'Sem permissão para editar endereços.' using errcode = '42501'; end if;
  if not coalesce(p_active, true) and exists(select 1 from public.warehouse_materials where location_id = p_id and coalesce(quantidade_disponivel, 0) > 0) then
    raise exception 'Este endereço ainda tem material com saldo. Mude os materiais de endereço antes de desativar.'; end if;
  update public.warehouse_locations set nome = coalesce(nullif(trim(p_name), ''), nome), descricao = p_description, ativo = coalesce(p_active, ativo)
   where id = p_id and empresa_id = public.almox_empresa() returning * into r;
  if r.id is null then raise exception 'Endereço não encontrado.'; end if;
  return r;
end $$;

create or replace function public.set_material_location(p_material_id uuid, p_location_id uuid)
returns public.warehouse_materials language plpgsql security definer set search_path to 'public' as $$
declare r public.warehouse_materials;
begin
  if not public.almox_tw_pode('Editar material') then raise exception 'Sem permissão para endereçar materiais.' using errcode = '42501'; end if;
  if p_location_id is not null and not exists(select 1 from public.warehouse_locations where id = p_location_id and empresa_id = public.almox_empresa() and ativo) then
    raise exception 'Endereço não encontrado ou inativo.'; end if;
  update public.warehouse_materials set location_id = p_location_id, localizacao = case when p_location_id is null then null else localizacao end
   where id = p_material_id and empresa_id = public.almox_empresa() returning * into r;
  if r.id is null then raise exception 'Material não encontrado.'; end if;
  return r;
end $$;

-- ---------- Cadastro (edição) ----------
create or replace function public.warehouse_material_update_registration(p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m public.warehouse_materials%rowtype; v_status text := nullif(p_data->>'status', '');
begin
  if not public.almox_tw_pode('Editar material') then raise exception 'Sem permissão para editar o cadastro.' using errcode = '42501'; end if;
  select * into m from public.warehouse_materials where id = p_id and empresa_id = public.almox_empresa() for update;
  if m.id is null then raise exception 'Item não encontrado.'; end if;
  if v_status is not null and v_status not in ('disponivel', 'inativo') then raise exception 'Situação inválida.'; end if;
  if v_status = 'inativo' and coalesce(m.status, '') <> 'inativo' and public.warehouse_blocked_qty(m.id, null) > 0 then
    raise exception 'Este item tem material reservado para a produção: não dá para inativar agora.'; end if;
  if p_data ? 'categoria' and nullif(trim(p_data->>'categoria'), '') is null then raise exception 'Escolha a categoria.'; end if;
  if (case when p_data ? 'estoque_ideal' then coalesce(nullif(p_data->>'estoque_ideal', '')::numeric, 0) else m.estoque_ideal end) > 0
     and (case when p_data ? 'estoque_ideal' then coalesce(nullif(p_data->>'estoque_ideal', '')::numeric, 0) else m.estoque_ideal end)
       < (case when p_data ? 'estoque_minimo' then coalesce(nullif(p_data->>'estoque_minimo', '')::numeric, 0) else m.estoque_minimo end) then
    raise exception 'O estoque ideal não pode ser menor que o mínimo.'; end if;
  update public.warehouse_materials set
    nome = case when p_data ? 'nome' and nullif(trim(p_data->>'nome'), '') is not null then trim(p_data->>'nome') else nome end,
    categoria = case when p_data ? 'categoria' then trim(p_data->>'categoria') else categoria end,
    unidade = case when p_data ? 'unidade' and nullif(trim(p_data->>'unidade'), '') is not null then upper(trim(p_data->>'unidade')) else unidade end,
    estoque_minimo = case when p_data ? 'estoque_minimo' then greatest(coalesce(nullif(p_data->>'estoque_minimo', '')::numeric, 0), 0) else estoque_minimo end,
    estoque_ideal = case when p_data ? 'estoque_ideal' then greatest(coalesce(nullif(p_data->>'estoque_ideal', '')::numeric, 0), 0) else estoque_ideal end,
    valor_unitario = case when p_data ? 'valor_unitario' then greatest(coalesce(nullif(p_data->>'valor_unitario', '')::numeric, 0), 0) else valor_unitario end,
    exige_lote = case when p_data ? 'exige_lote' then coalesce((p_data->>'exige_lote')::boolean, false) else exige_lote end,
    observacoes = case when p_data ? 'observacoes' then nullif(trim(p_data->>'observacoes'), '') else observacoes end,
    foto_url = case when p_data ? 'foto_url' then nullif(p_data->>'foto_url', '') else foto_url end,
    grupo = case when p_data ? 'grupo' then nullif(trim(p_data->>'grupo'), '') else grupo end,
    status = coalesce(v_status, status)
   where id = m.id returning * into m;
  return jsonb_build_object('id', m.id, 'status', m.status);
end $$;

-- ---------- Reservado para a produção (material das ordens de produção ainda não entregue) ----------
create or replace function public.warehouse_blocked_qty(p_material_id uuid, p_except_order uuid default null) returns numeric
language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(greatest(pm.necessario - coalesce(pm.recebido, 0) + coalesce(pm.devolvido, 0), 0)), 0)
    from public.producao_materiais pm
    join public.producao_etapas e on e.id = pm.etapa_id and e.estado not in ('concluida', 'cancelada')
   where pm.produto_id = p_material_id::text
$$;

-- ---------- Movimento manual (Entrada / Saída) ----------
create or replace function public.register_warehouse_manual_movement(p_material_id uuid, p_tipo text, p_quantidade numeric, p_payload jsonb default '{}'::jsonb)
returns public.warehouse_materials language plpgsql security definer set search_path to 'public' as $$
declare v_mat public.warehouse_materials%rowtype; v_before numeric; v_after numeric; v_free numeric; v_unit numeric;
  v_op text := nullif(trim(coalesce(p_payload->>'op_numero', '')), ''); v_emp uuid := public.almox_funcionario();
  v_sol uuid := nullif(p_payload->>'solicitante_id', '')::uuid; v_set uuid := nullif(p_payload->>'setor_id', '')::uuid;
begin
  if not public.almox_tw_pode('Registrar entrada') then raise exception 'Sem permissão para registrar esta movimentação.' using errcode = '42501'; end if;
  if p_tipo not in ('entrada', 'saida') then raise exception 'Tipo de movimentação inválido.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;
  select * into v_mat from public.warehouse_materials where id = p_material_id and empresa_id = public.almox_empresa() for update;
  if not found then raise exception 'Material não encontrado.'; end if;
  if v_op is not null and not public.almox_pedido_existe(v_mat.empresa_id, v_op) then raise exception 'O pedido % não foi encontrado.', v_op; end if;
  v_before := coalesce(v_mat.quantidade_disponivel, 0);
  if p_tipo = 'entrada' then
    v_after := v_before + p_quantidade;
    v_unit := nullif(p_payload->>'valor_unitario', '')::numeric;
    update public.warehouse_materials set quantidade_disponivel = v_after,
      status = case when status = 'inativo' then status else 'disponivel' end,
      valor_unitario = case when coalesce(v_unit, 0) > 0 then v_unit else valor_unitario end
     where id = v_mat.id;
  else
    if p_quantidade > v_before then raise exception 'Saldo disponível insuficiente de % (tem %).', v_mat.nome, trim_scale(v_before); end if;
    v_free := v_before - public.warehouse_blocked_qty(v_mat.id, null);
    if p_quantidade > v_free and coalesce(p_payload->>'origem', '') <> 'producao' then
      raise exception 'Só % % livre(s) de %: o restante está reservado para ordens de produção.', trim_scale(greatest(v_free, 0)), coalesce(v_mat.unidade, ''), v_mat.nome;
    end if;
    v_after := v_before - p_quantidade;
    update public.warehouse_materials set quantidade_disponivel = v_after,
      status = case when status = 'inativo' then status when v_after <= 0 then 'sem saldo' when v_after <= coalesce(estoque_minimo, 0) then 'abaixo do mínimo' else 'disponivel' end
     where id = v_mat.id;
  end if;
  if v_set is null and v_sol is not null then select setor_id into v_set from public.almox_funcionarios where id = v_sol; end if;
  insert into public.warehouse_movements(empresa_id, material_id, tipo, quantidade, unidade, setor_id, solicitante_id, responsavel_id, op_numero, origem,
    documento, localizacao, observacao, estoque_anterior, estoque_atual, valor_unitario, valor_total, fornecedor,
    responsavel_nome, solicitante_nome, setor_nome)
  values (v_mat.empresa_id, v_mat.id, p_tipo, p_quantidade, coalesce(nullif(p_payload->>'unidade', ''), v_mat.unidade), v_set, v_sol,
    coalesce(nullif(p_payload->>'responsavel_id', '')::uuid, v_emp), v_op, coalesce(nullif(p_payload->>'origem', ''), case when p_tipo = 'entrada' then 'entrada_manual' else 'saida_manual' end),
    nullif(p_payload->>'documento', ''), coalesce(nullif(p_payload->>'localizacao', ''), v_mat.localizacao), nullif(p_payload->>'observacao', ''),
    v_before, v_after, coalesce(v_unit, v_mat.valor_unitario), round(coalesce(v_unit, v_mat.valor_unitario, 0) * p_quantidade, 2),
    nullif(p_payload->>'fornecedor', ''),
    coalesce(nullif(p_payload->>'responsavel_nome', ''), public.almox_nome_func(coalesce(nullif(p_payload->>'responsavel_id', '')::uuid, v_emp))),
    public.almox_nome_func(v_sol), (select nome from public.almox_setores where id = v_set));
  select * into v_mat from public.warehouse_materials where id = p_material_id;
  return v_mat;
end $$;

-- ---------- Senha de 4 dígitos (Cadastro de Funcionários) ----------
create or replace function public.verify_employee_warehouse_pin(p_employee_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_emp uuid := public.almox_empresa(); v_caller uuid := public.almox_funcionario(); v_hash text; v_falhas int; ok boolean;
begin
  if v_caller is null or v_emp is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Informe a senha de 4 dígitos.' using errcode = '22023'; end if;
  select pin_hash into v_hash from public.funcionarios_acesso where id = p_employee_id and empresa_id = v_emp and ativo;
  if not found then raise exception 'Solicitante inativo ou não encontrado.'; end if;
  if v_hash is null then raise exception 'O solicitante ainda não tem senha de 4 dígitos. Cadastre no Cadastro de Funcionários.'; end if;
  select count(*) into v_falhas from public.employee_warehouse_pin_attempts where empresa_id = v_emp and employee_id = p_employee_id
     and attempted_by = v_caller and not success and attempted_at > now() - interval '10 minutes';
  if v_falhas >= 5 then raise exception 'Senha bloqueada por 10 minutos após tentativas incorretas.'; end if;
  ok := crypt(p_pin, v_hash) = v_hash;
  insert into public.employee_warehouse_pin_attempts(empresa_id, employee_id, attempted_by, success) values (v_emp, p_employee_id, v_caller, ok);
  return ok;
end $$;

create or replace function public.identify_employee_by_warehouse_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_emp uuid := public.almox_empresa(); v_caller uuid := public.almox_funcionario(); v_falhas int; v_n int; r record;
begin
  if v_caller is null or v_emp is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Informe a senha de 4 dígitos.' using errcode = '22023'; end if;
  select count(*) into v_falhas from public.employee_warehouse_pin_attempts where empresa_id = v_emp and attempted_by = v_caller
     and not success and attempted_at > now() - interval '10 minutes';
  if v_falhas >= 5 then raise exception 'Identificação bloqueada por 10 minutos após tentativas incorretas.'; end if;
  select count(*) into v_n from public.funcionarios_acesso f where f.empresa_id = v_emp and f.ativo and f.pin_hash is not null and crypt(p_pin, f.pin_hash) = f.pin_hash;
  if v_n <> 1 then
    insert into public.employee_warehouse_pin_attempts(empresa_id, attempted_by, success) values (v_emp, v_caller, false);
    return null;
  end if;
  select f.id, f.nome, f.setor_id, f.setor_nome, f.foto_url into r from public.almox_funcionarios f join public.funcionarios_acesso a on a.id = f.id
   where f.empresa_id = v_emp and f.ativo and a.pin_hash is not null and crypt(p_pin, a.pin_hash) = a.pin_hash limit 1;
  insert into public.employee_warehouse_pin_attempts(empresa_id, employee_id, attempted_by, success) values (v_emp, r.id, v_caller, true);
  return jsonb_build_object('employee_id', r.id, 'employee_name', r.nome, 'sector_id', r.setor_id, 'sector_name', r.setor_nome, 'photo_url', r.foto_url);
end $$;

-- ---------- Leitura de código (bipe) ----------
create or replace function public.resolve_warehouse_scan(p_code text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.almox_empresa(); v_code text := upper(trim(p_code)); v record;
begin
  if public.almox_funcionario() is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  v_code := regexp_replace(v_code, '^ACERVO[:;ÇC]ALM[:;ÇC]', '');
  select 'location' kind, l.id entity_id, null::uuid material_id, l.codigo code, l.nome label, 1::numeric units_per_scan,
         null::numeric current_quantity, l.id location_id, l.codigo location_code, null::text batch
    into v from public.warehouse_locations l where l.empresa_id = v_emp and l.ativo and upper(l.codigo) = v_code;
  if found then return to_jsonb(v); end if;
  select 'material', m.id, m.id, m.codigo, m.nome, 1, m.quantidade_disponivel, m.location_id, m.localizacao, m.lote
    into v from public.warehouse_materials m where m.empresa_id = v_emp and (upper(m.codigo) = v_code or upper(coalesce(m.qr_code, '')) = v_code);
  return case when found then to_jsonb(v) else null end;
end $$;

-- ---------- Saída bipada (carrinho com senha de quem retira) ----------
create or replace function public.process_warehouse_exit_cart(p_pin text, p_items jsonb, p_destination text, p_op_number text, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_emp uuid := public.almox_empresa(); v_actor uuid := public.almox_funcionario(); v_req jsonb; v_req_id uuid; v_req_set uuid; v_op uuid;
  v_item jsonb; v_mat public.warehouse_materials; v_qty numeric; v_before numeric; v_after numeric; v_count int := 0;
begin
  if v_actor is null or not public.almox_tw_pode('Registrar saida') then raise exception 'Sem permissão para registrar saída.' using errcode = '42501'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'Bipe pelo menos um material.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Chave da operação obrigatória.'; end if;
  select id into v_op from public.warehouse_operations where empresa_id = v_emp and idempotency_key = p_idempotency_key;
  if v_op is not null then return jsonb_build_object('operation_id', v_op, 'duplicate', true); end if;
  v_req := public.identify_employee_by_warehouse_pin(p_pin);
  if v_req is null then raise exception 'Senha incorreta.' using errcode = '42501'; end if;
  v_req_id := (v_req->>'employee_id')::uuid; v_req_set := nullif(v_req->>'sector_id', '')::uuid;
  if nullif(trim(coalesce(p_op_number, '')), '') is not null and not public.almox_pedido_existe(v_emp, p_op_number) then
    raise exception 'Pedido % não encontrado.', p_op_number; end if;
  insert into public.warehouse_operations(empresa_id, operation_type, destination_type, requester_id, separated_by, authorized_by, sector_id, note, idempotency_key)
  values (v_emp, 'saida', p_destination, v_req_id, v_actor, v_req_id, v_req_set, p_note, p_idempotency_key) returning id into v_op;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, (v_item->>'quantidade')::numeric, 0);
    if v_qty <= 0 then raise exception 'Quantidade inválida.'; end if;
    select * into v_mat from public.warehouse_materials where id = (v_item->>'material_id')::uuid and empresa_id = v_emp for update;
    if v_mat.id is null then raise exception 'Material não encontrado.'; end if;
    v_before := coalesce(v_mat.quantidade_disponivel, 0);
    if v_qty > v_before then raise exception 'Saldo insuficiente para %.', v_mat.nome; end if;
    if v_qty > v_before - public.warehouse_blocked_qty(v_mat.id, null) then
      raise exception 'Só % livre(s) de %: o restante está reservado para ordens de produção.', trim_scale(greatest(v_before - public.warehouse_blocked_qty(v_mat.id, null), 0)), v_mat.nome; end if;
    v_after := v_before - v_qty;
    update public.warehouse_materials set quantidade_disponivel = v_after,
      status = case when status = 'inativo' then status when v_after <= 0 then 'sem saldo' when v_after <= coalesce(estoque_minimo, 0) then 'abaixo do mínimo' else status end
     where id = v_mat.id;
    insert into public.warehouse_movements(empresa_id, material_id, operation_id, tipo, quantidade, unidade, setor_id, solicitante_id, responsavel_id, op_numero,
      origem, documento, observacao, estoque_anterior, estoque_atual, valor_unitario, valor_total, responsavel_nome, solicitante_nome, setor_nome)
    values (v_emp, v_mat.id, v_op, 'saida', v_qty, v_mat.unidade, v_req_set, v_req_id, v_actor, nullif(trim(coalesce(p_op_number, '')), ''), 'saida_bipada', p_destination, p_note,
      v_before, v_after, v_mat.valor_unitario, round(coalesce(v_mat.valor_unitario, 0) * v_qty, 2), public.almox_nome_func(v_actor), v_req->>'employee_name', v_req->>'sector_name');
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('operation_id', v_op, 'items', v_count, 'duplicate', false, 'solicitante', v_req->>'employee_name');
end $$;

-- ---------- Retiradas ----------
create or replace function public.register_warehouse_loan(p_payload jsonb) returns public.warehouse_loans
language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.almox_funcionario(); v_loan public.warehouse_loans; it jsonb; m public.warehouse_materials; v_qty numeric; v_free numeric; v_after numeric;
  v_count int := 0; v_op text := nullif(trim(coalesce(p_payload->>'op_numero', '')), ''); v_ret uuid := nullif(p_payload->>'retirado_por_id', '')::uuid;
  v_set uuid := nullif(p_payload->>'setor_id', '')::uuid;
begin
  if v_emp is null or not public.almox_tw_pode('Registrar saida') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if v_ret is null then raise exception 'Informe quem está retirando.'; end if;
  if v_op is not null and not public.almox_pedido_existe(public.almox_empresa(), v_op) then raise exception 'Pedido % não encontrado.', v_op; end if;
  if v_set is null then select setor_id into v_set from public.almox_funcionarios where id = v_ret; end if;
  insert into public.warehouse_loans(empresa_id, responsavel_entrega_id, retirado_por_id, setor_id, previsao_devolucao, observacoes, status, op_numero)
  values (public.almox_empresa(), coalesce(nullif(p_payload->>'responsavel_entrega_id', '')::uuid, v_emp), v_ret, v_set,
    nullif(p_payload->>'previsao_devolucao', '')::date, nullif(p_payload->>'observacoes', ''), 'aberto', v_op) returning * into v_loan;
  for it in select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_qty := coalesce((it->>'quantidade')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into m from public.warehouse_materials where id = (it->>'material_id')::uuid and empresa_id = v_loan.empresa_id for update;
    if m.id is null then raise exception 'Item não encontrado.'; end if;
    v_free := coalesce(m.quantidade_disponivel, 0) - public.warehouse_blocked_qty(m.id, null);
    if v_qty > v_free then raise exception 'Só % % livre(s) de %.', trim_scale(greatest(v_free, 0)), coalesce(m.unidade, ''), m.nome; end if;
    v_after := coalesce(m.quantidade_disponivel, 0) - v_qty;
    update public.warehouse_materials set quantidade_disponivel = v_after where id = m.id;
    insert into public.warehouse_loan_items(empresa_id, loan_id, material_id, quantidade_retirada, unidade, status)
    values (v_loan.empresa_id, v_loan.id, m.id, v_qty, coalesce(nullif(it->>'unidade', ''), m.unidade), 'aberto');
    insert into public.warehouse_movements(empresa_id, material_id, tipo, quantidade, unidade, setor_id, solicitante_id, responsavel_id, origem, documento, observacao,
      estoque_anterior, estoque_atual, op_numero, valor_unitario, valor_total, responsavel_nome, solicitante_nome, setor_nome)
    values (m.empresa_id, m.id, 'saida', v_qty, m.unidade, v_loan.setor_id, v_ret, v_emp, 'retirada_ferramenta', 'Retirada', v_loan.observacoes,
      m.quantidade_disponivel, v_after, v_op, m.valor_unitario, round(coalesce(m.valor_unitario, 0) * v_qty, 2),
      public.almox_nome_func(v_emp), public.almox_nome_func(v_ret), (select nome from public.almox_setores where id = v_loan.setor_id));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Adicione pelo menos um item para a retirada.'; end if;
  return v_loan;
end $$;

create or replace function public.return_warehouse_loan_item(p_item_id uuid, p_quantidade numeric) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.almox_funcionario(); it public.warehouse_loan_items; m public.warehouse_materials; v_pend numeric; v_new numeric; v_after numeric;
begin
  if v_emp is null or not public.almox_tw_pode('Registrar entrada') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into it from public.warehouse_loan_items where id = p_item_id and empresa_id = public.almox_empresa() for update;
  if it.id is null then raise exception 'Item da retirada não encontrado.'; end if;
  v_pend := it.quantidade_retirada - coalesce(it.quantidade_devolvida, 0);
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade de devolução inválida.'; end if;
  if p_quantidade > v_pend then raise exception 'Quantidade maior que o saldo pendente.'; end if;
  v_new := coalesce(it.quantidade_devolvida, 0) + p_quantidade;
  update public.warehouse_loan_items set quantidade_devolvida = v_new, updated_at = now(),
    status = case when v_new >= quantidade_retirada then 'devolvido' else 'aberto' end,
    devolvido_em = case when v_new >= quantidade_retirada then now() else devolvido_em end where id = it.id;
  select * into m from public.warehouse_materials where id = it.material_id for update;
  v_after := coalesce(m.quantidade_disponivel, 0) + p_quantidade;
  update public.warehouse_materials set quantidade_disponivel = v_after, status = case when status = 'inativo' then status else 'disponivel' end where id = m.id;
  insert into public.warehouse_movements(empresa_id, material_id, tipo, quantidade, unidade, responsavel_id, origem, documento, estoque_anterior, estoque_atual, op_numero, responsavel_nome)
  values (m.empresa_id, m.id, 'entrada', p_quantidade, m.unidade, v_emp, 'devolucao_ferramenta', 'Devolução', m.quantidade_disponivel, v_after,
    (select l.op_numero from public.warehouse_loans l where l.id = it.loan_id), public.almox_nome_func(v_emp));
  update public.warehouse_loans l set updated_at = now(),
    status = case when exists(select 1 from public.warehouse_loan_items x where x.loan_id = l.id and x.status <> 'devolvido') then 'aberto' else 'devolvido' end
   where l.id = it.loan_id;
  return jsonb_build_object('quantidade_devolvida', v_new, 'pendente', it.quantidade_retirada - v_new);
end $$;

-- ---------- Contagem mensal ----------
create or replace function public.warehouse_open_count_cycle(p_empresa_id uuid) returns public.warehouse_count_cycles
language plpgsql security definer set search_path to 'public' as $$
declare c public.warehouse_count_cycles;
begin
  select * into c from public.warehouse_count_cycles where empresa_id = p_empresa_id and concluido_em is null;
  if c.id is null then
    insert into public.warehouse_count_cycles(empresa_id, numero, iniciado_em)
    values (p_empresa_id, coalesce((select max(numero) from public.warehouse_count_cycles where empresa_id = p_empresa_id), 0) + 1,
      case when exists(select 1 from public.warehouse_count_cycles where empresa_id = p_empresa_id) then now()
           else date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' end)
    on conflict do nothing;
    select * into c from public.warehouse_count_cycles where empresa_id = p_empresa_id and concluido_em is null;
  end if;
  return c;
end $$;

create or replace function public.warehouse_count_cycle(p_empresa_id uuid)
returns table(material_id uuid, ultima_contagem timestamptz, liberado boolean)
language plpgsql security definer set search_path to 'public' as $$
declare c public.warehouse_count_cycles;
begin
  c := public.warehouse_open_count_cycle(p_empresa_id);
  return query select m.id, (select max(ci.created_at) from public.warehouse_count_items ci where ci.material_id = m.id),
    not exists(select 1 from public.warehouse_count_items ci where ci.material_id = m.id and ci.created_at >= c.iniciado_em)
    from public.warehouse_materials m where m.empresa_id = p_empresa_id and m.status <> 'inativo';
end $$;

create or replace function public.list_warehouse_count_cycle()
returns table(material_id uuid, ultima_contagem timestamptz, liberado boolean)
language sql security definer set search_path to 'public' as $$ select * from public.warehouse_count_cycle(public.almox_empresa()) $$;

create or replace function public.get_warehouse_count_cycle_state() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c public.warehouse_count_cycles; v_last uuid;
begin
  c := public.warehouse_open_count_cycle(public.almox_empresa());
  select id into v_last from public.warehouse_count_cycles where empresa_id = public.almox_empresa() and concluido_em is not null order by concluido_em desc limit 1;
  return jsonb_build_object('id', c.id, 'numero', c.numero, 'iniciado_em', c.iniciado_em, 'ultimo_concluido_id', v_last);
end $$;

create or replace function public.is_count_approver(p_area text) returns boolean
language sql stable security definer set search_path to 'public' as $$ select public.almox_tw_pode('Ajustar saldo') $$;

create or replace function public.get_count_approval_rights() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('almoxarifado', public.is_count_approver('almoxarifado'), 'ferramental', false,
    'aprovadores_almoxarifado', '[]'::jsonb, 'aprovadores_ferramental', '[]'::jsonb)
$$;

create or replace function public.register_warehouse_count(p_items jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.almox_funcionario(); it jsonb; m public.warehouse_materials; v_counted numeric; v_diff numeric;
  v_row public.warehouse_count_items; v_out jsonb := '[]'::jsonb; v_pending int;
begin
  if v_emp is null or not public.almox_tw_pode('Finalizar contagem') then raise exception 'Sem permissão para registrar contagem.' using errcode = '42501'; end if;
  select count(*) into v_pending from public.warehouse_count_cycle(public.almox_empresa()) c where c.liberado;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if exists(select 1 from public.warehouse_count_cycle(public.almox_empresa()) c where c.material_id = (it->>'material_id')::uuid and not c.liberado) then
      raise exception '% já foi contado neste ciclo. Ele só pode ser contado de novo depois de contar os outros % material(is) pendente(s).',
        (select nome from public.warehouse_materials where id = (it->>'material_id')::uuid), v_pending;
    end if;
    select * into m from public.warehouse_materials where id = (it->>'material_id')::uuid and empresa_id = public.almox_empresa();
    if m.id is null then continue; end if;
    v_counted := (it->>'quantidade_contada')::numeric;
    if v_counted is null or v_counted < 0 then raise exception 'Quantidade contada inválida para %.', m.nome; end if;
    v_diff := v_counted - coalesce(m.quantidade_disponivel, 0);
    insert into public.warehouse_count_items(material_id, quantidade_sistema, quantidade_contada, divergencia, valor_divergencia, observacao, finalizada,
      responsavel_id, location_id, ajuste_status, empresa_id)
    values (m.id, coalesce(m.quantidade_disponivel, 0), v_counted, v_diff, v_diff * coalesce(m.valor_unitario, 0), nullif(trim(coalesce(it->>'observacao', '')), ''),
      true, v_emp, m.location_id, case when v_diff = 0 then 'sem_divergencia' else 'aguardando_justificativa' end, m.empresa_id)
    returning * into v_row;
    v_out := v_out || jsonb_build_object('id', v_row.id, 'material_id', m.id, 'material_nome', m.nome, 'codigo', m.codigo, 'unidade', m.unidade,
      'quantidade_sistema', v_row.quantidade_sistema, 'quantidade_contada', v_counted, 'divergencia', v_diff, 'ajuste_status', v_row.ajuste_status);
  end loop;
  return v_out;
end $$;

create or replace function public.justify_warehouse_count_item(p_id uuid, p_justificativa text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.almox_tw_pode('Finalizar contagem') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_justificativa, ''))) < 5 then raise exception 'Escreva a justificativa da divergência.'; end if;
  update public.warehouse_count_items set justificativa = trim(p_justificativa), ajuste_status = 'pendente'
   where id = p_id and empresa_id = public.almox_empresa() and ajuste_status in ('aguardando_justificativa', 'pendente');
  if not found then raise exception 'Item de contagem não encontrado ou já analisado.'; end if;
end $$;

create or replace function public.review_warehouse_count_adjustment(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.almox_funcionario(); c public.warehouse_count_items; m public.warehouse_materials; v_before numeric; v_after numeric; v_mov uuid;
begin
  if v_emp is null or not public.is_count_approver('almoxarifado') then
    raise exception 'Você não tem permissão para aprovar ajuste de contagem (Almoxarifado: aprovar).' using errcode = '42501'; end if;
  select * into c from public.warehouse_count_items where id = p_id and empresa_id = public.almox_empresa() for update;
  if c.id is null or c.ajuste_status <> 'pendente' then raise exception 'Ajuste não encontrado ou já analisado.'; end if;
  if c.responsavel_id = v_emp then raise exception 'O ajuste precisa ser aprovado por outra pessoa, não por quem contou.'; end if;
  if not p_approve then
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Informe o motivo da recusa.'; end if;
    update public.warehouse_count_items set ajuste_status = 'recusado', analisado_por = v_emp, analisado_em = now(), analise_observacao = trim(p_note) where id = c.id;
    return jsonb_build_object('status', 'recusado');
  end if;
  select * into m from public.warehouse_materials where id = c.material_id for update;
  v_before := coalesce(m.quantidade_disponivel, 0);
  v_after := greatest(0, v_before + c.divergencia);
  update public.warehouse_materials set quantidade_disponivel = v_after,
    status = case when status = 'inativo' then status when v_after <= 0 then 'sem saldo' when v_after <= coalesce(estoque_minimo, 0) then 'abaixo do mínimo' else 'disponivel' end
   where id = m.id;
  insert into public.warehouse_movements(empresa_id, material_id, tipo, quantidade, unidade, responsavel_id, origem, documento, observacao, estoque_anterior, estoque_atual,
    valor_unitario, valor_total, responsavel_nome)
  values (m.empresa_id, m.id, 'ajuste', c.divergencia, m.unidade, v_emp, 'contagem_aprovada', 'Ajuste de contagem',
    concat_ws(' | ', 'Justificativa: ' || c.justificativa, nullif('Aprovação: ' || trim(coalesce(p_note, '')), 'Aprovação: ')), v_before, v_after,
    m.valor_unitario, round(coalesce(m.valor_unitario, 0) * c.divergencia, 2), public.almox_nome_func(v_emp))
  returning id into v_mov;
  update public.warehouse_count_items set ajuste_status = 'aprovado', analisado_por = v_emp, analisado_em = now(),
    analise_observacao = nullif(trim(coalesce(p_note, '')), ''), movimento_id = v_mov where id = c.id;
  return jsonb_build_object('status', 'aprovado', 'estoque_anterior', v_before, 'estoque_atual', v_after);
end $$;

create or replace function public.conclude_warehouse_count_cycle() returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare c public.warehouse_count_cycles; v_emp uuid := public.almox_funcionario(); v_pending int;
begin
  if v_emp is null or not public.almox_tw_pode('Finalizar contagem') then raise exception 'Sem permissão para concluir a contagem.' using errcode = '42501'; end if;
  c := public.warehouse_open_count_cycle(public.almox_empresa());
  select count(*) into v_pending from public.warehouse_count_cycle(public.almox_empresa()) x where x.liberado;
  if v_pending > 0 then raise exception 'Ainda faltam % material(is) para contar neste ciclo.', v_pending; end if;
  select count(*) into v_pending from public.warehouse_count_items ci where ci.empresa_id = c.empresa_id and ci.created_at >= c.iniciado_em and ci.ajuste_status = 'aguardando_justificativa';
  if v_pending > 0 then raise exception 'Justifique as % divergência(s) antes de concluir a contagem.', v_pending; end if;
  update public.warehouse_count_cycles set concluido_em = clock_timestamp(), concluido_por = v_emp where id = c.id;
  insert into public.warehouse_count_cycles(empresa_id, numero, iniciado_em) values (c.empresa_id, c.numero + 1, clock_timestamp() + interval '1 millisecond');
  return c.id;
end $$;

create or replace function public.list_warehouse_count_cycles() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare result jsonb;
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'iniciado_em', c.iniciado_em, 'concluido_em', c.concluido_em,
      'concluido_por', public.almox_nome_func(c.concluido_por), 'materiais', s.materiais, 'divergencias', s.divergencias, 'resultado', s.resultado) order by c.numero desc), '[]'::jsonb)
    into result
    from public.warehouse_count_cycles c
    cross join lateral (
      select count(*) materiais, count(*) filter (where coalesce(x.divergencia, 0) <> 0) divergencias, coalesce(sum(x.valor_divergencia), 0) resultado
        from (select distinct on (ci.material_id) ci.* from public.warehouse_count_items ci
               where ci.empresa_id = c.empresa_id and ci.created_at >= c.iniciado_em and ci.created_at <= c.concluido_em
               order by ci.material_id, ci.created_at desc) x) s
   where c.empresa_id = public.almox_empresa() and c.concluido_em is not null;
  return result;
end $$;

create or replace function public.get_warehouse_count_cycle_report(p_cycle_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c public.warehouse_count_cycles; v_items jsonb;
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into c from public.warehouse_count_cycles where id = p_cycle_id and empresa_id = public.almox_empresa();
  if c.id is null then raise exception 'Ciclo de contagem não encontrado.'; end if;
  select coalesce(jsonb_agg(x order by x->>'localizacao' nulls last, x->>'nome'), '[]'::jsonb) into v_items from (
    select jsonb_build_object('material_id', m.id, 'codigo', m.codigo, 'nome', m.nome, 'unidade', m.unidade, 'categoria', m.categoria,
      'localizacao', nullif(m.localizacao, ''), 'valor_unitario', m.valor_unitario, 'quantidade_sistema', ci.quantidade_sistema,
      'quantidade_contada', ci.quantidade_contada, 'divergencia', ci.divergencia, 'valor_divergencia', ci.valor_divergencia,
      'ajuste_status', ci.ajuste_status, 'justificativa', ci.justificativa, 'observacao', ci.observacao, 'analise_observacao', ci.analise_observacao,
      'contado_em', ci.created_at, 'contado_por', public.almox_nome_func(ci.responsavel_id), 'analisado_por', public.almox_nome_func(ci.analisado_por)) x
      from public.warehouse_materials m
      join lateral (select * from public.warehouse_count_items i where i.material_id = m.id and i.created_at >= c.iniciado_em
                     and (c.concluido_em is null or i.created_at <= c.concluido_em) order by i.created_at desc limit 1) ci on true
     where m.empresa_id = c.empresa_id) t;
  return jsonb_build_object('id', c.id, 'numero', c.numero, 'iniciado_em', c.iniciado_em, 'concluido_em', c.concluido_em,
    'concluido_por', public.almox_nome_func(c.concluido_por), 'itens', v_items);
end $$;

-- ---------- EPI ----------
create or replace function public.almox_epi_data() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare company uuid := public.almox_empresa();
begin
  if not (public.almox_tw_pode('Acessar almoxarifado') or public.almox_tw_pode('Acessar gestao de pessoas')) then
    raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'pode_editar', public.almox_tw_pode('Registrar entrada') or public.almox_tw_pode('Editar colaboradores'),
    'pode_editar_catalogo', public.almox_tw_pode('Editar material') or public.almox_tw_pode('Editar colaboradores'),
    'epis', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'ca', p.ca, 'ca_validade', p.ca_validade, 'troca_dias', p.troca_dias,
        'ativo', p.ativo, 'material_id', p.material_id, 'material_nome', m.nome, 'material_codigo', m.codigo, 'estoque', m.quantidade_disponivel, 'unidade', m.unidade) order by p.nome)
      from public.rh_epis p left join public.warehouse_materials m on m.id = p.material_id where p.empresa_id = company), '[]'),
    'entregas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'colaborador_id', x.colaborador_id, 'epi_id', x.epi_id, 'quantidade', x.quantidade,
        'data_entrega', x.data_entrega, 'troca_prevista', x.troca_prevista, 'motivo', x.motivo, 'ca', x.ca, 'devolvido_em', x.devolvido_em, 'observacao', x.observacao,
        'entregue_por', public.almox_nome_func(x.entregue_por)) order by x.data_entrega desc, x.created_at desc)
      from public.rh_epi_entregas x where x.empresa_id = company), '[]'),
    'colaboradores', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'matricula', null, 'cpf', null, 'cargo', f.cargo,
        'setor', f.setor, 'admissao_data', f.data_admissao, 'tamanho_calcado', f.dados_rh->>'tamanho_calcado',
        'status', case when f.ativo then 'ativo' else 'desligado' end, 'funcionario_id', f.id) order by f.nome)
      from public.funcionarios_acesso f where f.empresa_id = company), '[]'));
end $$;

create or replace function public.almox_epi_return(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.almox_tw_pode('Registrar entrada') or public.almox_tw_pode('Editar colaboradores')) then
    raise exception 'Sem permissão para registrar devolução.' using errcode = '42501'; end if;
  update public.rh_epi_entregas set devolvido_em = (now() at time zone 'America/Sao_Paulo')::date
   where id = p_id and empresa_id = public.almox_empresa() and devolvido_em is null;
  if not found then raise exception 'Entrega não encontrada ou já devolvida.'; end if;
end $$;

create or replace function public.almox_epi_save(p jsonb) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_material uuid := nullif(p->>'material_id', '')::uuid; v_dias int := nullif(p->>'troca_dias', '')::int;
  v_emp uuid := public.almox_empresa();
begin
  if not (public.almox_tw_pode('Editar material') or public.almox_tw_pode('Editar colaboradores')) then raise exception 'Sem permissão para editar EPI.' using errcode = '42501'; end if;
  if length(trim(coalesce(p->>'nome', ''))) < 2 then raise exception 'Informe o nome do EPI.'; end if;
  if nullif(trim(p->>'ca'), '') is null then raise exception 'Informe o número do CA do EPI.'; end if;
  if v_dias < 0 then raise exception 'O intervalo de troca não pode ser negativo.'; end if;
  if v_material is not null and not exists(select 1 from public.warehouse_materials where id = v_material and empresa_id = v_emp) then
    raise exception 'Item do estoque não encontrado nesta empresa.'; end if;
  if v_id is null then
    insert into public.rh_epis(empresa_id, nome, ca, ca_validade, troca_dias, ativo, material_id)
    values (v_emp, trim(p->>'nome'), trim(p->>'ca'), nullif(p->>'ca_validade', '')::date, nullif(v_dias, 0), coalesce((p->>'ativo')::boolean, true), v_material)
    returning id into v_id;
  else
    update public.rh_epis set nome = trim(p->>'nome'), ca = trim(p->>'ca'), ca_validade = nullif(p->>'ca_validade', '')::date,
      troca_dias = nullif(v_dias, 0), ativo = coalesce((p->>'ativo')::boolean, true), material_id = v_material
     where id = v_id and empresa_id = v_emp;
    if not found then raise exception 'EPI não encontrado nesta empresa.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.almox_material_epi_get(p_material_id uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('is_epi', coalesce(e.ativo, false), 'ca', e.ca, 'ca_validade', e.ca_validade, 'troca_dias', e.troca_dias)
  from (select 1) x left join public.rh_epis e on e.material_id = p_material_id and e.empresa_id = public.almox_empresa()
$$;

create or replace function public.almox_material_epi_set(p_material_id uuid, p_is_epi boolean, p_ca text, p_ca_validade date, p_troca_dias integer) returns void
language plpgsql security definer set search_path to 'public' as $$
declare m public.warehouse_materials;
begin
  if not public.almox_tw_pode('Editar material') then raise exception 'Sem permissão para editar material.' using errcode = '42501'; end if;
  select * into m from public.warehouse_materials where id = p_material_id and empresa_id = public.almox_empresa();
  if not found then raise exception 'Item não encontrado.'; end if;
  if p_is_epi then
    if nullif(trim(p_ca), '') is null then raise exception 'Informe o número do CA do EPI.'; end if;
    if p_troca_dias < 0 then raise exception 'O intervalo de troca não pode ser negativo.'; end if;
    insert into public.rh_epis(empresa_id, nome, material_id, ca, ca_validade, troca_dias, ativo)
    values (m.empresa_id, m.nome, m.id, trim(p_ca), p_ca_validade, nullif(p_troca_dias, 0), true)
    on conflict (empresa_id, material_id) where material_id is not null
      do update set nome = excluded.nome, ca = excluded.ca, ca_validade = excluded.ca_validade, troca_dias = excluded.troca_dias, ativo = true;
  else
    update public.rh_epis set ativo = false where material_id = m.id and empresa_id = m.empresa_id;
  end if;
end $$;

-- Saída de item ligado a EPI vira entrega na ficha da pessoa.
create or replace function public.rh_epi_from_warehouse_exit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare e record; v_dia date;
begin
  if new.tipo <> 'saida' or new.solicitante_id is null then return new; end if;
  if not exists (select 1 from public.rh_epis where empresa_id = new.empresa_id and material_id = new.material_id and ativo) then return new; end if;
  if not exists (select 1 from public.funcionarios_acesso where id = new.solicitante_id and empresa_id = new.empresa_id and ativo) then
    raise exception 'Para entregar EPI, quem retira precisa estar ativo no Cadastro de Funcionários.'; end if;
  v_dia := (coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date;
  for e in select * from public.rh_epis where empresa_id = new.empresa_id and material_id = new.material_id and ativo loop
    insert into public.rh_epi_entregas(empresa_id, colaborador_id, epi_id, quantidade, data_entrega, troca_prevista, motivo, ca, entregue_por, observacao, movement_id)
    values (new.empresa_id, new.solicitante_id, e.id, new.quantidade, v_dia, case when coalesce(e.troca_dias, 0) > 0 then v_dia + e.troca_dias end,
      'entrega', e.ca, new.responsavel_id, 'Saída do almoxarifado' || coalesce(' · ' || nullif(trim(new.observacao), ''), ''), new.id);
  end loop;
  return new;
end $$;
create trigger rh_epi_from_warehouse_exit after insert on public.warehouse_movements
  for each row execute function public.rh_epi_from_warehouse_exit();

-- ---------- Vínculos de fornecedores ----------
create or replace function public.warehouse_supplier_links_list(p_search text default '', p_offset integer default 0, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb;
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then raise exception 'Sem permissão para consultar vínculos.' using errcode = '42501'; end if;
  with links as (
    select l.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade as material_unidade, m.status as material_status,
      coalesce(nullif(l.fornecedor_nome, ''), l.cnpj_fornecedor) as fornecedor_nome
      from public.supplier_product_links l
      join public.warehouse_materials m on m.id = l.material_id and m.empresa_id = l.empresa_id
     where l.empresa_id = public.almox_empresa()
  ), filtered as (
    select * from links where nullif(trim(p_search), '') is null
      or concat_ws(' ', fornecedor_nome, cnpj_fornecedor, codigo_fornecedor, gtin, descricao_fornecedor, material_nome, material_codigo) ilike '%' || trim(p_search) || '%'
  ), page as (
    select * from filtered order by fornecedor_nome, cnpj_fornecedor, codigo_fornecedor, id
     offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
    'total', (select count(*) from filtered), 'can_edit', public.almox_tw_pode('Registrar entrada')) into result;
  return result;
end $$;

create or replace function public.warehouse_supplier_link_update(p_id uuid, p_material_id uuid, p_factor numeric) returns public.supplier_product_links
language plpgsql security definer set search_path to 'public' as $$
declare result public.supplier_product_links; internal_unit text;
begin
  if not public.almox_tw_pode('Registrar entrada') then raise exception 'Sem permissão para editar vínculos.' using errcode = '42501'; end if;
  if p_factor is null or p_factor <= 0 then raise exception 'Informe um fator de conversão maior que zero.'; end if;
  select unidade into internal_unit from public.warehouse_materials where id = p_material_id and empresa_id = public.almox_empresa() and status is distinct from 'inativo';
  if not found then raise exception 'Material não encontrado ou inativo nesta empresa.'; end if;
  update public.supplier_product_links set material_id = p_material_id, fator_conversao = p_factor, unidade_interna = internal_unit, atualizado_em = now()
   where id = p_id and empresa_id = public.almox_empresa() returning * into result;
  if not found then raise exception 'Vínculo não encontrado nesta empresa.'; end if;
  return result;
end $$;

create or replace function public.warehouse_retained_materials() returns jsonb
language sql stable security definer set search_path to 'public' as $$ select '[]'::jsonb $$;

revoke execute on function public.almox_nome_func(uuid), public.almox_pedido_existe(uuid, text), public.warehouse_material_assign_code(public.warehouse_materials),
  public.warehouse_open_count_cycle(uuid), public.warehouse_count_cycle(uuid) from public, anon;
