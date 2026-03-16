// src/components/Badge.jsx
import React from 'react';

export const Badge = ({ type }) => {
  const map = { 
    pago: ["badge-pago", "PAGO"], 
    pendente: ["badge-pendente", "PENDENTE"] 
  };
  const [cls, label] = map[type] || ["badge-neutro", type];
  return <span className={`badge ${cls}`}>{label}</span>;
};