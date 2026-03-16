# CLAUDE CODE — READ THIS FIRST

Read SPEC.md in full before writing a single line of code.

Then build the entire app exactly as specified. Start in this order:

1. package.json + .env.example
2. src/brands.js
3. src/services/anthropic.js (all Claude prompt functions)
4. src/services/kieai.js (generate + poll)
5. server.js + all routes
6. public/index.html (full frontend — dark theme, two-column layout)
7. public/style.css

Do not ask for clarification. Make decisions and build. 
If something is ambiguous, pick the most production-ready option.

When done, output:
- A summary of what was built
- The exact `npm install` command with all dependencies
- How to run it
