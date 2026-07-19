import { useLayoutEffect, type PropsWithChildren } from 'react'
import { paseoAssetHub, TypinkProvider, useTypink } from 'typink'
import { contractDeployments } from '@/config/deployments'
import { supportedNetworks, W3PI_NETWORK_ID } from '@/config/network'
import { installPaseoSignedExtensions } from '@/config/paseoSignedExtensions'

function PaseoSignedExtensionsInstaller() {
  const { client, network } = useTypink()

  useLayoutEffect(() => {
    if (client && network.id === paseoAssetHub.id) {
      installPaseoSignedExtensions(client)
    }
  }, [client, network.id])

  return null
}

export function W3piTypinkProvider({ children }: PropsWithChildren) {
  return (
    <TypinkProvider
      appName="W3PI Investor App"
      cacheMetadata
      defaultNetworkId={W3PI_NETWORK_ID}
      deployments={contractDeployments}
      supportedNetworks={supportedNetworks}
    >
      <PaseoSignedExtensionsInstaller />
      {children}
    </TypinkProvider>
  )
}
