import React, { useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearch, Outlet } from '@tanstack/react-router';
import Layout from './layouts/Layout';
import { FirstProjectSetup } from './features/workspace/FirstProjectSetup';
import { useWorkspaceBootstrap } from './features/workspace/useWorkspaceBootstrap';
import OwlWidget from './features/owl/OwlWidget';
import { ProjectContext } from './contexts/ProjectContext';
import { Button } from './components/ui';
import { initAccent } from './lib/theme/accent';

export { default as LogsRoute } from './pages/LogsRoute';
export { default as RunsRoute } from './pages/RunsRoute';

const App: React.FC = () => {
  const location = useLocation();
  const search = useSearch({ from: '__root__' });
  const navigate = useNavigate();
  const {
    currentProject,
    setCurrentProject,
    projects,
    organizations,
    initializing,
    initializationError,
    retryInitialization,
    showCreateProject,
    creatingProject,
    projectCreationError,
    selectedOrgId,
    setSelectedOrgId,
    newOrgName,
    setNewOrgName,
    createProject,
  } = useWorkspaceBootstrap();

  useEffect(() => {
    initAccent();
  }, []);

  useEffect(() => {
    if (location.pathname === '/') {
      navigate({ to: '/overview', replace: true });
    }
  }, [location.pathname, navigate]);

  const routeParamMap = useMemo(() => {
    const params: Record<string, string> = { ...search };
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'datasets' && parts[1]) params.dataset_id = parts[1];
    if (parts[0] === 'experiments' && parts[1]) params.experiment_id = parts[1];
    if (parts[0] === 'share-links' && parts[1]) params.share_token = parts[1];
    return params;
  }, [location.pathname, search]);

  if (initializing) {
    return <div className="flex items-center justify-center h-screen bg-app text-text-muted">Loading Athena...</div>;
  }

  if (initializationError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-app text-center text-text-main">
        <p role="alert" className="mb-4 text-sm text-rose-500">{initializationError}</p>
        <Button variant="secondary" onClick={retryInitialization}>
          Retry
        </Button>
      </div>
    );
  }

  if (creatingProject) {
    return (
      <div className="flex items-center justify-center h-screen bg-app text-text-main">
        <div className="text-center animate-soft-in">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-primary flex items-center justify-center text-white font-bold animate-pulse shadow-xs">
            <span className="text-2xl font-serif">A</span>
          </div>
          <p className="text-lg">Setting up your first project...</p>
        </div>
      </div>
    );
  }

  if (showCreateProject || (!currentProject && projects.length === 0)) {
    return (
      <FirstProjectSetup
        organizations={organizations}
        selectedOrgId={selectedOrgId}
        newOrgName={newOrgName}
        creatingProject={creatingProject}
        error={projectCreationError}
        onOrganizationChange={setSelectedOrgId}
        onNewOrganizationNameChange={setNewOrgName}
        onCreateProject={createProject}
      />
    );
  }

  if (!currentProject) {
    return <div className="flex items-center justify-center h-screen bg-app text-text-muted">Loading Athena...</div>;
  }

  return (
    <ProjectContext.Provider value={{ projects, currentProject, setCurrentProject }}>
      <Layout
        projects={projects}
        currentProject={currentProject}
        onProjectChange={setCurrentProject}
      >
        <Outlet />
      </Layout>
      <OwlWidget
        projectId={currentProject.id}
        projectName={currentProject.name}
        currentPath={location.pathname}
        routeParams={routeParamMap}
      />
    </ProjectContext.Provider>
  );
};

export default App;
