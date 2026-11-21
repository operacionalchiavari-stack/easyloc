-- Desistencia nao exige foto; avarias continuam exigindo evidencia.
do $$
declare definicao text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text)'::regprocedure) into definicao;
 if position('(p_etapa in (''entrega'',''coleta'') and a>0)' in definicao)>0 then return;end if;
 if position('(p_etapa=''entrega'' and (coalesce((x->>''voltou_antes'')::numeric,0)>0 or d>0 or a>0)) or(p_etapa=''coleta'' and a>0)' in definicao)=0 then raise exception 'Regra de foto diferente da esperada';end if;
 definicao:=replace(definicao,
  '(p_etapa=''entrega'' and (coalesce((x->>''voltou_antes'')::numeric,0)>0 or d>0 or a>0)) or(p_etapa=''coleta'' and a>0)',
  '(p_etapa in (''entrega'',''coleta'') and a>0)');
 execute definicao;
end $$;
