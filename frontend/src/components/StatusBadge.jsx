// src/components/StatusBadge.jsx
export function StatusBadge({ status }) {
    const config = {
        agendado: { class: 'badge-pendente', label: 'Agendado' },
        concluido: { class: 'badge-pago', label: 'Concluído' },
        cancelado: { class: 'badge-vencida', label: 'Cancelado' }
    };

    const badge = config[status] || { class: '', label: status };
    
    return (
        <span className={`badge ${badge.class}`}>
            {badge.label}
        </span>
    );
}