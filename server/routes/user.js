import express from 'express';

import { userDb, githubTokensDb, credentialsDb } from '../database/db.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.js';
import {
  applyPixcodeGitIdentity,
  getSystemGitConfig,
  userHasGithubToken,
} from '../utils/gitConfig.js';

const router = express.Router();

router.get('/git-config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let gitConfig = userDb.getGitConfig(userId);

    // If database is empty, try Pixcode/system git config once
    if (!gitConfig || (!gitConfig.git_name && !gitConfig.git_email)) {
      const systemConfig = await getSystemGitConfig();
      if (systemConfig.git_name || systemConfig.git_email) {
        userDb.updateGitConfig(userId, systemConfig.git_name, systemConfig.git_email);
        gitConfig = systemConfig;
      }
    }

    res.json({
      success: true,
      gitName: gitConfig?.git_name || null,
      gitEmail: gitConfig?.git_email || null,
      hasGithubToken: userHasGithubToken(userId),
      storage: 'pixcode', // identity lives in DB + ~/.pixcode/gitconfig (not system --global)
    });
  } catch (error) {
    console.error('Error getting git config:', error);
    res.status(500).json({ error: 'Failed to get git configuration' });
  }
});

/**
 * Save git identity + optional GitHub PAT for private repos.
 * Never touches `git config --global` (fails under many server/daemon setups).
 */
router.post('/git-config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { gitName, gitEmail, githubToken, githubTokenName } = req.body;

    if (!gitName || !gitEmail) {
      return res.status(400).json({ error: 'Git name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gitEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    userDb.updateGitConfig(userId, gitName, gitEmail);

    let identityFile = null;
    try {
      identityFile = await applyPixcodeGitIdentity(gitName, gitEmail);
    } catch (gitError) {
      // Non-fatal: DB still holds identity; commits use env vars as fallback.
      console.warn(
        '[git-config] Could not write Pixcode gitconfig (commits still use DB identity):',
        gitError?.message || gitError,
      );
    }

    let githubSaved = false;
    const rawToken = typeof githubToken === 'string' ? githubToken.trim() : '';
    if (rawToken) {
      const name = (typeof githubTokenName === 'string' && githubTokenName.trim())
        ? githubTokenName.trim()
        : 'GitHub (onboarding)';
      // Deactivate previous active tokens so the new one is authoritative
      try {
        const existing = githubTokensDb.getGithubTokens(userId) || [];
        for (const entry of existing) {
          if (entry.is_active === true || entry.is_active === 1) {
            credentialsDb.toggleCredential(userId, entry.id, false);
          }
        }
      } catch {
        // ignore
      }
      credentialsDb.createCredential(
        userId,
        name,
        'github_token',
        rawToken,
        'Saved from Git settings / onboarding for private repo access',
      );
      githubSaved = true;
    }

    res.json({
      success: true,
      gitName,
      gitEmail,
      hasGithubToken: userHasGithubToken(userId) || githubSaved,
      identityFile,
      storage: 'pixcode',
    });
  } catch (error) {
    console.error('Error updating git config:', error);
    res.status(500).json({ error: 'Failed to update git configuration' });
  }
});

router.post('/complete-onboarding', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    userDb.completeOnboarding(userId);

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

router.get('/onboarding-status', optionalAuthenticateToken, async (req, res) => {
  try {
    const hasUsers = userDb.hasUsers();
    if (!hasUsers) {
      return res.json({ success: true, needsSetup: true, hasCompletedOnboarding: false });
    }

    if (!req.user) {
      return res.json({ success: true, needsSetup: false, hasCompletedOnboarding: true });
    }

    const hasCompleted = userDb.hasCompletedOnboarding(req.user.id);

    res.json({
      success: true,
      needsSetup: false,
      hasCompletedOnboarding: hasCompleted,
    });
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    res.status(500).json({ error: 'Failed to check onboarding status' });
  }
});

export default router;
