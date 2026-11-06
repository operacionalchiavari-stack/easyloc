-- Histórico do acompanhamento com a foto de quem fez o contato: a lista passa a devolver o id (por_id).
create or replace function public.comercial_followup_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'config', comercial_followup_cfg(p_empresa),
    'acompanhamentos', coalesce((select jsonb_agg(jsonb_build_object('alvo_tipo', alvo_tipo, 'alvo_id', alvo_id, 'motivo', motivo,
        'observacao', observacao, 'proximo', proximo, 'por', criado_por_nome, 'por_id', criado_por, 'em', criado_em) order by criado_em)
      from comercial_followups where empresa_id = p_empresa), '[]'::jsonb),
    'encerrados', coalesce((select jsonb_agg(jsonb_build_object('alvo_tipo', alvo_tipo, 'alvo_id', alvo_id, 'motivo', motivo, 'por', por_nome, 'em', em))
      from comercial_followup_encerrados where empresa_id = p_empresa), '[]'::jsonb)
  );
end $$;
notify pgrst, 'reload schema';
