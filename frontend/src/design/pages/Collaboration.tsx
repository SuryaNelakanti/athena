import React, { useEffect, useMemo, useState } from 'react';
import { Assignment, Mention, ShareLink } from '../../types';
import { api } from '../../services/api';
import { Badge, Button, Card, Input, SectionHeader, Select, Tabs, Textarea } from '../ui';

type TabKey = 'assignments' | 'mentions' | 'share_links';

const tabOptions = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'share_links', label: 'Share Links' },
];

const formatTimestamp = (value?: number | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

interface CollaborationProps {
  projectId: string;
}

const Collaboration: React.FC<CollaborationProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('assignments');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);

  const [assignmentForm, setAssignmentForm] = useState({
    object_type: 'trace',
    object_id: '',
    assignee: '',
    status: 'open',
    note: '',
  });

  const [mentionForm, setMentionForm] = useState({
    object_type: 'trace',
    object_id: '',
    mentioned: '',
    note: '',
  });

  const [shareForm, setShareForm] = useState({
    object_type: 'trace',
    object_id: '',
    expires_at: '',
  });

  const fetchAll = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [assignmentRows, mentionRows, shareRows] = await Promise.all([
        api.listAssignments({ project_id: projectId }),
        api.listMentions({ project_id: projectId }),
        api.listShareLinks({ project_id: projectId }),
      ]);
      setAssignments(assignmentRows);
      setMentions(mentionRows);
      setShareLinks(shareRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [projectId]);

  const handleCreateAssignment = async () => {
    if (!assignmentForm.object_id || !assignmentForm.assignee) return;
    await api.createAssignment({
      project_id: projectId,
      object_type: assignmentForm.object_type,
      object_id: assignmentForm.object_id,
      assignee: assignmentForm.assignee,
      status: assignmentForm.status,
      note: assignmentForm.note || undefined,
    });
    setAssignmentForm({ ...assignmentForm, object_id: '', assignee: '', note: '' });
    fetchAll();
  };

  const handleCreateMention = async () => {
    if (!mentionForm.object_id || !mentionForm.mentioned) return;
    await api.createMention({
      project_id: projectId,
      object_type: mentionForm.object_type,
      object_id: mentionForm.object_id,
      mentioned: mentionForm.mentioned,
      note: mentionForm.note || undefined,
    });
    setMentionForm({ ...mentionForm, object_id: '', mentioned: '', note: '' });
    fetchAll();
  };

  const handleCreateShareLink = async () => {
    if (!shareForm.object_id) return;
    const expiresAt = shareForm.expires_at ? new Date(shareForm.expires_at).getTime() : undefined;
    await api.createShareLink({
      project_id: projectId,
      object_type: shareForm.object_type,
      object_id: shareForm.object_id,
      expires_at: expiresAt,
    });
    setShareForm({ ...shareForm, object_id: '', expires_at: '' });
    fetchAll();
  };

  const filteredAssignments = useMemo(() => {
    if (!search) return assignments;
    const needle = search.toLowerCase();
    return assignments.filter((item) =>
      [item.object_id, item.object_type, item.assignee, item.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [assignments, search]);

  const filteredMentions = useMemo(() => {
    if (!search) return mentions;
    const needle = search.toLowerCase();
    return mentions.filter((item) =>
      [item.object_id, item.object_type, item.mentioned, item.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [mentions, search]);

  const filteredShareLinks = useMemo(() => {
    if (!search) return shareLinks;
    const needle = search.toLowerCase();
    return shareLinks.filter((item) =>
      [item.object_id, item.object_type, item.token]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [shareLinks, search]);

  const statusBadge = (status?: string) => {
    if (status === 'resolved') return <Badge variant="success">Resolved</Badge>;
    return <Badge variant="primary">Open</Badge>;
  };

  const renderAssignments = () => (
    <div className="grid lg:grid-cols-[360px,1fr] gap-6">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">New Assignment</h3>
          <p className="text-xs text-text-muted">Assign a record to a teammate.</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-text-muted">Object Type</label>
              <Input
                value={assignmentForm.object_type}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, object_type: e.target.value })}
                placeholder="trace | log | dataset_row"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-muted">Status</label>
              <Select
                value={assignmentForm.status}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, status: e.target.value })}
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Object ID</label>
            <Input
              value={assignmentForm.object_id}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, object_id: e.target.value })}
              placeholder="trace_..."
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Assignee</label>
            <Input
              value={assignmentForm.assignee}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, assignee: e.target.value })}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Note</label>
            <Textarea
              rows={3}
              value={assignmentForm.note}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, note: e.target.value })}
              placeholder="Add context for the assignee"
            />
          </div>
        </div>
        <Button variant="primary" onClick={handleCreateAssignment}>
          Create Assignment
        </Button>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-main">Assignments</h3>
            <p className="text-xs text-text-muted">{filteredAssignments.length} total</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
                <th className="py-2 pr-4">Assignee</th>
                <th className="py-2 pr-4">Object</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((item) => (
                <tr key={item.id} className="border-b border-border-base/60 last:border-0">
                  <td className="py-3 pr-4 text-text-main font-medium">{item.assignee}</td>
                  <td className="py-3 pr-4">
                    <div className="text-text-main">{item.object_type}</div>
                    <div className="text-xs text-text-muted">{item.object_id}</div>
                  </td>
                  <td className="py-3 pr-4">{statusBadge(item.status)}</td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.updated_at)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => api.updateAssignment(item.id, { status: item.status === 'resolved' ? 'open' : 'resolved' }).then(fetchAll)}
                      >
                        {item.status === 'resolved' ? 'Reopen' : 'Resolve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600"
                        onClick={() => api.deleteAssignment(item.id).then(fetchAll)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-text-muted">
                    No assignments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const renderMentions = () => (
    <div className="grid lg:grid-cols-[360px,1fr] gap-6">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">New Mention</h3>
          <p className="text-xs text-text-muted">Notify a teammate about a record.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-text-muted">Object Type</label>
            <Input
              value={mentionForm.object_type}
              onChange={(e) => setMentionForm({ ...mentionForm, object_type: e.target.value })}
              placeholder="trace | log | dataset_row"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Object ID</label>
            <Input
              value={mentionForm.object_id}
              onChange={(e) => setMentionForm({ ...mentionForm, object_id: e.target.value })}
              placeholder="trace_..."
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Mention</label>
            <Input
              value={mentionForm.mentioned}
              onChange={(e) => setMentionForm({ ...mentionForm, mentioned: e.target.value })}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Note</label>
            <Textarea
              rows={3}
              value={mentionForm.note}
              onChange={(e) => setMentionForm({ ...mentionForm, note: e.target.value })}
              placeholder="Add context for the mention"
            />
          </div>
        </div>
        <Button variant="primary" onClick={handleCreateMention}>
          Create Mention
        </Button>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-main">Mentions</h3>
            <p className="text-xs text-text-muted">{filteredMentions.length} total</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
                <th className="py-2 pr-4">Mentioned</th>
                <th className="py-2 pr-4">Object</th>
                <th className="py-2 pr-4">Note</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMentions.map((item) => (
                <tr key={item.id} className="border-b border-border-base/60 last:border-0">
                  <td className="py-3 pr-4 text-text-main font-medium">{item.mentioned}</td>
                  <td className="py-3 pr-4">
                    <div className="text-text-main">{item.object_type}</div>
                    <div className="text-xs text-text-muted">{item.object_id}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{item.note || '-'}</td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.created_at)}</td>
                  <td className="py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => api.deleteMention(item.id).then(fetchAll)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredMentions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-text-muted">
                    No mentions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const handleCopyToken = async (token: string) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(token);
  };

  const renderShareLinks = () => (
    <div className="grid lg:grid-cols-[360px,1fr] gap-6">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">New Share Link</h3>
          <p className="text-xs text-text-muted">Generate a shareable link token.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-text-muted">Object Type</label>
            <Input
              value={shareForm.object_type}
              onChange={(e) => setShareForm({ ...shareForm, object_type: e.target.value })}
              placeholder="trace | log | dataset_row"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Object ID</label>
            <Input
              value={shareForm.object_id}
              onChange={(e) => setShareForm({ ...shareForm, object_id: e.target.value })}
              placeholder="trace_..."
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted">Expires At</label>
            <Input
              type="datetime-local"
              value={shareForm.expires_at}
              onChange={(e) => setShareForm({ ...shareForm, expires_at: e.target.value })}
            />
          </div>
        </div>
        <Button variant="primary" onClick={handleCreateShareLink}>
          Create Share Link
        </Button>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-main">Share Links</h3>
            <p className="text-xs text-text-muted">{filteredShareLinks.length} total</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
                <th className="py-2 pr-4">Token</th>
                <th className="py-2 pr-4">Object</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShareLinks.map((item) => (
                <tr key={item.id} className="border-b border-border-base/60 last:border-0">
                  <td className="py-3 pr-4 text-text-main font-medium">{item.token}</td>
                  <td className="py-3 pr-4">
                    <div className="text-text-main">{item.object_type}</div>
                    <div className="text-xs text-text-muted">{item.object_id}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.expires_at)}</td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.created_at)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleCopyToken(item.token)}>
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600"
                        onClick={() => api.revokeShareLink(item.token).then(fetchAll)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredShareLinks.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-text-muted">
                    No share links found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const renderBody = () => {
    if (activeTab === 'assignments') return renderAssignments();
    if (activeTab === 'mentions') return renderMentions();
    return renderShareLinks();
  };

  return (
    <div className="h-full flex flex-col bg-app transition-colors duration-300">
      <div className="border-b border-border-base bg-panel">
        <div className="px-8 py-6 space-y-4">
          <SectionHeader
            title="Collaboration"
            subtitle="Assignments, mentions, and shareable links across project artifacts."
            actions={
              <Button variant="secondary" onClick={fetchAll} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs options={tabOptions} value={activeTab} onChange={(value) => setActiveTab(value as TabKey)} />
            <div className="min-w-[240px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by assignee, object, or token"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {renderBody()}
      </div>
    </div>
  );
};

export default Collaboration;
