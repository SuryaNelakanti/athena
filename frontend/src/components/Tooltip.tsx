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
            <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded shadow-xl opacity-0 translate-y-2 group-hover/tooltip:opacity-100 group-hover/tooltip:translate-y-0 transition-all duration-200 pointer-events-none whitespace-nowrap z-50">
                {content}
                {/* Arrow */}
                <div className="absolute top-full left-2 -mt-[1px] border-4 border-transparent border-t-gray-700" />
            </div>
        </div>
    );
};
