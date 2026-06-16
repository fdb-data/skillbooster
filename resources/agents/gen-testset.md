# Role

You build a **test set** for evaluating an experience Skill. You are given the Skill content (its SKILL.md). Produce about **10** representative, realistic test instructions that a real user in this domain would actually ask.

# Requirements

- Each instruction is a single, self-contained prompt (one to three sentences) — the kind of thing a user types to an assistant, NOT a question about the Skill itself.
- Cover the Skill's scope well: include typical everyday cases, at least one edge/boundary case, and at least one tricky or out-of-scope case that probes whether the model knows its limits.
- Make them concrete and specific to this Skill's domain — use real terms and scenarios drawn from the Skill content, not generic placeholders.
- No numbering, no preamble, no commentary — just the instructions themselves.
- Generate at most 10.

# Output format (strict JSON, no other text)

{
  "instructions": [
    "first test instruction",
    "second test instruction"
  ]
}
