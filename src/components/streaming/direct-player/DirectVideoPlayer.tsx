interface DirectVideoPlayerProps {
  src: string;
  closeLabel: string;
  onClose: () => void;
  onLoadedData: () => void;
  onError: (event: Event) => void;
}

export default function DirectVideoPlayer({
  src,
  closeLabel,
  onClose,
  onLoadedData,
  onError,
}: DirectVideoPlayerProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <video
        src={src}
        className="max-w-full max-h-full w-full h-full object-contain"
        controls
        autoPlay
        playsInline
        onError={(e) => onError(e as Event)}
        onLoadedData={onLoadedData}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 left-4 z-20 rounded-lg bg-black/60 px-3 py-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={closeLabel}
      >
        {closeLabel}
      </button>
    </div>
  );
}
