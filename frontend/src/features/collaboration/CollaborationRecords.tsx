import type { Assignment, Mention, ShareLink } from '../../types';

type CollaborationRecord = Assignment | Mention | ShareLink;
type CollaborationKind = 'assignment' | 'mention' | 'share-link';

interface CollaborationRecordsProps {
  kind: CollaborationKind;
  records: CollaborationRecord[];
}

function recordTitle(kind: CollaborationKind, record: CollaborationRecord) {
  if (kind === 'assignment' && 'assignee' in record) return record.assignee;
  if (kind === 'mention' && 'mentioned' in record) return record.mentioned;
  if (kind === 'share-link' && 'token' in record) return record.token;
  return '';
}

function recordDetail(kind: CollaborationKind, record: CollaborationRecord) {
  if (kind === 'assignment' && 'assignee' in record) {
    return `${record.object_type} · ${record.object_id} · ${record.status}`;
  }
  if (kind === 'mention' && 'mentioned' in record) {
    return `${record.object_type} · ${record.object_id}`;
  }
  if (kind === 'share-link' && 'token' in record) {
    return `${record.object_type} · ${record.object_id}`;
  }
  return '';
}

export function CollaborationRecords({ kind, records }: CollaborationRecordsProps) {
  if (!records.length) {
    return (
      <div className="rounded-lg border border-border-hairline bg-panel px-5 py-10 text-center text-sm text-text-muted">
        No {kind === 'share-link' ? 'share links' : `${kind}s`} for this project yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-hairline rounded-lg border border-border-hairline bg-panel">
      {records.map((record) => (
        <li key={record.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-main">{recordTitle(kind, record)}</p>
            <p className="mt-1 truncate text-xs text-text-muted">{recordDetail(kind, record)}</p>
          </div>
          {kind === 'share-link' && 'token' in record && (
            <a
              className="shrink-0 text-xs font-medium text-primary hover:underline"
              href={`/share-links/${record.token}`}
            >
              Open link
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
