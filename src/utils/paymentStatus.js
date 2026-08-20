const PAYMENT_STATUS_LABELS = Object.freeze({
  PENDING: 'En attente',
  VALIDATED: 'Validé',
  REJECTED: 'Rejeté',
});

function paymentStatusLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return PAYMENT_STATUS_LABELS[key] || (value ? String(value) : '—');
}

module.exports = {
  PAYMENT_STATUS_LABELS,
  paymentStatusLabel,
};
