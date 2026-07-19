import {
  SignedExtension,
  type AnySignedExtension,
  type DedotClient,
  type ISubstrateClient,
} from 'dedot'
import type { InjectedSigner } from 'dedot/types'

const signatureOnlySigners = new WeakSet<InjectedSigner>()
const payloadRecordingSigners = new WeakSet<InjectedSigner>()
const lastSigningPayloads = new WeakMap<ISubstrateClient, unknown>()

export const paseoTalismanUserExtensions = {
  AuthorizeValueTransfer: {
    extrinsic: { authorizeValueTransfer: 'Option<Bytes>' },
    payload: {},
  },
  AuthorizeCall: { extrinsic: {}, payload: {} },
  AsPgas: { extrinsic: { asPgas: 'Option<Bytes>' }, payload: {} },
  AsRingAlias: {
    extrinsic: { asRingAlias: 'Option<Bytes>' },
    payload: {},
  },
  AsDotnsGateway: {
    extrinsic: { asDotnsGateway: 'Option<Bytes>' },
    payload: {},
  },
  RestrictOrigins: {
    extrinsic: { restrictOrigins: 'bool' },
    payload: {},
  },
  PrevalidateAttests: { extrinsic: {}, payload: {} },
  EthSetOrigin: { extrinsic: {}, payload: {} },
  StorageWeightReclaim: { extrinsic: {}, payload: {} },
} satisfies Record<
  string,
  { extrinsic: Record<string, string>; payload: Record<string, string> }
>

const paseoTalismanPayloadDefaults = {
  authorizeValueTransfer: null,
  asPgas: null,
  asRingAlias: null,
  asDotnsGateway: null,
  restrictOrigins: false,
}

class OptionalNoneSignedExtension extends SignedExtension<undefined, []> {
  async init() {
    this.setDefaults()
  }

  async fromPayload() {
    this.setDefaults()
  }

  private setDefaults() {
    this.data = undefined
    this.additionalSigned = []
  }
}

class DisabledRestrictionSignedExtension extends SignedExtension<boolean, []> {
  async init() {
    this.setDefaults()
  }

  async fromPayload() {
    this.setDefaults()
  }

  private setDefaults() {
    this.data = false
    this.additionalSigned = []
  }
}

/**
 * Asset Hub Paseo transaction extensions that require explicit extrinsic input.
 *
 * Ordinary app transactions do not use the optional authorization/alias payloads,
 * so they encode `None`. Origin restriction remains disabled. Dedot handles Paseo's
 * remaining input-free extensions through its fallback signed-extension support.
 */
export const paseoSignedExtensions = {
  AuthorizeValueTransfer: OptionalNoneSignedExtension,
  AsPgas: OptionalNoneSignedExtension,
  AsRingAlias: OptionalNoneSignedExtension,
  AsDotnsGateway: OptionalNoneSignedExtension,
  RestrictOrigins: DisabledRestrictionSignedExtension,
} satisfies Record<string, AnySignedExtension>

export function installPaseoSignedExtensions(client: DedotClient) {
  client.options.signedExtensions = {
    ...client.options.signedExtensions,
    ...paseoSignedExtensions,
  }
}

/**
 * Talisman 3.7.1 uses the injected metadata's `userExtensions` definitions to
 * build the SCALE signing payload. Include the matching default fields in the
 * JSON request so Talisman and Dedot encode the same five custom-extension bytes.
 *
 * `signRaw` is intentionally not used: Talisman wraps raw messages in
 * `<Bytes>...</Bytes>`, which produces a valid message signature but not a valid
 * extrinsic signature.
 */
export function installTalismanSignatureOnlySigner(client: ISubstrateClient) {
  const signer = client.options.signer

  if (!signer?.signPayload || signatureOnlySigners.has(signer)) {
    return
  }

  const signatureOnlySigner: InjectedSigner = {
    ...signer,
    signPayload: async (payload) => {
      const signingPayload = {
        ...payload,
        ...paseoTalismanPayloadDefaults,
        withSignedTransaction: false,
      }
      lastSigningPayloads.set(client, signingPayload)

      // Resolve the current injected signer instead of chaining an older
      // hot-reloaded wrapper that may still be attached to the Dedot client.
      const injected = await window.injectedWeb3?.talisman?.enable(
        'W3PI Investor App',
      )

      if (!injected?.signer?.signPayload) {
        throw new Error('Talisman transaction signer is unavailable')
      }

      return injected.signer.signPayload(signingPayload)
    },
  }

  signatureOnlySigners.add(signatureOnlySigner)
  client.setSigner(signatureOnlySigner)
}

export function installSigningPayloadRecorder(client: ISubstrateClient) {
  const signer = client.options.signer

  if (!signer?.signPayload || payloadRecordingSigners.has(signer)) {
    return
  }

  const payloadRecordingSigner: InjectedSigner = {
    ...signer,
    signPayload: (payload) => {
      lastSigningPayloads.set(client, payload)
      return signer.signPayload!(payload)
    },
  }

  payloadRecordingSigners.add(payloadRecordingSigner)
  client.setSigner(payloadRecordingSigner)
}

export function clearLastSigningPayload(client: ISubstrateClient) {
  lastSigningPayloads.delete(client)
}

export function getLastSigningPayload(client: ISubstrateClient) {
  return lastSigningPayloads.get(client)
}
