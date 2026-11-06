-- Entregue inclui os danificados; desistencias reduzem a necessidade, sem duplicar retornos.
do $patch$
declare fonte text;antes text;depois text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text)'::regprocedure) into fonte;
 antes:='x:=x||jsonb_build_object(''entregue'',fica+d+a,''voltou_antes'',d+a);';
 depois:=$novo$
   if x->>'conferencia_versao'='2' then
    b:=logistica_confirmacao_base(p.id,'entrega');
    select (z->>'previsto')::numeric into estrito_previsto from jsonb_array_elements(b->'itens') z where z->>'chave'=x->>'chave';
    if estrito_previsto is null or fica+coalesce((x->>'retirado_lista')::numeric,0)>estrito_previsto or a>fica or d+coalesce((x->>'retirado_lista')::numeric,0)>estrito_previsto then raise exception 'Quantidades invalidas para a entrega';end if;
    x:=x||jsonb_build_object('entregue',fica,'voltou_antes',greatest(a,fica-greatest(0,estrito_previsto-d-coalesce((x->>'retirado_lista')::numeric,0))));
   else
    x:=x||jsonb_build_object('entregue',fica+d+a,'voltou_antes',d+a);
   end if;
$novo$;
 if position(antes in fonte)=0 then raise exception 'Conversao de entrega nao encontrada';end if;
 fonte:=replace(fonte,'declare p separacoes_pedidos;', 'declare estrito_previsto numeric;p separacoes_pedidos;');
 fonte:=replace(fonte,antes,depois);
 fonte:=replace(fonte,'coalesce((x->>''voltou_antes'')::numeric,0)>0) or', '(coalesce((x->>''voltou_antes'')::numeric,0)>0 or d>0 or a>0)) or');
 fonte:=replace(fonte,'''danificado'',v_entrega->''danificado'')', '''danificado'',v_entrega->''danificado'',''conferencia_versao'',v_entrega->''conferencia_versao'')');
 antes:='a:=coalesce((x->>case when t=''avaria'' then ''danificado'' else ''desistencia'' end)::numeric,0);';
 depois:=$saldo$
   a:=case when x->>'conferencia_versao'='2' and t='revisao'
    then greatest(0,coalesce((x->>'voltou_antes')::numeric,0)-coalesce((x->>'danificado')::numeric,0))
    else coalesce((x->>case when t='avaria' then 'danificado' else 'desistencia' end)::numeric,0) end;
$saldo$;
 if position(antes in fonte)=0 then raise exception 'Distribuicao do retorno nao encontrada';end if;
 fonte:=replace(fonte,antes,depois);
 execute fonte;
end $patch$;
