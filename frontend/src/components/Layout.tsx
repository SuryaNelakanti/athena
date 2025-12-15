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

  return (
    <div className="flex h-screen bg-gray-950 text-slate-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 flex flex-col bg-gray-950 flex-shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
            A
          </div>
          <span className="font-semibold text-white tracking-tight text-lg">Athena</span>
        </div>

        <div className="p-3">
          <div className="relative">
            <button className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300 transition-colors">
              <span className="truncate font-medium">{currentProject.name}</span>
              <ChevronUpDownIcon className="w-4 h-4 text-gray-500" />
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
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all ${isActive
                  ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                  }`}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button className="flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors w-full">
            <UserCircleIcon className="w-6 h-6" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium">Jane Doe</span>
              <span className="text-[10px] text-gray-500">Engineering</span>
            </div>
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
