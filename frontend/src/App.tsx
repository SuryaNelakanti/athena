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
import Settings from './components/Settings';
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
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  // Navigation Handler
  const navigate = (path: string) => {
    setCurrentPath(path);
  };

  // Initialize Projects
  useEffect(() => {
    fetchProjects().then(async data => {
      if (data.length === 0) {
        // No projects exist - auto-create a default one
        setCreatingProject(true);
        try {
          const newProject = await api.createProject({ name: 'Default Project' });
          setProjects([newProject]);
          setCurrentProject(newProject);
        } catch (err) {
          console.error('Failed to create default project:', err);
          setShowCreateProject(true);
        } finally {
          setCreatingProject(false);
        }
      } else {
        setProjects(data);
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
    if (currentPath === '/settings') {
      return <Settings />;
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

  // Handle creating project state
  if (creatingProject) {
    return (
      <div className="flex items-center justify-center h-screen bg-app text-text-main">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-wispr-purple flex items-center justify-center text-white font-bold animate-pulse">
            <span className="text-2xl font-serif">A</span>
          </div>
          <p className="text-lg">Setting up your first project...</p>
        </div>
      </div>
    );
  }

  // Handle no projects and show create dialog
  if (showCreateProject || (!currentProject && projects.length === 0)) {
    return (
      <div className="flex items-center justify-center h-screen bg-app text-text-main">
        <div className="bg-panel p-8 rounded-2xl border border-border-base shadow-xl max-w-md w-full mx-4">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-wispr-purple flex items-center justify-center text-white font-bold">
            <span className="text-2xl font-serif">A</span>
          </div>
          <h2 className="text-xl font-semibold text-center mb-2">Welcome to Athena</h2>
          <p className="text-text-muted text-center mb-6">Create your first project to get started</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const name = (form.elements.namedItem('projectName') as HTMLInputElement).value;
              if (!name.trim()) return;
              setCreatingProject(true);
              try {
                const newProject = await api.createProject({ name });
                setProjects([newProject]);
                setCurrentProject(newProject);
                setShowCreateProject(false);
              } catch (err) {
                console.error('Failed to create project:', err);
              } finally {
                setCreatingProject(false);
              }
            }}
          >
            <input
              type="text"
              name="projectName"
              placeholder="Project name"
              className="w-full px-4 py-3 rounded-xl bg-app border border-border-base focus:border-wispr-purple focus:ring-2 focus:ring-wispr-purple/20 outline-none transition-all mb-4"
              autoFocus
            />
            <button
              type="submit"
              disabled={creatingProject}
              className="w-full py-3 bg-wispr-purple text-white rounded-xl font-semibold hover:bg-wispr-purple/90 transition-all disabled:opacity-50"
            >
              {creatingProject ? 'Creating...' : 'Create Project'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!currentProject) return <div className="flex items-center justify-center h-screen bg-app text-text-muted">Loading Athena...</div>;

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
