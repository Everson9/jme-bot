// src/components/DarkTooltip.jsx
import React from 'react';
import { fmtDia } from '../utils/formatadores';

export const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d1a2e",
      border: "1px solid #1e3a5f",
      borderRadius: 8,
      padding: "8px 14px",
      color: "#e2e8f0",
      fontSize: 13
    }}>
      <div style={{ color: "#94a3b8", marginBottom: 4, fontSize: 11 }}>
        {fmtDia(label)}
      </div>
      <div style={{ fontWeight: 600 }}>{payload[0].value}</div>
    </div>
  );
};