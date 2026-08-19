import { Modal } from './Modal';
import { useI18n } from '../../lib/i18n/useI18n';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style destructif (rouge) pour le bouton confirmer. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal de confirmation TV-friendly (remplace window.confirm). */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useI18n();
  const confirmText = confirmLabel || t('common.confirm') || 'Confirmer';
  const cancelText = cancelLabel || t('common.cancel') || 'Annuler';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm" closeOnBackdropClick>
      <p className="text-[var(--ds-text-secondary)] text-sm sm:text-base whitespace-pre-line mb-6">
        {message}
      </p>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          data-focusable
          tabIndex={0}
            className="px-5 py-2.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-overlay)] transition-[opacity,transform,background-color] duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-400 min-h-[44px]"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-focusable
          tabIndex={0}
          className={`px-5 py-2.5 rounded-lg text-[var(--ds-text-on-accent)] font-medium transition-[opacity,transform,background-color] duration-200 active:scale-95 focus:outline-none focus:ring-2 min-h-[44px] ${
            danger
              ? 'bg-red-600/90 hover:bg-red-600 focus:ring-red-400'
              : 'bg-primary-600 hover:bg-primary-500 focus:ring-primary-400'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
