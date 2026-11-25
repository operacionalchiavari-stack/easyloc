-- Financeiro › Fechamentos (23/11/2026, pedido do usuário): as divergências de frete aparecem dentro do parceiro; cada item leva o fornecedor.
create or replace function public.divergencias_acompanhar(p_empresa uuid,p_origens text[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d jsonb; pode boolean;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  pode:=coalesce(operacao_pode(p_empresa,'logistica.planejamento.visualizar'),false)
    or (p_origens && array['frete','uber'] and coalesce(operacao_pode(p_empresa,'financeiro.fluxo.visualizar'),false))
    or (p_origens && array['free'] and coalesce(operacao_pode(p_empresa,'rh.colaboradores.visualizar'),false));
  if not pode then raise exception 'Sem permissão' using errcode='42501';end if;
  d:=logistica_divergencias_dados(p_empresa);
  -- cada divergência de frete leva o fornecedor (parceiro do Financeiro) do freteiro
  d:=jsonb_build_object('abertas',coalesce((select jsonb_agg(x||jsonb_build_object('fornecedor_id',(select fr.fornecedor_id from frete_lancamentos l join frete_freteiros fr on fr.id=l.freteiro_id where l.id::text=x->>'referencia' or l.id::text=x->'registro'->>'id' limit 1))) from jsonb_array_elements(d->'abertas') x),'[]'::jsonb),
    'resolvidas',coalesce((select jsonb_agg(x||jsonb_build_object('fornecedor_id',(select fr.fornecedor_id from frete_lancamentos l join frete_freteiros fr on fr.id=l.freteiro_id where l.id::text=x->'registro'->>'id' limit 1))) from jsonb_array_elements(d->'resolvidas') x),'[]'::jsonb));
  return jsonb_build_object(
    'abertas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'abertas') x where x->>'origem'=any(p_origens)),'[]'::jsonb),
    'resolvidas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'resolvidas') x where x->>'origem'=any(p_origens)),'[]'::jsonb),
    'relatorios',case when 'frete'=any(p_origens) then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'freteiro',f.nome,'fornecedor_id',f.fornecedor_id,'periodo_ini',r.periodo_ini,
        'periodo_fim',r.periodo_fim,'status',r.status,'enviado_em',r.enviado_em,'total',r.total_informado) order by r.enviado_em desc)
      from frete_relatorios r left join frete_freteiros f on f.id=r.freteiro_id
      where r.empresa_id=p_empresa and r.status='enviado'),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.divergencias_acompanhar(uuid,text[]) from public,anon;
grant execute on function public.divergencias_acompanhar(uuid,text[]) to authenticated;
notify pgrst,'reload schema';
