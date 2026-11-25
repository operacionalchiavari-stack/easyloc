-- Fretes de teste da "Transportes Caminho Certo" (23/11/2026, pedido do usuário: ver no Financeiro e na Logística como ficam
-- fretes que bateram e que não bateram). Cria um freteiro ligado ao fornecedor Transportes Caminho Certo (celular 24997770002,
-- senha 123456) e:
--  * semana 07/11 a 13/11: 4 fretes, relatório enviado e tudo conferido -> já foi para o fechamento/contas a pagar;
--  * semana 14/11 a 20/11: 6 fretes do sistema; o relatório enviado tem 3 que bateram, 2 com valor diferente, 1 que ele não
--    lançou e 1 frete cobrado que não existe no sistema -> divergências na Logística;
--  * semana aberta: 1 frete feito ainda sem relatório, 1 agendado e 1 frete avulso.
-- Apagar: npx supabase db query --linked -f Scripts/remover-teste-fretes-caminho-certo.sql
set role postgres;
do $$
declare
  emp uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
  forn uuid := 'def023c9-ed14-4f1f-a473-0ff0cb530fb8';
  adm uuid; fid uuid; cam uuid; rel uuid; an uuid; i int; p record;
  cam_nome text := 'Mercedes Accelo · TCC4B56';
  -- semana A (todas batem)
  a_num text[] := array['5','6','7','8']; a_dia date[] := array['2026-11-07','2026-11-09','2026-11-11','2026-11-13']::date[]; a_val numeric[] := array[280,310,260,340];
  -- semana B: valor do sistema e valor cobrado (null = não lançou)
  b_num text[] := array['9','10','11','12','2','13']; b_dia date[] := array['2026-11-14','2026-11-15','2026-11-17','2026-11-18','2026-11-19','2026-11-20']::date[];
  b_sis numeric[] := array[300,290,320,270,350,310]; b_cob numeric[] := array[300,290,320,330,320,null];
begin
  if exists (select 1 from frete_freteiros where telefone = '24997770002') then raise exception 'Os fretes de teste já existem.'; end if;
  select user_id into adm from usuarios_empresas where empresa_id = emp and lower(coalesce(role,'')) in ('admin','owner') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update fornecedores set fechamento_mensal = true, fechamento_periodo = 'semanal', fechamento_dia_semana = 5 where id = forn;

  insert into frete_freteiros (empresa_id, nome, telefone, senha_hash, chave_pix, veiculo_modelo, veiculo_placa, veiculo_tipo, capacidade_m3, status, motivo, avaliado_em, fornecedor_id)
  values (emp, 'Transportes Caminho Certo', '24997770002', extensions.crypt('123456', extensions.gen_salt('bf')), 'caminhocerto@pix', 'Mercedes Accelo', 'TCC4B56', 'Baú', 30,
          'aprovado', 'TESTE-FRETES-20261123', now(), forn)
  returning id into fid;
  insert into caminhoes (empresa_id, modelo, placa, tipo, capacidade_m3, codigo, fornecedor_id, freteiro_id, empresa_nome, status)
  values (emp, 'Mercedes Accelo', 'TCC4B56', 'terceirizado', 30, 'TCC1', forn, fid, 'Transportes Caminho Certo', 'ativo') returning id into cam;
  update frete_freteiros set caminhao_id = cam where id = fid;

  -- ---------- semana A: relatório enviado, tudo conferido
  insert into frete_relatorios (empresa_id, freteiro_id, periodo_ini, periodo_fim, enviado_em) values (emp, fid, '2026-11-07', '2026-11-13', '2026-11-13 18:00-03') returning id into rel;
  for i in 1..4 loop
    select * into p from separacoes_pedidos where empresa_id = emp and numero_pedido = a_num[i] limit 1;
    insert into frete_anuncios (empresa_id, pedido_id, direcao, data, hora, ponto_encontro, destino, km, m3, valor, status, freteiro_id, aceito_em, checkin_em, checkout_em)
    values (emp, p.id, case when i % 2 = 0 then 'coleta' else 'entrega' end, a_dia[i], time '08:00', 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), 30, 10, a_val[i], 'aceito', fid,
            a_dia[i] - 2 + time '10:00', a_dia[i] + time '07:55', a_dia[i] + time '11:30') returning id into an;
    insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, data, origem, destino, valor, caminhao, anuncio_id, valor_sistema, valor_final, situacao, pedido_id, direcao)
    values (emp, fid, rel, a_dia[i], 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), a_val[i], cam_nome, an, a_val[i], a_val[i], 'ok', p.id, case when i % 2 = 0 then 'coleta' else 'entrega' end);
  end loop;
  update frete_relatorios set total_informado = (select sum(valor) from frete_lancamentos where relatorio_id = rel) where id = rel;
  perform frete_relatorio_finalizar(rel);

  -- ---------- semana B: relatório enviado com divergências
  insert into frete_relatorios (empresa_id, freteiro_id, periodo_ini, periodo_fim, enviado_em) values (emp, fid, '2026-11-14', '2026-11-20', '2026-11-20 19:10-03') returning id into rel;
  for i in 1..6 loop
    select * into p from separacoes_pedidos where empresa_id = emp and numero_pedido = b_num[i] limit 1;
    insert into frete_anuncios (empresa_id, pedido_id, direcao, data, hora, ponto_encontro, destino, km, m3, valor, status, freteiro_id, aceito_em, checkin_em, checkout_em)
    values (emp, p.id, case when i in (2,5) then 'coleta' else 'entrega' end, b_dia[i], time '08:00', 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), 30, 10, b_sis[i], 'aceito', fid,
            b_dia[i] - 2 + time '10:00', b_dia[i] + time '08:10', b_dia[i] + time '12:00') returning id into an;
    if b_cob[i] is null then
      insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, origem_lanc, data, origem, destino, valor, anuncio_id, valor_sistema, situacao, divergencia, pedido_id, direcao)
      values (emp, fid, rel, 'sistema', b_dia[i], 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), 0, an, b_sis[i], 'divergente', 'nao_lancado', p.id, 'entrega');
    else
      insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, data, origem, destino, valor, caminhao, anuncio_id, valor_sistema, valor_final, situacao, divergencia, pedido_id, direcao, explicacao, explicacao_em)
      values (emp, fid, rel, b_dia[i], 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), b_cob[i], cam_nome, an, b_sis[i],
              case when b_cob[i] = b_sis[i] then b_cob[i] end,
              case when b_cob[i] = b_sis[i] then 'ok' else 'divergente' end,
              case when b_cob[i] = b_sis[i] then null else 'valor' end, p.id, case when i in (2,5) then 'coleta' else 'entrega' end,
              case when i = 4 then 'O local pediu para descarregar pela porta dos fundos, precisei de mais uma hora e um ajudante a mais.' end,
              case when i = 4 then now() end);
    end if;
  end loop;
  -- frete cobrado que não existe no sistema
  insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, data, origem, destino, valor, caminhao, situacao, divergencia, observacao)
  values (emp, fid, rel, '2026-11-16', 'Galpão', 'Salão Bela Vista (retirada extra)', 190, cam_nome, 'divergente', 'sem_frete', 'Retirada de mesas que ficaram no salão');
  update frete_relatorios set total_informado = (select sum(valor) from frete_lancamentos where relatorio_id = rel and origem_lanc = 'freteiro') where id = rel;

  -- ---------- semana aberta (21/11 a 27/11)
  select * into p from separacoes_pedidos where empresa_id = emp and numero_pedido = '14' limit 1;
  insert into frete_anuncios (empresa_id, pedido_id, direcao, data, hora, ponto_encontro, destino, km, m3, valor, status, freteiro_id, aceito_em, checkin_em, checkout_em)
  values (emp, p.id, 'entrega', '2026-11-21', time '08:00', 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), 30, 10, 300, 'aceito', fid,
          '2026-11-19 10:00-03', '2026-11-21 08:05-03', '2026-11-21 11:50-03');
  select * into p from separacoes_pedidos where empresa_id = emp and numero_pedido = '31' limit 1;
  insert into frete_anuncios (empresa_id, pedido_id, direcao, data, hora, ponto_encontro, destino, km, m3, valor, status, freteiro_id, aceito_em)
  values (emp, p.id, 'entrega', '2026-11-27', time '07:30', 'Galpão', coalesce(nullif(p.local_nome,''),'Local do evento'), 30, 10, 330, 'aceito', fid, now());
  insert into frete_avulsos (empresa_id, freteiro_id, data, origem, destino, motivo, valor, criado_por, criado_por_nome)
  values (emp, fid, '2026-11-25', 'Galpão', 'Marcenaria Irmãos Lopes', 'Levar 2 aparadores para conserto', 150, adm, 'Teste');
end $$;
reset role;
