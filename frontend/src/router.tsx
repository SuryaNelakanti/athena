import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router';
import App from './App';
import LogsRoute from './pages/LogsRoute';
import RunsRoute from './pages/RunsRoute';

const optionalSearchString = (search: Record<string, unknown>, key: string): string | undefined => {
    const value = search[key];
    return typeof value === 'string' ? value || undefined : undefined;
};

// Root route
const rootRoute = createRootRoute({
    component: App,
});

// Index route
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null, // App component handles redirection for now
});

// Other routes
const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/overview',
    component: lazyRouteComponent(() => import('./pages/Dashboard')),
});

const logsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/logs',
    component: LogsRoute,
    validateSearch: (search: Record<string, unknown>): { trace_id?: string; log_id?: string } => {
        return {
            trace_id: optionalSearchString(search, 'trace_id'),
            log_id: optionalSearchString(search, 'log_id'),
        };
    },
});

const datasetsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/datasets',
    component: lazyRouteComponent(() => import('./pages/DatasetList')),
});

const datasetDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/datasets/$datasetId',
    component: lazyRouteComponent(() => import('./pages/DatasetDetail')),
});

const experimentsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/experiments',
    component: lazyRouteComponent(() => import('./pages/ExperimentList')),
});

const experimentDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/experiments/$experimentId',
    component: lazyRouteComponent(() => import('./pages/ExperimentDetail')),
    validateSearch: (search: Record<string, unknown>): {
        version?: string;
        run?: string;
        result?: string;
        tab?: string;
        compare?: string;
    } => {
        return {
            version: optionalSearchString(search, 'version'),
            run: optionalSearchString(search, 'run'),
            result: optionalSearchString(search, 'result'),
            tab: optionalSearchString(search, 'tab'),
            compare: optionalSearchString(search, 'compare'),
        };
    },
});



const promptTestDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/prompt-tests/$promptTestId',
    component: lazyRouteComponent(() => import('./pages/PromptTestDetail')),
});

const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/review',
    component: lazyRouteComponent(() => import('./pages/ReviewQueue')),
});

const collaborationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/collaboration',
    component: lazyRouteComponent(() => import('./pages/Collaboration')),
});

const runsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/runs',
    component: RunsRoute,
    validateSearch: (search: Record<string, unknown>): { session_id?: string; run_id?: string } => {
        return {
            session_id: optionalSearchString(search, 'session_id'),
            run_id: optionalSearchString(search, 'run_id'),
        };
    },
});

const labsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/labs',
    component: lazyRouteComponent(() => import('./pages/Labs')),
});

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: lazyRouteComponent(() => import('./pages/Settings')),
});

const shareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/share-links/$token',
    component: lazyRouteComponent(() => import('./pages/ShareLinkResolver'), 'ShareLinkResolver'),
    validateSearch: (search: Record<string, unknown>): { result?: string; experiment_result_id?: string } => ({
        result: optionalSearchString(search, 'result'),
        experiment_result_id: optionalSearchString(search, 'experiment_result_id'),
    }),
});


// Route tree
const routeTree = rootRoute.addChildren([
    indexRoute,
    overviewRoute,
    logsRoute,
    datasetsRoute,
    datasetDetailRoute,
    experimentsRoute,
    experimentDetailRoute,

    promptTestDetailRoute,
    reviewRoute,
    collaborationRoute,
    runsRoute,
    labsRoute,
    settingsRoute,
    shareRoute,
]);


// Router
export const router = createRouter({ routeTree });

// Register for type safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
