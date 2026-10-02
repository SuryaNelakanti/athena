# Experiment UX and Contract Issues (2026-01-08)

This document captures UX and technical issues in the experiment detail and run comparison flow.
It includes user-reported symptoms and code references in FE and BE.

## Reported symptoms
- Version selection cannot be changed (user report).
- Dataset does not appear to be used in experiment version runs (user report).
- When multiple scorers are selected (anti_pattern + llm_judge), the UI defaults to anti_pattern score (user report).
- Run comparison tools are ineffective ("borderline criminal") (user report).

## UX issues
1) Version selection can feel locked or resets to a default.
   - What happens: user tries to switch versions but the selection snaps back or does not stick.
   - Evidence: selection is re-derived during refresh and initial-version sync; there is no route update for user selection.
     FE: `frontend/src/pages/ExperimentDetail.tsx:128`, `frontend/src/pages/ExperimentDetail.tsx:144`, `frontend/src/pages/ExperimentDetail.tsx:166`, `frontend/src/pages/ExperimentDetail.tsx:704`.
   - Impact: cannot reliably inspect non-main versions or compare runs.

2) Compare UX is shallow and not decision-grade.
   - What happens: compare only shows numeric deltas and a single-score column; no output diffs, no scorer breakdown, no per-row drilldown.
   - Evidence: Compare UI uses `getPrimaryScore` and renders only delta summary plus per-row score delta.
     FE: `frontend/src/pages/ExperimentDetail.tsx:246`, `frontend/src/pages/ExperimentDetail.tsx:1196`, `frontend/src/pages/ExperimentDetail.tsx:1216`.
   - Backend only returns numeric deltas and minimal row fields (scores, output_text, latency).
     BE: `backend/app/routers/experiments.py:274`, `backend/app/routers/experiments.py:337`, `backend/app/routers/experiments.py:363`.
   - Impact: no actionable guidance on why a candidate improved or regressed.

3) Results filters hide unscored rows.
   - What happens: "passing" and "failing" tabs drop rows with undefined scores; this hides coverage gaps.
   - Evidence: filtering requires `getPrimaryScore` to be numeric.
     FE: `frontend/src/pages/ExperimentDetail.tsx:556`, `frontend/src/pages/ExperimentDetail.tsx:578`.
   - Impact: it looks like fewer rows were evaluated than actually were, and missing expected data is invisible.

4) Dataset usage is implicit and can look like it is ignored.
   - What happens: runs can show zero rows without explaining that only `row_kind="eval"` rows are used, and the pinned dataset version is not visible in the run view.
   - Evidence: run execution loads rows at pinned version and filters to eval rows.
     BE: `backend/app/services/experiment_v2_service.py:335`, `backend/app/services/experiment_v2_service.py:337`.
   - UI only fetches dataset rows for display and does not show why rows are excluded.
     FE: `frontend/src/pages/ExperimentDetail.tsx:341`, `frontend/src/pages/ExperimentDetail.tsx:648`.
   - Impact: users conclude the dataset is not used even when it is filtered out.

## Technical and contract issues
1) Primary score and avg_score are derived from the first scorer only.
   - Evidence: backend explicitly uses `scorers_cfg[0]` as the primary metric for avg_score.
     BE: `backend/app/services/experiment_v2_service.py:441`, `backend/app/services/experiment_v2_service.py:456`.
   - UI uses the first scorer as `primaryScorer` and uses it for display, filtering, and comparison.
     FE: `frontend/src/pages/ExperimentDetail.tsx:246`, `frontend/src/pages/ExperimentDetail.tsx:556`, `frontend/src/pages/ExperimentDetail.tsx:1216`.
   - This explains the "anti_pattern + llm_judge defaults to anti_pattern" behavior.

2) Scorer ordering is implicit and not exposed in the UX.
   - Evidence: the create-version flow sends a plain `scorers` array with no weights or ordering UI.
     FE: `frontend/src/pages/ExperimentDetail.tsx:367`, `frontend/src/pages/ExperimentDetail.tsx:1356`.
   - Backend stores scorers as a list of `{type}` with no weights.
     BE: `backend/app/services/experiment_v2_service.py:47`, `backend/app/services/experiment_v2_service.py:108`.
   - Impact: the "primary" scorer is determined by checkbox selection order, not by intent.

3) prompt_template is stored but never applied at run time.
   - Evidence: version config stores `prompt_template`, but execution only uses `system_prompt` and ignores prompt_template.
     BE: `backend/app/services/experiment_v2_service.py:41`, `backend/app/services/experiment_v2_service.py:92`, `backend/app/services/experiment_v2_service.py:313`, `backend/app/services/experiment_v2_service.py:359`.
   - Impact: users think prompt templates are used when they are not.

4) LLM judge context can be incomplete for message-based inputs.
   - Evidence: `input_text` for judge scoring is derived from `row.input` keys or string; it ignores `messages` arrays.
     BE: `backend/app/services/experiment_v2_service.py:385`, `backend/app/services/experiment_v2_service.py:389`.
   - Impact: judge scores can be based on partial context when dataset rows are chat-style.

5) Compare summary is tied to avg_score, which is already biased by primary scorer order.
   - Evidence: compare uses numeric delta over `run.summary`, which includes `avg_score` computed from the first scorer.
     BE: `backend/app/routers/experiments.py:363`, `backend/app/services/experiment_v2_service.py:441`.
   - Impact: comparisons can over-weight anti_pattern or any first scorer and under-represent others.

## Notes
- LLM judge scores are normalized to 0-1, but the UI uses a fixed 0.8 pass threshold regardless of scorer type.
  BE: `backend/app/services/scorer_service.py:188`, FE: `frontend/src/pages/ExperimentDetail.tsx:554`.
