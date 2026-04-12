# 🚀 EasyLoc - Sistema de Gestão

Sistema ERP/CRM para gerenciar locações com integração de IA.

## 📋 Funcionalidades

### 🛍️ **Comercial**
- Cadastro de clientes (validação CPF, email, telefone)
- Gerenciamento de locais com Google Maps
- Sistema de pedidos com cálculo automático de distância

### 📦 **Estoque**
- Almoxarifado (insumos com fotos)
- Cadastro de itens/produtos
- Gerenciamento de fornecedores

### 🚚 **Logística**
- Cadastro e gerenciamento de caminhões

### 🧠 **IA (LIA)**
- Assistente inteligente com RAG (Retrieval Augmented Generation)
- Busca semântica em base de conhecimento
- Chat com contexto da empresa

---

## 🔧 Configuração Inicial

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie `.env.example` para `.env` e preencha com suas credenciais:

```bash
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=pk_...
SUPABASE_SERVICE_ROLE_KEY=sk_...

# Server
PORT=3000

# OpenAI (para IA)
OPENAI_API_KEY=sk_...

# Google Maps
GOOGLE_MAPS_KEY=...
```

### 3. Inicializar Banco de Dados
```bash
supabase start
```

### 4. Rodar Servidor Localmente
```bash
node server/index.js
```

O servidor estará em `http://localhost:3000`

---

##  Estrutura do Projeto

```
meu-sistema/
├── index.html                           # Login
├── dashboard.html                       # Dashboard principal
├── planos.html                          # Página de planos
├── server/
│   └── index.js                         # Servidor Node.js (proxy + config)
├── Modulos/
│   ├── Comercial/
│   │   ├── Cadastro\ Clientes/
│   │   ├── Cadastro\ Locais/
│   │   └── Pedidos/
│   ├── Estoque/
│   │   ├── Almoxarifado/
│   │   ├── CadastroFornecedores/
│   │   └── CadastroItens/
│   ├── Logistica/
│   │   └── cadastro-caminhoes.js
│   └── Login/
│       └── Boot/
├── supabase/
│   ├── config.toml                      # Config Supabase local
│   └── functions/
│       ├── rag-buscar-conhecimento/     # Busca no RAG (IA)
│       ├── lia-chat/                    # Chat inteligente
│       ├── gerar-embedding/             # Gera embeddings
│       └── calcular-distancia/          # Calcula distância
├── inteligencia-artificial/
│   └── assistente-ia.js                 # Lógica do assistente
├── Scripts/
│   └── gerar-embedding.js               # Script para gerar embeddings
└── utils/
    └── validacoes.js                    # Funções de validação reutilizáveis
```

---

## 🔐 Segurança

- ✅ `.env` não é commitado (adicionado ao `.gitignore`)
- ✅ Credenciais removidas do frontend
- ✅ Proxy seguro no servidor para requisições sensíveis
- ✅ CORS restritivo nas funções Supabase
- ✅ Validação de entrada em todos os endpoints

**Importante:** Antes de ir para produção, atualize:
- `CORS origin` nas funções (substituir `https://seu-dominio.com` por seu domínio real)
- Chaves de API do Supabase (anon vs service role)

---

## ✨ Recursos

- **Autenticação:** Supabase Auth
- **Banco de Dados:** PostgreSQL (Supabase)
- **IA/LLM:** OpenAI (embeddings + GPT)
- **Maps:** Google Maps API
- **Frontend:** HTML5 + JavaScript vanilla + Supabase JS SDK
- **Backend:** Node.js + Express
- **Funções Serverless:** Supabase Functions (Deno)

---

## 📝 Próximos Passos para Produção

1. **Unificar imports do Supabase** - usar versão consistente
2. **Refatorar módulos** - usar código compartilhado de validações
3. **Remover console.logs** em produção
4. **Adicionar rate limiting** no servidor
5. **Setup CI/CD** (GitHub Actions, etc)
6. **Deploy na nuvem** (Vercel, Railway, etc)

---

## 🤝 Contribuindo

Este é um projeto em desenvolvimento. Para reportar bugs ou sugerir melhorias, abra uma issue.

---

## 📄 Licença

ISC
