import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as cache from './cache';

const ORG = process.env.ADO_ORG!;
const PAT = process.env.ADO_PAT!;

if (!ORG || !PAT) {
  throw new Error('ADO_ORG and ADO_PAT must be set in .env');
}

// Base64-encode ":<PAT>" for Basic auth
const token = Buffer.from(`:${PAT}`).toString('base64');

const orgBase = `https://dev.azure.com/${ORG}`;
const vsrmBase = `https://vsrm.dev.azure.com/${ORG}`;

function makeClient(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30_000,
  });
}

const orgClient = makeClient(orgBase);
const vsrmClient = makeClient(vsrmBase);

// ── Generic helpers ───────────────────────────────────────────────────────────

/** GET with full pagination via continuationToken */
export async function getAll<T>(
  path: string,
  params: Record<string, unknown> = {},
  useVsrm = false
): Promise<T[]> {
  const client = useVsrm ? vsrmClient : orgClient;
  const results: T[] = [];
  let continuationToken: string | undefined;

  do {
    const config: AxiosRequestConfig = {
      params: { ...params, ...(continuationToken ? { continuationToken } : {}) },
    };
    const resp = await client.get<{ value: T[]; count?: number }>(path, config);
    results.push(...(resp.data.value ?? []));
    continuationToken = resp.headers['x-ms-continuationtoken'] as string | undefined;
  } while (continuationToken);

  return results;
}

/** GET a single resource */
export async function getOne<T>(
  path: string,
  params: Record<string, unknown> = {},
  useVsrm = false
): Promise<T> {
  const client = useVsrm ? vsrmClient : orgClient;
  const resp = await client.get<T>(path, { params });
  return resp.data;
}

/** POST (e.g. WIQL queries, batch fetch) */
export async function post<T>(
  path: string,
  body: unknown,
  params: Record<string, unknown> = {}
): Promise<T> {
  const resp = await orgClient.post<T>(path, body, { params });
  return resp.data;
}

// ── Path builders (project-scoped) ────────────────────────────────────────────

export function p(project: string) {
  return {
    teams: `/${project}/_apis/teams`,
    iterations: (team: string) => `/${project}/${team}/_apis/work/teamsettings/iterations`,
    wiql: `/${project}/_apis/wit/wiql`,
    workItemsBatch: `/_apis/wit/workitemsbatch`,
    workItem: (id: number) => `/${project}/_apis/wit/workitems/${id}`,
    repos: `/${project}/_apis/git/repositories`,
    commits: (repoId: string) => `/${project}/_apis/git/repositories/${repoId}/commits`,
    pullRequests: (repoId: string) => `/${project}/_apis/git/repositories/${repoId}/pullrequests`,
    branches: (repoId: string) => `/${project}/_apis/git/repositories/${repoId}/refs`,
    wikis: `/${project}/_apis/wiki/wikis`,
    wikiPages: (wikiId: string) => `/${project}/_apis/wiki/wikis/${wikiId}/pages`,
    pipelines: `/${project}/_apis/pipelines`,
    pipelineRuns: (pipelineId: number) => `/${project}/_apis/pipelines/${pipelineId}/runs`,
    testRuns: `/${project}/_apis/test/runs`,
    teamFieldValues: (team: string) => `/${project}/${team}/_apis/work/teamsettings/teamfieldvalues`,
  };
}

// Org-level paths (no project)
export const orgPaths = {
  projects: `/_apis/projects`,
  workItemsBatch: `/_apis/wit/workitemsbatch`,
};

export const API_VERSION = '7.1';

// ── Batch work-item fetcher ───────────────────────────────────────────────────

const BATCH_SIZE = 200;

export async function fetchWorkItemsBatch(
  ids: number[],
  fields: string[]
): Promise<import('../models/ado').WorkItem[]> {
  const all: import('../models/ado').WorkItem[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const result = await post<{ value: import('../models/ado').WorkItem[] }>(
      orgPaths.workItemsBatch,
      { ids: chunk, fields },
      { 'api-version': API_VERSION }
    );
    all.push(...result.value);
  }
  return all;
}

// ── Connectivity check ────────────────────────────────────────────────────────

export async function ping(): Promise<{ org: string; projectCount: number; projects: string[]; status: string }> {
  return cache.cached(`ping:${ORG}`, async () => {
    const data = await getAll<{ name: string }>(orgPaths.projects, { 'api-version': API_VERSION });
    return {
      org: ORG,
      projectCount: data.length,
      projects: data.map((p) => p.name).sort(),
      status: 'ok',
    };
  }, 60);
}
