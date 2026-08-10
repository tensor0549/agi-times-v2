import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedbackPostHogEvent, safeAnalyticsProperties } from '../worker/lib/analytics-properties';
import worker from '../worker/index';
import { capture } from '../worker/lib/posthog';

afterEach(() => vi.unstubAllGlobals());

describe('PostHog privacy boundary', () => {
  it('drops arbitrary analytics properties and buckets routes', () => {
    expect(safeAnalyticsProperties('search_performed', {
      query: 'private search text', query_length: 42, remote_result_count: 3, provider: 'api',
      path: '/reset/private-token', locale: 'en', email: 'person@example.com', userAgent: 'private-agent',
    })).toEqual({ query_length: 42, remote_result_count: 3, provider: 'api', path: 'other', locale: 'en' });
    expect(safeAnalyticsProperties('feedback_submitted', { message: 'private', email: 'person@example.com' })).toEqual({});
    expect(safeAnalyticsProperties('article_opened', { article_id:'person.ssn:123456789',path:'/',locale:'en' })).toEqual({path:'root',locale:'en'});
  });

  it('rejects public identifier smuggling and the server-only feedback event before PostHog', async () => {
    const network=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(null,{status:200}));
    vi.stubGlobal('fetch',network);
    const env={POSTHOG_API_KEY:'project-key',POSTHOG_HOST:'https://posthog.invalid',ENVIRONMENT:'production'} as never;
    const context={waitUntil:()=>{throw new Error('PostHog must not be scheduled');}} as never;
    const piiId=await worker.fetch(new Request('https://agitime.ai/api/v1/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'page_viewed',distinctId:'person@example.com',properties:{}})}),env,context);
    const serverOnly=await worker.fetch(new Request('https://agitime.ai/api/v1/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'feedback_submitted',distinctId:'7cc39c2b-5de9-4a55-9c1d-b05b77a21ef7',properties:{message:'private'}})}),env,context);
    expect(piiId.status).toBe(400);
    expect(serverOnly.status).toBe(400);
    expect(network).not.toHaveBeenCalled();
  });

  it('builds feedback analytics from only server-approved coarse fields', () => {
    const event=feedbackPostHogEvent('opaque-feedback-id',2,'zh',{
      feedbackType:'bug',theme:'dark',viewport:'390x844',userAgent:'private-browser-value',
      message:'private message',email:'person@example.com',content_id:'user-controlled',token:'secret-value',
    },'https://agitime.ai/reset/private-token?email=person@example.com#secret');
    expect(event).toEqual({
      event:'feedback_submitted',distinctId:'opaque-feedback-id',
      properties:{feedback_id:'opaque-feedback-id',rating:2,locale:'zh',feedback_type:'bug',theme:'dark',viewport_bucket:'mobile',route:'other'},
    });
    const serialized=JSON.stringify(event);
    for(const forbidden of ['private-browser-value','private message','person@example.com','user-controlled','secret-value','private-token','page_url','content_id','userAgent']) expect(serialized).not.toContain(forbidden);
  });

  it('keeps full feedback context in D1 while the 201 response schedules only a minimized PostHog payload', async () => {
    let feedbackBind: unknown[]=[];
    const waits: Promise<unknown>[]=[];
    const DB={prepare:(sql:string)=>{
      const statement={
        bind:(...values:unknown[])=>{if(sql.includes('INSERT INTO feedback (')) feedbackBind=values;return statement;},
        run:async()=>({success:true}),
        first:async()=>sql.includes('SELECT count FROM api_rate_limits')?{count:1}:null,
      };
      return statement;
    }};
    const network=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(null,{status:200}));
    vi.stubGlobal('fetch',network);
    const response=await worker.fetch(new Request('https://agitime.ai/api/v1/feedback',{
      method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},
      body:JSON.stringify({rating:2,message:'synthetic private report',email:'synthetic@example.invalid',locale:'en',
        pageUrl:'https://agitime.ai/?private=query',contentId:'user-controlled-content',distinctId:'browser-session-private-id',
        context:{feedbackType:'bug',theme:'dark',viewport:'390x844',userAgent:'synthetic-private-agent',arbitrary:'synthetic-private-context'}}),
    }),{DB,RATE_LIMIT_SALT:'test-salt',POSTHOG_API_KEY:'project-key',POSTHOG_HOST:'https://posthog.invalid',ENVIRONMENT:'production'} as never,{waitUntil:(promise:Promise<unknown>)=>waits.push(promise)} as never);
    expect(response.status).toBe(201);
    await Promise.all(waits);
    expect(feedbackBind.slice(1)).toEqual([2,'synthetic private report','synthetic@example.invalid','en','https://agitime.ai/?private=query','user-controlled-content',JSON.stringify({feedbackType:'bug',theme:'dark',viewport:'390x844',userAgent:'synthetic-private-agent',arbitrary:'synthetic-private-context'})]);
    const posthogCall=network.mock.calls[0] as unknown as [RequestInfo|URL,RequestInit];
    const posthog=JSON.parse(String(posthogCall[1].body));
    const opaqueId=feedbackBind[0];
    expect(posthog.properties).toEqual({distinct_id:opaqueId,feedback_id:opaqueId,rating:2,locale:'en',feedback_type:'bug',theme:'dark',viewport_bucket:'mobile',route:'root',request_id:expect.any(String),environment:'production',$lib:'agi-times-worker'});
    const serialized=JSON.stringify(posthog);
    for(const forbidden of ['synthetic private report','synthetic@example.invalid','?private=query','user-controlled-content','browser-session-private-id','synthetic-private-agent','synthetic-private-context','page_url','content_id','userAgent']) expect(serialized).not.toContain(forbidden);
  });

  it('sends a network payload with the opaque feedback ID, never the browser ID or raw context', async () => {
    const browserId='browser-session-private-id';
    const network=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(null,{status:200}));
    vi.stubGlobal('fetch',network);
    const event=feedbackPostHogEvent('opaque-feedback-id',5,'en',{
      feedbackType:'source',theme:'light',viewport:'1440x900',userAgent:'private-browser-value',
      distinctId:browserId,message:'private message',email:'person@example.com',
    },'https://agitime.ai/?private=query');
    await capture({POSTHOG_API_KEY:'project-key',POSTHOG_HOST:'https://posthog.invalid',ENVIRONMENT:'production'} as never,event,'opaque-request-id');
    expect(network).toHaveBeenCalledOnce();
    const captureCall=network.mock.calls[0] as unknown as [RequestInfo|URL,RequestInit];
    const body=JSON.parse(String(captureCall[1].body));
    expect(body.properties).toEqual({
      distinct_id:'opaque-feedback-id',feedback_id:'opaque-feedback-id',rating:5,locale:'en',
      feedback_type:'source',theme:'light',viewport_bucket:'desktop',route:'root',
      request_id:'opaque-request-id',environment:'production',$lib:'agi-times-worker',
    });
    const serialized=JSON.stringify(body);
    for(const forbidden of [browserId,'private-browser-value','private message','person@example.com','?private=query','page_url','content_id','userAgent']) expect(serialized).not.toContain(forbidden);
  });
});
