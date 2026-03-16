// src/components/NotificationBell.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const bellRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (bellRef.current && !bellRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getTypeIcon = (type) => {
        switch(type) {
            case 'warning': return '⚠️';
            case 'error': return '❌';
            case 'info': return 'ℹ️';
            default: return '📌';
        }
    };

    const getTypeColor = (type) => {
        switch(type) {
            case 'warning': return '#f59e0b';
            case 'error': return '#ef4444';
            case 'info': return '#38bdf8';
            default: return '#64748b';
        }
    };

    return (
        <div className="notification-bell" ref={bellRef}>
            <button 
                className="bell-icon" 
                onClick={() => setIsOpen(!isOpen)}
                style={{ position: 'relative' }}
            >
                🔔
                {unreadCount > 0 && (
                    <span className="bell-count">{unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notificações</h3>
                        {notifications.length > 0 && (
                            <button onClick={markAllAsRead} className="mark-all-read">
                                Limpar todas
                            </button>
                        )}
                    </div>

                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="notification-empty">
                                Nenhuma notificação
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div 
                                    key={notif.id} 
                                    className="notification-item"
                                    style={{ borderLeftColor: getTypeColor(notif.type) }}
                                >
                                    <div className="notification-icon">
                                        {getTypeIcon(notif.type)}
                                    </div>
                                    <div className="notification-content">
                                        <div className="notification-title">{notif.title}</div>
                                        <div className="notification-message">{notif.message}</div>
                                        <div className="notification-time">{notif.time}</div>
                                    </div>
                                    <button 
                                        className="notification-close"
                                        onClick={() => markAsRead(notif.id)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                .notification-bell {
                    position: relative;
                }
                
                .bell-icon {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 8px;
                    color: var(--text-secondary);
                    position: relative;
                }
                
                .bell-count {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: var(--red);
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                    min-width: 16px;
                    height: 16px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .notification-dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    width: 360px;
                    max-width: 90vw;
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                    z-index: 1000;
                    margin-top: 5px;
                }
                
                .notification-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border);
                }
                
                .notification-header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                
                .mark-all-read {
                    background: none;
                    border: none;
                    color: var(--blue);
                    font-size: 12px;
                    cursor: pointer;
                    padding: 4px 8px;
                }
                
                .notification-list {
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .notification-item {
                    display: flex;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border);
                    border-left: 3px solid transparent;
                    transition: background .15s;
                }
                
                .notification-item:hover {
                    background: rgba(255,255,255,0.03);
                }
                
                .notification-icon {
                    margin-right: 12px;
                    font-size: 18px;
                }
                
                .notification-content {
                    flex: 1;
                }
                
                .notification-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 2px;
                }
                
                .notification-message {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                
                .notification-time {
                    font-size: 10px;
                    color: var(--text-muted);
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-size: 16px;
                    cursor: pointer;
                    padding: 0 4px;
                    align-self: flex-start;
                }
                
                .notification-empty {
                    padding: 30px;
                    text-align: center;
                    color: var(--text-muted);
                    font-style: italic;
                }
                
                @media (max-width: 768px) {
                    .notification-dropdown {
                        position: fixed;
                        top: 52px;
                        left: 0;
                        right: 0;
                        width: 100%;
                        max-width: 100%;
                        border-radius: 0;
                    }
                }
            `}</style>
        </div>
    );
}