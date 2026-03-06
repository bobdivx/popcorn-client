import type { DebugLog } from '../types';

interface DebugConsoleProps {
  debugLogs: DebugLog[];
  onCopyLogs: () => void;
  onClearLogs: () => void;
}

export function DebugConsole({ debugLogs, onCopyLogs, onClearLogs }: DebugConsoleProps) {
  const handleCopyLogs = async () => {
    try {
      const logsText = debugLogs
        .map((log) => {
          const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
          return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
        })
        .join('\n\n');

      await navigator.clipboard.writeText(logsText);
    } catch (err) {
      // Fallback si clipboard API n'est pas disponible
      const textarea = document.createElement('textarea');
      const logsText = debugLogs
        .map((log) => {
          const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
          return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
        })
        .join('\n\n');

      textarea.value = logsText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    onCopyLogs();
  };

  return (
    <div className="mt-6 w-full max-w-2xl bg-black/60 border border-white/10 rounded-lg p-4 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Console de debug</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            disabled={debugLogs.length === 0}
            className="text-white/60 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed text-xs px-2 py-1 rounded hover:bg-white/10 border border-white/10 hover:border-white/20"
          >
            📋 Copier
          </button>
          <button
            onClick={onClearLogs}
            className="text-white/60 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10"
          >
            Effacer
          </button>
        </div>
      </div>
      <div className="space-y-1 font-mono text-xs">
        {debugLogs.length === 0 ? (
          <div className="text-white/40 italic">Aucun log pour le moment... Cliquez sur "Lire" pour commencer.</div>
        ) : (
          debugLogs.map((log, idx) => (
            <div key={idx} className="flex flex-col gap-1 py-2 border-b border-white/5">
              <div className="flex items-start gap-2">
                <span className="text-white/40 shrink-0 text-[10px]">[{log.time}]</span>
                <span
                  className={`shrink-0 font-semibold text-xs ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'success'
                      ? 'text-green-400'
                      : log.type === 'warning'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}
                >
                  [{log.type.toUpperCase()}]
                </span>
                <span className="text-white/90 flex-1 break-words text-xs">{log.message}</span>
              </div>
              {log.data && typeof log.data === 'object' && (
                <details className="ml-[60px] text-white/60">
                  <summary className="cursor-pointer hover:text-white text-[10px]">📄 Détails complets</summary>
                  <pre className="mt-1 p-2 bg-black/40 rounded text-[10px] overflow-x-auto max-w-full">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
      {debugLogs.length > 0 && (
        <div className="mt-2 text-xs text-white/40 text-center">
          {debugLogs.length} log{debugLogs.length > 1 ? 's' : ''} • Auto-scroll activé
        </div>
      )}
    </div>
  );
}
