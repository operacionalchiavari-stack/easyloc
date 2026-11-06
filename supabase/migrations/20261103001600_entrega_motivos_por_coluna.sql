-- Motivos independentes para falta na entrega, dano e desistencia.
do $patch$
declare fonte text;antes text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text)'::regprocedure) into fonte;
 fonte:=replace(fonte,'declare estrito_previsto numeric;', 'declare motivo_tipo text;motivo_nome text;motivos_validos jsonb;exige_motivo boolean;estrito_previsto numeric;');
 antes:='if x->>''conferencia_versao''=''2'' then';
 if position(antes in fonte)=0 then raise exception 'Regra de entrega nao encontrada';end if;
 -- Validacao usa o previsto ja consultado e nao aceita motivos de outra empresa/etapa.
 antes:='x:=x||jsonb_build_object(''entregue'',fica,''voltou_antes''';
 if position(antes in fonte)=0 then raise exception 'Normalizacao de entrega nao encontrada';end if;
 fonte:=replace(fonte,antes,$novo$
    if x ? 'motivos' then
     if jsonb_typeof(x->'motivos') is distinct from 'object' then raise exception 'Motivos invalidos';end if;
     motivos_validos:='{}';
     foreach motivo_tipo in array array['entregue','danificado','desistencia'] loop
      exige_motivo:=case motivo_tipo when 'entregue' then fica+coalesce((x->>'retirado_lista')::numeric,0)<estrito_previsto or coalesce((x->>'retirado_lista')::numeric,0)>0 when 'danificado' then a>0 else d>0 end;
      if not exige_motivo then continue;end if;
      select nome into motivo_nome from logistica_motivos where id::text=x->'motivos'->motivo_tipo->>'id' and empresa_id=p.empresa_id and etapa='entrega' and ativo;
      if motivo_nome is null then raise exception 'Selecione o motivo de %',motivo_tipo;end if;
      motivos_validos:=motivos_validos||jsonb_build_object(motivo_tipo,jsonb_build_object('id',x->'motivos'->motivo_tipo->>'id','descricao',motivo_nome));
     end loop;
     x:=x||jsonb_build_object('motivos',motivos_validos);
    end if;
    x:=x||jsonb_build_object('entregue',fica,'voltou_antes'
$novo$);
 fonte:=replace(fonte,'''conferencia_versao'',v_entrega->''conferencia_versao'')', '''conferencia_versao'',v_entrega->''conferencia_versao'',''motivos'',coalesce(v_entrega->''motivos'',''{}''::jsonb))');
 execute fonte;
end $patch$;
