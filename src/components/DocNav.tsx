interface DocNavProps {
  currentPath?: string;
}

export default function DocNav({ currentPath }: DocNavProps) {
  const links = [
    { href: '/docs', label: 'Accueil Documentation', active: currentPath === '/docs' },
    { href: '/docs/docker', label: 'Docker', active: currentPath?.startsWith('/docs/docker') },
    { href: '/docs/api', label: 'API', active: currentPath?.startsWith('/docs/api') },
  ];

  return (
    <nav className="bg-black/50 border-b border-white/10 py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap gap-4">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded transition-colors ${
                link.active
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}