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
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Assignments</h3>
          <p className="text-xs text-text-muted">{filteredAssignments.length} total · View and manage team assignments</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
              <th className="py-2 pr-4">Assignee</th>
              <th className="py-2 pr-4">Object</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Note</th>
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
                  <div className="text-xs text-text-muted truncate max-w-[200px]">{item.object_id}</div>
                </td>
                <td className="py-3 pr-4">
                  <Select
                    value={item.status || 'open'}
                    onChange={(e) => api.updateAssignment(item.id, { status: e.target.value }).then(fetchAll)}
                    className="text-xs w-28"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </td>
                <td className="py-3 pr-4 text-xs text-text-muted max-w-[200px] truncate">{item.note || '-'}</td>
                <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.updated_at)}</td>
                <td className="py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-500 hover:text-rose-600"
                    onClick={() => api.deleteAssignment(item.id).then(fetchAll)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {filteredAssignments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-text-muted">
                  No assignments found. Create from Logs or Trace Detail.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderMentions = () => (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Mentions</h3>
          <p className="text-xs text-text-muted">{filteredMentions.length} total · Notifications sent to teammates</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
              <th className="py-2 pr-4">Mentioned</th>
              <th className="py-2 pr-4">Object</th>
              <th className="py-2 pr-4">Note</th>
              <th className="py-2 pr-4">Acknowledged</th>
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
                  <div className="text-xs text-text-muted truncate max-w-[200px]">{item.object_id}</div>
                </td>
                <td className="py-3 pr-4 text-xs text-text-muted max-w-[200px] truncate">{item.note || '-'}</td>
                <td className="py-3 pr-4">
                  <Badge variant={item.acknowledged_at ? 'success' : 'warning'}>
                    {item.acknowledged_at ? 'Yes' : 'No'}
                  </Badge>
                </td>
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
                <td colSpan={6} className="py-8 text-center text-sm text-text-muted">
                  No mentions found. Create from Logs or Trace Detail.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const handleCopyToken = async (token: string) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(token);
  };

  const renderShareLinks = () => (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Share Links</h3>
          <p className="text-xs text-text-muted">{filteredShareLinks.length} total · Shareable links for project artifacts</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border-base">
              <th className="py-2 pr-4">Token</th>
              <th className="py-2 pr-4">Object</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Expires</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredShareLinks.map((item) => {
              const isExpired = item.expires_at && item.expires_at < Date.now();
              return (
                <tr key={item.id} className="border-b border-border-base/60 last:border-0">
                  <td className="py-3 pr-4 text-text-main font-mono text-xs">{item.token}</td>
                  <td className="py-3 pr-4">
                    <div className="text-text-main">{item.object_type}</div>
                    <div className="text-xs text-text-muted truncate max-w-[200px]">{item.object_id}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={isExpired ? 'danger' : item.revoked_at ? 'neutral' : 'success'}>
                      {isExpired ? 'Expired' : item.revoked_at ? 'Revoked' : 'Active'}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.expires_at)}</td>
                  <td className="py-3 pr-4 text-xs text-text-muted">{formatTimestamp(item.created_at)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleCopyToken(item.token)}>
                        Copy
                      </Button>
                      {!item.revoked_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-500 hover:text-rose-600"
                          onClick={() => api.revokeShareLink(item.token).then(fetchAll)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredShareLinks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-text-muted">
                  No share links found. Create from Logs or Trace Detail.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderBody = () => {
    if (activeTab === 'assignments') return renderAssignments();
    if (activeTab === 'mentions') return renderMentions();
    return renderShareLinks();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border-hairline">
        <div className="px-6 py-4 space-y-4">
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

      <div className="flex-1 overflow-y-auto p-6">
        {renderBody()}
      </div>
    </div>
  );
};

export default Collaboration;
