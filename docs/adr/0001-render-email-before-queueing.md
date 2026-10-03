# ADR 0001: Render email before queueing

- Status: Accepted
- Date: 2026-07-26

## Context

Batch Events currently creates failed-job emails from an office-scoped template,
a script-level rule, and recipients resolved from CDA user lists or manual
addresses. The delivery worker receives the resulting message from SQS. Other
authorized producers may eventually use the same queue for email that is not
caused by a Batch Events job.

Making the worker load Batch Events templates or resolve CDA lists would couple
delivery to one producer's database, authentication model, and template
vocabulary. It would also make retry behavior depend on mutable configuration.

## Decision

Producers resolve recipients and render content before enqueueing. The email
queue accepts a versioned rendered-email envelope containing a stable message
type, producer source, office, severity, recipients, subject, body, creation
time, optional template identifier, and structured diagnostic data.

Batch Events templates are canonical reusable content. They do not trigger
delivery or have a global active state. A script's active event rule is the only
control that enables failed-job email. Script rules select one template and do
not override its subject or body.

The worker validates and delivers the envelope but does not access Batch Events,
CDA, or a template store. Version 1.1 is the producer format. The worker
temporarily normalizes version 1.0 messages for rollout compatibility.

## Consequences

- Future producers can send other email categories without adopting Batch
  Events templates or rule tables.
- A queued email remains stable if a template or CDA list later changes.
- Producers require explicit SQS permission and are responsible for recipient
  authorization, rendering, and envelope validation.
- New script lifecycle events require new Batch Events rule behavior, but no
  delivery-worker change.
- Template deletion is blocked while any script rule references it.
