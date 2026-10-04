@AGENTS.md

# Claude-specific notes

- Talk to the user in Turkish: plain sentences, no jargon or English loanwords
  where a Turkish word exists; name a term once and reuse it. Code, UI text and
  every document in the repository stay in English.
- Decisions are discussed before they are implemented. Give the recommendation,
  the reason, the alternative turned down, and say whether a rule or your own
  judgement drove it.
- After each step, say what was written, where the risky decision lives and
  which test pins it. The user must be able to defend every line.
- Commit only when the user asks. Never push unless the user asks.
- Documents in the repository describe what is built and why. They do not
  record working notes, task lists or who asked for what.
- Skills in `.claude/skills/`: `/scenario <id>` to play one row of the scenario
  table and check the ledger, `/add-block` when the catalog changes,
  `/ship-check` before a hand-over.
