-- Dados de teste do módulo Comercial > Terceirizações (nov/2026). Marcados com observacoes = 'TESTE-TERCEIRIZACOES'.
-- Para apagar: rodar Scripts/remover-teste-terceirizacoes.sql
do $$
declare
  emp uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
  f1 uuid; f2 uuid; f3 uuid;
  foto_de text;
begin
  if exists (select 1 from fornecedores where empresa_id = emp and observacoes = 'TESTE-TERCEIRIZACOES') then
    raise exception 'Os dados de teste já existem. Rode o script de remoção antes de criar de novo.';
  end if;

  insert into fornecedores (empresa_id, nome_razao_social, nome_fantasia, documento, tipo, categoria, telefone, email, responsavel, cidade, estado, terceirizacao, observacoes)
  values (emp, 'Lounge Parceria Eventos Ltda', 'Lounge Parceria', '', 'servicos', 'Locação de móveis', '(24) 99811-2233', 'contato@loungeparceria.com.br', 'Marcela', 'Petrópolis', 'RJ', true, 'TESTE-TERCEIRIZACOES')
  returning id into f1;
  insert into fornecedores (empresa_id, nome_razao_social, nome_fantasia, documento, tipo, categoria, telefone, email, responsavel, cidade, estado, terceirizacao, observacoes)
  values (emp, 'Tendas e Coberturas Serra SA', 'Tendas Serra', '', 'servicos', 'Tendas e estruturas', '(24) 99722-4455', 'comercial@tendasserra.com.br', 'Rodrigo', 'Teresópolis', 'RJ', true, 'TESTE-TERCEIRIZACOES')
  returning id into f2;
  insert into fornecedores (empresa_id, nome_razao_social, nome_fantasia, documento, tipo, categoria, telefone, email, responsavel, cidade, estado, terceirizacao, observacoes)
  values (emp, 'Cadeiras Premium Locações ME', 'Cadeiras Premium', '', 'servicos', 'Cadeiras e mesas', '(21) 98633-7788', 'pedidos@cadeiraspremium.com.br', 'Juliana', 'Rio de Janeiro', 'RJ', true, 'TESTE-TERCEIRIZACOES')
  returning id into f3;

  -- foto: uma foto real do nosso acervo da mesma categoria (só para o teste ficar visual)
  create temporary table _fotos on commit drop as
    select lower(categoria) cat, foto_url from itens where empresa_id = emp and foto_url is not null and tipo = 'Item';

  insert into terceirizacao_itens (empresa_id, fornecedor_id, produto, descricao, categoria, material, cor, largura, altura, profundidade, codigo, quantidade, custo, valor_locacao, foto_url, observacoes)
  select emp, x.forn, x.produto, x.descricao, x.categoria, x.material, x.cor, x.l, x.a, x.p, x.codigo, x.qtd, x.custo, x.valor,
         (select f.foto_url from _fotos f where f.cat like x.busca order by md5(f.foto_url || x.codigo) limit 1), 'TESTE-TERCEIRIZACOES'
  from (values
    (f1, 'Sofá Veludo Rosé 3 lugares', 'Veludo rosé, pés dourados', 'Sofás', 'Veludo', 'Rosé', 2.20, 0.82, 0.90, 'LP-SOF01', 4, 220.00, 520.00, '%sof%'),
    (f1, 'Poltrona Concha Off White', 'Bouclé off white', 'Poltronas', 'Bouclé', 'Off white', 0.80, 0.78, 0.75, 'LP-POL02', 10, 90.00, 210.00, '%poltron%'),
    (f1, 'Mesa de Centro Travertino', 'Tampo em travertino natural', 'Mesas', 'Travertino', 'Bege', 1.10, 0.40, 0.60, 'LP-MES03', 5, 80.00, 190.00, '%mesa%'),
    (f1, 'Aparador Espelhado Champagne', 'Aparador com frente espelhada', 'Aparadores', 'MDF espelhado', 'Champagne', 1.60, 0.85, 0.45, 'LP-APA04', 3, 150.00, 360.00, '%aparador%'),
    (f2, 'Tenda Cristal 10x10', 'Tenda transparente com estrutura de alumínio', 'Tendas', 'Lona cristal', 'Transparente', 10.00, 4.50, 10.00, 'TS-TEN10', 2, 2800.00, 6200.00, '%bar%'),
    (f2, 'Tenda Branca 5x5', 'Tenda piramidal branca', 'Tendas', 'Lona', 'Branca', 5.00, 4.00, 5.00, 'TS-TEN05', 6, 650.00, 1450.00, '%bar%'),
    (f2, 'Piso Elevado Madeira (m²)', 'Piso modular de madeira, por metro quadrado', 'Pisos', 'Madeira', 'Natural', 1.00, 0.10, 1.00, 'TS-PIS01', 300, 18.00, 45.00, '%aparador%'),
    (f3, 'Cadeira Tiffany Dourada', 'Cadeira Tiffany com almofada', 'Cadeiras', 'Resina', 'Dourada', 0.40, 0.92, 0.42, 'CP-TIF01', 400, 6.50, 15.00, '%cadeira%'),
    (f3, 'Cadeira Crossback Madeira', 'Cadeira crossback em madeira escura', 'Cadeiras', 'Madeira', 'Tabaco', 0.47, 0.88, 0.50, 'CP-CRO02', 150, 9.00, 22.00, '%cadeira%'),
    (f3, 'Mesa Redonda 1,60 m (10 lugares)', 'Mesa redonda para 10 pessoas', 'Mesas', 'Madeira', 'Natural', 1.60, 0.76, 1.60, 'CP-MES10', 40, 35.00, 85.00, '%mesa%'),
    (f3, 'Banqueta Alta Ferro Preto', 'Banqueta alta para bistrô', 'Banquetas', 'Ferro', 'Preto', 0.40, 0.75, 0.40, 'CP-BAN03', 60, 8.00, 19.00, '%banqueta%')
  ) as x(forn, produto, descricao, categoria, material, cor, l, a, p, codigo, qtd, custo, valor, busca);
end $$;
select f.nome_fantasia, count(t.*) itens from fornecedores f left join terceirizacao_itens t on t.fornecedor_id = f.id
where f.observacoes = 'TESTE-TERCEIRIZACOES' group by 1 order by 1;

-- Fotos fictícias (logos) das empresas de teste, já enviadas ao bucket itens em <empresa>/fornecedores/<id>-ficticio.png.
update fornecedores set categoria = 'locacao_moveis',
  foto_path = empresa_id::text || '/fornecedores/' || id::text || '-ficticio.png',
  foto_url = 'https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/itens/' || empresa_id::text || '/fornecedores/' || id::text || '-ficticio.png'
where observacoes = 'TESTE-TERCEIRIZACOES';
