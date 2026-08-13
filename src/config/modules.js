const MODULES = {
  payments: { label: 'Paiements Wave/OM', description: 'Encaissement et validation Wave/Orange Money', default: true, core: true },
  grades: { label: 'Notes', description: 'Saisie et consultation des notes', default: true, core: true },
  absences: { label: 'Absences', description: 'Suivi absences et retards', default: true },
  bulletins: { label: 'Bulletins PDF', description: 'Génération automatique des bulletins', default: true },
  chat: { label: 'Messages', description: 'Chat école, parents, enseignants', default: true },
  homeworks: { label: 'Devoirs', description: 'Publication devoirs pour les parents', default: true },
  transport: { label: 'Transport', description: 'Suivi bus et trajets', default: true },
  canteen: { label: 'Cantine', description: 'Menus et présences repas', default: true },
  behavior: { label: 'Badges & comportement', description: 'Récompenses et discipline', default: true },
  health: { label: 'Santé', description: 'Signalements santé aux parents', default: true },
  pickup: { label: 'Sortie école', description: 'Autorisation QR sortie', default: true },
  activities: { label: 'Activités extrascolaires', description: 'Inscriptions activités', default: true },
  lost_items: { label: 'Objets perdus', description: 'Objets trouvés à l\'école', default: true },
  stats: { label: 'Statistiques & exports', description: 'Tableaux de bord et Excel', default: true },
  accounting: { label: 'Comptabilité avancée', description: 'Trésorerie, dépenses, rapports financiers', default: true },
  multi_campus: { label: 'Multi-campus', description: 'Vue groupe et campus multiples', default: true },
  hr: { label: 'Ressources humaines', description: 'Dossiers personnel, paie, congés, présence et évaluations', default: true },
};

const MODULE_KEYS = Object.keys(MODULES);

module.exports = { MODULES, MODULE_KEYS };
