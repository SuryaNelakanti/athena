import React from 'react';
import { Project } from '../types';
import {
  HomeIcon,
  ListBulletIcon,
  BeakerIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  ChevronUpDownIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

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
    { name: 'Dashboard', icon: HomeIcon, path: '/' },
    { name: 'Logs', icon: ListBulletIcon, path: '/logs' },
    { name: 'Labs', icon: CommandLineIcon, path: '/labs' },
    { name: 'Services', icon: CircleStackIcon, path: '/services' }, // Placeholder renaming Datasets maybe? No, let's keep Datasets
    { name: 'Datasets', icon: CircleStackIcon, path: '/datasets' },
    { name: 'Experiments', icon: BeakerIcon, path: '/experiments' },
    { name: 'Settings', icon: Cog6ToothIcon, path: '/settings' },
  ];

  // Theme Toggle Logic
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    // Check system preference or localStorage
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="flex h-screen bg-app text-text-main font-sans overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border-base flex flex-col bg-panel flex-shrink-0 transition-colors duration-300">
        <div className="p-6 border-b border-border-base flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-wispr-purple flex items-center justify-center text-white font-bold shadow-xl shadow-wispr-purple/20 transition-transform hover:scale-105 cursor-pointer">
            <span className="text-xl font-serif">A</span>
          </div>
          <span className="font-serif font-bold text-text-main tracking-tight text-2xl">Athena</span>
        </div>

        <div className="p-4">
          <div className="relative">
            <button className="w-full flex items-center justify-between bg-app border border-border-base hover:border-border-hover rounded-xl px-4 py-2.5 text-sm text-text-muted transition-all shadow-sm">
              <span className="truncate font-semibold uppercase tracking-wider text-[11px] opacity-80">{currentProject.name}</span>
              <ChevronUpDownIcon className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
            return (
              <button
                key={item.name}
                onClick={() => onNavigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl transition-all duration-200 ${isActive
                  ? 'bg-wispr-purple/10 text-wispr-purple font-semibold border border-wispr-purple/20'
                  : 'text-text-muted hover:bg-panel-hover hover:text-text-main'
                  }`}
              >
                <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-wispr-purple' : 'text-text-muted'}`} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-6 border-t border-border-base flex items-center justify-between">
          <button className="flex items-center gap-3 text-sm text-text-muted hover:text-text-main transition-colors">
            <div className="w-10 h-10 rounded-full bg-border-base flex items-center justify-center overflow-hidden border border-border-base">
              <UserCircleIcon className="w-8 h-8 text-text-muted" />
            </div>
            <div className="flex flex-col items-start translate-y-[-1px]">
              <span className="text-sm font-semibold text-text-main">Jane Doe</span>
              <span className="text-[10px] text-text-muted uppercase tracking-widest font-bold opacity-60">Engineering</span>
            </div>
          </button>

          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-text-muted hover:bg-panel-hover hover:text-text-main transition-all border border-transparent hover:border-border-base"
            title="Toggle Theme"
          >
            {isDarkMode ? '🌙' : '☀️'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};

export default Layout;
