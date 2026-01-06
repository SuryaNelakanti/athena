import React, { useEffect, useMemo, useRef } from 'react';
import { RunGraph as RunGraphType, RunGraphNode } from '../../types';
import {
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  CubeIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

interface RunGraphProps {
  graph: RunGraphType;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 120;
const PADDING_X = 48;
const PADDING_Y = 40;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

const kindConfig: Record<string, { icon: React.ReactNode; color: string; bgClass: string; borderClass: string }> = {
  llm_call: {
    icon: <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />,
    color: 'text-primary',
    bgClass: 'bg-primary/5',
    borderClass: 'border-primary/20',
  },
  tool_call: {
    icon: <CodeBracketIcon className="w-3.5 h-3.5" />,
    color: 'text-amber-500',
    bgClass: 'bg-amber-500/5',
    borderClass: 'border-amber-500/20',
  },
  retrieval: {
    icon: <MagnifyingGlassIcon className="w-3.5 h-3.5" />,
    color: 'text-emerald-500',
    bgClass: 'bg-emerald-500/5',
    borderClass: 'border-emerald-500/20',
  },
  guardrail: {
    icon: <ShieldCheckIcon className="w-3.5 h-3.5" />,
    color: 'text-rose-500',
    bgClass: 'bg-rose-500/5',
    borderClass: 'border-rose-500/20',
  },
  retry: {
    icon: <ArrowPathIcon className="w-3.5 h-3.5" />,
    color: 'text-orange-500',
    bgClass: 'bg-orange-500/5',
    borderClass: 'border-orange-500/20',
  },
  chain: {
    icon: <CubeIcon className="w-3.5 h-3.5" />,
    color: 'text-sky-500',
    bgClass: 'bg-sky-500/5',
    borderClass: 'border-sky-500/20',
  },
  span: {
    icon: <CubeIcon className="w-3.5 h-3.5" />,
    color: 'text-text-muted',
    bgClass: 'bg-panel',
    borderClass: 'border-border-base',
  },
};

const getKindConfig = (kind: string) => kindConfig[kind] || kindConfig.span;

const formatDuration = (value?: number) => {
  if (!value && value !== 0) return '--';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
};

const RunGraph: React.FC<RunGraphProps> = ({ graph, selectedNodeId, onSelectNode }) => {
  const nodesById = useMemo(() => {
    const entries = new Map<string, RunGraphNode>();
    graph.nodes.forEach((node) => entries.set(node.id, node));
    return entries;
  }, [graph.nodes]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const maxDepth = useMemo(() => {
    if (typeof graph.layout?.max_depth === 'number') return graph.layout.max_depth;
    return graph.nodes.reduce((acc, node) => Math.max(acc, node.depth), 0);
  }, [graph.layout, graph.nodes]);

  const maxLane = useMemo(() => {
    if (typeof graph.layout?.max_lane === 'number') return graph.layout.max_lane;
    return graph.nodes.reduce((acc, node) => Math.max(acc, node.lane), 0);
  }, [graph.layout, graph.nodes]);

  const graphWidth = (maxDepth + 1) * COLUMN_WIDTH + PADDING_X * 2;
  const graphHeight = (maxLane + 1) * ROW_HEIGHT + PADDING_Y * 2;

  const positionForNode = (node: RunGraphNode) => {
    return {
      x: PADDING_X + node.depth * COLUMN_WIDTH,
      y: PADDING_Y + node.lane * ROW_HEIGHT,
    };
  };

  const centerOnNode = (nodeId: string) => {
    const container = containerRef.current;
    const node = nodesById.get(nodeId);
    if (!container || !node) return;
    const position = positionForNode(node);
    const centerX = position.x + NODE_WIDTH / 2;
    const centerY = position.y + NODE_HEIGHT / 2;
    const targetLeft = Math.max(centerX - container.clientWidth / 2, 0);
    const targetTop = Math.max(centerY - container.clientHeight / 2, 0);
    container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  };

  useEffect(() => {
    if (graph.root_id) {
      centerOnNode(graph.root_id);
    }
  }, [graph.root_id, nodesById]);

  return (
    <div className="relative h-full min-h-[320px] flex flex-col rounded-xl overflow-hidden bg-gradient-to-br from-app via-panel to-app">
      {/* Subtle grid pattern background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border-base) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border-base) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Legend - floating panel */}
      <div className="absolute top-4 right-4 z-10 backdrop-blur-sm bg-panel/90 border border-border-hairline rounded-lg shadow-sm overflow-hidden">
        {graph.root_id && (
          <button
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-primary hover:bg-primary/5 flex items-center gap-2 border-b border-border-hairline transition-colors"
            onClick={() => centerOnNode(graph.root_id)}
          >
            <HomeIcon className="w-3.5 h-3.5" />
            Center on root
          </button>
        )}
        <div className="p-3 space-y-1.5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Legend</div>
          {Object.entries(kindConfig).slice(0, 6).map(([kind, config]) => (
            <div key={kind} className="flex items-center gap-2">
              <span className={`${config.color} opacity-80`}>{config.icon}</span>
              <span className="text-[10px] text-text-muted capitalize">{kind.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="relative overflow-auto flex-1 min-h-0">
        <div className="relative" style={{ width: graphWidth, height: graphHeight }}>
          {/* SVG edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={graphWidth}
            height={graphHeight}
          >
            <defs>
              <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--border-base)" stopOpacity="0.3" />
                <stop offset="50%" stopColor="var(--border-base)" stopOpacity="0.6" />
                <stop offset="100%" stopColor="var(--border-base)" stopOpacity="0.3" />
              </linearGradient>
              <linearGradient id="retryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(249, 115, 22)" stopOpacity="0.2" />
                <stop offset="50%" stopColor="rgb(249, 115, 22)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="rgb(249, 115, 22)" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="errorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity="0.2" />
                <stop offset="50%" stopColor="rgb(244, 63, 94)" stopOpacity="0.6" />
                <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {graph.edges.map((edge) => {
              const fromNode = nodesById.get(edge.from_id);
              const toNode = nodesById.get(edge.to_id);
              if (!fromNode || !toNode) return null;
              const fromPos = positionForNode(fromNode);
              const toPos = positionForNode(toNode);
              const startX = fromPos.x + NODE_WIDTH;
              const startY = fromPos.y + NODE_HEIGHT / 2;
              const endX = toPos.x;
              const endY = toPos.y + NODE_HEIGHT / 2;
              const controlOffset = Math.abs(endX - startX) * 0.4;
              const isRetry = edge.kind === 'retry';
              const isErrorEdge = toNode.status === 'error';

              // Determine stroke gradient
              let strokeGradient = 'url(#edgeGradient)';
              if (isErrorEdge) strokeGradient = 'url(#errorGradient)';
              else if (isRetry) strokeGradient = 'url(#retryGradient)';

              return (
                <g key={`${edge.from_id}-${edge.to_id}-${edge.kind}`}>
                  <path
                    d={`M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke={strokeGradient}
                    strokeWidth={isErrorEdge ? 2 : isRetry ? 2 : 1.5}
                    strokeDasharray={isRetry ? '6 4' : '0'}
                    className="transition-all"
                  />
                  {/* Arrow head */}
                  <circle
                    cx={endX}
                    cy={endY}
                    r={3}
                    fill={isErrorEdge ? 'rgb(244, 63, 94)' : isRetry ? 'rgb(249, 115, 22)' : 'var(--border-base)'}
                    opacity={0.6}
                  />
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {graph.nodes.map((node, index) => {
            const pos = positionForNode(node);
            const isSelected = node.id === selectedNodeId;
            const isRoot = node.id === graph.root_id;
            const config = getKindConfig(node.kind);
            const isError = node.status === 'error';

            return (
              <button
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  animationDelay: `${index * 20}ms`,
                }}
                className={`
                  absolute text-left rounded-xl border backdrop-blur-sm
                  transition-all duration-200 ease-out
                  hover:scale-[1.02] hover:shadow-md
                  animate-soft-in
                  ${isSelected
                    ? 'border-primary bg-primary/10 shadow-lg ring-2 ring-primary/20'
                    : isError
                      ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50'
                      : `${config.borderClass} ${config.bgClass} hover:border-opacity-50`
                  }
                  ${isRoot ? 'ring-1 ring-primary/30' : ''}
                `}
              >
                {/* Status indicator */}
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl ${isError ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                />

                <div className="p-3 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start gap-2">
                    <span
                      className={`
                        shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                        ${isError ? 'bg-rose-500/10 text-rose-500' : `${config.bgClass} ${config.color}`}
                        border border-current/10
                      `}
                    >
                      {config.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-text-main truncate leading-tight">
                        {node.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-widest text-text-muted mt-0.5 flex items-center gap-1">
                        <span>{node.kind.replace('_', ' ')}</span>
                        {isRoot && (
                          <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold">
                            ROOT
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-2 flex items-center justify-between text-[10px]">
                    <span className="text-text-muted font-mono">{formatDuration(node.duration_ms)}</span>
                    <span
                      className={`
                        px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide
                        ${isError
                          ? 'bg-rose-500/10 text-rose-500'
                          : 'bg-emerald-500/10 text-emerald-600'
                        }
                      `}
                    >
                      {node.status}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom info bar */}
      <div className="px-4 py-2 border-t border-border-hairline bg-panel/50 backdrop-blur-sm flex items-center justify-between text-[10px] text-text-muted">
        <span>{graph.nodes.length} spans</span>
        <span className="font-mono">{graph.trace_id?.slice(0, 16)}...</span>
      </div>
    </div>
  );
};

export default RunGraph;
