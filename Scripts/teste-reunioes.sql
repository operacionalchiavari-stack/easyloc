-- Reuniões de exemplo (11/11/2026), para ver a tela Geral › Reuniões com dados.
-- Pessoas: Jonatan (dono) + os colaboradores fictícios do lote TESTE-RH-20261103.
-- As gravações são só a transcrição (sem áudio de verdade: "Ouvir" não toca).
-- Apagar: npx supabase db query --linked -f Scripts/remover-teste-reunioes.sql
create or replace function pg_temp.rn(p_titulo text, p_tipo text, p_inicio timestamptz, p_dur int, p_local text, p_vis text, p_status text,
  p_org uuid, p_orgnome text, p_pauta text, p_ata jsonb default null, p_ata_status text default null, p_serie uuid default null, p_cancel text default null, p_link text default null, p_notas text default null)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into reunioes(empresa_id, titulo, tipo, inicio, duracao_min, local, link, visibilidade, status, organizador_id, organizador_nome, pauta, ata, ata_status,
    ata_gerada_em, ata_aprovada_em, ata_aprovada_por, ata_aprovada_por_nome, serie_id, cancelado_motivo, notas, criado_em)
  values ('bb1260f0-99cd-4d17-ab9b-23c299b4c50b', p_titulo, p_tipo, p_inicio, p_dur, p_local, p_link, p_vis, p_status, p_org, p_orgnome, p_pauta, p_ata, p_ata_status,
    case when p_ata is not null then p_inicio + make_interval(mins => p_dur + 15) end,
    case when p_ata_status = 'aprovada' then p_inicio + interval '1 day' end,
    case when p_ata_status = 'aprovada' then p_org end,
    case when p_ata_status = 'aprovada' then p_orgnome end,
    p_serie, p_cancel, p_notas, least(now(), p_inicio - interval '3 days'))
  returning id into v;
  insert into sistema_demo_lotes(id, empresa_id, manifesto) values ('TESTE-REUNIOES-20261111', 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b', jsonb_build_object('reunioes', jsonb_build_array(v)))
  on conflict (id) do update set manifesto = jsonb_set(sistema_demo_lotes.manifesto, '{reunioes}', (sistema_demo_lotes.manifesto->'reunioes') || to_jsonb(v));
  return v;
end $f$;

create or replace function pg_temp.rp(p_r uuid, p_f uuid, p_nome text, p_resp text, p_pres boolean default null, p_email text default null)
returns void language sql as $f$
  insert into reuniao_participantes(reuniao_id, empresa_id, funcionario_id, nome, email, externo, resposta, respondido_em, presente)
  values (p_r, 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b', p_f, p_nome, p_email, p_f is null, p_resp, case when p_resp <> 'pendente' then now() end, p_pres);
$f$;

create or replace function pg_temp.rt(p_r uuid, p_desc text, p_f uuid, p_nome text, p_prazo date, p_ok boolean default false)
returns void language sql as $f$
  insert into reuniao_tarefas(reuniao_id, empresa_id, descricao, responsavel_id, responsavel_nome, prazo, concluida, concluida_em, origem)
  values (p_r, 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b', p_desc, p_f, p_nome, p_prazo, p_ok, case when p_ok then now() end, 'ia');
$f$;

create or replace function pg_temp.rparte(p_r uuid, p_ordem int, p_seg int, p_trans jsonb)
returns void language sql as $f$
  insert into reuniao_partes(reuniao_id, empresa_id, ordem, path, tipo, segundos, tamanho, transcricao, transcrita_em, vozes_reconhecidas)
  values (p_r, 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b', p_ordem, 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b/exemplo/' || p_r || '-parte-' || p_ordem || '.webm', 'audio/webm', p_seg, p_seg * 4000, p_trans, now(), 0);
$f$;

do $$
declare
  jo uuid := '02dd55da-3e30-4a96-8743-04f33b21a954';
  ju uuid := '4f31a633-c299-4636-982b-6ba84d5226b3'; ma uuid := '38a685cd-2a7a-4567-a7b2-ef17464fdebd'; rc uuid := 'e203a0a8-cfc8-4b8a-8864-75efe2e4890b';
  lf uuid := '9052ecbd-43de-4fb3-add6-adce979668c5'; pg uuid := '2e3df9f9-b32e-41a1-9e16-2f0d3fad089c';
  bc uuid := '8aec0db4-d7f5-490c-ba70-6168a2eaf3e1'; vd uuid := '0422ef58-d3b2-4684-85e9-5a438da00744'; et uuid := '93289b96-23f7-43b9-abd6-8790ca9c7531';
  dm uuid := '58e91a50-c04c-47cd-b1e8-cb854fe5961d'; cr uuid := '53eb87ee-8792-4fa4-b8ab-c7979031792a';
  gs uuid := 'a876e068-f3d5-43e2-9a77-21eb64e7c65b'; fl uuid := '18e21109-f2e0-4292-aced-c39f2bf952c9';
  bca uuid := 'e1029b1d-6877-4597-a441-918013314240'; rm uuid := 'd6c5da26-efd1-45fa-a306-72ea81a77003';
  rs uuid := '07ba0787-b058-4f6a-84d5-c57057b2593d'; tl uuid := '4c496ff4-ee03-4b51-8680-1cc8961585be';
  serie uuid := gen_random_uuid();
  r uuid;
begin
  -- 1. Fechamento comercial de outubro (realizada, ata aprovada, com transcrição)
  r := pg_temp.rn('Fechamento comercial de outubro', 'Comercial', '2026-11-03 14:00-03', 60, 'Sala de reunião', 'participantes', 'realizada', jo, 'Jonatan Falck',
    E'Resultado de outubro\nCancelamentos do mês\nMetas de novembro',
    '{"gerada_por_ia":true,"resumo":"Outubro fechou 12% acima da meta, puxado pelos casamentos. Houve 3 cancelamentos, dois por mudança de data. A equipe decidiu reforçar o pós-venda com as decoradoras e lançar a tabela de verão em 20/11.",
      "topicos":[{"titulo":"Resultado de outubro","minuto":"00:40","pontos":["Faturamento de locação 12% acima da meta","Ticket médio subiu para R$ 18,4 mil","Casamentos foram 64% dos eventos"]},
                 {"titulo":"Cancelamentos","minuto":"09:15","pontos":["3 pedidos cancelados, 2 por mudança de data do evento","Um cliente achou o frete alto para Petrópolis"]},
                 {"titulo":"Metas de novembro","minuto":"18:30","pontos":["Meta de R$ 420 mil em locação","Foco em formaturas e eventos corporativos de fim de ano"]}],
      "decisoes":["Lançar a tabela de verão em 20/11","Ligar para as 10 decoradoras que mais compraram no ano","Rever o frete para a Região Serrana"],
      "pendencias":["Definir se o desconto de frete vale para pedidos acima de R$ 15 mil"],
      "destaques":[{"quem":"Juliana Ribeiro","frase":"Quem é atendido no dia seguinte ao evento volta a comprar com a gente.","minuto":"12:05"},{"quem":"Jonatan Falck","frase":"Dezembro vai ser o maior mês do ano, precisamos chegar com a agenda cheia.","minuto":"24:40"}],
      "proxima_reuniao":"Primeira segunda-feira de dezembro, 14h"}'::jsonb, 'aprovada');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado', true);
  perform pg_temp.rp(r, ju, 'Juliana Ribeiro', 'confirmado', true);
  perform pg_temp.rp(r, ma, 'Mariana Alves', 'confirmado', true);
  perform pg_temp.rp(r, rc, 'Rafael Costa', 'confirmado', false);
  perform pg_temp.rp(r, lf, 'Lucas Fernandes', 'talvez', true);
  perform pg_temp.rt(r, 'Publicar a tabela de verão no catálogo', ma, 'Mariana Alves', '2026-11-20');
  perform pg_temp.rt(r, 'Ligar para as 10 decoradoras que mais compraram no ano', ju, 'Juliana Ribeiro', '2026-11-14');
  perform pg_temp.rt(r, 'Trazer a proposta de frete para a Região Serrana', jo, 'Jonatan Falck', '2026-11-10');
  perform pg_temp.rt(r, 'Enviar o relatório de outubro para a diretoria', lf, 'Lucas Fernandes', '2026-11-05', true);
  perform pg_temp.rparte(r, 1, 300, '[
    {"quem":"Jonatan Falck","id":"02dd55da-3e30-4a96-8743-04f33b21a954","ini":2,"fim":18,"texto":"Boa tarde, gente. Vamos começar pelo resultado de outubro, depois os cancelamentos e fechamos com a meta de novembro."},
    {"quem":"Lucas Fernandes","id":"9052ecbd-43de-4fb3-add6-adce979668c5","ini":40,"fim":75,"texto":"Outubro fechou doze por cento acima da meta de locação. O ticket médio subiu para dezoito mil e quatrocentos."},
    {"quem":"Juliana Ribeiro","id":"4f31a633-c299-4636-982b-6ba84d5226b3","ini":80,"fim":130,"texto":"E os casamentos foram quase dois terços dos eventos. As decoradoras que a gente atendeu no dia seguinte já voltaram com orçamento."},
    {"quem":"Mariana Alves","id":"38a685cd-2a7a-4567-a7b2-ef17464fdebd","ini":140,"fim":200,"texto":"Eu tive dois pedidos novos vindos do catálogo só essa semana, sem precisar ligar."},
    {"quem":"Jonatan Falck","id":"02dd55da-3e30-4a96-8743-04f33b21a954","ini":210,"fim":290,"texto":"Ótimo. Então o pós-venda está funcionando. Vamos para os cancelamentos."}]'::jsonb);
  perform pg_temp.rparte(r, 2, 280, '[
    {"quem":"Juliana Ribeiro","id":"4f31a633-c299-4636-982b-6ba84d5226b3","ini":10,"fim":70,"texto":"Foram três cancelamentos. Dois mudaram a data do evento e um achou o frete alto para Petrópolis."},
    {"quem":"Lucas Fernandes","id":"9052ecbd-43de-4fb3-add6-adce979668c5","ini":75,"fim":130,"texto":"O frete para a serra está com o valor por quilômetro da tabela antiga. Dá para rever."},
    {"quem":"Jonatan Falck","id":"02dd55da-3e30-4a96-8743-04f33b21a954","ini":140,"fim":220,"texto":"Eu trago uma proposta de frete para a Região Serrana. E vamos lançar a tabela de verão no dia vinte."},
    {"quem":"Jonatan Falck","id":"02dd55da-3e30-4a96-8743-04f33b21a954","ini":225,"fim":270,"texto":"Dezembro vai ser o maior mês do ano, precisamos chegar com a agenda cheia."}]'::jsonb);

  -- 2. Treinamento NR-35 (realizada, ata aprovada, toda a equipe vê)
  r := pg_temp.rn('Treinamento de segurança em altura (NR-35)', 'Treinamento', '2026-10-28 08:00-03', 120, 'Galpão · área de montagem', 'empresa', 'realizada', jo, 'Jonatan Falck',
    E'Uso do cinto e do talabarte\nInspeção dos equipamentos\nMontagem de tendas e estruturas altas',
    '{"gerada_por_ia":true,"resumo":"Treinamento prático de trabalho em altura para a equipe de montagem. Todos fizeram a inspeção dos cintos e a simulação de resgate. Dois talabartes foram reprovados e saem de uso.",
      "topicos":[{"titulo":"Inspeção dos equipamentos","minuto":"05:10","pontos":["Dois talabartes com a costura gasta foram reprovados","Cintos dentro da validade"]},{"titulo":"Simulação de resgate","minuto":"48:00","pontos":["Tempo de resgate de 4 minutos, dentro do esperado"]}],
      "decisoes":["Comprar dois talabartes novos","Checar os cintos toda segunda-feira antes das montagens"],
      "pendencias":[],"destaques":[{"quem":"Rafael Souza","frase":"Se o cinto não passou na inspeção, ninguém sobe.","minuto":"07:30"}],"proxima_reuniao":"Reciclagem em abril de 2027"}'::jsonb, 'aprovada');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado', true);
  perform pg_temp.rp(r, rs, 'Rafael Souza (Responsavel Teste)', 'confirmado', true);
  perform pg_temp.rp(r, tl, 'Thiago Lima (Responsavel Teste)', 'confirmado', true);
  perform pg_temp.rp(r, gs, 'Gabriel Souza', 'confirmado', true);
  perform pg_temp.rp(r, et, 'Eduardo Teixeira', 'confirmado', false);
  perform pg_temp.rp(r, bca, 'Bruno Cardoso', 'confirmado', true);
  perform pg_temp.rt(r, 'Comprar dois talabartes novos', dm, 'Diego Martins', '2026-11-07', true);
  perform pg_temp.rt(r, 'Registrar o treinamento na ficha de cada participante', bca, 'Bruno Cardoso', '2026-11-04', true);

  -- 3. 1:1 confidencial (realizada, ata aprovada)
  r := pg_temp.rn('Conversa individual · Juliana', 'Conversa individual', '2026-11-05 10:00-03', 45, 'Sala da diretoria', 'confidencial', 'realizada', jo, 'Jonatan Falck',
    E'Metas do semestre\nPlano de carreira',
    '{"gerada_por_ia":true,"resumo":"Conversa sobre o desempenho do semestre e o próximo passo da Juliana na coordenação comercial. Ela quer assumir o treinamento das novas consultoras.",
      "topicos":[{"titulo":"Desempenho","minuto":"02:00","pontos":["Bateu a meta em 5 dos 6 meses"]},{"titulo":"Próximos passos","minuto":"20:00","pontos":["Assumir o treinamento das consultoras novas a partir de janeiro"]}],
      "decisoes":["Juliana conduz o treinamento das novas consultoras em janeiro"],"pendencias":["Rever a remuneração variável em dezembro"],"destaques":[],"proxima_reuniao":"Em 60 dias"}'::jsonb, 'aprovada');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado', true);
  perform pg_temp.rp(r, ju, 'Juliana Ribeiro', 'confirmado', true);

  -- 4. Revisão de avarias (realizada, sem ata)
  r := pg_temp.rn('Revisão de avarias e manutenção', 'Operação', '2026-11-06 16:00-03', 45, 'Galpão · estoque', 'participantes', 'realizada', jo, 'Jonatan Falck',
    E'Peças que voltaram danificadas em outubro\nFila da marcenaria', null, null, null, null, null,
    E'Cadeiras Tiffany: 14 com pé quebrado\nMesa Nice com tampo riscado\nVer orçamento de verniz');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado', true);
  perform pg_temp.rp(r, dm, 'Diego Martins', 'confirmado', true);
  perform pg_temp.rp(r, cr, 'Camila Rocha', 'confirmado', true);
  perform pg_temp.rp(r, gs, 'Gabriel Souza', 'confirmado', true);
  perform pg_temp.rp(r, fl, 'Fernanda Lima', 'recusado', false);

  -- 5. Alinhamento semanal da logística: série toda segunda (9/11 com ata para revisar; 16, 23 e 30/11 marcadas)
  r := pg_temp.rn('Alinhamento semanal da logística', 'Alinhamento semanal', '2026-11-09 08:30-03', 30, 'Sala de reunião', 'participantes', 'realizada', jo, 'Jonatan Falck',
    E'Eventos da semana\nCaminhões e equipes\nPendências da semana anterior',
    '{"gerada_por_ia":true,"resumo":"Semana com 9 eventos, sendo 3 no sábado. O caminhão G vai para revisão na quarta e a montagem de Itaipava precisa de um freelancer a mais. Ficou combinado antecipar a triagem do pedido 2178.",
      "topicos":[{"titulo":"Eventos da semana","minuto":"00:50","pontos":["9 eventos, 3 no sábado","Casamento em Itaipava com montagem de 6 horas"]},{"titulo":"Caminhões","minuto":"07:20","pontos":["Caminhão G em revisão na quarta-feira","Usar o M2 no lugar"]}],
      "decisoes":["Antecipar a triagem do pedido 2178 para quinta","Chamar um freelancer a mais para Itaipava"],
      "pendencias":["Confirmar com a oficina o horário de devolução do caminhão G"],
      "destaques":[{"quem":"Beatriz Carvalho","frase":"Sábado vai ser apertado: três montagens começando às 7h.","minuto":"02:10"}],"proxima_reuniao":"Segunda que vem, 8h30"}'::jsonb, 'rascunho', serie);
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado', true);
  perform pg_temp.rp(r, bc, 'Beatriz Carvalho', 'confirmado', true);
  perform pg_temp.rp(r, vd, 'Vanessa Duarte', 'confirmado', true);
  perform pg_temp.rp(r, et, 'Eduardo Teixeira', 'confirmado', true);
  perform pg_temp.rp(r, rs, 'Rafael Souza (Responsavel Teste)', 'confirmado', false);
  perform pg_temp.rt(r, 'Confirmar com a oficina a devolução do caminhão G', vd, 'Vanessa Duarte', '2026-11-11');
  perform pg_temp.rt(r, 'Chamar um freelancer a mais para a montagem de Itaipava', jo, 'Jonatan Falck', '2026-11-13');
  perform pg_temp.rparte(r, 1, 290, '[
    {"quem":"Jonatan Falck","id":"02dd55da-3e30-4a96-8743-04f33b21a954","ini":3,"fim":20,"texto":"Bom dia. Beatriz, como está a semana?"},
    {"quem":"Beatriz Carvalho","id":"8aec0db4-d7f5-490c-ba70-6168a2eaf3e1","ini":50,"fim":130,"texto":"Nove eventos, três no sábado. Sábado vai ser apertado: três montagens começando às 7h."},
    {"quem":"Vanessa Duarte","id":"0422ef58-d3b2-4684-85e9-5a438da00744","ini":440,"fim":500,"texto":"O caminhão G entra na oficina na quarta. Dá para usar o M2 nas entregas de quinta."},
    {"quem":"Participante A","ini":510,"fim":560,"texto":"Para Itaipava precisa de mais uma pessoa, a montagem é de seis horas."}]'::jsonb);
  for i in 1..3 loop
    r := pg_temp.rn('Alinhamento semanal da logística', 'Alinhamento semanal', ('2026-11-09 08:30-03'::timestamptz + make_interval(days => 7 * i)), 30, 'Sala de reunião', 'participantes', 'agendada', jo, 'Jonatan Falck',
      E'Eventos da semana\nCaminhões e equipes\nPendências da semana anterior', null, null, serie);
    perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado');
    perform pg_temp.rp(r, bc, 'Beatriz Carvalho', 'confirmado');
    perform pg_temp.rp(r, vd, 'Vanessa Duarte', case when i = 1 then 'confirmado' else 'pendente' end);
    perform pg_temp.rp(r, et, 'Eduardo Teixeira', 'talvez');
    perform pg_temp.rp(r, rs, 'Rafael Souza (Responsavel Teste)', 'pendente');
  end loop;

  -- 6. Planejamento de dezembro (amanhã, diretoria)
  r := pg_temp.rn('Planejamento da temporada de dezembro', 'Diretoria', '2026-11-12 10:00-03', 90, 'Sala da diretoria', 'participantes', 'agendada', jo, 'Jonatan Falck',
    E'Agenda de eventos de dezembro\nEstoque de cadeiras e mesas\nEquipe extra e freelancers\nCaixa para o 13º salário', null, null, null, null, 'meet.google.com/abc-defg-hij');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado');
  perform pg_temp.rp(r, ju, 'Juliana Ribeiro', 'confirmado');
  perform pg_temp.rp(r, lf, 'Lucas Fernandes', 'confirmado');
  perform pg_temp.rp(r, bc, 'Beatriz Carvalho', 'talvez');
  perform pg_temp.rp(r, dm, 'Diego Martins', 'pendente');
  perform pg_temp.rp(r, bca, 'Bruno Cardoso', 'recusado');

  -- 7. Convite para você: metas comerciais (organizada pela Juliana)
  r := pg_temp.rn('Comercial · metas de novembro por consultora', 'Comercial', '2026-11-13 15:00-03', 60, 'Sala de reunião', 'participantes', 'agendada', ju, 'Juliana Ribeiro',
    E'Meta de cada consultora\nCarteira de decoradoras\nCampanha da tabela de verão');
  perform pg_temp.rp(r, ju, 'Juliana Ribeiro', 'confirmado');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'pendente');
  perform pg_temp.rp(r, ma, 'Mariana Alves', 'confirmado');
  perform pg_temp.rp(r, rc, 'Rafael Costa', 'confirmado');

  -- 8. Cancelada
  r := pg_temp.rn('Visita do fornecedor de tecidos', 'Operação', '2026-11-13 10:00-03', 60, 'Galpão · produção', 'participantes', 'cancelada', jo, 'Jonatan Falck',
    E'Amostras de linho e veludo para as capas', null, null, null, 'O fornecedor remarcou para dezembro.');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado');
  perform pg_temp.rp(r, fl, 'Fernanda Lima', 'confirmado');
  perform pg_temp.rp(r, null, 'Ana (Tecidos Serra)', 'pendente', null, 'ana@exemplo.com');

  -- 9. Apresentação para decoradoras (toda a equipe, convidados de fora)
  r := pg_temp.rn('Apresentação da coleção de verão para decoradoras', 'Comercial', '2026-11-18 17:00-03', 90, 'Showroom', 'empresa', 'agendada', jo, 'Jonatan Falck',
    E'Novas peças da coleção\nTabela de verão\nCoquetel', null, null, null, null);
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado');
  perform pg_temp.rp(r, ju, 'Juliana Ribeiro', 'confirmado');
  perform pg_temp.rp(r, ma, 'Mariana Alves', 'confirmado');
  perform pg_temp.rp(r, rm, 'Renata Moreira', 'confirmado');
  perform pg_temp.rp(r, null, 'Helena Prado (decoradora)', 'confirmado', null, 'helena@exemplo.com');
  perform pg_temp.rp(r, null, 'Bia Santos (decoradora)', 'pendente', null, null);

  -- 10. Treinamento do app do montador
  r := pg_temp.rn('Treinamento do App do Montador', 'Treinamento', '2026-11-19 14:00-03', 60, 'Galpão · área de montagem', 'empresa', 'agendada', jo, 'Jonatan Falck',
    E'Entrar com a conta do sistema\nFoto da equipe e lista assinada\nContagem na desmontagem');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'confirmado');
  perform pg_temp.rp(r, rs, 'Rafael Souza (Responsavel Teste)', 'confirmado');
  perform pg_temp.rp(r, tl, 'Thiago Lima (Responsavel Teste)', 'pendente');
  perform pg_temp.rp(r, gs, 'Gabriel Souza', 'pendente');

  -- 11. Convite para você: fechamento financeiro
  r := pg_temp.rn('Fechamento financeiro de novembro', 'Financeiro', '2026-11-27 09:00-03', 60, 'Sala da diretoria', 'confidencial', 'agendada', lf, 'Lucas Fernandes',
    E'DRE de novembro\nContas a receber vencidas\nProvisão do 13º');
  perform pg_temp.rp(r, lf, 'Lucas Fernandes', 'confirmado');
  perform pg_temp.rp(r, jo, 'Jonatan Falck', 'pendente');
  perform pg_temp.rp(r, pg, 'Patrícia Gomes', 'confirmado');
end $$;

select manifesto from sistema_demo_lotes where id = 'TESTE-REUNIOES-20261111';
