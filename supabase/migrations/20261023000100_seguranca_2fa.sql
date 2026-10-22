-- Verificação em duas etapas por WhatsApp (out/2026).
-- Depois da senha, a pessoa recebe um código de 6 números no WhatsApp cadastrado no Cadastro de Funcionários.
-- A sessão do Supabase (session_id do token) só vale para os dados depois que o código é confirmado:
-- o banco confere isso nas funções de acesso e numa regra restritiva em todas as tabelas, então a senha
-- sozinha (mesmo roubada) não abre nada. Liga/desliga por empresa (Parâmetros > Segurança); nasce desligado.
-- Quem grava códigos e sessões verificadas é só a Edge Function seguranca-2fa (service role).

create table if not exists public.seguranca_2fa_config(
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 obrigatorio boolean not null default false,
 atualizado_por uuid,
 atualizado_em timestamptz not null default now());

create table if not exists public.seguranca_2fa_codigos(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 session_id uuid not null,
 codigo_hash text not null,
 enviado_para text,
 tentativas int not null default 0,
 criado_em timestamptz not null default now(),
 expira_em timestamptz not null,
 usado_em timestamptz);
create index if not exists seguranca_2fa_codigos_user on public.seguranca_2fa_codigos(user_id, criado_em desc);

create table if not exists public.seguranca_2fa_sessoes(
 session_id uuid primary key,
 user_id uuid not null,
 metodo text not null check (metodo in ('whatsapp','recuperacao')),
 verificado_em timestamptz not null default now(),
 expira_em timestamptz not null,
 user_agent text);
create index if not exists seguranca_2fa_sessoes_user on public.seguranca_2fa_sessoes(user_id);

create table if not exists public.seguranca_2fa_recuperacao(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 codigo_hash text not null,
 criado_em timestamptz not null default now(),
 usado_em timestamptz);
create index if not exists seguranca_2fa_recuperacao_user on public.seguranca_2fa_recuperacao(user_id) where usado_em is null;

-- Registro de segurança: códigos enviados, acertos, erros, bloqueios, mudanças de configuração e (fase 2) dados revelados.
create table if not exists public.seguranca_eventos(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid,
 user_id uuid,
 tipo text not null,
 detalhes jsonb not null default '{}',
 criado_em timestamptz not null default now());
create index if not exists seguranca_eventos_empresa on public.seguranca_eventos(empresa_id, criado_em desc);

alter table public.seguranca_2fa_config enable row level security;
alter table public.seguranca_2fa_codigos enable row level security;
alter table public.seguranca_2fa_sessoes enable row level security;
alter table public.seguranca_2fa_recuperacao enable row level security;
alter table public.seguranca_eventos enable row level security;
-- Sem políticas: ninguém lê nem grava direto; só as funções abaixo e a Edge Function.
revoke all on public.seguranca_2fa_config, public.seguranca_2fa_codigos, public.seguranca_2fa_sessoes,
 public.seguranca_2fa_recuperacao, public.seguranca_eventos from anon, authenticated;

-- A sessão atual já passou pela segunda etapa (ou a empresa não exige)?
create or replace function public.seguranca_2fa_ok() returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is null
  or not exists(select 1 from usuarios_empresas ue join seguranca_2fa_config c on c.empresa_id=ue.empresa_id and c.obrigatorio
                where ue.user_id=auth.uid())
  or exists(select 1 from seguranca_2fa_sessoes s
            where s.user_id=auth.uid()
              and s.session_id::text = coalesce(auth.jwt()->>'session_id','')
              and s.expira_em>now());
$$;
revoke all on function public.seguranca_2fa_ok() from public;
grant execute on function public.seguranca_2fa_ok() to anon, authenticated, service_role;

-- Situação para as telas (pode ser chamada antes de confirmar o código)
create or replace function public.seguranca_2fa_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'obrigatorio', exists(select 1 from usuarios_empresas ue join seguranca_2fa_config c on c.empresa_id=ue.empresa_id and c.obrigatorio where ue.user_id=auth.uid()),
  'verificado', exists(select 1 from seguranca_2fa_sessoes s where s.user_id=auth.uid() and s.session_id::text=coalesce(auth.jwt()->>'session_id','') and s.expira_em>now()));
$$;
revoke all on function public.seguranca_2fa_status() from public, anon;
grant execute on function public.seguranca_2fa_status() to authenticated;

-- Funções de acesso passam a exigir a segunda etapa quando a empresa liga a exigência
create or replace function public.eh_membro_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path='public' as $function$
  select auth.uid() is not null and exists(
    select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = p_empresa)
  and public.seguranca_2fa_ok()
$function$;

create or replace function public.funcionario_pode(p_empresa uuid, p_usuario uuid, p_chave text) returns boolean
language sql stable security definer set search_path='public' as $function$
 select exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=p_usuario)
 and not exists(select 1 from funcionarios_acesso where id=p_usuario and (not ativo or empresa_id<>p_empresa))
 and (exists(select 1 from usuarios_empresas ue where ue.empresa_id=p_empresa and ue.user_id=p_usuario
   and lower(ue.role) in ('admin','owner','administrador') and not exists(select 1 from funcionarios_acesso f where f.id=p_usuario))
 or public.has_permission(p_empresa,p_usuario,p_chave))
 -- a própria pessoa logada só vale depois da segunda etapa; chamadas do servidor (outro usuário) não mudam
 and (p_usuario is distinct from auth.uid() or public.seguranca_2fa_ok());
$function$;

create or replace function public.funcionario_contexto(p_empresa_id uuid) returns jsonb
language plpgsql security definer set search_path='public' as $function$
declare f funcionarios_acesso; permitido boolean; admin_legado boolean; segunda boolean;
begin
 if auth.uid() is null then raise exception 'Sessão necessária'; end if;
 select * into f from funcionarios_acesso where id=auth.uid();
 permitido := exists(select 1 from usuarios_empresas where empresa_id=p_empresa_id and user_id=auth.uid())
   and (f.id is null or (f.ativo and f.empresa_id=p_empresa_id));
 admin_legado := f.id is null and exists(select 1 from usuarios_empresas where empresa_id=p_empresa_id and user_id=auth.uid() and lower(role) in ('admin','owner','administrador'));
 segunda := public.seguranca_2fa_ok();
 return jsonb_build_object('ativo',permitido and segunda,'gerenciado',f.id is not null,'administrador_legado',admin_legado,
  'dois_fatores_pendente',permitido and not segunda);
end; $function$;

-- Regra restritiva em todas as tabelas com RLS: sessão sem a segunda etapa (com a exigência ligada) não lê nem grava.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity
   and tablename not in ('seguranca_2fa_config','seguranca_2fa_codigos','seguranca_2fa_sessoes','seguranca_2fa_recuperacao','seguranca_eventos') loop
  execute format('drop policy if exists seguranca_2fa on public.%I', t.tablename);
  execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t.tablename);
 end loop;
end $$;
drop policy if exists seguranca_2fa on storage.objects;
create policy seguranca_2fa on storage.objects as restrictive for all to authenticated
 using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

-- Parâmetros > Segurança: quem tem login, se tem WhatsApp cadastrado e quando confirmou o código por último
create or replace function public.seguranca_2fa_painel(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
 if not funcionario_pode(p_empresa, auth.uid(), 'configuracoes.empresa.editar') then raise exception 'Sem permissão' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'nome', coalesce(f.nome, u.nome, 'Usuário'),
   'tem_whatsapp', length(regexp_replace(coalesce(nullif(f.telefone,''), u.telefone, ''), '\D', '', 'g')) >= 10,
   'whatsapp', case when length(regexp_replace(coalesce(nullif(f.telefone,''), u.telefone, ''), '\D', '', 'g')) >= 10
     then '(**) *****-' || right(regexp_replace(coalesce(nullif(f.telefone,''), u.telefone, ''), '\D', '', 'g'), 4) end,
   'ultima_verificacao', (select max(s.verificado_em) from seguranca_2fa_sessoes s where s.user_id=ue.user_id),
   'eu', ue.user_id=auth.uid()) order by coalesce(f.nome, u.nome)), '[]')
 into r
 from usuarios_empresas ue
 left join funcionarios_acesso f on f.id=ue.user_id
 left join usuarios u on u.id=ue.user_id
 where ue.empresa_id=p_empresa and (f.id is null or f.ativo);
 return jsonb_build_object(
  'obrigatorio', coalesce((select obrigatorio from seguranca_2fa_config where empresa_id=p_empresa), false),
  'sessao_verificada', exists(select 1 from seguranca_2fa_sessoes s where s.user_id=auth.uid() and s.session_id::text=coalesce(auth.jwt()->>'session_id','') and s.expira_em>now()),
  'usuarios', r,
  'eventos', (select coalesce(jsonb_agg(x order by x.criado_em desc), '[]') from (
     select e.tipo, e.criado_em, e.detalhes, coalesce(f.nome, u.nome) nome from seguranca_eventos e
     left join funcionarios_acesso f on f.id=e.user_id left join usuarios u on u.id=e.user_id
     where e.empresa_id=p_empresa order by e.criado_em desc limit 40) x));
end $$;
revoke all on function public.seguranca_2fa_painel(uuid) from public, anon;
grant execute on function public.seguranca_2fa_painel(uuid) to authenticated;

-- Ligar exige que quem liga tenha confirmado o código nesta sessão (prova que o WhatsApp está entregando)
-- e que todo mundo com login tenha WhatsApp cadastrado (senão essa pessoa ficaria trancada do lado de fora).
create or replace function public.seguranca_2fa_config_salvar(p_empresa uuid, p_obrigatorio boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare sem text;
begin
 if not funcionario_pode(p_empresa, auth.uid(), 'configuracoes.empresa.editar') then raise exception 'Sem permissão' using errcode='42501'; end if;
 if p_obrigatorio then
  if not exists(select 1 from seguranca_2fa_sessoes s where s.user_id=auth.uid() and s.session_id::text=coalesce(auth.jwt()->>'session_id','') and s.expira_em>now()) then
   raise exception 'Antes de ligar, confirme você mesmo um código pelo WhatsApp (botão "Testar agora").';
  end if;
  select string_agg(coalesce(f.nome, u.nome, 'Usuário'), ', ') into sem
  from usuarios_empresas ue left join funcionarios_acesso f on f.id=ue.user_id left join usuarios u on u.id=ue.user_id
  where ue.empresa_id=p_empresa and (f.id is null or f.ativo)
    and length(regexp_replace(coalesce(nullif(f.telefone,''), u.telefone, ''), '\D', '', 'g')) < 10;
  if sem is not null then raise exception 'Cadastre o WhatsApp de: % (Cadastro de Funcionários).', sem; end if;
 end if;
 insert into seguranca_2fa_config(empresa_id, obrigatorio, atualizado_por, atualizado_em) values(p_empresa, p_obrigatorio, auth.uid(), now())
 on conflict (empresa_id) do update set obrigatorio=excluded.obrigatorio, atualizado_por=excluded.atualizado_por, atualizado_em=now();
 insert into seguranca_eventos(empresa_id, user_id, tipo, detalhes) values(p_empresa, auth.uid(), case when p_obrigatorio then 'exigencia_ligada' else 'exigencia_desligada' end, '{}');
 return jsonb_build_object('obrigatorio', p_obrigatorio);
end $$;
revoke all on function public.seguranca_2fa_config_salvar(uuid, boolean) from public, anon;
grant execute on function public.seguranca_2fa_config_salvar(uuid, boolean) to authenticated;
