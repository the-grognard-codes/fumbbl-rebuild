# ADR requests and decision records

Use this template for requests to document a consequential architectural choice,
especially when the deliverable is a policy, risk assessment, or ownership rule.
Use [the feature template](feature-template.md) for changes to product behavior.
Keep straightforward ADRs short; include the detailed sections below only when
they help a reviewer assess the trade-off.

## Locations and lifecycle

- Put the request and its acceptance criteria in `docs/specs/<topic>-adr.md`,
  linked to the existing GitHub issue. A request describes work to be done; it
  does not accept a decision or prove that mitigations are implemented.
- Put the resulting decision in `docs/adr/NNNN-<decision>.md`, using the next
  unused number at drafting time. Link it back to the request and issue.
- Mark a new decision `proposed`. Record `accepted` only with maintainer
  approval evidence and a date. Approval of an ADR requirement is distinct from
  acceptance of its final policy. Later records may be `deprecated` or
  `superseded`, with a link to the replacement.
- Follow [the domain documentation layout](domain.md). Link the resulting ADR
  from the architecture map's invariants on acceptance. A draft may be linked
  separately as proposed, not yet enforced. Update an
  affected accepted ADR explicitly rather than silently overriding it.
- Keep implementation tickets and their validation separate from the decision.
  Acceptance of a policy does not close its known compliance gaps.

## Request template

Replace every placeholder. Distinguish source findings, checked code, proposed
policy, and unresolved choices. Do not copy a feature's UI or build requirements
into a documentation-only request.

```md
# ADR request: <architectural choice>

Status: requested; resulting ADR not yet accepted.
Source: <issue URL and relevant discussion>
Reviewed: <date and repository revision>
Template: <relative link to this template>

## Objective

<Decision needed, why it matters, and the intended review outcome.>

## Context and evidence

<Current behavior, ownership boundaries, code links, existing ADRs, and limits
of the evidence. Explain why the choice warrants an ADR.>

## Scope and deliverables

<Required ADR, cross-references, and any prerequisites or sequencing.>
<Explicit exclusions, including implementation work tracked elsewhere.>

## Required decision content

<Rules the ADR must define, allowed/prohibited work, failure semantics,
configuration or budget selection, and compatibility constraints. Label any
candidate policy as proposed.>

## Risks and mitigation ownership

| Risk / trigger | Consequence | Required mitigation or decision | Owner / tracking | Remaining risk |
| --- | --- | --- | --- | --- |
| <risk> | <impact> | <control> | <responsible role or issue> | <residual exposure> |

## Alternatives and open decisions

<Real alternatives, trade-offs, and choices the maintainer must resolve. Do not
invent approval, measurements, thresholds, or implementation results.>

## Acceptance criteria

### Draft ready for maintainer review

- <Observable requirements for the drafted ADR and documented open decisions.>
- <Consistency with existing ADRs, evidence coverage, and checked links.>

### Accepted

- <Approval evidence, resolved policy choices, and any required tracking owners.>
- <Architecture-map invariant link and gates on subsequent implementation.>

## Validation and handoff

<Documentation checks now; evidence required from later implementation tickets.>
<Constraints, authorization limits, and any outstanding evidence gaps.>
```

## Resulting ADR template

```md
# <Decision stated directly>

Status: proposed
Issue: <issue link>
Request: <spec link>

<One to three sentences: context, chosen approach, and why.>

## Decision and boundaries

<Ownership, permitted/prohibited operations, budgets and failure behavior.>

## Alternatives considered

<Credible alternatives and why they were rejected or deferred.>

## Consequences and known gaps

<Benefits, costs, residual risks, and mitigation tickets. Clearly identify
which controls already exist and which remain to be implemented.>

## Revisit conditions

<Evidence or preconditions that would justify changing the decision.>
```

Upon acceptance, replace the proposed status with the approval date and link to
the maintainer's acceptance. Omit optional sections if the opening paragraph
fully explains a small decision.
