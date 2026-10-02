import { useCallback, useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Organization, Project } from '../../types';

export function useWorkspaceBootstrap() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectCreationError, setProjectCreationError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setInitializing(true);
    setInitializationError(null);
    Promise.all([api.getOrganizations(), api.getProjects()])
      .then(([loadedOrganizations, loadedProjects]) => {
        if (!isCurrent) return;
        setOrganizations(loadedOrganizations);
        if (!loadedProjects.length) {
          setProjects([]);
          setCurrentProject(null);
          setShowCreateProject(true);
          return;
        }

        setProjects(loadedProjects);
        const firstProject = loadedProjects[0];
        setCurrentProject(firstProject);
        const matchingOrganization = loadedOrganizations.find(
          (organization) => organization.id === firstProject.org_id,
        ) || loadedOrganizations[0] || null;
        if (matchingOrganization) setSelectedOrgId(matchingOrganization.id);
      })
      .catch((cause: unknown) => {
        if (isCurrent) {
          setInitializationError(getErrorMessage(cause, 'Failed to load your Athena workspace'));
        }
      })
      .finally(() => {
        if (isCurrent) setInitializing(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [retryKey]);

  useEffect(() => {
    if (selectedOrgId) return;
    setSelectedOrgId(organizations[0]?.id || 'new');
  }, [organizations, selectedOrgId]);

  const retryInitialization = useCallback(() => {
    setRetryKey((current) => current + 1);
  }, []);

  const createProject = useCallback(async (name: string) => {
    const creatingOrganization = organizations.length === 0 || selectedOrgId === 'new';
    if (!name.trim() || (creatingOrganization && !newOrgName.trim())) return;

    setProjectCreationError(null);
    setCreatingProject(true);
    try {
      let organizationId = selectedOrgId || organizations[0]?.id;
      if (creatingOrganization) {
        const createdOrganization = await api.createOrganization({ name: newOrgName.trim() });
        setOrganizations((current) => (
          current.length ? [...current, createdOrganization] : [createdOrganization]
        ));
        organizationId = createdOrganization.id;
        setSelectedOrgId(createdOrganization.id);
      }

      const project = await api.createProject({ name, org_id: organizationId || undefined });
      setProjects([project]);
      setCurrentProject(project);
      setShowCreateProject(false);
    } catch (cause: unknown) {
      setProjectCreationError(getErrorMessage(cause, 'Failed to create project'));
    } finally {
      setCreatingProject(false);
    }
  }, [organizations, selectedOrgId, newOrgName]);

  return {
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
  };
}
