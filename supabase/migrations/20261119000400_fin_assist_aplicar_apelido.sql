-- fin_assist_aplicar (19/11/2026): a versão dos cartões (20261114000500) declarou a variável "e fin_extrato%rowtype", que
-- colide com o apelido "e" da contagem de pendentes no fim da função ("column reference e.lote_id is ambiguous"):
-- confirmar uma sugestão da conciliação bancária falhava. Troca o apelido por x.
do $$
declare d text;
begin
  select pg_get_functiondef('public.fin_assist_aplicar'::regproc) into d;
  if position('from fin_extrato x where x.lote_id = v_lote and fin_extrato_pendente(x)' in d) > 0 then return; end if;
  d := replace(d, 'from fin_extrato e where e.lote_id = v_lote and fin_extrato_pendente(e)', 'from fin_extrato x where x.lote_id = v_lote and fin_extrato_pendente(x)');
  if position('fin_extrato_pendente(x)' in d) = 0 then raise exception 'Trecho não encontrado'; end if;
  execute d;
end $$;
