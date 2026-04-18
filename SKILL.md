---
name: yalex-homework-design
description: Use this skill to generate well-branded interfaces and assets for yAlex's HomeWork, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- **Vibe**: Warm & cozy — paper, wood, evening lamp. Cream background, dark brown text, clay + moss accents.
- **Type**: Lora (serif display) + Pretendard (Korean/Latin body sans) + JetBrains Mono (numbers/code).
- **Layout**: Sidebar (240px) + centered content (max 840px), Notion-style.
- **Tokens**: see `colors_and_type.css` — import it at the top of any new HTML file.
- **Icons**: Phosphor Icons via CDN (`<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>`, use `<i class="ph ph-ICONNAME">`).
- **Tone (Korean primary)**: calm, personal, like reading a friend's private notebook. "아직 쓰지 않은 날이에요." Never marketing-y. Minimal emoji.
- **Motion**: fade + 4–8px slide, 240ms ease-out. No bounce.
- **Shadows**: brown-tinted, 3 steps (`--shadow-sm/md/lg`).
