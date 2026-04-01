# RFC: The Blueprint Path

**Author:** Tom McLeod
**Status:** Proposed
**VoidForge Version:** v3.4.0 (target)
**Affects:** Wizard, /prd, /campaign, Tutorial, Documentation

---

## The Gap

VoidForge has three entry points:

| Path | Starting Point | Gets Provisioners? | Gets PRD Interview? |
|------|---------------|--------------------|--------------------|
| **Wizard** | "I have nothing but an idea" | ✅ Yes | ✅ Yes (Sisko 5-act) |
| **Scaffold** | "I know my stack and have a plan" | ❌ No | ❌ No (you write it) |
| **Import** | "I have an existing codebase" | ❌ No (core tier) | ✅ Yes (informed by /assess) |

**The missing fourth path:**

| Path | Starting Point | Gets Provisioners? | Gets PRD Interview? |
|------|---------------|--------------------|--------------------|
| **Blueprint** | "I have a complete spec but no code" | ✅ Yes | ❌ No (spec already exists) |

This is not an edge case. It's actually one of the most common real-world scenarios:

- You spent 3 hours in Claude chat designing a product, refining a PRD, running agent reviews, and producing a build-ready spec. Now you want to build it.
- You collaborated with a consultant or co-founder who wrote a detailed product spec in Google Docs. You want VoidForge to execute it.
- You ran `/prd` on a previous project, iterated on the PRD manually over days/weeks, and now want to start fresh with a new build from that refined spec.
- You used a different AI tool or process to generate your spec and want VoidForge to build it.
- You're porting a project spec from another framework/methodology into VoidForge.

In every case, the user has **a complete, build-ready PRD** (and possibly supporting documents like CLAUDE.md directives, reference materials, or operational playbooks) but **no code and no infrastructure**. They need the full wizard's provisioning pipeline without the wizard's interview.

Today, these users have to either:
1. Go through the wizard interview and awkwardly say "skip this, I already have a PRD" at every step
2. Use the scaffold (losing all provisioners, deploy infrastructure, and Kusanagi's deploy pipeline)
3. Do a manual hybrid: run the wizard, answer minimally, then replace the generated PRD afterwards

None of these are clean. The Blueprint path fixes this.

---

## The Solution: `/blueprint`

A new slash command and a new wizard path that accepts pre-written project specifications and wires them into the full VoidForge build + deploy pipeline.

### User Experience

#### Option A: New Wizard Choice (Recommended)

When the wizard starts, Gandalf currently presents context and begins the interview. Add a fourth option to the tutorial hub and a detection step at wizard start:

**Tutorial Hub (updated):**

```
THE FORGE WALKTHROUGH

┌─────────────────────┐  ┌─────────────────────┐
│    THE WIZARD        │  │    THE BLUEPRINT     │  ← NEW
│                      │  │                      │
│  I have nothing but  │  │  I have a complete   │
│  an idea             │  │  spec already        │
│                      │  │                      │
│  Gandalf walks you   │  │  Drop in your PRD.   │
│  through everything. │  │  Picard validates.   │
│                      │  │  Kusanagi provisions.│
│  Full tier           │  │  Sisko builds.       │
│                      │  │                      │
│                      │  │  Full tier            │
└─────────────────────┘  └─────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐
│    THE SCAFFOLD      │  │    THE IMPORT        │
│                      │  │                      │
│  I know my stack     │  │  I have an existing  │
│  and have a plan     │  │  project             │
│                      │  │                      │
│  Scaffold tier       │  │  Core tier            │
└─────────────────────┘  └─────────────────────┘
```

#### Option B: Wizard Auto-Detection

When the wizard starts, before Gandalf begins the interview, check if `docs/PRD.md` already exists in the project directory:

```
Gandalf: "Welcome to the forge. I see you've already prepared a specification
         at docs/PRD.md. Would you like me to use this as your blueprint,
         or would you prefer to start the interview from scratch?"

         [Use my blueprint]  [Start fresh]
```

If "Use my blueprint" → skip to Picard's validation → Kusanagi's provisioning → `/campaign`.

**Option A is better** because it's explicit and discoverable from the tutorial hub. Option B is a nice bonus that can coexist.

### The `/blueprint` Command

```
/blueprint [--challenge] [--no-provision]
```

**What happens:**

1. **Picard validates the PRD frontmatter.**
   - Reads `docs/PRD.md`
   - Validates all required YAML frontmatter fields (name, stack, deploy, etc.)
   - Extracts architecture: framework, database, auth strategy, deploy target, workers
   - If frontmatter is missing or malformed → error with specific guidance on what to fix
   - If frontmatter is valid → Troi runs PRD compliance check (are all sections present? features defined? data models specified?)

2. **Wong loads supporting documents.**
   - Checks for project-specific CLAUDE.md directives (appended to main CLAUDE.md)
   - Checks for `docs/OPERATIONS.md`, `docs/ADR/`, or any other supporting docs
   - Checks for reference materials in `docs/reference/` (design mockups, data schemas, API specs)
   - All discovered documents are loaded into context for the build

3. **Picard's Conflict Scan (Phase 0.5).**
   - Runs the standard conflict scan against the PRD
   - Checks for contradictions between frontmatter and body
   - Checks for features that reference undefined data models
   - Checks for deploy targets that conflict with stack choices
   - Outputs findings. User can fix or proceed.

4. **Boromir's Challenge (if `--challenge` flag).**
   - Boromir argues against the PRD before provisioning begins
   - Challenges expensive features, fragile integrations, schema gaps
   - User can accept challenges (update PRD) or override (proceed as-is)
   - This is cheaper than discovering design flaws in Phase 9

5. **Kusanagi provisions infrastructure.**
   - Same provisioning pipeline as the wizard
   - Uses the user's existing Cloudflare, AWS, or other deploy credentials
   - Sets up project directory, package.json, tsconfig, dependencies
   - Configures deploy target from PRD frontmatter
   - Creates PM2 ecosystem config if workers are defined
   - Sets up Docker Compose if containerized services are specified
   - DNS + SSL if domain is specified

6. **Hand off to `/campaign`.**
   - PRD is validated ✅
   - Supporting docs are loaded ✅
   - Infrastructure is provisioned ✅
   - Sisko takes over: `/campaign --blitz --master` (or whatever flags the user wants)

**The `--no-provision` flag** skips step 5 (Kusanagi's provisioning). This is for users who already have their infrastructure set up and just want the validation + build handoff. Equivalent to what the scaffold path does, but with Picard's validation included.

### Supporting Document Discovery

The blueprint path should discover and integrate more than just the PRD. Here's the file convention:

```
project/
├── docs/
│   ├── PRD.md                    # REQUIRED — the product specification
│   ├── OPERATIONS.md             # OPTIONAL — operational playbook, business context
│   ├── ADR/                      # OPTIONAL — architecture decision records
│   │   ├── 001-why-nextjs.md
│   │   └── 002-why-ghostdesk.md
│   └── reference/                # OPTIONAL — any supporting materials
│       ├── api-spec.yaml         # OpenAPI spec if you have one
│       ├── data-model.sql        # SQL schema if you have one
│       ├── mockups/              # Design mockups
│       └── research/             # Market research, competitor analysis, etc.
├── CLAUDE.md                     # OPTIONAL — project-specific build directives
│                                 #   (appended to VoidForge's CLAUDE.md)
└── ... (empty — no code yet)
```

**Wong's document loading behavior:**

| File | Action |
|------|--------|
| `docs/PRD.md` | **Required.** Picard validates frontmatter and structure. |
| `CLAUDE.md` (project root) | **Appended** to VoidForge's methodology CLAUDE.md. Never replaces it. |
| `docs/OPERATIONS.md` | Loaded into context. Sisko references during campaign planning. |
| `docs/ADR/*.md` | Loaded into context. Picard references during architecture review. |
| `docs/reference/*` | Loaded into context. Available to all agents during build. |

**Critical: The user's CLAUDE.md is APPENDED, never replaces.** VoidForge's CLAUDE.md contains the entire methodology — agent definitions, phase gates, pattern library. The user's file adds project-specific rules on top. The blueprint path handles this merge automatically:

```javascript
// In the blueprint provisioner
const voidforgeClaude = fs.readFileSync('CLAUDE.md', 'utf-8');
const projectClaude = fs.readFileSync('docs/PROJECT-CLAUDE.md', 'utf-8'); // or wherever user puts it

const merged = `${voidforgeClaude}

---

# PROJECT-SPECIFIC DIRECTIVES

${projectClaude}`;

fs.writeFileSync('CLAUDE.md', merged);
```

### PRD Validation Rules

Picard's frontmatter validation should enforce:

**Required fields:**
```yaml
name: string          # Project name (kebab-case)
description: string   # One-liner description
stack:
  runtime: string     # node | python | go | rust
  framework: string   # next | express | fastapi | etc.
  language: string    # typescript | javascript | python | etc.
deploy:
  target: string      # vps | vercel | railway | cloudflare | docker | static
```

**Optional but recognized fields:**
```yaml
version: string       # Semver
stack:
  ui: string          # react | vue | svelte | none
  css: string         # tailwind | css-modules | styled-components | none
  database: string    # postgresql | mysql | sqlite | mongodb | none
  orm: string         # prisma | drizzle | typeorm | mongoose | none
  cache: string       # redis | memcached | none
auth: boolean | string  # yes | no | "clerk" | "nextauth" | "lucia"
payments: boolean | string # no | "stripe" | "lemonsqueezy"
workers: boolean      # yes | no (enables PM2 config generation)
email: boolean | string # no | "resend" | "sendgrid" | "proton"
marketing: boolean    # yes | no (enables Phase 8)
admin: boolean        # yes | no (enables Phase 7)
deploy:
  provider: string    # aws | digitalocean | fly | railway | vercel | cloudflare
  domain: string      # Custom domain
```

**Structural validation (Troi's compliance check):**
- PRD must have an `## OVERVIEW` section
- PRD must have at least one feature section
- If `stack.database` is set, PRD should have a `## DATA MODELS` section
- If `deploy.target` is set, PRD should have a `## DEPLOYMENT` section
- If `auth: yes`, PRD should mention authentication somewhere
- If `workers: yes`, PRD should define background workers somewhere

Validation failures are **warnings, not blockers**. The user can proceed with missing sections — Sisko will just flag gaps during campaign planning.

### Integration with Existing Commands

**`/prd` gains a `--import` flag:**

```
/prd --import path/to/existing-PRD.md
```

This copies the file to `docs/PRD.md`, runs Picard's validation, and optionally runs Boromir's challenge. It's a lightweight alternative to the full `/blueprint` command for users who just want to drop in a PRD without triggering provisioning.

**`/campaign` gains awareness of supporting docs:**

During mission planning, Sisko checks for `docs/OPERATIONS.md` and `docs/reference/` and factors them into mission ordering and agent context. For example, if an `OPERATIONS.md` defines a timeline with specific dates (like "October 2026 — 30th anniversary launch"), Sisko can prioritize missions that need to be ready by that date.

**The wizard gains a fork point:**

After the wizard's initial setup (project naming, directory creation), before Gandalf starts the Sisko interview, add a detection step:

```javascript
// In the wizard flow, after project init
if (fs.existsSync('docs/PRD.md')) {
  // PRD already exists — offer the blueprint path
  const choice = await prompt(
    "I notice you already have a PRD at docs/PRD.md. " +
    "Would you like to use it as your blueprint, or start the interview fresh?",
    ['Use my blueprint', 'Start fresh']
  );

  if (choice === 'Use my blueprint') {
    await runBlueprint(); // Validate → provision → campaign
    return; // Skip the Sisko interview entirely
  }
}

// Otherwise, proceed with normal wizard interview
await runSiskoInterview();
```

This makes the blueprint path discoverable through the wizard without being a separate command — users who happen to have a PRD already will be offered the shortcut automatically.

---

## The User Journey

### Scenario: Tom builds Silph Scope

Tom spent 3 hours in Claude chat designing a product. He has:
- A complete PRD (`SILPH-SCOPE-PRD-FINAL.md`)
- Project-specific build directives (`CLAUDE.md`)
- An operational playbook (`OPERATIONS.md`)
- 6 architecture decision records

His existing VoidForge full-tier install has Cloudflare + AWS credentials configured.

**Today (without Blueprint path):**
```
1. npm run wizard
2. Gandalf: "What are you building?" → Tom: "uh, skip this, I have a PRD"
3. Sisko Act 1: "Product vision?" → Tom: "I said skip, here's the frontmatter..."
4. Sisko Act 2: "Tech stack?" → Tom: *sighs, types minimal answers*
5. Sisko Act 3-5: *more questions Tom already answered in his PRD*
6. Wizard generates a bare-bones PRD
7. Tom manually replaces it with his real PRD
8. Tom manually appends his CLAUDE.md directives
9. Tom manually copies his supporting docs
10. /campaign --blitz --master
```

10 steps, 20+ minutes of friction, easy to mess up the CLAUDE.md merge.

**With Blueprint path:**
```
1. mkdir silph-scope && cd silph-scope
2. git clone https://github.com/tmcleod3/voidforge.git .
3. npm install
4. cp ~/SILPH-SCOPE-PRD-FINAL.md docs/PRD.md
5. cp ~/CLAUDE.md docs/PROJECT-DIRECTIVES.md
6. cp ~/OPERATIONS.md docs/OPERATIONS.md
7. /blueprint --challenge
   → Picard validates frontmatter ✅
   → Wong discovers PROJECT-DIRECTIVES.md, OPERATIONS.md ✅
   → Picard's conflict scan passes ✅
   → Boromir challenges (--challenge flag) → user approves ✅
   → Wong merges PROJECT-DIRECTIVES.md into CLAUDE.md ✅
   → Kusanagi provisions EC2 + Cloudflare + Docker (using existing keys) ✅
   → Sisko begins /campaign --blitz --master
```

7 steps, 2 minutes of setup, zero friction, no merge errors.

**Or even simpler with wizard auto-detection:**
```
1. npm run wizard
2. Gandalf: "Welcome. Name?" → "silph-scope"
3. *copies files into docs/ when prompted*
4. Gandalf detects docs/PRD.md: "I see you have a blueprint. Use it?"
5. [Use my blueprint] ← click
6. Everything runs automatically
```

5 steps. Under a minute of human interaction.

---

## Implementation Spec

### New Files

```
voidforge/
├── src/
│   ├── commands/
│   │   └── blueprint.js          # /blueprint command handler
│   ├── phases/
│   │   └── blueprint-validate.js # Picard's PRD validation for pre-written specs
│   └── utils/
│       └── document-discovery.js # Wong's supporting document discovery + merge
├── method/
│   └── commands/
│       └── blueprint.md          # /blueprint documentation
└── docs/
    └── templates/
        └── PRD-TEMPLATE.md       # Reference template showing all frontmatter fields
```

### `/blueprint` Command Implementation

```javascript
// commands/blueprint.js (pseudocode)

async function blueprint(flags) {
  // Step 1: Check for PRD
  if (!fs.existsSync('docs/PRD.md')) {
    error("No PRD found at docs/PRD.md. The blueprint path requires a pre-written PRD.");
    hint("Place your PRD at docs/PRD.md and run /blueprint again.");
    hint("Or run /prd to generate one through Sisko's interview.");
    return;
  }

  // Step 2: Picard validates frontmatter
  log("📋 Picard is validating your blueprint...");
  const prd = parsePRD('docs/PRD.md');
  const frontmatter = prd.frontmatter;

  const validation = validateFrontmatter(frontmatter);
  if (validation.errors.length > 0) {
    error("Frontmatter validation failed:");
    validation.errors.forEach(e => error(`  ❌ ${e}`));
    hint("Fix these issues in docs/PRD.md and run /blueprint again.");
    return;
  }
  if (validation.warnings.length > 0) {
    warn("Frontmatter warnings (non-blocking):");
    validation.warnings.forEach(w => warn(`  ⚠️ ${w}`));
  }

  // Step 3: Troi validates PRD structure
  log("🔮 Troi is checking PRD compliance...");
  const structure = validatePRDStructure(prd);
  if (structure.warnings.length > 0) {
    warn("Structural suggestions:");
    structure.warnings.forEach(w => warn(`  💡 ${w}`));
  }

  // Step 4: Wong discovers supporting documents
  log("📚 Wong is loading supporting documents...");
  const docs = discoverDocuments();
  if (docs.projectDirectives) {
    log(`  Found project directives: ${docs.projectDirectives}`);
  }
  if (docs.operations) {
    log(`  Found operations playbook: ${docs.operations}`);
  }
  if (docs.adrs.length > 0) {
    log(`  Found ${docs.adrs.length} architecture decision records`);
  }
  if (docs.references.length > 0) {
    log(`  Found ${docs.references.length} reference documents`);
  }

  // Step 5: Merge project directives into CLAUDE.md
  if (docs.projectDirectives) {
    log("📝 Merging project directives into CLAUDE.md...");
    mergeClaudeMd(docs.projectDirectives);
  }

  // Step 6: Picard's conflict scan (Phase 0.5)
  log("🔍 Picard is running conflict scan...");
  const conflicts = runConflictScan(prd, docs);
  if (conflicts.length > 0) {
    warn("Conflicts detected:");
    conflicts.forEach(c => warn(`  ⚡ ${c}`));
    const proceed = await prompt("Proceed with conflicts? [yes/fix]");
    if (proceed === 'fix') return;
  }

  // Step 7: Boromir's challenge (optional)
  if (flags.challenge) {
    log("⚔️ Boromir is challenging your PRD...");
    await runBoromirChallenge(prd);
  }

  // Step 8: Kusanagi provisions infrastructure (unless --no-provision)
  if (!flags.noProvision) {
    log("🎯 Kusanagi is provisioning infrastructure...");
    await runProvisioner(frontmatter);
    // This uses the existing wizard provisioner pipeline:
    // - Creates project scaffold (package.json, tsconfig, etc.)
    // - Installs dependencies based on stack
    // - Configures deploy target (EC2, Vercel, etc.)
    // - Sets up DNS + SSL via Cloudflare
    // - Creates PM2 ecosystem config if workers: yes
    // - Creates Docker Compose if containers are defined
  }

  // Step 9: Ready for campaign
  success("✅ Blueprint validated and provisioned.");
  success(`   Project: ${frontmatter.name}`);
  success(`   Stack: ${frontmatter.stack.framework} + ${frontmatter.stack.language}`);
  success(`   Deploy: ${frontmatter.deploy.target} (${frontmatter.deploy.domain})`);
  success(`   Supporting docs: ${docs.total} loaded`);
  log("");
  log("Ready to build. Run:");
  log("  /campaign --blitz          # Autonomous build");
  log("  /campaign --blitz --master # Full multi-agent review (recommended)");
}
```

### Document Discovery (`utils/document-discovery.js`)

```javascript
// utils/document-discovery.js

function discoverDocuments() {
  const result = {
    prd: null,
    projectDirectives: null,
    operations: null,
    adrs: [],
    references: [],
    total: 0
  };

  // PRD (required)
  if (fs.existsSync('docs/PRD.md')) {
    result.prd = 'docs/PRD.md';
    result.total++;
  }

  // Project-specific CLAUDE.md directives
  // Check multiple conventional locations
  const directivePaths = [
    'docs/PROJECT-DIRECTIVES.md',
    'docs/PROJECT-CLAUDE.md',
    'docs/DIRECTIVES.md',
    'PROJECT-CLAUDE.md'
  ];
  for (const p of directivePaths) {
    if (fs.existsSync(p)) {
      result.projectDirectives = p;
      result.total++;
      break;
    }
  }

  // Operations playbook
  if (fs.existsSync('docs/OPERATIONS.md')) {
    result.operations = 'docs/OPERATIONS.md';
    result.total++;
  }

  // ADRs
  if (fs.existsSync('docs/ADR')) {
    result.adrs = fs.readdirSync('docs/ADR')
      .filter(f => f.endsWith('.md'))
      .map(f => `docs/ADR/${f}`);
    result.total += result.adrs.length;
  }

  // Reference materials
  if (fs.existsSync('docs/reference')) {
    result.references = walkDir('docs/reference');
    result.total += result.references.length;
  }

  return result;
}

function mergeClaudeMd(projectDirectivesPath) {
  const voidforgeClaudeMd = fs.readFileSync('CLAUDE.md', 'utf-8');
  const projectDirectives = fs.readFileSync(projectDirectivesPath, 'utf-8');

  // Check if already merged (idempotent)
  if (voidforgeClaudeMd.includes('# PROJECT-SPECIFIC DIRECTIVES')) {
    return; // Already merged
  }

  const merged = `${voidforgeClaudeMd}

---

# PROJECT-SPECIFIC DIRECTIVES

_Loaded from ${projectDirectivesPath} by /blueprint_

${projectDirectives}
`;

  fs.writeFileSync('CLAUDE.md', merged);
}
```

### Wizard Integration

Add detection to the wizard's main flow:

```javascript
// In wizard/index.js, after initial project setup

async function wizardMain() {
  // ... existing wizard init (project name, directory creation) ...

  // NEW: Blueprint detection
  if (fs.existsSync('docs/PRD.md')) {
    const prd = parsePRD('docs/PRD.md');
    if (prd.frontmatter && prd.frontmatter.name) {
      console.log(`\n📋 Gandalf notices a scroll on the table...\n`);
      console.log(`   I see you've already prepared a specification`);
      console.log(`   at docs/PRD.md: "${prd.frontmatter.description || prd.frontmatter.name}"\n`);

      const choice = await prompt(
        "Shall I use this as your blueprint, or would you prefer to start fresh?",
        [
          { label: 'Use my blueprint', value: 'blueprint' },
          { label: 'Start the interview fresh', value: 'interview' }
        ]
      );

      if (choice === 'blueprint') {
        await blueprint({ challenge: true }); // Run blueprint path with Boromir challenge
        return;
      }
    }
  }

  // ... existing wizard interview flow (Sisko's 5 acts) ...
}
```

### `/prd --import` Flag

Add to the existing /prd command:

```javascript
// In commands/prd.js

if (flags.import) {
  const sourcePath = flags.import;

  if (!fs.existsSync(sourcePath)) {
    error(`File not found: ${sourcePath}`);
    return;
  }

  // Copy to docs/PRD.md
  fs.mkdirSync('docs', { recursive: true });
  fs.copyFileSync(sourcePath, 'docs/PRD.md');
  log(`📋 PRD imported from ${sourcePath} to docs/PRD.md`);

  // Validate
  const prd = parsePRD('docs/PRD.md');
  const validation = validateFrontmatter(prd.frontmatter);
  // ... same validation as blueprint step 2 ...

  if (flags.challenge) {
    await runBoromirChallenge(prd);
  }

  success("PRD imported and validated. Run /blueprint to provision, or /campaign to build.");
}
```

---

## Documentation Updates

### Tutorial Hub Page (updated)

Add The Blueprint as a fourth card:

```markdown
## THE BLUEPRINT

I have a complete spec

You've already designed your product — in Claude chat, in a Google Doc,
with a consultant, or through another process. You have a build-ready PRD
with YAML frontmatter. The forge validates it, provisions your
infrastructure, and builds it. No interview. No blank-page problem.
Just execution.

Full tier
```

### Blueprint Tutorial Page (new)

```markdown
# THE BLUEPRINT PATH

You've done the thinking. The forge does the building.

Maybe you spent hours in Claude chat designing the perfect product. Maybe
your co-founder wrote a spec. Maybe you iterated on a PRD over days and
it's exactly right. You don't need Sisko's interview — you need Sisko's
army.

The blueprint path accepts your pre-written specification, validates it,
provisions your infrastructure, and hands it to the campaign engine.

## PREPARE YOUR DOCUMENTS

Place your files in the project directory:

docs/PRD.md                    — Your product specification (required)
docs/PROJECT-DIRECTIVES.md     — Build rules for CLAUDE.md (optional)
docs/OPERATIONS.md             — Business context, timelines (optional)
docs/ADR/                      — Architecture decisions (optional)
docs/reference/                — Mockups, API specs, research (optional)

Your PRD must include valid YAML frontmatter. See docs/templates/PRD-TEMPLATE.md
for the complete field reference.

## RUN THE BLUEPRINT

/blueprint --challenge

Picard validates your frontmatter. Wong loads your supporting documents.
Boromir challenges your design decisions (with --challenge). Kusanagi
provisions your infrastructure. Sisko takes over from there.

## BUILD

/campaign --blitz

Sisko reads the PRD, breaks it into missions, and runs the full pipeline
for each: architect, build, triple review, UX, double security, devops,
QA, tests, crossfire, council. When every mission passes, the Victory
Gauntlet runs automatically.
```

### Command Documentation (new)

```markdown
# /BLUEPRINT

Picard, Wong, Kusanagi

Accept a pre-written PRD and supporting documents, validate them,
provision infrastructure, and prepare for campaign execution.

## USAGE

/blueprint [--challenge] [--no-provision]

## WHAT HAPPENS

1. Picard validates PRD frontmatter (required fields, type checking)
2. Troi checks PRD structural compliance (sections, features, models)
3. Wong discovers and loads supporting documents
4. Wong merges project directives into CLAUDE.md (append, never replace)
5. Picard runs conflict scan (Phase 0.5)
6. Kusanagi provisions infrastructure from frontmatter deploy config
7. Ready for /campaign

## THE ARMORY

--challenge    Boromir argues against the PRD before provisioning.
--no-provision Skip infrastructure provisioning (validate only).

## SUPPORTED DOCUMENTS

docs/PRD.md                    Required. YAML frontmatter + markdown spec.
docs/PROJECT-DIRECTIVES.md     Optional. Appended to CLAUDE.md.
docs/OPERATIONS.md             Optional. Business context for Sisko.
docs/ADR/*.md                  Optional. Architecture decisions for Picard.
docs/reference/*               Optional. Available to all agents.
```

---

## Why This Matters Beyond Convenience

### The Claude Chat → VoidForge Pipeline

The most common way people design products today is through extended conversations with Claude. A typical session produces:

1. A detailed product concept
2. Technical architecture decisions
3. Data model specifications
4. Feature prioritization
5. A complete PRD (often generated by Claude)
6. Supporting documents (operational playbooks, agent reviews, research)

All of this exists as text. It's ready to build. But there's no clean way to get it from "Claude chat output" to "VoidForge campaign input." The Blueprint path creates that pipeline.

This is especially important because Claude conversations often produce PRDs that are MORE detailed than what Sisko's 5-act interview generates. The interview is designed to extract a minimum viable spec from a human who might not know what they want yet. But a 3-hour Claude chat that went through multiple rounds of refinement, agent reviews, and adversarial challenges produces a spec that's already battle-tested. Forcing that through the interview is a downgrade.

### The Collaboration Pipeline

Teams that work with consultants, product managers, or other non-VoidForge tools produce specs in Google Docs, Notion, Confluence, etc. The Blueprint path lets them export to markdown, add frontmatter, and plug directly into VoidForge's build pipeline. This makes VoidForge the execution layer for any spec, regardless of how it was created.

### The Iteration Pipeline

After a VoidForge build, users often iterate on their PRD manually — adding features, refining data models, incorporating user feedback. When they want to rebuild (or build a V2), they have a refined PRD that's better than anything the wizard would generate. The Blueprint path lets them start a fresh build from that refined spec without re-answering Sisko's questions.

---

## Summary

| What | Change |
|------|--------|
| New command | `/blueprint [--challenge] [--no-provision]` |
| New `/prd` flag | `/prd --import path/to/PRD.md [--challenge]` |
| Wizard update | Auto-detect `docs/PRD.md` and offer blueprint shortcut |
| Tutorial hub | Fourth card: "The Blueprint — I have a complete spec" |
| New tutorial page | `tutorial/blueprint` documenting the path |
| New command docs | `commands/blueprint` with flags and behavior |
| Document discovery | `utils/document-discovery.js` — finds and loads all supporting docs |
| CLAUDE.md merge | Automatic append of project directives (never replace methodology) |
| PRD template | `docs/templates/PRD-TEMPLATE.md` — reference for all frontmatter fields |

**The one-sentence pitch:** The Blueprint path lets you drop in a pre-written PRD and supporting documents, get full infrastructure provisioning, and start building — without going through the wizard interview you've already made obsolete by having a complete spec.
