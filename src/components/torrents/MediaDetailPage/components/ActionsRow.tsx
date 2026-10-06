import type { ComponentChildren, Ref } from 'preact';

export function MediaDetailBackLink(props: {
  backHref: string;
  backLinkRef?: Ref<HTMLAnchorElement>;
  label: string;
}) {
  const { backHref, backLinkRef, label } = props;
  return (
    <a
      ref={backLinkRef}
      href={backHref}
      onClick={(e) => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}
      className="gtv-icon-btn ds-focus-glow ds-active-glow inline-flex shrink-0 items-center justify-center w-[46px] h-[46px] min-w-[46px] min-h-[46px] p-[0.6rem] max-sm:w-[44px] max-sm:h-[44px] max-sm:min-w-[44px] max-sm:min-h-[44px]"
      data-focusable
      data-media-detail-back
      tabIndex={0}
      aria-label={label}
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
  );
}

export function ActionsRow(props: { children: ComponentChildren }) {
  return <div className="min-w-0">{props.children}</div>;
}
