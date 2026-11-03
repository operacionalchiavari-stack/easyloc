-- A foto do cadastro acompanha o item na tabela de ocorrências.
do $patch$
declare definicao text;
begin
 select pg_get_functiondef('public.separacao_ocorrencias_listar(uuid,uuid)'::regprocedure) into definicao;
 if position('''item_foto''' in definicao)>0 then return;end if;
 if position('''codigo'',i.codigo' in definicao)=0 then raise exception 'Formato da consulta de ocorrências diferente do esperado';end if;
 execute replace(definicao,'''codigo'',i.codigo','''codigo'',i.codigo,''item_foto'',i.foto_url');
end $patch$;
