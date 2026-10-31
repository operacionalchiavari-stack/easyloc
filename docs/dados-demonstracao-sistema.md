# Dados de demonstração do sistema

Lote: `DEMO-SISTEMA-20261031`. Destino: empresa atual, junto aos dados existentes, conforme solicitado.

Os nomes e pedidos têm o prefixo **DEMO**. Endereços e documentos são fictícios; os e-mails usam `example.invalid`. Os funcionários fictícios estão sem acesso ao sistema, sem login ou senha. Os itens de locação pertencem ao lote e não são exibidos no site público. O financeiro utiliza uma conta separada, **DEMO · Caixa de demonstração**, com recebimentos e pagamentos sintéticos.

## O que explorar

| Área | Exemplos |
|---|---|
| Comercial | 16 clientes, 8 locais, 4 equipes de clientes, 40 pedidos: 12 orçamentos, 8 pré-reservas, 15 confirmados e 5 cancelados |
| Acompanhamentos | 40 contatos e 40 retornos, incluindo vencidos, para hoje, futuros e concluídos |
| Produtividade | 3 participantes fictícias, 160 ações de exemplo; autoria identificada como DEMO |
| Catálogo | 8 projetos não compartilhados e 16 itens de demonstração |
| Estoque e almoxarifado | 12 insumos, 12 materiais, entradas de estoque, solicitações, limites baixos e itens para personalização |
| Produção | 6 personalizações; ordens, etapas e materiais gerados pelos pedidos |
| Logística | Pedidos em triagem, expedição, entrega, coleta, retorno e posição final; 3 caminhões, viagens de frete e equipe nas etapas |
| Aplicativos operacionais | 3 motoristas fictícios e corridas; 5 vagas de montagem free. Não há credenciais de demonstração distribuídas |
| Compras | 12 necessidades, 4 cotações, 2 pedidos e 2 divergências |
| Financeiro | Títulos gerados pelos pedidos, entradas parciais e integrais, contas a pagar, baixas e movimentos vinculados |
| Acervo e manutenção | Avarias, falta, inspeções, 3 ordens de serviço e 6 solicitações de manutenção predial |
| RH | 8 funcionários fictícios, fichas, exames, férias, solicitações, ocorrências, treinamento, turma e benefício com adesões |
| Gestão | 5 ideias de demonstração, ocorrências operacionais e exemplos no painel de complexidade |
| Pós-venda | 5 contatos: pendentes e concluídos, incluindo um caso que precisa de atenção |

Os dados entram nos totais e relatórios da empresa atual. A conta e os nomes DEMO ajudam a diferenciá-los dos dados operacionais.

## Reproduzir e conferir

O script usa as credenciais temporárias do Supabase CLI já conectado ao projeto; não grava senhas.

```powershell
# Validar inserção inteira em uma transação e desfazer ao final
node Scripts/demo-sistema.cjs

# Inserir o lote na empresa atual
node Scripts/demo-sistema.cjs --aplicar

# Conferir os registros persistidos, etapas e atividades por pessoa DEMO
node Scripts/demo-sistema.cjs --verificar
```

Reexecutar o lote já aplicado não o duplica. O registro administrativo `sistema_demo_lotes` guarda a empresa, o manifesto dos registros e a configuração comercial anterior. Uma cópia local está em `outputs/demo-sistema-manifesto.json`.

Para uma futura remoção, usar os identificadores exatos do manifesto e respeitar os vínculos entre os registros. Não apagar por uma busca genérica de texto, nem restaurar a configuração antiga sobre alterações posteriores do usuário. Históricos de auditoria podem continuar registrando que houve dados de demonstração.

Não foram criadas integrações, credenciais de banco/gateway, chaves PIX ou documentos fiscais fictícios utilizáveis. Cadastros de free com CPF cifrado não são simulados com valores inválidos; os exemplos dessa área são as vagas e suas etapas de montagem.
