import { Project, Trace } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export async function fetchProjects(): Promise<Project[]> {
    const response = await fetch(`${API_BASE_URL}/projects`);
    if (!response.ok) {
        throw new Error('Failed to fetch projects');
    }
    return response.json();
}

export async function fetchTraces(projectId: string): Promise<Trace[]> {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/traces`);
    if (!response.ok) {
        throw new Error('Failed to fetch traces');
    }
    return response.json();
}
