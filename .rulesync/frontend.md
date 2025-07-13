---
root: false
targets: ["*"]
description: "Frontend development rules and best practices"
globs: ["src/components/**/*.tsx", "src/pages/**/*.tsx", "**/*.css", "**/*.scss"]
---

# Frontend Development Rules

## React Components

- Use functional components with hooks
- Follow PascalCase naming for components
- Use TypeScript interfaces for props
- Implement proper error boundaries

## Styling

- Use CSS modules or styled-components
- Follow BEM methodology for CSS classes
- Prefer flexbox and grid for layouts
- Use semantic HTML elements

## State Management

- Use React hooks for local state
- Consider Redux or Zustand for global state
- Avoid prop drilling with context API
- Keep state as close to where it's used as possible

## Performance

- Use React.memo for expensive components
- Implement lazy loading for routes
- Optimize images and assets
- Use proper key props in lists
