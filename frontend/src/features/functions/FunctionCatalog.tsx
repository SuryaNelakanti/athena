import React from 'react';
import type { ReactNode } from 'react';
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  CpuChipIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

import { Badge, Card } from '../../components/ui';
import type { Function as FunctionAsset } from '../../types';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning';
type SectionTone = 'amber' | 'primary';

type FunctionCatalogProps = {
  builtinFunctions: FunctionAsset[];
  customFunctions: FunctionAsset[];
  onDelete: (functionId: string) => void;
};

type FunctionCardProps = {
  functionAsset: FunctionAsset;
  tone: SectionTone;
  index: number;
  onDelete?: (functionId: string) => void;
};

function runtimeIcon(runtime: FunctionAsset['runtime']) {
  switch (runtime) {
    case 'llm_judge':
      return <ChatBubbleLeftRightIcon className="w-4 h-4" />;
    case 'python':
      return <CodeBracketIcon className="w-4 h-4" />;
    default:
      return <CpuChipIcon className="w-4 h-4" />;
  }
}

function runtimeBadge(runtime: FunctionAsset['runtime']): BadgeVariant {
  switch (runtime) {
    case 'llm_judge':
      return 'primary';
    case 'python':
      return 'warning';
    default:
      return 'neutral';
  }
}

const FunctionCard: React.FC<FunctionCardProps> = ({
  functionAsset,
  tone,
  index,
  onDelete,
}) => {
  const iconTone = tone === 'amber' ? 'amber' : 'sky';
  const cardClass = onDelete ? 'animate-soft-in group' : 'animate-soft-in';

  return (
    <Card
      className={cardClass}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className={`icon-chip icon-chip--${iconTone} shrink-0`}>
          {runtimeIcon(functionAsset.runtime)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-main truncate">
              {functionAsset.display_name || functionAsset.name}
            </h3>
            <Badge variant={runtimeBadge(functionAsset.runtime)} className="text-[9px]">
              {functionAsset.runtime.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {functionAsset.description || 'No description'}
          </p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(functionAsset.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-rose-500/10 text-rose-500"
            title="Delete"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border-hairline flex items-center justify-between">
        <Badge variant="neutral" className="text-[9px] uppercase">
          {functionAsset.type}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          {functionAsset.enabled ? (
            <>
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span>Enabled</span>
            </>
          ) : (
            <>
              <XCircleIcon className="w-3.5 h-3.5 text-rose-500" />
              <span>Disabled</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

type FunctionSectionProps = {
  title: string;
  functions: FunctionAsset[];
  icon: ReactNode;
  tone: SectionTone;
  onDelete?: (functionId: string) => void;
  animationDelay?: string;
};

function FunctionSection({
  title,
  functions,
  icon,
  tone,
  onDelete,
  animationDelay,
}: FunctionSectionProps) {
  if (!functions.length) return null;

  return (
    <section
      className="animate-soft-in"
      style={animationDelay ? { animationDelay } : undefined}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-sm font-semibold text-text-main">{title}</h2>
        <Badge variant="neutral" className="text-[9px]">{functions.length}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {functions.map((functionAsset, index) => (
          <FunctionCard
            key={functionAsset.id}
            functionAsset={functionAsset}
            tone={tone}
            index={index}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

export function FunctionCatalog({
  builtinFunctions,
  customFunctions,
  onDelete,
}: FunctionCatalogProps) {
  return (
    <>
      <FunctionSection
        title="Built-in Functions"
        functions={builtinFunctions}
        icon={<SparklesIcon className="w-4 h-4 text-amber-500" />}
        tone="amber"
      />
      <FunctionSection
        title="Custom Functions"
        functions={customFunctions}
        icon={<CpuChipIcon className="w-4 h-4 text-primary" />}
        tone="primary"
        onDelete={onDelete}
        animationDelay="50ms"
      />
    </>
  );
}
