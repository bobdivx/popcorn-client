import { useEffect, useRef, useState } from 'preact/hooks';
import { refreshCapabilitiesNow, useServerCapabilities } from '../../../lib/capabilities';
import { IS_STORE_BUILD } from '../../../lib/distribution';
import { serverApi } from '../../../lib/client/server-api';
import type { HubStatus } from '../hub/HubTile';
import { processModuleName } from './ServerFeatures';
import {
  isProcessModulesUnsupported,
  type ProcessJobEvent,
  type ProcessLogLine,
  type ProcessModule,
  type ProcessModulesList,
  type ProcessPreview,
  type TrustKeys,
} from '../../../lib/client/server-api/modules';
import {
  C,
  FactList,
  Icon,
  type IconName,
  type Notice,
  WarningBox,
  checkboxClass,
  errorMessage,
  formatDate,
  formatSize,
  formatTime,
  inputClass,
  inputStyle,
  monoStyle,
  panelClass,
  primaryBtn,
  primaryStyle,
  secondaryBtn,
  secondaryStyle,
  subHeadingStyle,
  textareaClass,
} from './moduleUi';

/**
 * Paramètres > Modules — modules « process » : binaires signés (minisign + sha256) que le serveur
 * télécharge, vérifie, lance et supervise (popcorn-modules docs/RUNTIME.md §8.1).
 *
 * - Masqués si le serveur ne connaît pas ces routes (capabilities sans `modules.process`, ou 404/405).
 * - Absents de la version store (IS_STORE_BUILD) ; routes bloquées aussi par le garde réseau.
 * - Suivi par sondage (pas d'EventSource : pas d'en-tête d'authentification, et plus sûr sur webOS).
 * - Seule clé de confiance par défaut : la clé officielle Popcornn (intégrée au serveur, non
 *   supprimable, sert au catalogue officiel). L'administrateur n'ajoute que des clés qu'il a vérifiées.
 *
 * L'état (liste, clés, opération en cours) vit dans `useProcessModules` au niveau de la page : une
 * installation continue d'être suivie quand la modale « Ajouter un module » est fermée.
 */
export const PROCESS_TEXT = {
  fr: {
    kind: 'Exécutable',
    devUnsigned:
      'Mode développement actif (POPCORN_MODULES_ALLOW_UNSIGNED) : ce serveur accepte des modules non signés. À désactiver hors développement.',
    platform: 'Plateforme du serveur',
    installHelp:
      'Programme signé que le serveur télécharge, vérifie (signature minisign et empreinte SHA-256), puis lance et surveille. Colle l’URL du dépôt GitHub du module (la dernière release est utilisée) ou l’URL directe de son fichier release.json. La signature est lue à côté (release.json.minisig).',
    releaseUrl: 'URL du module',
    releaseUrlPlaceholder: 'https://github.com/propriétaire/dépôt',
    publicKey: 'Clé publique minisign (facultatif)',
    publicKeyHelp: 'Seulement pour une clé pas encore approuvée, telle que publiée par l’auteur du module (fichier .pub).',
    token: 'Jeton d’accès (facultatif)',
    tokenPlaceholder: 'Dépôt privé uniquement',
    check: 'Vérifier',
    checking: 'Vérification…',
    previewTitle: 'Vérification',
    module: 'Module',
    version: 'Version',
    update: (from: string) => `mise à jour depuis ${from}`,
    size: 'Taille',
    sha256: 'Empreinte SHA-256',
    signature: 'Signature',
    signedTrusted: (label: string) => `signée par une clé de confiance (${label})`,
    signedUnknown: 'signée par une clé inconnue',
    unsigned: 'non signée',
    keyId: 'Identifiant de la clé',
    offeredKey: 'Clé proposée',
    unknownKeyWarn:
      'Cette clé n’est pas dans ta liste de confiance. Compare son identifiant avec celui publié par l’auteur du module avant de continuer.',
    noOfferedKey:
      'Clé inconnue et aucune clé publique fournie : ajoute la clé de l’auteur dans « Clés de confiance » ou colle-la dans le champ ci-dessus.',
    unsignedWarn: 'Module non signé : son origine ne peut pas être vérifiée.',
    acceptKey: 'J’ai vérifié cette clé et je lui fais confiance pour ce module',
    keyChangeWarn: (from: string) =>
      `Cette version est signée par une autre clé que celle liée au module (${from}). Ne continue que si l’auteur a annoncé ce changement de clé.`,
    approveKeyChange: 'J’approuve le changement de clé de signature pour ce module',
    reinstall: 'Réinstaller cette version',
    install: 'Installer',
    installUpdate: 'Mettre à jour',
    cancel: 'Annuler',
    steps: {
      downloading: 'Téléchargement',
      verifying: 'Vérification de l’empreinte',
      installing: 'Installation',
      installed: 'Installé',
      starting: 'Démarrage',
      running: 'En marche',
      rollback: 'Échec : retour à la version précédente',
      done: 'Terminé',
      error: 'Erreur',
    } as Record<string, string>,
    doneInstall: (id: string, v: string) => `Module « ${id} » ${v} installé et démarré.`,
    states: {
      starting: 'Démarrage',
      running: 'En marche',
      degraded: 'Dégradé',
      stopped: 'Arrêté',
      failed: 'En échec',
    } as Record<string, string>,
    state: 'État',
    restartsLabel: 'Redémarrages',
    lastError: 'Dernière erreur',
    lastIncident: 'Dernier incident',
    signedBy: 'Clé',
    unsignedModule: 'non signé',
    installedAt: 'Installé le',
    provides: 'Fournit',
    versions: 'Versions installées',
    source: 'Source',
    start: 'Démarrer',
    stop: 'Arrêter',
    restart: 'Redémarrer',
    checkUpdate: 'Mettre à jour',
    rollbackBtn: 'Version précédente',
    confirmRollback: 'Confirmer le retour',
    uninstall: 'Désinstaller',
    confirmUninstall: 'Confirmer',
    removeData: 'Supprimer aussi ses données',
    logs: 'Journal',
    hideLogs: 'Masquer le journal',
    noLogs: 'Aucune ligne pour le moment.',
    settings: 'Réglages',
    hideSettings: 'Masquer les réglages',
    settingsHelp: 'Réglages du module au format JSON (objet). Ils sont transmis au module.',
    save: 'Enregistrer',
    saved: 'Réglages enregistrés.',
    errJson: 'JSON invalide : indique un objet, par exemple { "clé": "valeur" }.',
    actionDone: {
      start: 'Module démarré.',
      stop: 'Module arrêté.',
      restart: 'Module redémarré.',
      rollback: (v: string) => `Retour à la version ${v}.`,
      uninstall: 'Module désinstallé.',
    },
    trustTitle: 'Clés de confiance',
    trustHint: (n: number) => (n === 0 ? 'Aucune clé' : `${n} clé${n > 1 ? 's' : ''}`),
    trustDesc: 'Clés minisign autorisées à signer des modules exécutables.',
    trustWarn:
      'Aucune clé n’est fournie par défaut : Popcornn ne fait confiance à personne d’office. N’ajoute que des clés dont tu as vérifié l’origine (publiées par l’auteur du module). Un module signé par une clé de confiance s’exécute sur ton serveur avec ses droits.',
    trustNone: 'Aucune clé de confiance : tout module signé demandera ton approbation.',
    keyLabel: 'Nom',
    keyLabelPlaceholder: 'Auteur ou dépôt',
    keyValue: 'Clé publique minisign',
    keyValuePlaceholder: 'RWQ… (contenu du fichier .pub)',
    addKey: 'Ajouter la clé',
    keyAdded: (id: string) => `Clé ${id} ajoutée.`,
    removeKey: 'Retirer',
    officialKey: 'Clé officielle Popcornn · intégrée au serveur, non supprimable',
    confirmRemoveKey: 'Confirmer le retrait',
    keyRemoved: 'Clé retirée.',
    keyModules: 'Modules liés',
    addedAt: 'Ajoutée le',
    errUrl: 'Indique une URL commençant par https://',
    errKey: 'Colle une clé publique minisign.',
    errForbidden: 'Accès refusé : seul l’administrateur du serveur peut gérer les modules.',
    errGeneric: 'Opération impossible. Réessaie dans quelques instants.',
    errJobLost: 'Suivi de l’opération perdu : actualise la liste.',
  },
  en: {
    kind: 'Executable',
    devUnsigned:
      'Development mode on (POPCORN_MODULES_ALLOW_UNSIGNED): this server accepts unsigned modules. Turn it off outside development.',
    platform: 'Server platform',
    installHelp:
      'Signed program that the server downloads, verifies (minisign signature and SHA-256 hash), then runs and monitors. Paste the URL of the module’s GitHub repository (the latest release is used) or the direct URL of its release.json file. The signature is read next to it (release.json.minisig).',
    releaseUrl: 'Module URL',
    releaseUrlPlaceholder: 'https://github.com/owner/repo',
    publicKey: 'Minisign public key (optional)',
    publicKeyHelp: 'Only for a key not approved yet, as published by the module author (.pub file).',
    token: 'Access token (optional)',
    tokenPlaceholder: 'Private repository only',
    check: 'Check',
    checking: 'Checking…',
    previewTitle: 'Verification',
    module: 'Module',
    version: 'Version',
    update: (from: string) => `update from ${from}`,
    size: 'Size',
    sha256: 'SHA-256 hash',
    signature: 'Signature',
    signedTrusted: (label: string) => `signed by a trusted key (${label})`,
    signedUnknown: 'signed by an unknown key',
    unsigned: 'unsigned',
    keyId: 'Key ID',
    offeredKey: 'Offered key',
    unknownKeyWarn:
      'This key is not in your trust list. Compare its ID with the one published by the module author before going on.',
    noOfferedKey:
      'Unknown key and no public key given: add the author’s key under “Trusted keys” or paste it in the field above.',
    unsignedWarn: 'Unsigned module: its origin cannot be verified.',
    acceptKey: 'I checked this key and trust it for this module',
    keyChangeWarn: (from: string) =>
      `This release is signed by a different key than the one bound to the module (${from}). Only continue if the author announced this key change.`,
    approveKeyChange: 'I approve the signing key change for this module',
    reinstall: 'Reinstall this version',
    install: 'Install',
    installUpdate: 'Update',
    cancel: 'Cancel',
    steps: {
      downloading: 'Downloading',
      verifying: 'Checking hash',
      installing: 'Installing',
      installed: 'Installed',
      starting: 'Starting',
      running: 'Running',
      rollback: 'Failed: back to the previous version',
      done: 'Done',
      error: 'Error',
    } as Record<string, string>,
    doneInstall: (id: string, v: string) => `Module “${id}” ${v} installed and started.`,
    states: {
      starting: 'Starting',
      running: 'Running',
      degraded: 'Degraded',
      stopped: 'Stopped',
      failed: 'Failed',
    } as Record<string, string>,
    state: 'State',
    restartsLabel: 'Restarts',
    lastError: 'Last error',
    lastIncident: 'Last incident',
    signedBy: 'Key',
    unsignedModule: 'unsigned',
    installedAt: 'Installed on',
    provides: 'Provides',
    versions: 'Installed versions',
    source: 'Source',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    checkUpdate: 'Update',
    rollbackBtn: 'Previous version',
    confirmRollback: 'Confirm rollback',
    uninstall: 'Uninstall',
    confirmUninstall: 'Confirm',
    removeData: 'Also delete its data',
    logs: 'Log',
    hideLogs: 'Hide log',
    noLogs: 'No lines yet.',
    settings: 'Settings',
    hideSettings: 'Hide settings',
    settingsHelp: 'Module settings as JSON (object). They are passed to the module.',
    save: 'Save',
    saved: 'Settings saved.',
    errJson: 'Invalid JSON: enter an object, e.g. { "key": "value" }.',
    actionDone: {
      start: 'Module started.',
      stop: 'Module stopped.',
      restart: 'Module restarted.',
      rollback: (v: string) => `Back to version ${v}.`,
      uninstall: 'Module uninstalled.',
    },
    trustTitle: 'Trusted keys',
    trustHint: (n: number) => (n === 0 ? 'No key' : `${n} key${n > 1 ? 's' : ''}`),
    trustDesc: 'Minisign keys allowed to sign executable modules.',
    trustWarn:
      'No key is provided by default: Popcornn trusts nobody out of the box. Only add keys whose origin you checked (published by the module author). A module signed by a trusted key runs on your server with its permissions.',
    trustNone: 'No trusted key: every signed module will ask for your approval.',
    keyLabel: 'Name',
    keyLabelPlaceholder: 'Author or repository',
    keyValue: 'Minisign public key',
    keyValuePlaceholder: 'RWQ… (content of the .pub file)',
    addKey: 'Add key',
    keyAdded: (id: string) => `Key ${id} added.`,
    removeKey: 'Remove',
    officialKey: 'Official Popcornn key · built into the server, cannot be removed',
    confirmRemoveKey: 'Confirm removal',
    keyRemoved: 'Key removed.',
    keyModules: 'Bound modules',
    addedAt: 'Added on',
    errUrl: 'Enter a URL starting with https://',
    errKey: 'Paste a minisign public key.',
    errForbidden: 'Access denied: only the server administrator can manage modules.',
    errGeneric: 'Operation failed. Please try again shortly.',
    errJobLost: 'Lost track of the operation: refresh the list.',
  },
};

export type ProcessTx = (typeof PROCESS_TEXT)['fr'];

export function processTx(language: string): ProcessTx {
  return language === 'en' ? (PROCESS_TEXT.en as unknown as ProcessTx) : PROCESS_TEXT.fr;
}

/** État d'un module process → pastille de tuile du hub. */
export function processStatus(state: string): HubStatus {
  if (state === 'running') return 'connected';
  if (state === 'starting' || state === 'degraded') return 'limited';
  if (state === 'failed') return 'error';
  return 'disabled';
}

function describeEvent(ev: ProcessJobEvent, tx: ProcessTx): string {
  const label = tx.steps[ev.step] ?? ev.step;
  if (ev.step === 'downloading' && typeof ev.received === 'number') {
    const total = typeof ev.total === 'number' && ev.total > 0 ? ev.total : null;
    return total
      ? `${label} ${Math.min(100, Math.round((ev.received / total) * 100))} % (${formatSize(ev.received)} / ${formatSize(total)})`
      : `${label} ${formatSize(ev.received)}`;
  }
  if (ev.step === 'error' && ev.error) return `${label} : ${ev.error}`;
  if (ev.step === 'rollback') return `${label}${ev.to ? ` (${ev.to})` : ''}${ev.error ? ` : ${ev.error}` : ''}`;
  if (ev.version) return `${label} (${ev.version})`;
  return label;
}

/** Langue d'un jeu de textes (les noms lisibles des modules en dépendent). */
function txLanguage(tx: ProcessTx): 'fr' | 'en' {
  return tx === PROCESS_TEXT.en ? 'en' : 'fr';
}

/** Nom lisible d'un module à partir de son id (« Torrent » au lieu de `app.popcornn.torrent`). */
export function processModuleLabel(id: string, tx: ProcessTx, provides?: string[] | null): string {
  return processModuleName({ id, provides }, txLanguage(tx));
}

export interface JobView {
  jobId: string;
  moduleId: string;
  events: ProcessJobEvent[];
  done: boolean;
}

export type ProcessModulesState = ReturnType<typeof useProcessModules>;

/**
 * État des modules process pour toute la page. `supported` passe à false (et rien n'est affiché)
 * en version store, sur un serveur sans `modules.process`, ou si les routes répondent 404/405.
 */
export function useProcessModules(tx: ProcessTx, setNotice: (n: Notice) => void) {
  const caps = useServerCapabilities();
  // Serveur connu comme plus ancien (capabilities sans `modules.process`) : aucune requête.
  const knownUnsupported = !!caps && caps.modules.processHost === false;

  const [hidden, setHidden] = useState(false);
  const [list, setList] = useState<ProcessModulesList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [trust, setTrust] = useState<TrustKeys | null>(null);
  const [job, setJob] = useState<JobView | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Le texte peut changer avec la langue pendant un sondage : on lit toujours la dernière version.
  const txRef = useRef(tx);
  txRef.current = tx;
  const noticeRef = useRef(setNotice);
  noticeRef.current = setNotice;

  const refresh = async () => {
    if (IS_STORE_BUILD || knownUnsupported) return;
    const res = await serverApi.listProcessModules();
    if (!alive.current) return;
    if (res.success && res.data) {
      setList({ ...res.data, modules: Array.isArray(res.data.modules) ? res.data.modules : [] });
      setListError(null);
      const keys = await serverApi.listTrustKeys();
      if (!alive.current) return;
      if (keys.success && keys.data) {
        setTrust({
          keys: Array.isArray(keys.data.keys) ? keys.data.keys : [],
          bindings: keys.data.bindings && typeof keys.data.bindings === 'object' ? keys.data.bindings : {},
          allow_unsigned: keys.data.allow_unsigned === true,
        });
      }
    } else if (isProcessModulesUnsupported(res)) {
      setHidden(true);
    } else {
      setList({ modules: [], platform: null, protocol_version: 0, allow_unsigned: false });
      setListError(errorMessage(res, txRef.current));
    }
  };

  useEffect(() => {
    if (IS_STORE_BUILD || knownUnsupported) return;
    void refresh();
  }, [knownUnsupported]);

  // Suivi d'une opération (installation / mise à jour) : sondage toutes les secondes.
  useEffect(() => {
    if (!job || job.done) return;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const res = await serverApi.getProcessJob(job.jobId);
      if (!alive.current) return;
      const t = txRef.current;
      if (res.success && res.data) {
        misses = 0;
        const events = Array.isArray(res.data.events) ? res.data.events : [];
        const done = res.data.done === true;
        setJob({ ...job, events, done });
        if (done) {
          const last = events[events.length - 1];
          if (last && last.step === 'done') {
            noticeRef.current({ kind: 'ok', text: t.doneInstall(processModuleLabel(job.moduleId, t), last.version || '') });
          } else {
            noticeRef.current({ kind: 'error', text: last ? describeEvent(last, t) : t.errGeneric });
          }
          await refresh();
          await refreshCapabilitiesNow();
          // Le module installé démarre ensuite : relecture différée de ses fonctions.
          setTimeout(() => {
            void refresh();
            void refreshCapabilitiesNow();
          }, 3000);
          return;
        }
      } else if (++misses >= 5) {
        setJob({ ...job, done: true });
        noticeRef.current({ kind: 'error', text: t.errJobLost });
        return;
      }
      timer = setTimeout(() => void tick(), 1000);
    };
    timer = setTimeout(() => void tick(), 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [job?.jobId, job?.done]);

  // Module en « Démarrage » : relecture toutes les 2 s jusqu'à un état stable (puis capacités).
  const starting = (list?.modules ?? []).some((m) => m.state === 'starting');
  useEffect(() => {
    if (!starting) return;
    const timer = setTimeout(() => {
      void refresh().then(() => refreshCapabilitiesNow());
    }, 2000);
    return () => clearTimeout(timer);
  }, [starting, list]);

  const supported = !IS_STORE_BUILD && !knownUnsupported && !hidden;
  return {
    supported,
    /** Liste chargée au moins une fois (fonctions process affichables). */
    ready: supported && list !== null,
    list,
    listError,
    trust,
    job,
    jobRunning: !!job && !job.done,
    startJob: (jobId: string, moduleId: string) => setJob({ jobId, moduleId, events: [], done: false }),
    refresh,
  };
}

/** Avancement d'une installation / mise à jour (barre corail + étapes). */
export function ProcessJobProgress({ job, tx }: { job: JobView | null; tx: ProcessTx }) {
  if (!job) return null;
  const lastEvent = job.events.length ? job.events[job.events.length - 1] : null;
  const dl = [...job.events].reverse().find((ev) => ev.step === 'downloading');
  const dlPct =
    dl && typeof dl.received === 'number' && typeof dl.total === 'number' && dl.total > 0
      ? Math.min(100, Math.round((dl.received / dl.total) * 100))
      : null;
  return (
    <div class={panelClass} role="status" aria-live="polite">
      <p class="text-sm tv:text-lg">
        <span style={{ color: C.faint }}>{processModuleLabel(job.moduleId, tx)} · </span>
        {lastEvent ? describeEvent(lastEvent, tx) : `${tx.steps.downloading}…`}
      </p>
      {dlPct !== null && (
        <div class="mt-3 h-2 tv:h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(244, 241, 236, 0.1)' }}>
          <div class="h-full" style={{ width: `${dlPct}%`, backgroundColor: C.accent }} />
        </div>
      )}
      {job.events.length > 1 && (
        <ol class="mt-3 grid gap-1 text-xs tv:text-base" style={{ color: C.faint }}>
          {job.events
            .filter((ev, i, arr) => ev.step !== 'downloading' || i === arr.length - 1 || arr[i + 1].step !== 'downloading')
            .map((ev, i) => (
              <li key={i}>{describeEvent(ev, tx)}</li>
            ))}
        </ol>
      )}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  primary,
  disabled,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-focusable
      class={primary ? primaryBtn : secondaryBtn}
      style={primary ? primaryStyle : secondaryStyle}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** Formulaire « Ajouter un module exécutable » : vérification (aperçu), approbation de clé, installation suivie. */
export function ProcessInstallForm({
  pm,
  tx,
  setNotice,
}: {
  pm: ProcessModulesState;
  tx: ProcessTx;
  setNotice: (n: Notice) => void;
}) {
  const [releaseUrl, setReleaseUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<{ id: string; p: ProcessPreview } | null>(null);
  const [acceptKey, setAcceptKey] = useState(false);
  const [approveKeyChange, setApproveKeyChange] = useState(false);
  const [reinstall, setReinstall] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const resetInstall = () => {
    setPreview(null);
    setAcceptKey(false);
    setApproveKeyChange(false);
    setReinstall(false);
  };

  const onPreview = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const u = releaseUrl.trim();
    if (!/^https:\/\/\S+$/i.test(u)) {
      setNotice({ kind: 'error', text: tx.errUrl });
      return;
    }
    setBusy('preview');
    setNotice(null);
    resetInstall();
    const res = await serverApi.previewProcessModule({ release_url: u, public_key: publicKey, token });
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data && res.data.preview) {
      setPreview({ id: res.data.preview_id, p: res.data.preview });
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onInstall = async () => {
    if (!preview || busy) return;
    setBusy('install');
    setNotice(null);
    const res = await serverApi.installProcessModule(preview.id, {
      accept_key: acceptKey,
      approve_key_change: approveKeyChange,
      reinstall,
    });
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data) {
      pm.startJob(res.data.job_id, res.data.module_id);
      resetInstall();
      setReleaseUrl('');
      setPublicKey('');
      setToken('');
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const p = preview?.p;
  const needsKeyApproval = !!p && p.signed && !p.key_trusted;
  const keyChangeFrom = p?.key_change_from || null;
  const canInstall =
    !!p &&
    !busy &&
    !pm.jobRunning &&
    (!needsKeyApproval || (acceptKey && !!p.offered_public_key)) &&
    (!keyChangeFrom || approveKeyChange);
  const sameVersion = !!p && p.installed_version === p.release.version;

  return (
    <div class="grid gap-5 tv:gap-7">
      <p class="text-sm tv:text-lg max-w-2xl" style={{ color: C.muted }}>
        {tx.installHelp}
      </p>
      {pm.list?.platform && (
        <p class="-mt-3 text-xs tv:text-base" style={{ color: C.faint }}>
          {tx.platform} : {pm.list.platform}
        </p>
      )}
      <form class="grid gap-4 tv:gap-6" onSubmit={onPreview} autoComplete="off">
        <label class="grid gap-1.5">
          <span class="text-sm tv:text-lg">{tx.releaseUrl}</span>
          <input
            type="url"
            inputMode="url"
            data-focusable
            required
            class={inputClass}
            style={inputStyle}
            placeholder={tx.releaseUrlPlaceholder}
            value={releaseUrl}
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            onInput={(e) => setReleaseUrl((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1.5">
            <span class="text-sm tv:text-lg">{tx.publicKey}</span>
            <input
              type="text"
              data-focusable
              class={`${inputClass} font-mono`}
              style={monoStyle}
              placeholder={tx.keyValuePlaceholder}
              value={publicKey}
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              onInput={(e) => setPublicKey((e.currentTarget as HTMLInputElement).value)}
            />
            <span class="text-xs tv:text-base" style={{ color: C.faint }}>
              {tx.publicKeyHelp}
            </span>
          </label>
          <label class="grid gap-1.5 content-start">
            <span class="text-sm tv:text-lg">{tx.token}</span>
            <input
              type="password"
              data-focusable
              class={inputClass}
              style={inputStyle}
              placeholder={tx.tokenPlaceholder}
              value={token}
              autoComplete="new-password"
              autoCapitalize="none"
              spellcheck={false}
              onInput={(e) => setToken((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div>
          <button type="submit" data-focusable class={primaryBtn} style={primaryStyle} disabled={!!busy || pm.jobRunning}>
            <Icon name="search" />
            {busy === 'preview' ? tx.checking : tx.check}
          </button>
        </div>
      </form>

      {p && preview && (
        <div class={panelClass} aria-labelledby="process-preview-title">
          <h4 id="process-preview-title" class="mb-3 text-sm tv:text-lg" style={subHeadingStyle}>
            {tx.previewTitle}
          </h4>
          <FactList
            rows={[
              [tx.module, `${processModuleLabel(p.release.id, tx)} (${p.release.id})`, 'break-all'],
              [
                tx.version,
                `${p.release.version}${p.is_update && p.installed_version ? ` · ${tx.update(p.installed_version)}` : ''}`,
              ],
              [tx.size, `${formatSize(p.artifact.size)} · ${p.platform}`],
              [tx.sha256, p.artifact.sha256, 'font-mono text-xs tv:text-base break-all'],
              [
                tx.signature,
                <span style={{ color: p.signed && p.key_trusted ? C.ink : C.accent }}>
                  {!p.signed ? tx.unsigned : p.key_trusted ? tx.signedTrusted(p.key_label || p.key_id || '') : tx.signedUnknown}
                </span>,
              ],
              !!p.key_id && [tx.keyId, p.key_id, 'font-mono break-all'],
              needsKeyApproval && !!p.offered_public_key && [tx.offeredKey, p.offered_public_key, 'font-mono text-xs tv:text-base break-all'],
            ]}
          />

          {!p.signed && (
            <p role="alert" class="mt-4 flex gap-2 text-sm tv:text-lg" style={{ color: C.accent }}>
              <Icon name="warning" />
              <span>{tx.unsignedWarn}</span>
            </p>
          )}
          {needsKeyApproval && (
            <div class="mt-4 grid gap-3">
              <p role="alert" class="flex gap-2 text-sm tv:text-lg" style={{ color: C.accent }}>
                <Icon name="warning" />
                <span>{p.offered_public_key ? tx.unknownKeyWarn : tx.noOfferedKey}</span>
              </p>
              {p.offered_public_key && (
                <label class="flex items-start gap-3 text-sm tv:text-lg cursor-pointer">
                  <input
                    type="checkbox"
                    data-focusable
                    class={checkboxClass}
                    checked={acceptKey}
                    onChange={(e) => setAcceptKey((e.currentTarget as HTMLInputElement).checked)}
                  />
                  <span>{tx.acceptKey}</span>
                </label>
              )}
            </div>
          )}
          {keyChangeFrom && (
            <div class="mt-4 grid gap-3">
              <p role="alert" class="flex gap-2 text-sm tv:text-lg" style={{ color: C.accent }}>
                <Icon name="warning" />
                <span>{tx.keyChangeWarn(keyChangeFrom)}</span>
              </p>
              <label class="flex items-start gap-3 text-sm tv:text-lg cursor-pointer">
                <input
                  type="checkbox"
                  data-focusable
                  class={checkboxClass}
                  checked={approveKeyChange}
                  onChange={(e) => setApproveKeyChange((e.currentTarget as HTMLInputElement).checked)}
                />
                <span>{tx.approveKeyChange}</span>
              </label>
            </div>
          )}
          {sameVersion && (
            <label class="mt-4 flex items-start gap-3 text-sm tv:text-lg cursor-pointer">
              <input
                type="checkbox"
                data-focusable
                class={checkboxClass}
                checked={reinstall}
                onChange={(e) => setReinstall((e.currentTarget as HTMLInputElement).checked)}
              />
              <span>{tx.reinstall}</span>
            </label>
          )}
          <div class="mt-5 flex flex-wrap gap-2">
            <ActionButton
              label={p.is_update ? tx.installUpdate : tx.install}
              icon="download"
              primary
              disabled={!canInstall || (sameVersion && !reinstall)}
              onClick={() => void onInstall()}
            />
            <ActionButton label={tx.cancel} icon="rollback" disabled={!!busy} onClick={resetInstall} />
          </div>
        </div>
      )}

      <ProcessJobProgress job={pm.job} tx={tx} />
    </div>
  );
}

/** Fiche d'un module process : actions, journal, réglages JSON. */
export function ProcessModuleDetail({
  m,
  pm,
  tx,
  language,
  setNotice,
  onRemoved,
}: {
  m: ProcessModule;
  pm: ProcessModulesState;
  tx: ProcessTx;
  language: string;
  setNotice: (n: Notice) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'uninstall' | 'rollback' | null>(null);
  const [removeData, setRemoveData] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<ProcessLogLine[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsText, setSettingsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Journal : sondage toutes les 3 secondes tant qu'il est ouvert.
  useEffect(() => {
    if (!logsOpen) return;
    let stopped = false;
    const load = async () => {
      const res = await serverApi.getProcessModuleLogs(m.id, 200);
      if (stopped || !alive.current) return;
      if (res.success && res.data && Array.isArray(res.data.lines)) setLogs(res.data.lines);
    };
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [logsOpen, m.id]);

  const onAction = async (action: 'start' | 'stop' | 'restart' | 'rollback' | 'update') => {
    if (busy) return;
    setBusy(action);
    setNotice(null);
    setConfirm(null);
    const res = await serverApi.processModuleAction(m.id, action);
    if (!alive.current) return;
    setBusy(null);
    if (!res.success) {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
      return;
    }
    if (action === 'update' && res.data?.job_id) {
      pm.startJob(res.data.job_id, res.data.module_id || m.id);
      return;
    }
    const text =
      action === 'rollback'
        ? tx.actionDone.rollback(res.data?.version || '')
        : action === 'update'
          ? tx.actionDone.restart
          : tx.actionDone[action];
    setNotice({ kind: 'ok', text });
    await pm.refresh();
    await refreshCapabilitiesNow();
    // Démarrage asynchrone : le module annonce ses fonctions une fois « running ». Seconde lecture
    // différée pour que menus et pages reflètent le nouvel état sans recharger.
    if (action === 'start' || action === 'restart' || action === 'rollback' || action === 'update') {
      setTimeout(() => {
        void pm.refresh();
        void refreshCapabilitiesNow();
      }, 3000);
    }
  };

  const onUninstall = async () => {
    if (busy) return;
    setBusy('uninstall');
    setNotice(null);
    const res = await serverApi.uninstallProcessModule(m.id, removeData);
    if (!alive.current) return;
    setBusy(null);
    setConfirm(null);
    setRemoveData(false);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.actionDone.uninstall });
      onRemoved();
      await pm.refresh();
      await refreshCapabilitiesNow();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const toggleSettings = async () => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    setSettingsError(null);
    setBusy('settings');
    const res = await serverApi.getProcessModuleSettings(m.id);
    if (!alive.current) return;
    setBusy(null);
    if (res.success) {
      setSettingsText(JSON.stringify(res.data ?? {}, null, 2));
      setSettingsOpen(true);
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const saveSettings = async () => {
    if (busy) return;
    let value: unknown;
    try {
      value = JSON.parse(settingsText || '{}');
    } catch {
      setSettingsError(tx.errJson);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      setSettingsError(tx.errJson);
      return;
    }
    setSettingsError(null);
    setBusy('save');
    const res = await serverApi.putProcessModuleSettings(m.id, value as Record<string, unknown>);
    if (!alive.current) return;
    setBusy(null);
    if (res.success) setNotice({ kind: 'ok', text: tx.saved });
    else setSettingsError(errorMessage(res, tx));
  };

  const running = m.state === 'running' || m.state === 'starting' || m.state === 'degraded';
  const previous = m.installed_versions.filter((v) => v !== m.version);
  const keys = pm.trust?.keys ?? [];
  const keyLabelOf = m.signed_by ? keys.find((k) => k.key_id === m.signed_by)?.label || m.signed_by : null;
  const locked = !!busy || pm.jobRunning;
  const jobForThis = pm.job && pm.job.moduleId === m.id ? pm.job : null;

  return (
    <div class="grid gap-5 tv:gap-7">
      <FactList
        rows={[
          [tx.state, <span style={{ color: m.state === 'failed' || m.state === 'degraded' ? C.accent : C.ink }}>{tx.states[m.state] ?? m.state}</span>],
          [tx.version, m.version || '—'],
          m.restarts > 0 && [tx.restartsLabel, String(m.restarts)],
          [tx.signedBy, keyLabelOf ?? tx.unsignedModule, 'break-all'],
          !!m.installed_at && [tx.installedAt, formatDate(m.installed_at, language)],
          m.provides.length > 0 && [tx.provides, m.provides.join(', ')],
          m.installed_versions.length > 1 && [tx.versions, m.installed_versions.join(', ')],
          !!m.release_url && [tx.source, m.release_url, 'break-all text-xs tv:text-base'],
          // Conservé par le serveur après une reprise : « Dernier incident » (daté) si le module tourne.
          !!m.last_error && [
            m.state === 'running' ? tx.lastIncident : tx.lastError,
            <span style={{ color: m.state === 'running' ? C.faint : C.accent }}>
              {m.last_error_at
                ? `${new Date(m.last_error_at).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · `
                : ''}
              {m.last_error}
            </span>,
          ],
        ]}
      />

      <div class="flex flex-wrap gap-2">
        {confirm === 'uninstall' ? (
          <>
            <label class="flex items-center gap-2 text-sm tv:text-lg mr-2 cursor-pointer">
              <input
                type="checkbox"
                data-focusable
                class={checkboxClass}
                checked={removeData}
                onChange={(e) => setRemoveData((e.currentTarget as HTMLInputElement).checked)}
              />
              <span>{tx.removeData}</span>
            </label>
            <ActionButton label={tx.confirmUninstall} icon="trash" primary disabled={locked} onClick={() => void onUninstall()} />
            <ActionButton label={tx.cancel} icon="rollback" disabled={locked} onClick={() => setConfirm(null)} />
          </>
        ) : confirm === 'rollback' ? (
          <>
            <ActionButton
              label={`${tx.confirmRollback} (${previous[previous.length - 1] || ''})`}
              icon="rollback"
              primary
              disabled={locked}
              onClick={() => void onAction('rollback')}
            />
            <ActionButton label={tx.cancel} icon="rollback" disabled={locked} onClick={() => setConfirm(null)} />
          </>
        ) : (
          <>
            {running ? (
              <ActionButton label={tx.stop} icon="stop" disabled={locked} onClick={() => void onAction('stop')} />
            ) : m.state === 'failed' ? (
              <ActionButton label={tx.restart} icon="restart" primary disabled={locked} onClick={() => void onAction('restart')} />
            ) : (
              <ActionButton label={tx.start} icon="play" primary disabled={locked} onClick={() => void onAction('start')} />
            )}
            {running && <ActionButton label={tx.restart} icon="restart" disabled={locked} onClick={() => void onAction('restart')} />}
            <ActionButton label={tx.checkUpdate} icon="download" disabled={locked} onClick={() => void onAction('update')} />
            {previous.length > 0 && (
              <ActionButton label={tx.rollbackBtn} icon="rollback" disabled={locked} onClick={() => setConfirm('rollback')} />
            )}
            <ActionButton
              label={logsOpen ? tx.hideLogs : tx.logs}
              icon="log"
              onClick={() => {
                setLogs([]);
                setLogsOpen(!logsOpen);
              }}
            />
            <ActionButton
              label={settingsOpen ? tx.hideSettings : tx.settings}
              icon="settings"
              disabled={locked}
              onClick={() => void toggleSettings()}
            />
            <ActionButton
              label={tx.uninstall}
              icon="trash"
              disabled={locked}
              onClick={() => {
                setRemoveData(false);
                setConfirm('uninstall');
              }}
            />
          </>
        )}
      </div>

      <ProcessJobProgress job={jobForThis} tx={tx} />

      {logsOpen && (
        <pre
          class="max-h-80 tv:max-h-[28rem] overflow-auto rounded-xl border border-white/10 p-3 text-xs tv:text-base whitespace-pre-wrap break-words"
          style={monoStyle}
          tabIndex={0}
          data-focusable
          aria-label={tx.logs}
        >
          {logs.length === 0
            ? tx.noLogs
            : logs.map((l, i) => (
                <div key={i} style={{ color: l.stream === 'stderr' ? C.accent : C.ink }}>
                  <span style={{ color: C.faint }}>{formatTime(l.ts, language)} </span>
                  {l.line}
                </div>
              ))}
        </pre>
      )}

      {settingsOpen && (
        <div class="grid gap-3">
          <p class="text-xs tv:text-base" style={{ color: C.faint }}>
            {tx.settingsHelp}
          </p>
          <textarea
            data-focusable
            rows={8}
            class={textareaClass}
            style={monoStyle}
            value={settingsText}
            spellcheck={false}
            aria-label={tx.settings}
            onInput={(e) => setSettingsText((e.currentTarget as HTMLTextAreaElement).value)}
          />
          {settingsError && (
            <p role="alert" class="text-sm tv:text-lg" style={{ color: C.accent }}>
              {settingsError}
            </p>
          )}
          <div>
            <ActionButton label={tx.save} icon="settings" primary disabled={!!busy} onClick={() => void saveSettings()} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Gestion des clés de confiance (liste, retrait confirmé, ajout). */
export function TrustKeysPanel({
  pm,
  tx,
  language,
  setNotice,
}: {
  pm: ProcessModulesState;
  tx: ProcessTx;
  language: string;
  setNotice: (n: Notice) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onAddKey = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    if (!keyValue.trim()) {
      setNotice({ kind: 'error', text: tx.errKey });
      return;
    }
    setBusy('addkey');
    setNotice(null);
    const res = await serverApi.addTrustKey(keyValue, keyLabel);
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data) {
      setNotice({ kind: 'ok', text: tx.keyAdded(res.data.key_id) });
      setKeyLabel('');
      setKeyValue('');
      await pm.refresh();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onRemoveKey = async (keyId: string) => {
    if (busy) return;
    setBusy(`rm:${keyId}`);
    setNotice(null);
    const res = await serverApi.removeTrustKey(keyId);
    if (!alive.current) return;
    setBusy(null);
    setConfirmKey(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.keyRemoved });
      await pm.refresh();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const keys = pm.trust?.keys ?? [];
  const bindings = pm.trust?.bindings ?? {};
  const locked = !!busy || pm.jobRunning;

  return (
    <div class="grid gap-5 tv:gap-7">
      <WarningBox>
        <p>{tx.trustWarn}</p>
      </WarningBox>

      {pm.trust && keys.length === 0 && (
        <p class="text-sm tv:text-lg" style={{ color: C.muted }}>
          {tx.trustNone}
        </p>
      )}
      {keys.length > 0 && (
        <ul class="divide-y divide-white/10" data-tv-list>
          {keys.map((k) => {
            const bound = Object.keys(bindings).filter((mid) => bindings[mid] === k.key_id);
            return (
              <li key={k.key_id} class="py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-tv-list-item>
                <div class="flex gap-3 min-w-0">
                  <span class="mt-0.5 shrink-0" style={{ color: C.accent }}>
                    <Icon name="key" />
                  </span>
                  <div class="min-w-0">
                    <p class="text-base tv:text-xl break-words">{k.label || k.key_id}</p>
                    <p class="mt-0.5 text-xs tv:text-base font-mono break-all" style={{ color: C.faint }}>
                      {k.key_id}
                    </p>
                    <p class="mt-0.5 text-xs tv:text-base" style={{ color: C.faint }}>
                      {k.added_at ? `${tx.addedAt} ${formatDate(k.added_at, language)} · ` : ''}
                      {tx.keyModules} : {bound.length ? bound.join(', ') : '—'}
                    </p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                  {k.official ? (
                    <span class="inline-flex items-center gap-2 text-xs tv:text-base" style={{ color: C.accent }}>
                      <Icon name="lock" />
                      {tx.officialKey}
                    </span>
                  ) : confirmKey === k.key_id ? (
                    <>
                      <ActionButton label={tx.confirmRemoveKey} icon="trash" primary disabled={locked} onClick={() => void onRemoveKey(k.key_id)} />
                      <ActionButton label={tx.cancel} icon="rollback" disabled={locked} onClick={() => setConfirmKey(null)} />
                    </>
                  ) : (
                    <ActionButton label={tx.removeKey} icon="trash" disabled={locked} onClick={() => setConfirmKey(k.key_id)} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form class="grid gap-4 sm:grid-cols-[1fr,2fr] sm:items-end" onSubmit={onAddKey} autoComplete="off">
        <label class="grid gap-1.5">
          <span class="text-sm tv:text-lg">{tx.keyLabel}</span>
          <input
            type="text"
            data-focusable
            class={inputClass}
            style={inputStyle}
            placeholder={tx.keyLabelPlaceholder}
            value={keyLabel}
            maxLength={80}
            onInput={(e) => setKeyLabel((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="grid gap-1.5">
          <span class="text-sm tv:text-lg">{tx.keyValue}</span>
          <input
            type="text"
            data-focusable
            class={`${inputClass} font-mono`}
            style={monoStyle}
            placeholder={tx.keyValuePlaceholder}
            value={keyValue}
            autoCapitalize="none"
            spellcheck={false}
            onInput={(e) => setKeyValue((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="sm:col-span-2">
          <button type="submit" data-focusable class={secondaryBtn} style={secondaryStyle} disabled={locked}>
            <Icon name="key" />
            {tx.addKey}
          </button>
        </div>
      </form>
    </div>
  );
}
