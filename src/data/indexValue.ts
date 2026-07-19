import { Contract } from 'dedot/contracts'
import portfolioMetadata from '../../abis/portfolio.json'
import { deploymentConfig } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'
import type { PortfolioContractApi } from '@/contracts/portfolio'
import type { PortfolioError } from '@/contracts/portfolio/types'

// TODO: move to config file
const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

export type IndexValueSummary = {
  currentValue: string
  baseValue: string
  performanceBp: number
  lastUpdated: string
  trackingEnabled: boolean
  stale: boolean
}

type IndexSummaryResult =
  | {
      isOk: true
      isErr?: false
      value: [bigint, bigint, number, bigint]
    }
  | {
      isOk?: false
      isErr: true
      err: PortfolioError
    }

type LoadIndexValueSummaryOptions = {
  caller?: string
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

  return 'Unable to load index value'
}

export async function loadIndexValueSummary(
  options: LoadIndexValueSummaryOptions = {},
): Promise<IndexValueSummary> {
  const portfolioAddress = requireValue(deploymentConfig.contracts.portfolio, 'VITE_PORTFOLIO_ADDRESS')
  const caller = resolveCaller(options.caller)

  try {
    const client = await getDedotReadClient()
    const portfolio = new Contract<PortfolioContractApi>(client, portfolioMetadata, portfolioAddress, {
      defaultCaller: caller,
    })

    const [summaryResult, trackingResult, staleResult] = await Promise.all([
      portfolio.query.getIndexSummary(),
      portfolio.query.isIndexTrackingEnabled(),
      portfolio.query.isIndexValueStale(),
    ])
    const summary = summaryResult.data as IndexSummaryResult

    console.log("index value Summary ============");
    console.log(summary)

    if (!summary.isOk) {
      throw new Error(`Unable to load index summary: ${summary.err}`)
    }

    const [currentValue, baseValue, performanceBp, lastUpdated] = summary.value

    return {
      currentValue: currentValue.toString(),
      baseValue: baseValue.toString(),
      performanceBp,
      lastUpdated: lastUpdated.toString(),
      trackingEnabled: trackingResult.data,
      stale: staleResult.data,
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
