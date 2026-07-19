import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContractTxOptions } from 'dedot/contracts'
import {
  addStorageDepositBuffer,
  createEstimatedTxOptions,
} from './contractTxOptions.ts'

const weightLimit = {
  proofSize: 456n,
  refTime: 123n,
} as Exclude<ContractTxOptions['gasLimit'], undefined>

test('returns zero when the estimated storage deposit is zero', () => {
  assert.equal(addStorageDepositBuffer(0n), 0n)
})

test('adds 20% rounded-up headroom to the failed transaction estimate', () => {
  assert.equal(addStorageDepositBuffer(74_800_002n), 89_760_003n)
})

test('preserves an explicit storage-deposit limit', () => {
  const options = createEstimatedTxOptions(
    { storageDepositLimit: 77_000_000n },
    weightLimit,
    74_800_002n,
  )

  assert.equal(options.storageDepositLimit, 77_000_000n)
})

test('buffers an automatically estimated storage-deposit limit', () => {
  const options = createEstimatedTxOptions({}, weightLimit, 74_800_002n)

  assert.equal(options.storageDepositLimit, 89_760_003n)
})

test('preserves the resolved gas/weight limit', () => {
  const options = createEstimatedTxOptions({}, weightLimit, 74_800_002n)

  assert.equal(options.gasLimit, weightLimit)
})
