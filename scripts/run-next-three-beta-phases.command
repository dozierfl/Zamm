#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX="/Applications/ChatGPT.app/Contents/Resources/codex"
START_DOZI="$PROJECT/scripts/start-dozi-studio.command"
NODE_TOOLS="$(dirname "$PROJECT")/.tools/node/bin"

if [[ ! -x "$CODEX" ]]; then
  echo "Codex CLI was not found at: $CODEX"
  echo "Open the ChatGPT desktop app, then try again."
  exit 1
fi

export PATH="$NODE_TOOLS:$PATH"

echo "Dozi — next three beta phases"
echo
echo "This opens an interactive Codex session for:"
echo "  1. Quality benchmark and listening review"
echo "  2. Reliability and playback/UX improvements"
echo "  3. Library, export, and project-delivery readiness"
echo
echo "The agent will pause for your musical and product feedback."
echo "It will not commit or push unless you explicitly ask it to."
echo

if ! curl --fail --silent http://localhost:3000/ >/dev/null 2>&1; then
  echo "Starting Dozi in a separate Terminal window..."
  open "$START_DOZI"
  echo "Wait for the launcher to say Dozi is ready, then return here."
  read -r -p "Press Return when http://localhost:3000 is open: "
fi

read -r -p "Start the guided three-phase session now? [Y/n] " start_now
if [[ "${start_now:-Y}" =~ ^[Nn]$ ]]; then
  echo "No changes made. Run this file again whenever you are ready."
  exit 0
fi

PROMPT=$(cat <<'EOF'
You are continuing Dozi Music Studio in this local repository. Work through the following three beta phases in order. Keep the user involved: pause at meaningful listening, creative, rights, or product decisions and ask one clear question. Do not commit or push unless the user explicitly authorizes it.

Current product context:
- Dozi is a local, private music-generation studio with hosted and local providers, My Voice profiles, full-song import, derived stems, a mixer, vocal phrase repair, playback comparisons, and a growing Library.
- Musical feedback from the user is authoritative. Do not claim separated stems are pristine studio tracks; disclose expected leakage/artifacts.
- Preserve existing user changes. Avoid destructive Git actions.
- Use the local launcher when services are needed: scripts/start-dozi-studio.command.
- Before handing off each phase, run proportionate checks: npm run lint, npm run typecheck, node --import tsx --test tests/architecture.test.ts, and git diff --check. Run AI tests when AI service code changed.

Phase 1 — Quality Benchmark:
Finish and validate the private Library listening scorecard. Ensure its scores, notes, and summaries are intuitive and clearly browser-private. Ask the user to review a few real songs and capture the outcome before proceeding.

Phase 2 — Reliability and transport UX:
Use the current interface and user feedback to remove the most disruptive workflow failures: clear progress states, actionable upload/generation failures, consistent playback, Space play/pause, Return-to-start, and resilient responsive layouts. Test each repaired path and ask the user for a quick confirmation where listening matters.

Phase 3 — Library and export readiness:
Finish the practical delivery workflow around the existing Library and song workspace: understandable master/stem export behavior, appropriate format/metadata information, useful version/source labeling, and safe archive/delete management. Keep each source immutable and private. Do not fabricate multitracks or silently alter audio.

At the end, summarize completed work, remaining product risks, tests run, and await explicit commit/push authorization.
EOF
)

exec "$CODEX" --no-alt-screen -C "$PROJECT" -m gpt-5.6-terra "$PROMPT"
