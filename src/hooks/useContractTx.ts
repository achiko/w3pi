import { useCallback, useState } from 'react'
import type { Contract, ContractTxOptions, GenericContractApi } from 'dedot/contracts'
import type { ISubmittableResult } from 'dedot/types'
import { assert } from 'dedot/utils'
import {
  checkBalanceSufficiency,
  ContractMessageError,
  paseoAssetHub,
  useTypink,
  withReadableErrorMessage,
} from 'typink'
import {
  clearLastSigningPayload,
  getLastSigningPayload,
  installSigningPayloadRecorder,
  installTalismanSignatureOnlySigner,
} from '@/config/paseoSignedExtensions'
import { createEstimatedTxOptions } from '@/hooks/contractTxOptions'
import { ensurePaseoMetadataInTalisman } from '@/lib/talismanPaseo'
import { recordTransactionError } from '@/lib/transactionError'

type ContractTxParameters = {
  args?: unknown[]
  txOptions?: Partial<ContractTxOptions>
  callback?: (result: ISubmittableResult) => void
}

type WeightLimit = Exclude<ContractTxOptions['gasLimit'], undefined>

type ContractQueryResult = {
  data?: unknown
  inputData: string
  raw: {
    gasRequired?: WeightLimit
    storageDeposit: {
      value: bigint
    }
  }
}

type ContractMethod = (...args: unknown[]) => Promise<ContractQueryResult>
type ContractTxMethod = (...args: unknown[]) => {
  signAndSend: (
    caller: string,
    callback: (result: ISubmittableResult) => void,
  ) => Promise<unknown>
}

type ReviveCallResult = {
  gasRequired?: WeightLimit
  weightRequired?: WeightLimit
}

type ReviveRuntimeApi = {
  call: (
    caller: string,
    destination: string,
    value: bigint,
    weightLimit: WeightLimit | undefined,
    storageDepositLimit: bigint | undefined,
    inputData: string,
  ) => Promise<ReviveCallResult>
}

type TransactionStage =
  | 'checking_balance'
  | 'dry_running_contract'
  | 'estimating_weight'
  | 'syncing_wallet_metadata'
  | 'signing_and_submitting'

const PRE_SIGN_READ_ATTEMPTS = 2
const PRE_SIGN_RETRY_DELAY_MS = 500

function isRequestTimeout(error: unknown) {
  return error instanceof Error && /Request timed out after \d+ms/i.test(error.message)
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

async function runPreSignRead<T>(read: () => Promise<T>) {
  for (let attempt = 1; attempt <= PRE_SIGN_READ_ATTEMPTS; attempt += 1) {
    try {
      return await read()
    } catch (error) {
      if (!isRequestTimeout(error) || attempt === PRE_SIGN_READ_ATTEMPTS) {
        throw error
      }

      await wait(PRE_SIGN_RETRY_DELAY_MS)
    }
  }

  throw new Error('Pre-sign RPC retry attempts exhausted')
}

function getContractError(data: unknown) {
  if (!data || typeof data !== 'object' || !('isErr' in data) || !('err' in data)) {
    return undefined
  }

  return data.isErr ? data.err : undefined
}

async function resolveWeightLimit(
  contract: Contract<GenericContractApi>,
  caller: string,
  dryRun: ContractQueryResult,
  txOptions: Partial<ContractTxOptions>,
) {
  const knownWeight = txOptions.gasLimit ?? dryRun.raw.gasRequired

  if (knownWeight) {
    return knownWeight
  }

  const reviveApi = (
    contract.client.call as unknown as { reviveApi?: ReviveRuntimeApi }
  ).reviveApi
  assert(reviveApi, 'Connected chain does not expose reviveApi.call')

  const raw = await reviveApi.call(
    caller,
    contract.address,
    txOptions.value ?? 0n,
    undefined,
    txOptions.storageDepositLimit,
    dryRun.inputData,
  )
  const runtimeWeight = raw.weightRequired ?? raw.gasRequired
  assert(runtimeWeight, 'reviveApi.call did not return a required weight estimate')

  return runtimeWeight
}

/**
 * Typink-compatible contract transaction hook that passes the dry-run weight into
 * the transaction up front. This keeps current Asset Hub Paseo's `weightLimit`
 * parameter populated even though Dedot's contract executor still refers to the
 * post-construction field by its previous `gasLimit` name.
 */
export function useContractTx(
  contract: Contract<GenericContractApi> | undefined,
  fn: string,
) {
  const [inProgress, setInProgress] = useState(false)
  const [inBestBlockProgress, setInBestBlockProgress] = useState(false)
  const { connectedAccount, network } = useTypink()

  const signAndSend = useCallback(
    async ({ args = [], txOptions = {}, callback }: ContractTxParameters) => {
      assert(contract, 'Contract not found')
      assert(connectedAccount, 'No connected account. Please connect your wallet.')
      setInProgress(true)
      setInBestBlockProgress(true)
      clearLastSigningPayload(contract.client)
      let effectiveTxOptions: Partial<ContractTxOptions> = txOptions
      let transactionStage: TransactionStage = 'checking_balance'

      try {
        await runPreSignRead(() =>
          checkBalanceSufficiency(contract.client, connectedAccount.address),
        )

        const query = (contract.query as unknown as Record<string, ContractMethod>)[fn]
        const tx = (contract.tx as unknown as Record<string, ContractTxMethod>)[fn]
        assert(query, `Contract query not found: ${fn}`)
        assert(tx, `Contract transaction not found: ${fn}`)

        transactionStage = 'dry_running_contract'
        const dryRun = await runPreSignRead(() =>
          query(...args, { caller: connectedAccount.address }),
        )
        const contractError = getContractError(dryRun.data)

        if (contractError !== undefined) {
          throw new ContractMessageError(contractError)
        }

        transactionStage = 'estimating_weight'
        const weightLimit = await runPreSignRead(() =>
          resolveWeightLimit(
            contract,
            connectedAccount.address,
            dryRun,
            txOptions,
          ),
        )
        const estimatedTxOptions = createEstimatedTxOptions(
          txOptions,
          weightLimit,
          dryRun.raw.storageDeposit.value,
        )
        effectiveTxOptions = estimatedTxOptions

        if (
          network.id === paseoAssetHub.id &&
          connectedAccount.source === 'talisman'
        ) {
          transactionStage = 'syncing_wallet_metadata'
          await ensurePaseoMetadataInTalisman()
          installTalismanSignatureOnlySigner(contract.client)
        } else {
          installSigningPayloadRecorder(contract.client)
        }

        transactionStage = 'signing_and_submitting'
        await new Promise<void>((resolve, reject) => {
          tx(...args, estimatedTxOptions)
            .signAndSend(connectedAccount.address, (result) => {
              if (result.status.type === 'BestChainBlockIncluded') {
                setInBestBlockProgress(false)
              }

              callback?.(result)

              if (
                result.status.type === 'Finalized' ||
                result.status.type === 'Invalid' ||
                result.status.type === 'Drop'
              ) {
                resolve()
              }
            })
            .catch(reject)
        })
      } catch (error) {
        const readableError = withReadableErrorMessage(
          contract.client,
          error instanceof Error ? error : new Error(String(error)),
        )
        recordTransactionError(readableError, {
          account: connectedAccount.address,
          args,
          contract: contract.address,
          method: fn,
          network: network.id,
          payload: getLastSigningPayload(contract.client),
          requestedTxOptions: txOptions,
          stage: transactionStage,
          txOptions: effectiveTxOptions,
        })
        throw readableError
      } finally {
        setInProgress(false)
        setInBestBlockProgress(false)
      }
    },
    [connectedAccount, contract, fn, network.id],
  )

  return {
    signAndSend,
    inProgress,
    inBestBlockProgress,
  }
}
