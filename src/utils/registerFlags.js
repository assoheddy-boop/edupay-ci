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

module.exports = {
  isPublicRegisterOpen,
  isPublicSchoolRegisterOpen,
  isPublicTeacherRegisterOpen,
};
