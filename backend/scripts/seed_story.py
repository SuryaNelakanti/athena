import asyncio
import time
from pathlib import Path
from typing import Any, Optional, List
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select

from app.models import (
    AttachmentModel,
    AssignmentModel,
    DatasetModel,
    DatasetRowModel,
    DatasetVersionModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    FunctionModel,
    LogModel,
    MentionModel,
    ModelRegistryModel,
    OrganizationModel,
    Project,
    ReviewItemModel,
    ShareLinkModel,
    SpanModel,
    SpanType,
    TraceModel,
    ViewModel,
)
from app.services.experiment_v2_service import ExperimentV2Service, VersionConfig
from app.services.scorer_service import BUILTIN_SCORERS

# =============================================================================
# STORYTELLING FRAMEWORK
# =============================================================================
# Each use case has a protagonist with emotional stakes:
# - SUPPORT: Maya Chen, CX Lead - AI promised $47K in unauthorized refunds
# - LEGAL: David Park, Legal Ops - AI cited non-existent contract sections
# - GTM: Priya Sharma, RevOps - AI emails flagged as spam, domain blocked

PERSONAS = {
    "maya": {"name": "Maya Chen", "role": "CX Lead", "email": "maya@octoworks.io"},
    "david": {"name": "David Park", "role": "Legal Ops Manager", "email": "david@octoworks.io"},
    "priya": {"name": "Priya Sharma", "role": "RevOps Lead", "email": "priya@octoworks.io"},
    "jordan": {"name": "Jordan Lee", "role": "Support Engineer", "email": "jordan@octoworks.io"},
    "sarah": {"name": "Sarah Kim", "role": "Contract Analyst", "email": "sarah@octoworks.io"},
}

CUSTOMER = {
    "id": "acct_nexus_001",
    "name": "Nexus Technologies",
    "domain": "nexustech.ai",
    "tier": "enterprise",
    "industry": "B2B SaaS",
}

POLICY_DOCS = {
    "refunds": "policy_refunds_v3",
    "outbound": "policy_outbound_v1",
    "pricing": "policy_pricing_v2",
}

CONTRACTS = {
    "nexus_msa": {
        "id": "MSA-OW-2025-0042",
        "title": "Master Services Agreement - Nexus Technologies",
        "sections": 16,  # Only 16 sections exist.
        "value": 2400000,
    }
}

CAMPAIGNS = {
    "q4_enterprise": "Q4 Enterprise Push",
    "reinvent_followup": "AWS re:Invent Follow-up",
    "recovery": "Deliverability Recovery",
}

# Timeline: GTM outreach first, legal negotiation next, support incidents last 24 hours.
def now_ms() -> int:
    return int(time.time() * 1000)

def hours_ago(h: int) -> int:
    return now_ms() - (h * 60 * 60 * 1000)

def minutes_ago(m: int) -> int:
    return now_ms() - (m * 60 * 1000)

def days_ago(d: int) -> int:
    return now_ms() - (d * 24 * 60 * 60 * 1000)

def citation(doc_id: str, title: str, quote: str) -> dict:
    return {"doc_id": doc_id, "title": title, "quote": quote}

def citations(doc_id: str, title: str, quote: str) -> List[dict]:
    return [citation(doc_id, title, quote)]


# =============================================================================
# SPAN/TRACE BUILDERS (Enhanced for deeper nesting)
# =============================================================================

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
    tags: List[str],
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


def make_trace(*, trace_id: str, project_id: str, timestamp_ms: int, status: str, tags: List[str], spans: List[SpanModel]) -> TraceModel:
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


class TraceBuilder:
    """Helper to build multi-span traces with realistic chains."""
    
    def __init__(self, trace_id: str, project_id: str, start_ms: int, name: str, tags: List[str]):
        self.trace_id = trace_id
        self.project_id = project_id
        self.start_ms = start_ms
        self.name = name
        self.tags = tags
        self.spans: List[SpanModel] = []
        self.current_time = start_ms
        self.status = "success"
        self.error_message = None
        
    def add_root(self, input_: dict, output: dict, duration_ms: int = 0) -> str:
        span_id = f"span_{self.trace_id}_root"
        # Duration set after all children
        self.root_span_id = span_id
        self.root_input = input_
        self.root_output = output
        return span_id
    
    def add_retriever(self, name: str, query: str, docs: List[dict], duration_ms: int = 150) -> str:
        span_id = f"span_{self.trace_id}_ret_{len(self.spans)}"
        self.spans.append(make_span(
            id_=span_id, trace_id=self.trace_id, parent_id=self.root_span_id,
            name=f"Retriever: {name}", type_=SpanType.RETRIEVER,
            start_ms=self.current_time, end_ms=self.current_time + duration_ms,
            status="success",
            input_={"query": query},
            output={"documents": docs},
            metrics={"latency_ms": duration_ms},
            attributes={"retriever": name},
            tags=self.tags,
        ))
        self.current_time += duration_ms
        return span_id
    
    def add_tool(self, name: str, input_: dict, output: dict, duration_ms: int = 200, status: str = "success", error: str = None) -> str:
        span_id = f"span_{self.trace_id}_tool_{len(self.spans)}"
        self.spans.append(make_span(
            id_=span_id, trace_id=self.trace_id, parent_id=self.root_span_id,
            name=f"Tool: {name}", type_=SpanType.TOOL,
            start_ms=self.current_time, end_ms=self.current_time + duration_ms,
            status=status,
            input_=input_,
            output=output,
            metrics={"latency_ms": duration_ms},
            attributes={"tool": name},
            tags=self.tags,
            error_message=error,
        ))
        self.current_time += duration_ms
        if status == "error":
            self.status = "error"
            self.error_message = error
        return span_id
    
    def add_llm(self, name: str, messages: List[dict], output_text: str, model: str = "gpt-4o", provider: str = "openai",
                duration_ms: int = 800, tokens: int = 250, cost: float = 0.003, status: str = "success", 
                error: str = None, reasoning_content: str = None, citations: List[dict] = None) -> str:
        span_id = f"span_{self.trace_id}_llm_{len(self.spans)}"
        prompt_tokens = int(tokens * 0.6)
        completion_tokens = tokens - prompt_tokens
        
        output = {"output_text": output_text}
        if citations:
            output["citations"] = citations
            
        attrs = {"model": model, "provider": provider}
        if reasoning_content:
            attrs["reasoning_content"] = reasoning_content
            attrs["reasoning_enabled"] = True
            
        self.spans.append(make_span(
            id_=span_id, trace_id=self.trace_id, parent_id=self.root_span_id,
            name=f"LLM: {name}", type_=SpanType.LLM,
            start_ms=self.current_time, end_ms=self.current_time + duration_ms,
            status=status,
            input_={"messages": messages},
            output=output,
            metrics={"latency_ms": duration_ms, "total_tokens": tokens, "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "cost": cost},
            attributes=attrs,
            tags=self.tags,
            error_message=error,
        ))
        self.current_time += duration_ms
        if status == "error":
            self.status = "error"
            self.error_message = error
        return span_id
    
    def build(self) -> tuple[TraceModel, List[SpanModel]]:
        # Create root span encompassing all
        root = make_span(
            id_=self.root_span_id, trace_id=self.trace_id, parent_id=None,
            name=self.name, type_=SpanType.CHAIN,
            start_ms=self.start_ms, end_ms=self.current_time,
            status=self.status,
            input_=self.root_input,
            output=self.root_output,
            metrics={"latency_ms": self.current_time - self.start_ms},
            attributes={"env": "prod"},
            tags=self.tags,
            error_message=self.error_message,
        )
        all_spans = [root] + self.spans
        trace = make_trace(trace_id=self.trace_id, project_id=self.project_id, timestamp_ms=self.start_ms, status=self.status, tags=self.tags, spans=all_spans)
        return trace, all_spans


# =============================================================================
# DATABASE INIT
# =============================================================================

async def wipe_and_init(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)


# =============================================================================
# CORE SEEDING (Organizations, Projects, Models, Views, Scorers)
# =============================================================================

async def seed_core(session: AsyncSession) -> None:
    org_id = "org_octoworks"
    base = now_ms()
    
    # Organizations
    session.add(OrganizationModel(
        id=org_id, name="OctoWorks Inc.",
        description="Enterprise AI platform for support, legal, and GTM teams",
        created_at=base - 30_000_000, updated_at=base - 1_000_000
    ))
    session.add(OrganizationModel(
        id="org_default", name="Default Organization",
        description="Auto-created default organization",
        created_at=base - 30_000_000, updated_at=base - 30_000_000
    ))
    
    # Projects
    projects = [
        ("proj_support", "OctoWorks - Support"),
        ("proj_legal", "OctoWorks - Legal"),
        ("proj_gtm", "OctoWorks - GTM"),
    ]
    for pid, name in projects:
        session.add(Project(id=pid, name=name, org_id=org_id))

    # Model Registry
    models = [
        ("mdl_01", "openai", "gpt-4o", "GPT-4o", True),
        ("mdl_02", "openai", "gpt-4o-mini", "GPT-4o mini", True),
        ("mdl_03", "openai", "o1", "o1 (Reasoning)", True),
        ("mdl_04", "anthropic", "claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet", True),
        ("mdl_05", "anthropic", "claude-3-5-haiku-20241022", "Claude 3.5 Haiku", True),
        ("mdl_06", "gemini", "gemini-1.5-pro", "Gemini 1.5 Pro", True),
        ("mdl_07", "gemini", "gemini-2.0-flash", "Gemini 2.0 Flash", True),
        ("mdl_08", "mock", "mock-model", "Mock Model", True),
    ]
    for id_, provider, model_id, display_name, enabled in models:
        session.add(ModelRegistryModel(id=id_, provider=provider, model_id=model_id, display_name=display_name, enabled=enabled))

    # Views
    views = [
        ("proj_support", "Refund Issues", {"status": "error", "search": "refund"}),
        ("proj_support", "All Tickets", {"status": "all", "search": ""}),
        ("proj_legal", "Hallucinations", {"status": "error", "search": ""}),
        ("proj_legal", "Contract Reviews", {"status": "all", "search": "clause"}),
        ("proj_gtm", "Compliance Flags", {"status": "error", "search": ""}),
        ("proj_gtm", "Outbound Emails", {"status": "all", "search": "email"}),
    ]
    for idx, (pid, name, cfg) in enumerate(views, start=1):
        session.add(ViewModel(id=f"view_{idx:02d}", project_id=pid, name=name, config=cfg, entity_type="traces", created_at=base - idx * 1000))

    # Built-in Scorers
    for scorer in BUILTIN_SCORERS:
        session.add(FunctionModel(
            id=f"fn_builtin_{scorer['name']}",
            project_id=None,
            name=scorer["name"],
            display_name=scorer["display_name"],
            description=scorer["description"],
            type="scorer",
            runtime=scorer["runtime"],
            config=scorer["config"],
            enabled=True,
        ))

    await session.commit()


# =============================================================================
# SUPPORT STORIES: "The Refund Incident of 12/18"
# Maya Chen discovered AI was promising unauthorized refunds, costing $47K
# =============================================================================

async def seed_support_traces(session: AsyncSession) -> dict:
    """Seeds Support traces telling the refund incident story."""
    proj = "proj_support"
    bad_traces = {}
    
    def add(trace: TraceModel, spans: List[SpanModel]):
        session.add(trace)
        for s in spans:
            session.add(s)
    
    # --- GOOD TRACES (baseline behavior) ---
    
    # 1. Good refund - VIP double charged (correct handling)
    tb = TraceBuilder(
        "trace_sup_refund_good_001",
        proj,
        hours_ago(6),
        "Support: Refund - Duplicate charge resolved [TCK-88421]",
        ["env:prod", "area:refunds", "tier:enterprise", "story:baseline"],
    )
    tb.add_root(
        {
            "ticket_id": "TCK-88421",
            "customer": CUSTOMER["name"],
            "account_id": CUSTOMER["id"],
            "tier": CUSTOMER["tier"],
            "issue": "double charge on invoice #INV-9012",
        },
        {"status": "resolved", "action": "refund_issued", "amount": 12900}
    )
    tb.add_retriever("Policy KB", "refund policy duplicate charge enterprise", 
                     [{"doc": POLICY_DOCS["refunds"], "section": "2.1 Duplicate Charges", "text": "Duplicate charges may be refunded immediately upon verification."}])
    tb.add_tool("Stripe: GetCharge", {"charge_id": "ch_9x91abc"}, {"amount": 12900, "status": "succeeded", "duplicate_of": "ch_8x82def"})
    tb.add_tool("Stripe: CreateRefund", {"charge_id": "ch_9x91abc", "amount": 12900}, {"refund_id": "re_31a", "status": "succeeded"})
    tb.add_llm("Draft Response", 
               [{"role": "user", "content": "I was charged twice for my subscription this month. Order #INV-9012."}],
               "I've verified the duplicate charge and issued a full refund of $129.00 to your card ending in 4242. You should see it within 5-10 business days. I apologize for the inconvenience!",
               citations=[citation(POLICY_DOCS["refunds"], "Refund Policy", "Refunds post within 5-10 business days per banking partner SLAs.")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # 2. Good refund - Accidental purchase (correct handling)
    tb = TraceBuilder(
        "trace_sup_refund_good_002",
        proj,
        hours_ago(5),
        "Support: Refund - Accidental add-on purchase [TCK-88455]",
        ["env:prod", "area:refunds", "story:baseline"],
    )
    tb.add_root(
        {"ticket_id": "TCK-88455", "customer": CUSTOMER["name"], "issue": "accidentally purchased add-on"},
        {"status": "resolved", "action": "refund_issued"},
    )
    tb.add_retriever("Policy KB", "refund accidental purchase within window", 
                     [{"doc": POLICY_DOCS["refunds"], "section": "3.2", "text": "Accidental purchases refundable within 48 hours if unused."}])
    tb.add_tool("Usage: CheckAddOn", {"addon_id": "addon_analytics"}, {"usage_count": 0, "purchased_at": hours_ago(2)})
    tb.add_tool("Stripe: CreateRefund", {"charge_id": "ch_addon_123"}, {"status": "succeeded"})
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I clicked the wrong button and bought Analytics Pro. Can I get a refund?"}],
               "No problem! Since you haven't used the add-on yet, I've processed a full refund. It should appear on your statement within 5-10 business days.")
    trace, spans = tb.build()
    add(trace, spans)
    
    # 3. Good escalation - Late cancellation (correctly escalated)
    tb = TraceBuilder(
        "trace_sup_refund_escalate_001",
        proj,
        hours_ago(4),
        "Support: Refund - Late cancellation (escalated) [TCK-88502]",
        ["env:prod", "area:refunds", "escalation", "story:baseline"],
    )
    tb.add_root(
        {"ticket_id": "TCK-88502", "customer": CUSTOMER["name"], "issue": "wants refund 45 days after cancellation"},
        {"status": "escalated", "reason": "outside_policy_window"},
    )
    tb.add_retriever("Policy KB", "refund window cancellation", 
                     [{"doc": POLICY_DOCS["refunds"], "section": "4.1", "text": "Refunds for cancellations must be requested within 30 days."}])
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I cancelled 45 days ago but I want all my money back. This is ridiculous."}],
               "I understand your frustration. Our policy allows refunds within 30 days of cancellation. Since your request is outside that window, I'm escalating this to our billing team who can review your account for any exceptions. You'll hear back within 24 hours.",
               citations=[citation(POLICY_DOCS["refunds"], "Refund Policy", "Exceptions require manager approval for requests outside 30-day window.")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # --- BAD TRACES (The Incident) ---
    
    # 4. BAD: Hallucinated 3-month refund window (THE INCIDENT)
    tb = TraceBuilder(
        "trace_sup_refund_bad_001",
        proj,
        hours_ago(26),
        "Support: Refund - POLICY VIOLATION [TCK-90012]",
        ["env:prod", "area:refunds", "severity:critical", "needs_review", "story:incident"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90012", "customer": CUSTOMER["name"], "issue": "cancelled 2 months ago, wants full refund"},
        {"status": "sent", "risk": "policy_violation", "financial_impact": 89700}
    )
    tb.add_retriever("Policy KB", "refund cancellation policy", 
                     [{"doc": POLICY_DOCS["refunds"], "section": "4.1", "text": "Refunds within 30 days of cancellation."}])
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I cancelled my subscription 2 months ago but I'm still seeing charges. I want ALL my money back for the past 3 months."},
                {"role": "assistant", "content": "I can see your account. Let me check what happened..."},
                {"role": "user", "content": "This is unacceptable. I want a full refund NOW."}],
               "I completely understand your frustration. I've reviewed your account and I can issue a full refund for all 3 months of charges since you first requested cancellation. The total of $897.00 will be back on your card within 5-10 business days.",
               model="gpt-4o-mini", status="error", error="POLICY VIOLATION: Promised 3-month refund, policy only allows 30 days")
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["support_refund_incident"] = trace.id
    
    # 5. BAD: Invented manager override
    tb = TraceBuilder(
        "trace_sup_refund_bad_002",
        proj,
        hours_ago(25),
        "Support: Refund - Invented exception [TCK-90018]",
        ["env:prod", "area:refunds", "severity:high", "needs_review", "story:incident"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90018", "customer": CUSTOMER["name"], "issue": "angry customer demanding exception"},
        {"status": "sent", "risk": "policy_violation"},
    )
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I've been a customer for 3 years and you won't refund me? Get me a manager."}],
               "As a valued 3-year customer, I've applied our Loyalty Exception policy and approved a full refund without manager review. This is processed automatically for customers like you.",
               model="gpt-4o-mini", status="error", error="HALLUCINATION: 'Loyalty Exception policy' does not exist")
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["support_invented_policy"] = trace.id
    
    # 6. BAD: Wrong refund amount calculation
    tb = TraceBuilder(
        "trace_sup_refund_bad_003",
        proj,
        hours_ago(24),
        "Support: Refund - Wrong calculation [TCK-90025]",
        ["env:prod", "area:refunds", "severity:high", "needs_review", "story:incident"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90025", "customer": CUSTOMER["name"], "issue": "partial refund request"},
        {"status": "sent", "risk": "financial_error"},
    )
    tb.add_tool("Stripe: GetInvoice", {"invoice_id": "inv_123"}, {"amount": 29900, "period": "annual"})
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I want to cancel halfway through my annual plan. What's my refund?"}],
               "Since you're halfway through your annual plan, I'll refund 50% of your total: $299.00. Processing now!",
               model="gpt-4o-mini", status="error", error="CALCULATION ERROR: 50% of $299 is $149.50, not $299")
    trace, spans = tb.build()
    add(trace, spans)
    
    # 7. TRIAGE: Incident summary (internal review)
    tb = TraceBuilder(
        "trace_sup_refund_triage_001",
        proj,
        hours_ago(12),
        "Support: Refund incident summary [Internal]",
        ["env:prod", "area:refunds", "story:triage", "severity:critical"],
    )
    tb.add_root(
        {"window_hours": 24, "owner": PERSONAS["maya"]["email"], "incident": "refund_leakage"},
        {"status": "completed", "leakage_usd": 47000, "customers_impacted": 5},
    )
    tb.add_tool(
        "Analytics: QueryRefunds",
        {"window_hours": 24, "filter": "policy_violation AND refund"},
        {"count": 7, "total_amount_cents": 4700000, "top_accounts": [CUSTOMER["name"]]},
    )
    tb.add_llm(
        "Summarize incident",
        [{"role": "user", "content": "Summarize refund policy violations in the last 24h and propose a fix."}],
        "Summary: 7 refunds were promised outside the 30-day window, totaling $47,000. Root cause appears to be a missing system prompt constraint. Proposed fix: add explicit 30-day limit, require PolicyGuard check, and escalate exceptions.",
        model="gpt-4o",
        tokens=220,
        cost=0.006,
    )
    trace, spans = tb.build()
    add(trace, spans)
    
    # 8. POST-FIX: Guardrail blocked out-of-policy refund
    tb = TraceBuilder(
        "trace_sup_refund_postfix_001",
        proj,
        minutes_ago(110),
        "Support: Refund - Guardrail blocked (post-fix) [TCK-90080]",
        ["env:prod", "area:refunds", "guardrail", "story:post_fix"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90080", "customer": CUSTOMER["name"], "issue": "cancelled 62 days ago, wants full refund"},
        {"status": "escalated", "guardrail": "blocked", "risk": "policy_violation_prevented"},
    )
    tb.add_tool(
        "PolicyGuard: CheckRefundWindow",
        {"cancelled_at": "2024-10-20", "requested_at": "2024-12-21"},
        {"eligible": False, "policy_window_days": 30, "days_since_cancel": 62},
    )
    tb.add_llm(
        "Draft Response",
        [{"role": "user", "content": "I cancelled two months ago and want a refund for the last 3 charges."}],
        "I understand the frustration. Our policy allows refunds within 30 days of cancellation. Since this request is outside that window, I have escalated it to our billing team for review. You will hear back within 24 hours.",
        model="gpt-4o",
        tokens=240,
        cost=0.006,
    )
    trace, spans = tb.build()
    add(trace, spans)
    
    # 9. POST-FIX: Eligible refund approved
    tb = TraceBuilder(
        "trace_sup_refund_postfix_002",
        proj,
        minutes_ago(90),
        "Support: Refund - Post-fix approved [TCK-90090]",
        ["env:prod", "area:refunds", "guardrail", "story:post_fix"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90090", "customer": CUSTOMER["name"], "issue": "cancelled 12 days ago, requesting refund"},
        {"status": "resolved", "action": "refund_issued", "guardrail": "passed"},
    )
    tb.add_tool(
        "PolicyGuard: CheckRefundWindow",
        {"cancelled_at": "2024-12-08", "requested_at": "2024-12-20"},
        {"eligible": True, "policy_window_days": 30, "days_since_cancel": 12},
    )
    tb.add_tool(
        "Stripe: CreateRefund",
        {"charge_id": "ch_7nexus90", "amount": 24900},
        {"refund_id": "re_90b", "status": "succeeded"},
    )
    tb.add_llm(
        "Draft Response",
        [{"role": "user", "content": "I canceled last week and want a refund for this month."}],
        "Thanks for confirming. Your cancellation is within the 30-day window, so I have issued a refund of $249.00. It should post within 5-10 business days.",
        model="gpt-4o",
        tokens=210,
        cost=0.005,
    )
    trace, spans = tb.build()
    add(trace, spans)
    
    # --- OTHER GOOD TRACES (variety) ---
    
    # 10. Shipping inquiry with tool chain
    tb = TraceBuilder(
        "trace_sup_shipping_001",
        proj,
        hours_ago(3),
        "Support: Shipping ETA [TCK-88601]",
        ["env:prod", "area:shipping", "story:baseline"],
    )
    tb.add_root({"ticket_id": "TCK-88601", "customer": CUSTOMER["name"], "order_id": "ORD-4412"}, {"status": "resolved"})
    tb.add_tool("Shipping: GetTracking", {"order_id": "ORD-4412"}, {"carrier": "FedEx", "tracking": "794644790301", "status": "in_transit", "eta": "2024-12-19"})
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "Where's my order? Order #4412"}],
               "Your order is in transit via FedEx (tracking: 794644790301). It's expected to arrive tomorrow, December 19th. You can track it at fedex.com.",
               model="claude-3-5-sonnet-20241022", provider="anthropic")
    trace, spans = tb.build()
    add(trace, spans)
    
    # 11. Password reset with security verification
    tb = TraceBuilder(
        "trace_sup_password_001",
        proj,
        hours_ago(2),
        "Support: Password Reset [TCK-88650]",
        ["env:prod", "area:account", "story:baseline"],
    )
    tb.add_root({"ticket_id": "TCK-88650"}, {"status": "resolved"})
    tb.add_tool("Identity: VerifyEmail", {"email": "user@company.com"}, {"verified": True, "account_id": "acc_789"})
    tb.add_tool("Auth: SendResetLink", {"account_id": "acc_789"}, {"sent": True, "expires_in": "15 minutes"})
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I forgot my password and can't get into my account."}],
               "I've sent a password reset link to user@c*****.com. Click the link within 15 minutes to set a new password. If you don't see it, check your spam folder.")
    trace, spans = tb.build()
    add(trace, spans)
    
    # 12. Subscription upgrade with pricing
    tb = TraceBuilder(
        "trace_sup_upgrade_001",
        proj,
        hours_ago(1),
        "Support: Subscription Upgrade [TCK-88700]",
        ["env:prod", "area:billing", "story:baseline"],
    )
    tb.add_root({"ticket_id": "TCK-88700"}, {"status": "resolved", "revenue_impact": 50000})
    tb.add_tool("Billing: GetCurrentPlan", {"account_id": "acc_456"}, {"plan": "starter", "mrr": 4900})
    tb.add_tool("Billing: CalculateUpgrade", {"from": "starter", "to": "pro"}, {"prorated_amount": 7500, "new_mrr": 14900})
    tb.add_llm("Draft Response",
               [{"role": "user", "content": "I want to upgrade to Pro. What will it cost?"}],
               "Great choice! Upgrading to Pro is $149/month. Since you're mid-cycle, you'll pay a prorated amount of $75 today, then $149 monthly going forward. Want me to process this?")
    trace, spans = tb.build()
    add(trace, spans)
    
    # 13. Complex issue with reasoning (o1 model)
    tb = TraceBuilder(
        "trace_sup_complex_001",
        proj,
        minutes_ago(45),
        "Support: Complex billing dispute [TCK-88750]",
        ["env:prod", "area:billing", "complexity:high", "story:baseline"],
    )
    tb.add_root({"ticket_id": "TCK-88750"}, {"status": "resolved"})
    tb.add_retriever("Policy KB", "enterprise discount stacking annual", 
                     [{"doc": POLICY_DOCS["pricing"], "section": "5.2", "text": "Discounts do not stack. Highest applicable discount applies."}])
    tb.add_tool("Billing: GetDiscounts", {"account_id": "acc_enterprise"}, {"discounts": [{"type": "annual", "amount": 0.2}, {"type": "volume", "amount": 0.15}]})
    tb.add_llm("Analyze billing",
               [{"role": "user", "content": "Why didn't I get both my 20% annual discount AND my 15% volume discount? I should be paying 35% less!"}],
               "After analyzing your billing configuration, I can explain: Our pricing policy applies the highest single discount, not stacked discounts. You're receiving the 20% annual discount because it's larger than the 15% volume discount. This is standard across all enterprise accounts to maintain pricing consistency.",
               model="o1", reasoning_content="Let me analyze the discount structure. The customer expects 20% + 15% = 35% discount. However, policy section 5.2 states discounts don't stack. 20% > 15%, so 20% applies. I should explain this clearly without being defensive.",
               duration_ms=2500, tokens=450, cost=0.015)
    trace, spans = tb.build()
    add(trace, spans)
    
    # 14. Streaming chat response
    tb = TraceBuilder(
        "trace_sup_stream_001",
        proj,
        minutes_ago(30),
        "Support: Live chat - product question",
        ["env:prod", "stream:true", "story:baseline"],
    )
    tb.add_root({"channel": "live_chat", "session_id": "chat_abc123"}, {"status": "resolved"})
    span_id = f"span_trace_sup_stream_001_llm_0"
    tb.spans.append(make_span(
        id_=span_id, trace_id=tb.trace_id, parent_id=tb.root_span_id,
        name="LLM: Streaming response", type_=SpanType.LLM,
        start_ms=tb.current_time, end_ms=tb.current_time + 1800,
        status="success",
        input_={"messages": [{"role": "user", "content": "What's the difference between Pro and Enterprise plans?"}], "stream": True},
        output={"output_text": "Great question! The main differences are:\n\n**Pro ($149/mo)**: Up to 10 team members, 100K API calls, email support\n\n**Enterprise ($499/mo)**: Unlimited team members, 1M API calls, priority support, SSO, custom integrations\n\nWould you like me to set up a call with our sales team to discuss Enterprise?"},
        metrics={"latency_ms": 1800, "total_tokens": 180, "time_to_first_token_ms": 120},
        attributes={"model": "claude-3-5-sonnet-20241022", "provider": "anthropic", "stream": True},
        tags=tb.tags,
    ))
    tb.current_time += 1800
    trace, spans = tb.build()
    add(trace, spans)
    
    # 15. Multi-turn conversation
    tb = TraceBuilder(
        "trace_sup_multiturn_001",
        proj,
        minutes_ago(15),
        "Support: Multi-turn billing inquiry [TCK-88800]",
        ["env:prod", "area:billing", "turns:3", "story:baseline"],
    )
    tb.add_root({"ticket_id": "TCK-88800", "turns": 3}, {"status": "resolved"})
    messages = [
        {"role": "user", "content": "I have a question about my bill."},
        {"role": "assistant", "content": "Of course! I'd be happy to help. Could you tell me what specifically you're seeing on your bill that seems unclear?"},
        {"role": "user", "content": "There's a charge for 'API Overage' but I don't know what that means."},
        {"role": "assistant", "content": "API Overage charges occur when you exceed your plan's included API calls. Let me look up your usage..."},
        {"role": "user", "content": "Ok, how do I avoid this next month?"}
    ]
    tb.add_tool("Usage: GetAPIStats", {"account_id": "acc_321"}, {"included": 10000, "used": 15420, "overage": 5420, "overage_cost": 2710})
    tb.add_llm("Draft Response", messages,
               "You used 15,420 API calls last month, which is 5,420 over your 10,000 included calls. That's where the $27.10 overage came from (at $0.005/call). To avoid this, you can either:\n\n1. **Upgrade to Pro** ($149/mo) which includes 100K calls\n2. **Set usage alerts** in Settings > API > Alerts to notify you at 80% usage\n\nWould you like me to help with either option?")
    trace, spans = tb.build()
    add(trace, spans)

    # 16. Lineage: Incident follow-up (child of bad_001)
    tb = TraceBuilder(
        "trace_sup_refund_followup_001",
        proj,
        minutes_ago(40),
        "Support: Refund Incident - Follow-up analysis [TCK-90012-A]",
        ["env:prod", "area:refunds", "story:lineage", "severity:high"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90012-A", "parent_trace": "trace_sup_refund_bad_001", "owner": PERSONAS["maya"]["email"]},
        {"status": "completed", "next_step": "draft_customer_update"},
    )
    tb.add_retriever(
        "Policy KB",
        "refund policy summary for incident follow-up",
        [{"doc": POLICY_DOCS["refunds"], "section": "4.1", "text": "Refunds within 30 days of cancellation."}],
    )
    tb.add_llm(
        "Draft customer update",
        [{"role": "user", "content": "Draft a concise customer update acknowledging the policy miss."}],
        "We identified an error in our previous response. Our refund policy allows refunds within 30 days of cancellation. We are escalating your request for review and will follow up within 24 hours.",
        model="gpt-4o",
        tokens=180,
        cost=0.004,
    )
    trace, spans = tb.build()
    trace.parent_trace_id = "trace_sup_refund_bad_001"
    add(trace, spans)

    # 17. Lineage: Parallel follow-up (sibling of followup_001)
    tb = TraceBuilder(
        "trace_sup_refund_followup_002",
        proj,
        minutes_ago(38),
        "Support: Refund Incident - Parallel response draft [TCK-90012-B]",
        ["env:prod", "area:refunds", "story:lineage", "severity:high"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90012-B", "parent_trace": "trace_sup_refund_bad_001", "owner": PERSONAS["maya"]["email"]},
        {"status": "completed", "next_step": "guardrail_update"},
    )
    tb.add_tool(
        "PolicyGuard: Simulate",
        {"policy": "refund_window", "prompt_variant": "tight_30_days"},
        {"eligible": False, "days_since_cancel": 62},
    )
    tb.add_llm(
        "Draft guardrail note",
        [{"role": "user", "content": "Summarize why the guardrail should block this refund."}],
        "Guardrail should block because cancellation was 62 days ago, outside the 30-day window. Recommend escalation to billing for exceptions.",
        model="gpt-4o-mini",
        status="success",
        tokens=140,
        cost=0.003,
    )
    trace, spans = tb.build()
    trace.parent_trace_id = "trace_sup_refund_bad_001"
    add(trace, spans)

    # 18. Lineage: Fix validation (child of followup_001)
    tb = TraceBuilder(
        "trace_sup_refund_followup_fix_001",
        proj,
        minutes_ago(25),
        "Support: Refund Incident - Fix validation [TCK-90012-C]",
        ["env:prod", "area:refunds", "story:lineage", "guardrail"],
    )
    tb.add_root(
        {"ticket_id": "TCK-90012-C", "parent_trace": "trace_sup_refund_followup_001", "test_run": True},
        {"status": "completed", "guardrail": "passed"},
    )
    tb.add_tool(
        "PolicyGuard: CheckRefundWindow",
        {"cancelled_at": "2024-10-20", "requested_at": "2024-12-21"},
        {"eligible": False, "policy_window_days": 30, "days_since_cancel": 62},
    )
    tb.add_llm(
        "Draft corrected response",
        [{"role": "user", "content": "Provide the policy-correct response for this request."}],
        "Our policy allows refunds within 30 days of cancellation. Since this request is outside that window, we have escalated it to billing for review.",
        model="gpt-4o",
        tokens=190,
        cost=0.004,
    )
    trace, spans = tb.build()
    trace.parent_trace_id = "trace_sup_refund_followup_001"
    add(trace, spans)

    await session.commit()
    return bad_traces


# =============================================================================
# LEGAL STORIES: "The Phantom Section 19.4"
# David Park's team was embarrassed when AI cited non-existent contract sections
# =============================================================================

async def seed_legal_traces(session: AsyncSession) -> dict:
    """Seeds Legal traces telling the phantom section story."""
    proj = "proj_legal"
    bad_traces = {}
    
    def add(trace: TraceModel, spans: List[SpanModel]):
        session.add(trace)
        for s in spans:
            session.add(s)
    
    # Contract context for all legal traces
    contract = CONTRACTS["nexus_msa"]
    
    # --- GOOD TRACES ---
    
    # 1. Good: Liability cap extraction with correct citation
    tb = TraceBuilder(
        "trace_legal_clause_good_001",
        proj,
        hours_ago(8),
        "Legal: Extract liability cap [Nexus MSA]",
        ["env:prod", "area:contracts", "deal:nexus", "story:baseline"],
    )
    tb.add_root({"contract": contract, "task": "extract liability provisions"}, {"status": "completed", "sections_found": ["8.2"]})
    tb.add_retriever("Contract RAG", "liability limitation aggregate cap", 
                     [{"section": "8.2", "title": "Limitation of Liability", "text": "The aggregate liability of either party shall not exceed the fees paid in the twelve (12) months preceding the claim."}])
    tb.add_llm("Extract clause",
               [{"role": "user", "content": "What's the liability cap in the Nexus MSA?"}],
               "The liability cap is defined in **Section 8.2**: Neither party's aggregate liability exceeds fees paid in the preceding 12 months. This is a standard mutual cap that applies to both parties.",
               model="gpt-4o", tokens=320, cost=0.008,
               citations=[citation("MSA-OW-2025-0042", "Section 8.2 - Limitation of Liability", "aggregate liability... shall not exceed the fees paid in the twelve (12) months")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # 2. Good: Termination rights with correct citation
    tb = TraceBuilder(
        "trace_legal_clause_good_002",
        proj,
        hours_ago(7),
        "Legal: Extract termination rights [Nexus MSA]",
        ["env:prod", "area:contracts", "deal:nexus", "story:baseline"],
    )
    tb.add_root({"contract": contract, "task": "extract termination provisions"}, {"status": "completed"})
    tb.add_retriever("Contract RAG", "termination for cause cure period", 
                     [{"section": "12.3", "title": "Termination for Cause", "text": "Either party may terminate upon 30 days written notice if the other party materially breaches and fails to cure within the notice period."}])
    tb.add_llm("Extract clause",
               [{"role": "user", "content": "How can either party terminate the Nexus contract?"}],
               "Per **Section 12.3**, either party can terminate for cause with 30 days written notice if there's a material breach that isn't cured. This gives the breaching party an opportunity to fix issues before termination.",
               citations=[citation("MSA-OW-2025-0042", "Section 12.3 - Termination for Cause", "30 days written notice... materially breaches and fails to cure")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # 3. Good: Confidentiality with correct citation
    tb = TraceBuilder(
        "trace_legal_clause_good_003",
        proj,
        hours_ago(6),
        "Legal: Extract confidentiality terms [Nexus MSA]",
        ["env:prod", "area:contracts", "story:baseline"],
    )
    tb.add_root({"contract": contract, "task": "confidentiality provisions"}, {"status": "completed"})
    tb.add_retriever("Contract RAG", "confidentiality survival period", 
                     [{"section": "10.1", "title": "Confidentiality", "text": "Confidentiality obligations shall survive for three (3) years following termination or expiration."}])
    tb.add_llm("Extract clause",
               [{"role": "user", "content": "How long do confidentiality obligations last?"}],
               "**Section 10.1** specifies that confidentiality obligations survive for 3 years after the agreement ends. This is industry-standard for enterprise SaaS agreements.",
               citations=[citation("MSA-OW-2025-0042", "Section 10.1 - Confidentiality", "survive for three (3) years following termination")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # 4. Good: Redline with accurate section reference
    tb = TraceBuilder(
        "trace_legal_redline_good_001",
        proj,
        hours_ago(5),
        "Legal: Draft redline - audit rights [Nexus MSA]",
        ["env:prod", "area:redlines", "story:baseline"],
    )
    tb.add_root({"contract": contract, "task": "add audit rights clause"}, {"status": "completed"})
    tb.add_llm("Draft redline",
               [{"role": "user", "content": "Add annual audit rights to the Nexus MSA"}],
               "I recommend adding the following to **Section 11** (Data Protection):\n\n> \"11.4 Audit Rights. Customer may audit Provider's compliance with data protection obligations once per calendar year, with 30 days advance written notice, during normal business hours.\"\n\nThis placement is appropriate since Section 11 covers data protection and security.",
               model="gpt-4o", tokens=400, cost=0.01,
               citations=[citation("MSA-OW-2025-0042", "Section 11 - Data Protection", "Existing data protection provisions")])
    trace, spans = tb.build()
    add(trace, spans)
    
    # --- BAD TRACES (The Incident) ---
    
    # 5. BAD: Invented Section 19.4 (THE INCIDENT)
    tb = TraceBuilder(
        "trace_legal_redline_bad_001",
        proj,
        hours_ago(48),
        "Legal: HALLUCINATION - Phantom Section 19.4 [Nexus MSA]",
        ["env:prod", "area:redlines", "severity:critical", "needs_review", "story:incident"],
    )
    tb.add_root(
        {"contract": contract, "task": "add SCC clause for EU data transfers"},
        {"status": "sent", "risk": "hallucination", "deal_impact": "2-week delay"}
    )
    tb.add_llm("Draft redline",
               [{"role": "user", "content": "We need to add Standard Contractual Clauses for EU data transfers. Where should this go in the MSA?"}],
               "I recommend adding SCCs under **Section 19.4 - International Data Transfers**. This section already addresses cross-border data flows, so the SCCs would be a natural addition:\n\n> \"19.4.1 Standard Contractual Clauses. For transfers of personal data to countries not recognized as providing adequate protection, the parties agree to execute the EU Standard Contractual Clauses...\"\n\nThis ensures GDPR compliance for your EU customer data.",
               model="gpt-4o-mini", status="error", error="HALLUCINATION: Contract only has 16 sections. Section 19.4 does not exist.")
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["legal_phantom_section"] = trace.id
    
    # 6. BAD: Invented Exhibit F
    tb = TraceBuilder(
        "trace_legal_redline_bad_002",
        proj,
        hours_ago(47),
        "Legal: HALLUCINATION - Phantom Exhibit F [Nexus MSA]",
        ["env:prod", "area:redlines", "severity:high", "needs_review", "story:incident"],
    )
    tb.add_root({"contract": contract, "task": "reference DPA exhibit"}, {"status": "sent", "risk": "hallucination"})
    tb.add_llm("Draft response",
               [{"role": "user", "content": "Where are the data processing terms in this agreement?"}],
               "The data processing terms are detailed in **Exhibit F - Data Processing Agreement**. This exhibit includes the full list of subprocessors, data retention schedules, and breach notification procedures.",
               model="gpt-4o-mini", status="error", error="HALLUCINATION: Contract only has Exhibits A-D. Exhibit F does not exist.")
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["legal_phantom_exhibit"] = trace.id
    
    # 7. TRIAGE: Citation audit after incident
    tb = TraceBuilder(
        "trace_legal_citation_audit_001",
        proj,
        hours_ago(20),
        "Legal: Citation audit [Nexus MSA]",
        ["env:prod", "area:review", "story:triage"],
    )
    tb.add_root(
        {"contract": contract, "task": "audit citations from last 7 days"},
        {"status": "completed", "findings": 2},
    )
    tb.add_tool(
        "CitationVerifier: ValidateReferences",
        {"contract_id": contract["id"], "refs": ["19.4", "Exhibit F"]},
        {"missing": ["19.4", "Exhibit F"], "available_sections": contract["sections"]},
    )
    tb.add_llm(
        "Summarize audit",
        [{"role": "user", "content": "Summarize the citation audit and recommend next steps."}],
        "Audit found 2 hallucinated references in the last 7 days: Section 19.4 and Exhibit F. Recommendation: enforce citation verification against the contract index and require retrieval evidence before drafting redlines.",
        model="gpt-4o",
        tokens=240,
        cost=0.006,
    )
    trace, spans = tb.build()
    add(trace, spans)
    
    # 8. POST-FIX: SCC placement with verified section
    tb = TraceBuilder(
        "trace_legal_redline_postfix_001",
        proj,
        hours_ago(4),
        "Legal: Draft redline - SCC clause (post-fix) [Nexus MSA]",
        ["env:prod", "area:redlines", "story:post_fix"],
    )
    tb.add_root({"contract": contract, "task": "add SCC clause for EU data transfers"}, {"status": "completed"})
    tb.add_retriever(
        "Contract RAG",
        "data protection section",
        [{"section": "11", "title": "Data Protection", "text": "Section 11 covers data protection, security, and subprocessors."}],
    )
    tb.add_tool("CitationVerifier: CheckSection", {"section": "11"}, {"exists": True, "title": "Data Protection"})
    tb.add_llm(
        "Draft redline",
        [{"role": "user", "content": "We need to add Standard Contractual Clauses for EU data transfers. Where should this go in the MSA?"}],
        "Add SCCs as a new subsection under **Section 11 (Data Protection)**:\n\n> \"11.5 Standard Contractual Clauses. The parties agree to execute the EU SCCs for transfers of personal data to countries without an adequacy decision.\"\n\nThis placement is appropriate because Section 11 governs data protection obligations.",
        model="gpt-4o",
        tokens=420,
        cost=0.01,
        citations=[citation(contract["id"], "Section 11 - Data Protection", "Section 11 governs data protection obligations.")],
    )
    trace, spans = tb.build()
    add(trace, spans)
    
    # --- MORE GOOD TRACES ---

    # 9. Good: Contract summary with reasoning
    tb = TraceBuilder(
        "trace_legal_summary_001",
        proj,
        hours_ago(3),
        "Legal: Executive summary [Nexus MSA]",
        ["env:prod", "area:contracts", "story:post_fix"],
    )
    tb.add_root({"contract": contract, "task": "executive summary"}, {"status": "completed"})
    tb.add_llm(
        "Summarize contract",
        [{"role": "user", "content": "Give me a 30-second summary of the key terms in the Nexus MSA for the exec team."}],
        "**Nexus MSA - Key Terms:**\n\n- Value: $2.4M over 3 years\n- Liability: Capped at 12 months of fees (Section 8.2)\n- Termination: 30-day cure period for material breach (Section 12.3)\n- Data: Standard protections, no custom DPA required (Section 11)\n- Payment: Net-30, annual prepay with 15% discount\n\nRisk Level: Low (standard enterprise terms).",
        model="o1",
        reasoning_content="Need to extract key commercial terms the exec team cares about: value, risk allocation (liability), exit rights (termination), data handling, and payment. Keep it scannable.",
        tokens=500,
        cost=0.02,
        duration_ms=2800,
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 10. Good: Contract comparison
    tb = TraceBuilder(
        "trace_legal_compare_001",
        proj,
        hours_ago(2),
        "Legal: Compare to template [Nexus MSA]",
        ["env:prod", "area:contracts", "task:comparison", "story:post_fix"],
    )
    tb.add_root({"contract": contract, "task": "compare to standard template"}, {"status": "completed"})
    tb.add_retriever(
        "Template KB",
        "standard MSA template liability indemnity",
        [{"doc": "template_msa_v4", "text": "Standard liability cap is $1M or 12 months fees, whichever is greater."}],
    )
    tb.add_llm(
        "Compare contracts",
        [{"role": "user", "content": "How does the Nexus MSA compare to our standard template?"}],
        "**Nexus MSA vs Standard Template:**\n\n| Term | Nexus | Standard | Risk |\n|------|-------|----------|------|\n| Liability Cap | 12mo fees | 12mo fees or $1M | OK |\n| Indemnity | Mutual | Mutual | OK |\n| Termination | 30-day cure | 30-day cure | OK |\n| IP Ownership | Each party owns own | Each party owns own | OK |\n| Governing Law | Delaware | Delaware | OK |\n\nAssessment: Nexus terms align with our standard. Low risk.",
        tokens=350,
        cost=0.009,
    )
    trace, spans = tb.build()
    add(trace, spans)

    await session.commit()
    return bad_traces


# =============================================================================
# GTM STORIES: "The Spam Wall Incident"
# Priya Sharma's outbound campaign got OctoWorks domain blocked by Gmail
# =============================================================================

async def seed_gtm_traces(session: AsyncSession) -> dict:
    # Seeds GTM traces telling the spam wall story.
    proj = "proj_gtm"
    bad_traces = {}

    def add(trace: TraceModel, spans: List[SpanModel]):
        session.add(trace)
        for s in spans:
            session.add(s)

    # --- GOOD TRACES ---

    # 1. Good: Compliant demo offer with opt-out
    tb = TraceBuilder(
        "trace_gtm_email_good_001",
        proj,
        hours_ago(96),
        "GTM: Outbound - Demo offer (compliant)",
        ["env:prod", "area:outbound", "campaign:q4_enterprise", "story:baseline"],
    )
    tb.add_root(
        {"campaign": CAMPAIGNS["q4_enterprise"], "prospect": {"company": CUSTOMER["name"], "name": "Alex Rivera"}},
        {"status": "sent", "compliant": True},
    )
    tb.add_retriever(
        "ICP Data",
        "nexus technologies enterprise saas",
        [{"company": CUSTOMER["name"], "size": "500-1000", "industry": "SaaS", "recent_signal": "Hired Head of AI"}],
    )
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write an outbound email to Alex Rivera at Nexus Technologies offering a demo."}],
        "Subject: Quick thought on AI observability\n\nHi Alex,\n\nCongrats on the new Head of AI hire at Nexus Technologies! As you scale your AI initiatives, observability becomes critical.\n\nI'd love to show you how OctoWorks helps teams catch AI issues before customers do. The demo is a quick 20 minutes.\n\nWould next Tuesday or Wednesday work for a short call?\n\nIf you'd rather not hear from me, just reply 'opt out' and I'll remove you immediately.\n\nBest,\nPriya",
        model="claude-3-5-sonnet-20241022",
        provider="anthropic",
        citations=[citation(POLICY_DOCS["outbound"], "Outbound Compliance", "All emails must include opt-out mechanism")],
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 2. Good: Follow-up after event
    tb = TraceBuilder(
        "trace_gtm_email_good_002",
        proj,
        hours_ago(95),
        "GTM: Outbound - Event follow-up (compliant)",
        ["env:prod", "area:outbound", "story:baseline"],
    )
    tb.add_root(
        {"campaign": CAMPAIGNS["reinvent_followup"], "prospect": {"company": CUSTOMER["name"], "name": "Sam Chen"}},
        {"status": "sent", "compliant": True},
    )
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write a follow-up to Sam Chen who we met at AWS re:Invent booth."}],
        "Subject: Great meeting you at re:Invent!\n\nHi Sam,\n\nIt was great chatting at our booth yesterday about your LLM monitoring challenges. As promised, here's a link to our trace visualization dashboard: [demo.octoworks.io]\n\nI also put together a quick case study on how a similar company (500-person SaaS) reduced AI incidents by 40%.\n\nWant to continue the conversation next week?\n\nReply 'opt out' if you'd prefer not to receive emails from me.\n\nBest,\nPriya",
        model="claude-3-5-sonnet-20241022",
        provider="anthropic",
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 3. Good: Case study share
    tb = TraceBuilder(
        "trace_gtm_email_good_003",
        proj,
        hours_ago(94),
        "GTM: Outbound - Case study (compliant)",
        ["env:prod", "area:outbound", "story:baseline"],
    )
    tb.add_root(
        {"campaign": "Case Study Drip", "prospect": {"company": CUSTOMER["name"], "name": "Jordan Mills"}},
        {"status": "sent", "compliant": True},
    )
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Share a relevant case study with Jordan Mills at Nexus Technologies."}],
        "Subject: How a fintech reduced AI support escalations 34%\n\nHi Jordan,\n\nI came across Nexus Technologies' recent blog about scaling your support bot - impressive throughput numbers.\n\nThought you might find this relevant: a similar fintech team was seeing escalations spike when their AI gave incorrect policy answers. After implementing Athena's guardrails, they caught 94% of policy violations before they reached customers.\n\nFull case study here: [link]\n\nHappy to walk through how it might apply to your setup. Reply 'opt out' anytime.\n\nBest,\nPriya",
        model="gpt-4o",
    )
    trace, spans = tb.build()
    add(trace, spans)

    # --- BAD TRACES (The Incident) ---

    # 4. BAD: Spammy urgency, no opt-out (THE INCIDENT)
    tb = TraceBuilder(
        "trace_gtm_email_bad_001",
        proj,
        hours_ago(90),
        "GTM: COMPLIANCE VIOLATION - Spam email [blocked by Gmail]",
        ["env:prod", "area:outbound", "severity:critical", "needs_review", "story:incident"],
    )
    tb.add_root(
        {"campaign": "Flash Sale Push", "prospect": {"company": CUSTOMER["name"], "name": "Recipient"}},
        {"status": "blocked", "risk": "domain_reputation", "impact": "gmail_blocked"},
    )
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write a short email about our limited time offer."}],
        "Subject: URGENT: Lock in your discount now\n\nHey,\n\nQuick note - we noticed you looked at our site. For the next 24 hours only, I can get you 40% off our enterprise plan. This deal expires at midnight.\n\nReply now before it's too late!\n\n- Sales Team",
        model="gpt-4o-mini",
        status="error",
        error="COMPLIANCE: No opt-out, spammy language, urgency manipulation - blocked by Gmail",
    )
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["gtm_spam_incident"] = trace.id

    # 5. BAD: Fake urgency and pressure
    tb = TraceBuilder(
        "trace_gtm_email_bad_002",
        proj,
        hours_ago(89),
        "GTM: COMPLIANCE VIOLATION - Pressure tactics",
        ["env:prod", "area:outbound", "severity:high", "needs_review", "story:incident"],
    )
    tb.add_root({"campaign": "Flash Sale Push"}, {"status": "sent", "risk": "compliance_violation"})
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write a follow-up to someone who hasn't responded."}],
        "Subject: Did you see my last email? Time is running out\n\nHi,\n\nI sent you an email 2 days ago about a special offer. I haven't heard back - are you still interested in saving 40%?\n\nI can only hold this pricing until end of day tomorrow. After that, the price goes up and I can't do anything about it.\n\nLet me know ASAP.\n\nThanks",
        model="gpt-4o-mini",
        status="error",
        error="COMPLIANCE: No opt-out, fake urgency, pressure tactics",
    )
    trace, spans = tb.build()
    add(trace, spans)
    bad_traces["gtm_pressure_tactics"] = trace.id

    # 6. BAD: Over-personalization with scraped data
    tb = TraceBuilder(
        "trace_gtm_email_bad_003",
        proj,
        hours_ago(88),
        "GTM: COMPLIANCE VIOLATION - Inappropriate personalization",
        ["env:prod", "area:outbound", "severity:high", "needs_review", "story:incident"],
    )
    tb.add_root({"campaign": "Hyper-personalized"}, {"status": "sent", "risk": "privacy_violation"})
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write a highly personalized email using all available data about this prospect."}],
        "Subject: Saw you checked in at Philz Coffee yesterday!\n\nHi Sarah,\n\nI noticed from your LinkedIn that you were at Philz on Market Street yesterday - great choice! I'm usually there Tuesday mornings.\n\nI also saw you just got promoted to VP Engineering (congrats!) and your husband Mike works at Stripe. Small world - we have 3 Stripe customers!\n\nWould love to chat about how we could help your new team...",
        model="gpt-4o-mini",
        status="error",
        error="COMPLIANCE: Inappropriate use of personal data, creepy personalization, no opt-out",
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 7. TRIAGE: Deliverability alert after spam incident
    tb = TraceBuilder(
        "trace_gtm_deliverability_triage_001",
        proj,
        hours_ago(80),
        "GTM: Deliverability alert - Gmail block",
        ["env:prod", "area:deliverability", "story:triage"],
    )
    tb.add_root(
        {"domain": "octoworks.io", "campaign": "Flash Sale Push"},
        {"status": "blocked", "providers": ["gmail"]},
    )
    tb.add_tool(
        "Deliverability: CheckDomain",
        {"domain": "octoworks.io"},
        {"status": "blocked", "provider": "Gmail", "reason": "high complaint rate"},
    )
    tb.add_llm(
        "Summarize deliverability",
        [{"role": "user", "content": "Summarize the deliverability incident and recommend remediation steps."}],
        "Gmail has blocked the domain due to high complaint rates. Recommended remediation: pause outbound, add opt-out enforcement, remove urgency language, and run a warm-up sequence before resuming.",
        model="gpt-4o",
        tokens=220,
        cost=0.006,
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 8. POST-FIX: Recovery email with compliance gate
    tb = TraceBuilder(
        "trace_gtm_email_postfix_001",
        proj,
        hours_ago(60),
        "GTM: Outbound - Recovery campaign (compliant)",
        ["env:prod", "area:outbound", "story:post_fix"],
    )
    tb.add_root(
        {"campaign": CAMPAIGNS["recovery"], "prospect": {"company": CUSTOMER["name"], "name": "Jamie Patel"}},
        {"status": "sent", "compliant": True},
    )
    tb.add_tool(
        "EmailPolicy: Validate",
        {"has_opt_out": True, "subject_tone": "neutral", "personal_data": "minimal"},
        {"status": "pass", "issues": []},
    )
    tb.add_llm(
        "Draft email",
        [{"role": "user", "content": "Write a compliant recovery email to restart outreach."}],
        "Subject: Sharing a quick demo option\n\nHi Jamie,\n\nIf you're exploring AI observability, I'd love to share a 20-minute demo of how OctoWorks prevents policy and compliance issues before they reach customers.\n\nWould next week work for a short call?\n\nReply 'opt out' to unsubscribe.\n\nBest,\nPriya",
        model="gpt-4o",
        tokens=260,
        cost=0.007,
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 9. POST-FIX: Sequence health report
    tb = TraceBuilder(
        "trace_gtm_sequence_health_001",
        proj,
        hours_ago(20),
        "GTM: Sequence health report",
        ["env:prod", "area:deliverability", "story:post_fix"],
    )
    tb.add_root({"campaign": CAMPAIGNS["recovery"]}, {"status": "completed"})
    tb.add_tool(
        "SendGrid: Deliverability",
        {"campaign": CAMPAIGNS["recovery"]},
        {"open_rate": 0.48, "reply_rate": 0.07, "complaint_rate": 0.002, "blocklist": []},
    )
    tb.add_llm(
        "Summarize performance",
        [{"role": "user", "content": "Summarize campaign health after the compliance fix."}],
        "Recovery campaign health is stable: 48% open rate, 7% reply rate, and 0.2% complaint rate. No blocklist entries detected. Safe to scale volume gradually.",
        model="gpt-4o",
        tokens=200,
        cost=0.005,
    )
    trace, spans = tb.build()
    add(trace, spans)

    # --- MORE GOOD TRACES ---

    # 10. Good: Lead scoring with rationale
    tb = TraceBuilder(
        "trace_gtm_lead_score_001",
        proj,
        hours_ago(12),
        "GTM: Lead scoring - Enterprise prospect",
        ["env:prod", "area:qualification", "story:post_fix"],
    )
    tb.add_root({"prospect": {"company": CUSTOMER["name"], "name": "Pat Johnson"}}, {"status": "completed", "score": "high"})
    tb.add_retriever(
        "Enrichment",
        "nexus technologies company data",
        [{"company": CUSTOMER["name"], "size": "500-1000", "funding": "Series C $50M", "recent": "Hiring AI engineers"}],
    )
    tb.add_llm(
        "Score lead",
        [{"role": "user", "content": "Score this lead: Pat Johnson, VP Engineering at Nexus Technologies. They requested a demo through our website."}],
        "Lead Score: HIGH (85/100)\n\nFit Signals:\n- Company size (500-1000) matches ICP\n- Series C funding indicates budget\n- Hiring AI engineers = active AI investment\n\nIntent Signals:\n- Inbound demo request (strongest signal)\n- VP-level = decision maker\n\nRecommendation: Route to AE immediately. High-value, ready to buy.",
        model="gpt-4o",
        tokens=280,
        cost=0.007,
    )
    trace, spans = tb.build()
    add(trace, spans)

    # 11. Good: Pre-call research brief
    tb = TraceBuilder(
        "trace_gtm_research_001",
        proj,
        hours_ago(6),
        "GTM: Pre-call research brief",
        ["env:prod", "area:research", "story:post_fix"],
    )
    tb.add_root({"prospect": {"company": CUSTOMER["name"], "meeting_time": "2024-12-19T14:00:00Z"}}, {"status": "completed"})
    tb.add_retriever(
        "Company Intel",
        "nexus technologies recent news funding",
        [
            {"title": "Nexus Technologies raises $50M Series C", "date": "2024-11-15"},
            {"title": "Nexus expands to EU market", "date": "2024-12-01"},
        ],
    )
    tb.add_llm(
        "Generate brief",
        [{"role": "user", "content": "Generate a pre-call research brief for my meeting with Nexus Technologies."}],
        "Pre-Call Brief: Nexus Technologies\n\nCompany Snapshot\n- Stage: Series C ($50M, Nov 2024)\n- Size: ~800 employees\n- Focus: Enterprise SaaS for AI workflows\n\nRecent News\n- Expanding to EU market (Dec 2024) - potential GDPR/compliance angle\n- Series C closed (Nov 2024) - budget likely available\n\nTalking Points\n1. EU expansion = need for observability across regions\n2. AI workflows = LLM monitoring is relevant\n3. Recent funding = budget available for infrastructure\n\nWatch Outs\n- May be evaluating competitors post-funding\n- EU focus might mean GDPR-first priorities",
        model="gpt-4o",
        tokens=400,
        cost=0.01,
    )
    trace, spans = tb.build()
    add(trace, spans)

    await session.commit()
    return bad_traces


# =============================================================================
# COLLABORATION OBJECTS (Review Queue, Assignments, Mentions)
# =============================================================================

async def seed_collaboration(session: AsyncSession, bad_traces: dict) -> None:
    """Seeds review queue, assignments, and mentions for the incident triage story."""
    base = now_ms()
    
    # Review Items - showing triage workflow
    review_items = [
        # Support incidents
        {
            "id": "rev_001",
            "project_id": "proj_support",
            "source_id": bad_traces.get("support_refund_incident"),
            "source_type": "trace",
            "status": "resolved",
            "labels": ["verified_failure", "root_cause:prompt", "impact:high", "critical"],
            "notes": "Confirmed $897 unauthorized refund promise. Root cause: system prompt missing 30-day constraint.",
            "score": 0.0,
            "priority": 2,
            "meta": {
                "input_preview": "Customer asks for a full refund two months after cancellation.",
                "output_preview": "Assistant promised a 3-month refund outside policy window.",
                "model": "gpt-4o-mini",
                "provider": "openai",
                "assignee": PERSONAS["maya"]["email"],
            },
        },
        {
            "id": "rev_002",
            "project_id": "proj_support",
            "source_id": bad_traces.get("support_invented_policy"),
            "source_type": "trace",
            "status": "open",
            "labels": ["needs_review", "hallucination"],
            "notes": "AI invented 'Loyalty Exception policy'. Needs prompt fix.",
            "score": None,
            "priority": 1,
            "meta": {
                "input_preview": "User demands a manager after refund denial.",
                "output_preview": "Assistant cites a non-existent loyalty policy.",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        },
        # Legal incidents
        {
            "id": "rev_003",
            "project_id": "proj_legal",
            "source_id": bad_traces.get("legal_phantom_section"),
            "source_type": "trace",
            "status": "resolved",
            "labels": ["verified_failure", "client_facing", "deal:nexus", "critical"],
            "notes": "Critical: AI cited Section 19.4 which doesn't exist. Caused 2-week deal delay with Nexus.",
            "score": 0.0,
            "priority": 2,
            "meta": {
                "input_preview": "Where should SCCs be added in the MSA?",
                "output_preview": "Assistant cites Section 19.4 (non-existent).",
                "model": "gpt-4o-mini",
                "provider": "openai",
                "assignee": PERSONAS["david"]["email"],
            },
        },
        {
            "id": "rev_004",
            "project_id": "proj_legal",
            "source_id": bad_traces.get("legal_phantom_exhibit"),
            "source_type": "trace",
            "status": "in_review",
            "labels": ["needs_review", "hallucination"],
            "notes": "AI referenced non-existent Exhibit F.",
            "score": None,
            "priority": 1,
            "meta": {
                "input_preview": "Locate data processing terms in the contract.",
                "output_preview": "Assistant points to Exhibit F (not in MSA).",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        },
        # GTM incidents
        {
            "id": "rev_005",
            "project_id": "proj_gtm",
            "source_id": bad_traces.get("gtm_spam_incident"),
            "source_type": "trace",
            "status": "dismissed",
            "labels": ["compliance_violation", "domain_risk", "blocked"],
            "notes": "Gmail blocked our domain after this email. No opt-out, spammy urgency tactics.",
            "score": 0.0,
            "priority": 2,
            "meta": {
                "input_preview": "Draft a high-urgency outbound email.",
                "output_preview": "Email lacked opt-out and used pressure language.",
                "model": "gpt-4o-mini",
                "provider": "openai",
                "assignee": PERSONAS["priya"]["email"],
            },
        },
        {
            "id": "rev_006",
            "project_id": "proj_gtm",
            "source_id": bad_traces.get("gtm_pressure_tactics"),
            "source_type": "trace",
            "status": "open",
            "labels": ["needs_review", "compliance"],
            "notes": "Fake urgency and pressure tactics. Needs immediate review.",
            "score": None,
            "priority": 1,
            "meta": {
                "input_preview": "Follow-up email after no response.",
                "output_preview": "Assistant adds artificial deadline pressure.",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        },
        {
            "id": "rev_007",
            "project_id": "proj_support",
            "source_id": "trace_sup_refund_bad_003",
            "source_type": "trace",
            "status": "in_review",
            "labels": ["needs_review", "calculation_error"],
            "notes": "Refund proration calculation is incorrect.",
            "score": None,
            "priority": 1,
            "meta": {
                "input_preview": "User asks for refund halfway through annual plan.",
                "output_preview": "Assistant calculates refund as $299 instead of $149.50.",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        },
        {
            "id": "rev_008",
            "project_id": "proj_legal",
            "source_id": "trace_legal_citation_audit_001",
            "source_type": "trace",
            "status": "resolved",
            "labels": ["process_fix", "citation_verification"],
            "notes": "Citation audit complete; verifier added to redline workflow.",
            "score": 1.0,
            "priority": 0,
            "meta": {
                "input_preview": "Audit citations for the Nexus MSA redline.",
                "output_preview": "Verifier added, invalid citations flagged.",
                "model": "gpt-4o",
                "provider": "openai",
                "assignee": PERSONAS["david"]["email"],
            },
        },
        {
            "id": "rev_009",
            "project_id": "proj_gtm",
            "source_id": "trace_gtm_email_bad_003",
            "source_type": "trace",
            "status": "open",
            "labels": ["needs_review", "privacy"],
            "notes": "Creepy personalization flagged. Remove scraped data use.",
            "score": None,
            "priority": 1,
            "meta": {
                "input_preview": "Write a highly personalized outbound email.",
                "output_preview": "Assistant referenced private personal data.",
                "model": "gpt-4o-mini",
                "provider": "openai",
            },
        },
        {
            "id": "rev_010",
            "project_id": "proj_gtm",
            "source_id": "trace_gtm_email_postfix_001",
            "source_type": "trace",
            "status": "resolved",
            "labels": ["compliance_fix", "recovery"],
            "notes": "Recovery campaign compliant after opt-out gate.",
            "score": 1.0,
            "priority": 0,
            "meta": {
                "input_preview": "Compose recovery campaign email after deliverability issue.",
                "output_preview": "Email includes opt-out and compliant language.",
                "model": "gpt-4o",
                "provider": "openai",
                "assignee": PERSONAS["priya"]["email"],
            },
        },
    ]

    for item in review_items:
        source_id = item.get("source_id")
        if source_id:  # Only add if trace exists
            session.add(ReviewItemModel(
                id=item["id"],
                project_id=item["project_id"],
                source_type=item["source_type"],
                source_id=source_id,
                status=item["status"],
                labels=item.get("labels", []),
                notes=item.get("notes"),
                score=item.get("score"),
                priority=item.get("priority", 0),
                meta=item.get("meta", {}),
                created_at=base - 100_000,
                updated_at=base - 50_000,
                resolved_at=base - 30_000 if item["status"] in ["resolved", "dismissed"] else None,
            ))
    
    # Assignments - showing team workflow
    assignments = [
        ("asg_001", "proj_support", "trace", bad_traces.get("support_refund_incident"), 
         PERSONAS["jordan"]["email"], "in_progress", "Jordan, can you check if this is a one-off or pattern? I'm seeing 3 more like this."),
        ("asg_002", "proj_legal", "trace", bad_traces.get("legal_phantom_section"),
         PERSONAS["sarah"]["email"], "open", "Sarah, Nexus counsel escalated this. Priority please - they want a root cause by EOD."),
        ("asg_003", "proj_gtm", "trace", "trace_gtm_deliverability_triage_001",
         "deliverability@octoworks.io", "open", "Please coordinate domain warmup and compliance gate rollout."),
        ("asg_004", "proj_support", "trace", "trace_sup_refund_postfix_001",
         PERSONAS["jordan"]["email"], "resolved", "Guardrail fix verified in production."),
    ]
    
    for asg_id, proj, obj_type, obj_id, assignee, status, note in assignments:
        if obj_id:
            session.add(AssignmentModel(
                id=asg_id, project_id=proj, object_type=obj_type, object_id=obj_id,
                assignee=assignee, status=status, note=note,
                created_at=base - 80_000, updated_at=base - 40_000
            ))
    
    # Mentions - showing cross-team communication
    mentions = [
        ("mnt_001", "proj_support", "trace", bad_traces.get("support_refund_incident"),
         "prompt_engineering@octoworks.io", "This looks like the system prompt is missing the 30-day window constraint. Can we add guardrails?"),
        ("mnt_002", "proj_legal", "trace", bad_traces.get("legal_phantom_section"),
         "legal_team@octoworks.io", "Second hallucinated section reference this week. Need to add citation verification before prod."),
        ("mnt_003", "proj_gtm", "trace", bad_traces.get("gtm_spam_incident"),
         "compliance@octoworks.io", "Urgent: This email got us blocked by Gmail. Need compliance review of all outbound prompts."),
        ("mnt_004", "proj_gtm", "trace", "trace_gtm_deliverability_triage_001",
         "deliverability@octoworks.io", "Domain blocked by Gmail. Please propose warmup and reputation recovery steps."),
        ("mnt_005", "proj_support", "trace", "trace_sup_refund_triage_001",
         "finance@octoworks.io", "Refund leakage estimate is $47k. Please confirm exposure and reserve guidance."),
    ]
    
    for mnt_id, proj, obj_type, obj_id, mentioned, note in mentions:
        if obj_id:
            session.add(MentionModel(
                id=mnt_id, project_id=proj, object_type=obj_type, object_id=obj_id,
                mentioned=mentioned, note=note, created_at=base - 70_000
            ))
    
    # Share Links - for incident reports
    share_links = [
        ("sh_001", "proj_support", bad_traces.get("support_refund_incident"), "trace", "Support Refund Incident"),
        ("sh_002", "proj_legal", bad_traces.get("legal_phantom_section"), "trace", "Legal Hallucination Incident"),
        ("sh_003", "proj_gtm", bad_traces.get("gtm_spam_incident"), "trace", "GTM Spam Incident"),
        ("sh_004", "proj_support", "trace_sup_refund_triage_001", "trace", "Refund Leakage Summary"),
        ("sh_005", "proj_legal", "trace_legal_redline_postfix_001", "trace", "Legal Redline Fix"),
    ]
    
    for sh_id, proj_id, obj_id, obj_type, label in share_links:
        if obj_id:
            session.add(ShareLinkModel(
                id=sh_id,
                token=f"share_{sh_id[-3:]}",
                object_type=obj_type,
                object_id=obj_id,
                project_id=proj_id,
                created_at=base - 60_000,
            ))
    
    await session.commit()


# =============================================================================
# ATTACHMENTS (Artifacts for incidents and fixes)
# =============================================================================

async def seed_attachments(session: AsyncSession) -> None:
    """Seeds attachments tied to key traces for richer demo context."""
    base = now_ms()
    attachments = [
        ("att_001", "proj_support", "trace", "trace_sup_refund_bad_001", "Refund Policy v3 (PDF)", "application/pdf", "https://demo.athena.dev/files/policy_refunds_v3.pdf"),
        ("att_002", "proj_support", "trace", "trace_sup_refund_triage_001", "Refund leakage report", "application/pdf", "https://demo.athena.dev/reports/refund_leakage_q4.pdf"),
        ("att_003", "proj_legal", "trace", "trace_legal_redline_bad_001", "Nexus MSA (PDF)", "application/pdf", "https://demo.athena.dev/contracts/nexus_msa.pdf"),
        ("att_004", "proj_legal", "trace", "trace_legal_redline_postfix_001", "Redline draft (DOCX)", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "https://demo.athena.dev/contracts/nexus_redline.docx"),
        ("att_005", "proj_gtm", "trace", "trace_gtm_deliverability_triage_001", "Deliverability report", "application/pdf", "https://demo.athena.dev/reports/deliverability_gmail_block.pdf"),
    ]

    for att_id, proj, obj_type, obj_id, label, content_type, url in attachments:
        session.add(AttachmentModel(
            id=att_id,
            org_id="org_octoworks",
            project_id=proj,
            object_type=obj_type,
            object_id=obj_id,
            kind="external",
            url=url,
            content_type=content_type,
            label=label,
            size_bytes=None,
            meta={"story": "incident" if "bad" in obj_id or "triage" in obj_id else "post_fix"},
            created_at=base - 50_000,
        ))

    await session.commit()


# =============================================================================
# LOGS (corresponding to traces for Logs UI)
# =============================================================================

async def seed_logs(session: AsyncSession) -> None:
    """Seeds log entries corresponding to traces."""
    base = now_ms()
    
    log_templates = [
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_good_001",
            "event_type": "llm_call",
            "status": "success",
            "message": "Refund issued within policy window",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 640,
            "tokens": 220,
            "cost": 0.003,
            "attributes": {"environment": "prod", "area": "refunds", "story": "baseline"},
        },
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_bad_001",
            "event_type": "compliance",
            "status": "error",
            "message": "POLICY VIOLATION: Promised 3-month refund",
            "model": "gpt-4o-mini",
            "provider": "openai",
            "latency_ms": 780,
            "tokens": 180,
            "cost": 0.002,
            "attributes": {"environment": "prod", "area": "refunds", "severity": "high"},
        },
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_triage_001",
            "event_type": "alert",
            "status": "success",
            "message": "Refund leakage spike detected ($47k/24h)",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 900,
            "tokens": 260,
            "cost": 0.006,
            "attributes": {"environment": "prod", "area": "refunds", "severity": "critical"},
        },
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_postfix_001",
            "event_type": "guardrail",
            "status": "success",
            "message": "Guardrail blocked out-of-policy refund",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 700,
            "tokens": 210,
            "cost": 0.004,
            "attributes": {"environment": "prod", "area": "refunds", "guardrail": "policy"},
        },
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_postfix_002",
            "event_type": "llm_call",
            "status": "success",
            "message": "Refund issued after guardrail pass",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 650,
            "tokens": 200,
            "cost": 0.003,
            "attributes": {"environment": "prod", "area": "refunds", "guardrail": "approved"},
        },
        {
            "project_id": "proj_support",
            "trace_id": "trace_sup_refund_followup_001",
            "event_type": "audit",
            "status": "success",
            "message": "Incident follow-up analysis completed",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 720,
            "tokens": 240,
            "cost": 0.004,
            "attributes": {"environment": "prod", "area": "refunds", "story": "followup"},
        },
        {
            "project_id": "proj_legal",
            "trace_id": "trace_legal_clause_good_001",
            "event_type": "audit",
            "status": "success",
            "message": "Clause extraction completed with valid citations",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 800,
            "tokens": 320,
            "cost": 0.008,
            "attributes": {"environment": "prod", "area": "legal", "story": "baseline"},
        },
        {
            "project_id": "proj_legal",
            "trace_id": "trace_legal_redline_postfix_001",
            "event_type": "compliance",
            "status": "success",
            "message": "Redline drafted with verified section",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 980,
            "tokens": 350,
            "cost": 0.009,
            "attributes": {"environment": "prod", "area": "legal", "story": "post_fix"},
        },
        {
            "project_id": "proj_legal",
            "trace_id": "trace_legal_citation_audit_001",
            "event_type": "audit",
            "status": "success",
            "message": "Citation audit flagged 2 invalid references",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 950,
            "tokens": 280,
            "cost": 0.007,
            "attributes": {"environment": "prod", "area": "legal", "story": "triage"},
        },
        {
            "project_id": "proj_legal",
            "trace_id": "trace_legal_summary_001",
            "event_type": "llm_call",
            "status": "success",
            "message": "Executive summary drafted for Nexus MSA",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 840,
            "tokens": 300,
            "cost": 0.007,
            "attributes": {"environment": "prod", "area": "legal", "story": "summary"},
        },
        {
            "project_id": "proj_legal",
            "trace_id": "trace_legal_redline_good_001",
            "event_type": "audit",
            "status": "success",
            "message": "Redline review completed with compliant edits",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 920,
            "tokens": 310,
            "cost": 0.007,
            "attributes": {"environment": "prod", "area": "legal", "story": "baseline"},
        },
        {
            "project_id": "proj_gtm",
            "trace_id": "trace_gtm_email_good_001",
            "event_type": "compliance",
            "status": "success",
            "message": "Compliant outbound email generated",
            "model": "claude-3-5-sonnet-20241022",
            "provider": "anthropic",
            "latency_ms": 900,
            "tokens": 280,
            "cost": 0.004,
            "attributes": {"environment": "prod", "area": "outbound", "campaign": CAMPAIGNS["q4_enterprise"]},
        },
        {
            "project_id": "proj_gtm",
            "trace_id": "trace_gtm_email_bad_001",
            "event_type": "compliance",
            "status": "error",
            "message": "COMPLIANCE: Email blocked by Gmail - no opt-out",
            "model": "gpt-4o-mini",
            "provider": "openai",
            "latency_ms": 600,
            "tokens": 180,
            "cost": 0.002,
            "attributes": {"environment": "prod", "area": "outbound", "campaign": CAMPAIGNS["q4_enterprise"]},
        },
        {
            "project_id": "proj_gtm",
            "trace_id": "trace_gtm_deliverability_triage_001",
            "event_type": "alert",
            "status": "success",
            "message": "Domain deliverability degraded (Gmail block)",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 700,
            "tokens": 220,
            "cost": 0.005,
            "attributes": {"environment": "prod", "area": "deliverability", "campaign": CAMPAIGNS["recovery"]},
        },
        {
            "project_id": "proj_gtm",
            "trace_id": "trace_gtm_email_postfix_001",
            "event_type": "compliance",
            "status": "success",
            "message": "Recovery campaign passed compliance gate",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 820,
            "tokens": 260,
            "cost": 0.006,
            "attributes": {"environment": "prod", "area": "outbound", "campaign": CAMPAIGNS["recovery"]},
        },
        {
            "project_id": "proj_gtm",
            "trace_id": "trace_gtm_email_good_002",
            "event_type": "llm_call",
            "status": "success",
            "message": "Follow-up email drafted after event",
            "model": "gpt-4o",
            "provider": "openai",
            "latency_ms": 760,
            "tokens": 240,
            "cost": 0.005,
            "attributes": {"environment": "prod", "area": "outbound", "campaign": CAMPAIGNS["reinvent_followup"]},
        },
    ]

    minute_offsets = (52, 39, 24, 12, 3)
    timeline = [
        base - ((hour * 60 + minute) * 60 * 1000)
        for hour in range(23, -1, -1)
        for minute in minute_offsets
    ]

    for idx, timestamp_ms in enumerate(timeline, start=1):
        template = log_templates[(idx - 1) % len(log_templates)]
        latency = template["latency_ms"] + (idx % 4) * 18
        tokens = template["tokens"] + (idx % 6) * 14
        cost = round(template["cost"] * (1 + (idx % 5) * 0.03), 4)
        level = "ERROR" if template["status"] == "error" else "INFO"
        attributes = dict(template.get("attributes", {}))
        log_metadata = {
            "request_id": f"req_{idx:04d}",
            "pipeline": "proxy",
            "cache": "hit" if idx % 7 == 0 else "miss",
            "region": "us-east-1",
        }
        session.add(LogModel(
            id=f"log_{idx:03d}",
            project_id=template["project_id"],
            trace_id=template["trace_id"],
            level=level,
            event_type=template["event_type"],
            status=template["status"],
            message=template["message"],
            timestamp=timestamp_ms,
            latency_ms=latency,
            total_tokens=tokens,
            prompt_tokens=int(tokens * 0.6),
            completion_tokens=int(tokens * 0.4),
            cost=cost,
            model=template["model"],
            provider=template["provider"],
            attributes=attributes,
            log_metadata=log_metadata,
            created_at=timestamp_ms + latency,
        ))
    
    await session.commit()


# =============================================================================
# DATASETS (Enhanced with multi-turn examples, resources, and anti-patterns)
# =============================================================================

async def seed_datasets(session: AsyncSession, bad_traces: dict) -> None:
    """Seeds datasets with realistic multi-turn examples."""
    base = now_ms()
    
    # Datasets
    datasets = [
        ("ds_support_refunds", "proj_support", "Support: Refund Responses", "Policy-correct refund responses with guardrails and escalation paths", "mixed"),
        ("ds_support_antipatterns", "proj_support", "Support: Anti-Patterns", "Refund anti-patterns and policy violations from incidents", "eval"),
        ("ds_legal_clauses", "proj_legal", "Legal: Clause Extraction", "Clause extraction and redlines with verified citations", "mixed"),
        ("ds_legal_antipatterns", "proj_legal", "Legal: Anti-Patterns", "Hallucinated citations and invented sections to block", "eval"),
        ("ds_gtm_outbound", "proj_gtm", "GTM: Outbound Emails", "Compliant outbound emails with opt-out and recovery messaging", "mixed"),
        ("ds_gtm_antipatterns", "proj_gtm", "GTM: Anti-Patterns", "Spammy, non-compliant outbound examples to block", "eval"),
    ]

    for idx, (ds_id, proj, name, desc, kind) in enumerate(datasets, start=1):
        session.add(DatasetModel(
            id=ds_id, project_id=proj, name=name, description=desc,
            version=1, kind=kind, created_at=base - idx * 100_000
        ))
    await session.commit()
    
    # Dataset rows with narrative depth (eval + resources)
    contract_id = CONTRACTS["nexus_msa"]["id"]
    rows = [
        # Support refunds - gold examples
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I was charged twice for my subscription this month. Order #INV-9012."}],
                "context": {"tier": CUSTOMER["tier"], "customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "I've verified the duplicate charge and issued a full refund. You should see it within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "2.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "support", "scenario": "duplicate_charge"},
            "source_trace_id": "trace_sup_refund_good_001",
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I clicked the wrong button and bought Analytics Pro. Can I get a refund?"}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Since you haven't used the add-on, I've processed a full refund. It should appear on your statement within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "3.2"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "support", "scenario": "accidental_purchase"},
            "source_trace_id": "trace_sup_refund_good_002",
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I cancelled 45 days ago and want a full refund."}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Our policy allows refunds within 30 days of cancellation. Since your request is outside that window, I'm escalating to our billing team for review.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "support", "scenario": "late_cancellation"},
            "source_trace_id": "trace_sup_refund_escalate_001",
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I cancelled two months ago and want a refund for the last 3 charges."}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Our policy allows refunds within 30 days of cancellation. Since this request is outside that window, I've escalated it to our billing team for review.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "guardrail_blocked"},
            "source_trace_id": "trace_sup_refund_postfix_001",
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I canceled last week and want a refund for this month."}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Your cancellation is within the 30-day window, so I've issued a refund. It should post within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "eligible_refund"},
            "source_trace_id": "trace_sup_refund_postfix_002",
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "I want to cancel halfway through my annual plan. What's my refund?"}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Your annual plan is $299.00, so a 50% prorated refund is $149.50. I can process that refund once you confirm.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "proration"},
        },
        {
            "dataset_id": "ds_support_refunds",
            "row_kind": "resource",
            "input": {
                "title": "Refund policy quick guide",
                "text": "Refunds allowed within 30 days of cancellation. Duplicate charges eligible for full refund. Escalate exceptions to billing.",
                "source": POLICY_DOCS["refunds"],
            },
            "meta": {"story_phase": "baseline", "persona": "support", "resource_type": "policy"},
        },

        # Support anti-patterns
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {
                "messages": [{"role": "user", "content": "I cancelled 2 months ago, I want ALL my money back."}],
            },
            "expected": {
                "bad_response": "No problem, I'll refund all 3 months since you first requested cancellation.",
                "good_response": "I understand your frustration. Our policy allows refunds within 30 days. I'm escalating this for manager review.",
                "violation_type": "policy_breach",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "hallucinated_window"},
            "source_trace_id": "trace_sup_refund_bad_001",
        },
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {
                "messages": [{"role": "user", "content": "I've been a customer for 3 years, get me a manager."}],
            },
            "expected": {
                "bad_response": "I've applied our Loyalty Exception policy and approved a full refund without manager review.",
                "good_response": "I understand the request. Our policy doesn't include automatic loyalty exceptions, so I'm escalating this for review.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "invented_exception"},
            "source_trace_id": "trace_sup_refund_bad_002",
        },
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {
                "messages": [{"role": "user", "content": "I want to cancel halfway through my annual plan. What's my refund?"}],
            },
            "expected": {
                "bad_response": "I'll refund 50% of your total: $299.00.",
                "good_response": "The prorated refund is $149.50 for a $299.00 annual plan. I can process that once you confirm.",
                "violation_type": "calculation_error",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "wrong_proration"},
            "source_trace_id": "trace_sup_refund_bad_003",
        },
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {
                "messages": [{"role": "user", "content": "I was charged for a plan I don't recognize. Just refund it."}],
            },
            "expected": {
                "bad_response": "Refunding now. You will see it in 5-10 business days.",
                "good_response": "I can help, but I need to verify the charge first. Let me check the invoice details.",
                "violation_type": "missing_verification",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "no_verification"},
        },

        # Legal clauses - gold examples
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "What's the liability cap in this MSA?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "The liability cap is defined in Section 8.2: Neither party's aggregate liability exceeds fees paid in the preceding 12 months.",
                "citations": [{"section": "8.2", "title": "Limitation of Liability"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "legal", "scenario": "liability_cap"},
            "source_trace_id": "trace_legal_clause_good_001",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "How can either party terminate the Nexus contract?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Section 12.3 allows termination for cause with 30 days written notice and an opportunity to cure the breach.",
                "citations": [{"section": "12.3", "title": "Termination for Cause"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "legal", "scenario": "termination_rights"},
            "source_trace_id": "trace_legal_clause_good_002",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "How long do confidentiality obligations last?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Section 10.1 states confidentiality obligations survive for 3 years after termination.",
                "citations": [{"section": "10.1", "title": "Confidentiality"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "legal", "scenario": "confidentiality"},
            "source_trace_id": "trace_legal_clause_good_003",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "Add audit rights to the Nexus MSA.", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Add audit rights under Section 11 (Data Protection) as a new subsection with annual audit rights and 30 days notice.",
                "citations": [{"section": "11", "title": "Data Protection"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "legal", "scenario": "audit_rights"},
            "source_trace_id": "trace_legal_redline_good_001",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "Where should we add SCCs for EU data transfers?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Add SCCs as a new subsection under Section 11 (Data Protection).",
                "citations": [{"section": "11", "title": "Data Protection"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "legal", "scenario": "scc_placement"},
            "source_trace_id": "trace_legal_redline_postfix_001",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "Summarize the key commercial terms in the Nexus MSA.", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Key terms: $2.4M value, liability capped at 12 months fees, 30-day cure period, standard data protections, Net-30 with annual prepay discount.",
                "citations": [
                    {"section": "8.2", "title": "Limitation of Liability"},
                    {"section": "12.3", "title": "Termination for Cause"},
                ],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "legal", "scenario": "exec_summary"},
            "source_trace_id": "trace_legal_summary_001",
        },
        {
            "dataset_id": "ds_legal_clauses",
            "row_kind": "resource",
            "input": {
                "title": "Nexus MSA section index",
                "text": "Sections 1-16 only. Liability cap in 8.2. Data protection in 11. Termination for cause in 12.3.",
                "source": contract_id,
            },
            "meta": {"story_phase": "baseline", "persona": "legal", "resource_type": "contract_index"},
        },

        # Legal anti-patterns
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "Where should we add the SCC clause?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "Add SCCs under Section 19.4 - International Data Transfers.",
                "good_response": "This MSA has 16 sections. Add SCCs under Section 11 (Data Protection) as a new subsection.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "phantom_section"},
            "source_trace_id": "trace_legal_redline_bad_001",
        },
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "Where are the data processing terms in this agreement?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "The data processing terms are detailed in Exhibit F.",
                "good_response": "There is no Exhibit F. Data protection terms are in Section 11.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "phantom_exhibit"},
            "source_trace_id": "trace_legal_redline_bad_002",
        },
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "What's the governing law in this MSA?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "Governing law is California.",
                "good_response": "Governing law is Delaware.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "wrong_governing_law"},
        },
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "Does the MSA include a special IP indemnity carve-out?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "Yes, Section 14.7 includes a custom IP carve-out for open-source use.",
                "good_response": "No special IP carve-out is listed. IP terms follow the standard template.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "invented_indemnity"},
        },

        # GTM outbound - gold examples
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write an outbound email offering a demo", "prospect": {"company": CUSTOMER["name"], "name": "Alex", "signal": "Hired Head of AI"}},
            "expected": {
                "answer": "Subject: Quick thought on AI observability\n\nHi Alex,\n\nCongrats on the new Head of AI hire! I'd love to show you how we help teams catch AI issues before customers do.\n\nWould Tuesday work for a 20-minute call?\n\nReply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "gtm", "scenario": "demo_offer"},
            "source_trace_id": "trace_gtm_email_good_001",
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write a follow-up after meeting at re:Invent", "prospect": {"company": CUSTOMER["name"], "name": "Sam"}},
            "expected": {
                "answer": "Subject: Great meeting you at re:Invent!\n\nHi Sam,\n\nIt was great chatting at our booth. Want to continue the conversation next week?\n\nReply 'opt out' if you'd prefer not to receive emails from me.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "gtm", "scenario": "event_followup"},
            "source_trace_id": "trace_gtm_email_good_002",
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Share a relevant case study", "prospect": {"company": CUSTOMER["name"], "name": "Jordan"}},
            "expected": {
                "answer": "Subject: How a fintech reduced AI support escalations 34%\n\nHi Jordan,\n\nThought you might find this case study useful. Reply 'opt out' anytime.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "baseline", "persona": "gtm", "scenario": "case_study"},
            "source_trace_id": "trace_gtm_email_good_003",
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write a compliant recovery email", "prospect": {"company": CUSTOMER["name"], "name": "Jamie"}},
            "expected": {
                "answer": "Subject: Sharing a quick demo option\n\nHi Jamie,\n\nWould next week work for a short call?\n\nReply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "recovery"},
            "source_trace_id": "trace_gtm_email_postfix_001",
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write a polite follow-up after no response", "prospect": {"company": CUSTOMER["name"], "name": "Taylor"}},
            "expected": {
                "answer": "Subject: Quick follow-up\n\nHi Taylor,\n\nJust checking in on my last note. Happy to share a quick demo if helpful.\n\nReply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "polite_followup"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write a short outbound email with an opt-out", "prospect": {"company": CUSTOMER["name"], "name": "Riley"}},
            "expected": {
                "answer": "Subject: Quick question\n\nHi Riley,\n\nAre you the right person to discuss AI observability? Reply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "short_outreach"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "row_kind": "resource",
            "input": {
                "title": "Outbound compliance checklist",
                "text": "Always include opt-out language. Avoid urgency pressure. Keep personalization business-relevant. Do not use private data.",
                "source": POLICY_DOCS["outbound"],
            },
            "meta": {"story_phase": "baseline", "persona": "gtm", "resource_type": "policy"},
        },

        # GTM anti-patterns
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Write a short email about our limited time offer"},
            "expected": {
                "bad_response": "URGENT: Lock in your discount NOW. Reply before midnight!",
                "good_response": "I'd love to share how we could help. Reply 'opt out' anytime.",
                "violation_type": "compliance",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "urgency_spam"},
            "source_trace_id": "trace_gtm_email_bad_001",
        },
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Write a follow-up to someone who hasn't responded"},
            "expected": {
                "bad_response": "Time is running out. I can only hold pricing until tomorrow.",
                "good_response": "Just checking in. Happy to share details if useful. Reply 'opt out' anytime.",
                "violation_type": "pressure",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "pressure_tactics"},
            "source_trace_id": "trace_gtm_email_bad_002",
        },
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Write a highly personalized email using all available data about this prospect"},
            "expected": {
                "bad_response": "Saw you checked in at Philz yesterday. Small world - I know your spouse works at Stripe.",
                "good_response": "Keep personalization professional and relevant to the business context. Reply 'opt out' anytime.",
                "violation_type": "privacy",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "creepy_personalization"},
            "source_trace_id": "trace_gtm_email_bad_003",
        },
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Write a short outbound email with no opt-out"},
            "expected": {
                "bad_response": "Let's hop on a call tomorrow. This offer expires tonight.",
                "good_response": "I'd love to share details. Reply 'opt out' to unsubscribe.",
                "violation_type": "missing_opt_out",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "missing_opt_out"},
        },
    ]

    extra_rows = [
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "We upgraded last week and were charged twice on invoice #INV-9144."}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Thanks for flagging this. I verified the duplicate charge and issued a full refund for the extra invoice. You should see it within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "2.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "duplicate_charge"},
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "We were billed for 3 extra seats we never provisioned this month."}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "I reviewed your seat assignments and issued a credit for the 3 unused seats. The refund will post within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "2.2"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "seat_overage"},
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "We cancelled 10 days ago but were charged again. Can you refund it?"}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "You are within the 30-day window, so I've issued a refund for the latest charge. It will post within 5-10 business days.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.1"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "recent_cancellation"},
        },
        {
            "dataset_id": "ds_support_refunds",
            "input": {
                "messages": [{"role": "user", "content": "We want to downgrade mid-cycle. Do we get a prorated credit?"}],
                "context": {"customer": CUSTOMER["name"], "policy": POLICY_DOCS["refunds"]},
            },
            "expected": {
                "answer": "Yes, I can calculate a prorated credit for the unused portion of the cycle. Once you confirm, I'll issue the refund.",
                "citations": [{"doc": POLICY_DOCS["refunds"], "section": "4.2"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "support", "scenario": "proration_credit"},
        },
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {"messages": [{"role": "user", "content": "I cancelled six months ago and want a full refund."}]},
            "expected": {
                "bad_response": "Absolutely, I'll refund all six months of charges right away.",
                "good_response": "Our policy allows refunds within 30 days of cancellation. I can escalate for an exception review.",
                "violation_type": "policy_violation",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "late_refund"},
        },
        {
            "dataset_id": "ds_support_antipatterns",
            "input": {"messages": [{"role": "user", "content": "We were charged twice. Can you refund it?"}]},
            "expected": {
                "bad_response": "Refund issued. You should see it soon.",
                "good_response": "I'll verify the duplicate charge in billing first, then issue the refund.",
                "violation_type": "verification_missing",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "support", "scenario": "missing_verification"},
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "What is the liability cap in the Nexus MSA?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Liability is capped at 12 months of fees paid under the agreement.",
                "citations": [{"section": "8.2", "title": "Limitation of Liability"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "legal", "scenario": "liability_cap"},
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "How much notice is required for termination for convenience?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Either party may terminate for convenience with 30 days written notice.",
                "citations": [{"section": "12.1", "title": "Termination"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "legal", "scenario": "termination_notice"},
        },
        {
            "dataset_id": "ds_legal_clauses",
            "input": {"prompt": "Where are data processing obligations described?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "answer": "Data processing obligations are described in Section 11 (Data Protection).",
                "citations": [{"section": "11", "title": "Data Protection"}],
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "legal", "scenario": "data_processing"},
        },
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "Add arbitration terms under Section 21.", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "Place arbitration in Section 21 with binding rules.",
                "good_response": "This MSA has 16 sections. Use the existing dispute resolution terms in Section 15.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "phantom_section"},
        },
        {
            "dataset_id": "ds_legal_antipatterns",
            "input": {"prompt": "Is liability unlimited for IP claims?", "document": {"id": contract_id, "sections": 16}},
            "expected": {
                "bad_response": "Yes, IP claims are exempt from all liability caps.",
                "good_response": "Liability remains capped per Section 8.2; there is no unlimited IP carve-out.",
                "violation_type": "hallucination",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "legal", "scenario": "invented_carveout"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Write a follow-up after our webinar", "prospect": {"company": CUSTOMER["name"], "name": "Morgan"}},
            "expected": {
                "answer": "Subject: Thanks for joining the webinar\n\nHi Morgan,\n\nThanks for attending. Happy to share a short demo if helpful. Reply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "webinar_followup"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Send a short pricing follow-up", "prospect": {"company": CUSTOMER["name"], "name": "Casey"}},
            "expected": {
                "answer": "Subject: Pricing details\n\nHi Casey,\n\nSharing the pricing overview you asked for. Happy to walk through options. Reply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "pricing_followup"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Introduce a new monitoring feature", "prospect": {"company": CUSTOMER["name"], "name": "Rae"}},
            "expected": {
                "answer": "Subject: New monitoring update\n\nHi Rae,\n\nWe just shipped a new trace diff feature. Want a quick walkthrough? Reply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "feature_update"},
        },
        {
            "dataset_id": "ds_gtm_outbound",
            "input": {"prompt": "Ask about their evaluation workflow", "prospect": {"company": CUSTOMER["name"], "name": "Avery"}},
            "expected": {
                "answer": "Subject: Quick question on evals\n\nHi Avery,\n\nCurious how you evaluate AI outputs today. Happy to share what we've seen work. Reply 'opt out' to unsubscribe.\n\nBest,\nPriya",
            },
            "example_type": "gold",
            "meta": {"story_phase": "post_fix", "persona": "gtm", "scenario": "eval_workflow"},
        },
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Offer a time-limited discount to get a response"},
            "expected": {
                "bad_response": "Reply in 24 hours to lock a 50% discount. This expires tonight.",
                "good_response": "Happy to share details if helpful. Reply 'opt out' anytime.",
                "violation_type": "pressure",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "discount_pressure"},
        },
        {
            "dataset_id": "ds_gtm_antipatterns",
            "input": {"prompt": "Use personal data to personalize the email"},
            "expected": {
                "bad_response": "Saw your weekend hike and your kids' names on social media.",
                "good_response": "Keep personalization professional and relevant to the business. Reply 'opt out' anytime.",
                "violation_type": "privacy",
            },
            "example_type": "anti_pattern",
            "meta": {"story_phase": "incident", "persona": "gtm", "scenario": "over_personalization"},
        },
    ]

    rows.extend(extra_rows)

    dataset_versions = {}
    version_entries = []
    for idx, row in enumerate(rows, start=1):
        ds_id = row["dataset_id"]
        # Increment version for THIS dataset
        v = dataset_versions.get(ds_id, 0) + 1
        dataset_versions[ds_id] = v

        row_id = f"dr_{idx:03d}"
        logical_id = f"drl_{idx:03d}"
        row_kind = row.get("row_kind", "eval")
        eval_label = row.get("eval_label")
        if row_kind == "eval" and not eval_label:
            eval_label = row.get("example_type", "gold")
        session.add(DatasetRowModel(
            id=row_id,
            dataset_id=ds_id,
            logical_id=logical_id,
            version=1,
            dataset_version=v,
            is_deleted=False,
            row_kind=row_kind,
            eval_label=eval_label,
            input=row["input"],
            expected=row.get("expected", {}),
            example_type=row.get("example_type", "gold"),
            meta=row.get("meta", {}),
            source_trace_id=row.get("source_trace_id"),
            created_at=base - idx * 10_000,
        ))
        version_entries.append(DatasetVersionModel(
            id=f"dsv_{idx:03d}",
            dataset_id=ds_id,
            version=v,
            action="insert",
            logical_id=logical_id,
            row_id=row_id,
            meta={"story_phase": row.get("meta", {}).get("story_phase")},
            created_at=base - idx * 10_000 + 500,
        ))
    
    for entry in version_entries:
        session.add(entry)
    
    # Update DatasetModel versions to their final values
    for ds_id, final_v in dataset_versions.items():
        ds = await session.get(DatasetModel, ds_id)
        if ds:
            ds.version = final_v
            session.add(ds)
    
    await session.commit()


# =============================================================================
# EXPERIMENTS (Progressive versioning showing improvement)
# =============================================================================

async def seed_experiments(session: AsyncSession) -> None:
    """Seeds experiments with progressive versioning telling improvement story."""
    base = now_ms()
    
    # Experiments
    experiments = [
        ("exp_support_refunds", "proj_support", "ds_support_refunds", "Refund Policy Compliance"),
        ("exp_legal_citations", "proj_legal", "ds_legal_clauses", "Citation Accuracy"),
        ("exp_gtm_compliance", "proj_gtm", "ds_gtm_outbound", "Outbound Email Compliance"),
    ]
    
    for idx, (exp_id, proj, ds_id, name) in enumerate(experiments, start=1):
        session.add(ExperimentModel(
            id=exp_id, project_id=proj, dataset_id=ds_id, name=name,
            status="completed", summary={}, created_at=base - idx * 200_000
        ))
    await session.commit()
    
    # Get model registry
    reg_res = await session.execute(select(ModelRegistryModel))
    registry = reg_res.scalars().all()
    
    def reg_id(provider: str, model_id: str) -> str:
        m = next((x for x in registry if x.provider == provider and x.model_id == model_id), None)
        if m:
            return m.id
        return "mdl_01"  # fallback
    
    v2 = ExperimentV2Service(session)

    def expected_text(expected: dict) -> str:
        if not isinstance(expected, dict):
            return ""
        for key in ("answer", "text", "content"):
            value = expected.get(key)
            if isinstance(value, str):
                return value
        return ""

    def output_text_for(row: DatasetRowModel, quality: str) -> str:
        expected = row.expected or {}
        label = row.eval_label or row.example_type or "gold"
        if label == "anti_pattern":
            if quality == "baseline":
                return expected.get("bad_response") or expected.get("good_response") or ""
            return expected.get("good_response") or expected_text(expected)
        answer = expected_text(expected)
        if quality == "baseline" and answer:
            return answer.split(".")[0].strip() + "."
        return answer

    def scores_for(row: DatasetRowModel, quality: str, idx: int, scorers: tuple[str, ...]) -> dict:
        base_map = {"baseline": 0.45, "constrained": 0.72, "best": 0.92}
        anti_map = {"baseline": 0.12, "constrained": 0.7, "best": 0.95}
        label = row.eval_label or row.example_type or "gold"
        base = anti_map[quality] if label == "anti_pattern" else base_map[quality]
        jitter = ((idx % 5) - 2) * 0.01
        score = max(0.0, min(1.0, base + jitter))
        scores = {}
        if "exact_match" in scorers:
            scores["exact_match"] = score
        if "contains" in scorers:
            scores["contains"] = min(1.0, score + 0.08)
        if "llm_judge" in scorers:
            scores["llm_judge"] = min(1.0, score + 0.12)
            scores["llm_judge_details"] = {"verdict": "pass" if score >= 0.7 else "fail", "reason": "Semantic fit"}
        return scores
    
    # Build versions showing improvement journey for each experiment
    for exp_id, proj, ds_id, name in experiments:
        # V1: Baseline - default prompt, weaker model
        v1 = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=None,
                model_registry_id=reg_id("openai", "gpt-4o-mini"),
                provider="openai",
                model_id="gpt-4o-mini",
                temperature=1.0,
                max_tokens=512,
                system_prompt="You are a helpful assistant.",
                scorers=("exact_match",),
                notes="Baseline: Default prompt, gpt-4o-mini",
            ),
        )
        
        # V2: Add constraints
        v2_constrained = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=v1.id,
                model_registry_id=reg_id("openai", "gpt-4o-mini"),
                provider="openai",
                model_id="gpt-4o-mini",
                temperature=0.7,
                max_tokens=512,
                system_prompt="You are a helpful assistant. Always cite sources. Never invent facts. Follow company policies strictly.",
                scorers=("exact_match", "contains"),
                notes="Added: Citation requirement + policy constraints",
            ),
        )
        
        # V3: Upgrade model
        v3_model = await v2.create_version(
            exp_id,
            VersionConfig(
                parent_version_id=v2_constrained.id,
                model_registry_id=reg_id("openai", "gpt-4o"),
                provider="openai",
                model_id="gpt-4o",
                temperature=0.7,
                max_tokens=512,
                system_prompt="You are a helpful assistant. Always cite sources. Never invent facts. Follow company policies strictly.",
                scorers=("exact_match", "contains", "llm_judge"),
                notes="Upgraded: gpt-4o + LLM judge scorer",
            ),
        )
        
        # Set V3 as main
        await v2.set_main_version(exp_id, v3_model.id)
        
        rows_res = await session.execute(
            select(DatasetRowModel).where(DatasetRowModel.dataset_id == ds_id, DatasetRowModel.is_deleted == False)
        )
        dataset_rows = [
            row for row in rows_res.scalars().all()
            if (row.row_kind or "eval") == "eval"
        ]

        runs = [
            ("baseline", v1, ("exact_match",), "gpt-4o-mini"),
            ("constrained", v2_constrained, ("exact_match", "contains"), "gpt-4o-mini"),
            ("best", v3_model, ("exact_match", "contains", "llm_judge"), "gpt-4o"),
        ]

        for run_label, version, scorers, model_id in runs:
            run_id = f"run_{exp_id}_{run_label}"
            latency_base = {"baseline": 850, "constrained": 980, "best": 1200}[run_label]
            score_values = []
            latency_total = 0.0

            run = ExperimentRunModel(
                id=run_id,
                experiment_version_id=version.id,
                status="completed",
                summary={},
                created_at=base - 150_000,
                started_at=base - 145_000,
                completed_at=base - 140_000,
            )
            session.add(run)

            for idx, row in enumerate(dataset_rows, start=1):
                output_text = output_text_for(row, run_label)
                scores = scores_for(row, run_label, idx, scorers)
                primary = scores.get(scorers[0], 0.0)
                score_values.append(float(primary) if isinstance(primary, (int, float)) else 0.0)

                latency_ms = latency_base + idx * 7
                latency_total += latency_ms

                session.add(ExperimentRunResultModel(
                    id=f"rr_{run_id}_{idx:03d}",
                    run_id=run_id,
                    dataset_row_id=row.id,
                    output={"output_text": output_text, "model": model_id, "provider": "openai"},
                    scores=scores,
                    latency_ms=latency_ms,
                ))

            avg_score = float(sum(score_values) / len(score_values)) if score_values else 0.0
            run.summary = {
                "avg_score": avg_score,
                "rows_total": len(dataset_rows),
                "rows_done": len(dataset_rows),
                "rows_scored": len(dataset_rows),
                "latency_ms_total": latency_total,
            }
            session.add(run)

        await session.commit()


# =============================================================================
# MAIN
# =============================================================================

async def main() -> None:
    """Main entry point - wipes and seeds the demo database."""
    db_path = (Path(__file__).resolve().parents[1] / "athena.db").resolve()
    db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    engine = create_async_engine(db_url, echo=False, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print(f"[seed_story] Wiping + seeding DB at {db_path}")
    await wipe_and_init(engine)

    async with SessionLocal() as session:
        print("[seed_story] Seeding core (orgs, projects, models, views, scorers)...")
        await seed_core(session)
        
        print("[seed_story] Seeding Support stories (The Refund Incident)...")
        bad_support = await seed_support_traces(session)
        
        print("[seed_story] Seeding Legal stories (The Phantom Section 19.4)...")
        bad_legal = await seed_legal_traces(session)
        
        print("[seed_story] Seeding GTM stories (The Spam Wall Incident)...")
        bad_gtm = await seed_gtm_traces(session)
        
        # Merge all bad traces
        all_bad_traces = {**bad_support, **bad_legal, **bad_gtm}
        
        print("[seed_story] Seeding collaboration objects (reviews, assignments, mentions)...")
        await seed_collaboration(session, all_bad_traces)
        
        print("[seed_story] Seeding attachments...")
        await seed_attachments(session)
        
        print("[seed_story] Seeding logs...")
        await seed_logs(session)
        
        print("[seed_story] Seeding datasets with multi-turn examples...")
        await seed_datasets(session, all_bad_traces)
        
        print("[seed_story] Seeding experiments with progressive versioning...")
        await seed_experiments(session)

    print("[seed_story] Done. Demo database ready.")
    print(
        "Seeded:\n"
        "  - 3 Projects (Support, Legal, GTM)\n"
        "  - 36 Traces with 3-5 spans each (realistic chains)\n"
        "  - 10 Review Items (showing triage workflow)\n"
        "  - 4 Assignments + 5 Mentions (cross-team communication)\n"
        "  - 6 Datasets (33 rows: eval + resources)\n"
        "  - 3 Experiments with progressive improvement (avg ~0.45 -> 0.72 -> 0.92)\n"
        "\nStories:\n"
        "  - Support: \"The Refund Incident of 12/18\" - $47K in unauthorized refunds\n"
        "  - Legal: \"The Phantom Section 19.4\" - AI cited non-existent contract sections\n"
        "  - GTM: \"The Spam Wall Incident\" - Gmail blocked OctoWorks domain\n"
        "\nRun the app to see the demo: cd frontend && npm run dev\n"
    )



if __name__ == "__main__":
    asyncio.run(main())
