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
import ReviewQueue from './components/ReviewQueue';
import { fetchProjects, api } from './services/api'; // Added api import
import { Project, Trace, Log } from './types';

// In-Memory Router Implementation
const App: React.FC = () => {
  // State
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Default to '/' directly to avoid accessing window.location in restricted contexts
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
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

  // Fetch Traces when project changes (for trace detail view)
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

  // Handle opening trace from log row
  const handleOpenTrace = async (traceId: string) => {
    // Fetch the full trace and show detail
    const existingTrace = traces.find(t => t.id === traceId);
    if (existingTrace) {
      setSelectedTraceId(traceId);
    } else {
      // Trace not in current list, fetch it
      try {
        const fetchedTraces = await api.getTraces(currentProject!.id, { limit: 1 });
        const foundTrace = fetchedTraces.find(t => t.id === traceId);
        if (foundTrace) {
          setTraces(prev => [...prev, foundTrace]);
          setSelectedTraceId(traceId);
        }
      } catch (err) {
        console.error('Failed to fetch trace:', err);
      }
    }
  };

  // Derived View State
  const selectedTrace = traces.find(t => t.id === selectedTraceId);
  const showDetail = !!selectedTraceId;

  const renderContent = () => {
    if (loading && traces.length === 0 && currentPath !== '/logs') {
      return <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>;
    }

    if (currentPath === '/') {
      return <Dashboard projectId={currentProject?.id || ''} />;
    }
    if (currentPath === '/labs') {
      return <Labs />;
    }
    if (currentPath === '/review') {
      return <ReviewQueue projectId={currentProject?.id || ''} />;
    }
    if (currentPath.startsWith('/logs')) {
      return (
        <div className="flex h-full">
          <div className={`${showDetail ? 'w-1/2 hidden md:block' : 'w-full'} border-r border-gray-800 transition-all`}>
            <LogTable
              projectId={currentProject ? currentProject.id : ''}
              onSelectLog={(log) => setSelectedLog(log)}
              onOpenTrace={handleOpenTrace}
              selectedLogId={selectedLog?.id || null}
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
