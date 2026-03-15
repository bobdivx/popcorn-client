import { useState, useEffect, useRef } from 'preact/hooks';
import { debugStore } from '../../lib/debug/debug-store';
import type { DebugLine } from '../../lib/debug/debug-store';

export default function DebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<DebugLine[]>([]);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return debugStore.subscribe((newLines, isEnabled) => {
      setEnabled(isEnabled);
      setLines([...newLines]);
    });
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, open]);

  if (!enabled) return null;

  return (
    <div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;font-family:monospace;">
      {/* Barre titre (toujours visible) */}
      <div
        onClick={() => setOpen(o => !o)}
        style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:rgba(0,0,0,0.95);border-top:2px solid #f59e0b;cursor:pointer;user-select:none;"
      >
        <span style="font-size:11px;font-weight:700;color:#f59e0b;letter-spacing:0.5px;">
          🐛 DEBUG ({lines.length}) {open ? '▼' : '▲'}
        </span>
        <div style="display:flex;gap:8px;" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => debugStore.disable()}
            style="font-size:10px;color:#9ca3af;background:none;border:1px solid #374151;border-radius:4px;padding:2px 8px;cursor:pointer;"
          >
            Désactiver
          </button>
          <button
            onClick={() => { setOpen(false); }}
            style="font-size:10px;color:#f59e0b;background:none;border:1px solid #f59e0b;border-radius:4px;padding:2px 8px;cursor:pointer;"
          >
            {open ? '▼ Réduire' : '▲ Ouvrir'}
          </button>
        </div>
      </div>

      {/* Logs */}
      {open && (
        <div style="max-height:40vh;overflow-y:auto;background:rgba(0,0,0,0.97);padding:6px 10px 10px;border-top:1px solid #1f2937;">
          {lines.length === 0 && (
            <div style="font-size:11px;color:#6b7280;padding:4px 0;">Aucun log pour le moment…</div>
          )}
          {lines.map((line, i) => (
            <div
              key={i}
              style={`font-size:10px;line-height:1.6;word-break:break-all;color:${
                line.msg.includes('redirectTo') ? '#f87171'
                : line.msg.includes('BLOQUÉ') || line.msg.includes('GARDER') ? '#86efac'
                : line.msg.includes('ERROR') ? '#fbbf24'
                : '#d1d5db'
              };`}
            >
              <span style="color:#6b7280;margin-right:6px;">{line.ts}</span>{line.msg}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
