# Crawler Discovery Impact Map benchmark

[Open the rendered benchmark](./index.html).

- AIT phase: Feature Discovery
- Priority: P0
- Hub commit: `521f5bfffccb7918076f5b287bbfd78d052ed0fc`
- Scenario: retry handling and operational visibility for failed Crawler jobs
- Verdict: useful for impact scoping; not yet qualified as the complete P0 map

The Published packet proves the publisher → SQS → worker → DynamoDB/S3 impact
surface and its two repository boundaries. It supplies no relevant Questions or
omissions for retry, DLQ/redrive, alarms or recovery ownership. Those items are
shown only in the clearly separated benchmark-gap panel and are not presented
as Hub facts.

Required improvement: carry query-selected, decision-relevant Questions and
explicit omissions into the diagram packet. More topology is not needed.
