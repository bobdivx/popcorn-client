import type { ComponentChildren } from 'preact';

export function ActionsRow(props: {
  backHref: string;
  isTV: boolean;
  backLinkRef: any;
  children: ComponentChildren;
}) {
  const { backHref, isTV, backLinkRef, children } = props;
  return (
    <div className="flex items-start gap-3 tv:gap-4">
      <a
        ref={backLinkRef}
        href={backHref}
        onClick={(e) => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            e.preventDefault();
            window.history.back();
          }
        }}
        className={`gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 ${
          isTV ? 'tv:w-[68px] tv:h-[68px] tv:p-5' : 'w-[46px] h-[46px] min-w-[46px] min-h-[46px] p-[0.6rem] max-sm:w-[44px] max-sm:h-[44px] max-sm:min-w-[44px] max-sm:min-h-[44px]'
        }`}
        data-focusable
        data-media-detail-back
        tabIndex={0}
        aria-label="Retour"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={isTV ? 'h-6 w-6 tv:h-8 tv:w-8' : 'h-5 w-5'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </a>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

