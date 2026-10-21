-- Painel Logístico (out/2026): escala automática de equipes, responsáveis e caminhões.
-- Pessoas = Cadastro de Funcionários (campo equipe_operacional + marcação de líder) e free aprovados;
-- caminhões = Logística > Caminhões. As listas antigas da planilha do Cronograma saem.

-- 1) Líder: quem pode ser RESPONSÁVEL de uma etapa
alter table public.funcionarios_acesso add column if not exists lider_operacao boolean not null default false;

create or replace function public.rh_definir_lider(p_empresa_id uuid, p_funcionario uuid, p_lider boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not funcionario_pode(p_empresa_id, auth.uid(), 'rh.funcionarios.editar')
     and not funcionario_pode(p_empresa_id, auth.uid(), 'logistica.planejamento.editar') then
    raise exception 'Acesso negado';
  end if;
  update funcionarios_acesso set lider_operacao = coalesce(p_lider, false)
   where id = p_funcionario and empresa_id = p_empresa_id;
end $$;
revoke all on function public.rh_definir_lider(uuid, uuid, boolean) from public, anon;
grant execute on function public.rh_definir_lider(uuid, uuid, boolean) to authenticated;

-- a lista do Cadastro de Funcionários passa a trazer a marcação
create or replace function public.funcionarios_listar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not funcionario_pode(p_empresa_id,auth.uid(),'rh.funcionarios.visualizar') then raise exception 'Acesso negado'; end if;
 return (select coalesce(jsonb_agg(item),'[]') from (select jsonb_build_object('id',f.id,'nome',f.nome,'setor',f.setor,'cargo',f.cargo,
  'login',f.login,'email',f.email,'telefone',f.telefone,'nivel_acesso',f.nivel_acesso,'ativo',f.ativo,
  'foto_url',f.foto_url,'cpf',f.cpf,'salario_bruto',f.salario_bruto,'data_admissao',f.data_admissao,
  'equipe_operacional',f.equipe_operacional,'lider_operacao',f.lider_operacao,'acesso_sistema',f.acesso_sistema,'tem_pin',f.pin_hash is not null,'dados_rh',f.dados_rh,
  'ultimo_acesso',a.last_sign_in_at,'gerenciado',true) item from funcionarios_acesso f
  left join auth.users a on a.id=f.id where f.empresa_id=p_empresa_id
  union all select jsonb_build_object('id',ue.user_id,'nome',coalesce(u.nome,a.email),'setor',coalesce(u.setor,'Administrativo'),
   'cargo',coalesce(u.cargo,''),'login',a.email,'email',a.email,'telefone',coalesce(u.telefone,''),
   'nivel_acesso',case when lower(ue.role) in ('admin','owner','administrador') then 'Administrador' else 'Visualizador' end,
   'ativo',true,'foto_url',coalesce(u.avatar_url,''),'acesso_sistema',true,'gerenciado',false,'salario_bruto',0,'tem_pin',false)
   from usuarios_empresas ue join auth.users a on a.id=ue.user_id left join usuarios u on u.id=ue.user_id
   where ue.empresa_id=p_empresa_id and not exists(select 1 from funcionarios_acesso f where f.id=ue.user_id)
  ) x);
end $$;

-- 2) Caminhão: código curto usado no cronograma (G, M2, XL...)
alter table public.caminhoes add column if not exists codigo text;

-- 3) Parâmetros da escala automática
alter table public.empresa_logistica_regras add column if not exists escala jsonb not null default '{
  "deslocamento_h": 1,
  "volume_padrao_m3": 10,
  "usar_free": true,
  "etapas": {
    "triagem":         {"equipe": "triagem",      "caminhao": false, "m3_por_pessoa": 20, "minimo": 1, "maximo": 3, "duracao_h": 3},
    "carregamento":    {"equipe": "carregamento", "caminhao": true,  "m3_por_pessoa": 20, "minimo": 2, "maximo": 4, "duracao_h": 2},
    "descarregamento": {"equipe": "carregamento", "caminhao": true,  "m3_por_pessoa": 20, "minimo": 2, "maximo": 4, "duracao_h": 2},
    "montagem":        {"equipe": "montagem",     "caminhao": true,  "m3_por_pessoa": 8,  "minimo": 2, "maximo": 8, "duracao_h": 5},
    "desmontagem":     {"equipe": "montagem",     "caminhao": true,  "m3_por_pessoa": 10, "minimo": 2, "maximo": 8, "duracao_h": 4}
  }
}'::jsonb;

-- 4) Frota real (vinha da aba Caminhoes da planilha do Cronograma) e saem os 9 de exemplo
delete from public.caminhoes c
 where c.empresa_id = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b'
   and not exists (select 1 from public.planejamento_caminhoes p where p.caminhao_id = c.id);

insert into public.caminhoes (empresa_id, modelo, placa, tipo, codigo, empresa_nome, capacidade_m3, status)
select 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b',
       trim(l.valores->>1), 'SEM PLACA - ' || coalesce(nullif(trim(l.valores->>2), ''), l.linha::text),
       case when lower(l.valores->>4) like 'propri%' then 'proprio' else 'terceirizado' end,
       nullif(trim(l.valores->>2), ''), nullif(trim(l.valores->>3), ''), 0,
       case when lower(coalesce(l.valores->>5, 'ativo')) = 'inativo' then 'inativo' else 'ativo' end
  from public.gs_linhas l
 where l.planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and l.aba = 'Caminhoes' and l.linha > 1
   and coalesce(trim(l.valores->>1), '') <> '';

-- 5) Listas antigas da planilha apagadas (pedido do usuário)
delete from public.gs_linhas where planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and aba in ('Caminhoes', 'Equipes', 'Responsaveis');
delete from public.gs_abas   where planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and nome in ('Caminhoes', 'Equipes', 'Responsaveis');
