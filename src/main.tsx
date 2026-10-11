import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import UpdatePrompt from './components/UpdatePrompt'
import { requestPersistentStorage } from './logic/storage'
import './styles.css'

requestPersistentStorage().catch(() => {
  // Best effort: the app still works if the browser refuses or errors.
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
