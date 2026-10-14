# Blog refresh brief (used by the "Refresh blogs (Claude)" GitHub Action)

You are refreshing existing blog posts on **lmshandling.com** (Nibaha Haq, Virtual University of Pakistan academic support). You run headless in a GitHub Action: nobody can answer questions, so decide sensibly and finish.

Your output is an **update proposal** for each post. A human reviews the difference and approves it; nothing you write goes live by itself.

First read, and follow as the source of truth:
1. `.claude/agents/seo-agent.md` (brand facts, E-E-A-T rules, the blog structure, the AEO/GEO playbook, non-negotiables)
2. `.github/blog-writer-prompt.md` ("Voice and rules" section: no guarantees, no leaked-paper claims, no encouragement of academic dishonesty, brand facts)

## Inputs (given in the task message)
- `SLUGS`: comma-separated post slugs to refresh.
- `TODAY`: today's date (YYYY-MM-DD).

## For each slug
1. Find the live file:
   - Markdown post: `content/blog/<slug>.md`
   - Legacy page: `blog/<slug>.html`
   Exactly one exists. If neither does, skip the slug.
2. Make a working copy, then edit only the copy:
   - `cp content/blog/<slug>.md drafts/refresh/<slug>.md`  (or)
   - `cp blog/<slug>.html drafts/refresh/<slug>.html`
   Create the folder first if needed (`drafts/refresh/`). Use Edit on the copy; do not rewrite the whole file from scratch.
3. Real search data: read `.github/refresh-targets.json`. If the slug is listed, those are the exact queries people typed in Google when this page was shown, with impressions, clicks and average position. These pages already rank on page 1 but get few clicks, so the goal is a higher click-through rate and a better position WITHOUT losing what already ranks:
   - Rewrite `<title>` and the meta description so the main real query appears naturally near the start, the promise is specific (what the reader gets, the year, a number or a step count) and it reads like a human wrote it. Never clickbait, never a guarantee.
   - Make sure the page answers each top query directly under its own H2 or FAQ question (40-70 word answer first), using the searcher's wording.
   - Keep every heading, section and fact that already works. Add and sharpen; do not remove ranking content.
   - If a slug is not listed, improve the title/description and FAQs from the page's own topic using the same rules.
4. Research: use WebSearch/WebFetch only for facts that change (dates, fees, rules, procedures, semester names, deadlines). Prefer official VU sources (vu.edu.pk). If you cannot verify a fact, rewrite it as general guidance ("confirm the exact date on VULMS") instead of stating a number. Never invent statistics, dates, fees, quotes or results.
5. Refresh the content:
   - Update anything outdated (years, semesters, "this year", old dates) and fix anything inaccurate.
   - Make the first screen answer-first: a clear Quick Answer / opening answer (40-70 words) that stands alone.
   - Strengthen thin sections with concrete, specific, student-useful detail; add 1-2 genuinely useful FAQs if the topic needs them (visible FAQ and FAQPage JSON-LD must stay in sync, same count and text).
   - Fix weak internal linking: add 2-4 links to relevant existing pages (`/blog/<slug>` that really exist, services, `/vu-notes`, `/cgpa-calculator`).
   - Remove filler and keyword stuffing. Keep the voice and structure of the existing page.
6. Set the modified date to `TODAY` everywhere it appears:
   - Markdown post: frontmatter `dateModified: "TODAY"`.
   - Legacy HTML: JSON-LD `"dateModified"`, `article:modified_time` meta, and any visible "Updated" label.
   (Never change `datePublished`.)

## Hard rules (a validator enforces them; a failing proposal is discarded)
- Keep the **URL, slug, canonical link, layout, CSS, images and all existing `<script>` blocks byte-for-byte unchanged**. Do not add scripts, iframes, forms, inline event handlers, `javascript:` links, or links to new external hosts (wa.me, lmshandling.com and vu.edu.pk links are fine).
- `<title>`: at most 60 characters including " | Nibaha Haq". `<meta name="description">`: 70-160 characters. Exactly one `<h1>`.
- Every JSON-LD block must remain valid JSON. Do not remove any block.
- Do not shrink the page by more than 40% or grow it by more than 2.5x.
- No guarantees of grades/CGPA/results/approval, no "leaked paper" wording.
- Markdown posts must keep the frontmatter schema exactly (see `content/blog/vu-gdb-submission-format.md`) and pass `node scripts/validate-post.js`.
- Only touch files inside `drafts/refresh/`.

## Finish
Run `node scripts/validate-refresh.js <slug> drafts/refresh/<slug>.<md|html>` for each slug and fix every ERROR until it prints `OK`. If a post cannot be made valid, delete its file in `drafts/refresh/` and move on. Finally reply with one short line per slug: what you changed in plain words.
