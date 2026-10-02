import { CheckCircleIcon, HandThumbDownIcon, HandThumbUpIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Button, Select, Textarea } from '../../components/ui';
import type { Dataset } from '../../types';

export type TraceReviewAction = 'good' | 'correct' | 'bad';

interface TracePromoteModalProps {
    open: boolean;
    actionType: TraceReviewAction;
    actionError: string | null;
    actionSuccess: string | null;
    datasetsError: string | null;
    datasets: Dataset[];
    selectedDatasetId: string | null;
    correctedOutput: string;
    currentOutput: string;
    isPromoting: boolean;
    onSelectDataset: (datasetId: string) => void;
    onCorrectedOutputChange: (output: string) => void;
    onClose: () => void;
    onPromote: () => void | Promise<void>;
}

export function TracePromoteModal({
    open,
    actionType,
    actionError,
    actionSuccess,
    datasetsError,
    datasets,
    selectedDatasetId,
    correctedOutput,
    currentOutput,
    isPromoting,
    onSelectDataset,
    onCorrectedOutputChange,
    onClose,
    onPromote,
}: TracePromoteModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-panel border border-border-base rounded-lg shadow-lg w-full max-w-lg">
                <div className={`p-6 border-b rounded-t-lg ${actionType === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' :
                    actionType === 'correct' ? 'border-amber-500/30 bg-amber-500/5' :
                        'border-rose-500/30 bg-rose-500/5'
                    }`}>
                    <h3 className="text-lg font-serif font-black text-text-main flex items-center gap-2">
                        {actionType === 'good' && <><HandThumbUpIcon className="w-5 h-5 text-emerald-500" /> Add as Good Example</>}
                        {actionType === 'correct' && <><PencilSquareIcon className="w-5 h-5 text-amber-500" /> Correct & Add</>}
                        {actionType === 'bad' && <><HandThumbDownIcon className="w-5 h-5 text-rose-500" /> Mark as Bad Example</>}
                    </h3>
                    <p className="text-xs text-text-muted mt-1">
                        {actionType === 'good' && 'This trace will be added as a gold example (correct behavior).'}
                        {actionType === 'correct' && 'Edit the expected output before adding to the dataset.'}
                        {actionType === 'bad' && 'This trace will be added as an anti-pattern (behavior to avoid).'}
                    </p>
                </div>
                <div className="p-6 space-y-4">
                    {actionError && (
                        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">{actionError}</div>
                    )}
                    {actionSuccess && (
                        <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-md p-3 flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4" /> {actionSuccess}
                        </div>
                    )}

                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Select Dataset</label>
                        {datasetsError && (
                            <div role="alert" className="mb-3 rounded-md bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
                                {datasetsError}
                            </div>
                        )}
                        <Select value={selectedDatasetId || ''} onChange={(event) => onSelectDataset(event.target.value)}>
                            <option value="">Choose a dataset...</option>
                            {datasets.map((dataset) => (
                                <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                            ))}
                        </Select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Current Output</label>
                        <div className="bg-app border border-border-base rounded-md p-3 text-xs text-text-main max-h-24 overflow-y-auto">
                            {currentOutput || '(No output)'}
                        </div>
                    </div>

                    {actionType === 'correct' && (
                        <div>
                            <label className="block text-[11px] font-medium text-emerald-600 mb-2">
                                Corrected Expected Output
                            </label>
                            <Textarea
                                value={correctedOutput}
                                onChange={(event) => onCorrectedOutputChange(event.target.value)}
                                className="bg-emerald-500/5 border-emerald-500/30 focus:ring-emerald-500/20 h-32 resize-none"
                                placeholder="Enter the correct expected output..."
                            />
                        </div>
                    )}

                    <div className="flex gap-4 pt-2">
                        <Button variant="secondary" className="flex-1" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={onPromote}
                            disabled={isPromoting || !selectedDatasetId}
                            variant={actionType === 'good' ? 'success' : actionType === 'correct' ? 'secondary' : 'danger'}
                            className="flex-1"
                        >
                            {isPromoting ? 'Adding...' :
                                actionType === 'good' ? 'Add as Gold' :
                                    actionType === 'correct' ? 'Add Corrected' :
                                        'Add as Anti-Pattern'
                            }
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
