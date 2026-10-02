import { createContext, useContext } from 'react';
import { Project } from '../types';

interface ProjectContextType {
    projects: Project[];
    currentProject: Project | null;
    setCurrentProject: (project: Project | null) => void;
}

export const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
