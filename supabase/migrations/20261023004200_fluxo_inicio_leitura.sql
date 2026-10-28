begin;
-- Leitores e dispositivos que chamam a RPC diretamente também transferem a responsabilidade.
do $migration$
declare fonte text;
begin
 select pg_get_functiondef('operacao_ler_peca(uuid,text,text,text)'::regprocedure) into fonte;
 fonte:=replace(fonte,'begin',E'begin\n  perform public.operacao_iniciar_conferencia(p_pedido,p_etapa);');
 execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
