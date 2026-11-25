-- Mudou a antecedência no cadastro da personalização: o "Necessário em" das compras abertas acompanha (22/11/2026).
create or replace function public.personalizacao_antecedencia_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare pid uuid;
begin
  begin
    for pid in select distinct t.pedido_id from producao_itens t where t.empresa_id = new.empresa_id and not t.cancelado
                 and t.origem->>'personalizacao_id' = new.id::text loop
      perform cartela_compras_sincronizar(pid);
    end loop;
    perform producao_compras_sincronizar(new.empresa_id);
  exception when others then raise warning 'Antecedência da personalização: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists personalizacao_antecedencia on public.personalizacoes;
create trigger personalizacao_antecedencia after update of dias_antecedencia on public.personalizacoes
  for each row when (new.dias_antecedencia is distinct from old.dias_antecedencia) execute function public.personalizacao_antecedencia_mudou();
