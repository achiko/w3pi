import { Contract, type LooseContractMetadata } from 'dedot/contracts'
import dexMetadata from '../../abis/dex.json'
import portfolioMetadata from '../../abis/portfolio.json'
import portfolioManagerMetadata from '../../abis/portfolio_manager.json'
import registryMetadata from '../../abis/registry.json'
import tokenMetadata from '../../abis/token.json'
import { deploymentConfig } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'

const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

// TODO: move this constans in .ENV and Config 
const ALICE_REVIVE_ADDRESS = '0x9621dde636de098b43efb0fa9b61facfe328f99d'
const BOB_REVIVE_ADDRESS = '0x41dccbd49b26c50d34355ed86ff0fa9e489d1e01'

export type ContractEventIndexRow = {
  blockHash: string
  blockNumber: number
  contract: string
  contractAddress: string
  data: string
  details: string
  event: string
  eventIndex: number
}

export type ContractEventsIndexResult = {
  bestBlock: number
  blockFrom: number
  blockTo: number
  events: ContractEventIndexRow[]
}

type LoadContractEventsOptions = {
  blockFrom?: number
  blockTo?: number
}

type EventContractConfig = {
  address: string
  label: string
  metadata: LooseContractMetadata
}

function resolveCaller() {
  return deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
}

function normalizeHexAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function normalizeBlockNumber(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.floor(value))
}

function addKnownAddress(labels: Map<string, string>, address: string | undefined, label: string) {
  const normalizedAddress = normalizeHexAddress(address)

  if (normalizedAddress) {
    labels.set(normalizedAddress, label)
  }
}

function buildKnownAddressLabels() {
  const labels = new Map<string, string>()

  addKnownAddress(labels, ALICE_REVIVE_ADDRESS, 'Alice')
  addKnownAddress(labels, BOB_REVIVE_ADDRESS, 'Bob')
  addKnownAddress(labels, deploymentConfig.contracts.portfolio, 'Portfolio')
  addKnownAddress(labels, deploymentConfig.contracts.portfolioManager, 'Portfolio Manager')
  addKnownAddress(labels, deploymentConfig.contracts.registry, 'Registry')
  addKnownAddress(labels, deploymentConfig.contracts.dex, 'DEX')
  addKnownAddress(labels, deploymentConfig.contracts.w3piToken, 'W3PI Token')
  addKnownAddress(labels, deploymentConfig.contracts.usdcToken, 'USDC Token')
  addKnownAddress(labels, deploymentConfig.contracts.oracle, 'Oracle')
  addKnownAddress(labels, deploymentConfig.contracts.staking, 'Staking')
  addKnownAddress(labels, deploymentConfig.contracts.wdotToken, 'WDOT Token')
  addKnownAddress(labels, deploymentConfig.contracts.wpolyxToken, 'WPOLYX Token')

  return labels
}

function annotateKnownAddress(value: string, knownAddressLabels: Map<string, string>) {
  const normalizedValue = normalizeHexAddress(value)

  if (!normalizedValue || !/^0x[0-9a-f]{40}$/.test(normalizedValue)) {
    return value
  }

  const label = knownAddressLabels.get(normalizedValue)

  return label ? `${value}/${label}` : value
}

function toEventFieldMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function formatEventValue(value: unknown, knownAddressLabels: Map<string, string>) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return annotateKnownAddress(value, knownAddressLabels)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value && typeof value === 'object' && 'toString' in value) {
    const text = value.toString()

    if (text !== '[object Object]') {
      return annotateKnownAddress(text, knownAddressLabels)
    }
  }

  return undefined
}

function getEventField(fields: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (fields[name] !== undefined) {
      return fields[name]
    }
  }

  return undefined
}

function describeTokenContextEvent(value: unknown, knownAddressLabels: Map<string, string>) {
  const fields = toEventFieldMap(value)

  if (!fields) {
    return undefined
  }

  const details = [
    ['token', getEventField(fields, ['token_id'])],
    ['address', getEventField(fields, ['token_addr'])],
    ['price', getEventField(fields, ['price'])],
    ['holding', getEventField(fields, ['holding_amount'])],
    ['target', getEventField(fields, ['holding_target_weight_bp', 'holdong_target_weight_bp'])],
    ['last rebalance', getEventField(fields, ['holding_last_rebalance', 'holdong_last_rebalance'])],
    ['fees', getEventField(fields, ['holding_fees_collected'])],
  ].flatMap(([label, fieldValue]) => {
    const formattedValue = formatEventValue(fieldValue, knownAddressLabels)

    if (formattedValue === undefined) {
      return []
    }

    if (label === 'target') {
      return [`${label} ${formattedValue}bp`]
    }

    return [`${label} ${formattedValue}`]
  })

  return details.join(' · ')
}

function describeSellEvent(value: unknown, knownAddressLabels: Map<string, string>) {
  const fields = toEventFieldMap(value)

  if (!fields) {
    return undefined
  }

  const details = [
    ['seller', getEventField(fields, ['seller'])],
    ['W3PI amount', getEventField(fields, ['w3pi_amount'])],
    ['supply', getEventField(fields, ['supply'])],
    ['percentage', getEventField(fields, ['pct'])],
  ].flatMap(([label, fieldValue]) => {
    const formattedValue = formatEventValue(fieldValue, knownAddressLabels)

    if (formattedValue === undefined) {
      return []
    }

    if (label === 'percentage') {
      return [`${label} ${formattedValue}bp`]
    }

    return [`${label} ${formattedValue}`]
  })

  return details.join(' · ')
}

function describeGenericEvent(value: unknown, knownAddressLabels: Map<string, string>) {
  const fields = toEventFieldMap(value)

  if (!fields) {
    return ''
  }

  return Object.entries(fields)
    .slice(0, 4)
    .flatMap(([label, fieldValue]) => {
      const formattedValue = formatEventValue(fieldValue, knownAddressLabels)

      return formattedValue === undefined ? [] : [`${label} ${formattedValue}`]
    })
    .join(' · ')
}

function describeEventData(eventName: string, value: unknown, knownAddressLabels: Map<string, string>) {
  if (eventName === 'TokenContext') {
    return describeTokenContextEvent(value, knownAddressLabels) ?? describeGenericEvent(value, knownAddressLabels)
  }

  if (eventName === 'SellEvent') {
    return describeSellEvent(value, knownAddressLabels) ?? describeGenericEvent(value, knownAddressLabels)
  }

  return describeGenericEvent(value, knownAddressLabels)
}

function stringifyEventData(value: unknown, knownAddressLabels: Map<string, string>) {
  return JSON.stringify(
    value ?? {},
    (_key, nestedValue) => {
      if (typeof nestedValue === 'string') {
        return annotateKnownAddress(nestedValue, knownAddressLabels)
      }

      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString()
      }

      if (nestedValue && typeof nestedValue === 'object' && 'toString' in nestedValue) {
        const text = nestedValue.toString()

        if (text !== '[object Object]') {
          return annotateKnownAddress(text, knownAddressLabels)
        }
      }

      return nestedValue
    },
    2,
  )
}

function compareEventRows(left: ContractEventIndexRow, right: ContractEventIndexRow) {
  return left.blockNumber - right.blockNumber || left.eventIndex - right.eventIndex
}

function buildContractConfigs(): EventContractConfig[] {
  const configs = [
    {
      address: deploymentConfig.contracts.portfolio,
      label: 'Portfolio',
      metadata: portfolioMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.portfolioManager,
      label: 'Portfolio Manager',
      metadata: portfolioManagerMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.registry,
      label: 'Registry',
      metadata: registryMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.dex,
      label: 'DEX',
      metadata: dexMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.w3piToken,
      label: 'W3PI Token',
      metadata: tokenMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.usdcToken,
      label: 'USDC Token',
      metadata: tokenMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.wdotToken,
      label: 'WDOT Token',
      metadata: tokenMetadata as LooseContractMetadata,
    },
    {
      address: deploymentConfig.contracts.wpolyxToken,
      label: 'WPOLYX Token',
      metadata: tokenMetadata as LooseContractMetadata,
    },
  ]

  return configs.flatMap((config) =>
    config.address
      ? [
          {
            address: config.address,
            label: config.label,
            metadata: config.metadata,
          },
        ]
      : [],
  )
}

export async function loadContractEventsIndex(
  options: LoadContractEventsOptions = {},
): Promise<ContractEventsIndexResult> {
  const caller = resolveCaller()
  const client = await getDedotReadClient()

  const best = await client.block.best()
  const bestBlock = Number(best.number)
  const blockFrom = normalizeBlockNumber(options.blockFrom, 1)
  const blockTo = Math.min(normalizeBlockNumber(options.blockTo, bestBlock), bestBlock)
  const scanFrom = Math.min(blockFrom, blockTo)
  const scanTo = Math.max(blockFrom, blockTo)
  const knownAddressLabels = buildKnownAddressLabels()
  const contracts = buildContractConfigs().map((config) => ({
    address: normalizeHexAddress(config.address) ?? config.address,
    contract: new Contract(client, config.metadata, config.address, {
      defaultCaller: caller,
    }),
    label: config.label,
  }))
  const events: ContractEventIndexRow[] = []

  for (let blockNumber = scanFrom; blockNumber <= scanTo; blockNumber += 1) {
    const blockHash = await client.rpc.chain_getBlockHash(blockNumber)

    if (!blockHash) {
      continue
    }

    const clientAtBlock = await client.at(blockHash)
    const records = await clientAtBlock.query.system.events()

    records.forEach((record, eventIndex) => {
      for (const config of contracts) {
        try {
          const event = config.contract.decodeEvent(record)
          const eventData = 'data' in event ? event.data : undefined

          events.push({
            blockHash,
            blockNumber,
            contract: config.label,
            contractAddress: config.address,
            data: stringifyEventData(eventData, knownAddressLabels),
            details: describeEventData(event.name, eventData, knownAddressLabels),
            event: event.name,
            eventIndex,
          })
        } catch {
          // The system event belongs to another pallet/contract.
        }
      }
    })
  }

  return {
    bestBlock,
    blockFrom: scanFrom,
    blockTo: scanTo,
    events: events.sort(compareEventRows),
  }
}
