import { useState } from 'preact/hooks';
import { Monitor, Search, Database, User, Palette, RefreshCw, Settings } from 'lucide-preact';

interface SettingsCard {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: any;
  color: string;
}

export default function SettingsMenu() {
  const [cards] = useState<SettingsCard[]>([
    {
      id: 'setup',
      title: 'Configuration initiale',
      description: 'Rouvrir l\'assistant de configuration pour configurer votre client',
      href: '/setup',
      icon: Settings,
      color: 'purple-500',
    },
    {
      id: 'ui-preferences',
      title: 'Préférences UI',
      description: 'Personnalisez l\'interface : thème, langue, affichage',
      href: '/settings/ui-preferences',
      icon: Palette,
      color: 'purple-500',
    },
    {
      id: 'server',
      title: 'Configuration du Serveur',
      description: 'Configurez l\'URL du serveur Popcorn auquel se connecter',
      href: '/settings/server',
      icon: Monitor,
      color: 'purple-500',
    },
    {
      id: 'indexers',
      title: 'Indexers',
      description: 'Configurez votre clé API TMDB (obligatoire) et vos indexers pour rechercher et télécharger des torrents',
      href: '/settings/indexers',
      icon: Search,
      color: 'cyan-500',
    },
    {
      id: 'sync',
      title: 'Synchronisation Torrents',
      description: 'Gérez la synchronisation automatique des torrents depuis les indexers',
      href: '/settings/sync',
      icon: RefreshCw,
      color: 'orange-500',
    },
    {
      id: 'account',
      title: 'Mon Compte',
      description: 'Consultez et gérez les informations de votre compte utilisateur',
      href: '/settings/account',
      icon: User,
      color: 'green-500',
    },
  ]);

  const colorClasses: Record<string, { border: string; bg: string; text: string; shadow: string }> = {
    'red-500': {
      border: 'hover:border-primary-500 focus:ring-primary-500',
      bg: 'bg-primary-500/20 group-hover:bg-primary-500/30',
      text: 'text-primary-500 group-hover:text-primary-500',
      shadow: 'hover:shadow-primary-500/20',
    },
    'blue-500': {
      border: 'hover:border-blue-500 focus:ring-blue-500',
      bg: 'bg-blue-500/20 group-hover:bg-blue-500/30',
      text: 'text-blue-500 group-hover:text-blue-500',
      shadow: 'hover:shadow-blue-500/20',
    },
    'purple-500': {
      border: 'hover:border-primary-500 focus:ring-primary-500',
      bg: 'bg-primary-500/20 group-hover:bg-primary-500/30',
      text: 'text-primary-500 group-hover:text-primary-500',
      shadow: 'hover:shadow-primary-500/20',
    },
    'green-500': {
      border: 'hover:border-green-500 focus:ring-green-500',
      bg: 'bg-green-500/20 group-hover:bg-green-500/30',
      text: 'text-green-500 group-hover:text-green-500',
      shadow: 'hover:shadow-green-500/20',
    },
    'cyan-500': {
      border: 'hover:border-cyan-500 focus:ring-cyan-500',
      bg: 'bg-cyan-500/20 group-hover:bg-cyan-500/30',
      text: 'text-cyan-500 group-hover:text-cyan-500',
      shadow: 'hover:shadow-cyan-500/20',
    },
    'orange-500': {
      border: 'hover:border-orange-500 focus:ring-orange-500',
      bg: 'bg-orange-500/20 group-hover:bg-orange-500/30',
      text: 'text-orange-500 group-hover:text-orange-500',
      shadow: 'hover:shadow-orange-500/20',
    },
  };

  return (
    <div class="space-y-6">
      <div class="mb-8">
        <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 sm:mb-4">Paramètres</h1>
        <p class="text-gray-400 text-sm sm:text-base md:text-lg lg:text-xl">Configurez votre application selon vos préférences</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
        {cards.map((card) => {
          const IconComponent = card.icon;
          const colors = colorClasses[card.color] || colorClasses['red-500']; // red-500 mappe maintenant vers violet
          
          return (
            <a
              key={card.id}
              href={card.href}
              class={`settings-card group relative block p-4 sm:p-6 md:p-8 rounded-xl bg-gradient-to-br from-gray-900 to-black border-2 border-gray-800 ${colors.border} transition-all duration-300 hover:shadow-2xl ${colors.shadow} hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 min-h-[140px] sm:min-h-[160px] md:min-h-[180px]`}
              tabIndex={0}
            >
              <div class="flex items-start gap-3 sm:gap-4 md:gap-5">
                <div class={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg ${colors.bg} flex items-center justify-center transition-colors`}>
                  <IconComponent class={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ${colors.text}`} />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class={`text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2 ${colors.text} transition-colors`}>
                    {card.title}
                  </h3>
                  <p class="text-xs sm:text-sm md:text-base text-gray-400 line-clamp-2 sm:line-clamp-3">
                    {card.description}
                  </p>
                </div>
              </div>
              <div class={`mt-3 sm:mt-4 md:mt-5 flex items-center text-xs sm:text-sm md:text-base text-gray-500 ${colors.text} transition-colors`}>
                <span>Configurer</span>
                <svg class="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
