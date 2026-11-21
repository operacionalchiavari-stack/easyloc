-- Desconto por ocorrencia, com valor original preservado e cobranca liquida auditada.
begin;
do $migration$
declare fn regprocedure;def text;antigo text;novo text;
begin
 fn:=coalesce(to_regprocedure('public.fin_posicao_final_salvar_antes_fluxo(uuid,uuid,text,integer,jsonb,boolean)'),to_regprocedure('public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean)'));
 select pg_get_functiondef(fn) into def;
 if position('motivo_desconto' in def)>0 then return;end if;
 antigo:='credito_id uuid; receber_id uuid;';
 if position(antigo in def)=0 then raise exception 'Declaracao da posicao final diferente da esperada';end if;
 def:=replace(def,antigo,antigo||' desconto numeric; valor_liquido numeric; motivo_desconto text;');
 antigo:='  if decisao=''cobrar'' then cob:=cob+coalesce((x->>''valor'')::numeric,0); end if;';
 if position(antigo in def)=0 then raise exception 'Calculo da posicao final diferente do esperado';end if;
 novo:=$patch$  if d ? 'desconto' and jsonb_typeof(d->'desconto') is distinct from 'number' then raise exception 'Desconto invalido';end if;
  desconto:=coalesce((d->>'desconto')::numeric,0);motivo_desconto:=btrim(coalesce(d->>'motivo_desconto',''));
  if desconto::text in ('NaN','Infinity','-Infinity') or desconto<0 or desconto<>round(desconto,2) or desconto>coalesce((x->>'valor')::numeric,0) then raise exception 'Desconto deve estar entre zero e o valor da ocorrencia';end if;
  if desconto>0 and decisao<>'cobrar' then raise exception 'Desconto permitido apenas nas ocorrencias a cobrar';end if;
  if desconto>0 and motivo_desconto='' then raise exception 'Informe o motivo do desconto';end if;
  valor_liquido:=case when decisao='cobrar' then coalesce((x->>'valor')::numeric,0)-desconto else 0 end;
  if decisao='cobrar' then cob:=cob+valor_liquido;end if;
$patch$;
 def:=replace(def,antigo,novo);
 antigo:='jsonb_build_object(''decisao'',decisao,''justificativa'',motivo)';
 if position(antigo in def)=0 then raise exception 'Registro da posicao final diferente do esperado';end if;
 def:=replace(def,antigo,'jsonb_build_object(''decisao'',decisao,''justificativa'',motivo,''desconto'',desconto,''motivo_desconto'',motivo_desconto,''valor_cobrar'',valor_liquido)');
 execute def;
end $migration$;
notify pgrst,'reload schema';
commit;
