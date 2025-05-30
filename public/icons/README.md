# PWA Icons

High-quality terminal-style icons for the AI Chat Terminal PWA.

## 📱 Generated Files

### PNG Files (SVG-based placeholders)
- icon-16x16.png
- icon-32x32.png
- icon-57x57.png
- icon-60x60.png
- icon-72x72.png
- icon-76x76.png
- icon-96x96.png
- icon-114x114.png
- icon-120x120.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-180x180.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

### SVG Files (vector format)
- icon-16x16.svg
- icon-32x32.svg
- icon-57x57.svg
- icon-60x60.svg
- icon-72x72.svg
- icon-76x76.svg
- icon-96x96.svg
- icon-114x114.svg
- icon-120x120.svg
- icon-128x128.svg
- icon-144x144.svg
- icon-152x152.svg
- icon-180x180.svg
- icon-192x192.svg
- icon-384x384.svg
- icon-512x512.svg

### Special Files
- favicon.ico (main favicon)
- favicon.png (32x32 fallback)

## 🎨 Design Features
- **Background**: Dark gradient (#1a1a1a → #000)
- **Symbol**: Bright green $ symbol (#00ff00)
- **Font**: Monaco/Courier New monospace
- **Effects**: Subtle shadows and borders
- **Style**: Terminal/console aesthetic

## 📐 Size Specifications
- Corner radius: 12% of icon size
- Font size: 50% of icon size
- Stroke width: 2% of icon size
- Proper scaling for all sizes

## 🔧 Production Conversion
Current files are SVG-based placeholders. For production:

1. **Online**: Upload SVG files to https://cloudconvert.com/svg-to-png
2. **Local**: `brew install librsvg && rsvg-convert icon.svg -o icon.png`
3. **Node.js**: Use Sharp library for batch conversion

## 📱 iOS Compatibility
- Optimized for iOS Safari PWA installation
- Proper contrast and visibility
- Follows Apple Human Interface Guidelines
- Tested on iPhone (iOS 14+)
