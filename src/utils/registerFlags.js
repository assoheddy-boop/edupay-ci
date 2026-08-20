function isPublicRegisterOpen(flagName) {
  const v = process.env[flagName];
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function isPublicSchoolRegisterOpen() {
  return isPublicRegisterOpen('ALLOW_PUBLIC_SCHOOL_REGISTER');
}

function isPublicTeacherRegisterOpen() {
  return isPublicRegisterOpen('ALLOW_PUBLIC_TEACHER_REGISTER');
}

function warnPublicRegistrationInProduction() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.JEST_WORKER_ID) return;

  if (isPublicSchoolRegisterOpen()) {
    console.warn(
      '[SECURITY] ALLOW_PUBLIC_SCHOOL_REGISTER=true en production — inscriptions école publiques actives. Désactivez sauf onboarding contrôlé.',
    );
  }
  if (isPublicTeacherRegisterOpen()) {
    console.warn(
      '[SECURITY] ALLOW_PUBLIC_TEACHER_REGISTER=true en production — inscriptions enseignant publiques actives.',
    );
  }
}

module.exports = {
  isPublicRegisterOpen,
  isPublicSchoolRegisterOpen,
  isPublicTeacherRegisterOpen,
  warnPublicRegistrationInProduction,
};
