-- Apaga os fretes de teste da Transportes Caminho Certo (Scripts/teste-fretes-caminho-certo.sql). O fornecedor fica.
set role postgres;
do $$
declare fid uuid; fech uuid[];
begin
  select id into fid from frete_freteiros where telefone = '24997770002' and motivo = 'TESTE-FRETES-20261123';
  if fid is null then raise notice 'Nada para apagar.'; return; end if;
  select array_agg(distinct fechamento_id) into fech from frete_relatorios where freteiro_id = fid and fechamento_id is not null;
  delete from fin_custos_evento where pagar_id in (select pagar_id from frete_lancamentos where freteiro_id = fid and pagar_id is not null);
  delete from fin_fechamento_linhas where fechamento_id = any(coalesce(fech, '{}'));
  update frete_lancamentos set pagar_id = null where freteiro_id = fid;
  delete from fin_pagar where origem = 'frete' and origem_id in (select id from frete_lancamentos where freteiro_id = fid);
  delete from frete_lancamentos where freteiro_id = fid;
  delete from frete_relatorios where freteiro_id = fid;
  delete from fin_fechamentos where id = any(coalesce(fech, '{}'));
  delete from frete_avulsos where freteiro_id = fid;
  delete from frete_anuncios where freteiro_id = fid;
  delete from app_sessoes where tipo = 'freteiro' and freteiro_id = fid;
  update frete_freteiros set caminhao_id = null where id = fid;
  delete from caminhoes where freteiro_id = fid;
  delete from frete_veiculos where freteiro_id = fid;
  delete from frete_freteiros where id = fid;
end $$;
reset role;
