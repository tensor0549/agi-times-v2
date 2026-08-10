import fs from 'node:fs';
import crypto from 'node:crypto';
const config=JSON.parse(fs.readFileSync('data/ingestion-sources.json','utf8'));
const registry=JSON.parse(fs.readFileSync('content/registry.json','utf8'));
const sourceIds=new Set(registry.sources.map(source=>source.id));
const ids=new Set(),urls=new Set(),errors=[];const now=Date.now();
let enabledFeeds=0,enabledApis=0,current14d=0,stale30d=0;
for(const source of config.sources??[]){
 if(!source.id||ids.has(source.id))errors.push(`duplicate/missing ingestion id ${source.id??'?'}`);else ids.add(source.id);
 if(!sourceIds.has(source.sourceId))errors.push(`${source.id}: unresolved registry sourceId ${source.sourceId}`);
 if(!/^https:\/\//.test(source.url??''))errors.push(`${source.id}: HTTPS endpoint required`);
 if(source.healthUrl!==source.url)errors.push(`${source.id}: healthUrl must identify the exact configured endpoint`);
 if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(source.language??''))errors.push(`${source.id}: valid source language required`);
 if(!Number.isFinite(source.priority)||source.priority<0||source.priority>1)errors.push(`${source.id}: priority must be 0..1`);
 const endpoint=`${source.kind}:${source.url}`;if(urls.has(endpoint))errors.push(`${source.id}: duplicate endpoint`);else urls.add(endpoint);
 if(source.enabled!==true)continue;
 if(['rss','atom'].includes(source.kind)){
  enabledFeeds++;
  const latest=Date.parse(source.latestItemAt);
  if(!Number.isFinite(latest)||latest>now+300000)errors.push(`${source.id}: invalid/future latestItemAt`);
  else {const age=now-latest;if(age<=14*864e5)current14d++;if(age>30*864e5)stale30d++;}
 } else enabledApis++;
}
if(enabledFeeds<25)errors.push(`enabled feed floor not met: ${enabledFeeds}<25`);
if(enabledApis<2)errors.push(`GitHub/Hugging Face API floor not met: ${enabledApis}<2`);
const verification=config.lastVerification??{};const enabledTotal=enabledFeeds+enabledApis;
if(verification.attempted!==enabledTotal)errors.push(`lastVerification attempted count does not cover enabled endpoints: ${verification.attempted??'missing'}!=${enabledTotal}`);
if(![verification.http200,verification.blocked,verification.failed].every(value=>Number.isInteger(value)&&value>=0)||verification.http200+verification.blocked+verification.failed!==verification.attempted)errors.push('lastVerification outcome counts are incomplete/inconsistent');
const endpointDigest=crypto.createHash('sha256').update(JSON.stringify((config.sources??[]).filter(source=>source.enabled===true).map(({id,url})=>({id,url})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
if(verification.configDigest!==endpointDigest)errors.push('lastVerification does not match the enabled endpoint config');
const verifiedAt=Date.parse(config.lastVerifiedAt),updatedAt=Date.parse(config.updatedAt);if(!Number.isFinite(verifiedAt)||verifiedAt>now+300000||!Number.isFinite(updatedAt)||verifiedAt<updatedAt)errors.push('lastVerifiedAt is invalid, future, or older than config');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Validated ${enabledFeeds} enabled RSS/Atom sources (${current14d} published within 14d; ${stale30d} older than 30d) plus ${enabledApis} community APIs; latest endpoint verification ${verification.http200}/${verification.attempted} HTTP 200.`);
