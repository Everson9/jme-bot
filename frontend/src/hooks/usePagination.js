// src/hooks/usePagination.js
import { useState, useEffect, useCallback } from 'react';

export function usePagination(fetchFunction, pageSize = 20) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const loadPage = useCallback(async (page) => {
        setLoading(true);
        try {
            const result = await fetchFunction(page, pageSize);
            setData(result.data || []);
            setTotalPages(result.totalPages || 1);
            setTotalItems(result.total || 0);
            setError(null);
        } catch (err) {
            setError(err.message);
            console.error('Erro na paginação:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchFunction, pageSize]);

    useEffect(() => {
        loadPage(currentPage);
    }, [currentPage, loadPage]);

    function nextPage() {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    }

    function prevPage() {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    }

    return {
        data,
        loading,
        error,
        currentPage,
        totalPages,
        totalItems,
        nextPage,
        prevPage,
        setCurrentPage,
        refresh: () => loadPage(currentPage),
        reload: loadPage
    };
}