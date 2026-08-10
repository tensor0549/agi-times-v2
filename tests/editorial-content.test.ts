import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
const read=(name:string)=>JSON.parse(fs.readFileSync(`content/${name}.json`,'utf8'));

describe('editorial freshness integrity',()=>{
  it('rejects dates more than five minutes in the future',()=>{
    const limit=Date.now()+5*60*1000;
    for(const item of read('feed').items) expect(Date.parse(item.publishedAt),`${item.id}.publishedAt`).toBeLessThanOrEqual(limit);
    for(const item of read('insights').items){expect(Date.parse(item.publishedAt),`${item.id}.publishedAt`).toBeLessThanOrEqual(limit);expect(Date.parse(item.updatedAt),`${item.id}.updatedAt`).toBeLessThanOrEqual(limit)}
  });
  it('requires featured placement to expire within 24 hours',()=>{
    const now=Date.now();
    for(const item of read('feed').items.filter((x:{featured?:boolean})=>x.featured)){
      const expiry=Date.parse(item.featuredUntil);
      expect(Number.isFinite(expiry),`${item.id}.featuredUntil`).toBe(true);
      expect(expiry,`${item.id} expired featured placement`).toBeGreaterThan(now);
      expect(expiry-Date.parse(item.publishedAt),`${item.id} featured >24h`).toBeLessThanOrEqual(24*60*60*1000);
    }
  });
  it('does not republish materially unchanged insight bodies under new IDs',()=>{
    const seen=new Map<string,string>();
    for(const item of read('insights').items){const hash=JSON.stringify(item.body);expect(seen.get(hash),`${item.id} duplicates ${seen.get(hash)}`).toBeUndefined();seen.set(hash,item.id)}
  });
});
