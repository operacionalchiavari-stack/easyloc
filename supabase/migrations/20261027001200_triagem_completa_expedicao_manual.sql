-- Out/2026 (pedido do usuário):
-- 1) A triagem só termina com a separação inteira: acabou o "finalizar com divergência".
-- 2) Pedido separado no modo manual ou 1 clique é conferido na Expedição por QUANTIDADE, nunca por bipe,
--    mesmo que tenha etiquetas de envio impressas.

-- 1) Trava ao mudar o status da triagem.
create or replace function public.separacao_exigir_completa() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status='separado_com_divergencia' then
    raise exception 'A triagem precisa ser finalizada com todos os itens separados.';
  end if;
  if new.status='separado' and exists(
    select 1 from public.separacoes_itens i
     where i.separacao_pedido_id=new.id and coalesce(i.quantidade_separada,0)<coalesce(i.quantidade_solicitada,0)
  ) then
    raise exception 'Ainda há itens faltando. Separe todos os itens para finalizar a triagem.';
  end if;
  return new;
end $$;
drop trigger if exists separacao_exigir_completa on public.separacoes_pedidos;
create trigger separacao_exigir_completa before update of status on public.separacoes_pedidos
  for each row execute function public.separacao_exigir_completa();

-- 2a) Concluir a conferência: com modo manual/1 clique, sempre por quantidade.
do $patch$
declare fonte text; trecho text;
begin
  fonte:=pg_get_functiondef('public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb)'::regprocedure);
  trecho:='  if total>0 then';
  if position(trecho in fonte)=0 then raise exception 'Funcao de conferencia diferente da esperada'; end if;
  fonte:=replace(fonte,trecho,'  if total>0 and coalesce(p.modo_separacao,''qr'')=''qr'' then');
  execute fonte;
end $patch$;

-- 2b) Bipe recusado em pedido separado manualmente.
do $patch$
declare fonte text; trecho text;
begin
  fonte:=pg_get_functiondef('public.operacao_ler_peca(uuid,text,text,text)'::regprocedure);
  trecho:='  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;';
  if position(trecho in fonte)=0 then raise exception 'Funcao de leitura diferente da esperada'; end if;
  fonte:=replace(fonte,trecho,trecho||$guard$
  if p.modo_separacao in ('manual','um-clique') then
    raise exception 'Este pedido foi separado manualmente: a conferência é por quantidade, sem bipagem.';
  end if;$guard$);
  execute fonte;
end $patch$;
