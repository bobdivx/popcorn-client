import { Info } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { Modal } from '../ui/Modal';

interface IndexerDefinitionDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SectionTitle({ children }: { children: preact.ComponentChildren }) {
  return <h3 className="text-lg font-bold text-white mt-6 mb-2">{children}</h3>;
}

function FieldRow({
  name,
  desc,
}: {
  name: string;
  desc: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 py-2 border-b border-white/10">
      <div className="text-white font-mono text-sm">{name}</div>
      <div className="text-gray-300 text-sm whitespace-pre-wrap">{desc}</div>
    </div>
  );
}

export function IndexerDefinitionDocsModal({ isOpen, onClose }: IndexerDefinitionDocsModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('indexerDefinitionDocs.title')}
      size="xl"
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary-300">
            <Info className="w-5 h-5" />
          </div>
          <p className="text-gray-200 text-sm whitespace-pre-wrap">
            {t('indexerDefinitionDocs.intro')}
          </p>
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.basics')}</SectionTitle>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4">
          <FieldRow name="id" desc={t('indexerDefinitionDocs.fields.id')} />
          <FieldRow name="name" desc={t('indexerDefinitionDocs.fields.name')} />
          <FieldRow name="version" desc={t('indexerDefinitionDocs.fields.version')} />
          <FieldRow name="description" desc={t('indexerDefinitionDocs.fields.description')} />
          <FieldRow name="protocol" desc={t('indexerDefinitionDocs.fields.protocol')} />
          <FieldRow name="country" desc={t('indexerDefinitionDocs.fields.country')} />
          <FieldRow name="language" desc={t('indexerDefinitionDocs.fields.language')} />
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.request')}</SectionTitle>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4">
          <FieldRow name="searchEndpoint" desc={t('indexerDefinitionDocs.fields.searchEndpoint')} />
          <FieldRow name="searchMethod" desc={t('indexerDefinitionDocs.fields.searchMethod')} />
          <FieldRow name="searchParams" desc={t('indexerDefinitionDocs.fields.searchParams')} />
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.mappings')}</SectionTitle>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4">
          <FieldRow name="responseMapping" desc={t('indexerDefinitionDocs.fields.responseMapping')} />
          <FieldRow name="categoryMapping" desc={t('indexerDefinitionDocs.fields.categoryMapping')} />
          <FieldRow name="ui" desc={t('indexerDefinitionDocs.fields.ui')} />
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.options')}</SectionTitle>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4">
          <FieldRow name="requiresApiKey" desc={t('indexerDefinitionDocs.fields.requiresApiKey')} />
          <FieldRow name="requiresAuth" desc={t('indexerDefinitionDocs.fields.requiresAuth')} />
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.examples')}</SectionTitle>
        <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
          <p className="text-gray-300 text-sm whitespace-pre-wrap">
            {t('indexerDefinitionDocs.examples.torznabIntro')}
          </p>
          <pre className="text-xs bg-black/50 border border-white/10 rounded-lg p-3 overflow-x-auto">
            <code className="text-gray-200 whitespace-pre">
              {t('indexerDefinitionDocs.examples.torznabSnippet')}
            </code>
          </pre>
          <p className="text-gray-400 text-xs whitespace-pre-wrap">
            {t('indexerDefinitionDocs.examples.note')}
          </p>
        </div>

        <SectionTitle>{t('indexerDefinitionDocs.sections.commonMistakes')}</SectionTitle>
        <ul className="list-disc pl-5 text-gray-300 text-sm space-y-1">
          <li className="whitespace-pre-wrap">{t('indexerDefinitionDocs.mistakes.endpoint')}</li>
          <li className="whitespace-pre-wrap">{t('indexerDefinitionDocs.mistakes.json')}</li>
          <li className="whitespace-pre-wrap">{t('indexerDefinitionDocs.mistakes.mapping')}</li>
          <li className="whitespace-pre-wrap">{t('indexerDefinitionDocs.mistakes.countryLanguage')}</li>
        </ul>
      </div>
    </Modal>
  );
}

