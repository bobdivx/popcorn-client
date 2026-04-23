interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-4 sm:pt-6 pb-4">
      <h1 className="text-2xl sm:text-3xl md:text-4xl tv:text-5xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400 text-sm sm:text-base">{subtitle}</p>
    </div>
  );
}
