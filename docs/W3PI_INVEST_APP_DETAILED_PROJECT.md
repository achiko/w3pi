# W3PI Investor App - Current Project Direction

Date: 2026-06-26

## Concept

The current product is one W3PI index with a multi-asset basket.

The UI should be built around that single index model.

## Current UI Baseline

The app is intentionally reset to a minimal shell:

- Top bar
- W3PI logo
- Wallet connect button
- Empty main page

Everything else will be implemented step by step.

## Current Technical Baseline

- Frontend: Vite, React, TypeScript
- Styling: Tailwind CSS v4 with shadcn-style local primitives
- State: Redux Toolkit, currently wallet connection state only
- Contract references: existing `abis/` and `contract_sources_temp/` folders are kept as local source material

## Next Implementation Steps

1. Add the first real single-index overview section.
2. Wire read-only contract data for the W3PI index.
3. Add wallet integration.
4. Add buy flow.
5. Add portfolio/basket composition.
6. Add event indexing and backend once the first UI path is stable.

## Important Product Rule

Keep the product model focused on one W3PI index backed by a basket of assets.
