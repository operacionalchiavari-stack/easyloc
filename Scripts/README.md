# 🔧 Script: Gerar Embeddings

Este script processa registros na tabela `ia_conhecimento` e gera embeddings usando OpenAI.

## 📋 O que faz?

1. Busca registros sem embedding na tabela `ia_conhecimento`
2. Gera embedding de cada registro usando OpenAI
3. Salva o embedding de volta no Supabase

## 🚀 Como usar?

### 1️⃣ Configurar `.env`

Certifique-se que seu arquivo `.env` tem:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sk_...  (sua chave de service role)
OPENAI_API_KEY=sk-...              (sua chave OpenAI)
```

### 2️⃣ Rodar o script

```bash
node Scripts/gerar-embedding.js
```

Ou com npm (se configurado em package.json):

```bash
npm run generate-embeddings
```

## ⚙️ Configurar em `package.json`

Adicione um script em `package.json`:

```json
{
  "scripts": {
    "generate-embeddings": "node Scripts/gerar-embedding.js",
    "start": "node server/index.js"
  }
}
```

## 📊 Output esperado

```
🔎 Buscando registros sem embedding...
📦 3 registros encontrados
⚙️ Gerando embedding para ID abc-123
✅ Embedding salvo (abc-123)
⚙️ Gerando embedding para ID def-456
✅ Embedding salvo (def-456)
⚙️ Gerando embedding para ID ghi-789
✅ Embedding salvo (ghi-789)
🏁 Processo finalizado
```

## 🔐 Segurança

✅ **IMPORTANTE:**
- Credenciais são lidas do `.env`, nunca hardcoded
- `.env` está no `.gitignore` (nunca é commitado)
- O script valida variáveis de ambiente antes de executar

⚠️ **Se o script falhar com "Variáveis de ambiente faltando":**
1. Verifique se `.env` existe na pasta raiz
2. Verifique se as 3 variáveis estão com valores reais (não `...`)
3. Tente novamente

## 🐛 Troubleshooting

| Erro | Solução |
|------|---------|
| `Cannot find module 'dotenv'` | Rode `npm install` |
| `Variáveis de ambiente faltando` | Verifique `.env` |
| `OPENAI error 401` | Chave OpenAI inválida ou expirada |
| `Supabase error 401` | Chave Supabase inválida |

## 📝 Notas

- O script processa um registro por vez (para evitar rate limiting)
- Modelos usados: `text-embedding-3-small` (OpenAI)
- Apenas registros com `ativo=true` e `embedding=null` são processados
