const ACCESS_COOKIE = 'token';
const REFRESH_COOKIE = 'refreshToken';
const ASSIST_COOKIE = 'adminAssist';
const ACCESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_MAX_AGE_MS = Number(process.env.JWT_REFRESH_TTL_MS) || ACCESS_MAX_AGE_MS;

function cookieBase() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
  };
}

function getCookieOptions() {
  return { ...cookieBase(), maxAge: ACCESS_MAX_AGE_MS };
}

function getRefreshCookieOptions() {
  return { ...cookieBase(), maxAge: REFRESH_MAX_AGE_MS };
}

function getPrefsCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function safeBack(req) {
  const fallback = '/';
  const referer = req.get('referer');
  if (!referer) return fallback;
  try {
    const url = new URL(referer);
    const host = req.hostname;
    if (url.hostname !== host) return fallback;
    return `${url.pathname}${url.search}` || fallback;
  } catch {
    return fallback;
  }
}

function clearAssistCookie(res) {
  res.clearCookie(ASSIST_COOKIE, getCookieOptions());
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ASSIST_COOKIE,
  getCookieOptions,
  getRefreshCookieOptions,
  getPrefsCookieOptions,
  clearAssistCookie,
  safeBack,
};
