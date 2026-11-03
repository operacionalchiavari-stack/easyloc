-- Mantém o histórico da produção, expondo o andamento da triagem para a fila.
do $patch$
declare definicao text;
begin
 select pg_get_functiondef('public.producao_quadro(uuid)'::regprocedure) into definicao;
 if position('triagem_status' in definicao)>0 then return; end if;
 if position('''status'',p.status_comercial' in definicao)=0 then
  raise exception 'Formato do quadro de produção diferente do esperado';
 end if;
 execute replace(definicao,'''status'',p.status_comercial','''status'',p.status_comercial,''triagem_status'',p.status');
end $patch$;
