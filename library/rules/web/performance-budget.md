---
id: web-performance-budget
name: Web performance budget
applies_to: [web]
severity: blocking
tier: cross-cutting
origin: Rouge
---

# Web performance budget

Every web product ships inside this budget. Measured by Lighthouse and real-user timing in product-walk phase.

## Thresholds

### Core Web Vitals
- **LCP** (Largest Contentful Paint): ≤ 2.0s on 4G / mid-tier mobile
- **INP** (Interaction to Next Paint): ≤ 200ms p75
- **CLS** (Cumulative Layout Shift): ≤ 0.1

### Lighthouse (mobile)
- Performance: ≥ 90
- Accessibility: ≥ 90 (see web/accessibility.md)
- Best Practices: ≥ 90
- SEO: ≥ 90

### Asset budget
- Initial JS bundle: ≤ 200KB gzipped
- Initial CSS: ≤ 50KB gzipped
- Total page weight (first view): ≤ 1MB
- Images: served at display size, modern formats (WebP/AVIF)
- Fonts: subset + preload critical, max 2 families

## Rules

- No render-blocking third-party scripts above the fold
- Fonts use `font-display: swap` or `optional`
- Images have explicit `width`/`height` to prevent CLS
- Critical CSS inlined; remainder deferred
- Route-level code splitting for SPAs

## Enforcement

- Lighthouse CI in product-walk phase
- Bundle size checked at build time
- Factory blocked from committing if bundle exceeds budget (see quality-gate hook)

## Why

Sub-2s LCP is the difference between "feels fast" and "something's loading." Users leave. The budget forces decisions about what matters.
