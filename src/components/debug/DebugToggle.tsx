import { useState, useEffect } from 'preact/hooks';
import { debugStore } from '../../lib/debug/debug-store';

export default function DebugToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    return debugStore.subscribe((_, isEnabled) => setEnabled(isEnabled));
  }, []);

  const toggle = () => {
    if (enabled) debugStore.disable();
    else debugStore.enable();
  };

  return (
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 20px;margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:4px;">
            Panneau de debug
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.4;">
            Affiche un panneau flottant sur toutes les pages avec les logs internes
            (wizard, authentification…). Désactiver quand le problème est résolu.
          </div>
        </div>
        <button
          onClick={toggle}
          style={`flex-shrink:0;min-width:52px;height:28px;border-radius:14px;border:none;cursor:pointer;transition:background 0.2s;position:relative;${
            enabled
              ? 'background:#7c3aed;'
              : 'background:rgba(255,255,255,0.12);'
          }`}
          role="switch"
          aria-checked={enabled}
        >
          <span style={`position:absolute;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left 0.2s;${enabled ? 'left:27px;' : 'left:3px;'}`} />
        </button>
      </div>
      {enabled && (
        <div style="margin-top:12px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;">
          <span style="font-size:11.5px;color:#fbbf24;">
            ✓ Actif — un panneau 🐛 DEBUG apparaît en bas de chaque page. Tap dessus pour l'ouvrir.
          </span>
        </div>
      )}
    </div>
  );
}
