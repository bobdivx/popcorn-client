/**
 * Étape « Indexers » de l'assistant de premier lancement : FACULTATIVE.
 *
 * Sans indexer, la bibliothèque locale (fichiers déjà présents sur le serveur) fonctionne
 * normalement ; les indexers s'ajoutent plus tard depuis Paramètres → Modules → Indexers.
 * On peut donc toujours quitter l'étape : « Suivant » quand au moins un indexer est configuré,
 * « Passer cette étape » sinon.
 */
export type IndexersStepContinueAction = 'next' | 'skip';

export function getIndexersStepContinueAction(indexerCount: number): IndexersStepContinueAction {
  return indexerCount > 0 ? 'next' : 'skip';
}

