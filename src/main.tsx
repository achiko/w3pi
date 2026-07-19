import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from './App'
import { W3piTypinkProvider } from './providers/W3piTypinkProvider'
import { store } from './store'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <W3piTypinkProvider>
        <App />
      </W3piTypinkProvider>
    </Provider>
  </StrictMode>,
)
