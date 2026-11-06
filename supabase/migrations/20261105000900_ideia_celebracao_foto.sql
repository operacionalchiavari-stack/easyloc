-- Celebração da Ideia Premiada (nov/2026): devolve também a foto do Cadastro de Funcionários de quem enviou
-- (caminho no bucket privado funcionarios-fotos; a tela gera o link assinado).
create or replace function public.ideias_premiadas_celebracao(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_dias int;
begin
 if auth.uid() is null or not coalesce((public.funcionario_contexto(p_empresa)->>'ativo')::boolean,false) then raise exception 'Acesso inativo'; end if;
 select coalesce((select dias_celebracao from public.ideias_premiadas_config where empresa_id=p_empresa),4) into v_dias;
 return jsonb_build_object('dias', v_dias, 'ideias', coalesce((
  select jsonb_agg(jsonb_build_object('id',x.id,'titulo',x.titulo,'area',x.area,'autor',x.autor_nome,'autor_id',x.autor_id,
    'foto_url',(select f.foto_url from public.funcionarios_acesso f where f.id=x.autor_id and f.empresa_id=p_empresa limit 1),
    'premio',x.premio,'proposta',left(x.proposta,280),'premiada_em',x.premiada_em) order by x.premiada_em desc)
  from (
   select i.*, coalesce((select max(h.created_at) from public.ideias_premiadas_historico h
                          where h.ideia_id=i.id and h.depois->>'status'='premiada'), i.updated_at) as premiada_em
   from public.ideias_premiadas i
   where i.empresa_id=p_empresa and i.status='premiada'
  ) x
  where v_dias > 0 and x.premiada_em >= now() - make_interval(days => v_dias)
 ),'[]'::jsonb));
end $$;
notify pgrst, 'reload schema';
