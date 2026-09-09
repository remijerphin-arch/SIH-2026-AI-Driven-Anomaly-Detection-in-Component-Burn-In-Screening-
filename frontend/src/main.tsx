import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: '#121a2b',
            border: '1px solid #243049',
            color: '#e8eef6',
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
)
