// Scrapbook page styles. Every page is an A4-proportioned container and all
// sizes inside it are in container units (cqw), so the on-screen preview is
// an exact miniature of the printed page. A page grows instead of clipping if
// a very long story doesn't fit, and then continues on the next sheet.

export const SCRAPBOOK_CSS = `
.sb-root { display: flex; flex-direction: column; gap: 20px; color: #2D2424; }
.sb-root, .sb-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
.sb-page {
  position: relative; width: 100%; aspect-ratio: 210 / 296; container-type: inline-size;
  display: flex; flex-direction: column; overflow: clip; border-radius: 6px;
  box-shadow: 0 8px 28px rgba(45, 36, 36, .12), 0 1px 3px rgba(45, 36, 36, .08);
}
.sb-inner { flex: 1; display: flex; flex-direction: column; padding: 7cqw 7cqw 5cqw; }
.sb-root img { display: block; }
.sb-hand { font-family: var(--sb-font-hand), 'Segoe Print', 'Bradley Hand', cursive; }
.sb-serif { font-family: var(--sb-font-serif), Georgia, 'Times New Roman', serif; }
.sb-desc-s { --desc-size: 2.3cqw; }
.sb-desc-m { --desc-size: 2.05cqw; }
.sb-desc-l { --desc-size: 1.8cqw; }

/* ── Polaroid ─────────────────────────────── */
.sb-polaroid {
  background-color: #FBF5EC;
  background-image: radial-gradient(rgba(45, 36, 36, .07) 1px, transparent 1.3px);
  background-size: 16px 16px;
}
.pl-date { margin: 0; font-size: 1.8cqw; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #F06B6B; }
.pl-title { margin: 1.2cqw 0 0; font-size: 8.4cqw; line-height: 1; font-weight: 700; letter-spacing: 0; color: #2D2424; overflow-wrap: anywhere; }
.pl-place { margin: 1.4cqw 0 0; display: flex; align-items: center; gap: .8cqw; font-size: 2.1cqw; color: #5C4E4E; }
.pl-place svg { width: 2.3cqw; height: 2.3cqw; color: #F06B6B; flex-shrink: 0; }
.pl-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 3.4cqw 3cqw; margin: 5cqw auto 0; width: 100%; }
.pl-photo {
  position: relative; margin: 0; background: #fff;
  width: calc((100% - (var(--cols) - 1) * 3cqw) / var(--cols));
  padding: 1.6cqw 1.6cqw 5.4cqw;
  transform: rotate(var(--rot));
  box-shadow: 0 .6cqw 1.8cqw rgba(45, 36, 36, .16), 0 .1cqw .3cqw rgba(45, 36, 36, .12);
}
.pl-photo img { width: 100%; aspect-ratio: var(--aspect); object-fit: cover; background: #F3EDE4; }
.pl-photo figcaption { position: absolute; left: 0; right: 0; bottom: .9cqw; text-align: center; font-size: 3cqw; line-height: 1; color: #5C4E4E; }
.pl-tape {
  position: absolute; top: -1.8cqw; left: 50%; width: 12cqw; height: 3.4cqw;
  transform: translateX(-50%) rotate(-4deg); background: rgba(232, 192, 120, .6);
}
.pl-desc { margin: 5.5cqw 0 0; font-size: var(--desc-size); line-height: 1.6; color: #5C4E4E; white-space: pre-line; overflow-wrap: anywhere; }
.pl-foot { margin-top: auto; padding-top: 3cqw; display: flex; justify-content: space-between; align-items: baseline; font-size: 1.6cqw; letter-spacing: .18em; text-transform: uppercase; color: #9B8F8F; }
.pl-foot .sb-hand { font-size: 3cqw; letter-spacing: 0; text-transform: none; color: #F06B6B; }

/* Polaroid cover */
.pc-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.pc-eyebrow { margin: 0; font-size: 1.9cqw; letter-spacing: .4em; text-transform: uppercase; color: #F06B6B; font-weight: 700; }
.pc-title { margin: 2.4cqw 0 0; font-size: 13cqw; line-height: .95; font-weight: 700; overflow-wrap: anywhere; }
.pc-names { margin: 2.6cqw 0 0; font-size: 3.2cqw; font-weight: 600; color: #5C4E4E; }
.pc-collage { position: relative; width: 78cqw; height: 52cqw; margin: 7cqw auto 5cqw; }
.pc-collage .pl-photo { position: absolute; width: 36cqw; padding: 1.8cqw 1.8cqw 6cqw; }
.pc-range { margin: 0; font-size: 2.6cqw; color: #2D2424; font-weight: 600; }
.pc-stats { margin: 1.6cqw 0 0; font-size: 1.8cqw; letter-spacing: .22em; text-transform: uppercase; color: #9B8F8F; font-weight: 700; }

/* ── Majalah ──────────────────────────────── */
.sb-majalah { background: #FFFDF9; }
.mj-top { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 1.2cqw; border-bottom: .3cqw solid #2D2424; font-size: 1.6cqw; letter-spacing: .2em; text-transform: uppercase; font-weight: 700; }
.mj-top span:last-child { color: #9B8F8F; font-weight: 600; }
.mj-kicker { margin: 4cqw 0 0; font-size: 1.8cqw; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #F06B6B; }
.mj-title { margin: 1.2cqw 0 0; font-size: 6.6cqw; line-height: 1.04; font-weight: 800; letter-spacing: -.01em; overflow-wrap: anywhere; }
.mj-rule { width: 12cqw; height: .5cqw; margin-top: 2.4cqw; background: #F06B6B; }
.mj-hero { margin-top: 3.4cqw; }
.mj-hero img, .mj-grid img { width: 100%; aspect-ratio: var(--aspect); object-fit: cover; background: #F3EDE4; }
.mj-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 1.6cqw; margin-top: 1.6cqw; }
.mj-hero + .mj-grid { margin-top: 1.6cqw; }
.mj-desc { margin: 3.6cqw 0 0; font-size: var(--desc-size); line-height: 1.65; color: #3E3434; white-space: pre-line; overflow-wrap: anywhere; }
.mj-desc-cols { columns: 2; column-gap: 4cqw; text-align: justify; hyphens: auto; }
.mj-desc::first-letter { float: left; font-family: var(--sb-font-serif), Georgia, serif; font-size: 3.3em; line-height: .82; padding: .07em .09em 0 0; color: #F06B6B; font-weight: 800; }
.mj-foot { margin-top: auto; padding-top: 1.4cqw; display: flex; justify-content: space-between; border-top: .2cqw solid #2D2424; font-size: 1.5cqw; letter-spacing: .2em; text-transform: uppercase; color: #5C4E4E; font-weight: 600; }
.mj-spacer { flex: 1; min-height: 3cqw; }

/* Majalah cover */
.mc { position: relative; flex: 1; display: flex; flex-direction: column; color: #fff; background: linear-gradient(160deg, #F06B6B 0%, #B9474F 100%); }
.mc-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.mc-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 48%, rgba(0,0,0,.75) 100%); }
.mc-content { position: relative; flex: 1; display: flex; flex-direction: column; padding: 6cqw 7cqw 7cqw; }
.mc-mast { margin: 0; font-size: 12cqw; font-weight: 800; letter-spacing: -.02em; line-height: .9; text-align: center; }
.mc-issue { display: flex; justify-content: space-between; margin-top: 2.2cqw; padding: 1cqw 0; border-top: .2cqw solid rgba(255,255,255,.75); border-bottom: .2cqw solid rgba(255,255,255,.75); font-size: 1.6cqw; letter-spacing: .2em; text-transform: uppercase; font-weight: 600; }
.mc-bottom { margin-top: auto; }
.mc-kicker { margin: 0; font-size: 1.9cqw; letter-spacing: .3em; text-transform: uppercase; color: #F0D49E; font-weight: 700; }
.mc-title { margin: 1.6cqw 0 0; font-size: 9.4cqw; line-height: 1; font-style: italic; font-weight: 700; overflow-wrap: anywhere; }
.mc-names { margin: 2.2cqw 0 0; font-size: 2.9cqw; font-weight: 600; }
.mc-stats { display: flex; gap: 5cqw; margin-top: 3.4cqw; }
.mc-stat b { display: block; font-size: 6.4cqw; line-height: 1; font-weight: 800; }
.mc-stat span { display: block; margin-top: .6cqw; font-size: 1.6cqw; letter-spacing: .2em; text-transform: uppercase; }
`

/** Print-only overrides of the app shell; mounted only while the scrapbook page is open. */
export const SCRAPBOOK_PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  main { max-width: none !important; margin: 0 !important; }
  main .pb-24 { padding-bottom: 0 !important; }
  .sb-root { display: block !important; }
  .sb-page {
    width: 210mm !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important;
    break-after: page; page-break-after: always;
  }
  .sb-page:last-child { break-after: auto; page-break-after: auto; }
}
`
