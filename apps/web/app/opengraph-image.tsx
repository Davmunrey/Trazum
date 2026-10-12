import { ImageResponse } from 'next/og';
import { headers } from 'next/headers';

import { getWebMessages, localeFromHeaders } from '../lib/i18n';

export const alt = 'Trazum';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  const { meta } = getWebMessages(locale);
  const paper = '#f6f4ec';
  const ink = '#20231e';
  const accent = '#dce94d';
  const rule = '#20231e';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: paper, color: ink, padding: '48px 60px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${rule}`, paddingBottom: 25 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

            <div style={{ fontSize: 43, fontWeight: 700, letterSpacing: '-0.04em' }}>Trazum</div>
          </div>
          <div style={{ fontSize: 16, color: ink }}>CLI / CI / MCP / Gateway</div>
        </div>
        <div style={{ display: 'flex', gap: 44, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em' }}>{meta.title}</div>
            <div style={{ fontSize: 22, lineHeight: 1.45, maxWidth: 650 }}>{meta.tagline}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', width: 285, padding: 20, border: `2px solid ${rule}`, background: accent }}>
            <div style={{ display: 'flex', fontSize: 16, color: ink }}>demo / aggressive</div>
            <div style={{ display: 'flex', fontSize: 68, letterSpacing: '-0.04em', color: ink, fontWeight: 700, marginTop: 14 }}>−20.1%</div>
            <div style={{ display: 'flex', width: 241, height: 13, border: `2px solid ${ink}`, marginTop: 22 }} />
            <div style={{ display: 'flex', width: 192.559, height: 13, background: ink, marginTop: 12 }} />
          </div>
        </div>
        <div style={{ display: 'flex', border: `2px solid ${rule}`, padding: '17px 20px', fontSize: 19, fontWeight: 700 }}>npx @trazum/cli bill usage.jsonl</div>
      </div>
    ),
    size,
  );
}
