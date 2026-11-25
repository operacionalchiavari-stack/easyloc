-- App do Freteiro (21/11/2026, pedido do usuário): cada frete lançado leva o caminhão (obrigatório) e as coordenadas dos
-- endereços escolhidos no Google (saiu de / foi para). Os extras saíram da tela (o banco ainda aceita, sem uso).
alter table public.frete_lancamentos add column if not exists caminhao text, add column if not exists origem_lat numeric,
  add column if not exists origem_lng numeric, add column if not exists destino_lat numeric, add column if not exists destino_lng numeric;
create or replace function public.frete_num(v text) returns numeric language plpgsql immutable as $$
begin return nullif(btrim(coalesce(v, '')), '')::numeric; exception when others then return null; end $$;

create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'caminhao', l.caminhao, 'origem_lat', l.origem_lat, 'origem_lng', l.origem_lng, 'destino_lat', l.destino_lat, 'destino_lng', l.destino_lng, 'valor', l.valor, 'extras', l.extras,
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
    insert into frete_lancamentos (empresa_id, freteiro_id, data, origem, destino, valor, extras, observacao, caminhao, origem_lat, origem_lng, destino_lat, destino_lng)
    values (f.empresa_id, f.id, d, btrim(coalesce(p_dados->>'origem', '')), btrim(p_dados->>'destino'), v, ex, nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
            btrim(p_dados->>'caminhao'), frete_num(p_dados->>'origem_lat'), frete_num(p_dados->>'origem_lng'), frete_num(p_dados->>'destino_lat'), frete_num(p_dados->>'destino_lng'));
  else
    update frete_lancamentos set data = d, origem = btrim(coalesce(p_dados->>'origem', '')), destino = btrim(p_dados->>'destino'), valor = v, extras = ex,
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), caminhao = btrim(p_dados->>'caminhao'),
           origem_lat = frete_num(p_dados->>'origem_lat'), origem_lng = frete_num(p_dados->>'origem_lng'), destino_lat = frete_num(p_dados->>'destino_lat'), destino_lng = frete_num(p_dados->>'destino_lng'), updated_at = now()
     where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
    if not found then raise exception 'Este frete já foi enviado e não pode mais ser alterado.'; end if;
  end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_salvar(text, uuid, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
