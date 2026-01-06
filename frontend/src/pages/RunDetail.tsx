import React from 'react';
import { RunNarrative } from '../features';

interface RunDetailProps {
  runId: string;
  onBack: (sessionId?: string) => void;
  onOpenTrace?: (traceId: string) => void;
}

const RunDetail: React.FC<RunDetailProps> = ({ runId, onBack, onOpenTrace }) => {
  return (
    <RunNarrative
      runId={runId}
      onBack={onBack}
      onOpenTrace={onOpenTrace}
    />
  );
};

export default RunDetail;
