import 'dotenv/config';
import { AppServer, AppSession } from '@mentra/sdk';
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

const activeSessions = new Map<string, MentraTaraweehSession>();

class TaraweehMentraApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
  }

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    console.log(`[Mentra] Session ${sessionId} user=${userId}`);

    subscribeToMic(session);

    const initial = readTaraweehSettings(session);
    console.log('[Mentra] Settings:', {
      mode: initial.reciteMode,
      surah: initial.preferredSurah,
      keyMode: initial.keyMode,
      provider: initial.transcriptionProvider,
    });

    const controller = new MentraTaraweehSession(
      session,
      settingsToSessionOptions(initial),
    );

    activeSessions.set(sessionId, controller);
    controller.start();

    const unwatch = watchTaraweehSettings(session, (updated) => {
      controller.applySettings(settingsToSessionOptions(updated));
    });

    session.events.onDisconnected(() => {
      unwatch();
      controller.destroy();
      activeSessions.delete(sessionId);
    });
  }
}

const app = new TaraweehMentraApp();
app.start().catch((err) => {
  console.error(err);
  process.exit(1);
});
