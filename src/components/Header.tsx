import { useState, useEffect } from 'preact/hooks';
import { redirectTo } from '../lib/utils/navigation.js';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Vérifier si l'utilisateur est connecté
    const accessToken = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
    setIsLoggedIn(!!accessToken);
  }, []);

  const handleLogout = async () => {
    // Utiliser le client API pour la déconnexion
    try {
      const { serverApi } = await import('../lib/client/server-api');
      await serverApi.logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
    // Nettoyer le stockage local
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    redirectTo('/login');
  };

  return (
    <header className="bg-black/80 border-b border-white/10 py-4 sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="/popcorn_logo.png" alt="Popcorn" className="w-8 h-8" />
          <span className="text-xl font-bold">Popcorn Vercel</span>
        </a>
        
        {/* Menu desktop */}
        <nav className="hidden md:flex gap-6 items-center">
          <a href="/" className="text-gray-300 hover:text-white transition-colors">Accueil</a>
          <a href="/features" className="text-gray-300 hover:text-white transition-colors">Fonctionnalités</a>
          <a href="/docs" className="text-gray-300 hover:text-white transition-colors">Documentation</a>
          {isLoggedIn ? (
            <>
              <a href="/search" className="text-gray-300 hover:text-white transition-colors">Recherche</a>
              <a href="/library" className="text-gray-300 hover:text-white transition-colors">Bibliothèque</a>
              <a href="/settings" className="text-gray-300 hover:text-white transition-colors">Paramètres</a>
              <a href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Tableau de bord</a>
              <button 
                onClick={handleLogout}
                className="text-gray-300 hover:text-white transition-colors"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="text-gray-300 hover:text-white transition-colors">Connexion</a>
              <a href="/register" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors">
                S'inscrire
              </a>
            </>
          )}
        </nav>

        {/* Menu mobile - bouton hamburger */}
        <button 
          className="md:hidden text-gray-300 hover:text-white transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menu mobile - dropdown */}
      {isMenuOpen && (
        <nav className="md:hidden border-t border-white/10 bg-black/95">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
            <a 
              href="/" 
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Accueil
            </a>
            <a 
              href="/features" 
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Fonctionnalités
            </a>
            <a 
              href="/docs" 
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Documentation
            </a>
            {isLoggedIn ? (
              <>
                <a 
                  href="/search" 
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Recherche
                </a>
                <a 
                  href="/library" 
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Bibliothèque
                </a>
                <a 
                  href="/settings" 
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Paramètres
                </a>
                <a 
                  href="/dashboard" 
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Tableau de bord
                </a>
                <button 
                  onClick={() => {
                    handleLogout();
                    setIsMenuOpen(false);
                  }}
                  className="text-left text-gray-300 hover:text-white transition-colors"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <a 
                  href="/login" 
                  className="text-gray-300 hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Connexion
                </a>
                <a 
                  href="/register" 
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  S'inscrire
                </a>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}