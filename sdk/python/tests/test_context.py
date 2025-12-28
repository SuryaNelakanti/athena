from athena_sdk.context import (
    observe,
    new_trace_context,
    get_current_trace_context,
    set_current_trace_context,
    context_from_response,
)


def test_new_trace_context_defaults():
    context = new_trace_context()
    assert context.trace_id.startswith("trace_")
    assert context.trace_group_id == context.trace_id


def test_observe_sets_context():
    @observe
    def handler():
        return get_current_trace_context()

    set_current_trace_context(None)
    context = handler()
    assert context is not None
    assert context.trace_id.startswith("trace_")


def test_context_from_response_fallback():
    fallback = new_trace_context()
    response = {"span_id": "span_123"}
    context = context_from_response(response, fallback)
    assert context.trace_id == fallback.trace_id
    assert context.trace_group_id == fallback.trace_group_id
    assert context.parent_span_id == "span_123"
