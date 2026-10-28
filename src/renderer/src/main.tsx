import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { HomeProvider } from './home'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <HomeProvider>
      <App />
    </HomeProvider>
  </StrictMode>
)
