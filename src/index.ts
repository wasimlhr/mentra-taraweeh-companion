import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppServer, AppSession, type AuthenticatedRequest } from '@mentra/sdk';
import { MentraTaraweehSession, subscribeToMic } from './mentraSession.js';
import {
  readTaraweehSettings,
  settingsToSessionOptions,
  watchTaraweehSettings,
} from './settings.js';

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error('PACKAGE_NAME is not set in .env');
  })();

const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error('MENTRAOS_API_KEY is not set in .env');
  })();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, '..', 'public');
const WEBVIEW_FILE = path.join(PUBLIC_DIR, 'webview.html');

/** Controllers keyed by Mentra userId for webview live state */
const sessionsByUser = new Map<string, MentraTaraweehSession>();

class TaraweehMentraApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: PUBLIC_DIR,
    });
    this.setupWebviewRoutes();
  }

  private setupWebviewRoutes() {
    const expressApp = this.getExpressApp();

    expressApp.get('/webview', (_req, res) => {
      res.sendFile(WEBVIEW_FILE);
    });

    expressApp.get('/api/live', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;
      if (!userId) {
        return res.json({
          ok: true,
          active: false,
          message: 'Open Quran Companion from Mentra to start a session',
        });
      }
      const controller = sessionsByUser.get(userId);
      if (!controller) {
        return res.json({
          ok: true,
          active: false,
          userId,
          message: 'Session starting…',
        });
      }
      return res.json({ ok: true, userId, ...controller.getLiveSnapshot() });
    });

    expressApp.post('/api/next', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;
      const controller = userId ? sessionsByUser.get(userId) : undefined;
      controller?.manualNext();
      res.json({ ok: !!controller });
    });

    expressApp.post('/api/prev', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId;
      const controller = userId ? sessionsByUser.get(userId) : undefined;
      controller?.manualPrev();
      res.json({ ok: !!controller });
    });
  }

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    // Mentra must get a fast webhook ACK. Heavy Quran load happens after return.
    console.log(`[Mentra] Session ${sessionId} user=${userId}`);
    subscribeToMic(session);

    void this.bootSession(session, sessionId, userId).catch((err) => {
      console.error('[Mentra] Session boot failed:', err);
      try {
        void session.layouts.showTextWall('Quran Companion failed to start.\nCheck Railway logs.');
      } catch {
        /* ignore */
      }
    });
  }

  private async bootSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const initial = readTaraweehSettings(session);
    console.log('[Mentra] Settings:', {
      mode: initial.reciteMode,
      surah: initial.preferredSurah,
      keyMode: initial.keyMode,
      provider: initial.transcriptionProvider,
    });

    const previous = sessionsByUser.get(userId);
    if (previous) previous.destroy();

    const controller = new MentraTaraweehSession(
      session,
      settingsToSessionOptions(initial),
    );

    sessionsByUser.set(userId, controller);
    controller.start();

    const unwatch = watchTaraweehSettings(session, (updated) => {
      controller.applySettings(settingsToSessionOptions(updated));
    });

    session.events.onDisconnected(() => {
      unwatch();
      controller.destroy();
      if (sessionsByUser.get(userId) === controller) {
        sessionsByUser.delete(userId);
      }
      console.log(`[Mentra] Session ended ${sessionId} user=${userId}`);
    });
  }
}

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandledRejection', err);
});

const app = new TaraweehMentraApp();
app.start().catch((err) => {
  console.error(err);
  process.exit(1);
});
