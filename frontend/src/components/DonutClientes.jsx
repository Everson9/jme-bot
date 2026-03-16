// src/components/DonutClientes.jsx
import React from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

export const DonutClientes = ({ ativos, cancelados, pendentes, promessas, instalacoes }) => {
  const total = ativos + cancelados;
  if (!total) return null;

  const pagos = Math.max(0, ativos - pendentes - promessas);
  const data = [
    { name: "Pagos", value: pagos, color: "#22c55e" },
    { name: "Pendentes", value: pendentes, color: "#f59e0b" },
    { name: "Promessas", value: promessas, color: "#a78bfa" },
    { name: "Cancelados", value: cancelados, color: "#ef4444" },
    { name: "Instalações", value: instalacoes || 0, color: "#38bdf8" }
  ].filter((d) => d.value > 0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <PieChart width={130} height={130}>
        <Pie
          data={data}
          cx={60}
          cy={60}
          innerRadius={38}
          outerRadius={58}
          dataKey="value"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const { name, value, fill } = payload[0];
            return (
              <div
                style={{
                  background: "#0f1117",
                  border: `1px solid ${fill}55`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  color: fill,
                  fontWeight: 700,
                  boxShadow: `0 0 12px ${fill}33`
                }}
              >
                {name}: {value}
              </div>
            );
          }}
        />
      </PieChart>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {data.map((d) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: d.color,
                flexShrink: 0
              }}
            />
            <span style={{ color: "#94a3b8" }}>{d.name}</span>
            <span style={{ fontWeight: 700, color: "#e2e8f0", marginLeft: "auto", paddingLeft: 8 }}>
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};