interface PlayerLoadingOverlayProps {
  message: string;
}

export default function PlayerLoadingOverlay({ message }: PlayerLoadingOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
      <div className="text-center">
        <div className="relative w-32 h-32 mb-6 mx-auto">
          <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-2 flex items-center justify-center animate-pulse">
            <img
              src="/popcorn_logo.png"
              alt="Popcorn"
              className="w-full h-full object-contain"
              style={{
                filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
              }}
            />
          </div>
        </div>
        <p className="text-white/80 text-lg font-medium">{message}</p>
        <div className="flex gap-1 mt-2 justify-center">
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
        </div>
      </div>
    </div>
  );
}
