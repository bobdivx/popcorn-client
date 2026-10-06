import { Settings } from 'lucide-preact';
import { useState } from 'preact/hooks';
import type { CarPlaybackMode, CarPlaybackSettings, CarPlaybackType } from './carPlaybackTypes';
import { CAR_PLAYBACK_TYPES } from './carPlaybackTypes';

interface CarPlaybackTypeSelectorProps {
  settings: CarPlaybackSettings;
  effectiveType: CarPlaybackType;
  isDrive: boolean | null;
  onSettingsChange: (settings: CarPlaybackSettings) => void;
}

export default function CarPlaybackTypeSelector({
  settings,
  effectiveType,
  isDrive,
  onSettingsChange,
}: CarPlaybackTypeSelectorProps) {
  const [showMenu, setShowMenu] = useState(false);

  const driveLabel = isDrive === true ? 'Conduite' : isDrive === false ? 'Parking' : 'Inconnu';

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="tesla-car-ctrl tesla-car-ctrl--ghost"
        onClick={() => setShowMenu(!showMenu)}
        title="Type de lecture"
        aria-label="Type de lecture"
      >
        <Settings className="w-5 h-5" />
        <span className="hidden sm:inline">Type</span>
      </button>

      {showMenu && (
        <div
          className="tesla-car-playback-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '0.75rem',
            minWidth: '22rem',
            maxWidth: '30rem',
            background: 'var(--tesla-surface-2)',
            border: '1px solid var(--tesla-border)',
            borderRadius: 'var(--tesla-radius-lg)',
            padding: '1rem',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.6)',
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--tesla-border)' }}>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>Type de lecture</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--tesla-muted)', lineHeight: 1.35 }}>
              Mode Tesla: <strong>{driveLabel}</strong> • Moteur actif: <strong>{CAR_PLAYBACK_TYPES[effectiveType].label}</strong>
            </p>
          </div>

          {/* Mode Auto / Manuel */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--tesla-muted)' }}>
              Sélection moteur
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onSettingsChange({ ...settings, mode: 'auto' })}
                style={{
                  flex: 1,
                  padding: '0.6rem 1rem',
                  borderRadius: 'var(--tesla-radius)',
                  border: settings.mode === 'auto' ? '2px solid var(--tesla-red)' : '1px solid var(--tesla-border)',
                  background: settings.mode === 'auto' ? 'var(--tesla-red-soft)' : 'var(--tesla-surface)',
                  color: 'inherit',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => onSettingsChange({ ...settings, mode: 'manual' })}
                style={{
                  flex: 1,
                  padding: '0.6rem 1rem',
                  borderRadius: 'var(--tesla-radius)',
                  border: settings.mode === 'manual' ? '2px solid var(--tesla-red)' : '1px solid var(--tesla-border)',
                  background: settings.mode === 'manual' ? 'var(--tesla-red-soft)' : 'var(--tesla-surface)',
                  color: 'inherit',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Manuel
              </button>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--tesla-faint)', lineHeight: 1.3 }}>
              {settings.mode === 'auto'
                ? 'Détection auto Park/Drive → choix optimal automatique'
                : 'Choix manuel → pour A/B tester les moteurs'}
            </p>
          </div>

          {/* Liste des moteurs (actif seulement si Manuel) */}
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--tesla-muted)' }}>
              Moteurs disponibles {settings.mode === 'auto' && <span style={{ fontSize: '0.75rem' }}>(info only)</span>}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.values(CAR_PLAYBACK_TYPES).map((typeInfo) => {
                const isActive = settings.manualType === typeInfo.id;
                const isEffective = effectiveType === typeInfo.id;
                const isDisabled = settings.mode === 'auto';

                return (
                  <button
                    key={typeInfo.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        onSettingsChange({ ...settings, manualType: typeInfo.id });
                      }
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--tesla-radius)',
                      border: isActive && !isDisabled ? '2px solid var(--tesla-red)' : '1px solid var(--tesla-border)',
                      background: isEffective
                        ? 'rgba(60,180,100,0.15)'
                        : isActive && !isDisabled
                        ? 'var(--tesla-red-soft)'
                        : 'var(--tesla-surface)',
                      color: isDisabled ? 'var(--tesla-faint)' : 'inherit',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{typeInfo.label}</span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {isEffective && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '999px',
                              background: 'rgba(60,180,100,0.35)',
                              color: '#8fd9a8',
                              fontWeight: 600,
                            }}
                          >
                            ACTIF
                          </span>
                        )}
                        {typeInfo.driveCompatible ? (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '999px',
                              background: 'rgba(60,180,100,0.2)',
                              color: '#8fd9a8',
                            }}
                          >
                            Drive OK
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '999px',
                              background: 'var(--tesla-red-soft)',
                              color: '#ffb3bc',
                            }}
                          >
                            Park only
                          </span>
                        )}
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--tesla-muted)', lineHeight: 1.3 }}>
                      {typeInfo.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fermer */}
          <button
            type="button"
            onClick={() => setShowMenu(false)}
            style={{
              width: '100%',
              padding: '0.6rem',
              borderRadius: 'var(--tesla-radius)',
              border: '1px solid var(--tesla-border)',
              background: 'var(--tesla-surface)',
              color: 'var(--tesla-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
