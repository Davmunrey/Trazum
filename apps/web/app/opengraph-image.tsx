import { ImageResponse } from 'next/og';

import { getWebMessages, localeFromHeaders } from '../lib/i18n';
import { headers } from 'next/headers';

/**
 * The card every share of this app was missing.
 *
 * `twitter: { card: 'summary' }` shipped with no image at all, so a link to
 * Trazum in Slack, on a timeline or in a chat rendered as a bare grey box with
 * a favicon in it — the one surface where a stranger decides whether to click,
 * and it was the only part of the product nobody had drawn.
 *
 * Generated rather than committed as a PNG, for the same reason the rest of
 * this app derives its claims: the title and the tagline come from the message
 * catalogue, so a card cannot drift from the page it points at, and it is
 * drawn in the reader's own language.
 *
 * Deliberately geometry and type only. `next/og` renders with Satori, which
 * has no access to the app's stylesheet, so every value here is written out —
 * and the palette is the same warm paper, ink and terracotta the app uses, in
 * the light theme, because a share card has no reader preference to read.
 */
export const alt = 'Trazum';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  const { meta } = getWebMessages(locale);

  const PAPER = '#fbfbfa';
  const INK = '#1b1b19';
  const INK_SOFT = '#6b6a65';
  const TERRACOTTA = '#b0522f';
  const RULE = '#e3e2de';
  const GOOD = '#2f6f4e';
  const MUTED = '#f4f4f2';

  /* The same ledger the hero draws: full length, and what survives the rules. */
  const rows = [
    [420, 264],
    [352, 220],
    [466, 292],
    [306, 192],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAPER,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 13,
              background: TERRACOTTA,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 7,
              paddingLeft: 12,
            }}
          >
            <div style={{ width: 31, height: 4.5, borderRadius: 3, background: '#fff' }} />
            <div style={{ width: 22, height: 4.5, borderRadius: 3, background: '#fff' }} />
            <div style={{ width: 14, height: 4.5, borderRadius: 3, background: '#fff' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>
              Trazum
            </div>
            <div style={{ fontSize: 19, color: INK_SOFT }}>{meta.tagline}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 56 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                fontSize: 54,
                fontWeight: 700,
                color: INK,
                lineHeight: 1.1,
                letterSpacing: '-0.025em',
                maxWidth: 640,
              }}
            >
              {meta.title}
            </div>
          </div>

          {/* The claim as a shape, not a sentence: the bar and what is left of it. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: 28,
              borderRadius: 18,
              border: `1px solid ${RULE}`,
              background: '#ffffff',
            }}
          >
            {rows.map(([full, kept]) => (
              <div key={full} style={{ display: 'flex', position: 'relative' }}>
                <div style={{ width: full, height: 16, borderRadius: 8, background: MUTED }} />
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: kept,
                    height: 16,
                    borderRadius: 8,
                    background: GOOD,
                  }}
                />
              </div>
            ))}
            <div
              style={{
                marginTop: 6,
                paddingTop: 16,
                borderTop: `1px solid ${RULE}`,
                fontSize: 30,
                fontWeight: 700,
                color: GOOD,
                display: 'flex',
              }}
            >
              −20.1%
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
