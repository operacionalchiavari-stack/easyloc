-- Logística › Cadastros › Free/Uber, aba Dados: o que a pessoa informou no cadastro do app (CPF/PIX só mascarados) e números do trabalho.
create or replace function public.logistica_prestador_dados(p_empresa uuid,p_tipo text,p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_tipo='free' then
    select jsonb_build_object('nome',f.nome,'telefone',f.telefone,'foto_url',f.foto_url,'status',f.status,
      'cpf',coalesce(f.cofre_mascaras->>'cpf',case when coalesce(f.cpf,'')<>'' then 'Cadastrado' end),
      'pix',coalesce(f.cofre_mascaras->>'pix',case when coalesce(f.chave_pix,'')<>'' then 'Cadastrada' end),
      'observacao',f.observacao,'cadastrado_em',f.created_at,'ultimo_acesso',f.ultimo_acesso,
      'trabalhos',(select count(*) from free_inscricoes i where i.free_id=f.id and i.empresa_id=p_empresa and i.status='CONFIRMADO' and i.checkin_em is not null),
      'faltas',(select count(*) from free_inscricoes i join free_vagas_v v on v.id=i.vaga_id where i.free_id=f.id and i.empresa_id=p_empresa
                  and i.status='CONFIRMADO' and i.checkin_em is null and v.data<hoje),
      'cancelamentos',(select count(*) from free_inscricoes i where i.free_id=f.id and i.empresa_id=p_empresa and i.status='CANCELADO'),
      'ultimo_trabalho',(select max(v.data) from free_inscricoes i join free_vagas_v v on v.id=i.vaga_id where i.free_id=f.id and i.empresa_id=p_empresa and i.checkin_em is not null),
      'proximos',coalesce((select jsonb_agg(jsonb_build_object('data',v.data,'hora',v.horario,'etapa',v.etapa,'pedido',v.pedido,'cliente',v.cliente,'local',v.local) order by v.data,v.horario)
        from free_inscricoes i join free_vagas_v v on v.id=i.vaga_id where i.free_id=f.id and i.empresa_id=p_empresa and i.status='CONFIRMADO' and v.data>=hoje),'[]'::jsonb))
      into r from free_cadastros f where f.id=p_pessoa and f.empresa_id=p_empresa;
  elsif p_tipo='uber' then
    select jsonb_build_object('nome',m.nome,'telefone',m.telefone,'status',m.status,
      'pix',case when coalesce(m.chave_pix,'')='' then null else '••••'||right(m.chave_pix,2) end,
      'carro',nullif(concat_ws(' · ',nullif(m.carro_modelo,''),nullif(m.carro_cor,''),nullif(m.carro_placa,'')),''),
      'cadastrado_em',m.created_at,'ultimo_acesso',m.ultimo_acesso,
      'trabalhos',(select count(*) from uber_corridas c where c.motorista_id=m.id and c.empresa_id=p_empresa and c.checkout_em is not null),
      'cancelamentos',(select count(*) from uber_corridas c where c.motorista_id=m.id and c.empresa_id=p_empresa and c.status='cancelada'),
      'ultimo_trabalho',(select max(v.data) from uber_corridas c join uber_vagas v on v.id=c.vaga_id where c.motorista_id=m.id and c.empresa_id=p_empresa and c.checkin_em is not null),
      'proximos',coalesce((select jsonb_agg(jsonb_build_object('data',v.data,'hora',to_char(v.hora,'HH24:MI'),'etapa',coalesce(e.nome,'Uber'),'pedido',p.numero_pedido,'cliente',p.cliente_nome,'local',v.destino) order by v.data,v.hora)
        from uber_corridas c join uber_vagas v on v.id=c.vaga_id left join operacao_etapas e on e.id=v.etapa_id left join separacoes_pedidos p on p.id=v.pedido_id
        where c.motorista_id=m.id and c.empresa_id=p_empresa and c.status<>'cancelada' and v.data>=hoje),'[]'::jsonb))
      into r from uber_motoristas m where m.id=p_pessoa and m.empresa_id=p_empresa;
  else raise exception 'Tipo inválido';
  end if;
  if r is null then raise exception 'Cadastro não encontrado';end if;
  return r;
end $$;
revoke all on function public.logistica_prestador_dados(uuid,text,uuid) from public,anon;
grant execute on function public.logistica_prestador_dados(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
