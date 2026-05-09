# Realtime Translation vs Obsidian Clipper Comparison

Date: 2026-05-10

## Inputs

- Realtime translation export: ignored raw local file
- Obsidian Clipper transcript export: ignored raw local file
- Video: `Inside the Rise of Autonomous AI Hackers: XBOW's Oege de Moor`

Raw transcript exports are intentionally not tracked in this public repository. This report keeps only summarized comparison notes.

## Summary

The realtime Korean translation preserved the main argument and most major examples. It was useful as a live viewing aid. It is not yet reliable enough to serve as a clean archival transcript without post-processing.

The Obsidian Clipper document was better for review because it included source metadata, sections, timestamps, and an English transcript. The realtime translation export was a single Korean paragraph with no timestamps or section boundaries.

## Accuracy Findings

### Clear Misses

- The opening setup about a government breach and human hackers using AI assistants was mostly missing from the realtime translation. This weakened the contrast between AI-assisted hacking and fully autonomous hacking.
- The explanation of Oda Nobunaga was mistranslated. The source described him as a rising minor warlord; the realtime translation implied a very different status.
- The product name `XBOW` was mostly understandable but unstable in one section.
- Model names were unstable. `Sonnet` was misheard as `Sonar`/`SonarQ`, and version-like numbers were also distorted.
- A section that appears to refer to another tool or model was interpreted as Microsoft. The source transcript itself was uncertain there, so this segment needs manual review against the original video.
- `open weight models` was translated too literally. `open-weight models` or Korean `오픈웨이트 모델` would be clearer.

### Partial Degradation

- The Takeda cavalry point lost the stronger meaning that the cavalry was considered nearly invincible.
- The endpoint-prioritization phrase was understandable but too casual for a technical archive.
- A dismissive phrase about weak cyber benchmarks was translated accurately enough for meaning, but with reduced rhetorical force.

## What Worked Well

The realtime translation conveyed these major points correctly:

- Autonomous hacking means AI performs the whole hacking workflow without human help.
- Cybersecurity may become an arms race where the side with stronger AI wins.
- The Bing Image Search RCE case was presented as a concrete example.
- XBOW found vulnerabilities from black-box access.
- The HackerOne leaderboard story was preserved.
- The model-alloy idea was understandable.
- The GPT-5 performance extrapolation was preserved.
- The argument about CVE exploitation timing becoming negative was preserved.
- The closing call to action and 6-9 month urgency were preserved.

## Suitability

| Use case | Assessment |
| --- | --- |
| Live viewing aid | Good |
| Fast Korean understanding | Good |
| Accurate archival transcript | Needs post-processing |
| Quoting or citation | Not enough |
| Knowledge-base ingestion | Needs cleanup |

## Recommended Improvements

1. Add sentence and paragraph boundary post-processing.
2. Add timestamps to the translated transcript.
3. Compare against a source transcript after the session.
4. Apply glossary correction for names and technical terms.
5. Mark uncertain segments for manual review.

Recommended glossary candidates:

| Variant | Preferred form |
| --- | --- |
| Xbo, 엑스보 | XBOW |
| 해커원 | HackerOne |
| Sonar, SonarQ | Sonnet |
| Gemini 25 | Gemini 2.5 |
| Sonnet 40 | Sonnet 4.0 |
| 나가시노 | Nagashino |
| 오다 노부나가 | Oda Nobunaga |
| 다케다 | Takeda |
| 열려 있는 가중치 모델 | 오픈웨이트 모델 |

## Conclusion

The PoC succeeded as a realtime comprehension tool. It should not yet store raw realtime output as the final record. The next useful step is a post-processing pipeline that aligns the realtime Korean transcript with a source transcript, repairs names, adds timestamps, and emits a cleaned Markdown note.
