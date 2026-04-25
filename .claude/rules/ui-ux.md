---
description: UI aesthetic, responsive requirements, and scroll-animation rules. Apply to all frontend work.
globs: ["client/**/*", "web/**/*", "frontend/**/*", "src/**/*.{tsx,jsx,css,scss}"]
alwaysApply: true
---

# UI / UX Rules

## Aesthetic
Minimal, modern, professional. Restrained palette, generous whitespace, a single accent color, clear typographic hierarchy. No decorative clutter, no gradients-on-gradients, no random icons for decoration.

## Component & styling system (mandatory)
- **Tailwind CSS** is the only styling layer — no CSS Modules, no styled-components, no ad-hoc global stylesheets beyond `index.css` / Tailwind layers.
- **shadcn/ui** is the component library. Add components via the shadcn CLI (`npx shadcn@latest add <component>`) into `client/src/components/ui/`; do not install Material UI, Chakra, Ant Design, etc.
- Theme tokens (colors, radius, fonts) live in `tailwind.config.ts` + CSS variables in `client/src/index.css`, matching the shadcn convention. Accent color is defined once as a CSS variable and reused — never hardcode hex values in components.
- Compose new UI by combining shadcn primitives + Tailwind utility classes. Use `cn()` (clsx + tailwind-merge) for conditional classes.
- Do not edit generated shadcn component files casually; if a component needs project-specific behavior, wrap it rather than forking the primitive.

## Responsive (mandatory)
Design mobile-first. Every screen must work at **360 px width**. Chat input, message list, upload controls, and auth forms must all be fully usable on touch devices. Test at small viewport before declaring a UI task done.

## Scroll animations (mandatory)
Every landing/marketing section animates when it enters the viewport.

- Use `IntersectionObserver` or Framer Motion's `whileInView` — **not** scroll-Y listeners.
- Animations must respect `prefers-reduced-motion: reduce` and fall back to no-motion.
- Keep durations short (≤ 500 ms) and easing subtle; animation supports content, not the other way around.

## Chat UX
- Stream tokens as they arrive; never wait for the full response.
- Show a clear loading/typing indicator while the model is generating.
- Render citations inline or as a collapsible source list under each assistant message.
- Preserve scroll position when the user scrolls up mid-stream; auto-scroll only when they are at the bottom.
