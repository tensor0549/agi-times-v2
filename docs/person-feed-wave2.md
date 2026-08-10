# Verified person-feed wave 2

Verified with live HTTP GET and XML parsing on 2026-08-10. These eight people are restored from prior source commit `6d43f20` and remain first-class registry records.

| Source ID | Person | First-party feed | Latest verified item date | Ingestion state |
|---|---|---|---|---|
| `src_nathan-lambert` | Nathan Lambert | https://www.interconnects.ai/feed | 2026-08-10 | registry only |
| `src_dean-w-ball` | Dean W. Ball | https://www.hyperdimensional.co/feed | 2026-06-26 | registry only |
| `src_miles-brundage` | Miles Brundage | https://milesbrundage.substack.com/feed | 2026-07-16 | registry only |
| `src_jacob-steinhardt` | Jacob Steinhardt | https://bounded-regret.ghost.io/rss/ | 2026-07-28 | **enabled** |
| `src_scott-aaronson` | Scott Aaronson | https://scottaaronson.blog/?feed=rss2 | 2026-08-07 | **enabled; AI classification required** |
| `src_hamel-husain` | Hamel Husain | https://hamel.dev/index.xml | 2026-07-11 | registry only |
| `src_nicholas-carlini` | Nicholas Carlini | https://nicholas.carlini.com/writing/feed.xml | 2026-03-09 | registry only |
| `src_eric-jang` | Eric Jang | https://evjang.com/feed.xml | 2026-04-28 | registry only |

Scott Aaronson and Jacob Steinhardt replace two newsletter endpoints that are live from the Agency network but consistently return HTTP 403 from GitHub-hosted Actions. This preserves 33 configured endpoints while adding actual person-source ingestion.

Editorial/source rules:

1. Preserve the author as the asserting source; newsletter hosts are distribution infrastructure only.
2. Personal commentary may support analysis or context, but high-risk factual claims require primary evidence or independent corroboration.
3. Apply the same item URL, bilingual, dedupe, freshness and AGI-relevance gates used for organization and media sources.
4. Scott Aaronson's broad feed must pass independent AI relevance classification before writer input.
