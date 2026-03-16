// src/constants/index.js

// Cores e labels para status de clientes
export const STATUS_CLIENTE = {
  pago: { 
    label: "Pago", 
    cor: "#22c55e", 
    bg: "rgba(34,197,94,0.15)",
    icon: "✅" 
  },
  pendente: { 
    label: "Pendente", 
    cor: "#f59e0b", 
    bg: "rgba(245,158,11,0.15)",
    icon: "⏳" 
  },
  promessa: { 
    label: "Promessa", 
    cor: "#a78bfa", 
    bg: "rgba(167,139,250,0.15)",
    icon: "🤝" 
  },
  cancelado: { 
    label: "Cancelado", 
    cor: "#ef4444", 
    bg: "rgba(239,68,68,0.15)",
    icon: "❌" 
  }
};

// Cores e labels para intenções do bot
export const INTENCAO_LABEL = {
  SUPORTE: { label: "Suporte", cor: "#ef4444", emoji: "🔧" },
  FINANCEIRO: { label: "Financeiro", cor: "#f59e0b", emoji: "💰" },
  PIX: { label: "Pix", cor: "#10b981", emoji: "💸" },
  BOLETO: { label: "Boleto", cor: "#3b82f6", emoji: "📄" },
  CARNE: { label: "Carnê", cor: "#8b5cf6", emoji: "📋" },
  DINHEIRO: { label: "Dinheiro", cor: "#f97316", emoji: "💵" },
  PROMESSA: { label: "Promessa", cor: "#ec4899", emoji: "🤝" },
  NOVO_CLIENTE: { label: "Novo Cliente", cor: "#06b6d4", emoji: "👤" },
  CANCELAMENTO: { label: "Cancelamento", cor: "#ef4444", emoji: "❌" },
  SAUDACAO: { label: "Saudação", cor: "#6b7280", emoji: "👋" },
  OUTRO: { label: "Outro", cor: "#4b5563", emoji: "💬" },
  SENHA_ROTEADOR: { label: "Senha Roteador", cor: "#f472b6", emoji: "🔐" }
};

// Lista de todas as intenções
export const INTENCOES = Object.keys(INTENCAO_LABEL);

// Status da rede
export const REDE_LABELS = {
  normal: { label: "Normal", cor: "#22c55e", emoji: "🟢" },
  instavel: { label: "Instável", cor: "#f59e0b", emoji: "⚠️" },
  manutencao: { label: "Manutenção", cor: "#f59e0b", emoji: "🔧" },
  fibra_rompida: { label: "Fibra Rompida", cor: "#ef4444", emoji: "🔴" }
};

// Tipos de cobrança
export const TIPOS_COBRANCA = [
  { value: "", label: "🔄 Automático (por data)" },
  { value: "lembrete", label: "🔔 Lembrete (D-1)" },
  { value: "atraso", label: "⏰ Atraso (D+3)" },
  { value: "atraso_final", label: "🔴 Atraso Final (D+5)" },
  { value: "reconquista", label: "📞 Reconquista 1 (D+7)" },
  { value: "reconquista_final", label: "🚨 Reconquista Final (D+10)" }
];

// Motivos de cancelamento
export const MOTIVOS_CANCELAMENTO = [
  "Problemas financeiros",
  "Qualidade do serviço",
  "Mudança de endereço",
  "Contratei outro provedor",
  "Outro motivo"
];

// Planos disponíveis
export const PLANOS = [
  "Cabo 50MB — R$50",
  "Fibra 200MB — R$60",
  "Fibra 200MB + IPTV — R$70"
];

// Dias de vencimento
export const DIAS_VENCIMENTO = [10, 20, 30];

// Cores para formas de pagamento
export const CORES_PAGAMENTO = {
  pix: "#4ade80",
  boleto: "#38bdf8",
  dinheiro: "#f59e0b",
  cartão: "#a78bfa",
  carnê: "#f97316",
  efi: "#22d3ee"
};

// Status de instalação
export const STATUS_INSTALACAO = {
  solicitado: { label: "Solicitado", cor: "#f59e0b" },
  confirmado: { label: "Confirmado", cor: "#3b82f6" },
  finalizado: { label: "Finalizado", cor: "#22c55e" },
  cancelado: { label: "Cancelado", cor: "#ef4444" }
};

// Status de cancelamento
export const STATUS_CANCELAMENTO = {
  solicitado: { label: "Solicitado", cor: "#f59e0b" },
  confirmado: { label: "Confirmado", cor: "#f87171" },
  desistiu: { label: "Desistiu", cor: "#4ade80" }
};

// Status de carnê
export const STATUS_CARNE = {
  solicitado: { label: "Solicitado", cor: "#f59e0b", emoji: "📋" },
  impresso: { label: "Impresso", cor: "#a78bfa", emoji: "🖨️" },
  entregue: { label: "Entregue", cor: "#38bdf8", emoji: "🚚" },
  concluido: { label: "Concluído", cor: "#22c55e", emoji: "✅" }
};

// Status de chamados
export const STATUS_CHAMADO = {
  aberto: { label: "Aberto", cor: "#ef4444", dot: "🔴" },
  em_atendimento: { label: "Em atendimento", cor: "#f59e0b", dot: "🟡" },
  fechado: { label: "Fechado", cor: "#22c55e", dot: "✅" }
};

// Labels para fluxos do bot
export const FLUXO_LABEL = {
  suporte: { label: "Suporte", cor: "#f59e0b", emoji: "🔧" },
  financeiro: { label: "Financeiro", cor: "#10b981", emoji: "💰" },
  promessa: { label: "Promessa", cor: "#a78bfa", emoji: "🤝" },
  novoCliente: { label: "Novo Cliente", cor: "#38bdf8", emoji: "👤" },
  comprovantePendente: { label: "Comprovante", cor: "#fb923c", emoji: "🧾" },
  cancelamento: { label: "Cancelamento", cor: "#ef4444", emoji: "❌" }
};

// Ícones para direção do log
export const TIPO_ICON = {
  texto: "💬",
  audio: "🎙️",
  imagem: "🖼️",
  classificacao: "🧠",
  estado: "🔀",
  erro: "❌"
};

// Cores para direção do log
export const DIR_COLOR = {
  entrada: "#3b82f6",
  saida: "#22c55e",
  decisao: "#f59e0b"
};