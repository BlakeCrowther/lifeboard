---
type: Design Doc
title: Agent-agnostic lifeboard, research
description: Provider-by-capability research for running lifeboard with agents other than Claude (Codex/ChatGPT, Cursor, Gemini, Copilot, Grok), plus an inventory of every Claude-specific touchpoint in the repo.
status: draft
design_status: proposed
tags: [agents, hosting, db, skills, research]
---

# Agent-agnostic lifeboard, research

**Goal:** find out what each major agent provider offers in place of what lifeboard gets from claude.ai, so we can decide the adapter boundary, the fallback and the distribution for [feature lifeboard#10: agent-agnostic lifeboard](https://github.com/BlakeCrowther/lifeboard/issues/10). Research only: no design is decided here.

**Result in one line:** the agent side already ports (rules and skills are now cross-agent standards that our layout mostly matches). The page side does not: no other provider gives a hosted page, a db that both the page and the agent write, and page-to-agent calls in one place. Any non-Claude setup needs a small self-hosted backend for the page and its data.

Seen 2026-11-24. **Verified** = read on the provider's own docs or changelog this session. **Secondary** = from search summaries or third-party write-ups only; check before building on it.

Terms used below:
- **Host runtime**: what the page gets from where it is hosted. On claude.ai that is `window.claude.use('db' | 'mcp' | 'sample')`.
- **Board data access**: how an agent reads and writes the board's db rows. On Claude that is the `ArtifactData` tool.
- **Self-hosted fallback**: a page host plus db that we run ourselves, for providers with no host runtime.

## The six capabilities

lifeboard leans on six things. The issue's (a) to (e), plus connectors:

| | Capability | What lifeboard uses it for today |
|---|---|---|
| a | Hosted page | The board itself, published as a claude.ai Artifact |
| b | Shared db, page and agent | Every collection; the weekly run and skills read and write rows (`ArtifactData`) |
| c | Page asks the agent / in-page LLM | "Ask Claude" chat sheet and Adjust (`sample`); Send to Duet (`fire_trigger`) |
| d | Skills and rules | `.agents/skills/*/SKILL.md` (symlinked as `.claude/skills`), `AGENTS.md` |
| e | Scheduled unattended runs | Weekly visitor / season seeds: build models, commit, republish, write rows |
| f | Connectors from the page | Google Calendar via `mcp.watchTool` |

## Provider matrix

`native` = built in. `partial` = exists with real limits. `none` = nothing. `self-host` = only with our own backend.

| Provider | a. Hosted page | b. Shared db | c. Page asks agent / LLM | d. Skills + rules | e. Scheduled runs | f. Connectors from page |
|---|---|---|---|---|---|---|
| **claude.ai + Claude Code** | native | native | native | native | native | native |
| **OpenAI ChatGPT + Codex** | partial: Apps SDK / MCP Apps widget lives inside a chat, no standalone URL | self-host: `widgetState` is per widget and conversation; docs say durable data belongs in your backend | partial: `sendFollowUpMessage` answers in the chat, not back to the page | native | native: scheduled tasks; local projects need the computer on, Team Tasks run in the cloud | self-host |
| **Cursor** | none | self-host | self-host | native | native: Automations (cron, repo, PR) | none |
| **Google (Gemini CLI, Jules, AI Studio)** | partial: AI Studio Build publishes to Cloud Run; Canvas share links (secondary) | partial: AI Studio can provision Firestore for the page; agent wiring is ours (secondary) | partial: Gemini API through the app's backend (secondary) | native, with one setting (see below) | native: Jules scheduled tasks (secondary); Gemini CLI in GitHub Actions | none |
| **GitHub Copilot** | none: Spark is retired | self-host | none | native | native: cloud agent automations (weekly, opens PRs) | none |
| **xAI Grok** | partial: Grok Build publishes to grok.me (secondary) | self-host: no built-in db found (secondary) | partial: per-app xAI API (secondary) | native (secondary) | partial: Automations, plan-gated, repo access unclear (secondary) | none |

### What is verified, per provider

- **claude.ai baseline** ([artifacts docs](https://code.claude.com/docs/en/artifacts)): single page of at most 16 MiB; scripts only from five CDNs. Connector calls run as the viewer, need each viewer's approval, and only work with claude.ai connectors (not `.mcp.json`). Plans: Pro and up, Anthropic API only (not Bedrock or Vertex).
- **Codex**:
  - [Skills docs](https://developers.openai.com/codex/skills): skills load from `.agents/skills` in every directory from the working directory up to the repo root, plus `~/.agents/skills`.
  - [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md): global then root-down concatenation, with a **32 KiB default cap** (`project_doc_max_bytes`). Our `AGENTS.md` is about 19 KB.
  - [Scheduled tasks](https://developers.openai.com/codex/app/automations): run in the background, can combine with skills; local projects need the computer on and the app running.
- **ChatGPT Apps SDK** ([state management](https://developers.openai.com/apps-sdk/build/state-management)): `widgetState` is widget-scoped, and data that must survive across conversations or devices belongs in your own backend.
- **Cursor**:
  - [Skills](https://cursor.com/docs/skills): reads `.agents/skills/` and `.cursor/skills/`, plus `.claude/skills/` and `.codex/skills/` for compatibility.
  - [Automations](https://cursor.com/docs/cloud-agent/automations): cron triggers, but cron defaults to no repository; you must name one.
- **Copilot**:
  - [Agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills): project skills in `.github/skills`, `.claude/skills` or `.agents/skills`.
  - [Automations changelog](https://github.blog/changelog/2026-06-02-schedule-and-automate-tasks-with-copilot-cloud-agent/): hourly, daily or weekly triggers, one repo each, can open PRs.
  - [Spark deprecation](https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com/): no new apps since 2026-08-04.
- **Gemini CLI** ([skills](https://geminicli.com/docs/cli/skills)): reads `.agents/skills/` (which wins over `.gemini/skills/`). Its context file is `GEMINI.md` unless `context.fileName` is set to include `AGENTS.md` (secondary).
- **Claude Code** ([memory](https://code.claude.com/docs/en/memory)): reads `AGENTS.md` natively when there is no `CLAUDE.md` (v2.1.277+). It is the one agent here that does not read `.agents/skills`, hence our symlink.
- **MCP Apps** ([overview](https://modelcontextprotocol.io/extensions/apps/overview)): interactive HTML rendered inside a chat host. Listed hosts: Claude, Claude Desktop, VS Code Copilot, M365 Copilot, Goose, Postman, MCPJam, Archestra. ChatGPT's Apps SDK also speaks it. State lives in the MCP server behind it; there is no standalone URL.

## Findings

1. **Rules and skills are solved by standards.** `.agents/skills/*/SKILL.md` is read natively by Codex, Cursor, Gemini CLI and Copilot; Claude Code reads it through our `.claude/skills` symlink. `AGENTS.md` is read by Codex, Cursor, Copilot, Jules and Claude Code (Gemini CLI with one setting). Our skill frontmatter is already only `name` + `description`. The portability problem is the **content**: skills name Claude tools (`Artifact`, `ArtifactData`, `AskUserQuestion`, `preview_start`, subagents with `model: "sonnet"`).
2. **Only claude.ai bundles page + db + agent access.** Every other provider is missing at least one of (a), (b), (c). ChatGPT and MCP Apps give a page inside a chat, not a board you open from a URL. Grok Build and AI Studio host pages but leave the agent's access to the data to us. So a non-Claude lifeboard needs the self-hosted fallback.
3. **Scheduling exists everywhere, in different shapes.** Every provider can run a weekly prompt against the repo and open a PR (Codex/ChatGPT, Cursor, Copilot, Jules), and any headless CLI can run from GitHub Actions cron. What differs is whether the run can reach the board's db and publish the page; that comes back to the fallback.
4. **Page-side connectors and in-page LLM are claude.ai-only.** Google Calendar from the page, "Ask Claude" and Adjust have no equivalent. Elsewhere they need our backend (OAuth for Calendar, an API key for the LLM) or a downgrade to the existing fallbacks: copy-the-prompt and the `adjust_request` / `duet_request` mailbox fields, picked up on the next agent run.
5. **There is no cross-agent plugin format yet.** Claude Code, Codex and Gemini CLI each have their own manifest. An "Agent Plugins" standard is reported for Cursor, Copilot, Codex and Kiro, without Claude (secondary). Skills, `AGENTS.md` and MCP are the portable layer; plugins are not.
6. **The weekly model pipeline's quality gate is tied to one model.** The judge bars in `models/*/qa_calibration.json` are calibrated on Claude Sonnet. Another provider's judges would need the goldens re-judged and new bars (the rule already in `AGENTS.md`).

## Claude touchpoints in this repo

Full inventory by bucket. "Isolated" means behind one interface today.

| Bucket | Main touchpoints | Isolated? |
|---|---|---|
| a. Hosted page | `src/packages/ui/shared/artifact-runtime.ts` (`window.claude`), publish steps in `AGENTS.md` and `lifeboard-setup`, `tools/live-diff.ts` (strips the artifact wrapper), `.claude/launch.json`, sign-in copy in `ui/app/render.ts` | partly: one runtime file |
| b. Shared db | `src/packages/db/lib/adapter.ts` (`DbAdapter`), but `ui/game/game.ts` and `ui/game/lessons.ts` call `useDb()` directly. Agent side: `ArtifactData` in `lesson-make`, `game-reset`, `break-setup`, `weekly-visitor`, `SPEC.md`, `docs/design/cloud-pipeline.md` | page yes, agent no |
| c. Page asks agent | `ui/sheet/chat.ts` and `ui/actions/task-actions.ts` (`sample`, with non-LLM fallback), `ui/shared/task-row.ts` (`claude.ai/new?q=` link, desktop-app UA sniff), Send to Duet via `Claude Code Remote` `fire_trigger` | no |
| d. Skills and rules | Claude tool names inside skill bodies; `lifeboard-setup` (`AskUserQuestion`, `preview_start`); `evals/lib.ts` shells out to `claude -p` | format yes, content no |
| e. Scheduled runs | `.claude/scheduled/weekly-visitor.md` (Claude desktop Scheduled), `lifeboard-setup` registration, `docs/design/cloud-pipeline.md` | no |
| f. Connectors | `ui/shared/calendar-watch.ts` (`Google Calendar` `list_events`, claude.ai refusal codes), reconnect copy in `ui/shared/schedule.ts` | partly: saved-snapshot fallback exists |
| g. Models and subagents | `AGENTS.md` subagent rule, `qa_calibration.json` `judge_model: "sonnet"`, `model-verify` judge panel | no |
| h. Copy only | "Ask Claude", "Waiting on Claude", "Claude will adjust it", `README.md` ("Claude only for now"), `SPEC.md`, `GLOSSARY.md` (Duet) | n/a |
| Break app | `break/` is any-URL, but keeps claude.ai sign-in cookies and re-navigates after login; `break-setup` finds the URL with `Artifact list` and writes rules with `ArtifactData` | app yes, skill no |

## What an adapter has to cover (first view, not a design)

Three seams, matching the findings:

1. **Host runtime (page side).** Widen `artifact-runtime.ts` into a host interface with two backends: the claude.ai runtime and the self-hosted fallback. Route the direct `useDb()` callers in `ui/game/` through it. Capabilities stay optional, as they already are: `mcp`, `sample` and "ask the agent" degrade to the existing copy-prompt and mailbox fallbacks.
2. **Board data access (agent side).** Skills should say what to do in plain words ("read the `checks/game_status` row", "write these lesson rows"). A short per-agent section in `AGENTS.md` maps that to a tool: `ArtifactData` on Claude, an MCP server or CLI over the fallback db elsewhere. This is the "rely on agent rules, be less prescriptive" direction: skills describe the job, rules say how this agent does it.
3. **Scheduling.** Keep the weekly job a thin "run skill X" prompt, and give each provider a one-page setup note (Claude routine, Codex scheduled task, Cursor Automation, Copilot automation, Jules, or GitHub Actions cron).

Also needed in any design: **moving data between hosts.** The claude.ai db is reachable only through `ArtifactData`, so switching hosts needs a backup and restore tool. Paged backups already exist in `game-reset`.

## Self-hosted fallback candidates

| Option | Fit to `collection/doc/onSnapshot` | Agent access | Free tier | Effort |
|---|---|---|---|---|
| **Firebase Firestore + Hosting** | Same shape: `onSnapshot` is what our interface copies | Official Firebase MCP server | Spark plan, far above one owner's writes (secondary) | Low; Google account and lock-in |
| **PocketBase** (one binary, SQLite) | Good: collections, records, realtime subscribe | REST API; no MCP found, we'd write a small one | Free software; needs a tiny VM or a home machine with a tunnel | Low to medium; we run a server |
| InstantDB | Good: live queries; schema model differs | Official MCP | Unverified limits | Low |
| Supabase | Medium: Postgres rows, needs a doc wrapper | Official MCP | Free projects pause after 7 days idle (secondary) | Medium |
| Cloudflare Pages + Durable Objects | Good, but we write the server | Our own MCP | Daily limits on the free plan | Medium to high |

Firestore is the closest drop-in. PocketBase is the own-your-data option. Not chosen yet.

## Open questions for the decision

1. **Which providers first?** The agent side is cheap everywhere. The page side costs one fallback backend, after which every provider uses it the same way.
2. **Firestore or PocketBase** (or both, behind the same host interface)?
3. **Does the owner's own board stay on claude.ai,** with the fallback only for cloners on other agents? That keeps the live board unchanged and makes the fallback a second backend, not a migration.
4. **In-page "Ask" on other providers:** drop to copy-prompt and mailbox (no keys to manage), or proxy an LLM through the fallback backend (needs an API key and cost limits)?
5. **Distribution:** the repo is already the portable unit. Plugins differ per agent, so a plugin is optional packaging on top, not the source. This still needs its own trade-off write-up.

## Not checked

- Grok and Google items marked secondary: x.ai and Google support pages were not read directly.
- Whether any provider's scheduled run can publish to a non-Claude host or write db rows: depends on the fallback, not yet built.
- ChatGPT Canvas, ChatGPT agent and Memory were not researched.
