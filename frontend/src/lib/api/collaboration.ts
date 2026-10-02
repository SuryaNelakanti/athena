import { API_BASE_URL, requestJson } from './base';
import type {
    Attachment,
    AttachmentCreateInput,
    Assignment,
    AssignmentCreateInput,
    AssignmentUpdateInput,
    DeleteResult,
    Mention,
    MentionCreateInput,
    ShareLink,
    ShareLinkCreateInput,
} from '../../types';

export const collaborationApi = {
    // Attachments
    listAttachments: async (filters: { object_type?: string; object_id?: string; project_id?: string }): Promise<Attachment[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        return requestJson<Attachment[]>(`${API_BASE_URL}/attachments?${params.toString()}`, 'Failed to fetch attachments');
    },

    createAttachment: async (payload: AttachmentCreateInput): Promise<Attachment> => {
        return requestJson<Attachment>(`${API_BASE_URL}/attachments`, 'Failed to create attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    deleteAttachment: async (attachmentId: string): Promise<DeleteResult> => {
        return requestJson<DeleteResult>(`${API_BASE_URL}/attachments/${attachmentId}`, 'Failed to delete attachment', {
            method: 'DELETE',
        });
    },

    // Assignments
    listAssignments: async (filters: { object_type?: string; object_id?: string; project_id?: string; assignee?: string; status?: string }): Promise<Assignment[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        if (filters.assignee) params.append('assignee', filters.assignee);
        if (filters.status) params.append('status', filters.status);
        return requestJson<Assignment[]>(`${API_BASE_URL}/assignments?${params.toString()}`, 'Failed to fetch assignments');
    },

    createAssignment: async (payload: AssignmentCreateInput): Promise<Assignment> => {
        return requestJson<Assignment>(`${API_BASE_URL}/assignments`, 'Failed to create assignment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    updateAssignment: async (assignmentId: string, payload: AssignmentUpdateInput): Promise<Assignment> => {
        return requestJson<Assignment>(`${API_BASE_URL}/assignments/${assignmentId}`, 'Failed to update assignment', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    deleteAssignment: async (assignmentId: string): Promise<DeleteResult> => {
        return requestJson<DeleteResult>(`${API_BASE_URL}/assignments/${assignmentId}`, 'Failed to delete assignment', {
            method: 'DELETE',
        });
    },

    // Mentions
    listMentions: async (filters: { object_type?: string; object_id?: string; project_id?: string; mentioned?: string }): Promise<Mention[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        if (filters.mentioned) params.append('mentioned', filters.mentioned);
        return requestJson<Mention[]>(`${API_BASE_URL}/mentions?${params.toString()}`, 'Failed to fetch mentions');
    },

    createMention: async (payload: MentionCreateInput): Promise<Mention> => {
        return requestJson<Mention>(`${API_BASE_URL}/mentions`, 'Failed to create mention', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    deleteMention: async (mentionId: string): Promise<DeleteResult> => {
        return requestJson<DeleteResult>(`${API_BASE_URL}/mentions/${mentionId}`, 'Failed to delete mention', {
            method: 'DELETE',
        });
    },

    // Share links
    listShareLinks: async (filters: { object_type?: string; object_id?: string; project_id?: string }): Promise<ShareLink[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        return requestJson<ShareLink[]>(`${API_BASE_URL}/share-links?${params.toString()}`, 'Failed to fetch share links');
    },

    createShareLink: async (payload: ShareLinkCreateInput): Promise<ShareLink> => {
        return requestJson<ShareLink>(`${API_BASE_URL}/share-links`, 'Failed to create share link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    getShareLink: async (token: string): Promise<ShareLink> => {
        return requestJson<ShareLink>(`${API_BASE_URL}/share-links/${token}`, 'Failed to fetch share link');
    },

    revokeShareLink: async (token: string): Promise<ShareLink> => {
        return requestJson<ShareLink>(`${API_BASE_URL}/share-links/${token}`, 'Failed to revoke share link', {
            method: 'DELETE',
        });
    },
};
