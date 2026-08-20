/**
 * Textes d'aide contextuelle (tooltips « ? ») — titres, modules et sections.
 * Utiliser via partial views/partials/_helpKey.ejs : { key: 'nav.administration' }
 */
const UI_HELP = Object.freeze({
  // ——— Menu latéral (groupes) ———
  'nav.administration': {
    label: 'Administration scolaire',
    text: 'Classes, élèves, inscriptions, réinscriptions, paramètres et portail public.',
  },
  'nav.vie-scolaire': {
    label: 'Vie scolaire',
    text: 'Vie quotidienne : emploi du temps, absences, cantine, activités et sorties.',
  },
  'nav.examens': {
    label: 'Examens & évaluations',
    text: 'Notes, bulletins, délibérations, convocations et palmarès.',
  },
  'nav.finances': {
    label: 'Finances & comptabilité',
    text: 'Frais de scolarité, paiements, caisse, remises sociales et comptabilité.',
  },
  'nav.communication': {
    label: 'Communication',
    text: 'Messages internes et SMS officiels aux parents.',
  },
  'nav.rapports': {
    label: 'Rapports & statistiques',
    text: 'Graphiques d\'analyse, élèves à risque et statistiques globales.',
  },

  // ——— Liens menu (principaux) ———
  'nav.classes': { label: 'Classes', text: 'Créer et gérer les classes, effectifs et exports.' },
  'nav.students': { label: 'Élèves', text: 'Liste des élèves ; cliquez un nom pour voir sa situation complète.' },
  'nav.inscriptions': { label: 'Fiches inscription', text: 'Fiche CI : identité, famille, parcours et dossier pièces.' },
  'nav.reinscriptions': { label: 'Réinscriptions', text: 'Promotions et redoublements pour la nouvelle année.' },
  'nav.bulletins': { label: 'Bulletins', text: 'Génération et téléchargement des bulletins PDF.' },
  'nav.caisse': { label: 'Caisse', text: 'Encaissement sur place (espèces, Wave, Orange Money).' },
  'nav.risques': { label: 'Risques', text: 'Élèves à suivre selon moyenne, absences et retards (règles pédagogiques).' },

  // ——— Pages ———
  'page.reinscription': {
    label: 'Réinscriptions',
    text: 'Préparez la rentrée : inscrivez chaque élève en classe suivante ou en redoublement.',
  },
  'page.inscriptions': {
    label: 'Fiches d\'inscription',
    text: 'Enregistrez les nouveaux élèves et complétez le dossier administratif CI.',
  },
  'page.inscription-form': {
    label: 'Fiche d\'inscription',
    text: 'Formulaire complet type Vie Scolaire : identité, famille, parcours et pièces.',
  },
  'page.student-situation': {
    label: 'Situation élève',
    text: 'Vue synthèse : ce que vous voyez dépend de votre rôle (secrétariat, compta, vie scolaire…).',
  },
  'page.students': {
    label: 'Élèves',
    text: 'Gérez les fiches élèves ; cliquez sur un nom pour ouvrir sa situation.',
  },

  // ——— Réinscriptions (stats & tableaux) ———
  'reinscription.total': { label: 'Total inscrits', text: 'Nombre d\'élèves de l\'établissement.' },
  'reinscription.promoted': { label: 'Promus', text: 'Élèves passés en classe supérieure.' },
  'reinscription.repeaters-class': { label: 'Redoublants par classe', text: 'Nombre de redoublants dans chaque classe.' },
  'reinscription.absences-compare': { label: 'Absences moyennes', text: 'Compare les absences des redoublants vs les autres élèves.' },
  'reinscription.students-table': { label: 'Liste élèves', text: 'Cliquez sur un nom pour voir sa situation. Réinscrivez ceux non encore inscrits.' },
  'reinscription.cause-probable': { label: 'Cause probable', text: 'Estimation selon absences (> 30 j.) et moyenne (< 10/20).' },

  // ——— Fiche inscription (sections) ———
  'inscription.identite': { label: 'Identité & scolarité', text: 'État civil, matricules MEN/école, classe et extrait de naissance.' },
  'inscription.famille': { label: 'Famille & parcours', text: 'Parents, tuteur, établissement d\'origine et décision de transfert.' },
  'inscription.dossier': { label: 'Dossier — pièces', text: 'Cochez les documents remis par la famille (photos, carnet, certificat médical…).' },
  'inscription.certificats': { label: 'Certificats', text: 'Documents officiels PDF : certificat de scolarité et attestation d\'inscription.' },
  'inscription.men': { label: 'Matricule national', text: 'Numéro MEN unique ; la loupe recherche une fiche déjà enregistrée.' },

  // ——— Situation élève (sections) ———
  'situation.suivi-pedagogique': {
    label: 'Suivi pédagogique',
    text: 'Niveau de vigilance (élevé/moyen/faible) selon moyenne trimestrielle, absences et retards.',
  },
  'situation.inscription': { label: 'Inscription', text: 'Statut, LV2, provenance et historique des années scolaires.' },
  'situation.finance': { label: 'Scolarité & paiements', text: 'Montants dus, payés et reste à payer par type de frais.' },
  'situation.social': { label: 'Cas social', text: 'Remise ou bourse active pour cet élève.' },
  'situation.notes': { label: 'Notes & bulletins', text: 'Dernières notes, délibérations et bulletins PDF disponibles.' },
  'situation.absences': { label: 'Absences & retards', text: 'Historique récent et statut des justificatifs.' },
  'situation.discipline': { label: 'Discipline', text: 'Badges, encouragements et notes de comportement.' },
  'situation.cantine': { label: 'Cantine', text: 'Présence aux repas enregistrés récemment.' },
  'situation.activites': { label: 'Activités', text: 'Inscriptions aux activités extrascolaires.' },
});

function getUiHelp(key) {
  return UI_HELP[key] || null;
}

module.exports = {
  UI_HELP,
  getUiHelp,
};
