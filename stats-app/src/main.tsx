import React from 'react'
import { HashRouter } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/base.css'
import { App } from './app/App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60000, retry: 1, refetchIntervalInBackground: false },
  },
})

const root = document.getElementById('root')

if (!root) throw new Error('Missing dashboard root')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
