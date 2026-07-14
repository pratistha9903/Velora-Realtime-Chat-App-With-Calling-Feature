import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
}

/** @deprecated use signAccessToken — kept for compatibility */
export function signToken(user) {
  return signAccessToken(user);
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function issueAuthTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  return { accessToken, refreshToken, token: accessToken };
}
