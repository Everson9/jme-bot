# Painel Admin JME-BOT

Interface administrativa do JME-BOT para gestão de clientes, cobranças e atendimentos.

## 📋 Visão Geral

Painel administrativo desenvolvido com React + Vite que se conecta com a API do bot via REST e SSE para atualizações em tempo real.

## ✅ Funcionalidades

### Dashboard
- 📊 Estatísticas gerais em tempo real
- 📈 Gráficos de clientes ativos, inadimplentes, promessas
- 📅 Agendamentos do dia
- 🔴 Status do bot WhatsApp (online/offline)
- 🔔 Notificações em tempo real

### Gestão
- 👥 Listagem e gestão de clientes
- 💰 Promessas de pagamento
- 📅 Agendamentos de instalação e suporte
- 🚩 Inadimplentes
- 📋 Instalações agendadas
- 💳 Cobranças manuais

### Operacional
- 📄 Backup e exportação de dados
- 📝 Logs do sistema
- 🔌 Status da conexão WhatsApp
- 🖼️ QR Code para conexão
- 📊 Estatísticas por base

## 🛠️ Tecnologias

| Ferramenta | Versão | Descrição |
|------------|--------|-----------|
| React | 18.x | Framework principal |
| Vite | 5.x | Bundler e dev server |
| React Router DOM | 7.x | Navegação entre páginas |
| Recharts | 2.x | Gráficos e visualizações |
| React Icons | 5.x | Ícones |
| SSE | Nativo | Atualizações em tempo real |

## 🚀 Instalação e Uso

### Desenvolvimento

```bash
cd frontend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: `http://localhost:5173`

### Build para Produção

```bash
npm run build

# Preview do build
npm run preview
```

## 📂 Estrutura do Projeto

```
frontend/
├── src/
│   ├── main.jsx                 # Entry point
│   ├── App.jsx                  # App principal com rotas
│   ├── index.css                # Estilos globais
│   │
│   ├── pages/                   # Páginas do painel
│   │   ├── dashboard.jsx        # Página inicial
│   │   ├── clientes.jsx         # Listagem de clientes
│   │   ├── promessas.jsx        # Promessas de pagamento
│   │   ├── agendamentos.jsx     # Agendamentos
│   │   ├── inadimplentes.jsx    # Inadimplentes
│   │   ├── cobranca.jsx         # Cobranças
│   │   ├── backup.jsx           # Backup e exportação
│   │   ├── logs.jsx             # Logs do sistema
│   │   ├── qr.jsx               # QR Code WhatsApp
│   │   └── boasvindas.jsx       # Página inicial
│   │
│   ├── components/              # Componentes reutilizáveis
│   │   ├── TopNav.jsx           # Barra superior
│   │   ├── Card.jsx             # Card genérico
│   │   ├── StatusBadge.jsx      # Badge de status
│   │   ├── BadgeCliente.jsx     # Badge de cliente
│   │   ├── BuscaGlobal.jsx      # Busca global
│   │   ├── Pagination.jsx       # Paginação
│   │   ├── ModalEditarCliente.jsx
│   │   ├── ModalNovaPromessa.jsx
│   │   ├── Spinner.jsx
│   │   └── NotificationBell.jsx
│   │
│   ├── contexts/                # Context API
│   │   ├── ThemeContext.jsx     # Tema dark/light
│   │   └── NotificationContext.jsx # Notificações
│   │
│   ├── hooks/                   # Custom Hooks
│   │   ├── useFetch.js          # Hook para requisições API
│   │   ├── usePagination.js     # Hook para paginação
│   │   └── useSSEData.js        # Hook para SSE em tempo real
│   │
│   ├── api/                     # Cliente API
│   │   └── client.js            # Wrapper fetch com API Key
│   │
│   ├── utils/                   # Utilitários
│   │   ├── formatadores.js      # Formatação de valores, datas
│   │   └── validadores.js       # Validação de CPF, telefone
│   │
│   └── constants/
│       └── index.js             # Constantes compartilhadas
│
├── public/                      # Arquivos estáticos
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```

## 🔌 Integração com Backend

### Variáveis de Ambiente

```env
# .env.local
VITE_API_URL=http://localhost:3001
VITE_ADMIN_API_KEY=sua-chave-api-aqui
```

### Cliente API

```javascript
// src/api/client.js
const apiClient = {
  baseUrl: import.meta.env.VITE_API_URL,
  
  async get(endpoint) {
    const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
      headers: {
        'x-api-key': import.meta.env.VITE_ADMIN_API_KEY
      }
    });
    return response.json();
  },
  
  async post(endpoint, data) {
    // ...
  }
};
```

### SSE (Atualizações em Tempo Real)

```javascript
// src/hooks/useSSEData.js
const useSSEData = () => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    const eventSource = new EventSource(`${apiUrl}/api/status-stream`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data);
    };
    
    return () => eventSource.close();
  }, []);
  
  return status;
};
```

## 🎨 Estilos e Temas

### Temas
- ✅ Tema claro padrão
- ✅ Tema escuro (dark mode)
- ✅ Toggle no menu superior
- ✅ Persistência no localStorage

### Design System
- Cores consistentes
- Espaçamentos padrão
- Componentes reutilizáveis
- Responsivo para mobile

## 🚀 Deploy

### Vercel (Recomendado)

```bash
# Instale Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Outros Provedores

```bash
# Build estático
npm run build

# A pasta dist/ pode ser servida em qualquer CDN
```

## ⚡ Otimizações

### ✅ Implementadas
- Lazy loading de páginas
- Memoização de componentes
- SSE ao invés de polling
- Build otimizado com Vite
- Cache de requisições
- Pagination em todas listagens

### 🚧 Planejadas
- Virtualização de listas grandes
- Prefetch de dados
- Service Worker
- PWA

## 🔒 Segurança

⚠️ **IMPORTANTE**:
- `VITE_ADMIN_API_KEY` **NÃO É UM SEGREDO** - qualquer usuário do painel consegue extrair do bundle
- Em produção, sempre proteja o painel com:
  - Basic Auth no proxy
  - IP Whitelist
  - Autenticação por login (futuro)
- Nunca exponha o painel publicamente sem proteção adicional

## 🧪 Testes

```bash
# Verificar se build funciona
npm run build

# Rodar preview
npm run preview
```

### Testes Automáticos (TODO)
- [ ] Vitest
- [ ] Testing Library
- [ ] E2E com Playwright
- [ ] Coverage mínimo 70%

## ✅ Checklist Antes de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] API URL apontando para produção
- [ ] ADMIN_API_KEY configurada corretamente
- [ ] CORS habilitado no backend
- [ ] Build passa sem erros
- [ ] SSE funciona
- [ ] Testado em Chrome, Firefox e Safari

## 🐛 Debugging

### Problemas Comuns

#### 🔴 SSE não conecta
- Verifique se CORS está habilitado no backend
- Verifique headers de SSE (no cache, connection keep-alive)
- Verifique se não há proxy cortando conexão longa

#### 🔴 API retorna 401
- Verifique `VITE_ADMIN_API_KEY`
- Verifique se header `x-api-key` está sendo enviado
- Verifique se chave é igual no backend

#### 🔴 Atualizações em tempo real não funcionam
- Verifique status do bot no backend
- Verifique eventos sendo emitidos
- Abra DevTools > Network > EventStream

## 📚 Documentação Relacionada

- [API Documentation](../docs/API.md)
- [Arquitetura](../docs/ARCHITECTURE.md)
- [Segurança](../.cursor/skills/seguranca-segredos-painel-admin/SKILL.md)

---

**Última atualização**: 2024-05-20
