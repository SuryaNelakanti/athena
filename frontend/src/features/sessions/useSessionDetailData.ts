import { useEffect, useState } from 'react';
import type { SessionAnnotation, SessionEvent } from '../../types';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';

export const useSessionDetailData = (sessionId: string) => {
  const [timeline, setTimeline] = useState<SessionEvent[]>([]);
  const [annotations, setAnnotations] = useState<SessionAnnotation[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setTimeline([]);
    setAnnotations([]);
    setTimelineError(null);
    setAnnotationsError(null);

    if (!sessionId) {
      return () => {
        active = false;
      };
    }

    api.getSessionTimeline(sessionId, { limit: 200 })
      .then((events) => {
        if (active) setTimeline(events);
      })
      .catch((error: unknown) => {
        if (active) setTimelineError(getErrorMessage(error, 'Unable to load the session timeline.'));
      });

    api.getSessionAnnotations(sessionId)
      .then((items) => {
        if (active) setAnnotations(items);
      })
      .catch((error: unknown) => {
        if (active) setAnnotationsError(getErrorMessage(error, 'Unable to load session annotations.'));
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  return {
    timeline,
    annotations,
    setAnnotations,
    timelineError,
    annotationsError,
  };
};
