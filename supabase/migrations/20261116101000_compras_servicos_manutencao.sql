-- Compras > Serviços igual às Solicitações de compra (16/11/2026, pedido do usuário): cada solicitação de manutenção
-- da empresa (manutencao_predial_solicitacoes) vira uma necessidade de Compras (origem 'manutencao', unidade SV,
-- quantidade 1) que se seleciona na lista e vai para cotação junto com as outras. A necessidade acompanha a
-- solicitação: concluída, cancelada ou feita pela equipe interna cancela a necessidade enquanto ela não foi comprada.

create or replace function public.compras_manutencao_sincronizar(s public.manutencao_predial_solicitacoes) returns void
language plpgsql security definer set search_path to 'public' as $$
declare n public.compras_registros; prox bigint; aberta boolean;
begin
  aberta := s.status not in ('concluida', 'cancelada') and coalesce(s.execucao_tipo, 'externa') <> 'interna';
  select * into n from public.compras_registros
   where empresa_id = s.empresa_id and tipo = 'necessidade' and dados->>'predial_id' = s.id::text
   order by created_at desc limit 1;
  if n.id is null then
    if not aberta then return; end if;
    select coalesce(max(numero), 0) + 1 into prox from public.compras_registros where empresa_id = s.empresa_id and tipo = 'necessidade';
    insert into public.compras_registros(empresa_id, tipo, numero, status, dados, criado_por)
    values (s.empresa_id, 'necessidade', prox, 'pendente', jsonb_build_object(
      'origem', 'manutencao', 'predial_id', s.id, 'predial_numero', s.numero,
      'material_nome', '#' || s.numero || ' · ' || s.titulo, 'descricao_item', s.titulo,
      'unidade', 'SV', 'quantidade', 1, 'quantidade_faltante', 1, 'quantidade_comprada', 0,
      'local', s.local, 'prioridade', s.prioridade, 'categoria', s.categoria, 'observacao', s.descricao,
      'data_necessidade', s.necessario_ate, 'solicitante_nome', s.solicitante_nome,
      'evidencias', coalesce(s.evidencias, '[]'::jsonb), 'pcp_status', 'published'), s.criado_por);
    return;
  end if;
  if aberta then
    -- ainda não cotada: acompanha título, local, prioridade e prazo
    if n.status in ('pendente', 'aguardando_vinculo', 'cancelada') then
      update public.compras_registros set status = 'pendente', updated_at = now(),
        dados = dados || jsonb_build_object('material_nome', '#' || s.numero || ' · ' || s.titulo, 'descricao_item', s.titulo,
          'local', s.local, 'prioridade', s.prioridade, 'observacao', s.descricao, 'data_necessidade', s.necessario_ate,
          'evidencias', coalesce(s.evidencias, '[]'::jsonb), 'motivo_cancelamento', null)
       where id = n.id;
    end if;
  elsif n.status in ('pendente', 'aguardando_vinculo', 'aguardando_aprovacao') then
    update public.compras_registros set status = 'cancelada', updated_at = now(),
      dados = dados || jsonb_build_object('motivo_cancelamento',
        case when s.status = 'concluida' then 'Manutenção concluída' when s.status = 'cancelada' then 'Manutenção cancelada'
             else 'Feita pela equipe interna' end)
     where id = n.id;
  end if;
end $$;
revoke all on function public.compras_manutencao_sincronizar(public.manutencao_predial_solicitacoes) from public, anon, authenticated;

create or replace function public.compras_manutencao_gatilho() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.compras_manutencao_sincronizar(new);
  return null;
exception when others then raise warning 'manutenção -> compras: %', sqlerrm; return null;
end $$;
drop trigger if exists compras_manutencao_gatilho on public.manutencao_predial_solicitacoes;
create trigger compras_manutencao_gatilho after insert or update on public.manutencao_predial_solicitacoes
  for each row execute function public.compras_manutencao_gatilho();

-- as que já estão em aberto
do $$ declare s public.manutencao_predial_solicitacoes; begin
  for s in select * from public.manutencao_predial_solicitacoes loop perform public.compras_manutencao_sincronizar(s); end loop;
end $$;
