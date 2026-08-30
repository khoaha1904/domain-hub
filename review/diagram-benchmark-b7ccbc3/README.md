# AgentBase diagram benchmark

Published Hub snapshot: `b7ccbc364317363886333b2e1e1a199b8ab60948`

This review pack exercises the three focused diagram types agreed for
AgentBase. Each artifact is rendered only from its ready Published diagram
packet.

| Diagram | Domain | Packet | Topology |
|---|---|---|---|
| [Architecture](architecture.html) | Crawler | Ready | 8 nodes, 8 edges |
| [Dependency](dependency.html) | Crawler | Ready | 5 nodes, 4 runtime edges |
| [Sequence](sequence.html) | Digital Experience | Ready | 3 actors, 2 ordered asynchronous steps |

[Open the quantitative quality report](quality-report.html).

Provisional artifact quality is **89/100**. Benchmark confidence is **55/100**:
the current artifacts are a strong internal-review baseline, but one run and a
two-step Sequence do not yet qualify the renderer for release-level visual
quality.

## Current-data finding

The current Hub can render all three supported types, but not all three from
the Crawler Domain. Crawler Architecture and Dependency are ready. Crawler
Sequence returns `insufficient-data` because its Published projection contains
no admitted Flow. The available Sequence case therefore uses Digital
Experience's Application Delivery Pipeline.

Two data-quality gaps are visible rather than hidden by the renderer:

- `flows/apistatemachine.md` exists, but no accepted membership relationship
  admits that Flow into the Crawler projection, so it cannot drive a Crawler
  Sequence diagram.
- The queue, table and bucket are accepted runtime endpoints but are not Domain
  members. They correctly render as non-expandable boundary resources.

## Human review rubric

- [ ] The primary story is understandable within five seconds.
- [ ] Labels are readable without zooming on a normal desktop.
- [ ] Edge direction and asynchronous behavior are unambiguous.
- [ ] Structural grouping helps rather than distracts.
- [ ] Boundary resources and open Questions are visibly distinct.
- [ ] No node, edge, return, branch, or topology appears without packet data.
