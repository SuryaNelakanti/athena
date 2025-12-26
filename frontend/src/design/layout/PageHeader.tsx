import React from 'react';
import { cx } from '../ui/utils';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    badge,
    actions,
    breadcrumbs,
    className,
    children,
}) => {
    return (
        <div className={cx('flex flex-col gap-4 border-b border-border-hairline px-6 py-5 bg-panel', className)}>
            {breadcrumbs && (
                <div className="text-xs text-text-muted mb-1 flex items-center gap-2">
                    {breadcrumbs}
                </div>
            )}
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-serif font-bold text-text-main tracking-tight truncate leading-tight">
                            {title}
                        </h1>
                        {badge && (
                            <div className="flex-shrink-0">
                                {badge}
                            </div>
                        )}
                    </div>
                    {subtitle && (
                        <p className="text-sm text-text-muted mt-1.5 font-normal leading-relaxed max-w-3xl">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {actions}
                    </div>
                )}
            </div>
            {children && (
                <div className="mt-4 pt-1">
                    {children}
                </div>
            )}
        </div>
    );
};
