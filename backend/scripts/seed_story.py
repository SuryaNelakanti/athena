import asyncio
import time
from pathlib import Path
from typing import Any, Optional

import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select

from app.models import (
    DatasetModel,
    DatasetRowModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    FunctionModel,
    LogModel,
    ModelRegistryModel,
    Project,
    SpanModel,
    SpanType,
    TraceModel,
    ViewModel,
)
from app.services.experiment_v2_service import ExperimentV2Service, VersionConfig
from app.services.scorer_service import BUILTIN_SCORERS


def now_ms() -> int:
    return int(time.time() * 1000)


def citations(doc_id: str, title: str, quote: str) -> list[dict]:
    return [{"doc_id": doc_id, "title": title, "quote": quote}]


def make_span(
    *,
    id_: str,
    trace_id: str,
    parent_id: Optional[str],
    name: str,
    type_: SpanType,
    start_ms: int,
    end_ms: int,
    status: str,
    input_: Any,
    output: Any,
    metrics: dict,
    attributes: dict,
    tags: list[str],
    error_message: Optional[str] = None,
) -> SpanModel:
    m = {**metrics}
    m.setdefault("latency_ms", float(end_ms - start_ms))
    return SpanModel(
        id=id_,
        trace_id=trace_id,
        parent_id=parent_id,
        name=name,
        type=type_,
        start_time=start_ms,
        end_time=end_ms,
        status=status,
        input=input_ if isinstance(input_, dict) else {"value": input_},
        output=output if isinstance(output, dict) else {"value": output},
        metrics=m,
        attributes=attributes,
        tags=tags,
        error_message=error_message,
    )


def make_trace(*, trace_id: str, project_id: str, timestamp_ms: int, status: str, tags: list[str], spans: list[SpanModel]) -> TraceModel:
    total_latency = max((float((s.metrics or {}).get("latency_ms", 0.0) or 0.0) for s in spans), default=0.0)
    total_cost = sum((float((s.metrics or {}).get("cost", 0.0) or 0.0) for s in spans), 0.0)
    total_tokens = sum((int((s.metrics or {}).get("total_tokens", 0) or 0) for s in spans), 0)
    return TraceModel(
        id=trace_id,
        project_id=project_id,
        timestamp=timestamp_ms,
        total_latency=float(total_latency),
        total_cost=float(total_cost),
        total_tokens=int(total_tokens),
        status=status,
        tags=tags,
    )


async def wipe_and_init(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)


async def seed_core(session: AsyncSession) -> None:
    org_id = "org_octoworks"
    projects = [
        ("proj_support", "OctoWorks - Support"),
        ("proj_legal", "OctoWorks - Legal"),
        ("proj_gtm", "OctoWorks - GTM"),
    ]
    for pid, name in projects:
        session.add(Project(id=pid, name=name, org_id=org_id))

    models = [
        ("mdl_seed_01", "openai", "gpt-4o", "GPT-4o", True),
        ("mdl_seed_02", "openai", "gpt-4o-mini", "GPT-4o mini", True),
        ("mdl_seed_03", "anthropic", "claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", True),
        ("mdl_seed_04", "gemini", "gemini-1.5-pro", "Gemini 1.5 Pro", True),
        ("mdl_seed_05", "gemini", "gemini-2.0-flash", "Gemini 2.0 Flash", True),
        ("mdl_seed_06", "mock", "mock-model", "Mock Model", True),
    ]
    for id_, provider, model_id, display_name, enabled in models:
        session.add(ModelRegistryModel(id=id_, provider=provider, model_id=model_id, display_name=display_name, enabled=enabled))

    views = [
        ("proj_support", "Refunds", {"status": "all", "search": "Refund"}),
        ("proj_support", "Errors", {"status": "error", "search": ""}),
        ("proj_legal", "Clause", {"status": "all", "search": "Clause"}),
        ("proj_gtm", "Outbound", {"status": "all", "search": "Email"}),
    ]
    base = now_ms()
    for idx, (pid, name, cfg) in enumerate(views, start=1):
        session.add(ViewModel(id=f"view_seed_{idx:02d}", project_id=pid, name=name, config=cfg, entity_type="traces", created_at=base - idx * 1000))

    # Seed built-in scorers
    for scorer in BUILTIN_SCORERS:
        func = FunctionModel(
            id=f"fn_builtin_{scorer['name']}",
            project_id=None,  # Global/builtin
            name=scorer["name"],
            display_name=scorer["display_name"],
            description=scorer["description"],
            type="scorer",
            runtime=scorer["runtime"],
            config=scorer["config"],
            enabled=True,
        )
        session.add(func)

    await session.commit()


def lines(block: str) -> list[str]:
    return [l.strip() for l in block.strip().splitlines() if l.strip()]


async def seed_prod_story(session: AsyncSession) -> dict[str, str]:
    """
    Seeds a small set of production traces that tell a cross-functional enterprise story.
    Returns representative "bad example" trace IDs used as provenance in datasets.
    """
    base = now_ms()
    bad: dict[str, str] = {}

    def add(trace: TraceModel, spans: list[SpanModel]):
        session.add(trace)
        for s in spans:
            session.add(s)

    # Support: good refund escalation (tool + LLM w/ citations)
    trace_id = "trace_support_refund_001"
    start = base - 8 * 60 * 1000
    root = make_span(
        id_="span_support_refund_root_001",
        trace_id=trace_id,
        parent_id=None,
        name="Support: Refund escalation - VIP double-charged",
        type_=SpanType.CHAIN,
        start_ms=start,
        end_ms=start + 1200,
        status="success",
        input_={"ticket_id": "TCK-88421", "customer_tier": "enterprise", "issue": "double charge"},
        output={"status": "resolved"},
        metrics={"latency_ms": 1200},
        attributes={"env": "prod"},
        tags=["env:prod", "team:support"],
    )
    tool = make_span(
        id_="span_support_refund_tool_001",
        trace_id=trace_id,
        parent_id=root.id,
        name="Tool: Stripe refund.create",
        type_=SpanType.TOOL,
        start_ms=start + 120,
        end_ms=start + 520,
        status="success",
        input_={"charge_id": "ch_9x91", "amount": 12900, "currency": "usd"},
        output={"refund_id": "re_31a", "status": "succeeded"},
        metrics={"latency_ms": 400},
        attributes={"tool": "stripe"},
        tags=["env:prod"],
    )
    llm = make_span(
        id_="span_support_refund_llm_001",
        trace_id=trace_id,
        parent_id=root.id,
        name="LLM: Draft customer reply",
        type_=SpanType.LLM,
        start_ms=start + 560,
        end_ms=start + 1200,
        status="success",
        input_={"prompt": "Write a concise apology and confirm refund timeline."},
        output={
            "output_text": "I've issued your refund for the duplicate charge. You should see it back on your card within 5-10 business days.",
            "citations": citations("policy_refunds_v3", "Refund Policy v3", "Bank posting time is 5-10 business days."),
        },
        metrics={"latency_ms": 640, "total_tokens": 220, "prompt_tokens": 120, "completion_tokens": 100, "cost": 0.0021},
        attributes={"model": "gpt-4o", "provider": "openai"},
        tags=["env:prod", "policy:refunds"],
    )
    spans = [root, tool, llm]
    add(make_trace(trace_id=trace_id, project_id="proj_support", timestamp_ms=start, status="success", tags=["env:prod", "area:refunds"], spans=spans), spans)

    # Support: bad refund hallucination (promoted)
    trace_id = "trace_support_refund_bad_001"
    bad["support_refunds"] = trace_id
    start = base - 33 * 60 * 1000
    root = make_span(
        id_="span_support_refund_bad_root_001",
        trace_id=trace_id,
        parent_id=None,
        name="Support: Refund policy - hallucinated exception",
        type_=SpanType.CHAIN,
        start_ms=start,
        end_ms=start + 900,
        status="error",
        input_={"ticket_id": "TCK-90012", "issue": "subscription canceled late", "plan": "monthly"},
        output={"status": "sent", "risk": "policy_violation"},
        metrics={"latency_ms": 900},
        attributes={"env": "prod"},
        tags=["env:prod", "team:support", "severity:high"],
        error_message="Promised refund outside policy window",
    )
    llm = make_span(
        id_="span_support_refund_bad_llm_001",
        trace_id=trace_id,
        parent_id=root.id,
        name="LLM: Draft reply (incorrect)",
        type_=SpanType.LLM,
        start_ms=start + 120,
        end_ms=start + 900,
        status="error",
        input_={"prompt": "Explain refund policy for a late cancellation."},
        output={"output_text": "No worries - we can refund you for the last 3 months even after the cancellation window."},
        metrics={"latency_ms": 780, "total_tokens": 180, "prompt_tokens": 90, "completion_tokens": 90, "cost": 0.0017},
        attributes={"model": "gpt-4o-mini", "provider": "openai"},
        tags=["env:prod", "policy:refunds"],
        error_message="Hallucinated refund window",
    )
    spans = [root, llm]
    add(make_trace(trace_id=trace_id, project_id="proj_support", timestamp_ms=start, status="error", tags=["env:prod", "area:refunds", "failure:policy_violation"], spans=spans), spans)

    # Support: streaming trace (chat)
    trace_id = "trace_support_stream_001"
    start = base - 18 * 60 * 1000
    llm = make_span(
        id_="span_support_stream_llm_001",
        trace_id=trace_id,
        parent_id=None,
        name="Support: Live chat - shipping ETA (stream)",
        type_=SpanType.LLM,
        start_ms=start,
        end_ms=start + 2100,
        status="success",
        input_={"messages": [{"role": "user", "content": "Where is my order #4412?"}], "stream": True},
        output={
            "output_text": "Your order is in transit and is expected to arrive on Thursday.",
            "citations": citations("policy_shipping_sla_v2", "Shipping SLA v2", "Standard shipping arrives in 3-5 business days."),
        },
        metrics={"latency_ms": 2100, "total_tokens": 140, "prompt_tokens": 60, "completion_tokens": 80, "cost": 0.0012},
        attributes={"model": "claude-3-5-sonnet-20240620", "provider": "anthropic", "stream": True},
        tags=["env:prod", "stream:true"],
    )
    spans = [llm]
    add(make_trace(trace_id=trace_id, project_id="proj_support", timestamp_ms=start, status="success", tags=["env:prod", "area:shipping", "stream:true"], spans=spans), spans)

    # Legal: clause extraction w/ reasoning tag
    trace_id = "trace_legal_clause_001"
    start = base - 55 * 60 * 1000
    llm = make_span(
        id_="span_legal_clause_llm_001",
        trace_id=trace_id,
        parent_id=None,
        name="Legal: Clause extraction - Liability + Termination",
        type_=SpanType.LLM,
        start_ms=start,
        end_ms=start + 3100,
        status="success",
        input_={"prompt": "Extract liability and termination clauses; cite section numbers."},
        output={
            "output_text": "Liability: Section 8 limits aggregate liability to fees paid in the last 12 months. Termination: Section 12 allows termination for cause with 30 days to cure.",
            "citations": [
                {"doc_id": "MSA-2025-11", "title": "Master Services Agreement", "quote": "8.2 Limitation of Liability..."},
                {"doc_id": "MSA-2025-11", "title": "Master Services Agreement", "quote": "12.3 Termination for Cause..."},
            ],
        },
        metrics={"latency_ms": 3100, "total_tokens": 980, "prompt_tokens": 620, "completion_tokens": 360, "cost": 0.018},
        attributes={"model": "gpt-4o", "provider": "openai", "reasoning_enabled": True, "reasoning_effort": "medium"},
        tags=["env:prod", "area:contracts"],
    )
    spans = [llm]
    add(make_trace(trace_id=trace_id, project_id="proj_legal", timestamp_ms=start, status="success", tags=["env:prod", "area:contracts"], spans=spans), spans)

    # Legal: invented section (promoted)
    trace_id = "trace_legal_bad_001"
    bad["legal_redlines"] = trace_id
    start = base - 95 * 60 * 1000
    llm = make_span(
        id_="span_legal_bad_llm_001",
        trace_id=trace_id,
        parent_id=None,
        name="Legal: Redline suggestion - invented section",
        type_=SpanType.LLM,
        start_ms=start,
        end_ms=start + 2400,
        status="error",
        input_={"prompt": "Propose SCC clause insertion and cite the contract section."},
        output={"output_text": "Add SCCs under Section 19.4 to comply with EU transfer rules."},
        metrics={"latency_ms": 2400, "total_tokens": 760, "prompt_tokens": 520, "completion_tokens": 240, "cost": 0.013},
        attributes={"model": "gpt-4o-mini", "provider": "openai"},
        tags=["env:prod", "severity:high"],
        error_message="Referenced Section 19.4 which does not exist",
    )
    spans = [llm]
    add(make_trace(trace_id=trace_id, project_id="proj_legal", timestamp_ms=start, status="error", tags=["env:prod", "area:contracts", "failure:hallucination"], spans=spans), spans)

    # GTM: compliant outbound email
    trace_id = "trace_gtm_email_001"
    start = base - 25 * 60 * 1000
    llm = make_span(
        id_="span_gtm_email_llm_001",
        trace_id=trace_id,
        parent_id=None,
        name="GTM: Draft outbound email - compliant + personalized",
        type_=SpanType.LLM,
        start_ms=start,
        end_ms=start + 1600,
        status="success",
        input_={"prompt": "Write a short email offering a demo; include opt-out language."},
        output={
            "output_text": "Hi Avery - want to see how OctoWorks reduces refund escalations with traceable AI? If you'd rather not receive emails like this, reply 'opt out'.",
            "citations": citations("policy_outbound_v1", "Outbound Compliance v1", "Include an opt-out mechanism; avoid spam language."),
        },
        metrics={"latency_ms": 1600, "total_tokens": 260, "prompt_tokens": 140, "completion_tokens": 120, "cost": 0.0026},
        attributes={"model": "claude-3-5-sonnet-20240620", "provider": "anthropic"},
        tags=["env:prod", "area:outbound"],
    )
    spans = [llm]
    add(make_trace(trace_id=trace_id, project_id="proj_gtm", timestamp_ms=start, status="success", tags=["env:prod", "area:outbound"], spans=spans), spans)

    # GTM: non-compliant spammy email (promoted)
    trace_id = "trace_gtm_spam_bad_001"
    bad["gtm_outbound"] = trace_id
    start = base - 80 * 60 * 1000
    llm = make_span(
        id_="span_gtm_spam_bad_llm_001",
        trace_id=trace_id,
        parent_id=None,
        name="GTM: Outbound email - compliance violation (missing opt-out)",
        type_=SpanType.LLM,
        start_ms=start,
        end_ms=start + 1400,
        status="error",
        input_={"prompt": "Write an email. Keep it short."},
        output={"output_text": "Buy now - limited time offer. Reply ASAP to lock pricing."},
        metrics={"latency_ms": 1400, "total_tokens": 180, "prompt_tokens": 80, "completion_tokens": 100, "cost": 0.0015},
        attributes={"model": "gpt-4o-mini", "provider": "openai"},
        tags=["env:prod", "severity:high"],
        error_message="No unsubscribe/opt-out footer",
    )
    spans = [llm]
    add(make_trace(trace_id=trace_id, project_id="proj_gtm", timestamp_ms=start, status="error", tags=["env:prod", "area:outbound", "failure:compliance"], spans=spans), spans)

    await session.commit()
    
    # Seed logs corresponding to each trace (for Logs UI demo)
    log_entries = [
        # Support logs
        ("log_support_001", "proj_support", "trace_support_refund_001", "INFO", "LLM call to gpt-4o", start - 8 * 60 * 1000, 640, 220, 0.0021, "gpt-4o", "openai"),
        ("log_support_002", "proj_support", "trace_support_refund_bad_001", "ERROR", "LLM call to gpt-4o-mini failed: Hallucinated refund window", start - 33 * 60 * 1000, 780, 180, 0.0017, "gpt-4o-mini", "openai"),
        ("log_support_003", "proj_support", "trace_support_stream_001", "INFO", "LLM stream call to claude-3-5-sonnet-20240620", start - 18 * 60 * 1000, 2100, 140, 0.0012, "claude-3-5-sonnet-20240620", "anthropic"),
        # Legal logs
        ("log_legal_001", "proj_legal", "trace_legal_clause_001", "INFO", "LLM call to gpt-4o", start - 55 * 60 * 1000, 3100, 980, 0.018, "gpt-4o", "openai"),
        ("log_legal_002", "proj_legal", "trace_legal_bad_001", "ERROR", "LLM call to gpt-4o-mini failed: Referenced Section 19.4 which does not exist", start - 95 * 60 * 1000, 2400, 760, 0.013, "gpt-4o-mini", "openai"),
        # GTM logs
        ("log_gtm_001", "proj_gtm", "trace_gtm_email_001", "INFO", "LLM call to claude-3-5-sonnet-20240620", start - 25 * 60 * 1000, 1600, 260, 0.0026, "claude-3-5-sonnet-20240620", "anthropic"),
        ("log_gtm_002", "proj_gtm", "trace_gtm_spam_bad_001", "ERROR", "LLM call to gpt-4o-mini failed: No unsubscribe/opt-out footer", start - 80 * 60 * 1000, 1400, 180, 0.0015, "gpt-4o-mini", "openai"),
    ]
    
    for log_id, project_id, trace_id, level, message, timestamp, latency_ms, total_tokens, cost, model, provider in log_entries:
        session.add(LogModel(
            id=log_id,
            project_id=project_id,
            trace_id=trace_id,
            span_id=None,
            level=level,
            message=message,
            timestamp=timestamp,
            latency_ms=latency_ms,
            prompt_tokens=int(total_tokens * 0.55),
            completion_tokens=int(total_tokens * 0.45),
            total_tokens=total_tokens,
            cost=cost,
            model=model,
            provider=provider,
            attributes={},
            log_metadata={},
            created_at=timestamp + int(latency_ms),
        ))
    
    await session.commit()
    return bad


async def seed_datasets(session: AsyncSession, bad: dict[str, str]) -> None:
    base = now_ms()
    datasets = [
        ("ds_support_refunds_gold", "proj_support", "Refund Escalations (Gold)", "Policy-correct refund replies with citations.", 3),
        ("ds_support_shipping_gold", "proj_support", "Shipping SLA Q&A (Gold)", "ETA answers grounded in SLA docs.", 2),
        ("ds_legal_clause_gold", "proj_legal", "Clause Extraction (Gold)", "Extract clauses with correct section references.", 2),
        ("ds_legal_redlines_gold", "proj_legal", "Redlines (Gold)", "Safe redlines; avoid inventing sections.", 2),
        ("ds_gtm_outreach_gold", "proj_gtm", "Outbound Personalization (Gold)", "Compliant, non-spammy outreach with opt-out.", 2),
        ("ds_gtm_lead_qual_gold", "proj_gtm", "Lead Qualification (Gold)", "Lead scoring with rationale; no hallucinated facts.", 2),
    ]
    for idx, (ds_id, project_id, name, desc, version) in enumerate(datasets, start=1):
        session.add(DatasetModel(id=ds_id, project_id=project_id, name=name, description=desc, version=version, created_at=base - idx * 1_000_000))
    await session.commit()

    refund_answers = lines(
        """
        We can refund duplicate charges immediately, and you should see the funds within 5-10 business days.
        Refunds for late cancellations aren't available outside the cancellation window, but we can stop future charges right away.
        If you were billed after a downgrade, we can refund the prorated difference once we confirm the invoice.
        We can issue a refund for accidental duplicate purchases after verifying the order IDs; posting time is 5-10 business days.
        Chargebacks are handled by your bank; we can provide invoice evidence and prevent future charges.
        We can refund the add-on that was billed twice and confirm once processed.
        Refunds are processed immediately; your bank may take 5-10 business days to post.
        We can refund duplicate tax charges after verifying invoice numbers and region.
        We can refund the duplicate charge and keep your subscription active unless you'd like to cancel.
        We can't refund outside the policy window, but we can offer account credit if approved.
        """
    )
    shipping_answers = lines(
        """
        Standard shipping arrives in 3-5 business days; your order is expected Thursday.
        Expedited shipping arrives in 1-2 business days; your package is expected tomorrow.
        If tracking hasn't updated in 48 hours, we can open a carrier investigation.
        International shipping can take 7-14 business days depending on customs.
        If the delivery window is missed, we can refund shipping charges per policy.
        Address changes are possible before fulfillment; after shipment we can request a carrier intercept.
        """
    )
    clause_answers = lines(
        """
        Liability is limited to fees paid in the last 12 months; cite Section 8.2.
        Termination for cause allows 30 days to cure; cite Section 12.3.
        Confidentiality obligations survive for 3 years; cite Section 10.1.
        IP ownership remains with each party; cite Section 7.1.
        Indemnity covers third-party IP claims; cite Section 9.2.
        Payment terms are Net 30; cite Section 4.1.
        Governing law is Delaware; cite Section 14.5.
        SLAs are in Exhibit B; cite Exhibit B.
        """
    )
    redline_answers = lines(
        """
        Add SCC language in the Data Transfer section and cite the existing data processing section accurately.
        Reduce liability carve-outs and cite the limitation section.
        Add a mutual confidentiality carve-out for compelled disclosure and cite confidentiality.
        Insert audit rights limited to once per year and cite the security/audit section.
        Clarify termination assistance period and cite termination.
        Add a privacy notice reference without inventing sections; cite the correct exhibit if present.
        """
    )
    outbound_answers = lines(
        """
        Write a short, compliant email with an opt-out line and no spammy language.
        Personalize to the persona's pain; avoid aggressive urgency; include opt-out.
        Offer a demo with a single CTA; include opt-out; avoid discount bait.
        Mention a relevant use case; no exaggerated claims; include opt-out.
        Keep it under 80 words; no all-caps; include opt-out.
        Avoid limited-time pressure; include opt-out; be specific.
        Do not mention scraped data; include opt-out; keep professional tone.
        Use neutral tone; include opt-out; avoid "buy now".
        """
    )
    qual_answers = lines(
        """
        Score medium intent with rationale based on fit and engagement signals.
        Score high intent because they requested pricing and a timeline; include rationale.
        Score low intent due to no engagement and poor fit; include rationale.
        Score medium because persona is relevant but no budget signal; include rationale.
        Score high due to inbound demo request; include rationale.
        Score low due to student email and no company domain; include rationale.
        """
    )

    rows: list[tuple[str, str, str, str, Optional[str]]] = []
    for i, a in enumerate(refund_answers, start=1):
        rows.append(("ds_support_refunds_gold", f"Refund ticket scenario #{i}. Provide the correct resolution.", a, "policy_refunds_v3", bad.get("support_refunds") if i == 2 else None))
    for i, a in enumerate(shipping_answers, start=1):
        rows.append(("ds_support_shipping_gold", f"Shipping ETA scenario #{i}. Answer using the SLA.", a, "policy_shipping_sla_v2", None))
    for i, a in enumerate(clause_answers, start=1):
        rows.append(("ds_legal_clause_gold", f"Extract clause #{i} and cite the section.", a, "MSA-2025-11", None))
    for i, a in enumerate(redline_answers, start=1):
        rows.append(("ds_legal_redlines_gold", f"Draft safe redline #{i} with accurate citations.", a, "DPA-441", bad.get("legal_redlines") if i == 1 else None))
    for i, a in enumerate(outbound_answers, start=1):
        rows.append(("ds_gtm_outreach_gold", f"Draft outbound email scenario #{i} (compliance required).", a, "policy_outbound_v1", bad.get("gtm_outbound") if i == 1 else None))
    for i, a in enumerate(qual_answers, start=1):
        rows.append(("ds_gtm_lead_qual_gold", f"Qualify lead scenario #{i}. Score + rationale.", a, "playbook_icp_v2", None))

    base_created = now_ms() - 6_000_000
    for idx, (dataset_id, prompt, answer, doc_id, source_trace_id) in enumerate(rows, start=1):
        session.add(
            DatasetRowModel(
                id=f"dr_seed_{idx:03d}",
                dataset_id=dataset_id,
                logical_id=f"drl_seed_{idx:03d}",  # Versioning fields
                version=1,
                is_deleted=False,
                input={"prompt": prompt},
                expected={"answer": answer, "citations": citations(doc_id, "Source Document", "Evidence quote placeholder for demo.")},
                meta={"source_trace_id": source_trace_id} if source_trace_id else {},
                created_at=base_created + idx * 1000,
            )
        )
    await session.commit()


async def seed_experiments(session: AsyncSession) -> None:
    base = now_ms()
    experiments = [
        ("exp_support_refunds", "proj_support", "ds_support_refunds_gold", "Refund Policy Replies"),
        ("exp_support_shipping", "proj_support", "ds_support_shipping_gold", "Shipping SLA Answers"),
        ("exp_legal_clauses", "proj_legal", "ds_legal_clause_gold", "Clause Extraction"),
        ("exp_legal_redlines", "proj_legal", "ds_legal_redlines_gold", "Redline Safety"),
        ("exp_gtm_outreach", "proj_gtm", "ds_gtm_outreach_gold", "Outbound Email Quality"),
        ("exp_gtm_qualification", "proj_gtm", "ds_gtm_lead_qual_gold", "Lead Qualification"),
    ]
    for i, (exp_id, project_id, dataset_id, name) in enumerate(experiments, start=1):
        session.add(ExperimentModel(id=exp_id, project_id=project_id, dataset_id=dataset_id, name=name, status="completed", summary={}, created_at=base - i * 60_000))
    await session.commit()

    reg_res = await session.execute(select(ModelRegistryModel))
    registry = reg_res.scalars().all()

    def reg_id(provider: str, model_id: str) -> str:
        m = next((x for x in registry if x.provider == provider and x.model_id == model_id), None)
        if not m:
            raise RuntimeError(f"Missing model in registry: {provider}:{model_id}")
        return m.id

    v2 = ExperimentV2Service(session)

    async def build_versions(exp_id: str, base_model: tuple[str, str], alt_model: tuple[str, str]):
        bp, bm = base_model
        ap, am = alt_model
        # V1: Baseline with basic scorers
        v1 = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=None,
                model_registry_id=reg_id(bp, bm),
                provider=bp,
                model_id=bm,
                temperature=1.0,
                max_tokens=256,
                system_prompt="You are a helpful assistant. Answer clearly and concisely.",
                scorers=("exact_match",),
                notes="Baseline",
            ),
        )
        # V2: Improved prompt with multiple scorers
        v2_prompt = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=v1.id,
                model_registry_id=reg_id(bp, bm),
                provider=bp,
                model_id=bm,
                temperature=0.7,
                max_tokens=256,
                system_prompt="Answer using grounded policy language. Include citations. Do not invent facts.",
                scorers=("exact_match", "contains"),  # Demo: multiple scorers
                notes="Prompt: citations + anti-hallucination constraints",
            ),
        )
        # V3: Model swap
        v3_model = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=v1.id,
                model_registry_id=reg_id(ap, am),
                provider=ap,
                model_id=am,
                temperature=1.0,
                max_tokens=256,
                system_prompt="You are a helpful assistant. Answer clearly and concisely.",
                scorers=("exact_match",),
                notes=f"Model swap: {ap}:{am}",
            ),
        )
        # V4: Best config - improved prompt + better model + multiple scorers
        v4 = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=v2_prompt.id,
                model_registry_id=reg_id(ap, am),
                provider=ap,
                model_id=am,
                temperature=0.7,
                max_tokens=256,
                top_p=0.95,  # Demo: additional inference params
                system_prompt="Answer using grounded policy language. Include citations. Do not invent facts.",
                scorers=("exact_match", "contains", "llm_judge"),  # Demo: 3 scorers including LLM judge
                notes=f"Best: citations prompt + {ap}:{am} + multi-scorer eval",
            ),
        )
        await v2.set_main_version(exp_id, v4.id)
        return v1, v3_model, v4

    versions = {}
    versions["exp_support_refunds"] = await build_versions("exp_support_refunds", ("openai", "gpt-4o-mini"), ("openai", "gpt-4o"))
    versions["exp_support_shipping"] = await build_versions("exp_support_shipping", ("anthropic", "claude-3-5-sonnet-20240620"), ("openai", "gpt-4o"))
    versions["exp_legal_clauses"] = await build_versions("exp_legal_clauses", ("openai", "gpt-4o"), ("anthropic", "claude-3-5-sonnet-20240620"))
    versions["exp_legal_redlines"] = await build_versions("exp_legal_redlines", ("openai", "gpt-4o-mini"), ("gemini", "gemini-1.5-pro"))
    versions["exp_gtm_outreach"] = await build_versions("exp_gtm_outreach", ("openai", "gpt-4o-mini"), ("anthropic", "claude-3-5-sonnet-20240620"))
    versions["exp_gtm_qualification"] = await build_versions("exp_gtm_qualification", ("gemini", "gemini-2.0-flash"), ("openai", "gpt-4o-mini"))

    async def seed_run_results(exp: ExperimentModel, run: ExperimentRunModel, version: Any, good_rate: float, cap: int, status: str, error: Optional[str] = None):
        rows_res = await session.execute(
            select(DatasetRowModel).where(DatasetRowModel.dataset_id == exp.dataset_id).order_by(DatasetRowModel.created_at.asc())
        )
        rows = rows_res.scalars().all()

        scored_values: list[float] = []
        tokens_total = 0
        cost_total = 0.0
        latency_total = 0.0

        for idx, row in enumerate(rows[:cap]):
            expected = str(row.expected.get("answer")) if isinstance(row.expected, dict) else ""
            is_good = (idx / max(1, cap - 1)) < good_rate
            output_text = expected if is_good else f"{expected} (incorrect)"

            prompt_tokens = 120 + (idx % 4) * 15
            completion_tokens = 90 + (idx % 3) * 12
            if version.config.get("model", {}).get("provider") == "anthropic":
                prompt_tokens += 40
                completion_tokens += 20
            if version.config.get("model", {}).get("provider") == "gemini":
                prompt_tokens = max(1, prompt_tokens - 15)
                completion_tokens = max(1, completion_tokens - 10)
            total_tokens = prompt_tokens + completion_tokens
            latency_ms = 700 + (idx % 6) * 120
            cost = 0.0008 + total_tokens * 0.000004

            out = {
                "output_text": output_text,
                "citations": row.expected.get("citations") if isinstance(row.expected, dict) else [],
                "provider": version.config.get("model", {}).get("provider"),
                "model": version.config.get("model", {}).get("id"),
                "athena_trace_id": f"trace_eval_{run.id}_{row.id}",
            }
            # Generate multiple scorer results for demo purposes
            exact_match_score = 1.0 if output_text == expected else 0.0
            contains_score = 1.0 if expected.lower() in output_text.lower() else 0.0
            # Simulate LLM judge scores (varies based on quality)
            llm_judge_score = 0.95 if is_good else (0.4 + (idx % 3) * 0.1)
            
            scores_dict = {
                "exact_match": exact_match_score,
                "contains": contains_score,
            }
            # Only add llm_judge to the "best" version runs (simulated)
            if "llm_judge" in [s.get("type") for s in version.config.get("scorers", [])]:
                scores_dict["llm_judge"] = llm_judge_score
            
            session.add(
                ExperimentRunResultModel(
                    id=f"rr_{run.id}_{idx:02d}",
                    run_id=run.id,
                    dataset_row_id=row.id,
                    output=out,
                    scores=scores_dict,
                    latency_ms=float(latency_ms),
                    created_at=base - 200_000 + idx * 250,
                )
            )

            trace_id = out["athena_trace_id"]
            t0 = base - 200_000 + idx * 250
            s = make_span(
                id_=f"span_{trace_id}_root",
                trace_id=trace_id,
                parent_id=None,
                name=f"Eval: {exp.name} - row {idx + 1}",
                type_=SpanType.LLM,
                start_ms=t0,
                end_ms=t0 + int(latency_ms),
                status="success" if exact_match_score == 1.0 else "error",
                input_={"prompt": row.input, "system_prompt": version.config.get("task", {}).get("system_prompt")},
                output=out,
                metrics={
                    "latency_ms": float(latency_ms),
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "cost": float(cost),
                },
                attributes={
                    "model": version.config.get("model", {}).get("id"),
                    "provider": version.config.get("model", {}).get("provider"),
                    "temperature": version.config.get("model", {}).get("temperature"),
                },
                tags=["env:eval", f"experiment:{exp.id}", f"run:{run.id}"],
                error_message=None if exact_match_score == 1.0 else "Mismatch vs expected",
            )
            session.add(make_trace(trace_id=trace_id, project_id=exp.project_id, timestamp_ms=t0, status=s.status, tags=["env:eval", f"experiment:{exp.id}", f"run:{run.id}"], spans=[s]))
            session.add(s)

            scored_values.append(exact_match_score)
            tokens_total += total_tokens
            cost_total += cost
            latency_total += latency_ms

        avg = float(sum(scored_values) / len(scored_values)) if scored_values else 0.0
        run.summary = {
            **(run.summary or {}),
            "rows_total": cap,
            "rows_done": len(scored_values),
            "rows_scored": len(scored_values),
            "avg_score": avg,
            "tokens_total": tokens_total,
            "cost_total": cost_total,
            "latency_ms_total": latency_total,
            **({"error": error} if error else {}),
        }
        run.status = status
        run.completed_at = base - 180_000
        if status == "canceled":
            run.cancel_requested_at = base - 185_000

        session.add(run)
        await session.commit()

    for exp_id, (v1, v3, v4) in versions.items():
        exp = await session.get(ExperimentModel, exp_id)
        assert exp
        rows_count_res = await session.execute(select(DatasetRowModel).where(DatasetRowModel.dataset_id == exp.dataset_id))
        total_rows = len(rows_count_res.scalars().all())
        cap = min(total_rows, 10)

        run1 = ExperimentRunModel(id=f"run_{exp_id}_baseline", experiment_version_id=v1.id, status="running", summary={}, created_at=base - 260_000, started_at=base - 250_000)
        run2 = ExperimentRunModel(id=f"run_{exp_id}_best", experiment_version_id=v4.id, status="running", summary={}, created_at=base - 240_000, started_at=base - 230_000)
        run3 = ExperimentRunModel(id=f"run_{exp_id}_canceled", experiment_version_id=v4.id, status="running", summary={}, created_at=base - 220_000, started_at=base - 210_000)
        run4 = ExperimentRunModel(id=f"run_{exp_id}_error", experiment_version_id=v3.id, status="running", summary={}, created_at=base - 200_000, started_at=base - 190_000)
        session.add(run1)
        session.add(run2)
        session.add(run3)
        session.add(run4)
        await session.commit()

        await seed_run_results(exp, run1, v1, good_rate=0.45, cap=cap, status="completed")
        await seed_run_results(exp, run2, v4, good_rate=0.85, cap=cap, status="completed")
        await seed_run_results(exp, run3, v4, good_rate=0.8, cap=min(4, cap), status="canceled")
        await seed_run_results(exp, run4, v3, good_rate=0.7, cap=min(2, cap), status="error", error="Provider timeout (simulated)")


async def main() -> None:
    # Write directly to backend/athena.db (deterministic local demo DB).
    db_path = (Path(__file__).resolve().parents[1] / "athena.db").resolve()
    db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    engine = create_async_engine(db_url, echo=False, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print(f"[seed_story] Wiping + seeding DB at {db_path}")
    await wipe_and_init(engine)

    async with SessionLocal() as session:
        await seed_core(session)
        bad = await seed_prod_story(session)
        await seed_datasets(session, bad)
        await seed_experiments(session)

    print("[seed_story] Done.")
    exit(0)


if __name__ == "__main__":
    asyncio.run(main())
