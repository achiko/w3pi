import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import {
  loadIndexValueSummary,
  type IndexValueSummary,
} from '@/data/indexValue'
import {
  loadHeaderTokenBalances,
  type HeaderTokenBalance,
} from '@/data/headerTokenBalances'
import {
  loadContractEventsIndex,
  type ContractEventsIndexResult,
} from '@/data/contractEvents'
import {
  loadContractGetterAdminDetails,
  runContractGetterAdminRead,
  type ContractGetterAdminContractId,
  type ContractGetterAdminDetails,
  type ContractGetterAdminReadArgs,
  type ContractGetterAdminReadResult,
  type ContractGetterAdminRow,
  type ContractGetterAdminSection,
  type ContractGetterAdminSkippedRow,
} from '@/data/contractGetterAdmin'
import {
  loadTokenExecutionContexts,
  type RegisteredTokenDiagnostic,
  type TokenExecutionContext,
  type TokenExecutionContextsResult,
} from '@/data/tokenExecutionContexts'
import {
  type AdminTokenSummary,
  loadTokenAdminSummary,
  type PortfolioAdminSummary,
  type TokenAdminSummary,
} from '@/data/tokenAdmin'

type PortfolioApiError = {
  message: string
}

type TokenExecutionContextsArg =
  | {
      caller?: string
    }
  | undefined

type TokenAdminSummaryArg = {
  caller?: string
  connectedAddress: string
}

type HeaderTokenBalancesArg =
  | {
      caller?: string
      connectedAddress?: string
    }
  | undefined

type ContractEventsIndexArg =
  | {
      blockFrom?: number
      blockTo?: number
    }
  | undefined

type ContractGetterAdminArg = {
  caller?: string
  contractId: ContractGetterAdminContractId
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unable to load portfolio token contexts'
}

export const portfolioApi = createApi({
  reducerPath: 'portfolioApi',
  baseQuery: fakeBaseQuery<PortfolioApiError>(),
  endpoints: (builder) => ({
    getTokenExecutionContexts: builder.query<TokenExecutionContextsResult, TokenExecutionContextsArg>({
      queryFn: async (arg) => {
        try {
          const data = await loadTokenExecutionContexts({ caller: arg?.caller })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    getIndexValueSummary: builder.query<IndexValueSummary, TokenExecutionContextsArg>({
      queryFn: async (arg) => {
        try {
          const data = await loadIndexValueSummary({ caller: arg?.caller })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    getContractGetterAdminDetails: builder.query<ContractGetterAdminDetails, ContractGetterAdminArg>({
      queryFn: async (arg) => {
        try {
          const data = await loadContractGetterAdminDetails({
            caller: arg.caller,
            contractId: arg.contractId,
          })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    runContractGetterAdminRead: builder.mutation<ContractGetterAdminReadResult, ContractGetterAdminReadArgs>({
      queryFn: async (arg) => {
        try {
          const data = await runContractGetterAdminRead(arg)
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    getTokenAdminSummary: builder.query<TokenAdminSummary, TokenAdminSummaryArg>({
      keepUnusedDataFor: 120,
      queryFn: async (arg) => {
        try {
          const data = await loadTokenAdminSummary({
            caller: arg.caller,
            connectedAddress: arg.connectedAddress,
          })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    getHeaderTokenBalances: builder.query<HeaderTokenBalance[], HeaderTokenBalancesArg>({
      queryFn: async (arg) => {
        try {
          const data = await loadHeaderTokenBalances({
            caller: arg?.caller,
            connectedAddress: arg?.connectedAddress,
          })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
    getContractEventsIndex: builder.query<ContractEventsIndexResult, ContractEventsIndexArg>({
      queryFn: async (arg) => {
        try {
          const data = await loadContractEventsIndex({
            blockFrom: arg?.blockFrom,
            blockTo: arg?.blockTo,
          })
          return { data }
        } catch (error) {
          return {
            error: {
              message: getErrorMessage(error),
            },
          }
        }
      },
    }),
  }),
})

export const {
  useGetContractEventsIndexQuery,
  useGetContractGetterAdminDetailsQuery,
  useGetHeaderTokenBalancesQuery,
  useGetIndexValueSummaryQuery,
  useGetTokenAdminSummaryQuery,
  useGetTokenExecutionContextsQuery,
  useRunContractGetterAdminReadMutation,
} = portfolioApi
export type {
  AdminTokenSummary,
  ContractGetterAdminContractId,
  ContractGetterAdminDetails,
  ContractGetterAdminReadArgs,
  ContractGetterAdminReadResult,
  ContractGetterAdminRow,
  ContractGetterAdminSection,
  ContractGetterAdminSkippedRow,
  ContractEventsIndexResult,
  HeaderTokenBalance,
  IndexValueSummary,
  PortfolioAdminSummary,
  RegisteredTokenDiagnostic,
  TokenAdminSummary,
  TokenExecutionContext,
  TokenExecutionContextsResult,
}
