import { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';

import { Button, Input, Select } from '../../components/ui';
import {
  FIELD_LABELS,
  FIELD_TYPES,
  FILTER_FIELDS,
  FILTER_FIELD_GROUPS,
  OP_BY_TYPE,
  OP_LABELS,
} from './filterConfig';

type FilterDraft = {
  field: string;
  op: string;
  value: string;
};

type LogFilterEditorProps = {
  open: boolean;
  panelId: string;
  activeFilterFields: ReadonlySet<string>;
  onAdd: (field: string, operator: string, value: string) => void;
  onClose: () => void;
};

const initialFilterDraft = (): FilterDraft => {
  const field = FILTER_FIELDS[0];
  const fieldType = FIELD_TYPES[field] || 'string';
  return { field, op: OP_BY_TYPE[fieldType][0], value: '' };
};

export function LogFilterEditor({
  open,
  panelId,
  activeFilterFields,
  onAdd,
  onClose,
}: LogFilterEditorProps) {
  const [newFilter, setNewFilter] = useState<FilterDraft>(initialFilterDraft);

  if (!open) return null;

  const selectField = (field: string) => {
    const fieldType = FIELD_TYPES[field] || 'string';
    setNewFilter({ field, op: OP_BY_TYPE[fieldType][0], value: '' });
  };

  const addFilter = () => {
    onAdd(newFilter.field, newFilter.op, newFilter.value);
    setNewFilter((current) => ({ ...current, value: '' }));
    onClose();
  };

  return (
    <>
      <div className="rounded-lg border border-border-base bg-panel/60 p-3">
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
          Filter Fields
        </div>
        <div className="text-[11px] text-text-muted mt-1">Pick a field to start a filter.</div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FILTER_FIELD_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] uppercase tracking-widest text-text-muted/70 font-semibold">
                {group.label}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.fields.map((field) => {
                  const highlighted = activeFilterFields.has(field) || newFilter.field === field;
                  return (
                    <Button
                      key={field}
                      type="button"
                      onClick={() => selectField(field)}
                      size="sm"
                      variant="outline"
                      className={`rounded-full text-[11px] ${highlighted ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
                      aria-pressed={highlighted}
                    >
                      {FIELD_LABELS[field] || field}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        id={panelId}
        className="bg-panel border border-border-base rounded-lg p-4 flex flex-wrap items-center gap-3"
      >
        <Select
          value={newFilter.field}
          onChange={(event) => selectField(event.target.value)}
          className="text-xs"
          aria-label="Filter field"
        >
          {FILTER_FIELDS.map((field) => (
            <option key={field} value={field}>{FIELD_LABELS[field] || field}</option>
          ))}
        </Select>
        <Select
          value={newFilter.op}
          onChange={(event) => setNewFilter((current) => ({ ...current, op: event.target.value }))}
          className="text-xs"
          aria-label="Filter operator"
        >
          {(OP_BY_TYPE[FIELD_TYPES[newFilter.field] || 'string'] || []).map((operator) => (
            <option key={operator} value={operator}>{OP_LABELS[operator] || operator}</option>
          ))}
        </Select>
        <Input
          value={newFilter.value}
          onChange={(event) => setNewFilter((current) => ({ ...current, value: event.target.value }))}
          className="flex-1 min-w-[160px] text-xs"
          placeholder="Value"
          aria-label="Filter value"
        />
        <Button onClick={addFilter} size="sm" variant="primary" className="text-xs">
          <PlusIcon className="w-3 h-3" />
          Add Filter
        </Button>
      </div>
    </>
  );
}
