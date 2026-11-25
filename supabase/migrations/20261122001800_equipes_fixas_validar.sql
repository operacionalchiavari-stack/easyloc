-- Confirma que a versão publicada do gerador recebeu todas as prioridades da equipe fixa.
do $$
declare src text:=pg_get_functiondef('public.operacao_escala_preencher_sem_fluxo(uuid,uuid[])'::regprocedure);
begin
 if position('equipe_fixa_prioridade' in src)=0
    or position('select funcionario_id into v_responsavel' in src)=0
    or position('ef.pessoa_tipo=''func''' in src)=0
    or position('ef.pessoa_tipo=''free''' in src)=0 then
  raise exception 'Integração das equipes fixas com a escala automática está incompleta.';
 end if;
end $$;
