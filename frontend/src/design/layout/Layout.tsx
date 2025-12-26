import React from 'react';
import { Project } from '../../types';
import {
  HomeIcon,
  ListBulletIcon,
  BeakerIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  UserGroupIcon,
  ChevronUpDownIcon,
  CommandLineIcon,
  ClipboardDocumentCheckIcon,
  MoonIcon,
  SunIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { IconButton, Select } from '../ui';

interface LayoutProps {
  children: React.ReactNode;
  projects: Project[];
  currentProject: Project;
  onProjectChange: (p: Project) => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  projects,
  currentProject,
  onProjectChange,
  currentPath,
  onNavigate
}) => {

  const navItems = [
    { name: 'Dashboard', icon: HomeIcon, path: '/', tone: 'sky' },
    { name: 'Logs', icon: ListBulletIcon, path: '/logs', tone: 'mint' },
    { name: 'Review', icon: ClipboardDocumentCheckIcon, path: '/review', tone: 'amber' },
    { name: 'Collaboration', icon: UserGroupIcon, path: '/collaboration', tone: 'coral' },
    { name: 'Datasets', icon: CircleStackIcon, path: '/datasets', tone: 'indigo' },
    { name: 'Experiments', icon: BeakerIcon, path: '/experiments', tone: 'copper' },
    { name: 'Labs', icon: CommandLineIcon, path: '/labs', tone: 'slate' },
    { name: 'Settings', icon: Cog6ToothIcon, path: '/settings', tone: 'slate' },
  ];

  // Theme Toggle Logic - Light mode is default
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  // Sidebar collapsed state
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="flex h-screen bg-app text-text-main font-sans overflow-hidden">
      {/* Sidebar - blended with background */}
      <aside className={`${isCollapsed ? 'w-16' : 'w-56'} flex flex-col flex-shrink-0 transition-all duration-200 ease-in-out`}>
        {/* Logo */}
        <div className={`h-14 flex items-center ${isCollapsed ? 'justify-center px-3' : 'px-4 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-sm cursor-pointer flex-shrink-0">
            <span className="text-base font-serif">A</span>
          </div>
          <span className={`font-serif font-bold text-text-main tracking-tight text-lg transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
            Athena
          </span>
        </div>

        {/* Project Selector - use height transition instead of conditional */}
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

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
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
        </nav>

        {/* Footer */}
        <div className={`${isCollapsed ? 'p-2' : 'p-3'} mt-auto`}>
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

      {/* Main Content - reduced padding for cleaner look */}
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
