import { useState } from 'preact/hooks';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
}

export default function RegisterForm() {
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation côté client
    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsLoading(true);

    try {
      // Inscription avec validation du code de parrainage
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          inviteCode: formData.inviteCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Erreur lors de l\'inscription');
        setIsLoading(false);
        return;
      }

      // Inscription réussie
      setSuccess('Inscription réussie ! Redirection...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
      console.error('Erreur:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof RegisterFormData) => (e: Event) => {
    const target = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [field]: target.value,
    }));
  };

  return (
    <div className="w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4">
      <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6">Inscription</h2>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-900/20 border border-red-600 text-red-400 px-4 py-3 rounded mb-4">
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="bg-green-900/20 border border-green-600 text-green-400 px-4 py-3 rounded mb-4">
            <span>{success}</span>
          </div>
        )}
        <div className="mb-3 sm:mb-4">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Code de parrainage
          </label>
          <input
            type="text"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={formData.inviteCode}
            onInput={(e) => handleChange('inviteCode')(e)}
            placeholder="Entrez votre code de parrainage"
            required
            autoFocus
          />
        </div>
        <div className="mb-3 sm:mb-4">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Email
          </label>
          <input
            type="email"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={formData.email}
            onInput={(e) => handleChange('email')(e)}
            placeholder="votre@email.com"
            required
          />
        </div>
        <div className="mb-3 sm:mb-4">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Mot de passe
          </label>
          <input
            type="password"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={formData.password}
            onInput={(e) => handleChange('password')(e)}
            placeholder="Au moins 8 caractères"
            required
          />
        </div>
        <div className="mb-4 sm:mb-6">
          <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
            Confirmer le mot de passe
          </label>
          <input
            type="password"
            className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
            value={formData.confirmPassword}
            onInput={(e) => handleChange('confirmPassword')(e)}
            placeholder="Confirmez votre mot de passe"
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
          {isLoading ? 'Inscription...' : 'S\'inscrire'}
        </button>
      </form>
      <div className="text-center mt-6">
        <p className="text-gray-400 text-sm">
          Déjà un compte ?{' '}
          <a href="/login" className="text-white hover:text-red-600 transition-colors font-medium">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
