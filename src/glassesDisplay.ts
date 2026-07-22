/**
 * Glasses text for Mentra layouts (G1/G2 via MentraOS).
 * Mentra text is left-aligned; DoubleTextWall uses top+bottom halves so content
 * reads more centered than a tiny ReferenceCard stuck in the corner.
 */

export type VerseDisplayState = {
  mode?: string;
  surah?: number;
  ayah?: number;
  surahName?: string;
  arabic?: string;
  transliteration?: string;
  translation?: string;
  translationGlasses?: string;
  /** 0–1 fraction or 0–100 percent (legacy mixed) */
  confidence?: number;
  /** Explicit 0–100 match percent from pipeline */
  matchPct?: number;
  syncing?: boolean;
  whisperSurah?: number;
  whisperAyah?: number;
  isCandidate?: boolean;
  candidateScore?: number;
  completedSurah?: number;
  completedSurahName?: string;
  userSearching?: boolean;
  _lockingDots?: number;
};

export type GlassesDisplay = {
  hdr: string;
  pages: string[];
};

export type DisplayOptions = {
  charsPerLine?: number;
  linesPerPage?: number;
  glassesBottom?: 'transliteration' | 'translation-only';
  appTitle?: string;
};

const DEFAULT_OPTS: Required<DisplayOptions> = {
  charsPerLine: 32,
  linesPerPage: 7,
  glassesBottom: 'transliteration',
  appTitle: 'Quran',
};

/**
 * Normalize matcher confidence to 0–100.
 * Pipeline mixes 0–1 scores and 0–100 percents; never trust one scale.
 */
export function toMatchPercent(
  confidence?: number | null,
  candidateScore?: number | null,
  matchPct?: number | null,
): number {
  const pick = (v: number | null | undefined): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
    if (v <= 1) return Math.round(v * 100); // fraction 0–1
    if (v <= 100) return Math.round(v); // already percent
    return 100;
  };
  return Math.max(pick(matchPct), pick(confidence), pick(candidateScore));
}

function clip(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function wrapText(text: string, maxLen: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLen) {
      if (line) lines.push(line);
      line = word.length > maxLen ? word.slice(0, maxLen) : word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Always keep transliteration when requested — never drop it for "long" ayahs. */
function buildPages(
  translation: string | undefined,
  transliteration: string | undefined,
  opts: Required<DisplayOptions>,
  reserveLines = 0,
): string[] {
  const div = '·'.repeat(Math.min(24, opts.charsPerLine));
  const maxLines = Math.max(2, opts.linesPerPage - reserveLines);
  const wantTlit = opts.glassesBottom === 'transliteration' && !!(transliteration || '').trim();
  const transLines = wrapText(translation || '', opts.charsPerLine);
  const tlitLines = wantTlit ? wrapText(transliteration || '', opts.charsPerLine) : [];

  // Prefer: translation + divider + transliteration on one page when it fits.
  if (wantTlit) {
    const combinedCost = transLines.length + 1 + tlitLines.length;
    if (combinedCost <= maxLines) {
      return [[...transLines, div, ...tlitLines].join('\n')];
    }
    // Translation page(s), then a dedicated transliteration page.
    const pages: string[] = [];
    for (let i = 0; i < transLines.length; i += maxLines) {
      pages.push(transLines.slice(i, i + maxLines).join('\n'));
    }
    if (pages.length === 0) pages.push('');
    pages.push([div, ...tlitLines].join('\n'));
    return pages;
  }

  if (transLines.length <= maxLines) {
    return [transLines.join('\n')];
  }
  const pages: string[] = [];
  for (let i = 0; i < transLines.length; i += maxLines) {
    pages.push(transLines.slice(i, i + maxLines).join('\n'));
  }
  return pages;
}

function shortHdr(state: VerseDisplayState, prefix: string): string {
  const name = state.surahName ? clip(state.surahName, 12) : 'Quran';
  if (state.surah && state.ayah) return `${prefix}${name} ${state.surah}:${state.ayah}`;
  return `${prefix}${name}`;
}

export function buildGlassesText(
  state: VerseDisplayState,
  options: DisplayOptions = {},
): GlassesDisplay {
  const opts = { ...DEFAULT_OPTS, ...options };
  const transForGlasses = state.translationGlasses ?? state.translation;

  switch (state.mode) {
    case 'SEARCHING': {
      if (state.isCandidate && (state.translation || state.translationGlasses)) {
        const pct = toMatchPercent(state.confidence, state.candidateScore, state.matchPct);
        return {
          hdr: pct > 0 ? `${shortHdr(state, '~ ')}  ${pct}%` : shortHdr(state, '~ '),
          pages: buildPages(transForGlasses, state.transliteration, opts, 1).map(
            (p, i, arr) =>
              i === arr.length - 1 ? `${p}\nLocking…${pct > 0 ? ` ${pct}%` : ''}` : p,
          ),
        };
      }
      if (state.completedSurah) {
        const sName = state.completedSurahName || `Surah ${state.completedSurah}`;
        return {
          hdr: `✓ ${clip(sName, 20)}`,
          pages: ['Listening for next surah…'],
        };
      }
      if (state.userSearching && (state.translation || state.translationGlasses)) {
        return {
          hdr: shortHdr(state, '● '),
          pages: buildPages(transForGlasses, state.transliteration, opts),
        };
      }
      return { hdr: 'Listening', pages: ['Searching…'] };
    }

    case 'LOCKED': {
      const pct = toMatchPercent(state.confidence, state.candidateScore, state.matchPct);
      const syncFrom = state.whisperSurah && state.whisperAyah
        ? `${state.whisperSurah}:${state.whisperAyah}`
        : '?';
      const syncTo = state.surah && state.ayah ? `${state.surah}:${state.ayah}` : '?';
      return {
        hdr: state.syncing
          ? `Syncing ${syncFrom} > ${syncTo}`
          : pct > 0 ? `${shortHdr(state, '')}  ${pct}%` : shortHdr(state, ''),
        pages: buildPages(transForGlasses, state.transliteration, opts),
      };
    }

    case 'PAUSED': {
      const body = transForGlasses || 'Tap to resume';
      const pages = buildPages(body, state.transliteration, opts, 1);
      pages[pages.length - 1] += '\nPAUSED — tap resume';
      return { hdr: `⏸ ${shortHdr(state, '')}`, pages };
    }

    case 'RESUMING': {
      if (state.translation || state.translationGlasses || state.transliteration) {
        return {
          hdr: shortHdr(state, '↻ '),
          pages: buildPages(transForGlasses, state.transliteration, opts),
        };
      }
      return { hdr: shortHdr(state, '↻ '), pages: ['Listening…'] };
    }

    case 'LOST':
      return { hdr: 'Signal lost', pages: ['Resume reciting.'] };

    default:
      return { hdr: opts.appTitle, pages: ['Ready.'] };
  }
}

export function hdrWithPage(baseHdr: string, pageIdx: number, totalPages: number): string {
  if (totalPages <= 1) return baseHdr;
  return `${baseHdr} ${pageIdx + 1}/${totalPages}`;
}

export function formatForMentra(
  display: GlassesDisplay,
  pageIdx: number,
): { title: string; text: string } {
  const total = display.pages.length;
  const idx = Math.min(Math.max(0, pageIdx), total - 1);
  return {
    title: hdrWithPage(display.hdr, idx, total),
    text: display.pages[idx] || '',
  };
}
