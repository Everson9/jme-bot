// src/components/BadgeIntencao.jsx
import React from 'react';
import { INTENCAO_LABEL } from '../constants';

export const BadgeIntencao = ({ intencao }) => {
  if (!intencao) return null;
  
  const meta = INTENCAO_LABEL[intencao] || { 
    label: intencao, 
    color: "#6b7280" 
  };
  
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: meta.color + "22",
      color: meta.color,
      letterSpacing: "0.03em"
    }}>
      {meta.label}
    </span>
  );
};
