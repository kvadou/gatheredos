## **If this were my roadmap**

> **Status note (July 14, 2026):** This document preserves Alexis's original
> product-development prompts and therefore contains the former GatheredOS name.
> The canonical product name is GatheredOS, and current implementation status
> lives in `docs/HANDOFF.md`. The constitution, ingestion pipeline, knowledge
> graph, grounded Ask citations, and proactive insight foundations described
> below are implemented. The active sequence lives in
> `docs/launch-readiness-plan.md`.

Launch preparation, activation metrics, naming, identity, and App Store work are
sequenced in the [Launch Readiness Plan](launch-readiness-plan.md).

**Phase 1 (1–2 weeks):**

* ~~Finish Care~~  
* ~~Finish Projects~~  
* ~~Finish Library~~  
* ~~Finish Settings~~  
* ~~Freeze UX~~

~~STOP DESIGNING~~

**Phase 2 (next 2–3 months):**

* Document ingestion  
* OCR  
* Metadata extraction  
* Knowledge graph  
* AI memory  
* Search  
* Answer generation  
* Timeline  
* Proactive insights

At that point, you'll have something that's no longer just a compelling prototype—it will be a product people can actually use. That's the milestone I'd optimize for now.

[https://v0.app/chat/gatheredos-dashboard-design-eVVBzVQ8wYi?ref=DMWO6X](https://v0.app/chat/gatheredos-dashboard-design-eVVBzVQ8wYi?ref=DMWO6X)

## **Claude Prompt \#1**

I have completed the UX for GatheredOS, an AI operating system for homeowners. I now want to define the underlying intelligence model. Help me design every object GatheredOS understands (Home, System, Room, Project, Document, Contractor, Warranty, Receipt, Maintenance Task, Insight, Recommendation, etc.). For each object define:

• attributes  
 • relationships  
 • lifecycle  
 • AI-generated fields  
 • user-generated fields  
 • examples

Think like you're designing the internal knowledge graph for GatheredOS.

# **Step 2: Design the AI Engine ⭐⭐⭐⭐⭐**

This is the magic.

Instead of pages...

Design behaviors.

Examples:

Upload receipt

↓

Receipt parsed

↓

Warranty updated

↓

Project cost updated

↓

Investment page recalculated

↓

Maintenance schedule updated

↓

Worth Knowing insight generated

↓

Ask GatheredOS gains new knowledge

That is your product.

---

Claude Prompt \#2

Help me design the GatheredOS intelligence engine. For every user action (uploading a receipt, adding a contractor, completing maintenance, creating a project, connecting Gmail, uploading an inspection report, etc.), describe every downstream action GatheredOS should automatically perform. I want GatheredOS to feel proactive and continuously build knowledge rather than simply storing information.

---

# **Step 3: Build the AI Playbook ⭐⭐⭐⭐⭐**

This becomes your product spec.

Ask:

If someone asks...

"When do I replace my roof?"

What information gets used?

What reasoning?

What confidence?

What citations?

Where do costs come from?

How should GatheredOS answer?

Do this for 100+ questions.

---

Claude Prompt \#3

Help me design the reasoning engine for GatheredOS. Generate 100 realistic homeowner questions. For each question explain:

• what GatheredOS needs to know  
 • which objects it searches  
 • what reasoning it performs  
 • how it cites evidence  
 • what follow-up questions it should ask  
 • what actions it can recommend afterward.

The goal is to define the intelligence behind the AI assistant, not just the UI.

---

# **After that...**

Now you're ready to build.

Not pages.

Features.

Your roadmap naturally becomes:

### **MVP**

* Authentication  
* Home model  
* Document upload  
* OCR  
* AI extraction  
* Knowledge graph  
* Maintenance engine  
* Ask GatheredOS  
* Worth Knowing  
* Notifications

---

### **v2**

* Gmail integration  
* Google Photos  
* Calendar  
* Smart home integrations  
* Family sharing  
* Contractor portal

---

### **v3**

* Predictive maintenance  
* Insurance  
* Financing  
* Marketplace  
* Local recommendations  
* Property valuation  
* Neighborhood intelligence

---

## **One more thing I'd create before writing significant code**

I'd write a **GatheredOS Constitution**—a 10–15 page document that answers:

* What is GatheredOS?  
* What problems does it solve?  
* What principles does it follow?  
* What will it never become?  
* How should the AI behave?  
* What does "proactive" mean?  
* What is the user's mental model?  
* What are the core objects?  
* How do all the pages connect?  
* What does success look like in one year?

This becomes the source of truth for Claude, Vercel, future engineers, and even investors. Every prompt and every implementation decision can be checked against it. For a product that's meant to be an "operating system" rather than a collection of tools, having that foundation will pay off far more than another round of UI refinement.
