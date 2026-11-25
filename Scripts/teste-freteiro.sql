-- Freteiro de teste para o App do Freteiro (21/11/2026). Celular (24) 99777-0001, senha 123456.
-- Cria: freteiro aprovado (fornecedor e caminhão), 3 fretes feitos na semana passada (com check-in e check-out),
-- o relatório da semana passada já ENVIADO com divergências (valor diferente, frete que não existe, frete que ele não
-- lançou e um que confere) e 2 fretes lançados no período aberto (ainda não enviados).
-- Apagar: npx supabase db query --linked -f Scripts/remover-teste-freteiro.sql
set role postgres;
do $$
declare
  emp uuid := gs_empresa_dona(); adm uuid; fid uuid; tok text; ped uuid[]; ini date; i int;
  datas date[]; vals numeric[] := array[250, 320, 180];
begin
  select user_id into adm from usuarios_empresas where empresa_id = emp and lower(coalesce(role,'')) in ('admin','owner') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  insert into frete_freteiros (empresa_id, nome, telefone, senha_hash, chave_pix, veiculo_modelo, veiculo_placa, veiculo_tipo, capacidade_m3)
  values (emp, 'Carlos Freteiro (teste)', '24997770001', crypt('123456', gen_salt('bf')), 'carlos.teste@pix', 'Iveco Daily', 'TST1F23', 'Baú', 18)
  returning id into fid;
  perform frete_freteiro_status(emp, fid, 'aprovado', null);

  -- semana passada (período que fecha na sexta 20/11)
  select p.ini into ini from frete_periodo(emp, current_date - 7) p;
  datas := array[ini + 2, ini + 4, ini + 5];
  select array_agg(id) into ped from (
    select sp.id from separacoes_pedidos sp
     where sp.empresa_id = emp and sp.status_comercial in ('aprovado','enviado','finalizado') and coalesce(sp.status,'') <> 'cancelado'
       and not exists (select 1 from frete_anuncios a where a.pedido_id = sp.id and a.direcao = 'entrega' and a.status <> 'cancelado')
     order by sp.data_evento desc nulls last limit 3) x;
  if coalesce(array_length(ped, 1), 0) < 3 then raise exception 'Faltam pedidos para os fretes de teste.'; end if;

  for i in 1..3 loop
    insert into frete_anuncios (empresa_id, pedido_id, direcao, data, hora, ponto_encontro, destino, km, m3, valor, status, freteiro_id,
                                aceito_em, checkin_em, checkout_em)
    select emp, ped[i], 'entrega', datas[i], time '08:00', 'Galpão', coalesce(nullif(sp.local_nome, ''), 'Local do evento'), 25, 6, vals[i], 'aceito', fid,
           datas[i] - 2 + time '10:00', datas[i] + time '08:05', datas[i] + time '11:40'
      from separacoes_pedidos sp where sp.id = ped[i];
  end loop;

  tok := (select frete_nova_sessao(f) ->> 'token' from frete_freteiros f where f.id = fid);
  -- lançamentos da semana passada: 1º confere; 2º valor diferente; um frete que não existe; o 3º não lançou
  perform frete_lanc_salvar(tok, null, jsonb_build_object('data', datas[1], 'origem', 'Galpão', 'destino', 'Evento do dia ' || to_char(datas[1], 'DD/MM'), 'valor', 250, 'extras', '[]'::jsonb));
  perform frete_lanc_salvar(tok, null, jsonb_build_object('data', datas[2], 'origem', 'Galpão', 'destino', 'Evento do dia ' || to_char(datas[2], 'DD/MM'), 'valor', 320,
          'extras', jsonb_build_array(jsonb_build_object('motivo', 'Espera de 2 horas', 'valor', 60)), 'observacao', 'Esperei liberar a doca do salão.'));
  perform frete_lanc_salvar(tok, null, jsonb_build_object('data', ini + 3, 'origem', 'Galpão', 'destino', 'Salão Jardim (retirada extra)', 'valor', 150, 'extras', '[]'::jsonb));
  perform frete_lanc_enviar(tok);

  -- período aberto (esta semana): dois fretes lançados, ainda não enviados
  perform frete_lanc_salvar(tok, null, jsonb_build_object('data', current_date, 'origem', 'Galpão', 'destino', 'Espaço Serra Verde', 'valor', 280,
          'extras', jsonb_build_array(jsonb_build_object('motivo', 'Pedágio', 'valor', 18.5)), 'observacao', ''));
  perform frete_lanc_salvar(tok, null, jsonb_build_object('data', current_date, 'origem', 'Espaço Serra Verde', 'destino', 'Galpão', 'valor', 280, 'extras', '[]'::jsonb));

end $$;
