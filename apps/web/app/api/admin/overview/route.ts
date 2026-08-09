import { authConfig } from '../../../../lib/auth/config';
import { adminList, adminSource } from '../../../../lib/admin/config';
import { buildOverview } from '../../../../lib/admin/overview';
import { privateJson, requireCaller } from '../../../../lib/prompts/api';
import { CENSUS_LIMIT } from '../../../../lib/store/prompts';

export const runtime = 'nodejs';

/**
 * `GET /api/admin/overview` — what this deployment's prompts add up to.
 *
 * The only endpoint in Trazum that reads across accounts, so the guard is the
 * first thing in it and the default is off: with `TRAZUM_ADMINS` unset there is
 * no admin, and this answers **404**.
 *
 * 404 and not 403, for the same reason the prompt routes do it: a 403 tells a
 * signed-in stranger that an admin dashboard exists here and that they are not
 * on the list, which is a map of what to attack next. A signed-out caller still
 * gets 401 from `requireCaller`, because that is about the session and not about
 * this route existing.
 *
 * It returns counts, names and logins — never prompt text. An admin is an
 * operator, not an auditor of what their colleagues wrote, and "which prompt is
 * expensive" is answerable from a name. The text stays in the store layer, where
 * `PromptCensus` carries it only long enough to be counted.
 */

const NOT_FOUND = { error: 'not found' };

export async function GET(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: false });
  if (caller instanceof Response) return caller;

  const config = authConfig();
  if (!config.enabled) return privateJson(NOT_FOUND, 404);

  const list = adminList();
  const source = adminSource(caller.user, list);
  if (!source) return privateJson(NOT_FOUND, 404);

  const census = await caller.store.admin.census(CENSUS_LIMIT);
  const overview = buildOverview(census);

  return privateJson({
    ...overview,
    limit: CENSUS_LIMIT,
    /**
     * How this caller was recognised, so the page can say it.
     *
     * `login` means the admin list named a GitHub username, which is renameable
     * and — once released — reusable by somebody else. The dashboard surfaces
     * that rather than leaving it in a config file's documentation.
     */
    adminSource: source,
  });
}
