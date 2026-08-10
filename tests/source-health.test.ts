import { describe,expect,it } from 'vitest';
import { sourceHealthSummary } from '../worker/lib/source-health';

describe('source ingestion health aggregation',()=>{
 it('reports pending without configured rows',()=>{expect(sourceHealthSummary(null)).toMatchObject({status:'pending',configured:0,feeds:0,apis:0});});
 it('reports healthy configured feed/API coverage',()=>{expect(sourceHealthSummary({total:32,feeds:30,apis:2,healthy:32,degraded:0,failed:0,backoff:0,stale:0,latest_item_at:'2026-08-10 18:00:00',last_success_at:'2026-08-10T18:01:00Z',last_attempt_at:'2026-08-10T18:02:00Z'})).toEqual({status:'healthy',configured:32,feeds:30,apis:2,healthy:32,degraded:0,failed:0,backoff:0,stale:0,latestItemAt:'2026-08-10T18:00:00.000Z',lastSuccessAt:'2026-08-10T18:01:00.000Z',lastAttemptAt:'2026-08-10T18:02:00.000Z'});});
 it('degrades on a failure or stale source without exposing error strings',()=>{const result=sourceHealthSummary({total:2,feeds:1,apis:1,healthy:1,degraded:0,failed:1,backoff:0,stale:1,error_summary:'secret URL'});expect(result.status).toBe('degraded');expect(result).not.toHaveProperty('error_summary');});
});
