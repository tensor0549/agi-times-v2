import { describe,expect,it,vi } from 'vitest';
import { canTransition,isCanonicalDeploy,verifyCandidate } from '../scripts/lib/feedback-verification.mjs';
const sha='a'.repeat(40);
const canonical={head_sha:sha,event:'push',head_branch:'main',conclusion:'success',path:'.github/workflows/deploy.yml'};
const row={fix_sha:sha,probe_path:'/api/v1/health',probe_method:'GET',expected_status_min:200,expected_status_max:299};
describe('feedback fix verification',()=>{
 it('pins evidence to canonical push deploy on main at exact fix SHA',()=>{
  expect(isCanonicalDeploy(canonical,sha)).toBe(true);
  for(const mutation of [{event:'workflow_dispatch'},{head_branch:'feature'},{path:'.github/workflows/other.yml'},{head_sha:'b'.repeat(40)},{conclusion:'failure'}]) expect(isCanonicalDeploy({...canonical,...mutation},sha)).toBe(false);
 });
 it('rejects pre-fix/wrong deploy and failing probes',async()=>{
  expect((await verifyCandidate(row,{listDeployRuns:async()=>[{...canonical,head_sha:'b'.repeat(40)}],probe:async()=>200})).passed).toBe(false);
  expect((await verifyCandidate(row,{listDeployRuns:async()=>[canonical],probe:async()=>500})).passed).toBe(false);
 });
 it('rejects unregistered paths, methods, and caller-controlled expectations without probing',async()=>{
  for(const mutation of [
   {probe_path:'/private'},
   {probe_path:'//evil.example/private'},
   {probe_method:'HEAD'},
   {probe_path:'/',probe_method:null,expected_status_min:200,expected_status_max:299},
   {probe_path:'/',probe_method:'INVALID',expected_status_min:200,expected_status_max:299},
   {expected_status_min:100},
   {expected_status_max:599},
  ]) {
   const probe=vi.fn(async()=>200);
   expect((await verifyCandidate({...row,...mutation},{listDeployRuns:async()=>[canonical],probe})).passed).toBe(false);
   expect(probe).not.toHaveBeenCalled();
  }
 });
 it('accepts only exact canonical deploy plus registered passing probe',async()=>{
  expect(await verifyCandidate(row,{listDeployRuns:async()=>[canonical],probe:async()=>204})).toEqual({passed:true,status:204,deployedSha:sha});
 });
 it('enforces conditional state transitions and manual resolution evidence',()=>{
  expect(canTransition({status:'new'},'claim')).toBe(true); expect(canTransition({status:'reviewing'},'claim')).toBe(false);
  expect(canTransition({status:'reviewing',fix_sha:sha,deployed_sha:null,verified_at:null},'resolve')).toBe(false);
  expect(canTransition({status:'reviewing',fix_sha:sha,deployed_sha:sha,verified_at:'now'},'resolve')).toBe(true);
  expect(canTransition({status:'resolved'},'non-actionable')).toBe(false); expect(canTransition({status:'new'},'non-actionable')).toBe(true);
 });
});
