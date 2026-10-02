import type React from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';

export const StatCard = ({
    title,
    value,
    unit,
    change,
    loading,
    icon,
    tone = 'slate',
}: {
    title: string;
    value: string;
    unit?: string;
    change?: string;
    loading?: boolean;
    icon?: React.ReactNode;
    tone?: string;
}) => (
    <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                {icon && (
                    <span className={`icon-chip icon-chip--${tone}`}>
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest opacity-70">{title}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? '--' : value}</span>
                        {unit && <span className="text-sm text-text-muted font-medium ml-1">{unit}</span>}
                    </div>
                </div>
            </div>
            {change && (
                <Badge variant="neutral" className="text-[9px]">
                    {change}
                </Badge>
            )}
        </div>
    </Card>
);
