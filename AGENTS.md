# AGENTS.md

Guidance for Codex and other agents working in this repository.

## Project Identity

This is the W3PI Investor App.

The product concept is one W3PI index backed by a multi-asset basket. Do not model the app as many indexes, many funds, or a fund marketplace unless the user explicitly changes the product direction.

Current UI state is intentionally minimal:

- top W3PI logo
- Dedot-backed chain status indicator
- Typink wallet connect button
- empty main area for step-by-step implementation

Do not reintroduce the old left sidebar, right panel, search bar, filter controls, tier cards, index list, or trust strip unless the user specifically asks.

## Tech Stack

- Vite
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn-style local UI primitives
- Dedot for direct chain/RPC status and future chain reads
- Typink for wallet/provider/contract wiring
- npm with `package-lock.json`

Use npm commands in this repo.

## Commands

Run from repository root:

```sh
npm run dev
npm run build
npm run typecheck
npm run preview
```

The dev server script is `vite --host 0.0.0.0`; with the default `VITE_W3PI_APP_PORT`, the local URL is:

```text
http://localhost:5173/
```

Before finishing code changes, run:

```sh
npm run build
```

If the change only edits markdown/docs, a build is not required.

## Environment

Local runtime config is loaded through Vite environment variables.

- `.env` is local-only and ignored by Git.
- `.env.example` is tracked and should stay updated when env keys change.
- Frontend code should read raw env values only through `src/config/contracts.ts`.

Active local RPC:

```text
VITE_W3PI_RPC_URL=ws://localhost:9944
```

The app should report `Not Connected` when nothing is listening on `ws://localhost:9944`. Start the local chain/node before expecting `Connected`.

Current env keys:

- `VITE_W3PI_APP_PORT`
- `VITE_W3PI_NETWORK`
- `VITE_W3PI_RPC_URL`
- `VITE_W3PI_DEPLOYED_AT`
- `VITE_W3PI_READONLY_CALLER_ADDRESS`
- `VITE_W3PI_TOKEN_ADDRESS`
- `VITE_USDC_TOKEN_ADDRESS`
- `VITE_ORACLE_ADDRESS`
- `VITE_REGISTRY_ADDRESS`
- `VITE_DEX_ADDRESS`
- `VITE_PORTFOLIO_ADDRESS`
- `VITE_PORTFOLIO_MANAGER_ADDRESS`
- `VITE_STAKING_ADDRESS`

## Important Files

- `src/App.tsx`: top-level shell, logo, chain status, wallet button, empty main area.
- `src/hooks/useDedotChainStatus.ts`: direct Dedot connection to `VITE_W3PI_RPC_URL`.
- `src/hooks/useContractTx.ts`: Typink-compatible write hook that supplies dry-run weight/storage limits before building Paseo `revive.call` extrinsics.
- `src/lib/transactionError.ts`: safe structured transaction-error serialization and console diagnostics, including RPC `code`/`data` and BigInt transaction context.
- `src/data/dedotReadClient.ts`: shared legacy Dedot read client with metadata caching and a 30-second remote-friendly request timeout.
- `src/lib/contractReadScheduler.ts`: app-wide contract-read concurrency limit and rate-limit backoff.
- `src/providers/W3piTypinkProvider.tsx`: Typink root provider.
- `src/config/contracts.ts`: raw deployment env config.
- `src/config/network.ts`: Typink network mapping. Local/development uses legacy JSON-RPC.
- `src/config/paseoSignedExtensions.ts`: Asset Hub Paseo transaction-extension defaults installed into Typink's Dedot client.
- `src/config/deployments.ts`: Typink contract deployment list and ABI metadata imports.
- `src/store/portfolioApi.ts`: RTK Query endpoint for portfolio token execution contexts.
- `src/data/tokenExecutionContexts.ts`: direct Dedot read service for portfolio-held token context loading.
- `src/components/portfolio/PortfolioTokenContextsPanel.tsx`: main-area panel for held token context rows.
- `src/contracts/`: generated Dedot Typink contract typings. Regenerate from `abis/` with local `node_modules/.bin/dedot typink`.
- `src/components/wallet/WalletConnectButton.tsx`: wallet connect/account dropdown.
- `src/components/wallet/PaseoWalletSetupButton.tsx`: Paseo-only Talisman metadata approval and manual RPC setup helper.
- `src/components/ui/button.tsx`: local button primitive.
- `src/index.css`: Tailwind v4 and theme tokens.
- `abis/*.json`: contract metadata consumed by Typink deployments.
- `docs/dedot-llms-full.md`: local Dedot manual. Read relevant sections before changing Dedot/Typink chain code.
- `docs/W3PI_INVEST_APP_DETAILED_PROJECT.md`: detailed project draft/reference.
- `contract_sources_temp/`: copied contract source reference. Do not modify unless the user asks for contract-source work.

## Dedot Rules

Use Dedot for direct chain/RPC status and future direct chain reads.

Read-only contract queries still need a revive-mapped caller account. Use `VITE_W3PI_READONLY_CALLER_ADDRESS` for app-level reads that should not depend on the currently connected wallet. If a query reports `Revive::AccountUnmapped`, map that caller once with `revive.mapAccount` or switch the env value to an already mapped account.

The portfolio token context read path intentionally mirrors the Rust portfolio manager helper:

- call `portfolio.get_held_token_ids()`
- for each id, call `portfolio.get_token_holding(id)`
- for each held id, call `registry.get_token_data(id)`
- fail the request if the held-id call fails
- skip individual ids when the holding read is missing/failing or registry returns `Err`
- preserve held-id order in the returned rows
- serialize `u64`/`u128` chain values as decimal strings before storing them in Redux

Current status hook behavior:

- obtains the shared client from `src/data/dedotReadClient.ts`
- connects to `deploymentConfig.rpcUrl` through a metadata-cached legacy client
- fetches chain name and best block before marking `connected`
- retries with exponential delays from 5 to 60 seconds after disconnect/failure
- returns `connected`, `checking`, or `disconnected`

Shared read-client behavior:

- index, token-context, event, header-balance, token-admin, and contract-getter reads reuse `getDedotReadClient()`
- do not create and disconnect a new Dedot client inside individual read services
- allow up to 30 seconds for remote RPC requests because cold runtime metadata responses can be larger than 1 MB

Token-admin read behavior:

- skip the RTK Query request until a wallet account is available
- query the W3PI token owner before loading the expensive admin summary
- return after the owner check when the connected revive address is not the owner
- route token-admin and header contract calls through the shared scheduler
- keep at most three contract reads in flight across those surfaces
- retry only rate-limit responses, with exponential backoff and jitter

For local nodes, prefer legacy JSON-RPC unless proven otherwise. The local Dedot manual notes local contracts nodes can be unreliable with the newer JSON-RPC API.

## Typink Rules

Typink owns wallet/account/provider/contract wiring.

Provider split:

- network info: `src/config/network.ts`
- deployments: `src/config/deployments.ts`
- React provider: `src/providers/W3piTypinkProvider.tsx`

Do not put env parsing, ABI imports, network definitions, wallet UI, and provider wiring into one giant provider file.

Do not use fake wallet state. The old Redux wallet toggle was removed. Use Typink hooks such as `useTypink()` for wallet state and actions.

Asset Hub Paseo advertises custom transaction extensions that Dedot does not implement by default. Keep the Paseo-only installer in `src/providers/W3piTypinkProvider.tsx` aligned with `src/config/paseoSignedExtensions.ts`: ordinary app writes encode `None` for `AuthorizeValueTransfer`, `AsPgas`, `AsRingAlias`, and `AsDotnsGateway`, and `false` for `RestrictOrigins`. Dedot's fallback handles the remaining input-free extensions. Install the same fields in Talisman metadata as `userExtensions`, include their defaults in the wallet JSON payload, and request signature-only results (`withSignedTransaction: false`) so Dedot assembles the final extrinsic. Do not use Talisman `signRaw` for extrinsics because it signs a `<Bytes>...</Bytes>`-wrapped message.

Use the local `src/hooks/useContractTx.ts` for contract writes instead of importing Typink's hook directly. Current Paseo metadata names the required `revive.call` field `weightLimit` and its runtime API returns `weightRequired`, while the current Dedot contract executor still reads and updates `gasRequired`/`gasLimit`. The local hook falls back to a direct runtime dry-run and passes the resulting weight positionally before signing so the runtime field is never undefined.

Keep transaction failures structured. `useContractTx` must record the raw error plus safe method/account/contract/network/argument context through `src/lib/transactionError.ts`; UI surfaces may show the short message inline but should retain the RPC `code`, `data`, cause, and stack for a copyable details view. Never serialize wallet secrets or mnemonic material.

The Paseo header helper may submit current runtime metadata through Talisman's injected `metadata.provide` approval flow, but it must not claim that it can persistently add a Substrate RPC network. There is no standard dApp `wallet_add*` method for Substrate networks; keep the public RPC copy action and official Talisman manual setup link as the `Network Unknown` fallback.

Use Typink's current `paseoAssetHub` network definition and force `JsonRpcApi.LEGACY` for this app. Keep accepting the former `passet_hub` env spellings only as aliases that resolve to `paseo_asset_hub`.

## Contract Deployments

Deployment addresses live in `.env` / `.env.example` and are read by `src/config/contracts.ts`.

ABI metadata is imported from `abis/`.

Current deployment ids in `src/config/deployments.ts`:

- `w3piToken`
- `usdcToken`
- `oracle`
- `registry`
- `dex`
- `portfolio`
- `portfolioManager`
- `staking`

Keep these ids stable unless the contract integration plan changes.

## Frontend Design Rules

The current app should stay quiet, compact, and app-like.

- Keep header controls small.
- Use the shadcn-style theme tokens in `src/index.css`.
- Use lucide icons when an icon is useful.
- Avoid landing-page or marketing-style sections.
- Avoid decorative cards or hero layouts at this stage.
- Do not add sidebars, dashboards, tables, or asset lists until the user asks for the next implementation step.
- Preserve the empty default page until a real feature is requested.

## Git And Worktree Rules

The worktree may already contain user or previous-agent changes. Do not revert unrelated changes.

Notable current project history:

- Baseline commit exists: `9cff20e chore: add investor app baseline`
- Many current implementation changes may be uncommitted.

Before committing, inspect:

```sh
git status --short
git diff
```

Only stage files relevant to the requested change.

## Verification Checklist

For code changes:

1. Run `npm run build`.
2. If UI behavior changed, verify the configured `VITE_W3PI_APP_PORT` URL (default: `http://localhost:5173/`) in the browser.
3. If chain status changed, test both states:
   - node down: should show `Not Connected`
   - node running on `ws://localhost:9944`: should show `Connected`, chain name, and best block in the tooltip

For direct local RPC checks, this shape is useful:

```sh
node -e 'const ws=new WebSocket("ws://localhost:9944"); ws.addEventListener("open",()=>ws.send(JSON.stringify({id:1,jsonrpc:"2.0",method:"system_chain",params:[]}))); ws.addEventListener("message",e=>{console.log(e.data.toString()); ws.close(); process.exit(0);}); ws.addEventListener("error",e=>{console.error(e.message||e); process.exit(1);}); setTimeout(()=>{console.error("timeout"); process.exit(2);},5000);'
```

## Documentation Maintenance

When changing architecture, env keys, commands, or project direction, update this file and `README.md`.

When changing Dedot/Typink usage, check `docs/dedot-llms-full.md` first and keep the implementation aligned with the local manual.
