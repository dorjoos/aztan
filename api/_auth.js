const jwt = require("jsonwebtoken");
const cookie = require("cookie");

const COOKIE_NAME = "sugalaa_session";

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    // Developer convenience: allow local dev without configuring JWT_SECRET.
    // Do NOT rely on this in production.
    if (process.env.NODE_ENV !== "production") return "dev-jwt-secret-change-me";
    throw new Error("Missing JWT_SECRET");
  }
  return s;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return cookie.parse(header);
}

function signSession(payload, { maxAgeSeconds }) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: maxAgeSeconds });
}

function verifySessionToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

function setSessionCookie(res, token, { maxAgeSeconds }) {
  const isProd = process.env.NODE_ENV === "production";
  const serialized = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  res.setHeader("Set-Cookie", serialized);
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  const serialized = cookie.serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  res.setHeader("Set-Cookie", serialized);
}

function requireAdmin(req) {
  const s = getSession(req);
  if (!s || s.role !== "admin") return null;
  return s;
}

module.exports = {
  COOKIE_NAME,
  getSession,
  requireAdmin,
  signSession,
  setSessionCookie,
  clearSessionCookie,
};

