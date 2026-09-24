-- Pedido explícito do usuário: em vez de renderizar o 3D de cada formato ao vivo na lista (pesado, "hoje esta
-- demorando" e vai piorar "no futuro serao centenas de formato"), a lista passa a mostrar uma FOTO estática de
-- cada composição. A foto é capturada em SILÊNCIO no momento de "Salvar formato" (a forma de criar continua
-- exatamente a mesma, pedido explícito do usuário: "isso nao deve ser alterado") — o cliente renderiza a cena
-- uma vez, sobe a imagem, e grava a URL aqui numa 2ª chamada a lounge_formato_salvar (mesmo id, mesmo nome/
-- papeis, só acrescentando a foto).
begin;

alter table public.lounge_formatos
  add column if not exists capa_url text,
  add column if not exists capa_path text;

create or replace function public.lounge_formato_json(lf public.lounge_formatos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', lf.id, 'nome', lf.nome, 'papeis', lf.papeis,
    'cliente_id', lf.cliente_id, 'equipe', lf.cliente_id is null,
    'capa_url', lf.capa_url, 'atualizado_em', lf.updated_at
  );
$$;

-- Ganhou p_capa_url/p_capa_path (nulos por padrão). No INSERT costumam vir nulos mesmo — o cliente ainda não tem
-- o id do formato nesse momento, então não tem como já ter subido a foto pro caminho certo (mesma ordem "cria
-- primeiro, sobe a foto depois" já usada pra foto dos noivos em Projetos). A 2ª chamada (mesmo p_id, pra anexar a
-- foto) passa os dois; coalesce no UPDATE evita que uma futura edição sem foto nova apague a que já existia.
create or replace function public.lounge_formato_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_nome text default null, p_papeis jsonb default null,
  p_capa_url text default null, p_capa_path text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; eh_equipe boolean; lf public.lounge_formatos; n int;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  eh_equipe := (c->>'equipe')::boolean is true;

  if p_nome is null or length(btrim(p_nome)) = 0 then raise exception 'Dê um nome ao formato'; end if;
  if length(btrim(p_nome)) > 60 then raise exception 'O nome do formato pode ter até 60 caracteres'; end if;
  if p_papeis is null or jsonb_typeof(p_papeis) <> 'array' or jsonb_array_length(p_papeis) = 0 then
    raise exception 'Posicione ao menos uma peça antes de salvar';
  end if;
  if length(p_papeis::text) >= 20000 then raise exception 'Formato grande demais'; end if;

  if p_id is null then
    select count(*) into n from public.lounge_formatos
      where empresa_id = emp and cliente_id is not distinct from (case when eh_equipe then null else dono end);
    if n >= 30 then raise exception 'Limite de 30 formatos atingido — exclua algum antes de criar outro'; end if;
    insert into public.lounge_formatos(empresa_id, cliente_id, criado_por, nome, papeis, capa_url, capa_path)
    values (emp, case when eh_equipe then null else dono end, nullif(c->>'uid', '')::uuid, btrim(p_nome), p_papeis, p_capa_url, p_capa_path)
    returning * into lf;
  else
    select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp;
    if not found then raise exception 'Formato não encontrado'; end if;
    if not (eh_equipe or lf.cliente_id = dono) then raise exception 'Sem permissão para editar este formato'; end if;
    update public.lounge_formatos set nome = btrim(p_nome), papeis = p_papeis,
      capa_url = coalesce(p_capa_url, lf.capa_url), capa_path = coalesce(p_capa_path, lf.capa_path),
      updated_at = now() where id = lf.id returning * into lf;
  end if;
  return public.lounge_formato_json(lf);
end; $$;

revoke all on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb, text, text) from public;
grant execute on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb, text, text) to anon, authenticated, service_role;

-- Antiga assinatura (sem capa) some — nada mais no código chama a de 5 parâmetros depois desta migration.
drop function if exists public.lounge_formato_salvar(text, uuid, uuid, text, jsonb);

-- ---------------------------------------------------------------------------------------------------------------
-- Bucket novo pra foto de capa dos formatos. Não reaproveita o bucket "biblioteca" (que já existe e também é
-- público) porque as policies dele exigem auth.uid() — certo pra Biblioteca/Portal (equipe interna, sempre com
-- sessão Supabase Auth), mas ERRADO aqui: um DECORADOR pode salvar um formato em 3D Livre (mesmo padrão já
-- confirmado em lounge_formatos — "formato criado por um decorador... só aparece pra ele e pra equipe") e ele
-- não tem auth.uid() nenhum (entra por token do catálogo). Mesmo problema que "Foto dos noivos"/renders de
-- Projetos já resolveram: autorizar pela EXISTÊNCIA da linha (lounge_formato_existe), não pela identidade de
-- quem está logado — cópia fiel do padrão de projeto_existe()/bucket "projetos".
insert into storage.buckets (id, name, public)
values ('lounge-formatos', 'lounge-formatos', true)
on conflict (id) do update set public = excluded.public;

create or replace function public.lounge_formato_existe(p_empresa text, p_formato text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.lounge_formatos lf where lf.id::text = p_formato and lf.empresa_id::text = p_empresa);
$$;
revoke all on function public.lounge_formato_existe(text, text) from public;
grant execute on function public.lounge_formato_existe(text, text) to anon, authenticated, service_role;

drop policy if exists lounge_formatos_bucket_leitura on storage.objects;
create policy lounge_formatos_bucket_leitura on storage.objects for select using (bucket_id = 'lounge-formatos');
drop policy if exists lounge_formatos_bucket_upload on storage.objects;
create policy lounge_formatos_bucket_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'lounge-formatos' and public.lounge_formato_existe((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists lounge_formatos_bucket_atualizar on storage.objects;
create policy lounge_formatos_bucket_atualizar on storage.objects for update to anon, authenticated
  using (bucket_id = 'lounge-formatos' and public.lounge_formato_existe((storage.foldername(name))[1], (storage.foldername(name))[2]))
  with check (bucket_id = 'lounge-formatos' and public.lounge_formato_existe((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists lounge_formatos_bucket_remover on storage.objects;
create policy lounge_formatos_bucket_remover on storage.objects for delete to anon, authenticated
  using (bucket_id = 'lounge-formatos' and public.lounge_formato_existe((storage.foldername(name))[1], (storage.foldername(name))[2]));

commit;
