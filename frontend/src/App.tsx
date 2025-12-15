import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import LogTable from './components/LogTable';
import TraceDetail from './components/TraceDetail';
import Dashboard from './components/Dashboard';
import Labs from './components/Labs';
import { fetchProjects, fetchTraces } from './services/api';
import { Project, Trace } from './types';

// In-Memory Router Implementation
const App: React.FC = () => {
  // State
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Default to '/' directly to avoid accessing window.location in restricted contexts
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Data State
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation Handler
  const navigate = (path: string) => {
    setCurrentPath(path);
  };

  // Initialize Projects
  useEffect(() => {
    fetchProjects().then(data => {
      setProjects(data);
      if (data.length > 0) {
        setCurrentProject(data[0]);
      }
    }).catch(err => console.error(err));
  }, []);

  // Fetch Traces when project changes
  useEffect(() => {
    if (!currentProject) return;

    setLoading(true);
    fetchTraces(currentProject.id)
      .then(data => setTraces(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [currentProject]);

  // Derived View State
  const selectedTrace = traces.find(t => t.id === selectedTraceId);
  const showDetail = !!selectedTraceId;

  const renderContent = () => {
    if (loading && traces.length === 0) {
      return <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>;
    }

    if (currentPath === '/') {
      return <Dashboard />;
    }
    if (currentPath === '/labs') {
      return <Labs />;
    }
    if (currentPath.startsWith('/logs')) {
      return (
        <div className="flex h-full">
          <div className={`${showDetail ? 'w-1/2 hidden md:block' : 'w-full'} border-r border-gray-800 transition-all`}>
            <LogTable
              traces={traces}
              onSelectTrace={(id) => setSelectedTraceId(id)}
              selectedTraceId={selectedTraceId}
            />
          </div>
          {showDetail && selectedTrace && (
            <div className="w-full md:w-1/2 absolute md:static inset-0 z-20 md:z-auto bg-gray-900">
              <TraceDetail
                trace={selectedTrace}
                onClose={() => setSelectedTraceId(null)}
              />
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Coming in Phase 2</h2>
          <p>Datasets and Experiments are under construction.</p>
        </div>
      </div>
    );
  };

  if (!currentProject) return <div className="flex items-center justify-center h-screen bg-black text-gray-500">Loading Athena...</div>;

  return (
    <Layout
      projects={projects}
      currentProject={currentProject}
      onProjectChange={setCurrentProject}
      currentPath={currentPath}
      onNavigate={navigate}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;