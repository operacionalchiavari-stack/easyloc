# ✅ Checklist de Qualidade e Segurança

Use este checklist para verificar cada novo módulo/feature que você criar.

## 🔐 SEGURANÇA

- [ ] Nenhuma credencial hardcoded no código
- [ ] Variáveis sensíveis estão no `.env`
- [ ] `.env` está no `.gitignore`
- [ ] Validação de entrada em todos os endpoints
- [ ] SQL injection prevenido (usar Supabase client, não strings)
- [ ] CORS configurado corretamente (não usar `*`)
- [ ] Senhas nunca são logadas em console
- [ ] Tokens JWT tratados com cuidado

## 🎯 CÓDIGO

- [ ] Sem código duplicado (usar `utils/validacoes.js`)
- [ ] Funções bem nomeadas e documentadas
- [ ] Máximo 100 linhas por função
- [ ] Sem variáveis globais desnecessárias
- [ ] Tratamento de erros adequado (try/catch)
- [ ] Sem `console.log` em código de produção
- [ ] Sem `var`, usar `const` ou `let`

## ⚡ PERFORMANCE

- [ ] Requisições HTTP com timeout
- [ ] Sem N+1 queries (agrupar dados quando possível)
- [ ] Cache implementado quando apropriado
- [ ] Lazy loading para dados grandes
- [ ] Compressão de imagens

## 📱 FRONTEND

- [ ] Validação em tempo real (feedback ao usuário)
- [ ] Botões desabilitados durante requisição (loading state)
- [ ] Mensagens de erro claras
- [ ] Acessibilidade (labels, alt text, etc)
- [ ] Funciona offline (cache/LocalStorage)
- [ ] Sem console errors

## 🗄️ BANCO DE DADOS

- [ ] Tabelas têm índices apropriados
- [ ] Foreign keys configuradas
- [ ] Permissões RLS (Row Level Security) ativas
- [ ] Sem dados sensíveis em texto puro
- [ ] Backups configurados
- [ ] Migrations documentadas

## 📝 DOCUMENTAÇÃO

- [ ] README atualizado
- [ ] Comentários em código complexo
- [ ] API documentada (endpoints, payloads)
- [ ] Variáveis de ambiente documentadas
- [ ] Deploy instructions claras

## 🧪 TESTES

- [ ] Testado em múltiplos navegadores
- [ ] Testado em mobile
- [ ] Testado com dados reais
- [ ] Testado fluxo completo (criar → ler → atualizar → deletar)
- [ ] Edge cases testados

## 🚀 DEPLOY

- [ ] Funciona localmente
- [ ] `.env` preenchido corretamente
- [ ] Banco de dados sincronizado
- [ ] Não há erros no console
- [ ] Performance aceitável
- [ ] Mobile responsivo

---

## 📋 Checklist Rápido Antes de Commitar

```
git commit -m "feat: nova funcionalidade"

Antes disso, verificar:
- ✅ Sem credenciais no código
- ✅ Sem console.log desnecessário
- ✅ Validações adicionadas
- ✅ Tratamento de erro implementado
- ✅ .gitignore atualizado se necessário
- ✅ README atualizado se necessário
```

---

## 🚨 Problemas Comuns

| Problema | Solução |
|----------|---------|
| "Supabase não conecta" | Verificar `.env`, SUPABASE_URL e chaves |
| "Função indefinida" | Importar/declarar antes de usar |
| "CORS error" | Adicionar domínio permitido nas funções |
| "Duplicação de código" | Extrair para `utils/validacoes.js` ou similar |
| "Credencial vaza para GitHub" | Usar `git filter-branch` para remover history |
| "Timeout em requisição" | Adicionar controller.signal com timeout |
