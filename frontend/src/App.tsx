import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import LogTable from './components/LogTable';
import TraceDetail from './components/TraceDetail';
import Dashboard from './components/Dashboard';
import Labs from './components/Labs';
import DatasetList from './components/DatasetList';
import ExperimentList from './components/ExperimentList';
import DatasetDetail from './components/DatasetDetail';
import ExperimentDetail from './components/ExperimentDetail';
import { fetchProjects, api } from './services/api'; // Added api import
import { Project, Trace } from './types';

// In-Memory Router Implementation
const App: React.FC = () => {
  // State
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Default to '/' directly to avoid accessing window.location in restricted contexts
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<any | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<any | null>(null);

  // Data State
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ status?: string, search?: string }>({});

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
  const refreshTraces = () => {
    if (!currentProject) return;
    setLoading(true);
    // Use the new signature which accepts filters
    // Note: fetchTraces wrapper in api.ts might need to be bypassing the wrapper or wrapper updated?
    // The wrapper I updated in api.ts is: export async function fetchTraces(projectId: string): Promise<Trace[]> { return api.getTraces(projectId); }
    // Ideally I should import 'api' and use it.
    // Let's assume I fix the import below or use the wrapper if I updated it. 
    // Wait, I updated the wrapper to just call api.getTraces(projectId). It doesn't pass filters.
    // I should use api.getTraces directly or update the wrapper.
    // I will use api.getTraces directly, need to update imports.
    // Use api.getTraces(currentProject.id, filters)
  };

  // Implementation below uses api.getTraces directly.
  useEffect(() => {
    if (!currentProject) return;
    setLoading(true);
    import('./services/api').then(({ api }) => {
      api.getTraces(currentProject.id, filters)
        .then(data => setTraces(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    });
  }, [currentProject, filters]);

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
              projectId={currentProject ? currentProject.id : ''}
              onRefresh={() => {
                // re-fetch
                import('./services/api').then(({ api }) => {
                  api.getTraces(currentProject!.id, filters).then(setTraces);
                });
              }}
              setFilters={setFilters}
              currentFilters={filters}
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
    if (currentPath === '/datasets') {
      if (selectedDataset) {
        return <DatasetDetail dataset={selectedDataset} onBack={() => setSelectedDataset(null)} />;
      }
      return <DatasetList projectId={currentProject?.id || ''} onSelectDataset={setSelectedDataset} />;
    }
    if (currentPath === '/experiments') {
      if (selectedExperiment) {
        return <ExperimentDetail experiment={selectedExperiment} onBack={() => setSelectedExperiment(null)} />;
      }
      return <ExperimentList projectId={currentProject?.id || ''} onSelectExperiment={setSelectedExperiment} />;
    }
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Phase 2: More to come</h2>
          <p>Settings and refined dashboard views are in progress.</p>
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