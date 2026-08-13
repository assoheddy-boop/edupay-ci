const { collectionRate, consolidate } = require('../src/utils/group');

describe('group collectionRate', () => {
  test('returns 0 when nothing billed', () => {
    expect(collectionRate(0, 0)).toBe(0);
  });

  test('computes percentage of validated vs pending', () => {
    expect(collectionRate(75000, 25000)).toBe(75);
  });
});

describe('group consolidate', () => {
  test('sums campus snapshots', () => {
    const totals = consolidate([
      {
        students: 10, teachers: 2, classes: 1, revenue: 1000, pendingAmount: 500,
        pendingCount: 1, validatedCount: 2, absences: 3, pendingLeaves: 1, staffActive: 2, avgGrade: 12,
      },
      {
        students: 5, teachers: 1, classes: 1, revenue: 3000, pendingAmount: 500,
        pendingCount: 0, validatedCount: 4, absences: 1, pendingLeaves: 0, staffActive: 1, avgGrade: 14,
      },
    ]);
    expect(totals.campuses).toBe(2);
    expect(totals.students).toBe(15);
    expect(totals.revenue).toBe(4000);
    expect(totals.collectionRate).toBe(80);
    expect(totals.avgGrade).toBe(13);
  });
});
