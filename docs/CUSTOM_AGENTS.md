# Custom Sub-Agents

> Project-specific specialists that carry domain knowledge. These run alongside built-in agents, not instead of them.

## How to Add a Custom Agent

1. Pick a base name from the Naming Registry that matches the domain's universe
2. Add a `-Specialty` suffix to avoid collisions (e.g., `Jarvis-Tailwind`, not `Jarvis`)
3. Define the agent below using the template
4. The agent will be loaded during Phase 0 Orient and participate in reviews for their lead's domain

## Template

```markdown
### [BaseName]-[Specialty]
**Universe:** [Universe] | **Reports to:** [Lead Agent]
**Domain:** [What this agent knows about]
**Behavioral directives:** [Specific rules this agent follows]
**Reference docs:** [External docs this agent should consult]
**Trigger:** [When this agent activates — e.g., "when the project uses Tailwind v4"]
```

## When to Create a Custom Agent

- The same lesson appears 3+ times in `docs/LESSONS.md` about the same technology
- A specific framework/library has patterns that the built-in agents miss repeatedly
- The project has a unique architectural pattern that needs dedicated review attention

## Custom Agents for This Project

*None yet. Add your first custom agent using the template above.*
