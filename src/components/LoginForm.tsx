import { useState } from 'preact/hooks';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // TODO: Implémenter l'authentification complète
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Erreur de connexion');
        setIsLoading(false);
        return;
      }

      // Connexion réussie - sauvegarder les tokens
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }

      // Rediriger vers le dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError('Erreur de connexion. Vérifiez votre connexion réseau.');
      console.error('Erreur:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4">
      <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6">Connexion</h2>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-900/20 border border-red-600 text-red-400 px-4 py-3 rounded mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="mb-3 sm:mb-4">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Email
          </label>
          <input
            type="email"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            placeholder="votre@email.com"
            required
            autoFocus
          />
        </div>
        <div className="mb-4 sm:mb-6">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Mot de passe
          </label>
          <input
            type="password"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            placeholder="Votre mot de passe"
            required
          />
        </div>
        <button
          type="submit"
          className={`form-tv-button w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={isLoading}
        >
          {isLoading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
      <div className="text-center mt-6">
        <p className="text-gray-400 text-sm">
          Pas de compte ?{' '}
          <a href="/register" className="text-white hover:text-red-600 transition-colors font-medium">
            S'inscrire
          </a>
        </p>
      </div>
    </div>
  );
}
