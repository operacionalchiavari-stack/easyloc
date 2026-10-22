-- Cofre, etapa 3 (out/2026): agência, conta, CNPJ/CPF do titular e chave PIX das contas do Financeiro cifrados.
-- Gravação pela Edge Function financeiro-protegido (chave fora do banco); a tela mostra a máscara (cofre_mascaras) e o
-- valor inteiro só com financeiro.dados_bancarios.ver, registrado em seguranca_eventos. A tabela estava vazia:
-- a trava contra texto puro já entra junto.
alter table public.fin_contas add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('financeiro.dados_bancarios.ver', 'Financeiro', 'Dados bancários', 'visualizar',
 'Ver agência, conta, CNPJ/CPF e chave PIX completos das contas (cada consulta fica registrada)', true, 305)
on conflict (chave) do update set descricao = excluded.descricao, sensivel = true;

alter table public.fin_contas drop constraint if exists fin_contas_cofre;
alter table public.fin_contas add constraint fin_contas_cofre check (
  (agencia is null or agencia like 'cofre:v1:%') and (conta is null or conta like 'cofre:v1:%')
  and (titular_documento is null or titular_documento like 'cofre:v1:%') and (pix_chave is null or pix_chave like 'cofre:v1:%')
);
