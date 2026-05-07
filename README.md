# Markdown Gantt

A small Vite app that renders a Frappe Gantt chart from editable markdown tables.
Markdown edits update the chart, and chart edits update the markdown.

## Run It

```sh
npm install
npm run dev
```

## Markdown Format

The app reads up to three markdown tables: assignees, tasks, and subtasks.

### Assignees

Assignees define the people you can assign tasks and subtasks to. `color` is
optional; if it is omitted, the app assigns a palette color.

```md
| assignee | role | color |
| --- | --- | --- |
| Alex | dev | #3154d4 |
| Sam | ux | #b54708 |
```

### Tasks

Task rows render as Gantt bars. Required columns are `name`, `start`, and `end`.
Optional columns are `id`, `progress`, `dependencies`, and `assignee`.

Dates must use `YYYY-MM-DD`. Dependencies are comma-separated task ids.

```md
| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| brief | Project brief | 2026-05-07 | 2026-05-09 | 100 | | Alex |
| design | Design pass | 2026-05-10 | 2026-05-14 | 60 | brief | Sam |
```

### Subtasks

Subtasks belong to parent tasks via the `task` column. If a task has subtasks,
its progress is derived from completed subtasks instead of the task row's
`progress` value.

```md
| id | task | name | done | assignee |
| --- | --- | --- | --- | --- |
| design-wireframes | design | Wireframes | true | Sam |
| design-review | design | Review | false | Alex |
```

## Chart Editing

In the chart view:

- Drag or resize bars to update task `start` and `end`.
- Click a task to open the task modal.
- Assign a task from the modal.
- Add, assign, and complete subtasks from the modal.
- Use **Add task** to append a new task row.

Task bars are colored by assignee.
