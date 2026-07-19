#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_STORE_FILE = 'store.local.json'
const DEFAULT_ENV_FILE = '.env'

const TOP_LEVEL_ENV_KEYS = {
  network: 'VITE_W3PI_RPC_URL',
  deployed_at: 'VITE_W3PI_DEPLOYED_AT',
}

function usage() {
  return `Usage: node scripts/update-env-from-store.mjs [store-json] [env-file] [--dry-run]\n\nDefaults:\n  store-json: ${DEFAULT_STORE_FILE}\n  env-file:    ${DEFAULT_ENV_FILE}`
}

function parseArgs(argv) {
  const args = [...argv]
  const dryRun = args.includes('--dry-run')
  const help = args.includes('--help') || args.includes('-h')
  const positional = args.filter((arg) => arg !== '--dry-run' && arg !== '--help' && arg !== '-h')

  if (help) {
    console.log(usage())
    process.exit(0)
  }

  if (positional.length > 2) {
    throw new Error(`Too many arguments.\n\n${usage()}`)
  }

  return {
    storeFile: positional[0] ?? DEFAULT_STORE_FILE,
    envFile: positional[1] ?? DEFAULT_ENV_FILE,
    dryRun,
  }
}

function contractKeyToEnvKey(contractKey) {
  return `VITE_${contractKey.toUpperCase()}_ADDRESS`
}

function stringifyEnvValue(value) {
  if (value === undefined || value === null) {
    return ''
  }

  return String(value)
}

function buildUpdates(store) {
  const updates = new Map()

  for (const [storeKey, envKey] of Object.entries(TOP_LEVEL_ENV_KEYS)) {
    if (Object.hasOwn(store, storeKey)) {
      updates.set(envKey, stringifyEnvValue(store[storeKey]))
    }
  }

  if (store.contracts && typeof store.contracts === 'object' && !Array.isArray(store.contracts)) {
    for (const [contractKey, address] of Object.entries(store.contracts)) {
      updates.set(contractKeyToEnvKey(contractKey), stringifyEnvValue(address))
    }
  }

  return updates
}

function updateEnvContent(envContent, updates) {
  const seen = new Set()
  const lines = envContent.split(/\r?\n/)

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)

    if (!match) {
      return line
    }

    const [, key] = match

    if (!updates.has(key)) {
      return line
    }

    seen.add(key)
    return `${key}=${updates.get(key)}`
  })

  const missingEntries = [...updates.entries()].filter(([key]) => !seen.has(key))

  if (missingEntries.length > 0) {
    const hasTrailingBlank = updatedLines.at(-1) === ''

    if (!hasTrailingBlank) {
      updatedLines.push('')
    }

    updatedLines.push('# Synced from store.local.json')

    for (const [key, value] of missingEntries) {
      updatedLines.push(`${key}=${value}`)
    }
  }

  return updatedLines.join('\n')
}

async function main() {
  const { storeFile, envFile, dryRun } = parseArgs(process.argv.slice(2))
  const storePath = path.resolve(storeFile)
  const envPath = path.resolve(envFile)

  const store = JSON.parse(await readFile(storePath, 'utf8'))
  const envContent = await readFile(envPath, 'utf8')
  const updates = buildUpdates(store)

  if (updates.size === 0) {
    console.log(`No values found in ${storeFile}`)
    return
  }

  const nextEnvContent = updateEnvContent(envContent, updates)
  const changed = nextEnvContent !== envContent

  if (dryRun) {
    console.log(`Would update ${updates.size} value(s) in ${envFile}:`)
    for (const [key, value] of updates) {
      console.log(`${key}=${value}`)
    }
    console.log(changed ? '\n.env would change.' : '\n.env is already up to date.')
    return
  }

  if (changed) {
    await writeFile(envPath, nextEnvContent, 'utf8')
  }

  console.log(`${changed ? 'Updated' : 'No changes needed for'} ${envFile} from ${storeFile}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
