import { useState } from 'preact/hooks';
import { useI18n } from '../../../lib/i18n';

interface DisclaimerStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function DisclaimerStep({ focusedButtonIndex, buttonRefs, onNext }: DisclaimerStepProps) {
  const { t } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (isAtBottom) setScrolledToBottom(true);
  };

  const sections = [
    {
      num: '1',
      title: "Nature de l'Application",
      content: "Popcorn Client est un outil technique permettant de se connecter à un serveur distant pour la recherche, le téléchargement et la lecture de contenu multimédia via le protocole BitTorrent. Cette application est fournie \"en l'état\" à des fins éducatives et techniques uniquement.",
    },
    {
      num: '2',
      title: "Responsabilité de l'Utilisateur",
      content: "L'utilisateur est entièrement et exclusivement responsable de tous les contenus qu'il recherche, télécharge, stocke, ou consulte via cette application. Il est de sa seule responsabilité de respecter toutes les lois applicables, les droits de propriété intellectuelle, et de vérifier la légalité de chaque téléchargement.",
    },
    {
      num: '3',
      title: "Non-Responsabilité du Développeur",
      content: "Le développeur décline toute responsabilité concernant le contenu téléchargé, la légalité des actions effectuées, les violations de droits d'auteur, les dommages directs ou indirects, ou la perte de données résultant de l'utilisation de cette application.",
    },
    {
      num: '4',
      title: "Protection des Données",
      content: "Cette application utilise un chiffrement end-to-end pour protéger les données. Le développeur n'a aucun accès aux données personnelles, préférences, ou bibliothèques de contenu. Toutes les communications sont chiffrées et les données sensibles restent sous le contrôle exclusif de l'utilisateur.",
    },
    {
      num: '5',
      title: "Avertissement Légal",
      content: "ATTENTION : Le téléchargement et la consultation de contenu protégé par le droit d'auteur sans autorisation peut constituer une violation de la loi dans de nombreuses juridictions. L'utilisateur est seul responsable de s'assurer que ses actions sont légales dans sa juridiction.",
    },
    {
      num: '6',
      title: "Utilisation à Vos Risques",
      content: "Cette application est fournie \"TEL QUELLE\", sans garantie d'aucune sorte. L'utilisateur utilise cette application à ses propres risques.",
    },
  ];

  return (
    <div>
      <style>{`
        .disclaimer-scroll::-webkit-scrollbar { width: 4px; }
        .disclaimer-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 4px; }
        .disclaimer-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }
        .disclaimer-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
        .disclaimer-section {
          display: flex; gap: 14px; padding: 14px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .disclaimer-section:last-child { border-bottom: none; padding-bottom: 0; }
        .disclaimer-num {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #a78bfa;
          flex-shrink: 0; margin-top: 1px;
        }
        .checkbox-custom {
          width: 18px; height: 18px; border-radius: 5px;
          border: 1.5px solid rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.04);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0;
          transition: all 0.15s;
        }
        .checkbox-custom.checked {
          background: #7c3aed;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.2);
        }
      `}</style>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:24px;font-weight:700;color:#fff;margin:0 0 8px;">{t('wizard.disclaimer.title')}</h2>
        <p style="font-size:14px;color:rgba(255,255,255,0.4);margin:0;">
          Lisez attentivement les conditions avant de continuer
        </p>
      </div>

      {/* Scroll container avec hint de progression */}
      <div
        style="position:relative;margin-bottom:20px;"
      >
        <div
          class="disclaimer-scroll"
          style="max-height:340px;overflow-y:auto;padding:16px 20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;"
          onScroll={handleScroll}
        >
          {/* Bannière avertissement */}
          <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:10px;margin-bottom:16px;">
            <svg style="width:16px;height:16px;color:#fbbf24;flex-shrink:0;margin-top:1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p style="font-size:12.5px;color:rgba(251,191,36,0.8);margin:0;line-height:1.5;">
              Cette application est destinée à un usage personnel légal uniquement. L'utilisateur assume l'entière responsabilité de son utilisation.
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.num} class="disclaimer-section">
              <div class="disclaimer-num">{section.num}</div>
              <div>
                <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);margin-bottom:4px;">{section.title}</div>
                <p style="font-size:12.5px;color:rgba(255,255,255,0.45);margin:0;line-height:1.6;">{section.content}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gradient indiquant qu'il y a du contenu en dessous */}
        {!scrolledToBottom && (
          <div style="position:absolute;bottom:0;left:0;right:0;height:48px;background:linear-gradient(to top, rgba(7,7,14,0.9), transparent);border-radius:0 0 12px 12px;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;">
            <span style="font-size:11px;color:rgba(167,139,250,0.6);display:flex;align-items:center;gap:4px;">
              <svg style="width:12px;height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 9l-7 7-7-7" />
              </svg>
              Défiler pour lire
            </span>
          </div>
        )}
      </div>

      {/* Checkbox d'acceptation */}
      <label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer;padding:14px 16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:20px;transition:border-color 0.15s;"
        onClick={() => setAccepted(!accepted)}
      >
        <div class={`checkbox-custom ${accepted ? 'checked' : ''}`}>
          {accepted && (
            <svg style="width:11px;height:11px;color:#fff;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <span style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.5;user-select:none;">
          J'ai lu et j'accepte les termes de ce disclaimer. Je comprends que je suis entièrement responsable de mon utilisation de cette application.
        </span>
      </label>

      {/* Actions */}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <a
          href="/disclaimer"
          target="_blank"
          style="font-size:12.5px;color:rgba(167,139,250,0.6);text-decoration:none;display:flex;align-items:center;gap:4px;"
          onClick={(e) => e.stopPropagation()}
        >
          Lire la version complète
          <svg style="width:12px;height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          class="wizard-btn-primary"
          onClick={onNext}
          disabled={!accepted}
        >
          J'accepte et je continue
          <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
