const { hasEffectiveRole } = require('./adminAssist');

/**
 * RBAC staff école (SchoolStaffRole).
 * ORGANIZATION_ADMIN (fondateur / admin groupe) : tableau de bord dédié `/group/dashboard`
 * — hors périmètre SchoolStaffRole ; voir groupController.
 */
/** Clés de permission alignées sur les modules EduConnect. */
const PERMISSIONS = Object.freeze({
  STUDENTS_READ: 'students:read',
  STUDENTS_WRITE: 'students:write',
  ENROLLMENTS_READ: 'enrollments:read',
  ENROLLMENTS_WRITE: 'enrollments:write',
  CLASSES_READ: 'classes:read',
  CLASSES_WRITE: 'classes:write',
  TEACHERS_READ: 'teachers:read',
  TEACHERS_WRITE: 'teachers:write',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  SCHOOL_YEAR: 'school_year:write',
  COEFFICIENTS: 'coefficients:write',
  BULLETINS_READ: 'bulletins:read',
  BULLETINS_WRITE: 'bulletins:write',
  CERTIFICATES: 'certificates:write',
  CONVOCATIONS: 'convocations:write',
  EMARGEMENTS: 'emargements:write',
  DELIBERATIONS: 'deliberations:write',
  PALMARES: 'palmares:read',
  FEES_READ: 'fees:read',
  FEES_WRITE: 'fees:write',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
  CAISSE: 'caisse:write',
  ACCOUNTING_READ: 'accounting:read',
  ACCOUNTING_WRITE: 'accounting:write',
  SOCIAL_CASES: 'social_cases:write',
  HR_READ: 'hr:read',
  HR_WRITE: 'hr:write',
  ABSENCES: 'absences:write',
  CANTEEN: 'canteen:write',
  ACTIVITIES: 'activities:write',
  DISCIPLINE: 'discipline:write',
  PICKUP: 'pickup:write',
  LOST_ITEMS: 'lost_items:write',
  MESSAGES: 'messages:write',
  STATS: 'stats:read',
  SMS: 'sms:write',
  PORTAL: 'portal:write',
  DASHBOARD: 'dashboard:read',
});

const STAFF_ROLE_LABELS = Object.freeze({
  DIRECTOR: 'Direction',
  SECRETARIAT: 'Secrétariat',
  ACCOUNTANT: 'Comptabilité',
  EDUCATOR: 'Éducateur',
  LIFE_SCHOOL: 'Vie scolaire',
  HR_MANAGER: 'Ressources humaines',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  DIRECTOR: ALL_PERMISSIONS,

  SECRETARIAT: [
    PERMISSIONS.DASHBOARD,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_WRITE,
    PERMISSIONS.ENROLLMENTS_READ,
    PERMISSIONS.ENROLLMENTS_WRITE,
    PERMISSIONS.CLASSES_READ,
    PERMISSIONS.CLASSES_WRITE,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.BULLETINS_READ,
    PERMISSIONS.BULLETINS_WRITE,
    PERMISSIONS.CERTIFICATES,
    PERMISSIONS.CONVOCATIONS,
    PERMISSIONS.EMARGEMENTS,
    PERMISSIONS.DELIBERATIONS,
    PERMISSIONS.PALMARES,
    PERMISSIONS.FEES_READ,
    PERMISSIONS.FEES_WRITE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_WRITE,
    PERMISSIONS.CAISSE,
    PERMISSIONS.MESSAGES,
    PERMISSIONS.STATS,
    PERMISSIONS.SMS,
  ],

  ACCOUNTANT: [
    PERMISSIONS.DASHBOARD,
    PERMISSIONS.ACCOUNTING_READ,
    PERMISSIONS.ACCOUNTING_WRITE,
    PERMISSIONS.FEES_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.STATS,
  ],

  HR_MANAGER: [
    PERMISSIONS.DASHBOARD,
    PERMISSIONS.HR_READ,
    PERMISSIONS.HR_WRITE,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.STATS,
  ],

  EDUCATOR: [
    PERMISSIONS.DASHBOARD,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.ABSENCES,
    PERMISSIONS.SOCIAL_CASES,
    PERMISSIONS.DISCIPLINE,
    PERMISSIONS.CLASSES_READ,
  ],

  LIFE_SCHOOL: [
    PERMISSIONS.DASHBOARD,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.DISCIPLINE,
    PERMISSIONS.ACTIVITIES,
    PERMISSIONS.CANTEEN,
    PERMISSIONS.PICKUP,
    PERMISSIONS.LOST_ITEMS,
    PERMISSIONS.CLASSES_READ,
  ],
});

function isSchoolPrimaryAdmin(user, schoolId) {
  if (!user?.id || !schoolId) return false;
  // Titular director only: School.adminId === user.id (not staff with hydrated school).
  return Boolean(user.school?.id === schoolId && user.school.adminId === user.id);
}

function findStaffAssignment(user, schoolId) {
  if (!user?.staffAssignments?.length || !schoolId) return null;
  return user.staffAssignments.find((a) => a.schoolId === schoolId) || null;
}

/**
 * Rôle staff effectif pour une école.
 * SCHOOL_ADMIN titulaire (admin école) = DIRECTOR implicite sans ligne en base.
 */
function getEffectiveStaffRole(user, schoolId) {
  if (!user || !schoolId) return null;

  if (hasEffectiveRole(user, 'SUPER_ADMIN') && user.adminAssist?.type === 'school') {
    return 'DIRECTOR';
  }

  if (!hasEffectiveRole(user, 'SCHOOL_ADMIN')) return null;

  if (isSchoolPrimaryAdmin(user, schoolId)) return 'DIRECTOR';

  const assignment = findStaffAssignment(user, schoolId);
  if (assignment) return assignment.staffRole;

  return null;
}

function getPermissionsForRole(staffRole) {
  if (!staffRole) return [];
  return ROLE_PERMISSIONS[staffRole] || [];
}

function hasPermission(user, permission, schoolId) {
  if (!user || !permission) return false;

  if (hasEffectiveRole(user, 'SUPER_ADMIN') && user.adminAssist?.type === 'school') {
    return true;
  }

  const role = getEffectiveStaffRole(user, schoolId);
  if (!role) return false;
  return getPermissionsForRole(role).includes(permission);
}

function resolveStaffSchoolId(user) {
  if (user?.school?.id) return user.school.id;
  if (user?.staffAssignments?.length === 1) return user.staffAssignments[0].schoolId;
  if (user?.adminAssist?.type === 'school') return user.adminAssist.schoolId;
  return null;
}

function attachStaffContext(user, schoolId) {
  const sid = schoolId || resolveStaffSchoolId(user);
  const staffRole = sid ? getEffectiveStaffRole(user, sid) : null;
  return {
    staffRole,
    staffRoleLabel: staffRole ? STAFF_ROLE_LABELS[staffRole] : null,
    staffPermissions: staffRole ? getPermissionsForRole(staffRole) : [],
    staffSchoolId: sid,
    staffCan: (permission) => hasPermission(user, permission, sid),
  };
}

module.exports = {
  PERMISSIONS,
  STAFF_ROLE_LABELS,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  getEffectiveStaffRole,
  getPermissionsForRole,
  hasPermission,
  resolveStaffSchoolId,
  attachStaffContext,
  isSchoolPrimaryAdmin,
  findStaffAssignment,
};
