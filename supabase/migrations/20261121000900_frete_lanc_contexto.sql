-- Luísa no App do Freteiro (21/11/2026): o servidor da conversa (Edge Function freteiro-assistente) lê a divergência
-- pelo token do freteiro. Só devolve o que ELE lançou e o tipo de divergência, nunca o valor do sistema.
create or replace function public.frete_lanc_contexto(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); l frete_lancamentos;
begin
  select * into l from frete_lancamentos where id = p_id and freteiro_id = f.id;
  if l.id is null then raise exception 'Frete não encontrado.'; end if;
  return jsonb_build_object('empresa_id', f.empresa_id, 'freteiro', f.nome, 'veiculo', f.veiculo_modelo, 'situacao', l.situacao,
    'lancamento', jsonb_build_object('data', l.data, 'origem', l.origem, 'destino', l.destino, 'valor', l.valor, 'extras', l.extras,
      'observacao', l.observacao, 'lancado_por_ele', l.origem_lanc = 'freteiro', 'divergencia', l.divergencia, 'explicacao_anterior', l.explicacao));
end $$;
grant execute on function public.frete_lanc_contexto(text, uuid) to anon, authenticated;
notify pgrst, 'reload schema';
