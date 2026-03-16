// src/utils/formatadores.js

// Formata data para exibição
export const fmtDate = (s) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", { 
      dateStyle: "short", 
      timeStyle: "short" 
    });
  } catch {
    return "—";
  }
};

// Formata data para os gráficos
export const fmtDia = (s) => {
  if (!s) return "";
  return s; // Já vem formatado da API como DD/MM
};

// Formata número de telefone (remove sufixo do WhatsApp)
export const fmtTel = (n) => {
  if (!n) return "—";
  return n.replace("@c.us", "").replace(/^55/, "") || "—";
};

// Formata valor monetário
export const fmtMoeda = (v) => {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(v);
};

// Formata data para input type="date"
export const fmtDataInput = (data) => {
  if (!data) return "";
  const d = new Date(data);
  return d.toISOString().split('T')[0];
};

// Extrai apenas a data (sem hora)
export const fmtDataCurta = (data) => {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
};

// Formata tempo decorrido
export const tempoDecorrido = (timestamp) => {
  if (!timestamp) return "—";
  
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutos = Math.floor(diff / 60000);
  
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos}min`;
  
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h ${minutos % 60}min`;
  
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
};

// Capitaliza primeira letra
export const capitalizar = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Remove acentos
export const removerAcentos = (str) => {
  if (!str) return "";
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
};

// Trunca texto
export const truncar = (str, tamanho = 50) => {
  if (!str) return "";
  if (str.length <= tamanho) return str;
  return str.substring(0, tamanho) + "...";
};