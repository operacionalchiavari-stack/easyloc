-- Parcela paga não pode ser alterada (30/out/2026): com recebimento na conta a receber (conciliação, caixa ou link do
-- pedido), o valor, o vencimento e a posição da parcela ficam como estão. A tela do pedido já trava; aqui é a garantia.
-- A ligação é a posição da parcela dentro da divisão (mesma regra de fin_sincronizar_pedido). Pedido antigo, sem divisão
-- nas parcelas, não tem como conferir e continua como antes.
create or replace function public.pedido_conferir_parcelas_pagas(p_pedido uuid, pp jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare t record; v_lista jsonb := pp->'observacoes'->'parcelas_financeiras'; v_parc jsonb;
begin
  if coalesce(jsonb_typeof(v_lista), '') <> 'array' then return; end if;
  if not exists (select 1 from jsonb_array_elements(v_lista) x where x->>'componente' in ('locacao','frete','montagem')) then return; end if;
  for t in select * from fin_receber where pedido_id = p_pedido and origem = 'pedido' and status <> 'cancelado' and recebido > 0 and componente in ('locacao','frete','montagem') loop
    select x into v_parc from (
      select x, row_number() over (order by ord) n
        from jsonb_array_elements(v_lista) with ordinality a(x, ord)
       where coalesce(nullif(x->>'componente', ''), 'locacao') = t.componente and coalesce(nullif(x->>'valor', '')::numeric, 0) > 0) q
     where n = t.parcela;
    if v_parc is null
       or abs(coalesce(nullif(v_parc->>'valor', '')::numeric, 0) - t.valor) > 0.01
       or left(coalesce(v_parc->>'vencimento', ''), 10) is distinct from t.vencimento::text then
      raise exception 'A parcela % de % já tem recebimento e não pode ser alterada. Recarregue o pedido',
        t.parcela, case t.componente when 'locacao' then 'Locação' when 'frete' then 'Frete' else 'Montagem' end;
    end if;
  end loop;
end $$;
revoke all on function public.pedido_conferir_parcelas_pagas(uuid, jsonb) from public, anon, authenticated;

do $$
declare d text;
begin
  select pg_get_functiondef('public.pedido_salvar_integrado'::regproc) into d;
  if position('pedido_conferir_parcelas_pagas' in d) = 0 then
    d := replace(d, ' if trava then return pedido_salvar_sem_itens(p, pp, p_itens, p_revisao); end if;',
                    E' if p_id is not null then perform pedido_conferir_parcelas_pagas(p_id, pp); end if;\n if trava then return pedido_salvar_sem_itens(p, pp, p_itens, p_revisao); end if;');
    execute d;
  end if;
  if position('pedido_conferir_parcelas_pagas' in pg_get_functiondef('public.pedido_salvar_integrado'::regproc)) = 0 then raise exception 'pedido_salvar_integrado não foi alterada'; end if;
end $$;
