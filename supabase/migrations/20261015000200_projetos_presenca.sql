-- Presença do decorador no projeto (out/2026). Pedido do usuário: "quando a pessoa estiver mexendo no catálogo em algum
-- pedido ou montando alguma coisa, eu quero que essa informação apareça lá dentro de central de pedidos... aí eu veria
-- que o decorador está dentro daquele pedido".
--
-- O catálogo do decorador manda um sinal (projeto_presenca) enquanto o projeto está aberto e a aba visível, e a cada
-- edição. A Central mostra "Montando agora" quando o último sinal tem menos de 2 minutos. Tabela à parte de propósito:
-- gravar em `projetos` mexeria no updated_at e na ordem da lista a cada minuto.
create table if not exists public.projetos_presenca (
  projeto_id uuid primary key references public.projetos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid,
  visto_em timestamptz not null default now(),
  detalhe text
);
create index if not exists projetos_presenca_empresa_idx on public.projetos_presenca (empresa_id, visto_em desc);

alter table public.projetos_presenca enable row level security;
drop policy if exists projetos_presenca_equipe_le on public.projetos_presenca;
create policy projetos_presenca_equipe_le on public.projetos_presenca
  for select to authenticated using (public.eh_membro_empresa(empresa_id));

-- Só o DECORADOR dono do projeto registra presença (a equipe abrindo o projeto não deve aparecer como "decorador montando").
create or replace function public.projeto_presenca(p_token text default null, p_empresa_id uuid default null, p_id uuid default null, p_detalhe text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  if (c->>'equipe')::boolean is true then return; end if;
  r := public.projeto_do_chamador(c, p_id);
  insert into public.projetos_presenca (projeto_id, empresa_id, cliente_id, visto_em, detalhe)
  values (r.id, r.empresa_id, r.cliente_id, now(), left(nullif(btrim(p_detalhe), ''), 120))
  on conflict (projeto_id) do update set visto_em = now(), detalhe = excluded.detalhe, cliente_id = excluded.cliente_id;
end; $$;

revoke all on function public.projeto_presenca(text, uuid, uuid, text) from public;
grant execute on function public.projeto_presenca(text, uuid, uuid, text) to anon, authenticated;
