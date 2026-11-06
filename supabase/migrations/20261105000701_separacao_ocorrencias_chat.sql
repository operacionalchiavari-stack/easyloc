-- Mensagens não alteram o encaminhamento nem a confirmação da ocorrência.
create or replace function public.separacao_ocorrencia_mensagem(p_empresa uuid,p_id uuid,p_texto text,p_equipe text)
returns void language plpgsql security definer set search_path=public as $$
declare o separacao_ocorrencias;equipe text;
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso';end if;
 select * into o from separacao_ocorrencias where empresa_id=p_empresa and id=p_id for update;
 if not found then raise exception 'Ocorrência não encontrada';end if;
 if o.estado='resolvida' then raise exception 'Esta ocorrência já foi resolvida';end if;
 if length(trim(coalesce(p_texto,'')))<1 or length(p_texto)>3000 then raise exception 'Escreva uma mensagem de até 3000 caracteres';end if;
 if p_equipe='triagem' and funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') then
  if separacao_meus_setores(p_empresa) is not null and not(separacao_meus_setores(p_empresa) ? separacao_setor_item(o.item_id)) then raise exception 'Item de outro setor';end if;
  equipe:='Triagem';
 elsif p_equipe='acervo' and operacao_pode(p_empresa,'estoque.itens.editar') then equipe:='Estoque';
 elsif p_equipe='comercial' and o.estado='comercial' and operacao_pode(p_empresa,'comercial.pedidos.editar') then equipe:='Comercial';
 else raise exception 'Sem permissão para enviar mensagens nesta equipe';end if;
 update separacao_ocorrencias set atualizado_em=now(),historico=historico||jsonb_build_array(jsonb_build_object('acao','mensagem','equipe',equipe,'por',auth.uid(),'em',clock_timestamp(),'texto',trim(p_texto))) where id=o.id;
end $$;
revoke all on function public.separacao_ocorrencia_mensagem(uuid,uuid,text,text) from public,anon;
grant execute on function public.separacao_ocorrencia_mensagem(uuid,uuid,text,text) to authenticated;

create or replace function public.separacao_ocorrencias_listar(p_empresa uuid,p_pedido uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not(funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') or operacao_pode(p_empresa,'estoque.itens.visualizar') or operacao_pode(p_empresa,'comercial.pedidos.visualizar')) then raise exception 'Sem acesso às ocorrências';end if;
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('pedido_numero',p.numero_pedido,'cliente',p.cliente_nome,'item_nome',coalesce(i.descricao_total,i.produto),'codigo',i.codigo,'item_foto',i.foto_url,
 'historico',(select coalesce(jsonb_agg(h.valor||jsonb_build_object('nome',coalesce(nullif(f.nome,''),nullif(u.raw_user_meta_data->>'nome',''),nullif(u.raw_user_meta_data->>'full_name',''),'Usuário'),'foto_url',f.foto_url) order by h.ordem),'[]'::jsonb)
 from jsonb_array_elements(o.historico) with ordinality h(valor,ordem)
 left join auth.users u on u.id::text=h.valor->>'por'
 left join funcionarios_acesso f on f.id=u.id and f.empresa_id=p_empresa)) order by o.criado_em desc)
 from separacao_ocorrencias o join separacoes_pedidos p on p.id=o.pedido_id join itens i on i.id=o.item_id
 where o.empresa_id=p_empresa and (p_pedido is null or o.pedido_id=p_pedido)),'[]');
end $$;
notify pgrst,'reload schema';
