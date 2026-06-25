import express from 'express';
import bcrypt from 'bcryptjs';

import { userDb, db } from '../database/db.js';
import { generateToken, authenticateToken, requireAdmin } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import {
  checkAccountLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  validatePasswordPolicy,
  validateUsername,
} from '../middleware/account-lockout.js';
import { securityLog, getClientIp } from '../utils/security-log.js';
import {
  consumeQrLoginToken,
  createQrLoginToken,
  getQrLoginSettings,
  saveQrLoginSettings,
} from '../services/qr-login.js';
import {
  getPublicRemoteConnectionConfig,
  saveRemoteConnectionConfig,
} from '../services/remote-connection.js';

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'member',
  };
}

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({ 
      needsSetup: !hasUsers,
      isAuthenticated: false // Will be overridden by frontend if token exists
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// First-run connection mode is intentionally public: it is needed before
// account creation so a fresh desktop install can decide whether it controls
// this machine or a remote Pixcode server.
router.get('/connection-mode', (req, res) => {
  res.json({ success: true, connection: getPublicRemoteConnectionConfig() });
});

// Changing the connection mode is a state-changing operation that must
// require authentication. Without auth, any unauthenticated caller could
// redirect the app to a malicious remote server.
router.put('/connection-mode', authenticateToken, requireAdmin, (req, res) => {
  try {
    res.json({ success: true, connection: saveRemoteConnectionConfig(req.body || {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/qr-login/settings', authenticateToken, requireAdmin, (_req, res) => {
  res.json({ success: true, settings: getQrLoginSettings() });
});

router.put('/qr-login/settings', authenticateToken, requireAdmin, (req, res) => {
  try {
    res.json({ success: true, settings: saveQrLoginSettings(req.body || {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/qr-login/token', authenticateToken, requireAdmin, authRateLimiter, (req, res) => {
  try {
    const baseUrl = typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()
      ? req.body.baseUrl.trim()
      : null;
    res.json({ success: true, ...createQrLoginToken({ userId: req.user.id, baseUrl }) });
  } catch (error) {
    const status = error?.code === 'QR_LOGIN_DISABLED' ? 409 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/qr-login', authRateLimiter, (req, res) => {
  try {
    const user = consumeQrLoginToken(req.body?.token);
    const token = generateToken(user);
    userDb.updateLastLogin(user.id);
    securityLog('qr_login_success', {
      ip: getClientIp(req),
      userId: user.id,
      username: user.username,
    });
    res.json({
      success: true,
      user: publicUser(user),
      token,
    });
  } catch (error) {
    const status = error?.code === 'QR_LOGIN_DISABLED' ? 409 : 401;
    securityLog('qr_login_failed', {
      ip: getClientIp(req),
      reason: error?.code || 'unknown',
    });
    res.status(status).json({ success: false, error: error.message });
  }
});

// User registration (setup) - only allowed if no users exist
router.post('/register', authRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIp = getClientIp(req);
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }
    
    // Use a transaction to prevent race conditions
    db.prepare('BEGIN').run();
    try {
      // Check if users already exist. Additional accounts are created by admins.
      const hasUsers = userDb.hasUsers();
      if (hasUsers) {
        db.prepare('ROLLBACK').run();
        return res.status(403).json({ error: 'Initial admin already exists. Ask an admin to create another account.' });
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const user = userDb.createUser(username, passwordHash, { role: 'admin' });
      
      // Generate token
      const token = generateToken(user);
      
      db.prepare('COMMIT').run();

      // Update last login (non-fatal, outside transaction)
      userDb.updateLastLogin(user.id);

      securityLog('user_registered', {
        ip: clientIp,
        userId: user.id,
        username: user.username,
      });

      res.json({
        success: true,
        user: publicUser(user),
        token
      });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// User login
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIp = getClientIp(req);
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check account lockout before attempting login
    const lockoutStatus = checkAccountLockout(String(username), clientIp);
    if (lockoutStatus.locked) {
      securityLog('login_blocked_locked', {
        ip: clientIp,
        username,
        reason: 'Account locked due to failed attempts',
      });
      return res.status(423).json({ error: lockoutStatus.message });
    }
    
    // Get user from database
    const user = userDb.getUserByUsername(username);
    if (!user) {
      const failResult = recordFailedLogin(String(username), clientIp);
      securityLog('login_failed', {
        ip: clientIp,
        username,
        reason: 'User not found',
      });
      if (failResult.locked) {
        return res.status(423).json({ error: failResult.message });
      }
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const failResult = recordFailedLogin(String(username), clientIp);
      securityLog('login_failed', {
        ip: clientIp,
        username,
        userId: user.id,
        reason: 'Invalid password',
      });
      if (failResult.locked) {
        return res.status(423).json({ error: failResult.message });
      }
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Clear failed attempts on successful login
    recordSuccessfulLogin(String(username), clientIp);
    
    // Generate token
    const token = generateToken(user);
    
    // Update last login
    userDb.updateLastLogin(user.id);

    securityLog('login_success', {
      ip: clientIp,
      userId: user.id,
      username: user.username,
    });
    
    res.json({
      success: true,
      user: publicUser(user),
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected route)
router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

// Logout (client-side token removal, but this endpoint can be used for logging)
router.post('/logout', authenticateToken, (req, res) => {
  securityLog('user_logout', {
    ip: getClientIp(req),
    userId: req.user?.id,
    username: req.user?.username,
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
