import { LOADING_STEPS } from '../utils/streamingSteps';

interface StreamingStepIndicatorProps {
  /** Étape courante (1-4). 0 = masquer l'indicateur. */
  currentStep: number;
  /** Message de détail sous les étapes (optionnel). */
  progressMessage?: string;
  /** Version compacte (barre seule, sans labels sous les segments). */
  compact?: boolean;
}

export function StreamingStepIndicator({
  currentStep,
  progressMessage,
  compact = false,
}: StreamingStepIndicatorProps) {
  if (currentStep < 1) return null;

  return (
    <div className="w-full max-w-sm mb-6">
      <div className="flex justify-between gap-1">
        {LOADING_STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isActive = currentStep === stepNum;
          const isDone = currentStep > stepNum;
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center">
              <div
                className={`
                  w-full h-1.5 rounded-full transition-all duration-300
                  ${isDone ? 'bg-primary-500' : isActive ? 'bg-primary-500 animate-pulse' : 'bg-white/20'}
                `}
              />
              {!compact && (
                <div className="mt-2 flex flex-col items-center">
                  <span
                    className={`
                      text-xs font-medium transition-colors
                      ${isActive ? 'text-primary-400' : isDone ? 'text-white/70' : 'text-white/40'}
                    `}
                  >
                    {isActive && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400 animate-ping mr-1 align-middle"
                      />
                    )}
                    {step.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {progressMessage && (
        <p className="text-white/60 text-center text-sm mt-3 font-light">{progressMessage}</p>
      )}
    </div>
  );
}
