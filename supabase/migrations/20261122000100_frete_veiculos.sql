-- App do Freteiro › Meus veículos (22/11/2026, pedido do usuário): o freteiro pode ter mais de um caminhão. Cadastra todos
-- e, ao lançar um frete, escolhe qual foi. O veículo do cadastro (frete_freteiros.veiculo_*) entra sozinho como o primeiro.
create table if not exists public.frete_veiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  freteiro_id uuid not null references public.frete_freteiros(id) on delete cascade,
  modelo text not null,
  placa text,
  tipo text,
  capacidade_m3 numeric not null default 0 check (capacidade_m3 >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists frete_veiculos_freteiro_idx on public.frete_veiculos (freteiro_id, ativo);
alter table public.frete_veiculos enable row level security;
alter table public.frete_lancamentos add column if not exists veiculo_id uuid references public.frete_veiculos(id) on delete set null;

create or replace function public.frete_veiculos_lista(f frete_freteiros) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from frete_veiculos where freteiro_id = f.id) and nullif(btrim(coalesce(f.veiculo_modelo, '')), '') is not null then
    insert into frete_veiculos (empresa_id, freteiro_id, modelo, placa, tipo, capacidade_m3)
    values (f.empresa_id, f.id, btrim(f.veiculo_modelo), nullif(upper(btrim(coalesce(f.veiculo_placa, ''))), ''), nullif(btrim(coalesce(f.veiculo_tipo, '')), ''), coalesce(f.capacidade_m3, 0));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'modelo', v.modelo, 'placa', v.placa, 'tipo', v.tipo, 'capacidade_m3', v.capacidade_m3,
            'nome', v.modelo || coalesce(' · ' || v.placa, '')) order by v.created_at)
          from frete_veiculos v where v.freteiro_id = f.id and v.ativo), '[]'::jsonb);
end $$;
revoke all on function public.frete_veiculos_lista(frete_freteiros) from public, anon, authenticated;

create or replace function public.frete_veiculos_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin return jsonb_build_object('veiculos', frete_veiculos_lista(f)); end $$;
grant execute on function public.frete_veiculos_app(text) to anon, authenticated;

create or replace function public.frete_veiculo_salvar(p_token text, p_id uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); cap numeric;
begin
  if length(btrim(coalesce(p_dados->>'modelo', ''))) < 2 then raise exception 'Informe o modelo do veículo.'; end if;
  cap := coalesce(frete_num(replace(p_dados->>'capacidade_m3', ',', '.')), 0);
  if p_id is null then
    insert into frete_veiculos (empresa_id, freteiro_id, modelo, placa, tipo, capacidade_m3)
    values (f.empresa_id, f.id, btrim(p_dados->>'modelo'), nullif(upper(btrim(coalesce(p_dados->>'placa', ''))), ''), nullif(btrim(coalesce(p_dados->>'tipo', '')), ''), cap);
  else
    update frete_veiculos set modelo = btrim(p_dados->>'modelo'), placa = nullif(upper(btrim(coalesce(p_dados->>'placa', ''))), ''),
           tipo = nullif(btrim(coalesce(p_dados->>'tipo', '')), ''), capacidade_m3 = cap
     where id = p_id and freteiro_id = f.id;
    if not found then raise exception 'Veículo não encontrado.'; end if;
  end if;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f));
end $$;
grant execute on function public.frete_veiculo_salvar(text, uuid, jsonb) to anon, authenticated;

create or replace function public.frete_veiculo_excluir(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  update frete_veiculos set ativo = false where id = p_id and freteiro_id = f.id;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f));
end $$;
grant execute on function public.frete_veiculo_excluir(text, uuid) to anon, authenticated;

-- lançar frete: o caminhão vem da lista de veículos (veiculo_id); o texto "caminhao" fica com o nome do veículo
create or replace function public.frete_lanc_veiculo_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare v frete_veiculos;
begin
  if new.veiculo_id is not null then
    select * into v from frete_veiculos where id = new.veiculo_id and freteiro_id = new.freteiro_id;
    if v.id is null then raise exception 'Escolha um dos seus veículos.'; end if;
    new.caminhao := v.modelo || coalesce(' · ' || v.placa, '');
  end if;
  return new;
end $$;
drop trigger if exists frete_lanc_veiculo on public.frete_lancamentos;
create trigger frete_lanc_veiculo before insert or update of veiculo_id on public.frete_lancamentos for each row execute function public.frete_lanc_veiculo_trg();


-- frete_lanc_salvar grava o veiculo_id (o gatilho completa o nome do caminhão); frete_lanc_app devolve os veículos para o formulário
create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'caminhao', l.caminhao, 'veiculo_id', l.veiculo_id, 'origem_lat', l.origem_lat, 'origem_lng', l.origem_lng, 'destino_lat', l.destino_lat, 'destino_lng', l.destino_lng, 'valor', l.valor, 'extras', l.extras,
    'total', frete_lanc_total(l), 'observacao', l.observacao, 'situacao', l.situacao, 'divergencia', l.divergencia,
    'tipo', l.origem_lanc, 'explicacao', l.explicacao, 'explicacao_em', l.explicacao_em, 'decisao_motivo', l.decisao_motivo,
    'valor_final', l.valor_final, 'decidido', l.decisao_em is not null)
$$;

revoke all on function public.frete_lanc_json(frete_lancamentos) from public, anon, authenticated;

create or replace function public.frete_lanc_salvar(p_token text, p_id uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; d date; v numeric; ex jsonb := '[]'::jsonb; e jsonb;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  if p_id is not null and not exists (select 1 from frete_lancamentos where id = p_id and freteiro_id = f.id and situacao = 'rascunho') then
    raise exception 'Este frete já foi enviado e não pode mais ser alterado.';
  end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  begin d := (p_dados->>'data')::date; exception when others then raise exception 'Informe a data do frete.'; end;
  if d is null then raise exception 'Informe a data do frete.'; end if;
  if d < a or d > b then raise exception 'Data fora do período: lance só fretes de % a %.', to_char(a, 'DD/MM/YYYY'), to_char(b, 'DD/MM/YYYY'); end if;
  if length(btrim(coalesce(p_dados->>'destino', ''))) < 2 then raise exception 'Informe para onde foi o frete.'; end if;
  if length(btrim(coalesce(p_dados->>'caminhao', ''))) < 2 then raise exception 'Informe o caminhão do frete.'; end if;
  begin v := round((p_dados->>'valor')::numeric, 2); exception when others then raise exception 'Informe o valor combinado.'; end;
  if coalesce(v, 0) <= 0 then raise exception 'Informe o valor combinado.'; end if;
  for e in select value from jsonb_array_elements(coalesce(p_dados->'extras', '[]'::jsonb)) loop
    if coalesce((e->>'valor')::numeric, 0) > 0 then
      if length(btrim(coalesce(e->>'motivo', ''))) < 2 then raise exception 'Diga o motivo de cada extra.'; end if;
      ex := ex || jsonb_build_object('motivo', btrim(e->>'motivo'), 'valor', round((e->>'valor')::numeric, 2));
    end if;
  end loop;
  if p_id is null then
    insert into frete_lancamentos (empresa_id, freteiro_id, data, origem, destino, valor, extras, observacao, caminhao, veiculo_id, origem_lat, origem_lng, destino_lat, destino_lng)
    values (f.empresa_id, f.id, d, btrim(coalesce(p_dados->>'origem', '')), btrim(p_dados->>'destino'), v, ex, nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
            btrim(p_dados->>'caminhao'), nullif(p_dados->>'veiculo_id', '')::uuid, frete_num(p_dados->>'origem_lat'), frete_num(p_dados->>'origem_lng'), frete_num(p_dados->>'destino_lat'), frete_num(p_dados->>'destino_lng'));
  else
    update frete_lancamentos set data = d, origem = btrim(coalesce(p_dados->>'origem', '')), destino = btrim(p_dados->>'destino'), valor = v, extras = ex,
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), caminhao = btrim(p_dados->>'caminhao'), veiculo_id = nullif(p_dados->>'veiculo_id', '')::uuid,
           origem_lat = frete_num(p_dados->>'origem_lat'), origem_lng = frete_num(p_dados->>'origem_lng'), destino_lat = frete_num(p_dados->>'destino_lat'), destino_lng = frete_num(p_dados->>'destino_lng'), updated_at = now()
     where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
    if not found then raise exception 'Este frete já foi enviado e não pode mais ser alterado.'; end if;
  end if;
  return frete_lanc_app(p_token);
end $$;

grant execute on function public.frete_lanc_salvar(text, uuid, jsonb) to anon, authenticated;

create or replace function public.frete_lanc_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = f.empresa_id;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f),
    'periodo', jsonb_build_object('ini', a, 'fim', b, 'tipo', coalesce(cfg->>'tipo', 'semanal'), 'pode_enviar', hoje >= b),
    'rascunhos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho'), '[]'),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ini', r.periodo_ini, 'fim', r.periodo_fim, 'status', r.status, 'enviado_em', r.enviado_em,
        'total', r.total_informado,
        'pendentes', (select count(*) from frete_lancamentos l where l.relatorio_id = r.id and l.situacao = 'divergente'),
        'lancamentos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.relatorio_id = r.id), '[]'))
        order by r.periodo_ini desc) from frete_relatorios r where r.freteiro_id = f.id and r.enviado_em > now() - interval '180 days'), '[]'));
end $$;

grant execute on function public.frete_lanc_app(text) to anon, authenticated;
notify pgrst, 'reload schema';
