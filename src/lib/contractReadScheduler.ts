const DEFAULT_MAX_CONCURRENT_READS = 3
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 750

type ContractReadSchedulerOptions = {
  maxAttempts?: number
  maxConcurrentReads?: number
  retryDelayMs?: number
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

function isRateLimitError(error: unknown) {
  return /-32029|rate limit exceeded|too many requests/i.test(getErrorMessage(error))
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

export type ContractReadScheduler = ReturnType<typeof createContractReadScheduler>

export function createContractReadScheduler(options: ContractReadSchedulerOptions = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const maxConcurrentReads = options.maxConcurrentReads ?? DEFAULT_MAX_CONCURRENT_READS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const queue: Array<() => void> = []
  let activeReads = 0

  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be at least 1')
  }

  if (maxConcurrentReads < 1) {
    throw new Error('maxConcurrentReads must be at least 1')
  }

  async function runWithBackoff<T>(read: () => Promise<T>) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await read()
      } catch (error) {
        if (!isRateLimitError(error) || attempt === maxAttempts) {
          throw error
        }

        const exponentialDelay = retryDelayMs * 2 ** (attempt - 1)
        const jitter = Math.floor(Math.random() * Math.max(1, retryDelayMs / 2))
        await wait(exponentialDelay + jitter)
      }
    }

    throw new Error('Contract read retry attempts exhausted')
  }

  function schedule<T>(read: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        activeReads += 1

        void runWithBackoff(read)
          .then(resolve, reject)
          .finally(() => {
            activeReads -= 1
            queue.shift()?.()
          })
      }

      if (activeReads < maxConcurrentReads) {
        start()
      } else {
        queue.push(start)
      }
    })
  }

  return {
    schedule,
  }
}

export const contractReadScheduler = createContractReadScheduler()
