export type TransactionErrorContext = {
  account?: string
  args?: unknown[]
  contract?: string
  method?: string
  network?: string
  payload?: unknown
  requestedTxOptions?: unknown
  stage?: string
  txOptions?: unknown
}

export type TransactionErrorDetails = {
  cause?: string
  code?: string
  context?: string
  data?: string
  message: string
  name: string
  payload?: string
  stack?: string
  timestamp: string
}

const recordedDetails = new WeakMap<object, TransactionErrorDetails>()

function serializeValue(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  const ancestors: object[] = []

  try {
    return JSON.stringify(
      value,
      function (this: unknown, _key, nestedValue: unknown) {
        if (typeof nestedValue === 'bigint') {
          return `${nestedValue.toString()}n`
        }

        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
          }
        }

        if (nestedValue && typeof nestedValue === 'object') {
          while (
            ancestors.length > 0 &&
            ancestors[ancestors.length - 1] !== this
          ) {
            ancestors.pop()
          }

          if (ancestors.includes(nestedValue)) {
            return '[Circular]'
          }

          ancestors.push(nestedValue)
        }

        return nestedValue
      },
      2,
    )
  } catch {
    return String(value)
  }
}

function readProperty(error: object, property: string) {
  return property in error ? (error as Record<string, unknown>)[property] : undefined
}

export function getTransactionErrorDetails(
  error: unknown,
  context?: TransactionErrorContext,
): TransactionErrorDetails {
  const { payload, ...transactionContext } = context ?? {}

  if (error && typeof error === 'object') {
    const recorded = recordedDetails.get(error)

    if (recorded && !context) {
      return recorded
    }

    const message = readProperty(error, 'message')
    const name = readProperty(error, 'name')
    const code = readProperty(error, 'code')
    const data = readProperty(error, 'data')
    const cause = readProperty(error, 'cause')
    const stack = readProperty(error, 'stack')

    return {
      timestamp: new Date().toISOString(),
      name: typeof name === 'string' ? name : 'TransactionError',
      message: typeof message === 'string' ? message : String(error),
      code: code === undefined ? undefined : String(code),
      data: serializeValue(data),
      cause: serializeValue(cause),
      stack: typeof stack === 'string' ? stack : undefined,
      context: serializeValue(transactionContext),
      payload: serializeValue(payload),
    }
  }

  return {
    timestamp: new Date().toISOString(),
    name: 'TransactionError',
    message: error === undefined ? 'Unknown transaction error' : String(error),
    context: serializeValue(transactionContext),
    payload: serializeValue(payload),
  }
}

export function recordTransactionError(
  error: Error,
  context: TransactionErrorContext,
) {
  const details = getTransactionErrorDetails(error, context)
  recordedDetails.set(error, details)

  console.error('[W3PI transaction error]', {
    details,
    rawError: error,
  })

  return details
}

export function formatTransactionErrorReport(details: TransactionErrorDetails) {
  const { payload, ...errorDetails } = details
  let context: unknown = errorDetails.context

  if (errorDetails.context) {
    try {
      context = JSON.parse(errorDetails.context)
    } catch {
      // Keep non-JSON context as its original text.
    }
  }

  return [
    'Payload:',
    payload ?? 'Signing payload was not available because the failure occurred before wallet signing.',
    '',
    'Error:',
    JSON.stringify({ ...errorDetails, context }, null, 2),
  ].join('\n')
}
