-- Reuniões (nov/2026): agenda de reuniões da equipe, convites, gravação em partes, transcrição com reconhecimento
-- das vozes cadastradas e ata gerada pela IA (Edge Function reunioes-ia).
-- Quem vê: o organizador e os convidados sempre; reunião "empresa" = toda a equipe; "participantes" = convidados +
-- quem tem gestao.reunioes.ver_todas; "confidencial" = só organizador e convidados (nem quem vê todas).
-- Leitura e gravação passam pelas funções abaixo; as tabelas só têm leitura pela regra de visibilidade.

insert into permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('gestao.reunioes.ver_todas','Gestão','Reuniões','visualizar','Ver as reuniões da empresa (exceto as confidenciais), mesmo sem ser convidado',60)
on conflict(chave) do nothing;

create table if not exists public.reunioes(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 titulo text not null check (length(btrim(titulo)) between 2 and 160),
 pauta text,
 tipo text,
 inicio timestamptz not null,
 duracao_min int not null default 60 check (duracao_min between 5 and 720),
 local text,
 link text,
 visibilidade text not null default 'participantes' check (visibilidade in ('empresa','participantes','confidencial')),
 status text not null default 'agendada' check (status in ('agendada','em_andamento','realizada','cancelada')),
 organizador_id uuid not null,
 organizador_nome text,
 serie_id uuid,
 notas text,
 ata jsonb,
 ata_status text check (ata_status in ('rascunho','aprovada')),
 ata_gerada_em timestamptz,
 ata_aprovada_em timestamptz,
 ata_aprovada_por uuid,
 ata_aprovada_por_nome text,
 cancelado_motivo text,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
create index if not exists reunioes_empresa_inicio on public.reunioes(empresa_id, inicio);

create table if not exists public.reuniao_participantes(
 id uuid primary key default gen_random_uuid(),
 reuniao_id uuid not null references public.reunioes(id) on delete cascade,
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 funcionario_id uuid,
 nome text not null,
 email text,
 externo boolean not null default false,
 resposta text not null default 'pendente' check (resposta in ('pendente','confirmado','talvez','recusado')),
 respondido_em timestamptz,
 presente boolean,
 unique (reuniao_id, funcionario_id)
);
create index if not exists reuniao_participantes_func on public.reuniao_participantes(funcionario_id);

create table if not exists public.reuniao_partes(
 id uuid primary key default gen_random_uuid(),
 reuniao_id uuid not null references public.reunioes(id) on delete cascade,
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 ordem int not null,
 path text not null,
 tipo text,
 segundos int not null default 0,
 tamanho bigint,
 transcricao jsonb,
 transcrita_em timestamptz,
 vozes_reconhecidas int,
 criado_em timestamptz not null default now(),
 unique (reuniao_id, ordem)
);

create table if not exists public.reuniao_tarefas(
 id uuid primary key default gen_random_uuid(),
 reuniao_id uuid not null references public.reunioes(id) on delete cascade,
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 descricao text not null check (length(btrim(descricao)) between 2 and 600),
 responsavel_id uuid,
 responsavel_nome text,
 prazo date,
 concluida boolean not null default false,
 concluida_em timestamptz,
 origem text not null default 'manual' check (origem in ('ia','manual')),
 criado_em timestamptz not null default now()
);
create index if not exists reuniao_tarefas_resp on public.reuniao_tarefas(responsavel_id) where not concluida;

create table if not exists public.reuniao_vozes(
 funcionario_id uuid primary key,
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 path text not null,
 tipo text,
 segundos numeric,
 atualizado_em timestamptz not null default now(),
 atualizado_por uuid
);

-- ── regras de acesso ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reuniao_pode_ver(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from reunioes r where r.id = p_id and eh_membro_empresa(r.empresa_id) and (
   r.organizador_id = auth.uid()
   or exists(select 1 from reuniao_participantes p where p.reuniao_id = r.id and p.funcionario_id = auth.uid())
   or r.visibilidade = 'empresa'
   or (r.visibilidade = 'participantes' and operacao_pode(r.empresa_id, 'gestao.reunioes.ver_todas'))));
$$;

-- Editar (gravar, notas, presença, tarefas, revisar a ata): organizador ou convidado interno.
create or replace function public.reuniao_pode_editar(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from reunioes r where r.id = p_id and eh_membro_empresa(r.empresa_id) and (
   r.organizador_id = auth.uid()
   or exists(select 1 from reuniao_participantes p where p.reuniao_id = r.id and p.funcionario_id = auth.uid())));
$$;

create or replace function public.reuniao_acesso(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object('ver', reuniao_pode_ver(p_id), 'editar', reuniao_pode_editar(p_id),
   'aprovar', exists(select 1 from reunioes where id = p_id and organizador_id = auth.uid()));
$$;

create or replace function public.reuniao_meu_nome(p_empresa uuid) returns text
language sql stable security definer set search_path = public as $$
 select coalesce(
   (select nullif(btrim(nome),'') from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa),
   (select nullif(btrim(nome),'') from usuarios where id = auth.uid()),
   (select email from auth.users where id = auth.uid()), 'Equipe');
$$;

-- Storage (bucket privado "reunioes"): <empresa>/<reunião>/parte-N.webm e <empresa>/vozes/<funcionário>-<data>.webm
create or replace function public.reuniao_storage_pode(p_name text, p_escrita boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text[] := storage.foldername(p_name); emp uuid; rid uuid; func uuid;
begin
 if coalesce(array_length(f,1),0) < 2 then return false; end if;
 begin emp := f[1]::uuid; exception when others then return false; end;
 if not eh_membro_empresa(emp) then return false; end if;
 if f[2] = 'vozes' then
   begin func := substring(storage.filename(p_name) from 1 for 36)::uuid; exception when others then return false; end;
   return func = auth.uid() or operacao_pode(emp, 'rh.funcionarios.editar');
 end if;
 begin rid := f[2]::uuid; exception when others then return false; end;
 if not exists(select 1 from reunioes where id = rid and empresa_id = emp) then return false; end if;
 return case when p_escrita then reuniao_pode_editar(rid) else reuniao_pode_ver(rid) end;
end $$;

alter table public.reunioes enable row level security;
alter table public.reuniao_participantes enable row level security;
alter table public.reuniao_partes enable row level security;
alter table public.reuniao_tarefas enable row level security;
alter table public.reuniao_vozes enable row level security;
drop policy if exists reunioes_ler on public.reunioes;
create policy reunioes_ler on public.reunioes for select to authenticated using (reuniao_pode_ver(id));
drop policy if exists reuniao_participantes_ler on public.reuniao_participantes;
create policy reuniao_participantes_ler on public.reuniao_participantes for select to authenticated using (reuniao_pode_ver(reuniao_id));
drop policy if exists reuniao_partes_ler on public.reuniao_partes;
create policy reuniao_partes_ler on public.reuniao_partes for select to authenticated using (reuniao_pode_ver(reuniao_id));
drop policy if exists reuniao_tarefas_ler on public.reuniao_tarefas;
create policy reuniao_tarefas_ler on public.reuniao_tarefas for select to authenticated using (reuniao_pode_ver(reuniao_id));
do $$ declare t text; begin
 foreach t in array array['reunioes','reuniao_participantes','reuniao_partes','reuniao_tarefas','reuniao_vozes'] loop
  execute format('drop policy if exists seguranca_2fa on public.%I', t);
  execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
 end loop;
end $$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reunioes','reunioes', false, 62914560,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/aac','audio/x-m4a','audio/m4a','video/webm','video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists reunioes_storage_ler on storage.objects;
create policy reunioes_storage_ler on storage.objects for select to authenticated using (bucket_id = 'reunioes' and public.reuniao_storage_pode(name, false));
drop policy if exists reunioes_storage_enviar on storage.objects;
create policy reunioes_storage_enviar on storage.objects for insert to authenticated with check (bucket_id = 'reunioes' and public.reuniao_storage_pode(name, true));
drop policy if exists reunioes_storage_mudar on storage.objects;
create policy reunioes_storage_mudar on storage.objects for update to authenticated using (bucket_id = 'reunioes' and public.reuniao_storage_pode(name, true));
drop policy if exists reunioes_storage_apagar on storage.objects;
create policy reunioes_storage_apagar on storage.objects for delete to authenticated using (bucket_id = 'reunioes' and public.reuniao_storage_pode(name, true));

-- ── leitura ──────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reuniao_json(r reunioes, p_completo boolean) returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object(
  'id', r.id, 'titulo', r.titulo, 'tipo', r.tipo, 'inicio', r.inicio, 'duracao_min', r.duracao_min, 'local', r.local,
  'link', r.link, 'visibilidade', r.visibilidade, 'status', r.status, 'organizador_id', r.organizador_id,
  'organizador_nome', r.organizador_nome, 'serie_id', r.serie_id, 'ata_status', r.ata_status,
  'sou_organizador', r.organizador_id = auth.uid(),
  'minha_resposta', (select resposta from reuniao_participantes where reuniao_id = r.id and funcionario_id = auth.uid()),
  'gravacao_segundos', (select coalesce(sum(segundos),0) from reuniao_partes where reuniao_id = r.id),
  'partes', (select count(*) from reuniao_partes where reuniao_id = r.id),
  'tarefas_abertas', (select count(*) from reuniao_tarefas where reuniao_id = r.id and not concluida),
  'resumo', r.ata->>'resumo',
  'participantes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'funcionario_id', p.funcionario_id, 'nome', p.nome,
      'email', p.email, 'externo', p.externo, 'resposta', p.resposta, 'presente', p.presente,
      'tem_voz', exists(select 1 from reuniao_vozes v where v.funcionario_id = p.funcionario_id),
      'setor', (select setor from funcionarios_acesso f where f.id = p.funcionario_id)) order by coalesce(p.funcionario_id = r.organizador_id, false) desc, p.externo, p.nome)
    from reuniao_participantes p where p.reuniao_id = r.id), '[]'::jsonb))
 || case when not p_completo then '{}'::jsonb else jsonb_build_object(
  'pauta', r.pauta, 'notas', r.notas, 'ata', r.ata, 'ata_gerada_em', r.ata_gerada_em, 'ata_aprovada_em', r.ata_aprovada_em,
  'ata_aprovada_por_nome', r.ata_aprovada_por_nome, 'cancelado_motivo', r.cancelado_motivo,
  'pode_editar', reuniao_pode_editar(r.id), 'pode_aprovar', r.organizador_id = auth.uid(),
  'partes_lista', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ordem', x.ordem, 'path', x.path, 'tipo', x.tipo,
      'segundos', x.segundos, 'transcrita', x.transcrita_em is not null, 'transcricao', x.transcricao) order by x.ordem)
    from reuniao_partes x where x.reuniao_id = r.id), '[]'::jsonb),
  'tarefas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'descricao', t.descricao, 'responsavel_id', t.responsavel_id,
      'responsavel_nome', t.responsavel_nome, 'prazo', t.prazo, 'concluida', t.concluida, 'origem', t.origem) order by t.concluida, t.prazo nulls last, t.criado_em)
    from reuniao_tarefas t where t.reuniao_id = r.id), '[]'::jsonb)) end;
$$;

create or replace function public.reunioes_listar(p_empresa uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 return coalesce((select jsonb_agg(reuniao_json(r, false) order by r.inicio)
   from reunioes r where r.empresa_id = p_empresa
    and r.inicio >= (p_de::timestamp at time zone 'America/Sao_Paulo')
    and r.inicio < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
    and reuniao_pode_ver(r.id)), '[]'::jsonb);
end $$;

create or replace function public.reuniao_obter(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r reunioes;
begin
 select * into r from reunioes where id = p_id;
 if r.id is null or not reuniao_pode_ver(p_id) then raise exception 'Reunião não encontrada ou sem acesso.'; end if;
 return reuniao_json(r, true);
end $$;

-- Pessoas que podem ser convidadas (funcionários ativos), com a voz cadastrada.
create or replace function public.reunioes_pessoas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'setor', f.setor, 'cargo', f.cargo,
     'email', f.email, 'tem_voz', exists(select 1 from reuniao_vozes v where v.funcionario_id = f.id)) order by f.nome)
   from funcionarios_acesso f where f.empresa_id = p_empresa and f.ativo and coalesce(f.dados_rh->>'teste_rh','') <> 'true'), '[]'::jsonb);
end $$;

create or replace function public.reunioes_minhas_tarefas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'descricao', t.descricao, 'prazo', t.prazo, 'concluida', t.concluida,
     'reuniao_id', r.id, 'reuniao_titulo', r.titulo, 'reuniao_inicio', r.inicio) order by t.prazo nulls last, r.inicio desc)
   from reuniao_tarefas t join reunioes r on r.id = t.reuniao_id
   where t.empresa_id = p_empresa and t.responsavel_id = auth.uid() and not t.concluida and r.status <> 'cancelada'), '[]'::jsonb);
end $$;

-- ── gravação ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reuniao_salvar(p_empresa uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p_dados->>'id','')::uuid; r reunioes; v_inicio timestamptz := (p_dados->>'inicio')::timestamptz;
 v_semanas int := least(greatest(coalesce((p_dados->>'repetir_semanas')::int, 1), 1), 26); v_serie uuid; i int; nova_id uuid;
 ids uuid[] := '{}'; v_nome text; p jsonb; v_func uuid; v_vis text := coalesce(nullif(p_dados->>'visibilidade',''),'participantes');
 dia text;
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 if length(btrim(coalesce(p_dados->>'titulo',''))) < 2 then raise exception 'Dê um título para a reunião.'; end if;
 if v_inicio is null then raise exception 'Escolha a data e o horário.'; end if;
 v_nome := reuniao_meu_nome(p_empresa);
 if v_id is not null then
   select * into r from reunioes where id = v_id and empresa_id = p_empresa;
   if r.id is null then raise exception 'Reunião não encontrada.'; end if;
   if r.organizador_id <> auth.uid() then raise exception 'Só quem marcou a reunião pode mudar os dados e os convidados.'; end if;
   update reunioes set titulo = btrim(p_dados->>'titulo'), pauta = nullif(btrim(coalesce(p_dados->>'pauta','')),''),
     tipo = nullif(btrim(coalesce(p_dados->>'tipo','')),''), inicio = v_inicio,
     duracao_min = coalesce((p_dados->>'duracao_min')::int, 60), local = nullif(btrim(coalesce(p_dados->>'local','')),''),
     link = nullif(btrim(coalesce(p_dados->>'link','')),''), visibilidade = v_vis, atualizado_em = now()
   where id = v_id;
   ids := array[v_id];
 else
   v_serie := case when v_semanas > 1 then gen_random_uuid() end;
   for i in 0 .. v_semanas - 1 loop
     insert into reunioes(empresa_id, titulo, pauta, tipo, inicio, duracao_min, local, link, visibilidade, organizador_id, organizador_nome, serie_id)
     values (p_empresa, btrim(p_dados->>'titulo'), nullif(btrim(coalesce(p_dados->>'pauta','')),''), nullif(btrim(coalesce(p_dados->>'tipo','')),''),
       v_inicio + make_interval(days => 7 * i), coalesce((p_dados->>'duracao_min')::int, 60), nullif(btrim(coalesce(p_dados->>'local','')),''),
       nullif(btrim(coalesce(p_dados->>'link','')),''), v_vis, auth.uid(), v_nome, v_serie)
     returning id into nova_id;
     ids := ids || nova_id;
   end loop;
 end if;

 foreach v_id in array ids loop
   select * into r from reunioes where id = v_id;
   -- organizador sempre participa
   insert into reuniao_participantes(reuniao_id, empresa_id, funcionario_id, nome, resposta, respondido_em)
   values (v_id, p_empresa, auth.uid(), v_nome, 'confirmado', now()) on conflict (reuniao_id, funcionario_id) do nothing;
   if p_dados ? 'participantes' then
     -- quem saiu da lista (menos o organizador)
     delete from reuniao_participantes x where x.reuniao_id = v_id and x.funcionario_id is distinct from auth.uid()
       and not exists (select 1 from jsonb_array_elements(p_dados->'participantes') e
         where (x.funcionario_id is not null and nullif(e->>'funcionario_id','')::uuid = x.funcionario_id)
            or (x.funcionario_id is null and lower(coalesce(e->>'nome','')) = lower(x.nome) and coalesce(e->>'funcionario_id','') = ''));
     for p in select * from jsonb_array_elements(p_dados->'participantes') loop
       v_func := nullif(p->>'funcionario_id','')::uuid;
       if v_func is not null then
         if v_func = auth.uid() then continue; end if;
         if not exists(select 1 from funcionarios_acesso where id = v_func and empresa_id = p_empresa) then continue; end if;
         insert into reuniao_participantes(reuniao_id, empresa_id, funcionario_id, nome, email)
         select v_id, p_empresa, f.id, f.nome, f.email from funcionarios_acesso f where f.id = v_func
         on conflict (reuniao_id, funcionario_id) do nothing;
         if found and r.inicio > now() and exists(select 1 from app_push_assinaturas where user_id = v_func) then
           dia := to_char(r.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
           insert into app_push_fila(user_id, empresa_id, titulo, corpo, url, chave)
           values (v_func, p_empresa, 'Convite para reunião', r.titulo || ' · ' || dia || chr(10) || 'Convite de ' || v_nome,
             'Modulos/Gestao/Reunioes/reunioes.html?id=' || v_id, 'reuniao:' || v_id || ':' || v_func)
           on conflict (chave) do nothing;
         end if;
       elsif length(btrim(coalesce(p->>'nome',''))) >= 2
         and not exists(select 1 from reuniao_participantes where reuniao_id = v_id and funcionario_id is null and lower(nome) = lower(btrim(p->>'nome'))) then
         insert into reuniao_participantes(reuniao_id, empresa_id, nome, email, externo)
         values (v_id, p_empresa, btrim(p->>'nome'), nullif(btrim(coalesce(p->>'email','')),''), true);
       end if;
     end loop;
   end if;
 end loop;
 begin perform app_push_disparar(); exception when others then null; end;
 return jsonb_build_object('id', ids[1], 'criadas', array_length(ids,1));
end $$;

create or replace function public.reuniao_responder(p_id uuid, p_resposta text) returns void
language plpgsql security definer set search_path = public as $$
begin
 if p_resposta not in ('confirmado','talvez','recusado') then raise exception 'Resposta inválida.'; end if;
 update reuniao_participantes set resposta = p_resposta, respondido_em = now() where reuniao_id = p_id and funcionario_id = auth.uid();
 if not found then raise exception 'Você não foi convidado para esta reunião.'; end if;
end $$;

create or replace function public.reuniao_status(p_id uuid, p_status text, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
 select * into r from reunioes where id = p_id;
 if r.id is null or not reuniao_pode_editar(p_id) then raise exception 'Sem acesso a esta reunião.'; end if;
 if p_status = 'cancelada' then
   if r.organizador_id <> auth.uid() then raise exception 'Só quem marcou a reunião pode cancelar.'; end if;
   update reunioes set status = 'cancelada', cancelado_motivo = nullif(btrim(coalesce(p_motivo,'')),''), atualizado_em = now() where id = p_id;
 elsif p_status in ('agendada','em_andamento','realizada') then
   if r.ata_status = 'aprovada' then raise exception 'A ata já foi aprovada.'; end if;
   update reunioes set status = p_status, cancelado_motivo = null, atualizado_em = now() where id = p_id;
 else raise exception 'Situação inválida.'; end if;
end $$;

create or replace function public.reuniao_excluir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare paths jsonb;
begin
 if not exists(select 1 from reunioes where id = p_id and organizador_id = auth.uid()) then raise exception 'Só quem marcou a reunião pode excluir.'; end if;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from reuniao_partes where reuniao_id = p_id;
 delete from reunioes where id = p_id;
 return paths;
end $$;

create or replace function public.reuniao_parte_registrar(p_id uuid, p_ordem int, p_path text, p_tipo text, p_segundos int, p_tamanho bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare r reunioes; v uuid;
begin
 select * into r from reunioes where id = p_id;
 if r.id is null or not reuniao_pode_editar(p_id) then raise exception 'Sem acesso a esta reunião.'; end if;
 if r.ata_status = 'aprovada' then raise exception 'A ata já foi aprovada: não dá mais para gravar.'; end if;
 if p_path not like r.empresa_id || '/' || r.id || '/%' then raise exception 'Arquivo fora da pasta da reunião.'; end if;
 insert into reuniao_partes(reuniao_id, empresa_id, ordem, path, tipo, segundos, tamanho)
 values (p_id, r.empresa_id, p_ordem, p_path, p_tipo, greatest(coalesce(p_segundos,0),0), p_tamanho)
 on conflict (reuniao_id, ordem) do update set path = excluded.path, tipo = excluded.tipo, segundos = excluded.segundos,
   tamanho = excluded.tamanho, transcricao = null, transcrita_em = null
 returning id into v;
 if r.status = 'agendada' then update reunioes set status = 'em_andamento', atualizado_em = now() where id = p_id; end if;
 return v;
end $$;

create or replace function public.reuniao_parte_excluir(p_parte uuid) returns text
language plpgsql security definer set search_path = public as $$
declare x reuniao_partes;
begin
 select * into x from reuniao_partes where id = p_parte;
 if x.id is null or not reuniao_pode_editar(x.reuniao_id) then raise exception 'Sem acesso a esta gravação.'; end if;
 if exists(select 1 from reunioes where id = x.reuniao_id and ata_status = 'aprovada') then raise exception 'A ata já foi aprovada.'; end if;
 delete from reuniao_partes where id = p_parte;
 return x.path;
end $$;

create or replace function public.reuniao_notas_salvar(p_id uuid, p_notas text) returns void
language plpgsql security definer set search_path = public as $$
begin
 if not reuniao_pode_editar(p_id) then raise exception 'Sem acesso a esta reunião.'; end if;
 update reunioes set notas = left(p_notas, 20000), atualizado_em = now() where id = p_id;
end $$;

create or replace function public.reuniao_presenca(p_participante uuid, p_presente boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
 select reuniao_id into v from reuniao_participantes where id = p_participante;
 if v is null or not reuniao_pode_editar(v) then raise exception 'Sem acesso a esta reunião.'; end if;
 update reuniao_participantes set presente = p_presente where id = p_participante;
end $$;

create or replace function public.reuniao_ata_salvar(p_id uuid, p_ata jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
 select * into r from reunioes where id = p_id;
 if r.id is null or not reuniao_pode_editar(p_id) then raise exception 'Sem acesso a esta reunião.'; end if;
 if r.ata_status = 'aprovada' then raise exception 'A ata já foi aprovada: não dá mais para mudar.'; end if;
 if jsonb_typeof(p_ata) <> 'object' or length(p_ata::text) > 200000 then raise exception 'Ata inválida.'; end if;
 update reunioes set ata = p_ata, ata_status = 'rascunho', atualizado_em = now() where id = p_id;
end $$;

create or replace function public.reuniao_ata_aprovar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
 select * into r from reunioes where id = p_id;
 if r.id is null or r.organizador_id <> auth.uid() then raise exception 'Só quem marcou a reunião aprova a ata.'; end if;
 if r.ata is null then raise exception 'Gere ou escreva a ata antes de aprovar.'; end if;
 update reunioes set ata_status = 'aprovada', status = 'realizada', ata_aprovada_em = now(), ata_aprovada_por = auth.uid(),
   ata_aprovada_por_nome = reuniao_meu_nome(r.empresa_id), atualizado_em = now() where id = p_id;
end $$;

create or replace function public.reuniao_tarefa_salvar(p_reuniao uuid, p_id uuid, p_descricao text, p_responsavel uuid, p_prazo date) returns uuid
language plpgsql security definer set search_path = public as $$
declare r reunioes; v uuid := p_id; v_nome text;
begin
 select * into r from reunioes where id = p_reuniao;
 if r.id is null or not reuniao_pode_editar(p_reuniao) then raise exception 'Sem acesso a esta reunião.'; end if;
 if length(btrim(coalesce(p_descricao,''))) < 2 then raise exception 'Descreva a tarefa.'; end if;
 select nome into v_nome from funcionarios_acesso where id = p_responsavel and empresa_id = r.empresa_id;
 if v is null then
   insert into reuniao_tarefas(reuniao_id, empresa_id, descricao, responsavel_id, responsavel_nome, prazo)
   values (p_reuniao, r.empresa_id, btrim(p_descricao), case when v_nome is not null then p_responsavel end, v_nome, p_prazo) returning id into v;
 else
   update reuniao_tarefas set descricao = btrim(p_descricao), responsavel_id = case when v_nome is not null then p_responsavel end,
     responsavel_nome = v_nome, prazo = p_prazo where id = v and reuniao_id = p_reuniao;
 end if;
 return v;
end $$;

create or replace function public.reuniao_tarefa_concluir(p_id uuid, p_concluida boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t reuniao_tarefas;
begin
 select * into t from reuniao_tarefas where id = p_id;
 if t.id is null or not (reuniao_pode_editar(t.reuniao_id) or t.responsavel_id = auth.uid()) then raise exception 'Sem acesso a esta tarefa.'; end if;
 update reuniao_tarefas set concluida = p_concluida, concluida_em = case when p_concluida then now() end where id = p_id;
end $$;

create or replace function public.reuniao_tarefa_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t reuniao_tarefas;
begin
 select * into t from reuniao_tarefas where id = p_id;
 if t.id is null or not reuniao_pode_editar(t.reuniao_id) then raise exception 'Sem acesso a esta tarefa.'; end if;
 delete from reuniao_tarefas where id = p_id;
end $$;

-- ── voz ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reuniao_voz_obter(p_empresa uuid, p_funcionario uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v reuniao_vozes; pode boolean;
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 select * into v from reuniao_vozes where funcionario_id = p_funcionario and empresa_id = p_empresa;
 pode := p_funcionario = auth.uid() or operacao_pode(p_empresa, 'rh.funcionarios.editar');
 return jsonb_build_object('tem_voz', v.funcionario_id is not null, 'pode_editar', pode,
   'path', case when pode then v.path end, 'segundos', v.segundos, 'atualizado_em', v.atualizado_em);
end $$;

create or replace function public.reuniao_voz_salvar(p_empresa uuid, p_funcionario uuid, p_path text, p_tipo text, p_segundos numeric) returns text
language plpgsql security definer set search_path = public as $$
declare antigo text;
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a esta empresa.'; end if;
 if not (p_funcionario = auth.uid() or operacao_pode(p_empresa, 'rh.funcionarios.editar')) then raise exception 'Você só pode cadastrar a sua própria voz.'; end if;
 if not exists(select 1 from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa) then raise exception 'Funcionário não encontrado.'; end if;
 if p_path not like p_empresa || '/vozes/' || p_funcionario || '%' then raise exception 'Arquivo fora da pasta das vozes.'; end if;
 if p_segundos is not null and p_segundos < 2 then raise exception 'A gravação ficou curta demais. Leia a frase inteira.'; end if;
 select path into antigo from reuniao_vozes where funcionario_id = p_funcionario;
 insert into reuniao_vozes(funcionario_id, empresa_id, path, tipo, segundos, atualizado_em, atualizado_por)
 values (p_funcionario, p_empresa, p_path, p_tipo, p_segundos, now(), auth.uid())
 on conflict (funcionario_id) do update set path = excluded.path, tipo = excluded.tipo, segundos = excluded.segundos,
   atualizado_em = now(), atualizado_por = auth.uid();
 return nullif(antigo, p_path);
end $$;

create or replace function public.reuniao_voz_excluir(p_empresa uuid, p_funcionario uuid) returns text
language plpgsql security definer set search_path = public as $$
declare antigo text;
begin
 if not (p_funcionario = auth.uid() or operacao_pode(p_empresa, 'rh.funcionarios.editar')) then raise exception 'Sem permissão.'; end if;
 delete from reuniao_vozes where funcionario_id = p_funcionario and empresa_id = p_empresa returning path into antigo;
 return antigo;
end $$;

do $$ declare f text; begin
 foreach f in array array[
  'reuniao_pode_ver(uuid)','reuniao_pode_editar(uuid)','reuniao_acesso(uuid)','reuniao_meu_nome(uuid)','reuniao_storage_pode(text,boolean)',
  'reuniao_json(reunioes,boolean)','reunioes_listar(uuid,date,date)','reuniao_obter(uuid)','reunioes_pessoas(uuid)','reunioes_minhas_tarefas(uuid)',
  'reuniao_salvar(uuid,jsonb)','reuniao_responder(uuid,text)','reuniao_status(uuid,text,text)','reuniao_excluir(uuid)',
  'reuniao_parte_registrar(uuid,int,text,text,int,bigint)','reuniao_parte_excluir(uuid)','reuniao_notas_salvar(uuid,text)',
  'reuniao_presenca(uuid,boolean)','reuniao_ata_salvar(uuid,jsonb)','reuniao_ata_aprovar(uuid)',
  'reuniao_tarefa_salvar(uuid,uuid,text,uuid,date)','reuniao_tarefa_concluir(uuid,boolean)','reuniao_tarefa_excluir(uuid)',
  'reuniao_voz_obter(uuid,uuid)','reuniao_voz_salvar(uuid,uuid,text,text,numeric)','reuniao_voz_excluir(uuid,uuid)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;
revoke all on function public.reuniao_json(reunioes,boolean) from authenticated;
