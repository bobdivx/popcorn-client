import { useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { Modal } from '../ui/Modal';

const COOKIE_EDITOR_CHROME = 'https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm';
const COOKIE_EDITOR_FIREFOX = 'https://addons.mozilla.org/firefox/addon/cookie-editor/';

interface CookieWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CookieWizardModal({ isOpen, onClose }: CookieWizardModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'simple' | 'manual'>('simple');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('indexersManager.cookieWizard.title')}
      size="xl"
    >
      <div class="space-y-6">
        {/* Onglets */}
        <div class="flex gap-2 border-b border-white/10 pb-2">
          <button
            type="button"
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'simple'
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => setTab('simple')}
          >
            {t('indexersManager.cookieWizard.tabSimple')}
          </button>
          <button
            type="button"
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'manual'
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => setTab('manual')}
          >
            {t('indexersManager.cookieWizard.tabManual')}
          </button>
        </div>

        {tab === 'simple' && (
          <div class="space-y-4">
            <p class="text-gray-300 text-sm">{t('indexersManager.cookieWizard.simpleIntro')}</p>
            <ol class="list-decimal list-inside space-y-2 text-gray-300 text-sm">
              <li>{t('indexersManager.cookieWizard.simpleStep1')}</li>
              <li>{t('indexersManager.cookieWizard.simpleStep2')}</li>
              <li>{t('indexersManager.cookieWizard.simpleStep3')}</li>
              <li>{t('indexersManager.cookieWizard.simpleStep4')}</li>
            </ol>
            <div class="rounded-lg border border-primary-500/50 bg-primary-500/10 p-4">
              <p class="text-sm text-white font-medium mb-2">{t('indexersManager.cookieWizard.extensionName')}</p>
              <div class="flex flex-wrap items-center gap-3">
                <a
                  href={COOKIE_EDITOR_CHROME}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-block px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium"
                >
                  {t('indexersManager.cookieWizard.extensionChrome')}
                </a>
                <a
                  href={COOKIE_EDITOR_FIREFOX}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-block px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium"
                >
                  {t('indexersManager.cookieWizard.extensionFirefox')}
                </a>
              </div>
              <p class="text-xs text-gray-400 mt-2">{t('indexersManager.cookieWizard.extensionNote')}</p>
            </div>
          </div>
        )}

        {tab === 'manual' && (
          <div class="space-y-6">
            <p class="text-gray-300 text-sm">{t('indexersManager.cookieWizard.manualIntro')}</p>

            {/* Étape 1 */}
            <div class="rounded-lg border border-white/10 bg-black/20 p-4">
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">1</div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-white font-medium mb-1">{t('indexersManager.cookieWizard.manualStep1Title')}</h4>
                  <p class="text-gray-400 text-sm mb-3">{t('indexersManager.cookieWizard.manualStep1Text')}</p>
                  <div class="aspect-video max-w-md rounded bg-gray-800/80 flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-600">
                    {t('indexersManager.cookieWizard.screenshotPlaceholder')}
                  </div>
                </div>
              </div>
            </div>

            {/* Étape 2 */}
            <div class="rounded-lg border border-white/10 bg-black/20 p-4">
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">2</div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-white font-medium mb-1">{t('indexersManager.cookieWizard.manualStep2Title')}</h4>
                  <p class="text-gray-400 text-sm mb-3">{t('indexersManager.cookieWizard.manualStep2Text')}</p>
                  <div class="aspect-video max-w-md rounded bg-gray-800/80 flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-600">
                    {t('indexersManager.cookieWizard.screenshotPlaceholder')}
                  </div>
                </div>
              </div>
            </div>

            {/* Étape 3 */}
            <div class="rounded-lg border border-white/10 bg-black/20 p-4">
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">3</div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-white font-medium mb-1">{t('indexersManager.cookieWizard.manualStep3Title')}</h4>
                  <p class="text-gray-400 text-sm mb-3">{t('indexersManager.cookieWizard.manualStep3Text')}</p>
                  <div class="aspect-video max-w-md rounded bg-gray-800/80 flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-600">
                    {t('indexersManager.cookieWizard.screenshotPlaceholder')}
                  </div>
                </div>
              </div>
            </div>

            {/* Étape 4 */}
            <div class="rounded-lg border border-white/10 bg-black/20 p-4">
              <div class="flex gap-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">4</div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-white font-medium mb-1">{t('indexersManager.cookieWizard.manualStep4Title')}</h4>
                  <p class="text-gray-400 text-sm">{t('indexersManager.cookieWizard.manualStep4Text')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
