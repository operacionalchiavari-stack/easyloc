begin;
-- Quem acompanha o quadro pode consultar a resolução; a escrita mantém as permissões anteriores.
create policy ocorrencias_expedicao_leitura on public.operacao_ocorrencias for select to authenticated
using(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','select'));
notify pgrst,'reload schema';
commit;
