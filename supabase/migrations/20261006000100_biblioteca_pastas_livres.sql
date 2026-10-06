-- Biblioteca: pastas livres criadas pela equipe (pedido do usuário: "quero ter liberdade
-- pra criar pastas que eu quiser, ao invés de ter essas pastas por categoria").
-- As pastas deixam de ser as categorias do catálogo e passam a ser linhas desta tabela.
-- biblioteca_fotos.categoria continua existindo (preenchida com o nome da pasta), mas quem
-- manda é pasta_id.
begin;

create table public.biblioteca_pastas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  ordem integer,
  criado_em timestamptz not null default now()
);
create unique index biblioteca_pastas_nome_uidx on public.biblioteca_pastas(empresa_id, lower(btrim(nome)));

alter table public.biblioteca_pastas enable row level security;
create policy biblioteca_pastas_empresa_all on public.biblioteca_pastas
  for all to authenticated
  using (exists (select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = biblioteca_pastas.empresa_id))
  with check (exists (select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = biblioteca_pastas.empresa_id));
grant select, insert, update, delete on public.biblioteca_pastas to authenticated;

alter table public.biblioteca_fotos
  add column pasta_id uuid references public.biblioteca_pastas(id) on delete cascade;
create index biblioteca_fotos_pasta_idx on public.biblioteca_fotos(pasta_id);

-- Fotos já existentes: uma pasta por categoria que já tem foto (nada se perde).
insert into public.biblioteca_pastas(empresa_id, nome, ordem)
select empresa_id, min(btrim(categoria)), row_number() over (partition by empresa_id order by lower(btrim(categoria)))::int
  from public.biblioteca_fotos
 where coalesce(btrim(categoria), '') <> ''
 group by empresa_id, lower(btrim(categoria));
update public.biblioteca_fotos f set pasta_id = p.id
  from public.biblioteca_pastas p
 where p.empresa_id = f.empresa_id and lower(btrim(p.nome)) = lower(btrim(f.categoria));

-- Foto e pasta precisam ser da mesma empresa.
create or replace function public.biblioteca_validar_pasta()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.pasta_id is not null and not exists (
    select 1 from public.biblioteca_pastas where id = new.pasta_id and empresa_id = new.empresa_id
  ) then raise exception 'Pasta não pertence à empresa da biblioteca'; end if;
  return new;
end $$;
create trigger biblioteca_validar_pasta before insert or update on public.biblioteca_fotos
for each row execute function public.biblioteca_validar_pasta();

-- Renomear a pasta mantém o texto antigo (categoria) das fotos em dia.
create or replace function public.biblioteca_pasta_renomeada()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.nome is distinct from old.nome then
    update public.biblioteca_fotos set categoria = new.nome where pasta_id = new.id;
  end if;
  return new;
end $$;
create trigger biblioteca_pasta_renomeada after update of nome on public.biblioteca_pastas
for each row execute function public.biblioteca_pasta_renomeada();

create or replace function public.biblioteca_pastas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'ordem', p.ordem)
         order by p.ordem nulls last, lower(p.nome), p.id), '[]'::jsonb)
    from public.biblioteca_pastas p where p.empresa_id = p_empresa_id;
$$;
revoke all on function public.biblioteca_pastas_acervo(uuid) from public, anon, authenticated;

create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'categoria',f.categoria,'pasta_id',f.pasta_id,'titulo',f.titulo,'url',f.url,
    'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id
  ) order by f.pasta_id,f.ordem nulls last,f.criado_em),'[]'::jsonb)
  from public.biblioteca_fotos f where f.empresa_id=p_empresa_id;
$$;

create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; fotos jsonb;
begin
 s := public.catalogo_validar_sessao(p_token);
 if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',f.id,'categoria',f.categoria,'pasta_id',f.pasta_id,'titulo',f.titulo,'url',f.url,
 'ordem',coalesce(p.ordem,f.ordem),'cliente_id',f.cliente_id
 ) order by f.pasta_id,coalesce(p.ordem,f.ordem) nulls last,f.criado_em,f.id),'[]'::jsonb) into fotos
 from public.biblioteca_fotos f left join public.biblioteca_preferencias p
 on p.foto_id=f.id and p.cliente_id=(s->>'cliente_id')::uuid
 where f.empresa_id=(s->>'empresa_id')::uuid
 and (f.cliente_id is null or f.cliente_id=(s->>'cliente_id')::uuid)
 and not coalesce(p.removida,false);
 return jsonb_build_object('fotos',fotos,'pastas',public.biblioteca_pastas_acervo((s->>'empresa_id')::uuid));
end $$;

create or replace function public.biblioteca_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar a biblioteca';
  end if;
  return jsonb_build_object('fotos',public.biblioteca_fotos_acervo(p_empresa_id),
    'pastas',public.biblioteca_pastas_acervo(p_empresa_id),
    'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome_razao) order by c.nome_razao),'[]'::jsonb)
      from public.clientes_empresas c where c.empresa_id=p_empresa_id));
end $$;

create or replace function public.biblioteca_publico_carregar(p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id);
begin
  if v_empresa is null then return jsonb_build_object('fotos', '[]'::jsonb, 'pastas', '[]'::jsonb); end if;
  return jsonb_build_object('fotos', (
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'categoria', f.categoria, 'pasta_id', f.pasta_id, 'titulo', f.titulo, 'url', f.url, 'ordem', f.ordem, 'cliente_id', null)
             order by f.pasta_id, f.ordem nulls last, f.criado_em), '[]'::jsonb)
      from public.biblioteca_fotos f
     where f.empresa_id = v_empresa and f.cliente_id is null),
    'pastas', public.biblioteca_pastas_acervo(v_empresa));
end;
$$;

-- Reordenar: "uma única pasta" agora é pasta_id, não categoria.
create or replace function public.biblioteca_reordenar(p_token text,p_empresa_id uuid,p_fotos uuid[])
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; e uuid; c uuid;
begin
 if p_token is not null then
 s := public.catalogo_validar_sessao(p_token);
 if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
 e := (s->>'empresa_id')::uuid; c := (s->>'cliente_id')::uuid;
 else
 e := p_empresa_id;
 if auth.uid() is null or not exists(select 1 from public.usuarios_empresas where empresa_id=e and user_id=auth.uid()) then
 raise exception 'Sem permissão'; end if;
 end if;
 if coalesce(cardinality(p_fotos),0)=0 or cardinality(p_fotos)>10000 or
 (select count(distinct id) from unnest(p_fotos) id) <> cardinality(p_fotos) then raise exception 'Lista inválida'; end if;
 if (select count(*) from public.biblioteca_fotos f where f.id=any(p_fotos) and f.empresa_id=e
 and (p_token is null or ((f.cliente_id is null or f.cliente_id=c) and not exists(
 select 1 from public.biblioteca_preferencias p where p.cliente_id=c and p.foto_id=f.id and p.removida)))) <> cardinality(p_fotos)
 then raise exception 'Foto indisponível'; end if;
 if (select count(distinct coalesce(pasta_id::text, categoria)) from public.biblioteca_fotos where id=any(p_fotos)) <> 1 then raise exception 'Selecione uma única pasta'; end if;
 if p_token is null then
 update public.biblioteca_fotos f set ordem=x.pos::integer from unnest(p_fotos) with ordinality x(id,pos) where f.id=x.id;
 else
 insert into public.biblioteca_preferencias(cliente_id,foto_id,ordem)
 select c,x.id,x.pos::integer from unnest(p_fotos) with ordinality x(id,pos)
 on conflict(cliente_id,foto_id) do update set ordem=excluded.ordem;
 end if;
end $$;

commit;
