begin;
do $migration$
declare fonte text;
begin
 select pg_get_functiondef('public.manutencao_predial_operar(uuid,text,jsonb)'::regprocedure) into fonte;
 fonte:=replace(fonte,
 'gestor:=funcionario_pode(p_empresa,auth.uid(),''geral.manutencao.editar'');',
 'gestor:=funcionario_pode(p_empresa,auth.uid(),''geral.manutencao.editar'') or funcionario_tabela_permitida(p_empresa,''almoxarifado_compras'',''update'');');
 execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
