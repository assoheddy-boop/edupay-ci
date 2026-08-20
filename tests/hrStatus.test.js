const {
  payrollStatusLabel,
  leaveStatusLabel,
  staffStatusLabel,
  jobTitleLabel,
} = require('../src/utils/hrStatus');

describe('hrStatus labels', () => {
  test('translates payroll statuses', () => {
    expect(payrollStatusLabel('PAID')).toBe('Payé');
    expect(payrollStatusLabel('DRAFT')).toBe('Brouillon');
  });

  test('translates leave and staff statuses', () => {
    expect(leaveStatusLabel('APPROVED')).toBe('Approuvé');
    expect(staffStatusLabel('ON_LEAVE')).toBe('En congé');
  });

  test('translates job titles', () => {
    expect(jobTitleLabel('SECRETARIAT')).toBe('Secrétariat');
  });
});
