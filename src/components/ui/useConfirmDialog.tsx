import { useCallback, useRef, useState } from 'preact/hooks';
import { ConfirmModal } from './ConfirmModal';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Remplace `window.confirm` par une ConfirmModal async TV-friendly.
 * Usage: `const { confirm, dialog } = useConfirmDialog();` puis `if (!(await confirm({...}))) return;`
 * et rendre `{dialog}` dans le JSX.
 */
export function useConfirmDialog() {
  const [opts, setOpts] = useState<ConfirmDialogOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOpts(options);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  const dialog = (
    <ConfirmModal
      isOpen={!!opts}
      title={opts?.title ?? ''}
      message={opts?.message ?? ''}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      danger={opts?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
