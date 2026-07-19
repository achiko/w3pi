import { Contract, toEvmAddress } from 'dedot/contracts'
import dexMetadata from '../../abis/dex.json'
import oracleMetadata from '../../abis/oracle.json'
import portfolioMetadata from '../../abis/portfolio.json'
import portfolioManagerMetadata from '../../abis/portfolio_manager.json'
import registryMetadata from '../../abis/registry.json'
import tokenMetadata from '../../abis/token.json'
import { deploymentConfig } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'

const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

export type ContractGetterAdminContractId =
  | 'portfolio'
  | 'portfolio-manager'
  | 'oracle'
  | 'registry'
  | 'dex'
  | 'w3pi-token'
  | 'usdc-token'

export type ContractGetterAdminRow = {
  label: string
  message: string
  value: string
  tone?: 'error' | 'normal'
}

export type ContractGetterAdminArg = {
  label: string
  options?: string[]
  type: string
}

export type ContractGetterAdminSkippedRow = {
  args: ContractGetterAdminArg[]
  message: string
}

export type ContractGetterAdminSection = {
  id: string
  rows: ContractGetterAdminRow[]
  title: string
}

export type ContractGetterAdminDetails = {
  address: string
  contractId: ContractGetterAdminContractId
  label: string
  readCount: number
  sections: ContractGetterAdminSection[]
  skippedRows: ContractGetterAdminSkippedRow[]
}

export type ContractGetterAdminReadArgs = {
  args: Record<string, string>
  caller?: string
  contractId: ContractGetterAdminContractId
  message: string
}

export type ContractGetterAdminReadResult = {
  args: ContractGetterAdminArg[]
  contractId: ContractGetterAdminContractId
  message: string
  rows: ContractGetterAdminRow[]
}

export type ContractGetterAdminMutatingMessage = {
  args: ContractGetterAdminArg[]
  message: string
  methodName: string
}

type ContractMetadataMessage = {
  args?: Array<{
    label?: string
    name?: string
    type?: {
      displayName?: string[]
      type?: number
    }
  }>
  label: string
  mutates?: boolean
}

type ContractMetadata = {
  spec?: {
    messages?: ContractMetadataMessage[]
  }
}

type ContractConfig = {
  address: () => string
  id: ContractGetterAdminContractId
  label: string
  metadata: ContractMetadata
}

type LoadContractGetterAdminDetailsOptions = {
  caller?: string
  contractId: ContractGetterAdminContractId
}

type QueryResult<T> =
  | {
      isOk: true
      isErr?: false
      value: T
    }
  | {
      isOk?: false
      isErr: true
      err: unknown
    }

export const contractGetterAdminNavItems: Array<Pick<ContractConfig, 'id' | 'label'>> = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'portfolio-manager', label: 'Portfolio Manager' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'registry', label: 'Registry' },
  { id: 'dex', label: 'DEX' },
  { id: 'w3pi-token', label: 'W3PI Token' },
  { id: 'usdc-token', label: 'USDC Token' },
]

const CONTRACT_CONFIGS: Record<ContractGetterAdminContractId, ContractConfig> = {
  portfolio: {
    address: () => deploymentConfig.contracts.portfolio,
    id: 'portfolio',
    label: 'Portfolio',
    metadata: portfolioMetadata as ContractMetadata,
  },
  'portfolio-manager': {
    address: () => deploymentConfig.contracts.portfolioManager,
    id: 'portfolio-manager',
    label: 'Portfolio Manager',
    metadata: portfolioManagerMetadata as ContractMetadata,
  },
  oracle: {
    address: () => deploymentConfig.contracts.oracle,
    id: 'oracle',
    label: 'Oracle',
    metadata: oracleMetadata as ContractMetadata,
  },
  registry: {
    address: () => deploymentConfig.contracts.registry,
    id: 'registry',
    label: 'Registry',
    metadata: registryMetadata as ContractMetadata,
  },
  dex: {
    address: () => deploymentConfig.contracts.dex,
    id: 'dex',
    label: 'DEX',
    metadata: dexMetadata as ContractMetadata,
  },
  'w3pi-token': {
    address: () => deploymentConfig.contracts.w3piToken,
    id: 'w3pi-token',
    label: 'W3PI Token',
    metadata: tokenMetadata as ContractMetadata,
  },
  'usdc-token': {
    address: () => deploymentConfig.contracts.usdcToken,
    id: 'usdc-token',
    label: 'USDC Token',
    metadata: tokenMetadata as ContractMetadata,
  },
}

const FIELD_LABELS: Record<string, string[]> = {
  'portfolio:get_index_base_metrics': [
    'index_base_value',
    'base_portfolio_value',
    'deployment_timestamp',
    'index_tracking_enabled',
  ],
  'portfolio:get_index_summary': ['current_index_value', 'index_base_value', 'performance_bp', 'last_index_update'],
  'portfolio:get_portfolio_stats': ['total_tokens', 'total_target_weight', 'remaining_capacity'],
  'portfolio-manager:get_rebalancing_config': [
    'rebalancing_enabled',
    'last_monthly_rebalance',
    'max_monthly_shift_bp',
    'current_month_shift_bp',
  ],
  'portfolio-manager:get_streaming_fee_config': [
    'last_streaming_fee_collection',
    'total_streaming_fees_collected',
    'streaming_fee_interval_ms',
  ],
  'oracle:get_index_validation_contracts': ['registry_contract', 'portfolio_contract'],
  'registry:get_grace_period_limits': ['min_grace_period_ms', 'max_grace_period_ms'],
}

const ARG_OPTIONS: Record<string, string[]> = {
  Role: ['TokenManager', 'TokenUpdater', 'EmergencyController'],
  Tier: ['None', 'Tier1', 'Tier2', 'Tier3', 'Tier4'],
}

function requireValue(value: string, label: string) {
  if (!value) {
    throw new Error(`Missing ${label}`)
  }

  return value
}

function resolveCaller(caller?: string) {
  return caller || deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
}

function normalizeHexAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function normalizeReviveAddress(address: string | undefined) {
  if (!address) {
    return undefined
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return normalizeHexAddress(address)
  }

  try {
    return normalizeHexAddress(toEvmAddress(address))
  } catch {
    return undefined
  }
}

function isAccountUnmappedError(error: unknown) {
  return error instanceof Error && /AccountUnmapped|Revive::AccountUnmapped|map_account|mapAccount/i.test(error.message)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    if (isAccountUnmappedError(error)) {
      return 'Revive account mapping is required for the read-only caller. Set VITE_W3PI_READONLY_CALLER_ADDRESS to a mapped account or call revive.mapAccount for that account.'
    }

    return error.message
  }

  return 'Unable to load contract getters'
}

function upperFirst(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

function normalizeLabelPart(part: string) {
  const pspNormalized = part.replace(/^PSP22/, 'psp22')

  return pspNormalized ? `${pspNormalized[0].toLowerCase()}${pspNormalized.slice(1)}` : pspNormalized
}

function labelToQueryMethod(label: string) {
  return label
    .split('::')
    .flatMap((part) => part.split('_'))
    .filter(Boolean)
    .map((part, index) => {
      const normalizedPart = normalizeLabelPart(part)

      return index === 0 ? normalizedPart : upperFirst(normalizedPart)
    })
    .join('')
}

function getArgTypeName(arg: NonNullable<ContractMetadataMessage['args']>[number]) {
  return arg.type?.displayName?.at(-1) ?? arg.type?.displayName?.[0] ?? 'unknown'
}

function getMessageArgs(message: ContractMetadataMessage): ContractGetterAdminArg[] {
  return (message.args ?? []).map((arg) => {
    const type = getArgTypeName(arg)

    return {
      label: arg.label ?? arg.name ?? 'arg',
      options: ARG_OPTIONS[type],
      type,
    }
  })
}

function isResult(value: unknown): value is QueryResult<unknown> {
  return Boolean(value && typeof value === 'object' && ('isOk' in value || 'isErr' in value))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.getPrototypeOf(value) === Object.prototype
}

function keyToLabel(key: string) {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
}

function normalizeSerializable(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value === undefined) {
    return 'None'
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeSerializable(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [keyToLabel(key), normalizeSerializable(item)]),
    )
  }

  return value
}

function stringifyValue(value: unknown) {
  if (value === undefined || value === null) {
    return 'None'
  }

  if (typeof value === 'bigint' || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value.toString()
  }

  return JSON.stringify(normalizeSerializable(value))
}

function row(message: string, label: string, value: unknown, tone?: ContractGetterAdminRow['tone']): ContractGetterAdminRow {
  return {
    label,
    message,
    tone,
    value: stringifyValue(value),
  }
}

function rowsForValue(
  contractId: ContractGetterAdminContractId,
  messageLabel: string,
  value: unknown,
): ContractGetterAdminRow[] {
  const fieldLabels = FIELD_LABELS[`${contractId}:${messageLabel}`]

  if (isResult(value)) {
    if (!value.isOk) {
      return [row(messageLabel, 'result', `Err: ${stringifyValue(value.err)}`, 'error')]
    }

    return rowsForValue(contractId, messageLabel, value.value)
  }

  if (Array.isArray(value) && fieldLabels && fieldLabels.length === value.length) {
    return fieldLabels.map((label, index) => row(messageLabel, label, value[index]))
  }

  if (isPlainObject(value)) {
    return Object.entries(value).map(([key, item]) => row(messageLabel, keyToLabel(key), item))
  }

  return [row(messageLabel, 'result', value)]
}

function getReadMessages(metadata: ContractMetadata) {
  return (metadata.spec?.messages ?? []).filter((message) => !message.mutates)
}

function getMutatingMessages(metadata: ContractMetadata) {
  return (metadata.spec?.messages ?? []).filter((message) => message.mutates)
}

function sectionIdForMessage(label: string) {
  if (/PSP22|authorized|owner|pending_owner/i.test(label)) {
    return 'ownership-token'
  }

  if (/index|rebalance|snapshot|moving_average|streaming_fee|fee_collection/i.test(label)) {
    return 'index-operations'
  }

  if (/contract|oracle|staking|dex|portfolio|manager|ref/i.test(label)) {
    return 'references'
  }

  if (/holding|token|tier|pool|weight|grace/i.test(label)) {
    return 'holdings-registry-dex'
  }

  return 'core'
}

const SECTION_TITLES: Record<string, string> = {
  core: 'Core Reads',
  'holdings-registry-dex': 'Holdings, Registry, DEX',
  'index-operations': 'Index And Operations',
  'ownership-token': 'Ownership And Token',
  references: 'Contract References',
}

function groupRows(rows: ContractGetterAdminRow[]): ContractGetterAdminSection[] {
  const groupedRows = new Map<string, ContractGetterAdminRow[]>()

  for (const item of rows) {
    const sectionId = sectionIdForMessage(item.message)
    const sectionRows = groupedRows.get(sectionId) ?? []
    sectionRows.push(item)
    groupedRows.set(sectionId, sectionRows)
  }

  return Array.from(groupedRows.entries()).map(([id, sectionRows]) => ({
    id,
    rows: sectionRows,
    title: SECTION_TITLES[id] ?? 'Reads',
  }))
}

export function isContractGetterAdminContractId(value: string | undefined): value is ContractGetterAdminContractId {
  return Boolean(value && value in CONTRACT_CONFIGS)
}

function findReadMessage(config: ContractConfig, messageLabel: string) {
  return getReadMessages(config.metadata).find((message) => message.label === messageLabel)
}

export function getContractGetterAdminMutatingMessages(
  contractId: ContractGetterAdminContractId,
): ContractGetterAdminMutatingMessage[] {
  const config = CONTRACT_CONFIGS[contractId]

  return getMutatingMessages(config.metadata).map((message) => ({
    args: getMessageArgs(message),
    message: message.label,
    methodName: labelToQueryMethod(message.label),
  }))
}

export function parseContractGetterAdminArgValues(args: ContractGetterAdminArg[], values: Record<string, string>) {
  return parseContractArgs(args, values)
}

function parseIntegerArg(rawValue: string, label: string) {
  const trimmed = rawValue.trim()

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a non-negative integer`)
  }

  return Number(trimmed)
}

function parseBigIntArg(rawValue: string, label: string) {
  const trimmed = rawValue.trim()

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a non-negative integer`)
  }

  return BigInt(trimmed)
}

function parseVecArg(rawValue: string, label: string) {
  const trimmed = rawValue.trim()

  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  const values = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

  if (!Array.isArray(values)) {
    throw new Error(`${label} must be a comma-separated list or JSON array`)
  }

  return values.map((value, index) => parseIntegerArg(String(value), `${label}[${index}]`))
}

function parseJsonObjectArg(rawValue: string, label: string) {
  let value: unknown

  try {
    value = JSON.parse(rawValue)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object`)
  }

  return value
}

function getStructField(source: Record<string, unknown>, names: string[], label: string) {
  for (const name of names) {
    if (source[name] !== undefined) {
      return source[name]
    }
  }

  throw new Error(`${label} is required`)
}

function parseStructIntegerField(value: unknown, label: string) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`)
    }

    return value
  }

  return parseIntegerArg(String(value), label)
}

function parseStructBigIntField(value: unknown, label: string) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`${label} must be a non-negative integer`)
    }

    return value
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`)
    }

    return BigInt(value)
  }

  return parseBigIntArg(String(value), label)
}

function parseValidationConfigArg(rawValue: string, label: string) {
  const value = parseJsonObjectArg(rawValue, label)

  return {
    maxDeviationBp: parseStructIntegerField(
      getStructField(value, ['maxDeviationBp', 'max_deviation_bp'], `${label}.max_deviation_bp`),
      `${label}.max_deviation_bp`,
    ),
    stalenessThreshold: parseStructBigIntField(
      getStructField(value, ['stalenessThreshold', 'staleness_threshold'], `${label}.staleness_threshold`),
      `${label}.staleness_threshold`,
    ),
    minUpdateInterval: parseStructBigIntField(
      getStructField(value, ['minUpdateInterval', 'min_update_interval'], `${label}.min_update_interval`),
      `${label}.min_update_interval`,
    ),
  }
}

function parseTokenPriceDataArg(rawValue: string, label: string) {
  const value = parseJsonObjectArg(rawValue, label)

  return {
    price: parseStructBigIntField(getStructField(value, ['price'], `${label}.price`), `${label}.price`),
    marketCap: parseStructBigIntField(
      getStructField(value, ['marketCap', 'market_cap'], `${label}.market_cap`),
      `${label}.market_cap`,
    ),
    volume24h: parseStructBigIntField(
      getStructField(value, ['volume24h', 'volume24H', 'volume_24h', 'volume'], `${label}.volume_24h`),
      `${label}.volume_24h`,
    ),
    timestamp: parseStructBigIntField(
      getStructField(value, ['timestamp'], `${label}.timestamp`),
      `${label}.timestamp`,
    ),
    marketDataTimestamp: parseStructBigIntField(
      getStructField(
        value,
        ['marketDataTimestamp', 'market_data_timestamp'],
        `${label}.market_data_timestamp`,
      ),
      `${label}.market_data_timestamp`,
    ),
  }
}

function parseContractArg(arg: ContractGetterAdminArg, rawValue: string) {
  const trimmed = rawValue.trim()

  if (!trimmed) {
    throw new Error(`${arg.label} is required`)
  }

  if (arg.options) {
    if (!arg.options.includes(trimmed)) {
      throw new Error(`${arg.label} must be one of: ${arg.options.join(', ')}`)
    }

    return trimmed
  }

  switch (arg.type) {
    case 'Address': {
      const address = normalizeReviveAddress(trimmed)

      if (!address) {
        throw new Error(`${arg.label} must be a revive H160 or SS58 address`)
      }

      return address
    }
    case 'u8':
    case 'u16':
    case 'u32':
    case 'i8':
    case 'i16':
    case 'i32':
      return parseIntegerArg(trimmed, arg.label)
    case 'u64':
    case 'u128':
    case 'i64':
    case 'i128':
      return parseBigIntArg(trimmed, arg.label)
    case 'bool':
      if (trimmed !== 'true' && trimmed !== 'false') {
        throw new Error(`${arg.label} must be true or false`)
      }

      return trimmed === 'true'
    case 'Vec':
      return parseVecArg(trimmed, arg.label)
    case 'ValidationConfig':
      return parseValidationConfigArg(trimmed, arg.label)
    case 'TokenPriceData':
      return parseTokenPriceDataArg(trimmed, arg.label)
    default:
      return trimmed
  }
}

function parseContractArgs(args: ContractGetterAdminArg[], values: Record<string, string>) {
  return args.map((arg) => parseContractArg(arg, values[arg.label] ?? ''))
}

async function createContractGetterClient() {
  return getDedotReadClient()
}

export async function loadContractGetterAdminDetails(
  options: LoadContractGetterAdminDetailsOptions,
): Promise<ContractGetterAdminDetails> {
  const config = CONTRACT_CONFIGS[options.contractId]
  const contractAddress = requireValue(config.address(), `address for ${config.label}`)
  const caller = resolveCaller(options.caller)
  const normalizedAddress = normalizeHexAddress(contractAddress) ?? contractAddress
  const readMessages = getReadMessages(config.metadata)
  const callableMessages = readMessages.filter((message) => getMessageArgs(message).length === 0)
  const skippedRows = readMessages
    .filter((message) => getMessageArgs(message).length > 0)
    .map((message) => ({
      args: getMessageArgs(message),
      message: message.label,
    }))
  try {
    const client = await createContractGetterClient()

    const contract = new Contract(client, config.metadata as never, normalizedAddress, {
      defaultCaller: caller,
    })
    const query = contract.query as Record<string, () => Promise<{ data: unknown }>>
    const rows: ContractGetterAdminRow[] = []

    for (const message of callableMessages) {
      const methodName = labelToQueryMethod(message.label)
      const method = query[methodName]

      if (typeof method !== 'function') {
        rows.push(row(message.label, 'result', `Query method unavailable: ${methodName}`, 'error'))
        continue
      }

      try {
        const result = await method()
        rows.push(...rowsForValue(config.id, message.label, result.data))
      } catch (error) {
        rows.push(row(message.label, 'result', getErrorMessage(error), 'error'))
      }
    }

    return {
      address: normalizedAddress,
      contractId: config.id,
      label: config.label,
      readCount: callableMessages.length,
      sections: groupRows(rows),
      skippedRows,
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

export async function runContractGetterAdminRead(
  options: ContractGetterAdminReadArgs,
): Promise<ContractGetterAdminReadResult> {
  const config = CONTRACT_CONFIGS[options.contractId]
  const message = findReadMessage(config, options.message)

  if (!message) {
    throw new Error(`Unknown read message: ${options.message}`)
  }

  if (message.mutates) {
    throw new Error(`Refusing to run mutating message: ${options.message}`)
  }

  const messageArgs = getMessageArgs(message)
  const contractArgs = parseContractArgs(messageArgs, options.args)
  const contractAddress = requireValue(config.address(), `address for ${config.label}`)
  const caller = resolveCaller(options.caller)
  const normalizedAddress = normalizeHexAddress(contractAddress) ?? contractAddress
  try {
    const client = await createContractGetterClient()

    const contract = new Contract(client, config.metadata as never, normalizedAddress, {
      defaultCaller: caller,
    })
    const query = contract.query as Record<string, (...args: unknown[]) => Promise<{ data: unknown }>>
    const methodName = labelToQueryMethod(message.label)
    const method = query[methodName]

    if (typeof method !== 'function') {
      throw new Error(`Query method unavailable: ${methodName}`)
    }

    const result = await method(...contractArgs)

    return {
      args: messageArgs,
      contractId: config.id,
      message: message.label,
      rows: rowsForValue(config.id, message.label, result.data),
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
