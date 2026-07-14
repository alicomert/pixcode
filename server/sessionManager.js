import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class SessionManager {
  constructor() {
    // Store sessions in memory with conversation history
    this.sessions = new Map();
    this.corruptedSessions = new Set();
    this.maxSessions = 100;
    this.sessionsDir = path.join(os.homedir(), '.gemini', 'sessions');
    this.ready = this.init();
  }

  async init() {
    await this.initSessionsDir();
    await this.loadSessions();
  }

  async initSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.warn('SessionManager: Error creating sessions directory:', error?.message || error);
    }
  }

  // Create a new session
  createSession(sessionId, projectPath) {
    const session = {
      id: sessionId,
      projectPath: projectPath,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };

    // Evict oldest session from memory if we exceed limit
    if (this.sessions.size >= this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }

    this.sessions.set(sessionId, session);
    this.saveSession(sessionId);

    return session;
  }

  // Add a message to session
  addMessage(sessionId, role, content) {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Create session if it doesn't exist
      session = this.createSession(sessionId, '');
    }

    const message = {
      role: role, // 'user' or 'assistant'
      content: content,
      timestamp: new Date()
    };

    session.messages.push(message);
    session.lastActivity = new Date();

    this.saveSession(sessionId);

    return session;
  }

  // Get session by ID
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Get all sessions for a project
  getProjectSessions(projectPath) {
    const sessions = [];

    for (const [id, session] of this.sessions) {
      if (session.projectPath === projectPath) {
        sessions.push({
          id: session.id,
          summary: this.getSessionSummary(session),
          messageCount: session.messages.length,
          lastActivity: session.lastActivity
        });
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
  }

  // Get session summary
  getSessionSummary(session) {
    if (session.messages.length === 0) {
      return 'New Session';
    }

    // Find first user message
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content;
      return content.length > 50 ? content.substring(0, 50) + '...' : content;
    }

    return 'New Session';
  }

  // Build conversation context for Gemini
  buildConversationContext(sessionId, maxMessages = 10) {
    const session = this.sessions.get(sessionId);

    if (!session || session.messages.length === 0) {
      return '';
    }

    // Get last N messages for context
    const recentMessages = session.messages.slice(-maxMessages);

    let context = 'Here is the conversation history:\n\n';

    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        context += `User: ${msg.content}\n`;
      } else {
        context += `Assistant: ${msg.content}\n`;
      }
    }

    context += '\nBased on the conversation history above, please answer the following:\n';

    return context;
  }

  // Prevent path traversal
  _safeFilePath(sessionId) {
    const safeId = String(sessionId).replace(/[/\\]|\.\./g, '');
    return path.join(this.sessionsDir, `${safeId}.json`);
  }

  // Save session to disk
  async saveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const filePath = this._safeFilePath(sessionId);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
      
      // Clean up any corrupted sessions that were marked during load
      if (this.corruptedSessions.size > 0) {
        const deleted = [];
        for (const corruptedFile of this.corruptedSessions) {
          try {
            await fs.unlink(path.join(this.sessionsDir, corruptedFile));
            deleted.push(corruptedFile);
          } catch { /* already gone */ }
        }
        deleted.forEach(d => this.corruptedSessions.delete(d));
        if (deleted.length > 0) {
          console.warn(`SessionManager: Cleaned up ${deleted.length} corrupted session file(s): ${deleted.join(', ')}`);
        }
      }
    } catch (error) {
      console.warn(`SessionManager: Error saving session ${sessionId}:`, error?.message || error);
    }
  }

  // Load sessions from disk
  async loadSessions() {
    try {
      const files = await fs.readdir(this.sessionsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.sessionsDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            // Convert dates
            session.createdAt = new Date(session.createdAt);
            session.lastActivity = new Date(session.lastActivity);
            session.messages.forEach(msg => {
              msg.timestamp = new Date(msg.timestamp);
            });

            this.sessions.set(session.id, session);
          } catch (error) {
            // Corrupted session file — skip it and optionally clean up
            const isCorrupted = error instanceof SyntaxError && error.message.includes('JSON');
            if (isCorrupted) {
              console.warn(`SessionManager: Skipping corrupted session file ${file} — will auto-clean on next save.`);
              // Mark for deletion on next successful save cycle
              this.corruptedSessions.add(file);
            } else {
              console.warn(`SessionManager: Error loading session ${file}:`, error?.message || error);
            }
          }
        }
      }

      // Enforce eviction after loading to prevent massive memory usage
      while (this.sessions.size > this.maxSessions) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey) this.sessions.delete(oldestKey);
      }
    } catch (error) {
      console.warn('SessionManager: Error loading sessions:', error?.message || error);
    }
  }

  // Delete a session
  async deleteSession(sessionId) {
    this.sessions.delete(sessionId);

    try {
      const filePath = this._safeFilePath(sessionId);
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`SessionManager: Error deleting session file ${sessionId}:`, error?.message || error);
    }
  }

  // Get session messages for display
  getSessionMessages(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.messages.map(msg => ({
      type: 'message',
      message: {
        role: msg.role,
        content: msg.content
      },
      timestamp: msg.timestamp.toISOString()
    }));
  }
}

// Singleton instance
const sessionManager = new SessionManager();

export const ready = sessionManager.ready;
export default sessionManager;