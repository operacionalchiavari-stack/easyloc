-- Projetos do catálogo: nome dos noivos opcional + dados do evento (out/2026).
-- Pedido do usuário: "os nomes dos noivos são opcionais"; na criação de um pedido novo a Helena precisa de
-- data de entrega, data do evento (um dia ou um período), data de coleta, tipo de evento e local.
--
-- Os dados novos moram em dados.evento (jsonb), como dados.foto_casal: o salvamento automático do catálogo grava
-- `dados` inteiro e preserva chaves que não conhece, então nenhuma coluna nova é preciso.
--   dados.evento = { tipo, data_entrega, hora_entrega, data_fim, data_coleta, hora_coleta,
--                    obs_entrega, obs_coleta, obs_separacao }
--
-- A coluna `noivos` continua sendo o nome do projeto (todas as telas mostram ela). Sem noivos, o nome vira
-- "<Tipo do evento> · <local>" (ou só o tipo/local), então a regra "não vazio" continua valendo.

create or replace function public.projeto_nome_padrao(p_noivos text, p_evento jsonb, p_local text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    nullif(btrim(p_noivos), ''),
    nullif(btrim(concat_ws(' · ', nullif(upper(left(btrim(coalesce(p_evento->>'tipo', '')), 1)) || substr(btrim(coalesce(p_evento->>'tipo', '')), 2), ''), nullif(btrim(coalesce(p_local, '')), ''))), ''),
    'Evento'
  );
$$;

create or replace function public.projeto_evento_limpo(p_evento jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare e jsonb := '{}'::jsonb; k text; v text;
begin
  if p_evento is null or jsonb_typeof(p_evento) <> 'object' then return '{}'::jsonb; end if;
  foreach k in array array['tipo','data_entrega','hora_entrega','data_fim','data_coleta','hora_coleta','obs_entrega','obs_coleta','obs_separacao','endereco','lat','lng','local_id','place_id'] loop
    v := btrim(coalesce(p_evento->>k, ''));
    if v = '' then continue; end if;
    if k like 'data_%' and v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida em %', k; end if;
    if k like 'hora_%' and v !~ '^\d{2}:\d{2}$' then raise exception 'Horário inválido em %', k; end if;
    e := e || jsonb_build_object(k, left(v, case when k like 'obs_%' or k = 'endereco' then 600 when k = 'place_id' then 300 else 80 end));
  end loop;
  return e;
end; $$;

drop function if exists public.projeto_criar(text, uuid, text, date, text, jsonb);
create or replace function public.projeto_criar(p_token text default null, p_empresa_id uuid default null, p_noivos text default null,
  p_data_evento date default null, p_local_evento text default null, p_ambientes jsonb default '[]'::jsonb, p_evento jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb; r public.projetos; amb jsonb := '[]'::jsonb; nome text; n int := 0; ev jsonb;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  if p_data_evento is null then raise exception 'Informe a data do evento'; end if;
  if p_local_evento is null or length(btrim(p_local_evento)) = 0 then raise exception 'Informe o local do evento'; end if;
  ev := public.projeto_evento_limpo(p_evento);
  if ev ? 'data_fim' and (ev->>'data_fim')::date < p_data_evento then raise exception 'O último dia do evento é antes do primeiro'; end if;
  if ev ? 'data_entrega' and (ev->>'data_entrega')::date > p_data_evento then raise exception 'A entrega é depois do evento'; end if;
  if ev ? 'data_coleta' and (ev->>'data_coleta')::date < coalesce((ev->>'data_fim')::date, p_data_evento) then raise exception 'A coleta é antes do fim do evento'; end if;
  for nome in select btrim(value) from jsonb_array_elements_text(coalesce(p_ambientes, '[]'::jsonb)) loop
    if nome <> '' then
      amb := amb || jsonb_build_object('id', 'a' || substr(md5(random()::text || n::text), 1, 8), 'nome', left(nome, 60), 'itens', '[]'::jsonb, 'renders', '[]'::jsonb, 'notas', '');
      n := n + 1;
    end if;
  end loop;
  insert into public.projetos(empresa_id, cliente_id, criado_por, noivos, data_evento, local_evento, dados)
  values ((c->>'empresa_id')::uuid, nullif(c->>'cliente_id','')::uuid, nullif(c->>'uid','')::uuid,
          left(public.projeto_nome_padrao(p_noivos, ev, p_local_evento), 120), p_data_evento, btrim(p_local_evento),
          jsonb_build_object('ambientes', amb) || case when ev = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('evento', ev) end)
  returning * into r;
  return public.projeto_resumo(r) || jsonb_build_object('dados', r.dados, 'slug', r.slug, 'pin_definido', false);
end; $$;
revoke all on function public.projeto_criar(text, uuid, text, date, text, jsonb, jsonb) from public;
grant execute on function public.projeto_criar(text, uuid, text, date, text, jsonb, jsonb) to anon, authenticated, service_role;

create or replace function public.projeto_salvar(p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_noivos text default null, p_data_evento date default null, p_local_evento text default null, p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  if p_data_evento is null then raise exception 'Informe a data do evento'; end if;
  if p_local_evento is null or length(btrim(p_local_evento)) = 0 then raise exception 'Informe o local do evento'; end if;
  if p_dados is null or jsonb_typeof(p_dados->'ambientes') <> 'array' then raise exception 'Dados do projeto inválidos'; end if;
  if length(p_dados::text) > 600000 then raise exception 'Projeto grande demais'; end if;
  update public.projetos set noivos = left(public.projeto_nome_padrao(p_noivos, p_dados->'evento', p_local_evento), 120),
         data_evento = p_data_evento, local_evento = btrim(p_local_evento), dados = p_dados, updated_at = now()
   where id = r.id returning * into r;
  return public.projeto_resumo(r);
end; $$;

create or replace function public.projeto_resumo(r projetos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
    'status', r.status, 'compartilhar', r.compartilhar, 'pedido_enviado_em', r.pedido_enviado_em,
    'atualizado_em', r.updated_at, 'layout_id', r.layout_id,
    'foto_casal_url', r.dados->'foto_casal'->>'url',
    'evento', coalesce(r.dados->'evento', '{}'::jsonb),
    'ambientes', jsonb_array_length(r.dados->'ambientes'),
    'itens', coalesce((select sum(coalesce((i->>'quantidade')::int, 1)) from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i), 0),
    'renders', coalesce((select sum(jsonb_array_length(coalesce(a->'renders','[]'::jsonb))) from jsonb_array_elements(r.dados->'ambientes') a), 0),
    'dono', coalesce((select c.nome_razao from public.clientes_empresas c where c.id = r.cliente_id), 'Equipe')
  );
$$;
revoke all on function public.projeto_nome_padrao(text, jsonb, text) from public;
revoke all on function public.projeto_evento_limpo(jsonb) from public;
