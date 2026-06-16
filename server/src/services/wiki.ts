import * as ado from './adoClient';
import * as cache from './cache';
import type { Wiki, WikiPage } from '../models/ado';

const V = ado.API_VERSION;

export async function getWikis(project: string): Promise<Wiki[]> {
  return cache.cached(`wikis:${project}`, () =>
    ado.getAll<Wiki>(ado.p(project).wikis, { 'api-version': V })
  );
}

function flattenPages(page: WikiPage): WikiPage[] {
  const pages: WikiPage[] = [page];
  if (page.subPages) {
    for (const sub of page.subPages) pages.push(...flattenPages(sub));
  }
  return pages;
}

async function fetchPagesRecursive(project: string, wikiId: string): Promise<WikiPage[]> {
  try {
    const page = await ado.getOne<WikiPage>(ado.p(project).wikiPages(wikiId), {
      'api-version': V, path: '/', recursionLevel: 2, includeContent: 'false',
    });
    return flattenPages(page);
  } catch {
    return [];
  }
}

export async function getWikiPages(project: string, wikiId: string): Promise<WikiPage[]> {
  return cache.cached(`wiki:pages:${project}:${wikiId}`, () =>
    fetchPagesRecursive(project, wikiId)
  );
}

export async function getAllWikiPages(project: string): Promise<Array<WikiPage & { wikiId: string; wikiName: string }>> {
  const wikis = await getWikis(project);
  const results: Array<WikiPage & { wikiId: string; wikiName: string }> = [];
  for (const wiki of wikis) {
    const pages = await getWikiPages(project, wiki.id);
    results.push(...pages.map((p) => ({ ...p, wikiId: wiki.id, wikiName: wiki.name })));
  }
  return results;
}

const STALE_DAYS = 30;

export async function getWikiStats(project: string) {
  return cache.cached(`wiki:stats:${project}`, async () => {
    const pages = await getAllWikiPages(project);
    const now = Date.now();
    const staleCutoff = now - STALE_DAYS * 86_400_000;

    const stale = pages.filter((p) => !p.lastUpdatedDate || new Date(p.lastUpdatedDate).getTime() < staleCutoff);
    const recent = [...pages]
      .filter((p) => p.lastUpdatedDate)
      .sort((a, b) => new Date(b.lastUpdatedDate!).getTime() - new Date(a.lastUpdatedDate!).getTime())
      .slice(0, 20);

    const byAuthor: Record<string, number> = {};
    for (const p of pages) {
      const author = p.lastUpdatedBy?.displayName ?? 'Unknown';
      byAuthor[author] = (byAuthor[author] ?? 0) + 1;
    }
    return { totalPages: pages.length, stalePages: stale, recentlyUpdated: recent, byAuthor };
  });
}
