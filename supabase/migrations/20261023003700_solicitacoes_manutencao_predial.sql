begin;
insert into permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('geral.manutencao.visualizar','Geral','Manutenção da estrutura','visualizar','Acompanhar solicitações de manutenção da estrutura',17),
 ('geral.manutencao.criar','Geral','Manutenção da estrutura','criar','Solicitar manutenção da estrutura da empresa',18),
 ('geral.manutencao.editar','Geral','Manutenção da estrutura','editar','Gerenciar chamados, responsáveis e prazos de manutenção da estrutura',19)
on conflict(chave) do nothing;

create table public.manutencao_predial_solicitacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),numero bigint not null,
 token uuid not null,titulo text not null,local text not null,descricao text not null,
 categoria text not null check(categoria in ('hidraulica','eletrica','alvenaria','pintura','portas_janelas','climatizacao','outros')),
 prioridade text not null default 'normal' check(prioridade in ('baixa','normal','alta','urgente')),
 status text not null default 'aberta' check(status in ('aberta','analise','agendada','execucao','concluida','cancelada')),
 necessario_ate date,programada_para date,responsavel text,retorno text,
 criado_por uuid not null,solicitante_nome text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(empresa_id,numero),unique(empresa_id,token)
);
create index manutencao_predial_fila on public.manutencao_predial_solicitacoes(empresa_id,status,necessario_ate);
create table public.manutencao_predial_historico(
 id uuid primary key default gen_random_uuid(),solicitacao_id uuid not null references manutencao_predial_solicitacoes(id),
 empresa_id uuid not null references empresas(id),usuario_id uuid not null,usuario_nome text not null,
 acao text not null,detalhes jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.manutencao_predial_solicitacoes enable row level security;
alter table public.manutencao_predial_historico enable row level security;
create policy manutencao_predial_ler on public.manutencao_predial_solicitacoes for select to authenticated using(
 eh_membro_empresa(empresa_id) and ((criado_por=auth.uid() and (funcionario_pode(empresa_id,auth.uid(),'geral.manutencao.visualizar') or funcionario_pode(empresa_id,auth.uid(),'geral.manutencao.criar')))
 or funcionario_pode(empresa_id,auth.uid(),'geral.manutencao.editar')));
create policy manutencao_predial_historico_ler on public.manutencao_predial_historico for select to authenticated using(
 exists(select 1 from manutencao_predial_solicitacoes s where s.id=solicitacao_id and s.empresa_id=manutencao_predial_historico.empresa_id));
grant select on public.manutencao_predial_solicitacoes,public.manutencao_predial_historico to authenticated;

create or replace function public.manutencao_predial_operar(p_empresa uuid,p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r manutencao_predial_solicitacoes; anterior manutencao_predial_solicitacoes;gestor boolean;criar boolean;prox bigint;usuario_nome text;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa' using errcode='42501';end if;
 gestor:=funcionario_pode(p_empresa,auth.uid(),'geral.manutencao.editar');criar:=funcionario_pode(p_empresa,auth.uid(),'geral.manutencao.criar');
 if not gestor and not criar and not funcionario_pode(p_empresa,auth.uid(),'geral.manutencao.visualizar') then
  raise exception 'Sem permissão para consultar manutenção da estrutura' using errcode='42501';end if;
 if p_acao='listar' then
  return jsonb_build_object('gerenciar',gestor,'criar',criar,'itens',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc)
   from manutencao_predial_solicitacoes s where s.empresa_id=p_empresa and (gestor or s.criado_por=auth.uid())),'[]'::jsonb));
 end if;
 usuario_nome:=almox_nome_usuario(p_empresa);
 if p_acao='criar' then
  if not criar then raise exception 'Sem permissão para solicitar manutenção' using errcode='42501';end if;
  if length(trim(coalesce(p_dados->>'titulo',''))) not between 3 and 200 or length(trim(coalesce(p_dados->>'local',''))) not between 2 and 200
   or length(trim(coalesce(p_dados->>'descricao',''))) not between 5 and 5000 then raise exception 'Informe o problema, o local e uma descrição do serviço';end if;
  if nullif(p_dados->>'token','') is null then raise exception 'Identificação da solicitação ausente';end if;
  perform pg_advisory_xact_lock(hashtextextended('predial:'||p_empresa::text,0));
  select * into r from manutencao_predial_solicitacoes where empresa_id=p_empresa and token=(p_dados->>'token')::uuid;
  if found then
   if r.criado_por<>auth.uid() then raise exception 'Identificação da solicitação já utilizada';end if;
   return to_jsonb(r);
  end if;
  select coalesce(max(numero),0)+1 into prox from manutencao_predial_solicitacoes where empresa_id=p_empresa;
  insert into manutencao_predial_solicitacoes(empresa_id,numero,token,titulo,local,descricao,categoria,prioridade,necessario_ate,criado_por,solicitante_nome)
  values(p_empresa,prox,(p_dados->>'token')::uuid,trim(p_dados->>'titulo'),trim(p_dados->>'local'),trim(p_dados->>'descricao'),
   coalesce(p_dados->>'categoria','outros'),coalesce(p_dados->>'prioridade','normal'),nullif(p_dados->>'necessario_ate','')::date,auth.uid(),usuario_nome) returning * into r;
  insert into manutencao_predial_historico(solicitacao_id,empresa_id,usuario_id,usuario_nome,acao) values(r.id,p_empresa,auth.uid(),usuario_nome,'Solicitação enviada');
  return to_jsonb(r);
 end if;
 select * into r from manutencao_predial_solicitacoes where id=(p_dados->>'id')::uuid and empresa_id=p_empresa for update;
 if not found or (not gestor and r.criado_por<>auth.uid()) then raise exception 'Solicitação não encontrada';end if;
 if p_acao='consultar' then
  return to_jsonb(r)||jsonb_build_object('gerenciar',gestor,'historico',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc)
   from manutencao_predial_historico h where h.solicitacao_id=r.id),'[]'::jsonb));
 elsif p_acao<>'atualizar' then raise exception 'Operação inválida';end if;
 if not gestor then raise exception 'Sem permissão para gerenciar manutenção' using errcode='42501';end if;
 if nullif(p_dados->>'updated_at','')::timestamptz is distinct from r.updated_at then raise exception 'Esta solicitação foi alterada. Atualize a tela e tente novamente';end if;
 if length(coalesce(p_dados->>'responsavel',''))>200 or length(coalesce(p_dados->>'retorno',''))>5000 then raise exception 'Texto maior que o limite permitido';end if;
 if p_dados->>'status'='agendada' and nullif(p_dados->>'programada_para','') is null then raise exception 'Informe a data agendada';end if;
 anterior:=r;
 update manutencao_predial_solicitacoes set status=coalesce(p_dados->>'status',status),prioridade=coalesce(p_dados->>'prioridade',prioridade),
  responsavel=nullif(trim(p_dados->>'responsavel'),''),programada_para=nullif(p_dados->>'programada_para','')::date,
  retorno=nullif(trim(p_dados->>'retorno'),''),updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into manutencao_predial_historico(solicitacao_id,empresa_id,usuario_id,usuario_nome,acao,detalhes)
  values(r.id,p_empresa,auth.uid(),usuario_nome,'Atendimento atualizado',jsonb_build_object('situacao_anterior',anterior.status,'situacao',r.status));
 return to_jsonb(r);
end $$;
revoke all on function public.manutencao_predial_operar(uuid,text,jsonb) from public,anon;
grant execute on function public.manutencao_predial_operar(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
