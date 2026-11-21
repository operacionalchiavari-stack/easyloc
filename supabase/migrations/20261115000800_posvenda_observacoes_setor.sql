-- Pós-venda (15/11/2026): na ligação, a aba Observação tem, além da observação geral, uma observação para a Triagem,
-- o Carregamento e a Montagem (o que o cliente comentou de cada setor). Gravada logo depois de registrar a ligação.

alter table public.posvenda_contatos add column if not exists observacoes_setor jsonb not null default '{}'::jsonb;

create or replace function public.posvenda_observacoes_setor(p_empresa uuid, p_contato uuid, p_obs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare novo jsonb := '{}'::jsonb; k text; v text;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from posvenda_contatos where id = p_contato and empresa_id = p_empresa and status = 'concluido') then
    raise exception 'Ligação não encontrada ou ainda não registrada.';
  end if;
  foreach k in array array['triagem', 'carregamento', 'montagem'] loop
    v := btrim(coalesce(p_obs->>k, ''));
    if length(v) > 2000 then raise exception 'Observação muito longa (máximo de 2.000 letras).'; end if;
    if v <> '' then novo := novo || jsonb_build_object(k, v); end if;
  end loop;
  update posvenda_contatos set observacoes_setor = novo where id = p_contato;
  return novo;
end $$;
revoke all on function public.posvenda_observacoes_setor(uuid, uuid, jsonb) from public, anon;
grant execute on function public.posvenda_observacoes_setor(uuid, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
