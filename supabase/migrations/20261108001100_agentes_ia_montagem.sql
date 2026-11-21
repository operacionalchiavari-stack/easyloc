begin;
create table public.ia_agentes (
 chave text primary key,nome text not null,descricao text not null,
 comportamento text not null,coletar text not null,indispensavel text not null
);
insert into ia_agentes values
('separacao','Auxiliar de estoque','Problemas encontrados na separação.','Investigue com conhecimento de marcenaria, uma pergunta por vez, sem culpar a equipe.','Dano e unidade afetada, momento da descoberta, verificações, impacto e solução sugerida.','Em dano, exigir fotos claras e esclarecer o que mostram. Revisar o resumo antes do envio.'),
('montagem','Assistente de montagem','Memória do evento para desmontagem e melhoria contínua.','Converse como uma coordenadora de montagem experiente, com perguntas práticas e objetivas.','Acessos, estacionamento, carga e descarga, horários, contato no local, distribuição e fixação dos itens, cuidados, dificuldades e melhorias.','Orientações úteis à desmontagem, riscos e restrições do local, pendências e revisão humana. Não inventar dados.'),
('compra','Assistente de compras','Entende e estrutura solicitações de compra.','Investigue a necessidade e alternativas com linguagem simples.','Material, quantidade, finalidade, prazo e alternativas verificadas.','Justificativa e revisão humana antes de registrar.'),
('manutencao','Assistente de manutenção','Entende solicitações de manutenção.','Investigue o problema com objetividade e cuidado.','Local exato, problema, impacto, urgência e evidências.','Identificar setor ou sala; não orientar reparos arriscados.'),
('ideia','Ideia premiada','Ajuda a equipe a explicar sugestões de melhoria.','Ouça e ajude a tornar a ideia concreta.','Problema atual, proposta, benefício e como colocar em prática.','Preservar a autoria e revisar antes de registrar.'),
('catalogo','Helena · Catálogo','Auxilia clientes com acervo e composição dos eventos.','Atenda com clareza, respeitando o estilo e as preferências do cliente.','Necessidade do evento, estilo, datas e peças desejadas.','Utilizar apenas peças e disponibilidade confirmadas pelo sistema.'),
('financeiro','Assistente financeiro','Conciliação, extratos e organização financeira.','Explique de forma objetiva com base nos registros.','Diferenças, contexto financeiro e informações faltantes.','Não inventar valores nem aplicar decisões sem confirmação.'),
('planejador','Planejador de eventos','Planejamento de composição e espaços.','Planeje de forma prática com os dados fornecidos.','Briefing, dimensões, circulação e itens disponíveis.','Respeitar medidas e IDs fornecidos; não presumir execução.'),
('studio','Studio · Composição','Apoia planejamento visual e leitura de plantas.','Interprete o briefing respeitando medidas e referências.','Dimensões, disposição, estilo e restrições.','Não inventar medidas nem itens ausentes do projeto.');
create table public.ia_agentes_config (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 agente text not null references public.ia_agentes(chave),
 comportamento text not null check(length(comportamento)<=8000),
 coletar text not null check(length(coletar)<=8000),indispensavel text not null check(length(indispensavel)<=8000),
 atualizado_por uuid not null default auth.uid(),atualizado_em timestamptz not null default now(),
 primary key(empresa_id,agente)
);
alter table public.ia_agentes enable row level security;
alter table public.ia_agentes_config enable row level security;
create policy agentes_ler on public.ia_agentes for select to authenticated using(seguranca_2fa_ok());
create policy agentes_config_ler on public.ia_agentes_config for select to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok());
revoke all on public.ia_agentes,public.ia_agentes_config from anon,authenticated;
grant select on public.ia_agentes,public.ia_agentes_config to authenticated;
create function public.ia_agente_salvar(p_empresa uuid,p_agente text,p_comportamento text,p_coletar text,p_indispensavel text,p_versao timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r ia_agentes_config;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') then raise exception 'Sem permissão para configurar agentes';end if;
 perform 1 from empresas where id=p_empresa for update;
 select * into r from ia_agentes_config where empresa_id=p_empresa and agente=p_agente;
 if r.atualizado_em is distinct from p_versao then raise exception 'As instruções foram alteradas por outra pessoa. Reabra o agente antes de salvar.';end if;
 if p_comportamento is null or p_coletar is null or p_indispensavel is null or length(btrim(p_comportamento))<3 then raise exception 'Preencha como o agente deve agir';end if;
 insert into ia_agentes_config(empresa_id,agente,comportamento,coletar,indispensavel,atualizado_por) values(p_empresa,p_agente,btrim(p_comportamento),btrim(p_coletar),btrim(p_indispensavel),auth.uid())
 on conflict(empresa_id,agente) do update set comportamento=excluded.comportamento,coletar=excluded.coletar,indispensavel=excluded.indispensavel,atualizado_por=auth.uid(),atualizado_em=clock_timestamp() returning * into r;
 return to_jsonb(r);
end $$;
create table public.montagem_relatos_ia (
 etapa_id uuid primary key references public.operacao_etapas(id) on delete cascade,
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 resumo jsonb not null,conversa jsonb not null,fotos jsonb not null default '[]',
 historico jsonb not null default '[]',autor text not null,usuario_id uuid not null,atualizado_em timestamptz not null default now()
);
alter table public.montagem_relatos_ia enable row level security;
create policy montagem_relatos_ler on public.montagem_relatos_ia for select to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','select'));
revoke all on public.montagem_relatos_ia from anon,authenticated;
grant select on public.montagem_relatos_ia to authenticated;
create function public.mont_assistente_contexto(p_token text,p_etapa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador');e operacao_etapas;p separacoes_pedidos;relatos jsonb;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(s.empresa_id) or s.usuario_id is distinct from auth.uid() then raise exception 'Entre no app com sua conta';end if;
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) or e.tipo not in ('montagem','desmontagem') then raise exception 'Sem acesso a este evento';end if;
 select * into p from separacoes_pedidos where id=e.pedido_id and empresa_id=e.empresa_id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.atualizado_em desc),'[]') into relatos from montagem_relatos_ia r join operacao_etapas m on m.id=r.etapa_id where r.empresa_id=e.empresa_id and m.pedido_id=e.pedido_id and m.tipo='montagem';
 return jsonb_build_object('empresa_id',s.empresa_id,'usuario_id',auth.uid(),'nome',s.nome,'etapa',e.tipo,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'local',p.local_nome,'data',e.data,'observacao',e.observacao,'relatos',relatos);
end $$;
create function public.mont_assistente_salvar(p_token text,p_etapa uuid,p_resumo jsonb,p_conversa jsonb,p_fotos jsonb,p_versao timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c jsonb;r montagem_relatos_ia;campo text;u text;
begin
 c:=mont_assistente_contexto(p_token,p_etapa);
 if c->>'etapa'<>'montagem' then raise exception 'Registre estas informações durante a montagem';end if;
 perform 1 from operacao_etapas where id=p_etapa for update;
 select * into r from montagem_relatos_ia where etapa_id=p_etapa;
 if r.atualizado_em is distinct from p_versao then raise exception 'O relato foi atualizado por outra pessoa. Reabra antes de enviar.';end if;
 if jsonb_typeof(p_resumo) is distinct from 'object' or p_resumo->'pendencias_obrigatorias' is distinct from '[]'::jsonb then raise exception 'Complete as informações indispensáveis antes de enviar';end if;
 foreach campo in array array['montagem','acessos','desmontagem','cuidados','ocorrencias','melhorias','pendencias'] loop
  if jsonb_typeof(p_resumo->campo) is distinct from 'string' or length(btrim(p_resumo->>campo))<2 or length(p_resumo->>campo)>2000 then raise exception 'Complete o resumo: %',campo;end if;
 end loop;
 if jsonb_typeof(p_conversa) is distinct from 'array' or jsonb_array_length(p_conversa)>60 or not exists(select 1 from jsonb_array_elements(p_conversa) m where m->>'papel'='pessoa' and length(btrim(m->>'texto'))>0) then raise exception 'Conversa inválida';end if;
 if jsonb_typeof(p_fotos) is distinct from 'array' or jsonb_array_length(p_fotos)>12 then raise exception 'Fotos inválidas';end if;
 for u in select jsonb_array_elements_text(p_fotos) loop
  if (u not like (c->>'empresa_id')||'/'||(c->>'usuario_id')||'/%' and not coalesce(r.fotos ? u,false)) or u like '%..%' or not exists(select 1 from storage.objects where bucket_id='montagem-relatos' and name=u) then raise exception 'Foto inválida';end if;
 end loop;
 insert into montagem_relatos_ia(etapa_id,empresa_id,resumo,conversa,fotos,autor,usuario_id) values(p_etapa,(c->>'empresa_id')::uuid,p_resumo,p_conversa,p_fotos,c->>'nome',auth.uid())
 on conflict(etapa_id) do update set historico=montagem_relatos_ia.historico||jsonb_build_array(to_jsonb(montagem_relatos_ia)-'historico'),resumo=excluded.resumo,conversa=excluded.conversa,fotos=excluded.fotos,autor=excluded.autor,usuario_id=excluded.usuario_id,atualizado_em=clock_timestamp() returning * into r;
 return to_jsonb(r);
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('montagem-relatos','montagem-relatos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy montagem_relato_foto_criar on storage.objects for insert to authenticated with check(bucket_id='montagem-relatos' and (storage.foldername(name))[2]=auth.uid()::text and seguranca_2fa_ok() and eh_membro_empresa(((storage.foldername(name))[1])::uuid));
create policy montagem_relato_foto_ler on storage.objects for select to authenticated using(bucket_id='montagem-relatos' and seguranca_2fa_ok() and eh_membro_empresa(((storage.foldername(name))[1])::uuid) and ((storage.foldername(name))[2]=auth.uid()::text or exists(select 1 from montagem_relatos_ia r where r.fotos ? name) or exists(select 1 from operacao_etapas e join operacao_etapa_pessoas p on p.etapa_id=e.id join operacao_etapas m on m.pedido_id=e.pedido_id join montagem_relatos_ia r on r.etapa_id=m.id where e.empresa_id=((storage.foldername(name))[1])::uuid and p.funcionario_id=auth.uid() and r.fotos ? name)));
revoke all on function public.ia_agente_salvar(uuid,text,text,text,text,timestamptz),public.mont_assistente_contexto(text,uuid),public.mont_assistente_salvar(text,uuid,jsonb,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.ia_agente_salvar(uuid,text,text,text,text,timestamptz),public.mont_assistente_contexto(text,uuid),public.mont_assistente_salvar(text,uuid,jsonb,jsonb,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
