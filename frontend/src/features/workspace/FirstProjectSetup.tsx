import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Card, Input, Select } from '../../components/ui';
import type { Organization } from '../../types';

type FirstProjectSetupProps = {
  organizations: Organization[];
  selectedOrgId: string;
  newOrgName: string;
  creatingProject: boolean;
  error: string | null;
  onOrganizationChange: (organizationId: string) => void;
  onNewOrganizationNameChange: (name: string) => void;
  onCreateProject: (name: string) => void | Promise<void>;
};

export function FirstProjectSetup({
  organizations,
  selectedOrgId,
  newOrgName,
  creatingProject,
  error,
  onOrganizationChange,
  onNewOrganizationNameChange,
  onCreateProject,
}: FirstProjectSetupProps) {
  const [projectName, setProjectName] = useState('');
  const creatingOrganization = organizations.length === 0 || selectedOrgId === 'new';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCreateProject(projectName);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-app text-text-main">
      <Card className="max-w-md w-full mx-4 p-8 shadow-lg animate-soft-in">
        <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-xs">
          <span className="text-2xl font-serif">A</span>
        </div>
        <h2 className="text-xl font-semibold text-center mb-2">Welcome to Athena</h2>
        <p className="text-text-muted text-center mb-6">
          Create your organization and first project to get started
        </p>
        <form onSubmit={handleSubmit}>
          {organizations.length > 0 && (
            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-2">
                Organization
              </label>
              <Select
                value={selectedOrgId}
                onChange={(event) => onOrganizationChange(event.target.value)}
                className="w-full"
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id} className="bg-panel text-text-main">
                    {organization.name}
                  </option>
                ))}
                <option value="new" className="bg-panel text-text-main">Create new organization</option>
              </Select>
            </div>
          )}
          {creatingOrganization && (
            <Input
              type="text"
              name="orgName"
              placeholder="Organization name"
              className="mb-4"
              value={newOrgName}
              onChange={(event) => onNewOrganizationNameChange(event.target.value)}
              autoFocus
            />
          )}
          <Input
            type="text"
            name="projectName"
            placeholder="Project name"
            className="mb-4"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            autoFocus={!creatingOrganization}
          />
          {error && <p role="alert" className="mb-4 text-sm text-rose-500">{error}</p>}
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
