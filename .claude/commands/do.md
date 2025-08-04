# Execute Coordinated Development Tasks

Execute each task in $ARGUMENTS using our specialized agent workflow.

## Execution Workflow

### 1. Task Assignment
- Deploy appropriate specialist agents for each task
- Use TodoWrite to track progress across all tasks
- Execute tasks with proper agent specialization:
  - **backend-architect** - Server, database, API, performance optimization
  - **frontend-ux-developer** - React components, UX design, accessibility  
  - **solana-defi-engineer** - Blockchain integrations, transaction handling
  - **financial-systems-guardian** - Financial calculations, fee processing
  - **engineering-supervisor** - Code review and standards compliance

### 2. Agent Reporting Protocol
All agents MUST conclude their work with:
```
## Report to Central Claude
**Findings:** [Key discoveries and insights]
**Recommendations:** [Specific next steps or changes needed]  
**Dependencies:** [What other agents or resources are needed]
**Status:** [Current state of the task/issue]
```

### 3. Quality Assurance
- Have engineering-supervisor review cross-cutting changes
- Ensure all implementations follow patterns and anti-patterns
- Run appropriate tests and validation commands

### 4. Progress Tracking
- Check tasks off in TodoWrite as you complete them
- Update task status based on agent reports
- Coordinate dependencies between specialist domains

## Development Rules
- Follow existing code patterns and conventions
- Never nest try-catches (breaks Privy execution)
- Use SSR-safe Zustand patterns with null guards
- Prefer editing existing files over creating new ones
- No band-aids - address root causes directly