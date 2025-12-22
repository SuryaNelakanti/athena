import React, { useState, useEffect } from 'react';
import Layout from './design/layout/Layout';
import LogTable from './design/pages/LogTable';
import TraceDetail from './design/pages/TraceDetail';
import Dashboard from './design/pages/Dashboard';
import Labs from './design/pages/Labs';
import DatasetList from './design/pages/DatasetList';
import ExperimentList from './design/pages/ExperimentList';
import DatasetDetail from './design/pages/DatasetDetail';
import ExperimentDetail from './design/pages/ExperimentDetail';
import Settings from './design/pages/Settings';
import ReviewQueue from './design/pages/ReviewQueue';
import Collaboration from './design/pages/Collaboration';
import { fetchProjects, api } from './services/api'; // Added api import
import { Project, Trace, Log } from './types';
import { Button, Card, Input } from './design/ui';
import { initAccent } from './design/theme/accent';

const parseHashRoute = () => {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) {
    return { path: '/', params: new URLSearchParams() };
  }
  const [pathPart, queryString] = raw.split('?');
  return { path: pathPart || '/', params: new URLSearchParams(queryString || '') };
};

const buildHashRoute = (path: string, params?: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

// In-Memory Router Implementation
const App: React.FC = () => {
  // State
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const initialRoute = parseHashRoute();
  const [currentPath, setCurrentPath] = useState(initialRoute.path);
  const [routeParams, setRouteParams] = useState(initialRoute.params);
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
  const navigate = (path: string, params?: Record<string, string | null | undefined>) => {
    const nextHash = buildHashRoute(path, params);
    if (window.location.hash.replace(/^#/, '') !== nextHash) {
      window.location.hash = nextHash;
    } else {
      const query = nextHash.split('?')[1] || '';
      setCurrentPath(path);
      setRouteParams(new URLSearchParams(query));
    }
  };

  useEffect(() => {
    initAccent();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = parseHashRoute();
      setCurrentPath(nextRoute.path);
      setRouteParams(nextRoute.params);
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Initialize Projects
  useEffect(() => {
    fetchProjects().then(async data => {
      if (data.length === 0) {
        // No projects exist - auto-create a default one
        setCreatingProject(true);
        try {
          const newProject = await api.createProject({ name: 'Athena Demo' });
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
    navigate('/logs', { trace_id: traceId });
  };

  useEffect(() => {
    const traceId = routeParams.get('trace_id');
    if (!traceId || !currentProject) {
      setSelectedTraceId(null);
      return;
    }
    if (selectedTraceId === traceId) return;
    const existingTrace = traces.find(t => t.id === traceId);
    if (existingTrace) {
      setSelectedTraceId(traceId);
      return;
    }
    api.getTraces(currentProject.id, { search: traceId, limit: 1 })
      .then((fetched) => {
        const foundTrace = fetched.find(t => t.id === traceId);
        if (foundTrace) {
          setTraces(prev => prev.some(t => t.id === traceId) ? prev : [...prev, foundTrace]);
          setSelectedTraceId(traceId);
        }
      })
      .catch(err => console.error('Failed to fetch trace:', err));
  }, [routeParams, currentProject, traces, selectedTraceId]);

  useEffect(() => {
    const datasetId = routeParams.get('dataset_id');
    if (!datasetId || !currentProject) {
      setSelectedDataset(null);
      return;
    }
    if (selectedDataset?.id === datasetId) return;
    api.getDataset(datasetId)
      .then(setSelectedDataset)
      .catch(err => console.error('Failed to fetch dataset:', err));
  }, [routeParams, currentProject, selectedDataset]);

  useEffect(() => {
    const experimentId = routeParams.get('experiment_id');
    if (!experimentId || !currentProject) {
      setSelectedExperiment(null);
      return;
    }
    if (selectedExperiment?.id === experimentId) return;
    api.getExperiment(experimentId)
      .then(setSelectedExperiment)
      .catch(err => console.error('Failed to fetch experiment:', err));
  }, [routeParams, currentProject, selectedExperiment]);

  // Derived View State
  const selectedTrace = traces.find(t => t.id === selectedTraceId);
  const showDetail = !!selectedTraceId;

  const renderContent = () => {
    if (loading && traces.length === 0 && currentPath !== '/logs') {
      return <div className="flex items-center justify-center h-full text-text-muted">Loading...</div>;
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
    if (currentPath === '/collaboration') {
      return <Collaboration projectId={currentProject?.id || ''} />;
    }
    if (currentPath.startsWith('/logs')) {
      return (
        <div className="flex h-full">
          <div className={`${showDetail ? 'w-1/2 hidden md:block' : 'w-full'} border-r border-border-base transition-all`}>
            <LogTable
              projectId={currentProject ? currentProject.id : ''}
              onSelectLog={(log) => setSelectedLog(log)}
              onOpenTrace={handleOpenTrace}
              selectedLogId={selectedLog?.id || null}
            />
          </div>
          {showDetail && selectedTrace && (
            <div className="w-full md:w-1/2 absolute md:static inset-0 z-20 md:z-auto bg-panel">
              <TraceDetail
                trace={selectedTrace}
                onClose={() => navigate('/logs')}
              />
            </div>
          )}
        </div>
      );
    }
    if (currentPath === '/datasets') {
      if (selectedDataset) {
        return <DatasetDetail dataset={selectedDataset} onBack={() => navigate('/datasets')} />;
      }
      return (
        <DatasetList
          projectId={currentProject?.id || ''}
          onSelectDataset={(dataset) => {
            setSelectedDataset(dataset);
            navigate('/datasets', { dataset_id: dataset.id });
          }}
        />
      );
    }
    if (currentPath === '/experiments') {
      if (selectedExperiment) {
        return <ExperimentDetail experiment={selectedExperiment} onBack={() => navigate('/experiments')} />;
      }
      return (
        <ExperimentList
          projectId={currentProject?.id || ''}
          onSelectExperiment={(experiment) => {
            setSelectedExperiment(experiment);
            navigate('/experiments', { experiment_id: experiment.id });
          }}
        />
      );
    }
    if (currentPath === '/settings') {
      return <Settings />;
    }
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
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
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-primary flex items-center justify-center text-white font-bold animate-pulse shadow-xs">
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
        <Card className="max-w-md w-full mx-4 p-8 shadow-lg">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-xs">
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
            <Input
              type="text"
              name="projectName"
              placeholder="Project name"
              className="mb-4"
              autoFocus
            />
            <Button
              type="submit"
              disabled={creatingProject}
              className="w-full"
              variant="primary"
              size="lg"
            >
              {creatingProject ? 'Creating...' : 'Create Project'}
            </Button>
          </form>
        </Card>
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
