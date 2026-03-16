// src/components/Pagination.jsx
import React from 'react';

export function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const isMobile = window.innerWidth <= 768;
    const maxButtons = isMobile ? 3 : 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
    }

    return (
        <div className="pagination">
            <button
                className="page-btn"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
            >
                ← Anterior
            </button>

            {startPage > 1 && (
                <>
                    <button className="page-btn" onClick={() => onPageChange(1)}>1</button>
                    {startPage > 2 && <span className="page-dots">...</span>}
                </>
            )}

            {pages.map(page => (
                <button
                    key={page}
                    className={`page-btn ${currentPage === page ? 'page-active' : ''}`}
                    onClick={() => onPageChange(page)}
                >
                    {page}
                </button>
            ))}

            {endPage < totalPages && (
                <>
                    {endPage < totalPages - 1 && <span className="page-dots">...</span>}
                    <button className="page-btn" onClick={() => onPageChange(totalPages)}>
                        {totalPages}
                    </button>
                </>
            )}

            <button
                className="page-btn"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
            >
                Próxima →
            </button>

            <style jsx>{`
                .pagination {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    align-items: center;
                    gap: 5px;
                    padding: 1rem;
                    margin-top: 1rem;
                }
                
                .page-btn {
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid var(--border);
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all .15s;
                    min-width: 40px;
                }
                
                .page-btn:hover:not(:disabled) {
                    background: var(--blue);
                    color: white;
                    border-color: var(--blue);
                }
                
                .page-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .page-active {
                    background: var(--blue);
                    color: white;
                    border-color: var(--blue);
                }
                
                .page-dots {
                    color: var(--text-muted);
                    padding: 0 5px;
                }
                
                @media (max-width: 768px) {
                    .pagination {
                        gap: 3px;
                    }
                    .page-btn {
                        padding: 6px 8px;
                        font-size: 12px;
                        min-width: 32px;
                    }
                }
            `}</style>
        </div>
    );
}