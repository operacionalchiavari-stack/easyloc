-- Cadastro de acesso por empresa. Credenciais ficam exclusivamente no Supabase Auth.
begin;
create table if not exists public.funcionarios_acesso (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  nome text not null check (length(trim(nome)) between 1 and 160),
  setor text not null check (length(trim(setor)) between 1 and 100),
  cargo text not null default '',
  login text not null check (login ~ '^[a-z0-9._@+-]{3,160}$'),
  email text not null,
  telefone text not null default '',
  nivel_acesso text not null default 'Visualizador',
  ativo boolean not null default true,
  foto_url text not null default '',
  pin_hash text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists funcionarios_login_unique on public.funcionarios_acesso(lower(login));
alter table public.funcionarios_acesso enable row level security;
revoke all on public.funcionarios_acesso from anon, authenticated;
grant all on public.funcionarios_acesso to service_role;

insert into public.permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('rh.funcionarios.visualizar','Cadastros','Funcionários','visualizar','Ver funcionários',900),
 ('rh.funcionarios.criar','Cadastros','Funcionários','criar','Cadastrar funcionário',901),
 ('rh.funcionarios.editar','Cadastros','Funcionários','editar','Editar e bloquear funcionário',902),
 ('comercial.catalogo.visualizar','Comercial','Catálogo','visualizar','Acessar catálogo',903),
 ('estoque.fornecedores.visualizar','Estoque','Fornecedores','visualizar','Ver fornecedores',904),
 ('estoque.fornecedores.editar','Estoque','Fornecedores','editar','Gerenciar fornecedores',905),
 ('estoque.tabelas_preco.visualizar','Estoque','Tabelas de preço','visualizar','Ver tabelas de preço',906),
 ('estoque.tabelas_preco.editar','Estoque','Tabelas de preço','editar','Editar tabelas de preço',907),
 ('estoque.importacao.executar','Estoque','Importação','executar','Importar itens',908)
on conflict(chave) do nothing;

-- Somente vínculos administrativos anteriores ao cadastro conservam o acesso total.
-- Um funcionário gerenciado depende sempre das permissões explícitas, inclusive se todas forem falsas.
create or replace function public.funcionario_pode(p_empresa uuid,p_usuario uuid,p_chave text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=p_usuario)
 and not exists(select 1 from funcionarios_acesso where id=p_usuario and (not ativo or empresa_id<>p_empresa))
 and (exists(select 1 from usuarios_empresas ue where ue.empresa_id=p_empresa and ue.user_id=p_usuario
   and lower(ue.role) in ('admin','owner','administrador') and not exists(select 1 from funcionarios_acesso f where f.id=p_usuario))
 or public.has_permission(p_empresa,p_usuario,p_chave));
$$;
revoke all on function public.funcionario_pode(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.funcionario_pode(uuid,uuid,text) to service_role;

create or replace function public.funcionario_contexto(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare f funcionarios_acesso; permitido boolean; admin_legado boolean;
begin
 if auth.uid() is null then raise exception 'Sessão necessária'; end if;
 select * into f from funcionarios_acesso where id=auth.uid();
 permitido := exists(select 1 from usuarios_empresas where empresa_id=p_empresa_id and user_id=auth.uid())
   and (f.id is null or (f.ativo and f.empresa_id=p_empresa_id));
 admin_legado := f.id is null and exists(select 1 from usuarios_empresas where empresa_id=p_empresa_id and user_id=auth.uid() and lower(role) in ('admin','owner','administrador'));
 return jsonb_build_object('ativo',permitido,'gerenciado',f.id is not null,'administrador_legado',admin_legado);
end; $$;
revoke all on function public.funcionario_contexto(uuid) from public,anon;
grant execute on function public.funcionario_contexto(uuid) to authenticated,service_role;

create or replace function public.get_permissoes_usuario_resolvidas(p_empresa_id uuid,p_usuario_id uuid)
returns table(chave text,permitido boolean,origem text)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from usuarios_empresas where empresa_id=p_empresa_id and user_id=auth.uid()) then raise exception 'Acesso negado'; end if;
 if p_usuario_id<>auth.uid() and not public.funcionario_pode(p_empresa_id,auth.uid(),'configuracoes.permissoes.visualizar') and not public.funcionario_pode(p_empresa_id,auth.uid(),'rh.funcionarios.visualizar') then raise exception 'Acesso negado'; end if;
 return query select pc.chave,public.funcionario_pode(p_empresa_id,p_usuario_id,pc.chave),
 case when exists(select 1 from funcionarios_acesso where id=p_usuario_id) then 'usuario' else 'perfil' end
 from permissoes_catalogo pc order by pc.ordem,pc.chave;
end; $$;

-- Lista inclui contas existentes, sem transportar contas/dados de outras empresas.
create or replace function public.funcionarios_listar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.funcionario_pode(p_empresa_id,auth.uid(),'rh.funcionarios.visualizar') then raise exception 'Sem permissão para visualizar funcionários'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',ue.user_id,'nome',coalesce(f.nome,u.nome,a.email),'setor',coalesce(f.setor,u.setor,'Sem setor'),
  'cargo',coalesce(f.cargo,u.cargo,''),'login',coalesce(f.login,a.email),'email',a.email,
  'telefone',coalesce(f.telefone,u.telefone,''),'nivel_acesso',coalesce(f.nivel_acesso,case when lower(ue.role) in ('admin','owner','administrador') then 'Administrador' else 'Visualizador' end),
  'ativo',coalesce(f.ativo,u.ativo,true),'foto_url',coalesce(f.foto_url,u.avatar_url,''),'ultimo_acesso',a.last_sign_in_at,
  'gerenciado',f.id is not null))
 from usuarios_empresas ue join auth.users a on a.id=ue.user_id left join usuarios u on u.id=ue.user_id
 left join funcionarios_acesso f on f.id=ue.user_id and f.empresa_id=ue.empresa_id
 where ue.empresa_id=p_empresa_id),'[]'::jsonb);
end; $$;
revoke all on function public.funcionarios_listar(uuid) from public,anon;
grant execute on function public.funcionarios_listar(uuid) to authenticated,service_role;

-- Única escrita, chamada pelo backend depois da validação do JWT. Todos os dados e permissões são atômicos.
create or replace function public.funcionario_salvar(p_empresa uuid,p_ator uuid,p_id uuid,p_dados jsonb,p_permissoes jsonb,p_pin text default null)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare existente boolean; v_chave text; v_ativo boolean; v_nivel text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 existente := exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=p_id);
 if not public.funcionario_pode(p_empresa,p_ator,case when existente then 'rh.funcionarios.editar' else 'rh.funcionarios.criar' end) then raise exception 'Sem permissão para salvar funcionário'; end if;
 if p_id=p_ator then raise exception 'Seu próprio acesso deve ser alterado por outro administrador'; end if;
 if exists(select 1 from usuarios_empresas where user_id=p_id and empresa_id<>p_empresa) then raise exception 'Conta vinculada a outra empresa; alteração não permitida'; end if;
 if p_permissoes is not null and not public.funcionario_pode(p_empresa,p_ator,'configuracoes.permissoes.editar') then raise exception 'Sem permissão para gerenciar acessos'; end if;
 v_ativo := coalesce((p_dados->>'ativo')::boolean,true);
 v_nivel := p_dados->>'nivel_acesso';
 if not public.funcionario_pode(p_empresa,p_ator,'configuracoes.permissoes.editar') and
   (not existente or v_ativo is distinct from (select ativo from funcionarios_acesso where id=p_id) or v_nivel is distinct from (select nivel_acesso from funcionarios_acesso where id=p_id)) then raise exception 'Sem permissão para alterar acesso e status'; end if;
 if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'Senha operacional deve conter 4 dígitos'; end if;
 if not existente and p_pin is null then raise exception 'Informe a senha operacional'; end if;
 if p_permissoes is not null then
  if jsonb_typeof(p_permissoes)<>'array' then raise exception 'Permissões inválidas'; end if;
  for v_chave in select jsonb_array_elements_text(p_permissoes) loop
   if not exists(select 1 from permissoes_catalogo pc where pc.chave=v_chave) then raise exception 'Permissão desconhecida'; end if;
  end loop;
 end if;
 insert into funcionarios_acesso(id,empresa_id,nome,setor,cargo,login,email,telefone,nivel_acesso,ativo,foto_url,pin_hash)
 values(p_id,p_empresa,trim(p_dados->>'nome'),trim(p_dados->>'setor'),coalesce(p_dados->>'cargo',''),lower(trim(p_dados->>'login')),p_dados->>'email',coalesce(p_dados->>'telefone',''),v_nivel,v_ativo,coalesce(p_dados->>'foto_url',''),case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) end)
 on conflict(id) do update set nome=excluded.nome,setor=excluded.setor,cargo=excluded.cargo,login=excluded.login,email=excluded.email,telefone=excluded.telefone,nivel_acesso=excluded.nivel_acesso,ativo=excluded.ativo,foto_url=excluded.foto_url,pin_hash=coalesce(excluded.pin_hash,funcionarios_acesso.pin_hash),updated_at=now();
 insert into usuarios(id,empresa_id,nome,setor,cargo,nivel_acesso,telefone,avatar_url,ativo)
 values(p_id,p_empresa,p_dados->>'nome',p_dados->>'setor',p_dados->>'cargo',v_nivel,p_dados->>'telefone',p_dados->>'foto_url',v_ativo)
 on conflict(id) do update set nome=excluded.nome,setor=excluded.setor,cargo=excluded.cargo,nivel_acesso=excluded.nivel_acesso,telefone=excluded.telefone,avatar_url=excluded.avatar_url,ativo=excluded.ativo;
 if not existente then insert into usuarios_empresas(user_id,empresa_id,role) values(p_id,p_empresa,'member'); end if;
 if p_permissoes is not null then
  insert into permissoes_usuario(empresa_id,usuario_id,permissao_chave,permitido,origem,updated_at)
  select p_empresa,p_id,pc.chave,p_permissoes ? pc.chave,'usuario',now() from permissoes_catalogo pc
  on conflict(empresa_id,usuario_id,permissao_chave) do update set permitido=excluded.permitido,origem='usuario',updated_at=now();
 end if;
 insert into logs_permissoes(empresa_id,usuario_alvo_id,acao,depois,usuario_responsavel_id)
 values(p_empresa,p_id,case when existente then 'funcionario_atualizado' else 'funcionario_criado' end,jsonb_build_object('ativo',v_ativo,'nivel_acesso',v_nivel,'permissoes',p_permissoes),p_ator);
end; $$;
revoke all on function public.funcionario_salvar(uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.funcionario_salvar(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;

-- Restrição adicional preserva as políticas existentes; impede acesso direto a módulos bloqueados.
create or replace function public.funcionario_tabela_permitida(p_empresa uuid,p_tabela text,p_acao text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare f funcionarios_acesso; prefixo text; acao text;
begin
 select * into f from funcionarios_acesso where id=auth.uid();
 if f.id is null then return true; end if;
 if not f.ativo or f.empresa_id<>p_empresa then return false; end if;
 if p_tabela in ('usuarios_empresas','usuarios') then return p_acao='visualizar'; end if;
 if p_tabela in ('permissoes_usuario','permissoes_perfil','usuarios_perfis','perfis_acesso','logs_permissoes') then
  return p_acao='visualizar' or public.funcionario_pode(p_empresa,auth.uid(),'configuracoes.permissoes.editar'); end if;
 if p_tabela in ('assinaturas','configuracoes_empresa','empresas_configuracoes') and p_acao='visualizar' then return true; end if;
 prefixo := case
  when p_tabela like 'clientes%' then 'comercial.clientes'
  when p_tabela like 'locais%' then 'comercial.locais'
  when p_tabela like 'contratos%' then 'comercial.contratos'
  when p_tabela like 'pedido%' or p_tabela='servicos_adicionais' then 'comercial.pedidos'
  when p_tabela in ('itens','itens_fotos','itens_modelos_3d','kit_itens') then 'estoque.itens'
  when p_tabela in ('itens_precos','tabelas_preco') then 'estoque.tabelas_preco'
  when p_tabela='fornecedores' then 'estoque.fornecedores'
  when p_tabela='insumos' or p_tabela like 'personalizacoes%' then 'estoque.insumos'
  when p_tabela like 'almoxarifado%' then 'estoque.almoxarifado'
  when p_tabela like 'separacoes%' then 'logistica.separacao'
  when p_tabela='cronograma_logistico' then 'logistica.cronograma'
  when p_tabela='logistica_expedicoes' then 'logistica.expedicao'
  when p_tabela in ('planejamentos_logisticos','caminhoes','categorias_caminhao','categorias_montagem','empresa_logistica_regras') then 'logistica.planejamento'
  when p_tabela like 'rh_ocorrencias%' or p_tabela like 'rh_solicit%' or p_tabela='rh_anexos' then 'rh.ocorrencias'
  when p_tabela like 'rh_colaborador%' or p_tabela='colaboradores' then 'rh.colaboradores'
  when p_tabela like 'payment_gateway%' then 'configuracoes.integracoes.gateways_pagamento'
  when p_tabela='empresa_financeiro' then 'financeiro.fluxo'
  when p_tabela like 'zapi_%' then 'configuracoes.integracoes.whatsapp'
  when p_tabela='studio_projetos' then 'ia.studio'
  when p_tabela like 'ia_%' then 'ia.lia'
  when p_tabela='catalogo_acessos' then 'comercial.catalogo'
  else 'configuracoes.empresa' end;
 if p_acao='visualizar' and prefixo='estoque.itens' and public.funcionario_pode(p_empresa,auth.uid(),'comercial.catalogo.visualizar') then return true; end if;
 acao := case when prefixo='ia.lia' then 'usar' when p_acao='editar' and prefixo='estoque.almoxarifado' then 'movimentar'
 when p_acao='editar' and prefixo='logistica.separacao' then 'executar' when p_acao='editar' and prefixo='logistica.expedicao' then 'distribuir'
 when p_acao='editar' and prefixo='rh.ocorrencias' then 'criar' when p_acao='editar' and prefixo='ia.studio' then 'gerar' else p_acao end;
 return public.funcionario_pode(p_empresa,auth.uid(),prefixo||'.'||acao);
end; $$;
revoke all on function public.funcionario_tabela_permitida(uuid,text,text) from public,anon;
grant execute on function public.funcionario_tabela_permitida(uuid,text,text) to authenticated;

do $$ declare t record;
begin
 for t in select c.table_name from information_schema.columns c join pg_class cl on cl.relname=c.table_name join pg_namespace n on n.oid=cl.relnamespace and n.nspname=c.table_schema
 where c.table_schema='public' and c.column_name='empresa_id' and cl.relkind='r' and c.table_name<>'funcionarios_acesso' loop
  -- Tabelas anteriormente sem RLS preservam o acesso dos administradores autenticados.
  if not (select relrowsecurity from pg_class where oid=format('public.%I',t.table_name)::regclass) then
   execute format('alter table public.%I enable row level security',t.table_name);
   execute format('create policy funcionarios_legacy_authenticated on public.%I for all to authenticated using (true) with check (true)',t.table_name);
  end if;
  execute format('drop policy if exists funcionario_acesso_select on public.%I',t.table_name);
  execute format('create policy funcionario_acesso_select on public.%I as restrictive for select to authenticated using (public.funcionario_tabela_permitida(empresa_id,%L,''visualizar''))',t.table_name,t.table_name);
  execute format('drop policy if exists funcionario_acesso_insert on public.%I',t.table_name);
  execute format('create policy funcionario_acesso_insert on public.%I as restrictive for insert to authenticated with check (public.funcionario_tabela_permitida(empresa_id,%L,''criar''))',t.table_name,t.table_name);
  execute format('drop policy if exists funcionario_acesso_update on public.%I',t.table_name);
  execute format('create policy funcionario_acesso_update on public.%I as restrictive for update to authenticated using (public.funcionario_tabela_permitida(empresa_id,%L,''editar'')) with check (public.funcionario_tabela_permitida(empresa_id,%L,''editar''))',t.table_name,t.table_name,t.table_name);
  execute format('drop policy if exists funcionario_acesso_delete on public.%I',t.table_name);
  execute format('create policy funcionario_acesso_delete on public.%I as restrictive for delete to authenticated using (public.funcionario_tabela_permitida(empresa_id,%L,''excluir''))',t.table_name,t.table_name);
 end loop;
end; $$;

-- Fotos privadas: uploads apenas pelo backend, visualização por URL assinada de curta duração.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('funcionarios-fotos','funcionarios-fotos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
