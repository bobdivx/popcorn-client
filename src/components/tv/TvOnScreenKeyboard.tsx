import { Delete, Search as SearchIcon } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const EXTRAS = ["'", '-'];

interface TvOnScreenKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onSearch: () => void;
  disabled?: boolean;
}

const KEY_CLASS =
  'inline-flex items-center justify-center min-w-[3.25rem] min-h-[3.25rem] tv:min-w-[4.25rem] tv:min-h-[4.25rem] rounded-xl bg-white/10 text-white text-lg tv:text-2xl font-semibold border border-white/15 focus:outline-none focus:ring-4 focus:ring-primary-600/70 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-40';

export function TvOnScreenKeyboard({ value, onChange, onSearch, disabled }: TvOnScreenKeyboardProps) {
  const { t } = useI18n();

  const append = (char: string) => {
    if (disabled) return;
    onChange(`${value}${char}`);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled) return;
    onChange('');
  };

  return (
    <div
      className="mt-4 mb-6 p-3 tv:p-4 rounded-2xl bg-black/50 border border-white/10"
      data-tv-keyboard
      role="group"
      aria-label={t('search.tvKeyboard')}
    >
      <div className="grid grid-cols-7 gap-2 tv:gap-3 justify-items-center">
        {LETTERS.map((letter, index) => (
          <button
            key={letter}
            type="button"
            data-focusable
            data-tv-initial-focus={index === 0 ? true : undefined}
            tabIndex={0}
            disabled={disabled}
            className={KEY_CLASS}
            onClick={() => append(letter.toLowerCase())}
          >
            {letter}
          </button>
        ))}
        {EXTRAS.map((char) => (
          <button
            key={char}
            type="button"
            data-focusable
            tabIndex={0}
            disabled={disabled}
            className={KEY_CLASS}
            onClick={() => append(char)}
          >
            {char}
          </button>
        ))}
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            data-focusable
            tabIndex={0}
            disabled={disabled}
            className={KEY_CLASS}
            onClick={() => append(digit)}
          >
            {digit}
          </button>
        ))}
      </div>

      <div className="mt-3 tv:mt-4 flex flex-wrap items-center justify-center gap-2 tv:gap-3">
        <button
          type="button"
          data-focusable
          tabIndex={0}
          disabled={disabled}
          className={`${KEY_CLASS} min-w-[8rem] tv:min-w-[10rem] px-4`}
          onClick={() => append(' ')}
          aria-label={t('search.keyboardSpace')}
        >
          <span className="text-sm tv:text-base font-medium">{t('search.keyboardSpace')}</span>
        </button>
        <button
          type="button"
          data-focusable
          tabIndex={0}
          disabled={disabled || !value}
          className={`${KEY_CLASS} gap-2`}
          onClick={backspace}
          aria-label={t('search.keyboardBackspace')}
          data-tv-keyboard-backspace
        >
          <Delete className="w-5 h-5 tv:w-6 tv:h-6" />
        </button>
        <button
          type="button"
          data-focusable
          tabIndex={0}
          disabled={disabled || !value}
          className={`${KEY_CLASS} px-4 text-sm tv:text-base font-medium`}
          onClick={clear}
          aria-label={t('search.clearSearch')}
        >
          {t('search.clearSearch')}
        </button>
        <button
          type="button"
          data-focusable
          tabIndex={0}
          disabled={disabled || !value.trim()}
          className={`${KEY_CLASS} min-w-[9rem] tv:min-w-[12rem] gap-2 px-4 bg-primary-600/80 border-primary-400/50`}
          onClick={onSearch}
        >
          <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" />
          <span className="text-sm tv:text-base font-medium">{t('common.search')}</span>
        </button>
      </div>
    </div>
  );
}
