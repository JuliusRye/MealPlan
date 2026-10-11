import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shows a banner when a new service worker is waiting to take over. */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div className="update-prompt" role="alert">
      <span>A new version is available.</span>
      <button type="button" className="primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  )
}
