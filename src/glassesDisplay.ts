/**
 * Glasses text layout — ported from taraweeh-companion/app/index.html buildGlassesText().
 * G1 display is narrower than G2; constants are tuned for Mentra text layouts.
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
  confidence?: number;
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
  /** Chars per line — G1 ~40, G2 ~55 */
  charsPerLine?: number;
  /** Body lines per page */
  linesPerPage?: number;
  /** Bottom line: transliteration or translation-only */
  glassesBottom?: 'transliteration' | 'translation-only';
  appTitle?: string;
};

const DEFAULT_OPTS: Required<DisplayOptions> = {
  charsPerLine: 42,
  linesPerPage: 6,
  glassesBottom: 'transliteration',
  appTitle: 'Taraweeh',
};

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

function buildPages(
  translation: string | undefined,
  transliteration: string | undefined,
  opts: Required<DisplayOptions>,
  reserveLines = 0,
): string[] {
  const div = '-'.repeat(opts.charsPerLine);
  const maxLines = opts.linesPerPage - reserveLines;
  const transLines = wrapText(translation || '', opts.charsPerLine);
  const longAyah = transLines.length > Math.floor(maxLines / 2);
  const effectiveTransliteration =
    opts.glassesBottom === 'transliteration' && !longAyah ? transliteration : '';
  const tlitLines = effectiveTransliteration
    ? wrapText(effectiveTransliteration, opts.charsPerLine)
    : [];
  const tlitBlock = tlitLines.length > 0 ? [div, ...tlitLines] : [];
  const tlitCost = tlitBlock.length;

  if (transLines.length + tlitCost <= maxLines) {
    return [transLines.concat(tlitBlock).join('\n')];
  }

  const pages: string[] = [];
  for (let i = 0; i < transLines.length; i += maxLines) {
    pages.push(transLines.slice(i, i + maxLines).join('\n'));
  }

  const last = pages[pages.length - 1].split('\n');
  if (last.length + tlitCost <= maxLines) {
    pages[pages.length - 1] = `${pages[pages.length - 1]}\n${tlitBlock.join('\n')}`;
  } else if (tlitCost > 0) {
    pages.push(tlitBlock.join('\n'));
  }
  return pages;
}

function appTitleHdr(opts: Required<DisplayOptions>): string {
  return opts.appTitle;
}

export function buildGlassesText(
  state: VerseDisplayState,
  options: DisplayOptions = {},
): GlassesDisplay {
  const opts = { ...DEFAULT_OPTS, ...options };
  const chars = opts.charsPerLine;
  const transForGlasses = state.translationGlasses ?? state.translation;

  switch (state.mode) {
    case 'SEARCHING': {
      if (state.isCandidate && (state.translation || state.translationGlasses)) {
        const cName = state.surahName ? clip(state.surahName, 14) : 'Quran';
        const cRef = `${cName} ${state.surah}:${state.ayah}`;
        const cPct = `Match: ${state.candidateScore || 0}%`;
        const cPad = Math.max(1, chars - cRef.length - cPct.length - 3);
        const cHdr = `○ ${cRef}${' '.repeat(cPad)}${cPct}`;
        const cPages = buildPages(transForGlasses, state.transliteration, opts, 1);
        const lockDots =
          state._lockingDots !== undefined ? '.'.repeat(state._lockingDots) : '…';
        cPages[cPages.length - 1] +=
          `\nAuto locking${lockDots} ${state.candidateScore || 0}%`;
        return { hdr: cHdr, pages: cPages };
      }
      if (state.completedSurah) {
        const sName = state.completedSurahName || `Surah ${state.completedSurah}`;
        return {
          hdr: `✓ ${clip(sName, 24)} complete`,
          pages: ['Listening for next surah…'],
        };
      }
      if (state.userSearching && (state.translation || state.translationGlasses)) {
        const uName = state.surahName ? clip(state.surahName, 14) : 'Quran';
        const uRef = `${uName} ${state.surah}:${state.ayah}`;
        const uPct = `Match: ${Math.round((state.confidence || 0) * 100)}%`;
        const uPad = Math.max(1, chars - uRef.length - uPct.length - 3);
        const uHdr = `● ${uRef}${' '.repeat(uPad)}${uPct}`;
        const uPages = buildPages(transForGlasses, state.transliteration, opts);
        uPages[uPages.length - 1] += '\nListening for next verse…';
        return { hdr: uHdr, pages: uPages };
      }
      return { hdr: 'Listening', pages: ['\nSearching…'] };
    }

    case 'LOCKED': {
      const lName = state.surahName ? clip(state.surahName, 14) : 'Quran';
      const lRef = `${lName} ${state.surah}:${state.ayah}`;
      const lPct = `Match: ${Math.round((state.confidence || 0) * 100)}%`;
      const lPad = Math.max(1, chars - lRef.length - lPct.length - 3);
      const lHdr = `● ${lRef}${' '.repeat(lPad)}${lPct}`;
      return {
        hdr: lHdr,
        pages: buildPages(transForGlasses, state.transliteration, opts),
      };
    }

    case 'PAUSED': {
      const pName = state.surahName ? clip(state.surahName, 14) : 'Quran';
      const pRef = `${pName} ${state.surah ? `${state.surah}:${state.ayah}` : ''}`;
      const pHdr = `⏸ PAUSED  ${pRef}`;
      const transForPaused = state.translationGlasses ?? state.translation;
      const pBody = transForPaused || 'Tap to resume';
      const div = '-'.repeat(chars);
      const pPages = buildPages(pBody, state.transliteration, opts, 2);
      pPages[pPages.length - 1] += `\n${div}\nPAUSED — tap to resume`;
      return { hdr: pHdr, pages: pPages };
    }

    case 'RESUMING': {
      if (state.translation || state.translationGlasses || state.transliteration) {
        const rName = state.surahName ? clip(state.surahName, 14) : 'Quran';
        const rRef = `${rName} ${state.surah}:${state.ayah}`;
        const rHdr = `↻ ${rRef}`;
        return {
          hdr: rHdr,
          pages: buildPages(transForGlasses, state.transliteration, opts),
        };
      }
      const rName2 = state.surahName ? clip(state.surahName, 14) : 'Quran';
      return { hdr: `↻ ${rName2}`, pages: ['Listening…'] };
    }

    case 'LOST':
      return { hdr: '⚠ Signal Lost', pages: ['Resume recitation.'] };

    default:
      return { hdr: appTitleHdr(opts), pages: ['Ready.\nTap temple to start.'] };
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
