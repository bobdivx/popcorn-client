import TorrentSyncManager from './TorrentSyncManager';
import { DsCard, DsCardSection } from '../ui/design-system';

export default function SyncSettingsCards() {
  return (
    <div class="space-y-6">
      {/* Carte principale : toute la gestion de la synchronisation */}
      <DsCard variant="elevated">
        <DsCardSection>
          <TorrentSyncManager />
        </DsCardSection>
      </DsCard>
    </div>
  );
}

