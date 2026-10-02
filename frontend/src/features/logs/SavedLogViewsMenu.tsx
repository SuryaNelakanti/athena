import { useState } from 'react';
import type { MouseEvent } from 'react';
import { BookmarkIcon, XMarkIcon } from '@heroicons/react/24/outline';

import { Button, Input } from '../../components/ui';
import type { View } from '../../lib/api';
import type { Filter } from './filterConfig';

type SavedLogViewsMenuProps = {
  views: View[];
  viewsError: string | null;
  filters: Filter[];
  onApply: (view: View) => void;
  saveView: (name: string, filters: Filter[]) => Promise<boolean>;
  deleteView: (viewId: string) => Promise<void>;
};

export function SavedLogViewsMenu({
  views,
  viewsError,
  filters,
  onApply,
  saveView,
  deleteView,
}: SavedLogViewsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);
  const [viewName, setViewName] = useState('');

  const handleSave = async () => {
    const saved = await saveView(viewName, filters);
    if (!saved) return;
    setViewName('');
    setIsSavingView(false);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, viewId: string) => {
    event.stopPropagation();
    if (confirm('Delete this view?')) void deleteView(viewId);
  };

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen((visible) => !visible)}
        size="sm"
        variant="outline"
        className={`text-xs ${isOpen ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
        aria-expanded={isOpen}
      >
        <BookmarkIcon className="w-3.5 h-3.5" />
        Views
      </Button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-panel border border-border-base rounded-md shadow-lg z-20 py-1">
          {views.length === 0 && !viewsError && (
            <div className="px-3 py-2 text-text-muted italic">No saved views</div>
          )}
          {views.map((view) => (
            <div
              key={view.id}
              onClick={() => {
                onApply(view);
                setIsOpen(false);
              }}
              className="px-3 py-2 hover:bg-panel-hover cursor-pointer flex justify-between items-center group"
            >
              <span className="text-text-main truncate text-xs">{view.name}</span>
              <button
                onClick={(event) => handleDelete(event, view.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-500"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="border-t border-border-base mt-1 pt-1 px-2 pb-1">
            {isSavingView ? (
              <div className="flex flex-col gap-2 mt-1">
                <Input
                  autoFocus
                  placeholder="View Name"
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSave();
                  }}
                  className="text-xs"
                />
                <Button onClick={handleSave} size="sm" variant="primary" className="text-xs">
                  Save
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setIsSavingView(true)}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-primary text-[10px] font-bold tracking-wider"
              >
                + Save Current View
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
