export interface ViewFilter {
    id: string;
    field: string;
    op: string;
    value: string;
}

export interface ViewConfig {
    filters?: ViewFilter[];
    query?: string;
    level?: string;
    search?: string;
    [key: string]: unknown;
}

export interface View {
    id: string;
    project_id: string;
    name: string;
    entity_type?: string;
    config: ViewConfig;
    created_at: number;
}
