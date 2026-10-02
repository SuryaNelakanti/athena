export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export const requestJson = async <T>(
    url: string,
    errorMessage: string,
    init?: RequestInit
): Promise<T> => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(errorMessage);
    return (await response.json()) as T;
};

export const requestVoid = async (
    url: string,
    errorMessage: string,
    init?: RequestInit
): Promise<void> => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(errorMessage);
};
