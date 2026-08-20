const { consolidate, collectionRate } = require('../src/utils/group');

describe('group dashboard KPIs', () => {
  test('consolidate aggregates enrollments, revenue and unpaid across campuses', () => {
    const snapshots = [
      {
        students: 120,
        teachers: 8,
        classes: 6,
        revenue: 500000,
        pendingAmount: 80000,
        pendingCount: 12,
        validatedCount: 40,
        absences: 5,
        pendingLeaves: 1,
        staffActive: 10,
        avgGrade: 12.5,
      },
      {
        students: 80,
        teachers: 5,
        classes: 4,
        revenue: 300000,
        pendingAmount: 20000,
        pendingCount: 3,
        validatedCount: 25,
        absences: 2,
        pendingLeaves: 0,
        staffActive: 6,
        avgGrade: 11,
      },
    ];

    const totals = consolidate(snapshots);

    expect(totals.campuses).toBe(2);
    expect(totals.students).toBe(200);
    expect(totals.teachers).toBe(13);
    expect(totals.revenue).toBe(800000);
    expect(totals.pendingAmount).toBe(100000);
    expect(totals.pendingCount).toBe(15);
    expect(totals.collectionRate).toBe(collectionRate(800000, 100000));
    expect(totals.avgGrade).toBeCloseTo(11.75, 2);
  });

  test('consolidate handles empty group', () => {
    const totals = consolidate([]);
    expect(totals.campuses).toBe(0);
    expect(totals.students).toBe(0);
    expect(totals.revenue).toBe(0);
    expect(totals.pendingAmount).toBe(0);
    expect(totals.collectionRate).toBe(0);
  });
});
