-- Pós-venda por WhatsApp (nov/2026): a IA conversa com o decorador pelo Z-API para pegar o feedback do evento.
-- Esta etapa prepara a central: conversas, mensagens (enviadas e recebidas, com foto/áudio) e o resultado registrado
-- (elogios, críticas, sugestões, nota). O webhook do Z-API grava as respostas; a equipe vê tudo em Comercial > Pós-venda.
create table if not exists public.posvenda_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid references public.posvenda_contatos(id) on delete set null,
  cliente_id uuid,
  cliente_nome text,
  telefone text not null,                       -- só números, com DDI (ex.: 5524999999999)
  status text not null default 'ativa' check (status in ('ativa','aguardando','concluida','sem_resposta','encerrada')),
  ia_ativa boolean not null default true,       -- false = alguém da equipe assumiu a conversa
  assumida_por uuid,
  assumida_por_nome text,
  iniciada_em timestamptz not null default now(),
  ultima_mensagem_em timestamptz,
  encerrada_em timestamptz,
  resultado jsonb not null default '{}'::jsonb, -- {resumo, nota, sentimento, elogios[], criticas[], sugestoes[], quer_retorno}
  created_at timestamptz not null default now()
);
create index if not exists posvenda_conversas_emp on public.posvenda_conversas (empresa_id, status, ultima_mensagem_em desc);
create index if not exists posvenda_conversas_tel on public.posvenda_conversas (empresa_id, telefone, status);

create table if not exists public.posvenda_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.posvenda_conversas(id) on delete cascade,
  direcao text not null check (direcao in ('entrada','saida')),
  autor text not null check (autor in ('ia','cliente','equipe')),
  autor_nome text,
  tipo text not null default 'texto' check (tipo in ('texto','imagem','audio','video','documento')),
  texto text,
  midia_url text,
  zapi_message_id text,
  status text not null default 'enviado' check (status in ('pendente','enviado','recebido','lido','falha')),
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists posvenda_mensagens_conv on public.posvenda_mensagens (conversa_id, created_at);
create unique index if not exists posvenda_mensagens_zapi on public.posvenda_mensagens (empresa_id, zapi_message_id) where zapi_message_id is not null;

alter table public.posvenda_conversas enable row level security;
alter table public.posvenda_mensagens enable row level security;
drop policy if exists posvenda_conversas_ler on public.posvenda_conversas;
create policy posvenda_conversas_ler on public.posvenda_conversas for select to authenticated using (public.operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
drop policy if exists posvenda_mensagens_ler on public.posvenda_mensagens;
create policy posvenda_mensagens_ler on public.posvenda_mensagens for select to authenticated using (public.operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
do $$ declare t text; begin
  foreach t in array array['posvenda_conversas', 'posvenda_mensagens'] loop
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- Mídia recebida (fotos/áudios do decorador): cópia no Storage, porque o link do Z-API expira.
insert into storage.buckets(id,name,public,file_size_limit)
values('posvenda-midia','posvenda-midia',true,26214400)
on conflict(id) do nothing;

-- Equipe assume (pausa a IA) ou devolve a conversa para a IA.
create or replace function public.posvenda_conversa_assumir(p_empresa uuid, p_id uuid, p_assumir boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r posvenda_conversas; nome text;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.editar') then raise exception 'Sem permissão' using errcode='42501'; end if;
  nome := coalesce((select f.nome from funcionarios_acesso f where f.id = auth.uid()), (select u.nome from usuarios u where u.id = auth.uid()), 'Equipe');
  update posvenda_conversas set ia_ativa = not p_assumir,
         assumida_por = case when p_assumir then auth.uid() end, assumida_por_nome = case when p_assumir then nome end
   where id = p_id and empresa_id = p_empresa returning * into r;
  if not found then raise exception 'Conversa não encontrada'; end if;
  return to_jsonb(r);
end $$;

-- Mensagem que a equipe enviou pelo WhatsApp (o envio em si é pela Edge Function zapi-integration).
create or replace function public.posvenda_mensagem_equipe(p_empresa uuid, p_conversa uuid, p_texto text, p_zapi_id text default null, p_erro text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m posvenda_mensagens; nome text;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.editar') then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not exists (select 1 from posvenda_conversas where id = p_conversa and empresa_id = p_empresa) then raise exception 'Conversa não encontrada'; end if;
  if length(trim(coalesce(p_texto,''))) = 0 then raise exception 'Mensagem vazia'; end if;
  nome := coalesce((select f.nome from funcionarios_acesso f where f.id = auth.uid()), (select u.nome from usuarios u where u.id = auth.uid()), 'Equipe');
  insert into posvenda_mensagens(empresa_id, conversa_id, direcao, autor, autor_nome, tipo, texto, zapi_message_id, status, erro)
  values (p_empresa, p_conversa, 'saida', 'equipe', nome, 'texto', trim(p_texto), nullif(p_zapi_id,''),
          case when p_erro is null then 'enviado' else 'falha' end, p_erro)
  returning * into m;
  update posvenda_conversas set ultima_mensagem_em = m.created_at where id = p_conversa;
  return to_jsonb(m);
end $$;

-- Encerrar à mão / corrigir o resultado registrado.
create or replace function public.posvenda_conversa_resultado(p_empresa uuid, p_id uuid, p_status text, p_resultado jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r posvenda_conversas;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.editar') then raise exception 'Sem permissão' using errcode='42501'; end if;
  if p_status not in ('ativa','aguardando','concluida','sem_resposta','encerrada') then raise exception 'Situação inválida'; end if;
  update posvenda_conversas set status = p_status, resultado = coalesce(p_resultado, resultado),
         encerrada_em = case when p_status in ('concluida','sem_resposta','encerrada') then coalesce(encerrada_em, now()) else null end
   where id = p_id and empresa_id = p_empresa returning * into r;
  if not found then raise exception 'Conversa não encontrada'; end if;
  return to_jsonb(r);
end $$;

revoke all on function public.posvenda_conversa_assumir(uuid,uuid,boolean) from public, anon;
revoke all on function public.posvenda_mensagem_equipe(uuid,uuid,text,text,text) from public, anon;
revoke all on function public.posvenda_conversa_resultado(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.posvenda_conversa_assumir(uuid,uuid,boolean) to authenticated;
grant execute on function public.posvenda_mensagem_equipe(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.posvenda_conversa_resultado(uuid,uuid,text,jsonb) to authenticated;
