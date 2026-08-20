/** Pièces du dossier — aligné fiche inscription vie scolaire CI. */
const ENROLLMENT_DOCUMENTS = Object.freeze([
  { key: 'photos', label: 'Photos' },
  { key: 'extraitNaissance', label: 'Extrait de naissance' },
  { key: 'certificatScolarite', label: 'Certificat de scolarité' },
  { key: 'carnetCorrespondance', label: 'Carnet de correspondance' },
  { key: 'visiteMedicale', label: 'Visite médicale' },
  { key: 'carteAcces', label: 'Carte d\'accès' },
  { key: 'macaron', label: 'Macaron' },
  { key: 'teeShirt', label: 'Tee-shirt' },
  { key: 'short', label: 'Short' },
  { key: 'droitExamen', label: 'Droit d\'examen' },
  { key: 'livretScolaire', label: 'Livret scolaire' },
  { key: 'manuelInformatique', label: 'Manuel informatique' },
  { key: 'carteIdentiteUnique', label: 'Carte d\'identité unique' },
  { key: 'inscriptionLigne', label: 'Insc. ligne' },
]);

const ENROLLMENT_STATUS_OPTIONS = Object.freeze([
  { value: 'NOUVEAU', label: 'Nouvel élève' },
  { value: 'REINSCRIPTION', label: 'Réinscription' },
  { value: 'TRANSFERT', label: 'Transfert' },
  { value: 'REAFFECTATION', label: 'Réaffectation' },
]);

const LV2_OPTIONS = Object.freeze([
  { value: '', label: '— Non renseigné —' },
  { value: 'ANGLAIS', label: 'Anglais' },
  { value: 'ALLEMAND', label: 'Allemand' },
  { value: 'ESPAGNOL', label: 'Espagnol' },
  { value: 'ARABE', label: 'Arabe' },
  { value: 'PORTUGAIS', label: 'Portugais' },
]);

function parseDocumentsChecklist(body) {
  const checklist = {};
  for (const doc of ENROLLMENT_DOCUMENTS) {
    checklist[doc.key] = body[`doc_${doc.key}`] === 'on' || body[`doc_${doc.key}`] === 'true';
  }
  return checklist;
}

function emptyChecklist() {
  return Object.fromEntries(ENROLLMENT_DOCUMENTS.map((d) => [d.key, false]));
}

function mergeChecklist(stored) {
  const base = emptyChecklist();
  if (!stored || typeof stored !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (stored[key] === true) base[key] = true;
  }
  return base;
}

module.exports = {
  ENROLLMENT_DOCUMENTS,
  ENROLLMENT_STATUS_OPTIONS,
  LV2_OPTIONS,
  parseDocumentsChecklist,
  emptyChecklist,
  mergeChecklist,
};
