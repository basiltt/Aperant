# Skeuomorphic Design System

A comprehensive design system for Auto-Claude that creates realistic material interfaces using CSS-based textures, physics-informed animations, and authentic material behaviors.

## 🎯 Overview

This design system implements a unified skeuomorphic interface using five authentic materials:

- **Paper** (60% usage): Content surfaces, forms, cards
- **Metal** (25% usage): Navigation, controls, input frames
- **Wood** (10% usage): Primary action buttons, CTAs
- **Glass** (4% usage): Modals, overlays, tooltips
- **Fabric** (1% usage): Background textures

## 🏗️ Architecture

```
design-system/
├── tokens/           # Design tokens (185 total)
│   ├── materials.css     # Material colors & textures
│   ├── elevation.css     # 12-level shadow system
│   ├── motion.css        # Physics-based animations
│   ├── spacing.css       # Material-aware spacing
│   ├── typography.css    # Material typography rules
│   └── radius.css        # Material border radius
├── components/       # Core components
│   ├── Button/          # Wood/Metal/Paper variants
│   ├── Input/           # Metal frame + Paper content
│   ├── Card/            # Paper material variants
│   └── Modal/           # Glass overlay patterns
├── hooks/           # React integration hooks
├── utils/           # Material helper functions
├── types.ts         # TypeScript definitions
└── index.css        # Main integration file
```

## 🚀 Quick Start

### 1. Import the Design System

```tsx
import { MaterialButton, MaterialCard, MaterialInput } from '@/design-system/components';
import '@/design-system/index.css'; // Import all design tokens
```

### 2. Use Material Components

```tsx
// Primary action button (Wood material)
<MaterialButton variant="primary" size="md">
  Save Changes
</MaterialButton>

// Input with metal frame + paper content
<MaterialInput
  label="Email Address"
  type="email"
  placeholder="Enter your email"
/>

// Paper content card
<MaterialCard variant="raised" hoverable>
  <h3>Card Title</h3>
  <p>Card content goes here...</p>
</MaterialCard>
```

### 3. Apply Material Tokens Directly

```css
.custom-component {
  background: var(--texture-paper-fiber), var(--material-paper-white);
  box-shadow: var(--elevation-2);
  border-radius: var(--radius-material-soft);
  transition: all var(--duration-paper-transition) var(--easing-paper-fold);
}
```

## 🎨 Material System

### Material Hierarchy

Components are automatically assigned materials based on their role:

```tsx
// 60% Paper - Content surfaces
<MaterialCard variant="content">Content here</MaterialCard>

// 25% Metal - Controls & navigation
<MaterialButton variant="secondary">Control Action</MaterialButton>

// 10% Wood - Primary actions
<MaterialButton variant="primary">Primary CTA</MaterialButton>

// 4% Glass - Overlays
<MaterialModal open={isOpen}>Modal content</MaterialModal>

// 1% Fabric - Backgrounds (automatic via CSS)
```

### Interactive States

All components support 5 universal interaction states:

- **Idle**: Natural resting position
- **Hover**: Anticipation (+1 elevation, subtle lift)
- **Active**: Physical contact (pressed down, -1 elevation)
- **Focus**: Accessible selection (outline ring)
- **Disabled**: Non-interactive (flattened, reduced opacity)

## 🔧 Customization

### Theme Integration

Materials automatically adapt to the current theme through CSS custom properties:

```css
[data-theme="dusk"] {
  --material-wood-walnut: #A0522D; /* Warmer wood tone */
}

[data-theme="ocean"] {
  --material-wood-walnut: #4682B4; /* Cooler wood tone */
}
```

### Custom Materials

Create custom material variants:

```css
.material-wood-custom {
  background:
    var(--texture-wood-grain),
    linear-gradient(180deg, #custom-color-1, #custom-color-2);
  box-shadow: var(--elevation-wood-button);
}
```

### Responsive Behavior

Materials automatically simplify on mobile devices:

```css
/* Desktop: Full complexity */
@media (min-width: 1024px) {
  .material-component {
    background: var(--texture-complex), var(--material-base);
    box-shadow: var(--elevation-full-range);
  }
}

/* Mobile: Simplified for performance */
@media (max-width: 767px) {
  .material-component {
    background: var(--material-base); /* No texture */
    box-shadow: var(--elevation-basic); /* Max level 4 */
  }
}
```

## 📱 Performance

### Performance Budgets

The design system enforces strict performance constraints:

- **Max 3 gradients** per element
- **Max 3 shadows** per element
- **Max 300ms** animation duration
- **GPU acceleration** for all transforms
- **Hardware-optimized** properties only

### Mobile Optimization

- Textures disabled on mobile (<768px)
- Simplified shadows (max elevation 4)
- Enhanced touch targets (44px minimum)
- Faster animations (reduced duration)

## ♿ Accessibility

### WCAG Compliance

All components meet WCAG 2.1 AA standards:

- **Contrast ratios**: Minimum 4.5:1, target 7.0:1
- **Focus management**: Visible focus rings on all interactive elements
- **Keyboard navigation**: Full keyboard support
- **Screen readers**: Semantic HTML and ARIA labels

### Accessibility Features

```tsx
// Automatic focus management
<MaterialButton>
  {/* Focus ring automatically applied */}
</MaterialButton>

// High contrast mode support
<MaterialInput className="supports-high-contrast" />

// Reduced motion support
<MaterialModal
  // Animations respect prefers-reduced-motion
/>
```

## 🧪 Testing

### Validation Commands

```bash
# Type checking
npm run typecheck

# Accessibility testing
npm run a11y:test

# Performance validation
npm run perf:audit

# Cross-browser testing
npm run test:browsers
```

### Component Testing

Use Storybook for component development and testing:

```bash
npm run storybook
```

Each component includes comprehensive stories covering:
- All variants and sizes
- All interaction states
- Theme variations
- Accessibility scenarios

## 🎯 Usage Guidelines

### Do's ✅

- Use semantic material selection based on component role
- Leverage CSS custom properties for theme compatibility
- Respect the material hierarchy (60/25/10/4/1 distribution)
- Implement all 5 interaction states for interactive elements
- Use hardware-accelerated transform properties

### Don'ts ❌

- Don't hardcode material colors
- Don't exceed performance budgets (3 gradients/shadows max)
- Don't animate layout properties (width, height, position)
- Don't skip accessibility requirements
- Don't create one-off material implementations

### Best Practices

```tsx
// ✅ Good: Semantic material usage
<MaterialButton variant="primary"> {/* Auto-selects wood */}
  Primary Action
</MaterialButton>

// ❌ Bad: Manual material override
<MaterialButton material="glass" variant="primary">
  Primary Action
</MaterialButton>

// ✅ Good: CSS custom properties
.custom-surface {
  background: var(--material-paper-white);
}

// ❌ Bad: Hardcoded colors
.custom-surface {
  background: #FEFCF8;
}
```

## 🔄 Migration Guide

### From Existing Components

1. **Wrap existing components** with material classes
2. **Use feature flags** for gradual rollout
3. **Maintain functional parity** during transition
4. **A/B test performance** and user satisfaction

### Integration Example

```tsx
// Before: Legacy button
<Button className="bg-blue-500 hover:bg-blue-600">
  Action
</Button>

// After: Material button
<MaterialButton variant="primary">
  Action
</MaterialButton>
```

## 📚 API Reference

### Core Hooks

- `useMaterialComponent()`: Apply material system to any component
- `useInteractionStates()`: Handle hover/active/focus states
- `useAnimationDuration()`: Get material-specific animation timing
- `useResponsiveMaterials()`: Handle mobile simplification

### Utility Functions

- `getMaterialForRole()`: Automatic material selection
- `getElevationForComponent()`: Semantic elevation mapping
- `getMaterialClasses()`: Generate CSS class strings
- `shouldSimplifyMaterials()`: Check for mobile optimization

## 🆘 Support

### Common Issues

**Q: Components look flat on mobile**
A: This is intentional for performance. Textures and complex shadows are disabled on devices <768px.

**Q: Animations feel slow**
A: Check `prefers-reduced-motion` settings. The system automatically respects user motion preferences.

**Q: Custom theme colors not applying**
A: Ensure you're using CSS custom properties, not hardcoded colors. Check theme integration documentation.

### Performance Issues

If experiencing performance problems:

1. Check browser dev tools for layout thrashing
2. Verify no more than 3 gradients/shadows per element
3. Ensure animations use transform/opacity only
4. Test on low-end devices

## 🎉 Contributing

See the main project contributing guidelines. When adding new components:

1. Follow the existing material patterns
2. Implement all 5 interaction states
3. Add comprehensive Storybook stories
4. Include accessibility testing
5. Validate performance budgets

---

*Design System v1.0.0 | Built with authentic materials for intuitive interactions*