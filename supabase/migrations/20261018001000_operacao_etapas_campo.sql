create or replace function public.operacao_validar_campo(p_id_etapa text)
returns void language plpgsql security definer set search_path=public as $$
declare etapa jsonb;p public.separacoes_pedidos;m record;a text;
begin
  select valores into etapa from public.gs_linhas where planilha_id='14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and aba='Cronograma' and valores->>0=p_id_etapa limit 1;
  if etapa is null then raise exception 'Etapa não encontrada'; end if;
  if coalesce(etapa->>17,'')='' then return; end if; -- pedidos históricos da planilha
  select * into strict p from public.separacoes_pedidos where id=(etapa->>17)::uuid;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') or p.encerrado_operacional_em is not null then raise exception 'Pedido não está liberado para execução'; end if;
  if p.operacao->'carregamento'->>'concluido_em' is null then raise exception 'Conclua o carregamento antes de iniciar a montagem ou desmontagem'; end if;
  if lower(etapa->>5)='desmontagem' then
    for m in select valores from public.gs_linhas where planilha_id='14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and aba='Cronograma' and valores->>17=p.id::text and lower(valores->>5)='montagem' loop
      foreach a in array array['EquipeTerceirizada','Montagem_Sacolas','Montagem_Posicionamento','Montagem_ListaAssinada'] loop
        if not exists(select 1 from public.gs_linhas r where r.planilha_id='14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and r.aba=a and r.linha>1 and r.valores->>1=m.valores->>0) then
          raise exception 'Finalize os registros obrigatórios da montagem antes da desmontagem';
        end if;
      end loop;
    end loop;
  end if;
end $$;
revoke all on function public.operacao_validar_campo(text) from public,anon,authenticated;
grant execute on function public.operacao_validar_campo(text) to service_role;
