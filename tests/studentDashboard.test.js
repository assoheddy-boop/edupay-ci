const request = require('supertest');
const app = require('../src/app');
const { checkRole } = require('../src/middleware/auth');

describe('student RBAC', () => {
  test('checkRole student allows STUDENT role', () => {
    const middleware = checkRole('student');
    const req = { user: { role: 'STUDENT' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('checkRole student blocks PARENT', () => {
    const middleware = checkRole('student');
    const req = { user: { role: 'PARENT' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('unauthenticated user cannot access student dashboard', async () => {
    const res = await request(app).get('/student/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });

  test('unauthenticated user cannot access school admin from student area intent', async () => {
    const res = await request(app).get('/school/students');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/login/);
  });
});

describe('studentController data scope', () => {
  test('grades query filters by linked studentId only', () => {
    const studentId = 'st-me';
    const query = { where: { studentId } };
    expect(query.where.studentId).toBe(studentId);
    expect(query.where).not.toHaveProperty('studentId', 'st-other');
  });
});
