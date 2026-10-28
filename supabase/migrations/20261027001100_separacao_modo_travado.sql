-- Modo da triagem travado por pedido (out/2026): o pedido que começou num modo (manual, QR ou 1 clique)
-- termina nele. O modo é gravado na escolha e conferido em cada atualização de item.
alter table public.separacoes_pedidos add column if not exists modo_separacao text
  check (modo_separacao in ('manual','qr','um-clique'));

-- Grava o modo escolhido. Só grava se o pedido ainda não tem modo; com modo diferente, recusa.
create or replace function public.separacao_definir_modo(p_pedido uuid, p_modo text) returns text
language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos;
begin
  if p_modo not in ('manual','qr','um-clique') then raise exception 'Modo de separação inválido'; end if;
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if auth.uid() is null or not public.eh_membro_empresa(p.empresa_id)
     or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') then
    raise exception 'Sem permissão para separar';
  end if;
  if p.modo_separacao is not null then
    if p.modo_separacao<>p_modo then
      raise exception 'Este pedido já foi iniciado no modo %. Ele precisa ser finalizado nesse modo.',
        case p.modo_separacao when 'manual' then 'Manual' when 'qr' then 'QR Code' else '1 clique' end;
    end if;
    return p.modo_separacao;
  end if;
  if not coalesce((public.separacao_modos_disponiveis(p.empresa_id)->>p_modo)::boolean,false) then
    raise exception 'Este modo de separação não está liberado para você. Confira os Parâmetros.';
  end if;
  update public.separacoes_pedidos set modo_separacao=p_modo, atualizado_em=now() where id=p.id;
  return p_modo;
end $$;
revoke all on function public.separacao_definir_modo(uuid,text) from public, anon;
grant execute on function public.separacao_definir_modo(uuid,text) to authenticated;

-- Confere (e grava, se ainda não houver) o modo também a cada item atualizado.
do $patch$
declare fonte text; trecho text;
begin
  fonte:=pg_get_functiondef('public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid)'::regprocedure);
  trecho:='   raise exception ''Este modo de separacao nao esta liberado para voce. Confira os Parametros.'';
  end if;';
  if position(trecho in fonte)=0 then raise exception 'Funcao de separacao diferente da esperada'; end if;
  fonte:=replace(fonte,trecho,trecho||$guard$
  if p.modo_separacao is not null and p.modo_separacao<>coalesce(p_dados->>'modo_separacao','manual') then
   raise exception 'Este pedido já foi iniciado em outro modo de separação. Ele precisa ser finalizado nesse modo.';
  end if;
  if p.modo_separacao is null then
   update public.separacoes_pedidos set modo_separacao=coalesce(p_dados->>'modo_separacao','manual') where id=p.id;
  end if;
$guard$);
  execute fonte;
end $patch$;

-- Pedidos que já têm algo separado: o modo é o das leituras registradas (melhor esforço); os outros ficam sem modo
-- até a primeira escolha.
update public.separacoes_pedidos sp set modo_separacao=x.modo
from (
  select l.separacao_pedido_id id,
    case when bool_or(l.codigo_lido='1-clique') then 'um-clique'
         when bool_or(l.codigo_lido='manual') then 'manual' else 'qr' end modo
  from public.separacoes_leituras l
  where coalesce(l.tipo_controle,'') not in ('carregamento','descarregamento','retorno')
  group by l.separacao_pedido_id
) x
where sp.id=x.id and sp.modo_separacao is null;
