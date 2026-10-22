-- Cofre, etapa 2, trava (aplicar SÓ depois de converter os dados do RH — script cifrar-rh): o banco passa a
-- recusar CPF, RG, salário, PIS, CTPS, agência, conta e PIX em texto puro.
alter table public.funcionarios_acesso drop constraint if exists funcionarios_acesso_cofre;
alter table public.funcionarios_acesso add constraint funcionarios_acesso_cofre check (
  (cpf is null or cpf = '' or cpf like 'cofre:v1:%')
  and salario_bruto = 0
  and (salario_cifrado is null or salario_cifrado like 'cofre:v1:%')
  and not (dados_rh ? 'cpf')
  and (coalesce(dados_rh->>'rg', '') = '' or dados_rh->>'rg' like 'cofre:v1:%')
);
alter table public.rh_fichas drop constraint if exists rh_fichas_cofre;
alter table public.rh_fichas add constraint rh_fichas_cofre check (
  (pis is null or pis like 'cofre:v1:%') and (ctps is null or ctps like 'cofre:v1:%')
  and (agencia is null or agencia like 'cofre:v1:%') and (conta is null or conta like 'cofre:v1:%')
  and (pix is null or pix like 'cofre:v1:%')
);
