# W3PI Investor App

One W3PI index, backed by a multi-asset basket.

The app is currently a minimal shell with a top logo, chain status indicator, and Typink wallet connect button. Features will be added step by step from this baseline.

## Contract Environment

Deployment addresses are read from Vite environment variables in `.env`.

The tracked `.env.example` contains the current local deployment values and commented Paseo values for later switching.

The development and preview server port is configured with `VITE_W3PI_APP_PORT` and defaults to `5173`.

Frontend code should read raw addresses from `src/config/contracts.ts`.

Typink network and deployment wiring is split across `src/config/network.ts`, `src/config/deployments.ts`, and `src/providers/W3piTypinkProvider.tsx`.

Asset Hub Paseo writes install the runtime's required custom signed-extension defaults through `src/config/paseoSignedExtensions.ts`. Optional authorization and alias inputs encode as `None`, while origin restriction defaults to disabled. The same definitions are installed in Talisman as metadata `userExtensions`, and the wallet JSON payload includes their default values. Talisman can therefore sign the exact SCALE bytes Dedot submits without using raw-message signing, which Talisman wraps in `<Bytes>...</Bytes>`.

Contract writes use the local `src/hooks/useContractTx.ts` adapter. It carries dry-run weight and storage estimates into the transaction before signing, keeping Paseo's required `revive.call.weightLimit` populated. Current Paseo runtimes return this estimate as `weightRequired`; the adapter falls back to a direct runtime dry-run when Dedot's contract layer only checks the former `gasRequired` field.

Failed contract writes are logged as structured `[W3PI transaction error]` console entries with the method, account, contract, network, arguments, exact failing stage, complete wallet signing payload, RPC code, and RPC `error.data`. Token transfers also open a details dialog whose **Copy payload + error** action produces one full-text report, so generic RPC messages such as `1010: Invalid Transaction` retain both the signed input and the node-provided rejection reason when available. Safe read-only pre-sign steps retry one transient RPC timeout; failures before wallet signing explicitly report that no signing payload existed yet.

On Paseo, the header shows an **Add Paseo** button. It fetches the active runtime metadata from the configured RPC and submits it through Talisman's injected metadata approval flow. Because Substrate wallets do not expose a standard dApp API for persistently adding an RPC network, the same panel also provides a public Paseo Asset Hub RPC and Talisman's manual network guide when the wallet still reports `Network Unknown`.

The Typink network mapping uses the current `paseo_asset_hub` identity and legacy JSON-RPC. Older `passet_hub` environment aliases are accepted only as compatibility inputs and resolve to Paseo Asset Hub.

Read-only portfolio contract reads use `VITE_W3PI_READONLY_CALLER_ADDRESS`. On pallet-revive, that caller must be mapped once with `revive.mapAccount`.

Direct Dedot reads reuse a metadata-cached legacy client from `src/data/dedotReadClient.ts` with a 30-second remote-RPC request timeout. Index, token-context, event, header-balance, and admin getter reads share that connection instead of repeatedly downloading runtime metadata through new WebSockets. Token-admin and header contract calls pass through an app-wide scheduler capped at three concurrent reads, with exponential backoff for RPC rate-limit responses.
