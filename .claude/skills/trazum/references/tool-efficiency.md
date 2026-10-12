# Opt-in tool efficiency

Use only when the user enables tool-log filtering or asks to reduce agent context
consumption. This requires shell access and a Trazum version with `filter`.
Do not call an LLM to compact a log. Do not read a large log into model context
before filtering it locally.

Select non-interactive commands with repetitive display output. Preserve all
existing command permissions and required checks. Never pipe source, structured
output needed by another program, interactive commands or secret-bearing output
into this filter. Ask for an appropriate store if saving raw logs is unsuitable.

Use Bash pipefail and leave stderr alone:

```bash
set -o pipefail
npm test | trazum filter compact --recovery-dir "$HOME/.trazum-tool-logs"
```

Replace the producer with the authorized command. Resolve `trazum` using the
parent skill's invocation table; in a built checkout use its CLI path. Do not
repeat package installation per tool call if an installed version is available.
The pipeline's failure remains a failure. Do not add `2>&1` or `|| true`.

The store explicitly retains original stdout locally. Keep it outside source
control. Use the printed restore command when exact output matters, never infer
omitted content. Reports label estimates; do not promise savings or extra quota.
For optional concise-answer guidance, run `trazum filter instructions` once.
Do not reload that guidance every turn or override the user's requested detail.
This is a selected-command workflow, not automatic host interception.
