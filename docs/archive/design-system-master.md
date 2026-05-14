## Design System: CAFE POS MOBILE APP INDONESIA WARM COFFEE

### Pattern
- **Name:** App Store Style Landing
- **Conversion Focus:** Show real screenshots. Include ratings (4.5+ stars). QR code for mobile. Platform-specific CTAs.
- **CTA Placement:** Download buttons prominent (App Store + Play Store) throughout
- **Color Strategy:** Dark/light matching app store feel. Star ratings in gold. Screenshots with device frames.
- **Sections:** 1. Hero with device mockup, 2. Screenshots carousel, 3. Features with icons, 4. Reviews/ratings, 5. Download CTAs

### Style
- **Name:** Exaggerated Minimalism
- **Keywords:** Bold minimalism, oversized typography, high contrast, negative space, loud minimal, statement design
- **Best For:** Fashion, architecture, portfolios, agency landing pages, luxury brands, editorial
- **Performance:** ⚡ Excellent | **Accessibility:** ✓ WCAG AA

### Colors
| Role | Hex |
|------|-----|
| Primary | #78350F |
| Secondary | #92400E |
| CTA | #FBBF24 |
| Background | #FEF3C7 |
| Text | #451A03 |

*Notes: Coffee brown + warm gold*

### Typography
- **Heading:** Fredoka
- **Body:** Nunito
- **Mood:** playful, friendly, fun, creative, warm, approachable
- **Best For:** Children's apps, educational, gaming, creative tools, entertainment
- **Google Fonts:** https://fonts.google.com/share?selection.family=Fredoka:wght@400;500;600;700|Nunito:wght@300;400;500;600;700
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@300;400;500;600;700&display=swap');
```

### Key Effects
font-size: clamp(3rem 10vw 12rem), font-weight: 900, letter-spacing: -0.05em, massive whitespace

### Avoid (Anti-patterns)
- Generic design
- No atmosphere

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

## Kaffee POS Override
Font: Poppins (heading), Inter (body), JetBrains Mono (angka)
Primary: #6F4E37
Accent: #FBBF24
Success: #1D9E75
Background: #FEF3C7
Touch target: 44px minimum
Tombol bayar: 56px height
## Kaffee POS Custom Override
Font heading: Poppins 600/700
Font body: Inter 400/500
Font angka/harga: JetBrains Mono
Primary: #6F4E37
Accent: #FBBF24
Success: #1D9E75
Background: #FEF3C7
Text: #1C1917
Touch target minimum: 44px
Tombol bayar: height 56px warna #FBBF24
Font size minimum: 14px
Input nominal: 24px JetBrains Mono
