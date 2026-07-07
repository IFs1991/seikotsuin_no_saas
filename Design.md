---
title: "Design.md — Behavioral UX + Visual Design System for LLM Agents"
version: "2.0.0"
created: "2026-07-07"
source_report: "UI/UX設計に効く行動心理学と行動経済学の実務レポート"
audience:
  - LLM coding agents
  - UI/UX designers
  - product managers
  - frontend engineers
scope:
  - Web application
  - Mobile web
  - SaaS onboarding
  - Pricing and checkout
  - Forms and settings
  - Notification and retention flows
  - Visual design and styling of new and existing UI
non_goals:
  - Dark pattern optimization
  - Short-term CVR maximization at the expense of trust
  - Psychological manipulation without user benefit
  - Unrequested visual redesign of existing screens
layers:
  - "Layer B (Behavioral): Sections 0–17. When and why to change UI."
  - "Layer V (Visual): Section V. How new UI should look — modern, intentional, non-generic."
  - "Layer C (Containment): Section C. How to change UI without destroying the existing design. Layer C overrides Layer V on existing code."
---

# Design.md — Behavioral UX Design System for LLM Agents

## 0. Purpose

This document converts behavioral psychology and behavioral economics findings into an implementation-ready design specification.

LLM agents MUST use this document when proposing, reviewing, or implementing UI/UX changes that affect:

- user choice
- conversion
- onboarding
- forms
- pricing
- checkout
- retention
- notifications
- reviews / social proof
- cancellation / downgrade / opt-out flows
- completion screens

The goal is **not** to manipulate users.  
The goal is to reduce unnecessary friction, improve decision quality, and protect long-term trust.

---

## 1. Agent Contract

### 1.0 Mode selection (read this first)

Before touching any UI, the agent MUST classify the task into exactly one mode:

| Mode | Trigger | Governing sections |
|---|---|---|
| `EXTEND` | Add / modify UI inside an existing product or codebase | Section C (mandatory) + Sections 0–17. Section V applies only through existing tokens. |
| `CREATE` | Build new UI where no established design exists (new app, new page family, greenfield prototype) | Section V (mandatory) + Sections 0–17 |
| `REDESIGN` | User explicitly asks to redesign, restyle, or modernize existing UI | Section V + Section C rollback rules. Requires explicit user instruction — never self-initiated. |

Default mode is `EXTEND`. If any existing UI code, stylesheet, theme, or design token file is present in the repository, the agent MUST assume `EXTEND` unless the user explicitly requests otherwise.

`REDESIGN` MUST NOT be inferred from vague requests like "improve this page" or "make it better". Those are `EXTEND`.

### 1.1 How an LLM agent must use this file

When implementing or reviewing a UI/UX change, the agent MUST:

1. Identify the user problem.
2. Diagnose the bottleneck.
3. Select the smallest applicable UX pattern from this document.
4. Run the Ethics Gate before implementation.
5. Define success metrics and harm metrics.
6. Implement the UI change.
7. Add or verify telemetry where applicable.
8. Document the design rationale in the PR or implementation note.

### 1.2 Required PR / implementation note format

Use this template in every design-related PR:

```md
## Design Rationale

### Mode
- [ ] EXTEND  [ ] CREATE  [ ] REDESIGN (explicit user request quoted below)
- If REDESIGN, user instruction quote:

### User problem
-

### Bottleneck diagnosis
- [ ] Choice overload
- [ ] Tap / click difficulty
- [ ] Unclear default
- [ ] Purchase / adoption anxiety
- [ ] Low completion momentum
- [ ] Present bias / procrastination
- [ ] Pricing uncertainty
- [ ] Weak ending / poor memory of flow
- [ ] Other:

### Selected pattern
- Pattern ID:
- Why this pattern fits:

### UI change
-

### Copy change
-

### Ethics Gate
- User benefit:
- Reversible / easy to undo:
- Factually accurate:
- Reject / cancel path remains clear:
- No hidden cost:
- No artificial urgency / scarcity:
- Long-term trust risk:

### Visual conformance (Section V / C)
- Tokens reused (colors, spacing, type, radius):
- New tokens introduced (and why existing ones were insufficient):
- Global styles touched: [ ] none  [ ] listed below with justification
- Screens outside the task scope visually affected: [ ] none  [ ] listed below

### Metrics
- Primary metric:
- Guardrail metrics:
- Events added / reused:

### Rollback plan
-
```

### 1.3 Modal verbs

- **MUST**: mandatory. Blocking requirement.
- **SHOULD**: recommended default. Deviation requires rationale.
- **MAY**: optional.
- **MUST NOT**: prohibited. Reject implementation if violated.

---

## 2. Core Principle

Behavioral design is acceptable only when it helps the user make a better decision or complete an intended task with less unnecessary friction.

The final test:

> Does this intervention support user autonomy, or does it take autonomy away?

If the intervention takes autonomy away, it is not UX. It is exploitation.

---

## 3. Design Priority Order

LLM agents SHOULD apply patterns in this order.

| Priority | Area | Use first because | Pattern IDs |
|---:|---|---|---|
| 1 | Reduce friction | High benefit, low ethical risk | `P01`, `P02`, `P03` |
| 2 | Build confidence | Helps users decide without pressure | `P04` |
| 3 | Create completion momentum | Useful for onboarding and retention | `P05`, `P06` |
| 4 | Clarify value / price | Useful but can become manipulative | `P07`, `P08` |
| 5 | Use with restriction | High abuse risk / dark-pattern risk | `P09`, `P10` |
| 6 | Improve memory of experience | Good for completion, support, cancellation | `P11` |

Default implementation sequence:

```text
Choice reduction
→ target size / proximity
→ transparent defaults
→ authentic social proof
→ progress visibility
→ completion / ending quality
→ only then consider framing, anchoring, loss aversion, or scarcity
```

MUST NOT start with scarcity, loss aversion, or aggressive pricing psychology if the base UX is still confusing, slow, or error-prone.

---

## 4. Bottleneck-to-Pattern Decision Table

| User / business symptom | Likely bottleneck | Use pattern | Avoid |
|---|---|---|---|
| Users hesitate on a screen with many choices | Choice overload | `P01 Choice Reduction` | Hiding critical pricing or contract details |
| Users mis-tap, abandon forms, or miss CTA | Poor target size / distance | `P02 Target Size and Proximity` | Making only the business-preferred action easy |
| Users do not complete setup | Unclear or excessive setup burden | `P03 Transparent Defaults`, `P05 Progress Visibility` | Preselecting marketing, paid add-ons, or privacy-invasive settings |
| Users distrust product quality | Evaluation anxiety | `P04 Authentic Social Proof` | Fake reviews, cherry-picked ratings, hidden negative reviews |
| Users abandon onboarding halfway | Weak goal momentum | `P05 Progress Visibility` | Meaningless progress bars |
| Users postpone valuable actions | Present bias | `P06 Present Bias Reduction` | Notification spam or guilt copy |
| Users compare pricing but do not understand value | Poor value framing | `P07 Framing`, `P08 Anchoring` | Fake discounts or artificial high-price anchors |
| Users churn before seeing value | Value not experienced soon enough | `P05`, `P06`, `P11` | Trapping users in the product |
| Users abandon checkout / booking | Anxiety, complexity, or uncertainty | `P01`, `P03`, `P04`, `P11` | Fake urgency, hidden fees |
| Users leave angry after cancellation or support | Bad ending | `P11 Peak-End Completion` | Obstruction, shame copy, forced retention loop |

---

## 5. Pattern Library

## P01 — Choice Reduction

### Behavioral basis

Hick-Hyman law and choice overload.

More options can increase interest but reduce completion. Users often need fewer visible choices, not more information dumped at once.

### Use when

- A screen has too many CTAs.
- A pricing table is hard to compare.
- A form branches too early.
- A menu is bloated.
- Users abandon before making a selection.
- Search filters overwhelm first-time users.

### Requirements

The UI MUST:

- Limit primary visible choices to the smallest useful set.
- Prefer 2–3 primary actions on a screen.
- Use progressive disclosure for advanced choices.
- Group related options.
- Make the recommended next action clear.
- Preserve access to critical information.

The UI MUST NOT:

- Hide pricing.
- Hide cancellation terms.
- Hide contract restrictions.
- Hide material comparison criteria.
- Remove choices only because they are bad for the business.

### Implementation examples

Good:

```text
Primary CTA: "Start recommended setup"
Secondary CTA: "Compare all options"
Tertiary link: "Advanced settings"
```

Bad:

```text
Only showing the most profitable plan while burying cheaper plans behind ambiguous links.
```

### Acceptance criteria

- User can identify the primary next action within 3 seconds.
- Critical options are accessible within 1 additional interaction.
- No legally or financially material information is hidden.
- First-time user path is shorter than expert path.

### Metrics

Primary:

- completion rate
- time to first meaningful action
- decision screen exit rate

Guardrails:

- support inquiries about missing options
- refund / cancellation rate
- complaint rate

---

## P02 — Target Size and Proximity

### Behavioral basis

Fitts's law.

Large and nearby targets are easier to hit. In mobile UX, target size, spacing, thumb reach, and error prevention matter.

### Use when

- Users mis-tap.
- Mobile completion is weak.
- Primary actions are hard to reach.
- Checkboxes / radio buttons are visually small.
- Destructive actions are too close to primary actions.

### Requirements

The UI MUST:

- Use sufficiently large touch targets.
- Keep primary CTAs reachable, especially on mobile.
- Separate destructive actions from common actions.
- Expand tap areas beyond tiny icons where possible.
- Keep main and secondary actions visually distinct but not deceptive.

Recommended minimums:

| Platform guideline | Minimum target |
|---|---:|
| Apple HIG | 44 × 44 pt |
| Material Design | 48 × 48 dp |

The UI MUST NOT:

- Make “Accept”, “Buy”, or “Subscribe” large while making “Decline”, “Cancel”, or “Manage settings” tiny.
- Place destructive actions where accidental taps are likely.
- Use small tap targets for consent, payment, cancellation, or privacy settings.

### Acceptance criteria

- Primary interactive elements meet platform touch target guidance.
- Destructive action requires deliberate intent.
- Consent and refusal paths have comparable discoverability.
- Keyboard and screen-reader operation are preserved.

### Metrics

Primary:

- tap error rate
- form completion rate
- mobile conversion / activation rate

Guardrails:

- accidental action reports
- undo events
- support tickets about mistakes

---

## P03 — Transparent Defaults

### Behavioral basis

Default effect and status quo bias.

Users often keep default settings. Defaults are powerful, so they must be used only when user benefit is clear.

### Use when

- A setup flow has too many decisions.
- The system can infer a safe starting configuration.
- Previous user state can be restored.
- A default file format, view, or workflow can reduce friction.
- Users repeatedly choose the same option.

### Requirements

Defaults MUST be:

1. beneficial to the user,
2. easy to understand,
3. easy to change,
4. reversible,
5. clearly labeled.

The UI SHOULD explain:

```text
Current setting: Weekly summary emails
Why: Helps you review activity without daily notifications
Change: You can change this anytime in Notification Settings
```

The UI MUST NOT preselect:

- paid add-ons,
- marketing consent,
- privacy-invasive tracking,
- newsletter subscription,
- data sharing beyond service necessity,
- trial-to-paid conversion without clear consent,
- unnecessary notifications.

### Acceptance criteria

- User can see the current default.
- User can change it without support.
- Default benefit is clear in plain language.
- No paid or privacy-sensitive option is silently preselected.

### Metrics

Primary:

- setup completion rate
- settings change rate
- time to activation

Guardrails:

- opt-out rate
- privacy complaints
- unsubscribe rate
- support tickets about unwanted settings

---

## P04 — Authentic Social Proof

### Behavioral basis

Social proof.

When users cannot fully judge quality themselves, they use other people's evaluations as evidence.

### Use when

- Product quality is hard to evaluate upfront.
- Users need trust before buying, booking, or adopting.
- B2B buyers need evidence from comparable users.
- Marketplace / review / service pages need confidence.

### Requirements

The UI SHOULD show:

- average rating,
- number of reviews,
- review distribution,
- recent review date,
- verified purchaser / verified user marker,
- negative review themes,
- Q&A for pre-purchase anxiety,
- relevant case studies.

For B2B, prefer:

```text
"Used by clinics with 10–50 staff"
```

over generic logo walls when the user's context matters.

The UI MUST NOT:

- fabricate reviews,
- hide negative reviews,
- selectively summarize only positive reviews,
- use fake “currently viewing” counters,
- use customer logos without permission,
- present testimonials without context.

If AI summarizes reviews, the UI MUST:

- link to source reviews,
- include negative and mixed themes,
- avoid unsupported claims,
- disclose AI summarization where appropriate.

### Acceptance criteria

- Review count and rating are visible near the decision point.
- Users can inspect the underlying evidence.
- Negative evidence is not suppressed.
- Claims are verifiable.

### Metrics

Primary:

- conversion rate after review interaction
- review engagement rate
- case study engagement rate

Guardrails:

- trust complaints
- review abuse reports
- discrepancy reports
- refund / churn caused by unmet expectations

---

## P05 — Progress Visibility

### Behavioral basis

Goal-gradient hypothesis and endowed progress effect.

Users are more likely to finish when they see progress and the next action is concrete.

### Use when

- Onboarding has multiple steps.
- Profile completion is important.
- A task requires repeated input.
- Users abandon long forms.
- A habit loop is part of product value.

### Requirements

The UI SHOULD:

- show progress as completed steps and remaining steps,
- give users an immediate first win,
- show the next smallest action,
- use meaningful milestones,
- persist progress across sessions.

Preferred copy:

```text
2 of 5 setup steps complete
Next: Connect your calendar
Estimated time: 1 minute
```

The UI MUST NOT:

- show fake progress,
- use endless progress bars,
- inflate completion percentage,
- add meaningless steps just to create momentum,
- guilt users for stopping.

### Acceptance criteria

- Progress reflects actual task completion.
- Next action is visible.
- User can resume later without losing work.
- Progress is not used to obscure required effort.

### Metrics

Primary:

- onboarding completion rate
- step-to-step conversion
- time to activation
- return-to-complete rate

Guardrails:

- step fatigue
- skipped required setup
- support tickets about confusing progress

---

## P06 — Present Bias Reduction

### Behavioral basis

Present bias and hyperbolic discounting.

Users overweight immediate effort and underweight future benefit. Design should reduce immediate cost, not pressure users.

### Use when

- Users postpone verification, setup, logging, or profile completion.
- Users intend to return but do not.
- Long-term benefit is clear but action feels costly.
- A valuable task can be split into smaller steps.

### Requirements

The UI SHOULD:

- break tasks into 30–90 second actions,
- show effort estimate,
- allow save-and-resume,
- resume from the previous point,
- use reminders sparingly and with user control,
- make the first action extremely easy.

Good copy:

```text
Finish this in about 1 minute.
Only 2 fields left.
```

The UI MUST NOT:

- spam notifications,
- use shame or guilt,
- make opting out difficult,
- treat silence as consent,
- create anxiety using exaggerated losses.

### Acceptance criteria

- User can complete the smallest next action quickly.
- Reminder frequency is controllable.
- Notification value is clear.
- Users can pause, mute, or opt out.

### Metrics

Primary:

- task completion after reminder
- return rate
- time to complete deferred task

Guardrails:

- notification opt-out rate
- unsubscribe rate
- app uninstall rate
- complaint rate

---

## P07 — Framing

### Behavioral basis

Framing effect.

The same information can be interpreted differently depending on how it is presented.

### Use when

- Users misunderstand price, value, risk, or effort.
- Error messages feel discouraging.
- Pricing needs fair comparison.
- Users need clarity about tradeoffs.

### Requirements

The UI SHOULD:

- present value in user-relevant units,
- frame cost against concrete benefit,
- use gain framing for normal benefits,
- use loss framing only for real and material consequences,
- keep contract and price information symmetrical.

Good:

```text
Annual plan: ¥5,000/year, equivalent to about ¥417/month.
```

Bad:

```text
"Don't lose your chance forever" when the offer is not actually ending.
```

The UI MUST NOT:

- omit material facts,
- hide total price,
- exaggerate risk,
- use fear to force action,
- make cancellation consequences sound worse than they are.

### Acceptance criteria

- The same core facts are available without distortion.
- Price, renewal, cancellation, and limits are visible.
- Copy clarifies rather than pressures.

### Metrics

Primary:

- pricing comprehension
- pricing page conversion
- error recovery rate

Guardrails:

- billing complaints
- refund requests
- cancellation due to misunderstanding

---

## P08 — Anchoring

### Behavioral basis

Anchoring.

Initial numbers or comparison points shape later judgment.

### Use when

- Users need to compare plans.
- A quote or estimate has multiple components.
- Annual and monthly pricing need clear comparison.
- B2B buyers need to understand value tiers.

### Requirements

The UI SHOULD:

- make plan differences easy to compare,
- order plans intentionally,
- explain what each tier is for,
- use real reference prices only,
- show total cost and billing interval clearly.

Good:

```text
Starter — for solo use
Team — for clinics with multiple staff
Business — for multi-location operations
```

The UI MUST NOT:

- create fake high-price anchors,
- show fake “regular prices,”
- use permanent limited-time discounts,
- hide cheaper plans,
- obscure required add-ons,
- make the middle plan look “recommended” without reason.

### Acceptance criteria

- Reference prices are real.
- Plan comparison is transparent.
- Recommended plan has an explicit rationale.
- Total cost is visible before payment.

### Metrics

Primary:

- plan selection rate
- quote acceptance rate
- pricing page completion

Guardrails:

- downgrade rate after purchase
- billing support tickets
- complaints about misleading pricing

---

## P09 — Loss Aversion

### Behavioral basis

Prospect theory and loss aversion.

Users often feel losses more strongly than equivalent gains. This can help with commitment but easily becomes coercive.

### Use only when

- The loss is real.
- The user has already expressed an intention.
- The intervention protects user benefit.
- The user can opt out or stop.

Acceptable examples:

- real point expiration,
- real saved draft deletion,
- real streak ending,
- real plan feature loss after downgrade,
- real deadline for an event or booking.

### Requirements

The UI MUST:

- state the real consequence plainly,
- avoid exaggeration,
- give recovery options where possible,
- allow the user to continue without shame,
- keep cancellation / downgrade available.

Good:

```text
If you downgrade now, team analytics will be disabled at the end of this billing period.
You can export reports before downgrading.
```

Bad:

```text
"Are you sure you want to destroy your team's growth?"
```

The UI MUST NOT:

- invent losses,
- use guilt,
- use fear-based copy,
- punish users for leaving,
- hide the continue / cancel path,
- make cancellation harder after showing the loss.

### Acceptance criteria

- Loss statement is factually true.
- User can still proceed.
- Recovery or export path is shown when relevant.
- No shame, fear, or deception.

### Metrics

Primary:

- completion of intended commitment action
- save / export before downgrade
- reactivation after cancellation

Guardrails:

- cancellation complaints
- negative feedback on copy
- support escalation
- churn after feeling trapped

---

## P10 — Scarcity and Urgency

### Behavioral basis

Scarcity effect.

Scarce resources can become more valuable in perception. This is high-risk because fake scarcity is a classic dark pattern.

### Use only when

- inventory is real,
- seats are real,
- booking slots are real,
- deadline is real,
- capacity is objectively constrained.

### Requirements

The UI MUST:

- use real data,
- update scarcity information accurately,
- show exact deadline or capacity basis,
- avoid panic copy,
- remove scarcity messages when no longer true.

Good:

```text
Next available appointment: Thu 14:00
2 slots left for this time
```

Bad:

```text
"Only 2 left" when inventory is not actually limited.
```

The UI MUST NOT:

- use fake low-stock messages,
- use endless countdown timers,
- show fake viewer counts,
- use arbitrary “limited time” labels,
- reset timers after refresh,
- manufacture urgency where none exists.

### Acceptance criteria

- Scarcity claim is backed by real data.
- Deadline does not reset deceptively.
- User can verify alternatives.
- UI remains calm and informational.

### Metrics

Primary:

- booking / purchase completion
- reduced indecision time

Guardrails:

- complaints about pressure
- refund / cancellation after rushed choice
- trust score decline
- regulatory / legal review flags

---

## P11 — Peak-End Completion

### Behavioral basis

Peak-end rule.

Users remember intense moments and endings more than the average of the entire experience.

### Use when

- Checkout, booking, setup, support, or cancellation completes.
- A stressful flow needs a clean ending.
- The product needs better perceived reliability.
- Users need next-step clarity after completion.

### Requirements

Completion screens SHOULD include:

- confirmation of what happened,
- reference number if applicable,
- next expected event,
- user-controlled next action,
- save / share / export option where relevant,
- support path,
- reassurance without exaggeration.

Good:

```text
Booking confirmed
Date: Tue, July 7, 14:00
Next: You will receive a reminder 24 hours before your appointment.
Change or cancel: Manage booking
```

Cancellation / downgrade completion MUST be respectful.

Good:

```text
Your subscription is canceled.
Access remains available until July 31.
You can export your data here.
You can restart from Settings anytime.
```

Bad:

```text
Multiple retention modals after the user already confirmed cancellation.
```

### Acceptance criteria

- User knows what happened.
- User knows what happens next.
- User can save or recover important information.
- Cancellation / downgrade ends cleanly.
- No obstruction after final confirmation.

### Metrics

Primary:

- CSAT after completion
- support ticket reduction
- repeat usage
- successful self-service completion

Guardrails:

- complaints after cancellation
- confusion about next steps
- duplicate submissions

---

## 6. Ethics Gate

Before implementing any behavioral UX intervention, run this gate.

If any answer is “No”, the design MUST be changed or rejected.

| Gate | Question | Must pass |
|---|---|---|
| User benefit | Does this help the user complete an intended task or make a better decision? | Yes |
| Factuality | Are all claims true and verifiable? | Yes |
| Reversibility | Can the user undo, change, cancel, or opt out easily? | Yes |
| Symmetry | Are accept/reject, subscribe/unsubscribe, buy/cancel paths comparably discoverable? | Yes |
| Transparency | Are price, terms, consequences, and data usage clear? | Yes |
| Proportionality | Is the intervention intensity proportional to the user value? | Yes |
| Long-term trust | Would this still be acceptable if shown publicly in a teardown? | Yes |
| Vulnerable users | Could this exploit minors, patients, financially stressed users, or cognitively overloaded users? | No |
| Legal / reputational risk | Could this be interpreted as dark pattern, deceptive design, or unfair commercial practice? | No |

### Automatic rejection list

Reject the design if it includes any of the following:

- fake scarcity
- fake countdown timer
- fake viewer count
- fake review
- hidden fee
- preselected paid add-on
- preselected marketing consent
- hidden privacy-invasive setting
- cancellation harder than signup
- multiple forced retention modals after cancellation intent
- confirmshaming
- guilt copy
- fear copy unsupported by real consequence
- asymmetric button visibility for consent / payment / cancellation
- default opt-in without clear user benefit
- review filtering that suppresses negative feedback
- AI-generated review summary that hides negative themes
- progress bar that does not represent real progress

---

## 7. Measurement and Telemetry

### 7.1 Required metric categories

Every behavioral design change MUST define:

1. **Primary success metric**
2. **Guardrail metric**
3. **User trust / harm metric**
4. **Rollback threshold**

### 7.2 Metric dictionary

| Metric | Use for |
|---|---|
| `conversion_rate` | Purchase, booking, signup |
| `activation_rate` | First meaningful product success |
| `completion_rate` | Forms, onboarding, setup |
| `time_to_value` | Speed from signup to first value |
| `step_dropoff_rate` | Multi-step flows |
| `error_rate` | Forms / interactions |
| `tap_error_rate` | Mobile target issues |
| `settings_change_rate` | Default quality |
| `notification_opt_out_rate` | Reminder fatigue |
| `unsubscribe_rate` | Communication fatigue |
| `support_ticket_rate` | Confusion / harm |
| `refund_rate` | Misunderstood purchase |
| `cancellation_rate` | Value / trust issue |
| `complaint_rate` | Trust harm |
| `nps_or_csat` | Perceived quality |
| `reopen_or_reactivation_rate` | Healthy return behavior |

### 7.3 Suggested event names

Use consistent event naming:

```text
ux_flow_started
ux_flow_completed
ux_flow_abandoned
ux_step_viewed
ux_step_completed
ux_primary_cta_clicked
ux_secondary_cta_clicked
ux_error_shown
ux_setting_default_seen
ux_setting_changed
ux_review_opened
ux_progress_seen
ux_notification_sent
ux_notification_clicked
ux_notification_muted
ux_pricing_plan_viewed
ux_pricing_plan_selected
ux_checkout_started
ux_checkout_completed
ux_cancel_started
ux_cancel_completed
ux_support_requested
```

### 7.4 Experiment rule

A/B tests MUST NOT use only short-term CVR.

For any conversion-oriented experiment, include at least one trust or harm guardrail:

- complaint rate
- refund rate
- cancellation rate
- support ticket rate
- opt-out rate
- negative feedback
- billing dispute
- review sentiment

---

## 8. Component-Level Guidance

## 8.1 Navigation

Use:

- `P01 Choice Reduction`
- `P02 Target Size and Proximity`

Rules:

- Keep primary navigation short.
- Group secondary items.
- Do not hide critical settings.
- Destructive or billing actions must be findable but not accidentally triggered.

## 8.2 Onboarding

Use:

- `P01 Choice Reduction`
- `P03 Transparent Defaults`
- `P05 Progress Visibility`
- `P06 Present Bias Reduction`

Rules:

- Ask only what is needed now.
- Move optional setup later.
- Show progress by meaningful steps.
- Provide a skip path when safe.
- Resume from last incomplete step.

## 8.3 Forms

Use:

- `P01`
- `P02`
- `P05`
- `P06`

Rules:

- Split long forms by task intent.
- Use inline validation.
- Preserve user input.
- Show remaining required fields.
- Avoid asking for data before value is clear.

## 8.4 Pricing

Use:

- `P07 Framing`
- `P08 Anchoring`
- `P03 Transparent Defaults`

Rules:

- Show total cost.
- Show billing interval.
- Explain recommended plan.
- Do not fake discounts.
- Do not hide cheaper plans.
- Do not preselect paid add-ons.

## 8.5 Checkout / Booking

Use:

- `P01`
- `P03`
- `P04`
- `P10` only if real
- `P11`

Rules:

- Reduce checkout steps.
- Show total cost before confirmation.
- Show cancellation / change policy.
- Show real availability only.
- End with clear confirmation and next step.

## 8.6 Notifications

Use:

- `P06 Present Bias Reduction`
- `P07 Framing`

Rules:

- Notify only when there is real user value.
- Allow frequency control.
- Allow mute / unsubscribe.
- Avoid guilt or fake urgency.
- Use reminders to reduce effort, not to pressure.

## 8.7 Reviews / Testimonials

Use:

- `P04 Authentic Social Proof`

Rules:

- Show source and context.
- Include count and recency.
- Include negative or mixed themes.
- Never fabricate or over-summarize.
- AI summaries must link to underlying evidence.

## 8.8 Cancellation / Downgrade

Use:

- `P09 Loss Aversion` only for real consequences
- `P11 Peak-End Completion`

Rules:

- Show real consequences plainly.
- Offer export or alternative if useful.
- Do not obstruct.
- Do not shame.
- End cleanly after confirmation.

---

## Section V — Visual Design System (Modern, Intentional, Non-Generic)

Applies in `CREATE` mode and explicit `REDESIGN` mode. In `EXTEND` mode, Section V applies only through the existing design system (see Section C).

### V0. Goal

Produce UI that looks deliberately designed — modern, calm, coherent — instead of default-framework output. "Modern" here means: strong typographic hierarchy, disciplined spacing, restrained color, purposeful motion, and one memorable visual idea per product. It does not mean maximal decoration.

### V1. Anti-generic rule (highest visual priority)

The agent MUST NOT ship the recognizable "AI default look". Automatic rejection list for `CREATE` / `REDESIGN` output:

- purple-to-blue or indigo-to-violet gradient as the primary brand treatment without a stated reason,
- gradient text on headlines as a default habit,
- every container as a white card with `shadow-md` and `rounded-xl` on a gray background,
- emoji used as icons in product UI,
- three-column feature grid with icon + title + two lines, applied reflexively,
- centered hero + gradient blob background as the only layout idea,
- glassmorphism everywhere,
- more than 2 font families or more than 1 accent color without justification,
- decoration that carries no information (floating shapes, particle backgrounds) in B2B tools.

Any of these MAY be used only as a deliberate, documented choice — never as an unexamined default.

### V2. Design tokens first

All visual decisions MUST be expressed as tokens (CSS custom properties, Tailwind theme config, or the project's equivalent) before use in components.

Minimum token set:

```text
color:   background, surface, surface-raised, border, text, text-muted,
         primary, primary-foreground, accent (max 1), destructive,
         success / warning / info (functional only)
type:    font-family (1 UI family + optional 1 display family),
         size scale (e.g. 12/14/16/18/24/32/48), weight set, line-height set
space:   one scale only (4px or 8px base), no ad-hoc values
radius:  one small + one large value
shadow:  max 3 elevation levels
motion:  2 durations (fast ~150ms, base ~250ms) + 1–2 easing curves
```

The agent MUST NOT hardcode raw hex values, pixel spacing, or magic numbers inside components when a token exists or can be added.

### V3. Typography

- Hierarchy MUST be visible from a grayscale screenshot: size + weight + spacing do the work, not color.
- Body text: 14–16px UI / 16–18px long-form, line-height 1.5–1.7, measure ≤ ~75 characters.
- Headings SHOULD use tighter line-height (1.1–1.3) and, for large display sizes, slightly negative letter-spacing.
- Japanese text: avoid faux-bold and overly tight letter-spacing; prefer `font-feature-settings: "palt"` for display text only; keep body text at default spacing; never justify Japanese body text.
- Numbers in tables and dashboards MUST use tabular figures (`font-variant-numeric: tabular-nums`).

### V4. Color

- One neutral ramp + one primary + at most one accent. Functional colors (success/warning/error/info) are separate and used only for state.
- Neutrals SHOULD be slightly tinted toward the brand hue rather than pure gray, for warmth and coherence.
- Contrast MUST meet WCAG AA (4.5:1 body text, 3:1 large text and UI components).
- Dark mode, if implemented, MUST be token-driven — never a per-component override.
- Color MUST NOT be the only channel for meaning (pair with icon, label, or weight).

### V5. Layout and spacing

- Choose one spacing scale and apply it everywhere; visual rhythm comes from repetition of the same few values.
- Whitespace is the primary grouping tool. Prefer spacing and subtle borders over boxes-inside-boxes; nesting depth of visible containers SHOULD be ≤ 2.
- Establish one max content width per page type (e.g. 1200px app shell, 680px reading column) and align to it consistently.
- Density MUST match the product: data-heavy B2B screens use compact rows and tabular alignment; marketing pages use generous space. Do not apply marketing-page airiness to operational dashboards or vice versa.
- Every screen SHOULD have exactly one clear focal point (aligned with `P01`).

### V6. Components and states

Every interactive component MUST define all states before it is considered done:

```text
default / hover / focus-visible / active / disabled / loading / error / empty
```

- Focus states MUST be visible and MUST NOT be removed (`outline: none` without replacement is prohibited).
- Empty states MUST say what the screen is for and offer the first action — never a bare "No data".
- Loading: prefer skeletons that match final layout over spinners for content areas; spinners only for short, indeterminate actions.
- Destructive actions use the destructive token and follow `P02` separation rules.

### V7. Motion

- Motion MUST communicate causality (where something came from, what changed) — not decorate.
- Durations: 100–200ms for micro-feedback, 200–300ms for layout/overlay transitions. Nothing in a productivity flow should exceed ~400ms.
- Animate `transform` and `opacity` only; MUST NOT animate layout properties (`width`, `height`, `top`) for recurring interactions.
- MUST respect `prefers-reduced-motion` by disabling non-essential animation.

### V8. One memorable idea

Each product/page family SHOULD carry exactly one distinctive visual signature — a characteristic type treatment, a signature accent usage, a distinctive chart style, a recognizable layout motif. One. Restraint elsewhere is what makes it read as designed.

### V9. Visual acceptance criteria (`CREATE` / `REDESIGN`)

- [ ] Grayscale screenshot still shows clear hierarchy.
- [ ] No item from the V1 anti-generic rejection list is present without documentation.
- [ ] All colors/spacing/type come from tokens.
- [ ] All component states exist, including empty/error/loading.
- [ ] AA contrast verified for text and key UI.
- [ ] Works at 375px and at the design max width.
- [ ] `prefers-reduced-motion` respected.
- [ ] The one memorable idea can be named in one sentence.

---

## Section C — Existing Design Preservation Protocol

Applies whenever any established UI exists. In `EXTEND` mode this section is blocking: **Section C overrides Section V and the agent's own aesthetic preferences.** Consistency with the existing product beats abstract "better design".

### C0. Prime directive

> Unless the user explicitly requests a redesign, the correct visual style for any change is the style the codebase already has — even if the agent considers it dated or suboptimal.

An unrequested restyle is treated the same as an unrequested API rewrite: prohibited.

### C1. Inspect before styling (MUST)

Before writing any UI code in an existing project, the agent MUST identify and record:

1. the styling system in use (Tailwind config / CSS Modules / styled-components / plain CSS / UI kit such as shadcn, MUI, Chakra),
2. where design tokens live (theme file, `:root` variables, tailwind.config, brand constants),
3. 2–3 existing screens or components closest to the one being built, to copy their conventions (spacing values, heading sizes, button variants, card structure, empty-state pattern),
4. shared components that already solve the need (Button, Modal, Table, FormField) — reuse MUST be preferred over re-implementation,
5. existing dark-mode / responsive / i18n conventions.

If the agent cannot find these, it MUST search the repository before inventing anything.

### C2. Change containment rules

The agent MUST:

- reuse existing tokens, components, and variants first; extend them second; create new ones only when neither is possible,
- keep all edits scoped to the files required by the task,
- match the surrounding code's naming, class ordering, and file structure,
- add new component variants additively (new prop value, new class) rather than modifying shared defaults.

The agent MUST NOT (without explicit user instruction):

- modify global stylesheets, resets, `:root` tokens, or theme/tailwind config in ways that change the appearance of screens outside the task,
- change shared component defaults (Button base style, global font, base spacing) to suit one screen,
- introduce a second styling system (e.g. adding Tailwind to a CSS-Modules codebase, adding a new UI kit),
- add new fonts, icon libraries, or CSS frameworks as dependencies,
- reformat, reorder, or "clean up" style code that the task does not require touching,
- replace working markup wholesale when a targeted edit suffices,
- delete CSS that appears unused — flag it instead,
- upgrade or migrate styling dependencies as a side effect.

### C3. Blast-radius check (MUST, before completion)

For every changed selector, token, or shared component, answer:

```text
1. What other screens consume this?        (grep / usage search — verify, do not guess)
2. Did I change anything they consume?     If yes → revert to a scoped variant.
3. Do the nearest existing screens still
   render identically?                      Verify visually or by diff where feasible.
```

A change with unverified global reach MUST be converted into a scoped one (new class, new variant, local override) before shipping.

### C4. New-token / deviation protocol

When existing tokens genuinely cannot express the required UI:

1. derive the new value from the existing scale (next step on the spacing scale, a shade within the existing ramp — not a foreign color),
2. add it to the central token location, in the file's existing format,
3. name it by role, following existing naming conventions,
4. document in the PR note why existing tokens were insufficient.

Ad-hoc inline values as a shortcut are prohibited.

### C5. Escalation instead of silent redesign

If the agent believes the existing design materially harms usability, accessibility, or a Section 0–17 requirement, it MUST:

- implement the task in the existing style,
- fix true blockers minimally (e.g. contrast below AA on the touched elements only),
- report the broader concern as a recommendation with scope and risk,
- and wait for explicit instruction before any wider restyle.

Accessibility fixes (focus visibility, contrast, target size on touched elements) are the only visual deviations the agent MAY make unprompted, and they MUST be listed in the report.

### C6. Containment acceptance criteria (`EXTEND`)

- [ ] Mode confirmed as EXTEND; no redesign was requested.
- [ ] Existing tokens/components reused; new ones follow C4.
- [ ] No global style, theme, or shared-default change without instruction.
- [ ] No new styling dependency or second styling system.
- [ ] Blast-radius check (C3) performed; unaffected screens verified.
- [ ] Diff contains only task-relevant style changes.
- [ ] New UI is visually indistinguishable in style from neighboring existing UI.

### C7. Quick decision rule

```text
Need to style something?
├─ Existing component/variant fits        → use it as-is
├─ Existing token expresses the value     → use the token
├─ Neither fits                           → extend additively per C4
└─ Requires changing shared/global style  → STOP. Ask the user or scope it locally.
```

---

## 9. Copywriting Rules

### 9.1 Preferred tone

Use copy that is:

- specific,
- factual,
- calm,
- action-oriented,
- reversible where possible.

### 9.2 Good copy patterns

```text
Recommended because:
Current setting:
You can change this anytime:
Next step:
Estimated time:
Access remains until:
Export your data:
```

### 9.3 Prohibited copy patterns

MUST NOT use:

```text
You would be crazy not to...
Everyone else is doing this...
Last chance forever...
Don't miss out or regret it...
Are you sure you want to lose everything?
Only 2 left
00:09 remaining
```

unless the claim is strictly true, useful, and proportionate. Even when true, use calm informational wording.

---

## 10. Accessibility and Inclusion

Behavioral UX MUST NOT reduce accessibility.

LLM agents MUST preserve or improve:

- keyboard navigation,
- screen-reader labels,
- color contrast,
- visible focus states,
- hit target size,
- error message clarity,
- reduced cognitive load,
- plain-language copy.

Do not use color alone to indicate urgency, error, or availability.

---

## 11. Legal / Reputational Risk Notes

High-risk areas:

- pricing,
- subscriptions,
- free trials,
- cancellation,
- privacy consent,
- medical / health-related decisions,
- finance-related decisions,
- minors,
- employment or housing decisions,
- reviews and testimonials.

For these areas, agents MUST prefer:

- transparent defaults,
- symmetrical choice,
- clear disclosure,
- factual copy,
- explicit consent,
- easy reversal.

Agents MUST NOT optimize these flows solely for conversion.

---

## 12. Definition of Done

A behavioral UX implementation is done only when:

- [ ] User problem is stated.
- [ ] Bottleneck is diagnosed.
- [ ] Pattern ID is documented.
- [ ] Ethics Gate is passed.
- [ ] UI is implemented.
- [ ] Copy is factual and calm.
- [ ] Accessibility is preserved.
- [ ] Telemetry exists or a reason for omission is documented.
- [ ] Guardrail metrics are defined.
- [ ] Rollback threshold is defined.
- [ ] No automatic rejection item is present.
- [ ] Mode (EXTEND / CREATE / REDESIGN) is recorded, and REDESIGN is backed by an explicit user instruction.
- [ ] `EXTEND`: Section C acceptance criteria pass (no unrequested restyle, blast radius verified).
- [ ] `CREATE` / `REDESIGN`: Section V acceptance criteria pass (tokens, states, contrast, no V1 defaults).

---

## 13. Review Checklist for LLM Agents

Before final response or PR completion, answer:

```md
### Behavioral UX Review

- Does this reduce unnecessary friction?
- Does this preserve user autonomy?
- Is every claim factual?
- Are reject / cancel / opt-out paths clear?
- Are defaults transparent and reversible?
- Are urgency and scarcity based on real data?
- Are reviews and social proof authentic?
- Does progress reflect real progress?
- Are success metrics balanced with harm metrics?
- Would this design survive public scrutiny?

### Visual / Containment Review

- Was the correct mode chosen (EXTEND unless redesign was explicitly requested)?
- Does new UI reuse the existing design system (tokens, components, spacing scale)?
- Were any global styles, shared defaults, or theme files changed? If so, was it instructed?
- Could any screen outside the task scope look different after this change?
- If CREATE/REDESIGN: is the output free of V1 generic defaults, token-driven, and state-complete?
```

If any answer is weak, revise before shipping.

---

## 14. Minimal Design Decision Algorithm

Use this algorithm for small tasks:

```text
0. Which mode? (EXTEND / CREATE / REDESIGN — default EXTEND;
   if EXTEND, inspect existing styles per Section C1 before anything else)
1. What is the user trying to do?
2. What blocks them?
3. Is the block caused by:
   a. too many choices?
   b. hard-to-use controls?
   c. unclear default?
   d. lack of trust?
   e. weak progress?
   f. present effort?
   g. unclear value / price?
   h. poor ending?
4. Select the matching pattern.
5. Run Ethics Gate.
6. Implement the smallest UI change
   — styled per Section C (EXTEND) or Section V (CREATE/REDESIGN).
7. Run C3 blast-radius check (EXTEND) or V9 visual acceptance (CREATE/REDESIGN).
8. Measure success + harm.
```

---

## 15. Recommended Default Stack

For most SaaS or web app flows, start with this stack:

```text
P01 Choice Reduction
P02 Target Size and Proximity
P03 Transparent Defaults
P04 Authentic Social Proof
P05 Progress Visibility
P11 Peak-End Completion
```

Only add these when justified:

```text
P07 Framing
P08 Anchoring
P06 Present Bias Reduction
```

Use these rarely and under strict evidence:

```text
P09 Loss Aversion
P10 Scarcity and Urgency
```

---

## 16. Practical Examples

### Example A — Signup onboarding is weak

Diagnosis:

- too many early choices
- user does not see progress
- first value is delayed

Use:

- `P01`
- `P03`
- `P05`
- `P06`

Implementation:

- reduce initial questions to required fields only,
- prefill safe defaults,
- show `Step 1 of 3`,
- make first task completable in under 90 seconds,
- save progress automatically.

Do not:

- force newsletter opt-in,
- add fake urgency,
- hide skip paths.

### Example B — Pricing page is confusing

Diagnosis:

- value comparison is unclear
- plan anchors are weak
- users do not understand billing

Use:

- `P07`
- `P08`
- `P03`

Implementation:

- show monthly and annual totals clearly,
- label each plan by user type,
- show recommended plan with reason,
- show required add-ons before checkout.

Do not:

- invent regular prices,
- hide cheaper tiers,
- preselect paid options.

### Example C — Booking flow abandonment

Diagnosis:

- too much uncertainty,
- available slots unclear,
- completion screen weak.

Use:

- `P01`
- `P04`
- `P10` only if slots are real
- `P11`

Implementation:

- show next available slots,
- show policy before confirmation,
- show real remaining capacity only,
- confirm booking with time, location, change/cancel link.

Do not:

- use fake scarcity,
- hide cancellation policy,
- reset timers.

### Example D — Cancellation flow

Diagnosis:

- user needs consequence clarity,
- business wants retention,
- high dark-pattern risk.

Use:

- `P09` only for real feature loss,
- `P11`

Implementation:

- show what will be lost,
- show billing end date,
- offer export,
- offer downgrade if genuinely helpful,
- complete cancellation without obstruction.

Do not:

- use shame,
- hide cancel button,
- show endless retention modals,
- make support contact mandatory.

---

## 17. Final Rule

When in doubt, choose the design that a user would still consider fair after understanding exactly how it works.

Short-term lift is not enough.  
A design that increases conversion while increasing complaints, confusion, refunds, or cancellation risk is a bad design.

And for visual work: the best-looking change is one the user asked for, expressed in the product's own design language. A beautiful component that breaks the visual consistency of an existing product — or restyles screens nobody asked about — is also a bad design.
