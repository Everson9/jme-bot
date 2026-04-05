// src/components/BadgeCliente.jsx
import React from 'react';

const STATUS_CLIENTE = {
  pago: { label: "Pago", cls: "badge-pago", emoji: "✅" },
  pendente: { label: "Pendente", cls: "badge-pendente", emoji: "⏳" },
  promessa: { label: "Promessa", cls: "badge-promessa", emoji: "🤝" },
  cancelado: { label: "Cancelado", cls: "badge-cancelado", emoji: "❌" },
  inadimplente: { label: "Inadimplente", cls: "badge-inadimplente", emoji: "🔴" }
};

export const BadgeCliente = ({ status }) => {
  const s = STATUS_CLIENTE[status] || STATUS_CLIENTE.pendente;
  return <span className={`badge ${s.cls}`}>{s.emoji} {s.label}</span>;
};
