# Instructions for GitHub Copilot, Codex & Autonomous Coding Agents

Before generating any code, answering architecture questions, or running commands in this repository, you MUST adhere to the following mandatory guidelines:

1. **Read Master Guides First**:
   - Read [`AGENTS.md`](file:///Users/jeshuakoh/Documents/repos/1stPetalingJayaBoys-Brigade-/AGENTS.md) and [`CLAUDE.md`](file:///Users/jeshuakoh/Documents/repos/1stPetalingJayaBoys-Brigade-/CLAUDE.md) for master architecture invariants, commands, and security guidelines.
   - Read [`ARCHITECTURE-essentials.md`](file:///Users/jeshuakoh/Documents/repos/1stPetalingJayaBoys-Brigade-/ARCHITECTURE-essentials.md) for non-negotiable coding rules.

2. **Auto-Load Domain Skills**:
   - This repository contains local, self-contained domain skills under `.claude/skills/`.
   - Consult Section 5 ("Active Skills & Capabilities Registry") in `AGENTS.md`. Whenever a task involves UI design, debugging, refactoring, code review, or TDD, automatically inspect and apply the instructions from the relevant `SKILL.md` file.
