import { useEffect, useState } from 'preact/hooks';

interface ErrorPageProps {
  code: number;
  title: string;
  message: string;
  showHomeButton?: boolean;
  showBackButton?: boolean;
}

export default function ErrorPage({ 
  code, 
  title, 
  message, 
  showHomeButton = true,
  showBackButton = true 
}: ErrorPageProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Déterminer les couleurs selon le code d'erreur
  const getErrorColors = () => {
    switch (code) {
      case 404:
        return {
          gradient: 'from-blue-400 via-purple-400 to-pink-400',
          circles: 'from-blue-500/10 via-purple-500/10 to-pink-500/10',
          border1: 'border-blue-500/30',
          border2: 'border-purple-500/30',
          text: 'text-blue-400',
        };
      case 403:
        return {
          gradient: 'from-yellow-400 via-orange-400 to-red-400',
          circles: 'from-yellow-500/10 via-orange-500/10 to-red-500/10',
          border1: 'border-yellow-500/30',
          border2: 'border-orange-500/30',
          text: 'text-yellow-400',
        };
      case 500:
      case 502:
      case 503:
        return {
          gradient: 'from-red-400 via-pink-400 to-purple-400',
          circles: 'from-red-500/10 via-pink-500/10 to-purple-500/10',
          border1: 'border-red-500/30',
          border2: 'border-pink-500/30',
          text: 'text-red-400',
        };
      default:
        return {
          gradient: 'from-gray-400 via-gray-500 to-gray-600',
          circles: 'from-gray-500/10 via-gray-600/10 to-gray-700/10',
          border1: 'border-gray-500/30',
          border2: 'border-gray-600/30',
          text: 'text-gray-400',
        };
    }
  };

  const colors = getErrorColors();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
      {/* Animation de fond */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)] animate-pulse`}></div>
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r ${colors.circles} rounded-full blur-3xl animate-pulse`} style={{ animationDelay: '0s', animationDuration: '3s' }}></div>
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r ${colors.circles} rounded-full blur-3xl animate-pulse`} style={{ animationDelay: '1.5s', animationDuration: '3s' }}></div>
      </div>

      {/* Contenu principal */}
      <div className={`relative z-10 flex flex-col items-center justify-center space-y-8 px-4 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        {/* Code d'erreur animé */}
        <div className="relative">
          <div className="w-32 h-32 md:w-40 md:h-40 relative">
            {/* Cercles animés */}
            <div className={`absolute inset-0 border-4 ${colors.border1} rounded-full animate-spin`} style={{ animationDuration: '3s' }}></div>
            <div className={`absolute inset-2 border-4 ${colors.border2} rounded-full animate-spin`} style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
            
            {/* Code d'erreur au centre */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`text-5xl md:text-7xl font-bold bg-gradient-to-r ${colors.gradient} bg-clip-text text-transparent`}>
                {code}
              </div>
            </div>
          </div>
        </div>

        {/* Logo Popcorn (optionnel, pour cohérence avec l'animation de démarrage) */}
        <div className="text-4xl md:text-6xl animate-bounce" style={{ animationDuration: '2s' }}>
          🍿
        </div>

        {/* Titre et message */}
        <div className="text-center space-y-4 max-w-2xl">
          <h1 className={`text-3xl md:text-5xl font-bold bg-gradient-to-r ${colors.gradient} bg-clip-text text-transparent animate-pulse`}>
            {title}
          </h1>
          
          <p className="text-lg md:text-xl text-gray-300 font-medium">
            {message}
          </p>
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row gap-4 tv:gap-6 items-center">
          {showBackButton && (
            <button
              onClick={() => window.history.back()}
              className="px-8 py-4 tv:px-12 tv:py-5 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-bold text-lg tv:text-2xl rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 focus:scale-105 border-2 border-gray-600/50 hover:border-gray-500/50 focus:border-primary-500 flex items-center gap-2 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]"
              tabIndex={0}
              data-focusable
            >
              <span className="text-2xl tv:text-3xl">←</span>
              <span>Retour</span>
            </button>
          )}
          
          {showHomeButton && (
            <a
              href="/dashboard"
              className="px-8 py-4 tv:px-12 tv:py-5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg tv:text-2xl rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 focus:scale-105 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]"
              tabIndex={0}
              data-focusable
            >
              Accueil
            </a>
          )}
        </div>

        {/* Points décoratifs */}
        <div className="flex space-x-2">
          <div className={`w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`} style={{ animationDelay: '0s' }}></div>
          <div className={`w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`} style={{ animationDelay: '0.2s' }}></div>
          <div className={`w-2 h-2 bg-gradient-to-r ${colors.gradient} rounded-full animate-bounce`} style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Styles CSS pour les animations */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
