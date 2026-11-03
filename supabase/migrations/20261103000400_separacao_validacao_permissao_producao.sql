-- A função de cálculo é interna e permanece sem EXECUTE para usuários da API.
-- O gatilho precisa consultá-la com os privilégios do proprietário da função.
-- A autorização para atualizar o pedido continua sendo aplicada pelas políticas da tabela.
alter function public.operacao_validar_pedido_update() security definer;
alter function public.operacao_validar_pedido_update() set search_path = public;
