function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
  };
}

module.exports = { getCookieOptions };
