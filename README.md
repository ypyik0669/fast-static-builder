# Fast Static Builder

[![Make.fun bounty](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)
[![Rank](https://make.fun/badge/site-generator-speed-01-run-20261122/ypyik0669/fast-static-builder/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard)
[![Reward](https://make.fun/badge/site-generator-speed-01-run-20261122/ypyik0669/fast-static-builder/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)

SPDX-License-Identifier: MIT

An independently written JavaScript implementation of the `makefun-site` 1.0.0 output contract for Make.fun's `site-generator-speed-01-run-20261122` challenge.

## Interface

`solve.js` exports synchronous `run(input)`, returning the complete path-to-text output object for `{site, templates, files}`. `main.ts` is the Node.js contest entry point: it reads `/input/cases.json` and writes `/output/answers.json`. For local execution, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` can replace those two directories. Create the output directory before starting the driver.

Use Node 22.18 or later. No dependencies, network access, subprocesses, persistent state, or precomputed answers are needed.

## Implementation

- Header-only front-matter scanning avoids splitting complete Markdown documents.
- Markdown rendering scans ordinary text in chunks rather than escaping every character separately.
- Templates compile into specialized JavaScript with lexical loop bindings.
- Proven immutable, shared template subtrees and repeated short escaped strings are memoized within one site build.
- Slugs, relative-link resolution, and date strings are cached within one build.

Generated template code quotes source text and property names as JavaScript string literals. Template content is not executed as JavaScript.

## Validation

The implementation was compared with the official kit's reference output on all three public practice cases, then on 45 additional locally generated sites comprising 18,200 input files. Every output path and file content matched. Component checks included 25,000 front-matter/Unicode slug differentials, 25,000 Markdown fuzz cases, 12,000 template fuzz cases, and targeted template scope/include tests.

Tests used Node 22.22.2 for full-entry checks. The rules identify Node 22.23.4 for the grader. Local results do not certify the later, previously unknown scored instance or the official sandbox. Benchmarks are local measurements, not an official grade, ranking, confidence test, or assurance of payment.

## Scope

This repository contains only the implementation, its driver, and documentation/license. It contains no practice fixtures, expected answers, baseline implementation, competition CLI, credentials, or conversation transcripts. The official kit was used outside this repository for specification and local validation.
