alter table public.logistica_motivos drop constraint if exists logistica_motivos_etapa_check;
alter table public.logistica_motivos add constraint logistica_motivos_etapa_check
 check(etapa in ('entrega','coleta','carregamento','divergencia_falta','divergencia_sobra','separacao'));
insert into public.logistica_motivos(empresa_id,etapa,nome)
 select e.id,'separacao',m.nome from public.empresas e cross join
 (values('Item não encontrado'),('Item danificado'),('Quantidade insuficiente'),('Componente faltando'),('Outro problema')) m(nome)
 on conflict do nothing;

create table public.separacao_ocorrencias(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 pedido_id uuid not null references separacoes_pedidos(id),linha_id uuid references separacoes_itens(id) on delete set null,
 item_id uuid not null references itens(id),motivo_id uuid not null references logistica_motivos(id),motivo_nome text not null,
 quantidade numeric not null check(quantidade>0 and quantidade::text not in ('NaN','Infinity','-Infinity')),
 observacao text not null default '',foto_path text,
 estado text not null default 'acervo' check(estado in ('acervo','comercial','triagem','resolvida')),
 criado_por uuid default auth.uid(),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 historico jsonb not null default '[]'::jsonb
);
create index on public.separacao_ocorrencias(empresa_id,estado,pedido_id);
alter table public.separacao_ocorrencias enable row level security;
create policy ler on public.separacao_ocorrencias for select to authenticated using(eh_membro_empresa(empresa_id) and
 (funcionario_tabela_permitida(empresa_id,'separacoes_itens','editar') or operacao_pode(empresa_id,'estoque.itens.visualizar') or operacao_pode(empresa_id,'comercial.pedidos.visualizar')));
create policy seguranca_2fa on public.separacao_ocorrencias as restrictive for all to authenticated
 using((select seguranca_2fa_ok())) with check((select seguranca_2fa_ok()));
grant select on public.separacao_ocorrencias to authenticated;
revoke insert,update,delete on public.separacao_ocorrencias from authenticated,anon;

create function public.separacao_ocorrencia_criar(p_empresa uuid,p_pedido uuid,p_linha uuid,p_item uuid,p_motivo uuid,p_quantidade numeric,p_observacao text default '',p_foto text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;l separacoes_itens;m logistica_motivos;q numeric;novo uuid;
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') then raise exception 'Sem permissão para reportar problema';end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not found or p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'' then raise exception 'A separação não está disponível para reportar problemas';end if;
 select * into l from separacoes_itens where id=p_linha and empresa_id=p_empresa and separacao_pedido_id=p.id;
 if not found then raise exception 'Item não pertence ao pedido';end if;
 if l.item_id=p_item then q:=l.quantidade_solicitada;
 else select l.quantidade_solicitada*k.quantidade into q from kit_itens k join itens i on i.id=k.item_id and i.empresa_id=p_empresa where k.kit_id=l.item_id and k.item_id=p_item;end if;
 if q is null or p_quantidade is null or p_quantidade::text in ('NaN','Infinity','-Infinity') or p_quantidade<=0 or p_quantidade>q then raise exception 'Quantidade afetada inválida';end if;
 if not exists(select 1 from itens where id=p_item and empresa_id=p_empresa) then raise exception 'Item de outra empresa';end if;
 if separacao_meus_setores(p_empresa) is not null and not(separacao_meus_setores(p_empresa) ? separacao_setor_item(p_item)) then raise exception 'Item de outro setor';end if;
 select * into m from logistica_motivos where id=p_motivo and empresa_id=p_empresa and etapa='separacao' and ativo;
 if not found then raise exception 'Selecione um tipo de problema ativo em Parâmetros';end if;
 if length(coalesce(p_observacao,''))>3000 then raise exception 'Observação muito longa';end if;
 if p_foto is not null and (p_foto not like p_empresa::text||'/%' or p_foto like '%..%') then raise exception 'Foto inválida';end if;
 insert into separacao_ocorrencias(empresa_id,pedido_id,linha_id,item_id,motivo_id,motivo_nome,quantidade,observacao,foto_path,historico)
 values(p_empresa,p.id,l.id,p_item,m.id,m.nome,p_quantidade,coalesce(p_observacao,''),p_foto,jsonb_build_array(jsonb_build_object('acao','reportar','por',auth.uid(),'em',now(),'texto',coalesce(p_observacao,'')))) returning id into novo;
 return novo;
end $$;

create function public.separacao_ocorrencia_acao(p_empresa uuid,p_id uuid,p_acao text,p_texto text) returns void
language plpgsql security definer set search_path=public as $$
declare o separacao_ocorrencias;pid uuid;destino text;
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso';end if;
 select pedido_id into pid from separacao_ocorrencias where id=p_id and empresa_id=p_empresa;
 perform 1 from separacoes_pedidos where id=pid for update;
 select * into o from separacao_ocorrencias where id=p_id and empresa_id=p_empresa for update;
 if not found then raise exception 'Ocorrência não encontrada';end if;
 if length(trim(coalesce(p_texto,'')))<5 or length(p_texto)>3000 then raise exception 'Descreva a análise ou solução (5 a 3000 caracteres)';end if;
 if o.estado='acervo' and p_acao in ('comercial','triagem') and operacao_pode(p_empresa,'estoque.itens.editar') then destino:=p_acao;
 elsif o.estado='comercial' and p_acao in ('acervo','triagem') and operacao_pode(p_empresa,'comercial.pedidos.editar') then destino:=p_acao;
 elsif o.estado='triagem' and p_acao in ('resolvida','acervo') and funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') then
  if separacao_meus_setores(p_empresa) is not null and not(separacao_meus_setores(p_empresa) ? separacao_setor_item(o.item_id)) then raise exception 'Item de outro setor';end if;
  destino:=p_acao;
 else raise exception 'Ação indisponível ou sem permissão';end if;
 update separacao_ocorrencias set estado=destino,atualizado_em=now(),historico=historico||jsonb_build_array(jsonb_build_object('acao',destino,'anterior',o.estado,'texto',trim(p_texto),'por',auth.uid(),'em',now())) where id=o.id;
end $$;

create function public.separacao_ocorrencias_listar(p_empresa uuid,p_pedido uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not(funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') or operacao_pode(p_empresa,'estoque.itens.visualizar') or operacao_pode(p_empresa,'comercial.pedidos.visualizar')) then raise exception 'Sem acesso às ocorrências';end if;
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('pedido_numero',p.numero_pedido,'cliente',p.cliente_nome,'item_nome',coalesce(i.descricao_total,i.produto),'codigo',i.codigo) order by o.criado_em desc)
 from separacao_ocorrencias o join separacoes_pedidos p on p.id=o.pedido_id join itens i on i.id=o.item_id
 where o.empresa_id=p_empresa and (p_pedido is null or o.pedido_id=p_pedido)),'[]');
end $$;

create function public.separacao_bloquear_ocorrencias() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in ('separado','separado_com_divergencia') and new.status is distinct from old.status and exists(select 1 from separacao_ocorrencias where pedido_id=new.id and estado<>'resolvida') then
  raise exception 'Este pedido possui problemas reportados ainda não resolvidos. Consulte as ocorrências da separação e confirme a solução antes de finalizar.';
 end if;return new;
end $$;
create trigger separacao_bloquear_ocorrencias before update on separacoes_pedidos for each row execute function separacao_bloquear_ocorrencias();
revoke all on function separacao_ocorrencia_criar(uuid,uuid,uuid,uuid,uuid,numeric,text,text),separacao_ocorrencia_acao(uuid,uuid,text,text),separacao_ocorrencias_listar(uuid,uuid) from public,anon;
grant execute on function separacao_ocorrencia_criar(uuid,uuid,uuid,uuid,uuid,numeric,text,text),separacao_ocorrencia_acao(uuid,uuid,text,text),separacao_ocorrencias_listar(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('separacao-ocorrencias','separacao-ocorrencias',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy separacao_ocorrencia_foto_ler on storage.objects for select to authenticated using(bucket_id='separacao-ocorrencias' and exists(select 1 from separacao_ocorrencias o where o.foto_path=name));
create policy separacao_ocorrencia_foto_criar on storage.objects for insert to authenticated with check(bucket_id='separacao-ocorrencias' and exists(select 1 from empresas e where e.id::text=(storage.foldername(name))[1] and eh_membro_empresa(e.id) and funcionario_tabela_permitida(e.id,'separacoes_itens','editar')));
notify pgrst,'reload schema';
