import type { ContractTxOptions } from 'dedot/contracts'

const BASIS_POINTS = 10_000n
const STORAGE_DEPOSIT_BUFFER_BP = 2_000n

type WeightLimit = Exclude<ContractTxOptions['gasLimit'], undefined>

export function addStorageDepositBuffer(estimatedDeposit: bigint) {
  if (estimatedDeposit <= 0n) {
    return estimatedDeposit
  }

  const buffer =
    (estimatedDeposit * STORAGE_DEPOSIT_BUFFER_BP + BASIS_POINTS - 1n) /
    BASIS_POINTS

  return estimatedDeposit + buffer
}

export function createEstimatedTxOptions(
  txOptions: Partial<ContractTxOptions>,
  weightLimit: WeightLimit,
  estimatedStorageDeposit: bigint,
): Partial<ContractTxOptions> {
  return {
    ...txOptions,
    gasLimit: weightLimit,
    storageDepositLimit:
      txOptions.storageDepositLimit ??
      addStorageDepositBuffer(estimatedStorageDeposit),
  }
}
