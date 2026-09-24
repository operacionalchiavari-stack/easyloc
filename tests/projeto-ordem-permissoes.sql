-- Validação transacional dos contratos reais, sem deixar projetos/sessões de teste.
begin;
do $$
declare r public.projetos; dono public.catalogo_acessos; outro public.catalogo_acessos;
  token_dono text:=gen_random_uuid()::text; token_outro text:=gen_random_uuid()::text;
  novo jsonb; carregado jsonb;
begin
  select p.* into strict r from public.projetos p join public.catalogo_acessos a on a.cliente_id=p.cliente_id and a.ativo
    where jsonb_array_length(p.dados->'ambientes'->0->'itens')>1 limit 1;
  select * into strict dono from public.catalogo_acessos where cliente_id=r.cliente_id and ativo;
  select * into strict outro from public.catalogo_acessos where cliente_id<>r.cliente_id and empresa_id=r.empresa_id and ativo limit 1;
  insert into public.catalogo_sessoes(acesso_id,token_hash,expires_at) values
    (dono.id,encode(extensions.digest(token_dono,'sha256'),'hex'),now()+interval '5 minutes'),
    (outro.id,encode(extensions.digest(token_outro,'sha256'),'hex'),now()+interval '5 minutes');
  novo:=jsonb_set(r.dados,'{ambientes,0,itens}',(select jsonb_agg(item order by pos desc) from jsonb_array_elements(r.dados->'ambientes'->0->'itens') with ordinality as t(item,pos)));
  perform public.projeto_salvar(token_dono,null,r.id,r.noivos,r.data_evento,r.local_evento,novo);
  carregado:=public.projeto_obter(token_dono,null,r.id);
  if carregado->'dados'<>novo then raise exception 'Ordem não persistiu integralmente'; end if;
  begin
    perform public.projeto_obter(token_outro,null,r.id);
    raise exception 'Outro decorador leu o projeto';
  exception when raise_exception then
    if sqlerrm<>'Projeto não encontrado' then raise; end if;
  end;
  begin
    perform public.projeto_salvar(token_outro,null,r.id,r.noivos,r.data_evento,r.local_evento,r.dados);
    raise exception 'Outro decorador alterou o projeto';
  exception when raise_exception then
    if sqlerrm<>'Projeto não encontrado' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: ordenação persistida integralmente; leitura e gravação negadas a outro decorador' as resultado;
