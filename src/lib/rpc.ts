export function getRpcProviderUrls(...values: Array<string | undefined>) {
  return values
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export function getPrimaryRpcUrl(...values: Array<string | undefined>) {
  return getRpcProviderUrls(...values)[0] ?? ''
}
