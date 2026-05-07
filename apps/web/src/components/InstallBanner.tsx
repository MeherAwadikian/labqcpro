import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('pwa-install-dismissed') === '1'
  )

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setPrompt(null)
      dismiss()
    }
  }

  function dismiss() {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', '1')
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 lg:bottom-4 lg:left-auto lg:right-4 lg:w-80">
      <div className="bg-gray-900 border border-brand-700 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">Install LabQC Pro</div>
          <div className="text-xs text-gray-400 mt-0.5">Add to your home screen for offline access and faster loading.</div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={install}
              className="flex-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-gray-500 hover:text-gray-300 py-2 px-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
