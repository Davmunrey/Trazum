import { headers } from 'next/headers';

import { BootMark } from '../../components/BootMark';
import { getWebMessages, localeFromHeaders } from '../../lib/i18n';

/**
 * What stands in for the app while its JavaScript is still arriving.
 *
 * Next serves this from the server the instant navigation starts, so it is
 * the first thing a reader on a slow connection sees — and until now that was
 * a white page. Not a skeleton of the app: the app has five modes and no way
 * to know which one is coming, so a skeleton here would be a guess drawn at
 * full confidence. The mark and one line say the honest thing instead.
 *
 * Locale comes from the same header the layout reads, so the one line of text
 * is in the language the rest of the page will arrive in.
 *
 * It lives under `/app`, the application it stands in for, and not at the
 * root. At the root it wrapped every page in a streaming boundary, and a
 * boundary's content is swapped in by a script: with JavaScript off, the
 * landing at `/` was this mark and nothing else (#744).
 */
export default async function Loading() {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  return <BootMark label={getWebMessages(locale).booting} />;
}
