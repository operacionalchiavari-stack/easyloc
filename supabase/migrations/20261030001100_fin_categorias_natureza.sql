-- Ponto de equilíbrio (30/out/2026): cada categoria de saída pode ser marcada como custo FIXO (existe mesmo sem evento:
-- folha, aluguel...) ou VARIÁVEL (cresce com os eventos: impostos, frete, equipe, Uber, BV...). Vazio = automático
-- (decidido na tela: impostos, custos da operação e comissões de decoradores são variáveis; o resto é fixo). A categoria
-- filha sem marcação segue a do grupo. Gravado direto pela tela do Plano de contas (mesma regra de escrita das categorias).
alter table public.fin_categorias add column if not exists natureza text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fin_categorias_natureza_check') then
    alter table public.fin_categorias add constraint fin_categorias_natureza_check check (natureza is null or natureza in ('fixo','variavel'));
  end if;
end $$;
