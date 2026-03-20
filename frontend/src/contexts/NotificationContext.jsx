// src/contexts/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSSEData } from '../hooks/useSSEData';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    
    // Carrega alertas só ao montar e quando SSE notifica mudança de clientes/chamados/promessas
    const { data: alertas } = useSSEData('/api/dashboard/alertas', 'alertas');

    useEffect(() => {
        if (alertas) {
            const novasNotificacoes = [];
            
            // Promessas de hoje
            if (alertas.promessasHoje > 0) {
                novasNotificacoes.push({
                    id: 'promessas-hoje',
                    type: 'warning',
                    title: 'Promessas para hoje',
                    message: `${alertas.promessasHoje} cliente(s) prometeram pagar hoje`,
                    time: new Date().toLocaleTimeString()
                });
            }
            
            // Promessas de amanhã
            if (alertas.promessasAmanha > 0) {
                novasNotificacoes.push({
                    id: 'promessas-amanha',
                    type: 'info',
                    title: 'Promessas para amanhã',
                    message: `${alertas.promessasAmanha} cliente(s) prometeram pagar amanhã`,
                    time: new Date().toLocaleTimeString()
                });
            }
            
            // Inadimplentes
            if (alertas.inadimplentes > 0) {
                novasNotificacoes.push({
                    id: 'inadimplentes',
                    type: 'error',
                    title: 'Clientes inadimplentes',
                    message: `${alertas.inadimplentes} cliente(s) com mais de 5 dias de atraso`,
                    time: new Date().toLocaleTimeString()
                });
            }
            
            // Chamados abertos
            if (alertas.chamadosAbertos > 0) {
                novasNotificacoes.push({
                    id: 'chamados',
                    type: 'info',
                    title: 'Chamados antigos',
                    message: `${alertas.chamadosAbertos} chamado(s) abertos há mais de 24h`,
                    time: new Date().toLocaleTimeString()
                });
            }

            setNotifications(novasNotificacoes);
            setUnreadCount(novasNotificacoes.length);
        }
    }, [alertas]);

    const markAsRead = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const markAllAsRead = () => {
        setNotifications([]);
        setUnreadCount(0);
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            alertasData: alertas  // dados brutos para o dashboard
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationContext);
}