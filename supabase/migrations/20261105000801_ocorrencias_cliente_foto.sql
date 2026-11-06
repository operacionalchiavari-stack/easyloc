-- A identidade do cliente acompanha o cabeçalho da conversa.
do $patch$
declare definicao text;
begin
 select pg_get_functiondef('public.separacao_ocorrencias_listar(uuid,uuid)'::regprocedure) into definicao;
 if position('''cliente_foto''' in definicao)>0 then return;end if;
 if position('''cliente'',p.cliente_nome' in definicao)=0 then raise exception 'Formato da consulta de ocorrências diferente do esperado';end if;
 execute replace(definicao,'''cliente'',p.cliente_nome',
  '''cliente'',p.cliente_nome,''cliente_foto'',(select c.catalogo_logo_url from clientes_empresas c where c.empresa_id=o.empresa_id and (case when nullif(to_jsonb(p)->>''cliente_id'','''') is not null then c.id::text=to_jsonb(p)->>''cliente_id'' else c.nome_razao=p.cliente_nome end) limit 1)');
end $patch$;
notify pgrst,'reload schema';
