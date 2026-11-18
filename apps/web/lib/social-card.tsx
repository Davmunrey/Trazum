import { ImageResponse } from 'next/og';

import { ACID, DARK, INK, LIGHT } from '../../../scripts/brand.mjs';
import { ILLUSTRATIVE_BILL } from './landing-copy';
import { COMMAND } from './site';

/**
 * The card a link preview shows for a public page: 1200 by 630, in the brand.
 *
 * Drawn the way every other picture in this repository is drawn: in the
 * colours `scripts/brand.mjs` names and no others, which `brand.test.js`
 * checks by reading this file. Paper and ink on the left with the page's own
 * title; on the right the README's illustrative bill in the dark terminal
 * tokens, its total in the acid fill, the same figures the landing shows and
 * `marketing.test.mjs` holds to the CLI; the one command along the foot.
 *
 * The face is the one `next/og` ships, because the card is drawn on the
 * server and the app's Space Grotesk is a variable WOFF2 the renderer cannot
 * read. Nothing is fetched to draw it.
 */
export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 };

export function socialCard({
  title,
  line,
  calls,
  note,
}: {
  title: string;
  line: string;
  /** "across 126 priced calls", in the page's language. */
  calls: string;
  /** The README's label for the bill: illustrative, not a customer result. */
  note: string;
}): ImageResponse {
  const bill = ILLUSTRATIVE_BILL;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: LIGHT.canvas,
        color: INK,
        padding: '46px 60px 44px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `2px solid ${INK}`,
          paddingBottom: 20,
        }}
      >
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: '-0.04em' }}>Trazum</div>
        <div style={{ display: 'flex', fontSize: 19, color: LIGHT.secondary }}>Claude Code · Codex · Gemini CLI</div>
      </div>

      <div style={{ display: 'flex', gap: 44, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em' }}>
            {title}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 440,
            padding: '22px 24px',
            background: DARK.canvas,
            color: DARK.text,
            border: `2px solid ${INK}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, letterSpacing: '-0.04em', color: ACID }}>
              {bill.total}
            </div>
            <div style={{ display: 'flex', fontSize: 16, color: DARK.secondary }}>{calls}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 14, color: DARK.secondary, marginTop: 6, marginBottom: 14 }}>
            {`${bill.from} → ${bill.to}`}
          </div>
          {bill.projects.map((row) => (
            <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, padding: '5px 0' }}>
              <div style={{ display: 'flex', width: 176 }}>{row.name}</div>
              <div style={{ display: 'flex', width: 56, justifyContent: 'flex-end' }}>{row.usd}</div>
              <div style={{ display: 'flex', flex: 1, height: 12, border: `2px solid ${DARK.secondary}` }}>
                <div style={{ display: 'flex', width: row.share, height: '100%', background: ACID }} />
              </div>
              <div style={{ display: 'flex', width: 50, justifyContent: 'flex-end' }}>{row.share}</div>
            </div>
          ))}
          <div style={{ display: 'flex', fontSize: 13, lineHeight: 1.35, color: DARK.secondary, marginTop: 12 }}>{note}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 18 }}>
        <div
          style={{
            display: 'flex',
            border: `2px solid ${INK}`,
            background: ACID,
            padding: '13px 20px',
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          {`$ ${COMMAND}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 18, color: LIGHT.secondary }}>
          {line}
        </div>
      </div>
    </div>,
    SOCIAL_CARD_SIZE,
  );
}
