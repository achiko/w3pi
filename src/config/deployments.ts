import type { ContractDeployment } from 'typink'
import tokenMetadata from '../../abis/token.json'
import oracleMetadata from '../../abis/oracle.json'
import registryMetadata from '../../abis/registry.json'
import portfolioMetadata from '../../abis/portfolio.json'
import portfolioManagerMetadata from '../../abis/portfolio_manager.json'
import stakingMetadata from '../../abis/staking.json'
import dexMetadata from '../../abis/dex.json'
import { deploymentConfig } from '@/config/contracts'
import { W3PI_NETWORK_ID } from '@/config/network'

function createDeployment(
  id: string,
  address: string,
  metadata: ContractDeployment['metadata'],
): ContractDeployment | null {
  if (!address) {
    return null
  }

  return {
    id,
    address,
    metadata,
    network: W3PI_NETWORK_ID,
  }
}

export const contractDeployments = [
  createDeployment('w3piToken', deploymentConfig.contracts.w3piToken, tokenMetadata),
  createDeployment('usdcToken', deploymentConfig.contracts.usdcToken, tokenMetadata),
  createDeployment('oracle', deploymentConfig.contracts.oracle, oracleMetadata),
  createDeployment('registry', deploymentConfig.contracts.registry, registryMetadata),
  createDeployment('dex', deploymentConfig.contracts.dex, dexMetadata),
  createDeployment('portfolio', deploymentConfig.contracts.portfolio, portfolioMetadata),
  createDeployment('portfolioManager', deploymentConfig.contracts.portfolioManager, portfolioManagerMetadata),
  createDeployment('staking', deploymentConfig.contracts.staking, stakingMetadata),
].filter((deployment): deployment is ContractDeployment => Boolean(deployment))
