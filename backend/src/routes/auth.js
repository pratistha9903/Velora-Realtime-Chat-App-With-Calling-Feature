import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  createUser,
  getUserByUsername,
  getUserByEmail,
  updateUserProfile,
  setRefreshTokenHash,
  clearRefreshToken,
} from '../db/services.js';
import User from '../models/User.js';
import {
  issueAuthTokens,
  verifyToken,
  hashToken,
  generateRandomToken,
} from '../utils/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import { getAvatarColor } from '../utils/avatar.js';
import { sendPasswordResetEmail, isEmailConfigured } from '../utils/mailer.js';

const router = Router();

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'your email';
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

function authPayload(user) {
  return {
    id: user.id || user._id?.toString(),
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || '',
    emailVerified: !!user.emailVerified,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
  };
}

async function respondWithTokens(res, userDocOrFormatted, status = 200) {
  const raw = userDocOrFormatted.toObject?.() || userDocOrFormatted;
  const formatted = authPayload({
    id: raw.id || raw._id?.toString(),
    ...raw,
  });

  const tokens = issueAuthTokens(formatted);
  await setRefreshTokenHash(formatted.id, hashToken(tokens.refreshToken));
  res.status(status).json({
    success: true,
    data: {
      user: formatted,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
}

router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const { displayName, bio, avatarUrl } = req.body;
    if (displayName !== undefined && (!displayName.trim() || displayName.trim().length > 30)) {
      return res.status(400).json({ success: false, error: 'Display name must be 1–30 characters' });
    }
    const user = await updateUserProfile(req.user.id, { displayName, bio, avatarUrl });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username?.trim() || username.length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, and underscores' });
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (await getUserByUsername(trimmedUsername)) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }
    if (await getUserByEmail(email.trim().toLowerCase())) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const verifyTokenValue = generateRandomToken();
    const passwordHash = await bcrypt.hash(password, 12);
    const autoVerify = process.env.AUTO_VERIFY_EMAIL === 'true' || !process.env.SMTP_HOST;

    const user = await createUser({
      username: trimmedUsername,
      email: email.trim().toLowerCase(),
      passwordHash,
      displayName: displayName?.trim() || username.trim(),
      emailVerifyToken: autoVerify ? null : hashToken(verifyTokenValue),
      emailVerified: autoVerify,
    });

    const tokens = issueAuthTokens(user);
    await setRefreshTokenHash(user.id, hashToken(tokens.refreshToken));

    const response = {
      success: true,
      data: {
        user,
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };

    if (!autoVerify) {
      response.data.emailVerificationToken = verifyTokenValue;
      response.data.message = 'Account created. Verify email using the token (demo mode returns it in response).';
      console.log(`[email-verify] user=${user.email} token=${verifyTokenValue}`);
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username?.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const user = await getUserByUsername(username.trim().toLowerCase());
    if (!user?.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    await respondWithTokens(res, user);
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token required' });
    }

    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const userDoc = await User.findById(payload.userId);
    if (!userDoc || userDoc.refreshTokenHash !== hashToken(refreshToken)) {
      return res.status(401).json({ success: false, error: 'Refresh token revoked' });
    }

    const user = authPayload({ id: userDoc._id.toString(), ...userDoc.toObject() });
    await respondWithTokens(res, user);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await clearRefreshToken(req.user.id);
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const email = req.body.email?.trim()?.toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await getUserByEmail(email);
    // Always return success to avoid email enumeration
    if (!user) {
      return res.json({
        success: true,
        data: { message: 'If that email exists, a reset link was sent.' },
      });
    }

    const resetToken = generateRandomToken();
    user.passwordResetToken = hashToken(resetToken);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
    const resetUrl = `${clientUrl}/?mode=reset&token=${resetToken}`;

    console.log(`[password-reset] email=${email} link=${resetUrl}`);

    if (isEmailConfigured()) {
      try {
        await sendPasswordResetEmail({
          to: email,
          resetUrl,
          displayName: user.displayName,
        });
        return res.json({
          success: true,
          data: {
            message: 'Password reset link sent to your email. Check your inbox (and spam folder).',
            emailed: true,
          },
        });
      } catch (mailErr) {
        console.error('Failed to send reset email:', mailErr.message);
        if (mailErr.response) console.error('SMTP response:', mailErr.response);
        return res.status(500).json({
          success: false,
          error: `Could not send reset email: ${mailErr.message}`,
        });
      }
    }

    // Fallback when SMTP is not configured (local demo)
    return res.json({
      success: true,
      data: {
        message: 'Email SMTP is not configured yet. Use the reset link below (demo mode).',
        emailed: false,
        resetToken,
        resetUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/verify-reset-token', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Reset link is invalid' });
    }

    const user = await User.findOne({
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    }).select('email displayName');

    if (!user) {
      return res.status(400).json({ success: false, error: 'This reset link is invalid or has expired' });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        email: maskEmail(user.email),
        displayName: user.displayName,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Valid token and password (min 6) required' });
    }

    const user = await User.findOne({
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'This reset link is invalid or has expired' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokenHash = null;
    await user.save();

    res.json({ success: true, data: { message: 'Password updated. Please sign in.' } });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email', authLimiter, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token required' });
    }

    const user = await User.findOne({ emailVerifyToken: hashToken(token) });
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid verification token' });
    }

    user.emailVerified = true;
    user.emailVerifyToken = null;
    await user.save();

    res.json({ success: true, data: { message: 'Email verified', user: authPayload({ id: user._id.toString(), ...user.toObject() }) } });
  } catch (error) {
    next(error);
  }
});

router.post('/google', authLimiter, async (req, res, next) => {
  try {
    const { credential, email, name, googleId, picture } = req.body;

    // Demo-friendly Google login: accept verified profile payload from GIS.
    // For production, verify `credential` JWT with Google's tokeninfo / google-auth-library.
    let profile = null;

    if (credential && process.env.GOOGLE_CLIENT_ID) {
      try {
        const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.aud === process.env.GOOGLE_CLIENT_ID) {
            profile = {
              googleId: data.sub,
              email: data.email,
              name: data.name || data.email?.split('@')[0],
              picture: data.picture,
              emailVerified: data.email_verified === 'true' || data.email_verified === true,
            };
          }
        }
      } catch {
        // fall through
      }
    }

    // OAuth access token flow (custom Google button)
    if (!profile && req.body.accessToken) {
      try {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${req.body.accessToken}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          profile = {
            googleId: data.sub,
            email: data.email,
            name: data.name || data.email?.split('@')[0],
            picture: data.picture,
            emailVerified: !!data.email_verified,
          };
        }
      } catch {
        // fall through
      }
    }

    if (!profile && email && googleId) {
      // Dev fallback when GIS credential verification is not configured
      profile = {
        googleId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        picture,
        emailVerified: true,
      };
      if (process.env.NODE_ENV === 'production' && process.env.GOOGLE_CLIENT_ID) {
        return res.status(400).json({ success: false, error: 'Invalid Google credential' });
      }
    }

    if (!profile?.email || !profile?.googleId) {
      return res.status(400).json({ success: false, error: 'Google sign-in data required' });
    }

    let userDoc = await User.findOne({
      $or: [{ googleId: profile.googleId }, { email: profile.email }],
    });

    if (!userDoc) {
      const baseUsername = profile.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
      let username = baseUsername.toLowerCase();
      let n = 0;
      while (await getUserByUsername(username)) {
        n += 1;
        username = `${baseUsername}${n}`.toLowerCase().slice(0, 20);
      }

      userDoc = await User.create({
        username,
        email: profile.email,
        displayName: profile.name,
        avatarColor: getAvatarColor(username),
        avatarUrl: profile.picture || null,
        googleId: profile.googleId,
        emailVerified: true,
        passwordHash: undefined,
      });
    } else {
      if (!userDoc.googleId) userDoc.googleId = profile.googleId;
      if (profile.picture && !userDoc.avatarUrl) userDoc.avatarUrl = profile.picture;
      userDoc.emailVerified = true;
      await userDoc.save();
    }

    await respondWithTokens(res, userDoc);
  } catch (error) {
    next(error);
  }
});

export default router;
