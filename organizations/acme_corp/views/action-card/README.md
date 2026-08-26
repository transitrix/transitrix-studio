# `canon/views/action-card/`

Single-project narrative cards. Each card binds to one project Action (`project: ACTION-…`) and adds narrative milestones; the motivation chain and child actions are pulled by reference from the DGCA/DGA and Action documents rather than duplicated.

## File convention

`*.action-card.transitrix.yaml`

See [`notations/views/18-action-card.md`](../../../../../notations/views/18-action-card.md) for the full spec.

## Lifecycle

The card is a view, not an element — it carries no lifecycle. The project Action it binds to and any `delivers_changes: [CHANGE-…]` it names bear their lifecycle on their own canonical files.

## See also

- [`notations/views/18-action-card.md`](../../../../../notations/views/18-action-card.md) — the notation spec
- [`notations/examples/action-card/`](../../../../../notations/examples/action-card/) — worked example
- [`../action/`](../action/) — the action network the card's project lives in
