const PAYROLL_STATUS_LABELS = Object.freeze({
  DRAFT: 'Brouillon',
  VALIDATED: 'Validé',
  PAID: 'Payé',
});

const LEAVE_STATUS_LABELS = Object.freeze({
  PENDING: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Refusé',
  CANCELLED: 'Annulé',
});

const LEAVE_TYPE_LABELS = Object.freeze({
  ANNUAL: 'Congé annuel',
  SICK: 'Maladie',
  UNPAID: 'Sans solde',
  MATERNITY: 'Maternité',
  OTHER: 'Autre',
});

const STAFF_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Actif',
  ON_LEAVE: 'En congé',
  SUSPENDED: 'Suspendu',
  TERMINATED: 'Sorti',
});

const ATTENDANCE_STATUS_LABELS = Object.freeze({
  PRESENT: 'Présent',
  LATE: 'Retard',
  ABSENT: 'Absent',
  HALF_DAY: 'Demi-journée',
});

const ADVANCE_STATUS_LABELS = Object.freeze({
  PENDING: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Refusé',
  DEDUCTED: 'Déduit',
});

const CONTRACT_TYPE_LABELS = Object.freeze({
  CDI: 'CDI',
  CDD: 'CDD',
  VACATAIRE: 'Vacataire',
  STAGE: 'Stage',
});

const JOB_TITLE_LABELS = Object.freeze({
  TEACHER: 'Enseignant',
  SECRETARIAT: 'Secrétariat',
  ACCOUNTANT: 'Comptabilité',
  LIFE_SCHOOL: 'Vie scolaire',
  MAINTENANCE: 'Entretien',
  SECURITY: 'Sécurité',
  OTHER: 'Autre',
});

const SUPPLIER_INVOICE_STATUS_LABELS = Object.freeze({
  PENDING: 'En attente',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
});

function payrollStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return PAYROLL_STATUS_LABELS[key] || (value ? String(value) : '—');
}

function leaveStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return LEAVE_STATUS_LABELS[key] || (value ? String(value) : '—');
}

function leaveTypeLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return LEAVE_TYPE_LABELS[key] || (value ? String(value) : '—');
}

function staffStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return STAFF_STATUS_LABELS[key] || (value ? String(value) : '—');
}

function attendanceStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return ATTENDANCE_STATUS_LABELS[key] || (value ? String(value) : '—');
}

function advanceStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return ADVANCE_STATUS_LABELS[key] || (value ? String(value) : '—');
}

function contractTypeLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return CONTRACT_TYPE_LABELS[key] || (value ? String(value) : '—');
}

function jobTitleLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return JOB_TITLE_LABELS[key] || (value ? String(value) : '—');
}

function supplierInvoiceStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return SUPPLIER_INVOICE_STATUS_LABELS[key] || (value ? String(value) : '—');
}

module.exports = {
  PAYROLL_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  STAFF_STATUS_LABELS,
  ATTENDANCE_STATUS_LABELS,
  ADVANCE_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  JOB_TITLE_LABELS,
  SUPPLIER_INVOICE_STATUS_LABELS,
  payrollStatusLabel,
  leaveStatusLabel,
  leaveTypeLabel,
  staffStatusLabel,
  attendanceStatusLabel,
  advanceStatusLabel,
  contractTypeLabel,
  jobTitleLabel,
  supplierInvoiceStatusLabel,
};
