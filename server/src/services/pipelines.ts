import * as ado from './adoClient';
import * as cache from './cache';
import type { Pipeline, PipelineRun, TestRun } from '../models/ado';

const V = ado.API_VERSION;

export async function getPipelines(project: string): Promise<Pipeline[]> {
  return cache.cached(`pipelines:${project}`, () =>
    ado.getAll<Pipeline>(ado.p(project).pipelines, { 'api-version': V })
  );
}

export async function getPipelineRuns(project: string, pipelineId: number, top = 50): Promise<PipelineRun[]> {
  return cache.cached(`pipeline:runs:${project}:${pipelineId}:${top}`, () =>
    ado.getAll<PipelineRun>(ado.p(project).pipelineRuns(pipelineId), { 'api-version': V, $top: top })
  );
}

export async function getAllRecentRuns(project: string, top = 20): Promise<Array<PipelineRun & { pipelineName: string }>> {
  const pipelines = await getPipelines(project);
  const results: Array<PipelineRun & { pipelineName: string }> = [];
  for (const pipe of pipelines) {
    const runs = await getPipelineRuns(project, pipe.id, top);
    results.push(...runs.map((r) => ({ ...r, pipelineName: pipe.name })));
  }
  return results;
}

export async function getTestRuns(project: string, fromDate?: string): Promise<TestRun[]> {
  return cache.cached(`testruns:${project}:${fromDate ?? 'all'}`, () => {
    const params: Record<string, unknown> = { 'api-version': V };
    if (fromDate) params.minLastUpdatedDate = fromDate;
    return ado.getAll<TestRun>(ado.p(project).testRuns, params);
  });
}

export async function getPipelineStats(project: string) {
  return cache.cached(`pipeline:stats:${project}`, async () => {
    const runs = await getAllRecentRuns(project, 30);
    const completed = runs.filter((r) => r.state === 'completed');
    const succeeded = completed.filter((r) => r.result === 'succeeded').length;
    const failed = completed.filter((r) => r.result === 'failed').length;
    const canceled = completed.filter((r) => r.result === 'canceled').length;
    return {
      totalRuns: completed.length, succeeded, failed, canceled,
      successRate: completed.length ? Math.round((succeeded / completed.length) * 100) : 0,
      recentRuns: runs.slice(0, 50),
    };
  });
}
