import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const DEFAULT_APP_PORT = 5173

function getAppPort(rawPort: string | undefined) {
  const port = Number(rawPort ?? DEFAULT_APP_PORT)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('VITE_W3PI_APP_PORT must be an integer between 1 and 65535')
  }

  return port
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_W3PI_APP_PORT')
  const appPort = getAppPort(env.VITE_W3PI_APP_PORT)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: appPort,
      strictPort: true,
    },
    preview: {
      port: appPort,
      strictPort: true,
    },
  }
})
