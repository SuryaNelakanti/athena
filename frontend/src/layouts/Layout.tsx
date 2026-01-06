import React, { useState } from 'react';
import { Project } from '../types';
import {
  HomeIcon,
  ListBulletIcon,
  BeakerIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  ChevronUpDownIcon,
  CommandLineIcon,
  ClipboardDocumentCheckIcon,
  MoonIcon,
  SunIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  QueueListIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  WrenchScrewdriverIcon,
  ServerIcon,
  KeyIcon,
  GlobeAltIcon,
  UsersIcon,
  PuzzlePieceIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { IconButton, Select } from '../components/ui';

interface LayoutProps {
  children: React.ReactNode;
  projects: Project[];
  currentProject: Project;
  onProjectChange: (p: Project) => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

// Navigation mode types
type NavMode = 'observe' | 'improve' | 'operate';

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  tone: string;
}

interface NavSection {
  mode: NavMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const Layout: React.FC<LayoutProps> = ({
  children,
  projects,
  currentProject,
  onProjectChange,
  currentPath,
  onNavigate
}) => {
  // Three-mode navigation structure per UX spec
  const navSections: NavSection[] = [
    {
      mode: 'observe',
      label: 'Observe',
      icon: EyeIcon,
      items: [
        { name: 'Overview', icon: HomeIcon, path: '/overview', tone: 'sky' },
        { name: 'Runs', icon: QueueListIcon, path: '/runs', tone: 'sky' },
        { name: 'Logs', icon: ListBulletIcon, path: '/logs', tone: 'mint' },
      ],
    },
    {
      mode: 'improve',
      label: 'Improve',
      icon: ArrowTrendingUpIcon,
      items: [
        { name: 'Review', icon: ClipboardDocumentCheckIcon, path: '/review', tone: 'amber' },
        { name: 'Datasets', icon: CircleStackIcon, path: '/datasets', tone: 'indigo' },
        { name: 'Experiments', icon: BeakerIcon, path: '/experiments', tone: 'copper' },
        { name: 'Playgrounds', icon: CommandLineIcon, path: '/playgrounds', tone: 'slate' },
      ],
    },
    {
      mode: 'operate',
      label: 'Operate',
      icon: WrenchScrewdriverIcon,
      items: [
        { name: 'Proxy', icon: ServerIcon, path: '/proxy', tone: 'slate' },
        { name: 'Providers', icon: PuzzlePieceIcon, path: '/providers', tone: 'slate' },
        { name: 'Environments', icon: GlobeAltIcon, path: '/environments', tone: 'slate' },
        { name: 'Access', icon: UsersIcon, path: '/access', tone: 'slate' },
        { name: 'Integrations', icon: KeyIcon, path: '/integrations', tone: 'slate' },
        { name: 'Settings', icon: Cog6ToothIcon, path: '/settings', tone: 'slate' },
      ],
    },
  ];

  // Theme Toggle Logic - Light mode is default
  const [isDarkMode, setIsDarkMode] = useState(false);
  // Sidebar collapsed state
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState<Set<NavMode>>(
    new Set(['observe', 'improve', 'operate'])
  );

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleSection = (mode: NavMode) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  };

  const isItemActive = (itemPath: string) => {
    if (itemPath === '/') {
      return currentPath === '/';
    }
    return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
  };

  return (
    <div className="flex h-screen bg-app text-text-main font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isCollapsed ? 'w-16' : 'w-56'} flex flex-col flex-shrink-0 transition-all duration-200 ease-in-out border-r border-border-hairline`}>
        {/* Logo */}
        <div className={`h-14 flex items-center ${isCollapsed ? 'justify-center px-3' : 'px-4 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-sm cursor-pointer flex-shrink-0">
            <span className="text-base font-serif">A</span>
          </div>
          <span className={`font-serif font-semibold text-text-main tracking-tight text-lg transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
            Athena
          </span>
        </div>

        {/* Project Selector */}
        <div className={`overflow-hidden transition-all duration-200 ${isCollapsed ? 'h-0 opacity-0' : 'h-12 opacity-100 px-3 pb-2'}`}>
          <div className="relative">
            <Select
              value={currentProject.id}
              onChange={(e) => {
                const p = projects.find(proj => proj.id === e.target.value);
                if (p) onProjectChange(p);
              }}
              className="w-full pr-8 text-[11px] font-semibold uppercase tracking-wider"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id} className="bg-panel text-text-main">
                  {p.name}
                </option>
              ))}
            </Select>
            <ChevronUpDownIcon className="w-3.5 h-3.5 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Navigation - Three Mode Structure */}
        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {navSections.map((section) => {
            const isExpanded = expandedSections.has(section.mode);
            const SectionIcon = section.icon;

            return (
              <div key={section.mode} className="mb-1">
                {/* Section Header */}
                {!isCollapsed && (
                  <button
                    onClick={() => toggleSection(section.mode)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-text-muted hover:text-text-main transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <SectionIcon className="w-3.5 h-3.5" />
                      <span>{section.label}</span>
                    </div>
                    <ChevronDownIcon
                      className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                    />
                  </button>
                )}

                {/* Section Items */}
                <div className={`${!isCollapsed && !isExpanded ? 'hidden' : ''} space-y-0.5`}>
                  {section.items.map((item) => {
                    const isActive = isItemActive(item.path);
                    return (
                      <button
                        key={item.name}
                        onClick={() => onNavigate(item.path)}
                        title={isCollapsed ? item.name : undefined}
                        className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} py-2 text-sm rounded-md transition-colors ${isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-text-muted hover:bg-panel-hover hover:text-text-main'
                          }`}
                      >
                        <span className={`icon-chip icon-chip--${item.tone} ${isActive ? 'icon-chip--active' : ''}`}>
                          <item.icon className="w-4 h-4" />
                        </span>
                        <span className={`transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`${isCollapsed ? 'p-2' : 'p-3'} mt-auto border-t border-border-hairline`}>
          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-text-muted hover:text-text-main hover:bg-panel-hover rounded-md transition-colors mb-2"
          >
            {isCollapsed ? (
              <ChevronRightIcon className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeftIcon className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>

          {/* User & Theme */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              <div className="w-7 h-7 rounded-full bg-border-base flex items-center justify-center overflow-hidden">
                <UserCircleIcon className="w-5 h-5 text-text-muted" />
              </div>
              <span className="text-xs font-medium text-text-main">Demo</span>
            </div>

            <IconButton
              onClick={toggleTheme}
              variant="ghost"
              size="sm"
              title="Toggle Theme"
            >
              {isDarkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </IconButton>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-app p-2">
        <div className="flex-1 overflow-hidden bg-canvas rounded-lg border border-border-hairline shadow-sm">
          <div key={currentPath} className="h-full animate-soft-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
