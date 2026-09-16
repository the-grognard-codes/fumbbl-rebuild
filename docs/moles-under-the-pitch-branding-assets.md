# Moles Under the Pitch branding asset inventory

## Purpose and guardrails

Moles Under the Pitch is an independent educational project that extends the
FUMBBL game client toward an HTML5 client and a modern game-service boundary.
Its visual identity should feel original, technical, welcoming, and lightly
tabletop-fantasy inspired. It must **not** present itself as FUMBBL, use FUMBBL
logos or trade dress, or imply affiliation, sponsorship, endorsement, or a
migration path for existing FUMBBL accounts.

Use an original mole character/mark, a simplified football-pitch or turf motif,
and the existing dark navy, cyan, gold, and rust palette as visual cues. Avoid
copying Blood Bowl or FUMBBL character art, logos, type treatments, and team
crests. The existing `grognard-troll-slayer.jpg` and `grognard-avatar.jpg` are
editorial/illustrative assets, not a consistent product logo system.

Use a layered green turf surface whenever a pitch is visible, with the navy,
cyan, gold, rust, and off-white system supplying outlines, markings, and
accents. If an asset includes a ball, depict a reddish-brown American football:
an elongated oval with a seam/laces where scale allows, never a round
black-and-white soccer ball.

## Source-of-truth brand package (create first)

| Asset | Deliverable | Use | Requirements |
| --- | --- | --- | --- |
| Primary logo lockup | `moles-under-the-pitch-logo.svg` plus transparent PNG exports | Site header, docs, presentations, wide email header | Original mole mark + “Moles Under the Pitch” wordmark; works on dark and light backgrounds; retain a clear-space rule. |
| Compact logo lockup | `moles-under-the-pitch-logo-compact.svg` plus PNG | Narrow headers and smaller placements | Mark with short/stacked name; legible at 160 px wide. |
| Symbol / app mark | `moles-under-the-pitch-mark.svg` plus transparent PNG | Browser icons, OAuth branding, avatars, app shell | A recognizable mole/pitch symbol without text; still readable at 16 px. |
| One-colour variants | `logo-light.svg`, `logo-dark.svg`, `mark-light.svg`, `mark-dark.svg` | Dark/light surfaces, print, accessibility fallback | Solid fills only; no reliance on glow, texture, or tiny details. |
| Favicon source | `favicon.svg` | Modern browser favicon | Simplified symbol, no wordmark, suitable for 16 px. |
| Colour and contrast sheet | `brand-palette.png` or a documented design token sheet | UI and marketing consistency | Record HEX values, text/background pairings, and WCAG-tested contrast combinations. |
| Typography specimen | `brand-type-specimen.png` or design file page | UI and communications | Define display, heading, and body usage; do not depend on a proprietary display font. |

Keep the editable artwork in an owned source file (for example, Figma, SVG, or
Illustrator) and export from it. Do not make a small raster image the master.

## Production web and PWA assets

| Filename | Format and dimensions | Where it appears | Priority |
| --- | --- | --- | --- |
| `favicon.svg` | SVG, square | Browser tab and bookmarks | P0 |
| `favicon-16.png` | PNG, 16 x 16 | Legacy browser fallback | P0 |
| `favicon-32.png` | PNG, 32 x 32 | Browser/device fallback | P0 |
| `favicon-48.png` | PNG, 48 x 48 | Windows/browser fallback | P1 |
| `apple-touch-icon.png` | PNG, 180 x 180 | iOS saved-to-home-screen icon | P0 |
| `icon-192.png` | PNG, 192 x 192 | Android/PWA launcher | P0 |
| `icon-512.png` | PNG, 512 x 512 | Android/PWA install and splash surfaces | P0 |
| `icon-maskable-512.png` | PNG, 512 x 512 | Android adaptive/maskable icon | P0 |
| `app-icon-1024.png` | PNG, 1024 x 1024 | Future native wrappers, stores, high-resolution source | P1 |
| `og-default-1200x630.png` | PNG or high-quality JPG, 1200 x 630 | Link previews for homepage, docs, updates, and support pages | P0 |
| `twitter-card-1200x600.png` | PNG or high-quality JPG, 1200 x 600 | X/Twitter fallback card where a separate crop is useful | P1 |
| `share-square-1200.png` | PNG, 1200 x 1200 | Square social posts, chat/community avatars, flexible promotional crop | P2 |
| `site-hero-desktop.webp` | WebP, 2400 x 1350 or larger | Homepage hero/background, if the current character art is replaced | P1 |
| `site-hero-mobile.webp` | WebP, 1080 x 1350 or larger | Mobile hero art, intentionally cropped rather than merely scaled | P1 |
| `play-loading-mark.svg` | SVG | Browser client initial loading state and offline/error shell | P0 |
| `play-empty-state.svg` | SVG or WebP, 960 x 640 | No-game, disconnected, or development-only client state | P2 |
| `error-illustration.svg` | SVG | 404, maintenance, expired-link, and generic error surfaces | P1 |

Use `alt` text for contextual artwork. Decorative backgrounds and textures
should be empty-alt/background CSS and must not carry required information.

## Identity and sign-in assets

| Filename | Format and dimensions | Where it appears | Priority |
| --- | --- | --- | --- |
| `oauth-google-app-logo-120.png` | PNG, 120 x 120, under 1 MB | Google OAuth branding/consent screen | P0 |
| `oauth-google-app-logo-512.png` | PNG, 512 x 512 | Archival/source-quality upload alternative and future provider reuse | P1 |
| `oauth-microsoft-app-logo-512.png` | PNG, 512 x 512 | Microsoft Entra application branding | P0 |
| `auth-card-logo.svg` | SVG, horizontal or compact lockup | `/login` and `/login/complete` | P0 |
| `magic-link-email-mark.png` | PNG, 128 x 128 or 256 x 256 | Custom email template header, if email delivery is customized | P1 |
| `magic-link-email-banner.png` | PNG, 1200 x 300 | Optional custom magic-link email header | P2 |
| `magic-link-complete-illustration.svg` | SVG | Sign-in complete, cross-device email confirmation, expired/reused link states | P1 |
| `provider-separator.svg` | SVG, optional | Only if an original branded divider is genuinely useful | P3 |

Do **not** recreate or modify Google and Microsoft marks. Use the providers'
current official sign-in buttons/icons through their prescribed components or
brand resources. The project mark can appear beside the sign-in panel and in
the provider configuration, but it must not make a provider button look
project-owned.

For Google OAuth, submit the square app mark at 120 x 120 for the best display;
Google accepts PNG, JPG, and BMP files up to 1 MB. A production external app
needs its brand verified before its display name and logo appear. [Google's
branding guidance](https://support.google.com/cloud/answer/15549049?hl=en)
also requires a privacy-policy link on the consent screen.

Firebase's stock email templates have limited visual customization. A fully
branded magic-link message requires generating the action link and sending it
through an owned email template/service; otherwise this inventory should be
used on the `/login/complete` destination and in any template options Firebase
does offer. See [Firebase's email-action guidance](https://firebase.google.com/docs/auth/admin/email-action-links)
and [custom-domain email setup](https://firebase.google.com/docs/auth/email-custom-domain?hl=en).

## Email and transactional communications

| Asset | Format and dimensions | Use | Priority |
| --- | --- | --- | --- |
| Email masthead/logo | PNG, 600 x 160 at 2x (display at about 300 x 80) | Magic-link and future security/account messages | P1 |
| Email logo mark | PNG, 128 x 128 or 256 x 256 | Narrow/mobile email header where a banner is excessive | P1 |
| Security/link illustration | PNG or SVG, max 600 x 360 | Optional magic-link explanation; keep it lightweight | P2 |
| Email footer mark | PNG, 64 x 64 | Optional footer/support signature | P3 |
| Accessibility-safe text logo | Live HTML text, not image | Required fallback in every email | P0 |

Email should work with images blocked: include the product name as live text,
the exact sending domain, a plain-text explanation of the action, support
contact, and the full destination URL where appropriate. Never embed the
one-time authentication link in an image or QR code.

## Community, documentation, and release assets

| Filename | Format and dimensions | Use | Priority |
| --- | --- | --- | --- |
| `github-social-preview.png` | PNG, 1280 x 640 | Repository social preview | P1 |
| `github-avatar-500.png` | PNG, 500 x 500 | Project organization/avatar if one is created | P2 |
| `release-banner-1600x900.png` | PNG or WebP, 1600 x 900 | Release notes, update posts, talks | P2 |
| `documentation-header-1600x400.png` | PNG or WebP, 1600 x 400 | Documentation landing pages | P2 |
| `presentation-title-1920x1080.png` | PNG, 1920 x 1080 | Project talks and educational demos | P3 |
| `community-avatar-1024.png` | PNG, 1024 x 1024 | Discord/forum/community profile image | P2 |
| `community-banner-1920x480.png` | PNG or WebP, 1920 x 480 | Community/server header where supported | P3 |
| `sticker-or-badge.svg` | SVG | “Educational project”, “HTML5 client”, and version badges | P3 |

## Artwork direction and content needs

The marketing illustrations should explain the project rather than imitate the
game's proprietary identity. Commission or create this small set only after the
core mark is settled:

1. **Hero illustration:** an original mole emerging beneath a simplified grid
   pitch, with browser/window and server-node cues. This communicates “HTML5
   client + modern service boundary” in one image.
2. **Architecture illustration:** a clean, documentation-friendly diagram of
   browser client, authentication, game service, and retained Java engine. This
   should be made as SVG so labels remain sharp and editable.
3. **Authentication illustration:** friendly, low-detail art for the magic-link
   request/complete screens; it should make “check your email” obvious without
   treating email as a game mechanic.
4. **Status/error illustration family:** same mole/field visual language for
   offline, unavailable, expired link, and no active game. Use distinct poses or
   colour accents, not red-only messaging.
5. **Optional texture/pattern:** a subtle, original underground-tunnel / pitch
   grid pattern for backgrounds. It must remain nonessential and readable at
   low contrast.

## Acceptance criteria and handoff checklist

- All logos and icons have original editable vector masters, transparent PNG
  exports, and light/dark/one-colour variants.
- The standalone mark is recognizable at 16, 32, 120, 192, and 512 px.
- A 120 x 120 PNG is tested in the Google OAuth branding configuration; a 512 x
  512 PNG is tested in Microsoft Entra branding.
- Every raster is optimized, has a documented source, and is named by purpose
  rather than by a generic export number.
- Share cards place the project name and key claim inside a safe central area;
  test previews in at least one chat app and one social platform.
- Auth and email designs explicitly name **Moles Under the Pitch** and link to
  `molesunderthepitch.org`, the privacy policy, and support contact. They do not
  display FUMBBL branding except where a legally reviewed factual disclaimer
  requires plain text.
- Login, email-link completion, 404, offline, and installation states are
  checked at mobile and desktop widths and with reduced motion/high contrast.
- Track author, license, editable-source location, and any third-party font or
  illustration licence for each asset.

## Recommended creation order

1. Primary logo, compact logo, standalone mark, and light/dark variants.
2. Favicon/PWA icon set, Google OAuth 120 px mark, Microsoft 512 px mark, and
   login/loading mark.
3. Default 1200 x 630 share card and the auth-card logo.
4. Magic-link completion/error artwork and a tested email masthead if custom
   delivery is adopted.
5. Hero, documentation, release, and community artwork.
