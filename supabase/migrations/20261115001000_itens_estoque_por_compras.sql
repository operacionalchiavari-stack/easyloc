-- Quantidade em estoque dos itens de locação (15/11/2026).
-- Regra pedida: na implantação a quantidade sobe pela importação; depois disso o abastecimento é feito por Compras.
-- Quem pode mudar itens.estoque_total:
--   * Compras: compras_registrar_entrada (registrar compra já recebida) e compras_receber_locacao (recebimento no Almoxarifado);
--   * Gestão do acervo: inventário aprovado, perda confirmada e movimentações (funções do banco);
--   * Importação de implantação: na criação do item, ou pela função itens_estoque_implantacao abaixo.
-- Todas essas rodam como o dono do banco (security definer). Uma alteração feita direto pela tela (usuário logado)
-- é recusada pelo gatilho: a página do item não edita mais a quantidade.

create or replace function public.itens_estoque_protegido()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.estoque_total is distinct from old.estoque_total and current_user in ('authenticated', 'anon') then
    raise exception 'A quantidade em estoque só muda por Compras (recebimento), pelo inventário da Gestão do acervo ou pela importação de implantação.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists itens_estoque_protegido on public.itens;
create trigger itens_estoque_protegido before update of estoque_total on public.itens
  for each row execute function public.itens_estoque_protegido();

-- Importação de implantação: grava a quantidade dos itens que já existem (a criação já leva a quantidade).
-- p_itens = [{ "id": "<uuid>", "quantidade": 12 }, ...]. Kits ficam de fora (o estoque de um kit vem das peças).
create or replace function public.itens_estoque_implantacao(p_empresa uuid, p_itens jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare x jsonb; q numeric; n integer := 0;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'estoque.importacao.executar') then
    raise exception 'Sem permissão para importar a quantidade em estoque' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Lista de itens inválida'; end if;
  for x in select value from jsonb_array_elements(p_itens) loop
    q := nullif(x->>'quantidade', '')::numeric;
    if q is null or q < 0 or q <> trunc(q) or q > 100000000 then
      raise exception 'Quantidade inválida para o item %: use um número inteiro a partir de 0', x->>'id';
    end if;
    update itens set estoque_total = q
     where id = (x->>'id')::uuid and empresa_id = p_empresa and lower(coalesce(tipo, '')) <> 'kit'
       and estoque_total is distinct from q;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.itens_estoque_implantacao(uuid, jsonb) from public, anon;
grant execute on function public.itens_estoque_implantacao(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
