# Task 01 — Implementation roadmap

**Status:** planning only — **no implementation without sign-off on [06](./06-target-architecture.md)–[09](./09-admin-ux-design.md)**  
**Aligns with:** single architecture in 06–09  
**Standing constraint:** **R21 = P0 OPEN** — organizational ban on API DB integration ([00.1-db-integration-ban.md](./00.1-db-integration-ban.md)); do not rewrite working `DATABASE_URL`; no VPS without permission

---

## Sequencing doctrine

One primary implementation per concern. **Forbidden:** extend SeoLanding public API while migrating storefront to category-only; add a new SEO table beside CatalogCategory; ship DESCRIPTIVE UI without Prisma/contracts enum; DROP SeoLanding before public cutover.

---

## Gates

| Gate | Exit |
| --- | --- |
| **G0** | Architecture review approves 06–09 |
| **G1** | R21 technical safety merged; ban doc + risk register updated; integration may run on allowlisted DB only |
| **G2** | Catalog unit/contracts green without relying on banned integration |
| **G3** | Authorized VPS proofs before DROP |

Until G1: unit tests only for API DB concerns.

---

## Phase A — Stabilize

| ID | Work | Depends | Acceptance |
| --- | --- | --- | --- |
| A0 | Technical DB safety gate for API integration | G0 | R21 closable; no `bouquet_one` fallback; negative tests |
| A1 | Fix commerce transition assertion | A0 | Suite green on allowlisted DB |
| A2 | Fix/quarantine media-hardening boot | A0 | Green or explicit quarantine ticket |
| A3 | Align stale catalog docs to `/catalog` | G0 | No doc claims dual primary CMS |
| A4 | Delete dead `flower-type-landing.tsx` | G0 | Grep zero imports |

---

## Phase B — SEO cutover (tables retained)

| ID | Work | Maps to | Depends | Acceptance |
| --- | --- | --- | --- | --- |
| B1 | Public read + sitemap = categories only | [08](./08) S2 | G1, G2 | No required seo-landings public/sitemap path |
| B1b | Public PLP pin merge | [08](./08) S3 / R25 | with/after B1 | Pins visible on storefront in pin order |
| B2 | Remove admin SEO write API | [08](./08) S2 | B1 | No SeoLanding writes |
| B3 | Web helpers + redirect stubs cleanup | [09](./09) U1 | B2 | Grep clean; one page editor |
| B4 | Redirect map SoT / CI | [08](./08) S6 | ∥ OK | Drift fails CI |
| B5 | Move shared rule helpers off seo-landings | [06](./06) D7 | B2 | Imports updated |
| B6 | Embed filters UI in pages manager | [09](./09) U3 / R26 | ∥ B3 | Facets editable from pages |

**Phase B bundle acceptance:** storefront never needs SeoLanding dual-read; admin writes only CatalogCategory; pins public; filters reachable.

---

## Phase C — `DESCRIPTIVE` precision

| ID | Work | Maps to | Depends | Acceptance |
| --- | --- | --- | --- | --- |
| C1 | Prisma ADD VALUE + migration | [07](./07) P2 | G0; prefer G1 | Migrate OK on copy DB |
| C2 | Contracts + tests | [06](./06) D1 | C1 | Enum parity |
| C3 | API normalize + filters | [06](./06) D1 | C2 | DESCRIPTIVE skips EXACT qty require |
| C4 | Admin precision UI | [09](./09) U2 | C3 | Manager can select modes |
| C5 | Optional backfill | [07](./07) P2 | owner policy | Documented counts |

Order: C1→C2→C3→C4. Do not ship C4 against old enum.

---

## Phase D — Destructive cleanup

| ID | Work | Depends | Acceptance |
| --- | --- | --- | --- |
| D0 | Authorized VPS read-only parity/traffic | B3 live | Checklist (R23) |
| D1 | Forward DROP SeoLanding* | D0 | Staging migrate + smoke |
| D2 | Remove Prisma models + generate | D1 | typecheck/build |
| D3 | Drop `diameterCm` if unused | separate proof | No DTO leftovers |

---

## Phase E — Polish

| ID | Work | Depends | Acceptance |
| --- | --- | --- | --- |
| E1 | Nav/copy cleanup | B3 | No writable landing IA |
| E2 | Placement / SEO health links | B2 | Links → pages |
| E3 | Family coverage (R18) | G1 + seed | Test or accepted residual |
| E4 | Rename `assertComponentFlowerRefXor` | after G0 | Grep rename done |

---

## Graph

```text
G0 → G1 (R21 technical) → A1/A2
         ├─ B1 → B1b → B2 → B3 → D0 → D1 → D2
         ├─ B6 ∥ B3
         └─ C1 → C2 → C3 → C4
A3/A4/B4/E* after G0 without reintroducing dual public primary
```

## Suggested PRs

1. PR-Safety (A0)  
2. PR-SEO-read (B1+B1b)  
3. PR-SEO-write-web (B2+B3, +B6 if ready)  
4. PR-Precision (C1–C4)  
5. PR-DROP (D*, ops-attended)  
6. PR-Hygiene (A3/A4/B4/E)

---

## Out of scope now

Unrelated orders/telegram dirty work; replacing Family with variants; TraitDefinition CMS; VPS inference from local DB; running banned integration while R21 OPEN.

---

## Review checklist

- [ ] Shared contract in [06](./06-target-architecture.md) accepted  
- [ ] Prisma plan [07](./07) matches SEO/admin/roadmap  
- [ ] Sequential SeoLanding cutover accepted  
- [ ] Pin merge + filters UX accepted  
- [ ] R21 organizational ban acknowledged  
- [ ] Open questions in [06](./06) answered or deferred explicitly  

**Stop before Task 02 / implementation.**
