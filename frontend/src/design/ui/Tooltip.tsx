import React from 'react';

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className = "" }) => {
    return (
        <div className={`relative group/tooltip flex items-center ${className}`}>
            {children}
            <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 bg-panel border border-border-base text-[11px] text-text-main rounded-md shadow-sm opacity-0 translate-y-2 group-hover/tooltip:opacity-100 group-hover/tooltip:translate-y-0 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 font-semibold font-sans">
                {content}
                {/* Arrow */}
                <div className="absolute top-full left-3 -mt-[1px] border-4 border-transparent border-t-border-base" />
            </div>
        </div>
    );
};
