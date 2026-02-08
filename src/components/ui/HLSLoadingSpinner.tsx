import { h } from 'preact';

interface HLSLoadingSpinnerProps {
  /** Taille du spinner (default: 'lg') */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Texte à afficher sous le spinner (optionnel) */
  text?: string;
  /** Classe CSS supplémentaire */
  className?: string;
}

/**
 * Composant de chargement réutilisable avec l'animation HLS
 * Utilise la même animation que le chargement de vidéo HLS
 */
export default function HLSLoadingSpinner({ 
  size = 'lg', 
  text,
  className = '' 
}: HLSLoadingSpinnerProps) {
  // Tailles selon la prop size
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-40 h-40',
  };
  
  const logoSizeClasses = {
    sm: 'inset-1',
    md: 'inset-1.5',
    lg: 'inset-2',
    xl: 'inset-3',
  };
  
  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };
  
  const dotSizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2 h-2',
    xl: 'w-2.5 h-2.5',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Animation du logo Popcorn */}
      <div className={`relative ${sizeClasses[size]} mb-6`}>
        {/* Cercle de chargement externe */}
        <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
        <div 
          className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full"
          style={{
            animation: 'hls-spin 1s linear infinite',
          }}
        ></div>
        {/* Logo Popcorn avec animation pulse */}
        <div 
          className={`absolute ${logoSizeClasses[size]} flex items-center justify-center`}
          style={{
            animation: 'hls-pulse 2s ease-in-out infinite',
          }}
        >
          <img 
            src="/popcorn_logo.png" 
            alt="Popcorn" 
            className="w-full h-full object-contain drop-shadow-lg"
            style={{
              filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
            }}
          />
        </div>
      </div>
      
      {text && (
        <p className={`text-white/80 ${textSizeClasses[size]} font-medium mb-2`}>{text}</p>
      )}
      
      {/* Points animés */}
      <div className="flex gap-1 mt-2">
        <span 
          className={`${dotSizeClasses[size]} bg-primary-600 rounded-full`}
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
        ></span>
        <span 
          className={`${dotSizeClasses[size]} bg-primary-600 rounded-full`}
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
        ></span>
        <span 
          className={`${dotSizeClasses[size]} bg-primary-600 rounded-full`}
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
        ></span>
      </div>
    </div>
  );
}
