import type { ComponentChildren } from 'preact';

export function ActionsRow(props: {
  backHref: string;
  isTV: boolean;
  backLinkRef: any;
  children: ComponentChildren;
}) {
  const { backHref, isTV, backLinkRef, children } = props;
  return (
    <>
      {/* Coin haut-gauche (miroir du bouton BA) — n’indente plus la carte de progression. */}
      {!isTV && (
        <a
          ref={backLinkRef}
          href={backHref}
          onClick={(e) => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              e.preventDefault();
              window.history.back();
            }
          }}
          className="absolute top-4 left-3 sm:top-6 sm:left-4 md:left-6 lg:left-16 gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 w-[46px] h-[46px] min-w-[46px] min-h-[46px] p-[0.6rem] max-sm:w-[44px] max-sm:h-[44px] max-sm:min-w-[44px] max-sm:min-h-[44px] z-20"
          data-focusable
          data-media-detail-back
          tabIndex={0}
          aria-label="Retour"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </a>
      )}
      <div className="min-w-0">{children}</div>
    </>
  );
}
