-- =====================================================================================
-- RH (out/2026) — baseado na Gestão de pessoas da Tecnoweld, adaptado ao Acervo.
-- A pessoa é a do Cadastro de Funcionários (funcionarios_acesso); o RH acrescenta a ficha
-- (rh_fichas, 1 linha por pessoa), documentos com validade (ASO, NRs, CNH…), exames
-- periódicos, treinamentos e turmas, benefícios (tempo de casa e adesão), férias
-- (individuais e coletivas) e os checklists de admissão e desligamento.
-- Ocorrências continuam no Controle RH (planilha da Chiavari); a ficha só lê de lá.
-- Acesso: ler = 'rh.colaboradores.visualizar'; gravar = 'rh.colaboradores.editar'.
-- Desligar pela ficha deixa o funcionário inativo (o login dele para de funcionar).
-- =====================================================================================

create or replace function public.rh_pode(p_empresa uuid, p_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.eh_membro_empresa(p_empresa) and public.funcionario_pode(p_empresa, auth.uid(), p_chave);
$$;
revoke all on function public.rh_pode(uuid, text) from public, anon;
grant execute on function public.rh_pode(uuid, text) to authenticated;

create table if not exists public.rh_fichas (
  funcionario_id uuid primary key references public.funcionarios_acesso(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  matricula text, pis text, ctps text,
  tipo_contrato text not null default 'clt' check (tipo_contrato in ('clt','pj','estagio','aprendiz','temporario','freelancer','terceiro')),
  jornada text,
  experiencia_fim date,
  status text not null default 'ativo' check (status in ('ativo','afastado','desligado')),
  afastamento_motivo text, afastamento_inicio date, afastamento_fim date,
  desligamento_data date, desligamento_tipo text, desligamento_motivo text,
  contato_emergencia text, contato_emergencia_telefone text,
  estado_civil text, escolaridade text, dependentes integer not null default 0 check (dependentes >= 0),
  banco text, agencia text, conta text, pix text,
  tamanho_camisa text, tamanho_calca text, tamanho_calcado text,
  transporte_tipo text, transporte_passagens_dia numeric(5,1), transporte_tarifa numeric(10,2),
  observacoes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists rh_fichas_empresa on public.rh_fichas(empresa_id);

create table if not exists public.rh_treinamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  categoria text not null default 'treinamento',
  carga_horaria numeric(6,1),
  validade_meses integer check (validade_meses is null or validade_meses > 0),
  setores_obrigatorios text[] not null default '{}',
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists rh_treinamentos_nome on public.rh_treinamentos(empresa_id, lower(trim(nome)));

create table if not exists public.rh_turmas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  treinamento_id uuid not null references public.rh_treinamentos(id) on delete cascade,
  data date not null,
  instrutor text, local text, carga_horaria numeric(6,1), observacao text, arquivo_path text,
  created_at timestamptz not null default now()
);
create index if not exists rh_turmas_empresa on public.rh_turmas(empresa_id, data desc);

create table if not exists public.rh_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  categoria text not null default 'outro',
  nome text not null check (length(trim(nome)) > 0),
  emissao date, validade date,
  arquivo_path text, arquivo_nome text,
  treinamento_id uuid references public.rh_treinamentos(id) on delete set null,
  turma_id uuid references public.rh_turmas(id) on delete cascade,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists rh_documentos_pessoa on public.rh_documentos(funcionario_id);
create index if not exists rh_documentos_validade on public.rh_documentos(empresa_id, validade);

create table if not exists public.rh_exames_cadastro (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'periodico',
  validade_meses integer check (validade_meses is null or validade_meses > 0),
  setores_obrigatorios text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists rh_exames_cadastro_nome on public.rh_exames_cadastro(empresa_id, lower(trim(nome)));

create table if not exists public.rh_exames (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  exame_cadastro_id uuid references public.rh_exames_cadastro(id) on delete set null,
  tipo text not null default 'periodico' check (tipo in ('admissional','periodico','retorno','mudanca_funcao','demissional','complementar')),
  nome text not null check (length(trim(nome)) > 0),
  data_realizacao date, validade date,
  resultado text check (resultado is null or resultado in ('apto','apto_restricao','inapto')),
  clinica text, arquivo_path text, arquivo_nome text, observacao text,
  created_at timestamptz not null default now()
);
create index if not exists rh_exames_pessoa on public.rh_exames(funcionario_id);

create table if not exists public.rh_beneficios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  meses_carencia integer not null default 0 check (meses_carencia >= 0),
  valor numeric(12,2), valor_dependente numeric(12,2),
  tipos_contrato text[] not null default array['clt'],
  adesao text not null default 'todos' check (adesao in ('todos','quem_aderir')),
  cobranca text not null default 'empresa' check (cobranca in ('empresa','desconto','dividido')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_beneficio_adesoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  beneficio_id uuid not null references public.rh_beneficios(id) on delete cascade,
  desde date not null default current_date,
  dependentes integer not null default 0 check (dependentes >= 0),
  created_at timestamptz not null default now(),
  unique (funcionario_id, beneficio_id)
);

create table if not exists public.rh_ferias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  periodo_inicio date not null,
  inicio date not null, fim date not null,
  dias integer not null check (dias between 1 and 30),
  abono_dias integer not null default 0 check (abono_dias between 0 and 10),
  status text not null default 'programada' check (status in ('programada','aprovada','cancelada')),
  coletiva_id uuid, coletiva_nome text,
  aprovado_por uuid, aprovado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  check (fim >= inicio)
);
create index if not exists rh_ferias_pessoa on public.rh_ferias(funcionario_id, inicio);

create table if not exists public.rh_checklists (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  tipo text not null check (tipo in ('admissao','desligamento')),
  itens jsonb not null default '[]',
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (funcionario_id, tipo)
);

-- a pessoa da linha precisa ser da mesma empresa
create or replace function public.rh_mesma_empresa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.funcionario_id is not null and not exists (select 1 from funcionarios_acesso f where f.id = new.funcionario_id and f.empresa_id = new.empresa_id) then
    raise exception 'Funcionário não pertence à empresa';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rh_fichas','rh_treinamentos','rh_turmas','rh_documentos','rh_exames_cadastro','rh_exames','rh_beneficios','rh_beneficio_adesoes','rh_ferias','rh_checklists'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rh_ler on public.%I', t);
    execute format('create policy rh_ler on public.%I for select to authenticated using (public.rh_pode(empresa_id, %L))', t, 'rh.colaboradores.visualizar');
    execute format('drop policy if exists rh_gravar on public.%I', t);
    execute format('create policy rh_gravar on public.%I for all to authenticated using (public.rh_pode(empresa_id, %L)) with check (public.rh_pode(empresa_id, %L))', t, 'rh.colaboradores.editar', 'rh.colaboradores.editar');
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['rh_fichas','rh_documentos','rh_exames','rh_beneficio_adesoes','rh_ferias','rh_checklists'] loop
    execute format('drop trigger if exists rh_mesma_empresa on public.%I', t);
    execute format('create trigger rh_mesma_empresa before insert or update on public.%I for each row execute function public.rh_mesma_empresa()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ leitura: todas as pessoas com a ficha
create or replace function public.rh_pessoas(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.visualizar') then raise exception 'Sem permissão para ver o RH' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'setor', f.setor, 'cargo', f.cargo, 'email', f.email, 'telefone', f.telefone,
      'ativo', f.ativo, 'acesso_sistema', f.acesso_sistema, 'cpf', f.cpf, 'data_admissao', f.data_admissao,
      'dados_rh', coalesce(f.dados_rh, '{}'::jsonb), 'eu', f.id = auth.uid(),
      'ficha', to_jsonb(r) - 'empresa_id' - 'funcionario_id'
    ) order by f.nome), '[]'::jsonb)
    from funcionarios_acesso f left join rh_fichas r on r.funcionario_id = f.id
    where f.empresa_id = p_empresa);
end $$;

-- ------------------------------------------------------------------ gravar a ficha (e os dados pessoais do cadastro)
create or replace function public.rh_ficha_salvar(p_empresa uuid, p_funcionario uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_cpf text; v_adm text; v_nasc text;
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.editar') then raise exception 'Sem permissão para editar colaboradores' using errcode = '42501'; end if;
  if not exists (select 1 from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa) then raise exception 'Funcionário não encontrado'; end if;
  v_cpf := regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g');
  if v_cpf <> '' and length(v_cpf) <> 11 then raise exception 'CPF deve ter 11 dígitos'; end if;
  v_adm := nullif(p_dados->>'data_admissao', ''); v_nasc := nullif(p_dados->>'data_nascimento', '');
  update funcionarios_acesso set
    cargo = case when p_dados ? 'cargo' then nullif(trim(p_dados->>'cargo'), '') else cargo end,
    telefone = case when p_dados ? 'telefone' then nullif(trim(p_dados->>'telefone'), '') else telefone end,
    cpf = case when p_dados ? 'cpf' then nullif(v_cpf, '') else cpf end,
    data_admissao = case when p_dados ? 'data_admissao' then v_adm::date else data_admissao end,
    dados_rh = coalesce(dados_rh, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'rg', case when p_dados ? 'rg' then coalesce(p_dados->>'rg', '') end,
      'data_nascimento', case when p_dados ? 'data_nascimento' then coalesce(v_nasc, '') end,
      'endereco', case when p_dados ? 'endereco' then coalesce(p_dados->>'endereco', '') end,
      'whatsapp', case when p_dados ? 'whatsapp' then coalesce(p_dados->>'whatsapp', '') end)),
    updated_at = now()
  where id = p_funcionario;
  insert into rh_fichas(funcionario_id, empresa_id) values (p_funcionario, p_empresa) on conflict (funcionario_id) do nothing;
  update rh_fichas set
    matricula = case when p_dados ? 'matricula' then nullif(trim(p_dados->>'matricula'), '') else matricula end,
    pis = case when p_dados ? 'pis' then nullif(trim(p_dados->>'pis'), '') else pis end,
    ctps = case when p_dados ? 'ctps' then nullif(trim(p_dados->>'ctps'), '') else ctps end,
    tipo_contrato = coalesce(nullif(p_dados->>'tipo_contrato', ''), tipo_contrato),
    jornada = case when p_dados ? 'jornada' then nullif(trim(p_dados->>'jornada'), '') else jornada end,
    experiencia_fim = case when p_dados ? 'experiencia_fim' then nullif(p_dados->>'experiencia_fim', '')::date else experiencia_fim end,
    contato_emergencia = case when p_dados ? 'contato_emergencia' then nullif(trim(p_dados->>'contato_emergencia'), '') else contato_emergencia end,
    contato_emergencia_telefone = case when p_dados ? 'contato_emergencia_telefone' then nullif(trim(p_dados->>'contato_emergencia_telefone'), '') else contato_emergencia_telefone end,
    estado_civil = case when p_dados ? 'estado_civil' then nullif(p_dados->>'estado_civil', '') else estado_civil end,
    escolaridade = case when p_dados ? 'escolaridade' then nullif(p_dados->>'escolaridade', '') else escolaridade end,
    dependentes = case when p_dados ? 'dependentes' then greatest(coalesce(nullif(p_dados->>'dependentes', '')::int, 0), 0) else dependentes end,
    banco = case when p_dados ? 'banco' then nullif(trim(p_dados->>'banco'), '') else banco end,
    agencia = case when p_dados ? 'agencia' then nullif(trim(p_dados->>'agencia'), '') else agencia end,
    conta = case when p_dados ? 'conta' then nullif(trim(p_dados->>'conta'), '') else conta end,
    pix = case when p_dados ? 'pix' then nullif(trim(p_dados->>'pix'), '') else pix end,
    tamanho_camisa = case when p_dados ? 'tamanho_camisa' then nullif(p_dados->>'tamanho_camisa', '') else tamanho_camisa end,
    tamanho_calca = case when p_dados ? 'tamanho_calca' then nullif(p_dados->>'tamanho_calca', '') else tamanho_calca end,
    tamanho_calcado = case when p_dados ? 'tamanho_calcado' then nullif(p_dados->>'tamanho_calcado', '') else tamanho_calcado end,
    transporte_tipo = case when p_dados ? 'transporte_tipo' then nullif(p_dados->>'transporte_tipo', '') else transporte_tipo end,
    transporte_passagens_dia = case when p_dados ? 'transporte_passagens_dia' then nullif(p_dados->>'transporte_passagens_dia', '')::numeric else transporte_passagens_dia end,
    transporte_tarifa = case when p_dados ? 'transporte_tarifa' then nullif(p_dados->>'transporte_tarifa', '')::numeric else transporte_tarifa end,
    observacoes = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes end,
    updated_at = now()
  where funcionario_id = p_funcionario;
end $$;

-- ------------------------------------------------------------------ afastar / desligar / reativar
create or replace function public.rh_status(p_empresa uuid, p_funcionario uuid, p_status text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_itens jsonb;
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.editar') then raise exception 'Sem permissão para editar colaboradores' using errcode = '42501'; end if;
  if p_status not in ('ativo','afastado','desligado') then raise exception 'Situação inválida'; end if;
  if not exists (select 1 from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa) then raise exception 'Funcionário não encontrado'; end if;
  if p_status = 'desligado' and p_funcionario = auth.uid() then raise exception 'Você não pode registrar o seu próprio desligamento'; end if;
  if p_status = 'desligado' and nullif(p_dados->>'data', '') is null then raise exception 'Informe a data do desligamento'; end if;
  insert into rh_fichas(funcionario_id, empresa_id) values (p_funcionario, p_empresa) on conflict (funcionario_id) do nothing;
  update rh_fichas set status = p_status,
    afastamento_motivo = case when p_status = 'afastado' then nullif(p_dados->>'motivo', '') when p_status = 'ativo' then null else afastamento_motivo end,
    afastamento_inicio = case when p_status = 'afastado' then nullif(p_dados->>'data', '')::date when p_status = 'ativo' then null else afastamento_inicio end,
    afastamento_fim = case when p_status = 'afastado' then nullif(p_dados->>'fim', '')::date when p_status = 'ativo' then null else afastamento_fim end,
    desligamento_data = case when p_status = 'desligado' then (p_dados->>'data')::date when p_status = 'ativo' then null else desligamento_data end,
    desligamento_tipo = case when p_status = 'desligado' then nullif(p_dados->>'tipo', '') when p_status = 'ativo' then null else desligamento_tipo end,
    desligamento_motivo = case when p_status = 'desligado' then nullif(p_dados->>'motivo', '') when p_status = 'ativo' then null else desligamento_motivo end,
    updated_at = now()
  where funcionario_id = p_funcionario;
  -- desligado não entra mais no sistema; reativar devolve o acesso
  if p_status = 'desligado' then
    update funcionarios_acesso set ativo = false, updated_at = now() where id = p_funcionario;
    v_itens := (select jsonb_agg(jsonb_build_object('texto', t, 'feito', false)) from unnest(array[
      'Exame demissional','Aviso prévio / carta de desligamento','Devolução de uniforme e EPI','Devolução de chaves, crachá e ferramentas',
      'Acessos bloqueados (sistema, e-mail, grupos)','Cálculo da rescisão com a contabilidade','Pagamento da rescisão','Termo de rescisão assinado','Baixa na carteira / eSocial']) t);
    insert into rh_checklists(empresa_id, funcionario_id, tipo, itens) values (p_empresa, p_funcionario, 'desligamento', v_itens)
      on conflict (funcionario_id, tipo) do update set concluido_em = null, itens = case when rh_checklists.concluido_em is null then rh_checklists.itens else excluded.itens end;
  elsif p_status = 'ativo' then
    update funcionarios_acesso set ativo = true, updated_at = now() where id = p_funcionario and not ativo;
  end if;
end $$;

-- ------------------------------------------------------------------ turma realizada: cada participante ganha o certificado
create or replace function public.rh_turma_registrar(p_empresa uuid, p_treinamento uuid, p_data date, p_instrutor text, p_local text,
  p_carga numeric, p_observacao text, p_funcionarios uuid[], p_arquivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_turma uuid; t rh_treinamentos;
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.editar') then raise exception 'Sem permissão para editar colaboradores' using errcode = '42501'; end if;
  select * into t from rh_treinamentos where id = p_treinamento and empresa_id = p_empresa;
  if t.id is null then raise exception 'Treinamento não encontrado'; end if;
  if p_data is null then raise exception 'Informe a data'; end if;
  if coalesce(array_length(p_funcionarios, 1), 0) = 0 then raise exception 'Escolha pelo menos um participante'; end if;
  if exists (select 1 from unnest(p_funcionarios) x where not exists (select 1 from funcionarios_acesso f where f.id = x and f.empresa_id = p_empresa)) then
    raise exception 'Participante não pertence à empresa'; end if;
  insert into rh_turmas(empresa_id, treinamento_id, data, instrutor, local, carga_horaria, observacao, arquivo_path)
  values (p_empresa, t.id, p_data, nullif(trim(p_instrutor), ''), nullif(trim(p_local), ''), coalesce(p_carga, t.carga_horaria), nullif(trim(p_observacao), ''), nullif(p_arquivo, ''))
  returning id into v_turma;
  insert into rh_documentos(empresa_id, funcionario_id, categoria, nome, emissao, validade, arquivo_path, treinamento_id, turma_id)
  select p_empresa, x, t.categoria, t.nome, p_data,
         case when coalesce(t.validade_meses, 0) > 0 then (p_data + make_interval(months => t.validade_meses))::date end,
         nullif(p_arquivo, ''), t.id, v_turma
  from unnest(p_funcionarios) x;
  return v_turma;
end $$;

revoke all on function public.rh_pessoas(uuid), public.rh_ficha_salvar(uuid, uuid, jsonb), public.rh_status(uuid, uuid, text, jsonb),
  public.rh_turma_registrar(uuid, uuid, date, text, text, numeric, text, uuid[], text), public.rh_mesma_empresa() from public, anon;
grant execute on function public.rh_pessoas(uuid), public.rh_ficha_salvar(uuid, uuid, jsonb), public.rh_status(uuid, uuid, text, jsonb),
  public.rh_turma_registrar(uuid, uuid, date, text, text, numeric, text, uuid[], text) to authenticated;

create or replace function public.rh_pode_pasta(p_pasta text, p_chave text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(p_pasta, '') !~* '^[0-9a-f-]{36}$' then return false; end if;
  return public.rh_pode(p_pasta::uuid, p_chave);
end $$;
revoke all on function public.rh_pode_pasta(text, text) from public, anon;
grant execute on function public.rh_pode_pasta(text, text) to authenticated;

-- ------------------------------------------------------------------ arquivos do RH: rh-documentos/<empresa>/rh/… só pra quem é do RH
drop policy if exists rh_fichas_arquivos_ler on storage.objects;
create policy rh_fichas_arquivos_ler on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'rh-documentos' or coalesce((storage.foldername(name))[2], '') <> 'rh'
         or public.rh_pode_pasta((storage.foldername(name))[1], 'rh.colaboradores.visualizar'));
drop policy if exists rh_fichas_arquivos_enviar on storage.objects;
create policy rh_fichas_arquivos_enviar on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'rh-documentos' or coalesce((storage.foldername(name))[2], '') <> 'rh'
         or public.rh_pode_pasta((storage.foldername(name))[1], 'rh.colaboradores.editar'));
drop policy if exists rh_fichas_arquivos_apagar on storage.objects;
create policy rh_fichas_arquivos_apagar on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'rh-documentos' or coalesce((storage.foldername(name))[2], '') <> 'rh'
         or public.rh_pode_pasta((storage.foldername(name))[1], 'rh.colaboradores.editar'));

-- sugestões iniciais (só se a empresa ainda não tem nenhum)
insert into public.rh_exames_cadastro(empresa_id, nome, tipo, validade_meses)
select e.id, x.nome, x.tipo, x.meses from public.empresas e
cross join (values ('ASO periódico','periodico',12), ('ASO admissional','admissional',null::int), ('ASO demissional','demissional',null::int)) as x(nome, tipo, meses)
where e.id = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and not exists (select 1 from public.rh_exames_cadastro c where c.empresa_id = e.id);
insert into public.rh_treinamentos(empresa_id, nome, categoria, carga_horaria, validade_meses)
select e.id, x.nome, x.cat, x.carga, x.meses from public.empresas e
cross join (values ('Integração','treinamento',2::numeric,null::int), ('NR-35 Trabalho em altura','nr',8::numeric,24), ('NR-11 Movimentação de cargas','nr',8::numeric,12), ('NR-06 Uso de EPI','nr',2::numeric,12)) as x(nome, cat, carga, meses)
where e.id = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and not exists (select 1 from public.rh_treinamentos t where t.empresa_id = e.id);
