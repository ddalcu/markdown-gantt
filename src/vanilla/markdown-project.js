import { addDays, formatDate, parseDateOnly } from './timeline.js';

export const TASK_COLUMNS = ['id', 'name', 'start', 'end', 'progress', 'dependencies', 'assignee'];
export const ASSIGNEE_COLUMNS = ['assignee', 'role', 'color'];
export const SUBTASK_COLUMNS = ['id', 'task', 'name', 'done', 'assignee'];

const ASSIGNEE_PALETTE = [
  '#3154d4',
  '#b54708',
  '#087443',
  '#7a2e83',
  '#b42318',
  '#0e7490',
  '#854d0e',
  '#475467',
];

const HEADER_ALIASES = {
  deps: 'dependencies',
  depends: 'dependencies',
  dependency: 'dependencies',
  owner: 'assignee',
  assigned: 'assignee',
  complete: 'done',
  completed: 'done',
};

export const defaultMarkdown = `# Product Launch Roadmap

Edit these markdown tables directly, or switch to the Gantt chart and click a task.
Assignees color task bars. Subtasks drive parent progress when a task has subtasks.

## Assignees

| assignee | role | color |
| --- | --- | --- |
| Maya | product | #087443 |
| Leo | ux | #b54708 |
| Aisha | dev | #3154d4 |
| Quinn | qa | #7a2e83 |
| Rowan | devops | #0e7490 |

## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| discovery | Discovery and scope | 2026-05-07 | 2026-05-10 | 0 | | Maya |
| design | Design prototype | 2026-05-11 | 2026-05-16 | 0 | discovery | Leo |
| build | Build beta | 2026-05-17 | 2026-05-27 | 0 | design | Aisha |
| qa | QA and fixes | 2026-05-28 | 2026-06-03 | 0 | build | Quinn |
| launch | Launch prep | 2026-06-04 | 2026-06-07 | 20 | qa | Rowan |

## Subtasks

| id | task | name | done | assignee |
| --- | --- | --- | --- | --- |
| discovery-users | discovery | Interview target users | true | Maya |
| discovery-brief | discovery | Write project brief | true | Maya |
| design-flows | design | Map core flows | true | Leo |
| design-review | design | Review with product | false | Maya |
| build-api | build | API wiring | true | Aisha |
| build-ui | build | Implement UI states | false | Leo |
| build-polish | build | Interaction polish | false | Aisha |
| qa-plan | qa | Draft QA plan | true | Quinn |
| qa-regression | qa | Run regression pass | false | Quinn |
| qa-fixes | qa | Verify launch blockers | false | Aisha |
`;

export function parseProject(markdown) {
  const tables = findMarkdownTables(markdown);
  const taskTable = findTaskTable(tables);

  if (!taskTable) {
    throw new Error('Add a task table with columns: id, name, start, end, progress, dependencies.');
  }

  const assigneeTable = findAssigneeTable(tables, taskTable);
  const subtaskTable = findSubtaskTable(tables, taskTable);
  const tasks = parseTasksFromTable(taskTable);
  validateTaskDependencies(tasks);
  const taskIds = new Set(tasks.map((task) => task.id));
  const subtasks = subtaskTable ? parseSubtasksFromTable(subtaskTable, taskIds) : [];
  const assignees = buildAssigneeDirectory(
    assigneeTable ? parseAssigneesFromTable(assigneeTable) : [],
    tasks,
    subtasks,
  );
  const assigneeByName = new Map(assignees.map((assignee) => [assignee.name, assignee]));

  return {
    markdown,
    tables,
    taskTable,
    assigneeTable,
    subtaskTable,
    tasks,
    subtasks,
    assignees,
    assigneeByName,
    subtasksByTask: groupBy(subtasks, (subtask) => subtask.task),
  };
}

export function buildGanttTasks(project) {
  return project.tasks.map((task) => {
    const subtasks = project.subtasksByTask.get(task.id) ?? [];
    const progress = subtasks.length === 0
      ? task.progress
      : Math.round((subtasks.filter((subtask) => subtask.done).length / subtasks.length) * 100);
    const assignee = project.assigneeByName.get(task.assignee);

    return {
      ...task,
      progress,
      hasSubtasks: subtasks.length > 0,
      subtasks,
      custom_class: assignee?.className ?? '',
    };
  });
}

export function updateTaskById(markdown, taskId, updates, fallbackLineIndex = null) {
  const project = parseProject(markdown);
  const rowLineIndex = findRowLineIndexById(project.taskTable, taskId, fallbackLineIndex);

  if (rowLineIndex === null) {
    throw new Error(`Could not find task row for "${taskId}".`);
  }

  return updateTableRow(markdown, project.taskTable, rowLineIndex, updates);
}

export function updateSubtaskById(markdown, subtaskId, updates) {
  const project = parseProject(markdown);

  if (!project.subtaskTable) {
    throw new Error('Add a subtask table before editing subtasks.');
  }

  const rowLineIndex = findRowLineIndexById(project.subtaskTable, subtaskId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find subtask row for "${subtaskId}".`);
  }

  return updateTableRow(markdown, project.subtaskTable, rowLineIndex, updates);
}

export function reorderTaskRows(markdown, orderedIds) {
  const project = parseProject(markdown);
  const lines = markdown.split('\n');
  const rowById = new Map(
    project.tasks.map((task) => [task.id, lines[task._markdownRowIndex]]),
  );
  const orderedRows = orderedIds.map((id) => rowById.get(id)).filter(Boolean);
  const remainingRows = project.tasks
    .filter((task) => !orderedIds.includes(task.id))
    .map((task) => lines[task._markdownRowIndex]);
  const sortedRows = [...orderedRows, ...remainingRows];

  project.taskTable.rowLineIndexes.forEach((lineIndex, index) => {
    lines[lineIndex] = sortedRows[index] ?? lines[lineIndex];
  });

  return lines.join('\n');
}

export function appendMarkdownTask(markdown) {
  const project = parseProject(markdown);
  const dates = getNewTaskDates(project);

  return appendRowToTable(markdown, project.taskTable, TASK_COLUMNS, {
    id: getNextTaskId(project),
    name: 'New task',
    start: dates.start,
    end: dates.end,
    progress: '0',
    dependencies: '',
    assignee: '',
  });
}

export function appendMarkdownSubtask(markdown, taskId) {
  const project = parseProject(markdown);

  if (!project.subtaskTable) {
    throw new Error('Add a subtask table with columns: id, task, name, done, assignee.');
  }

  return appendRowToTable(markdown, project.subtaskTable, SUBTASK_COLUMNS, {
    id: getNextSubtaskId(project, taskId),
    task: taskId,
    name: 'New subtask',
    done: 'false',
    assignee: '',
  });
}

function parseTasksFromTable(table) {
  const headers = canonicalHeaders(table);

  return table.rows.map((row, index) => {
    const task = rowToObject(headers, row);
    const id = task.id || slugify(task.name || task.task) || `task-${index + 1}`;
    const name = task.name || task.task || id;
    const start = normalizeDate(task.start, name, 'start');
    const end = normalizeDate(task.end, name, 'end');

    if (parseDateOnly(start) > parseDateOnly(end)) {
      throw new Error(`Task "${name}" starts after it ends.`);
    }

    return {
      id,
      name,
      start,
      end,
      progress: normalizeProgress(task.progress, name),
      dependencies: splitDependencies(task.dependencies).join(', '),
      assignee: task.assignee?.trim() ?? '',
      _markdownRowIndex: table.rowLineIndexes[index],
    };
  });
}

function parseAssigneesFromTable(table) {
  const headers = canonicalHeaders(table);

  return table.rows
    .map((row) => rowToObject(headers, row))
    .filter((assignee) => assignee.assignee?.trim())
    .map((assignee) => ({
      name: assignee.assignee.trim(),
      role: assignee.role?.trim() ?? '',
      color: normalizeColor(assignee.color),
    }));
}

function parseSubtasksFromTable(table, taskIds) {
  const headers = canonicalHeaders(table);

  return table.rows.map((row, index) => {
    const subtask = rowToObject(headers, row);
    const task = subtask.task?.trim();

    if (!taskIds.has(task)) {
      throw new Error(`Subtask "${subtask.name || index + 1}" belongs to unknown task: ${task}.`);
    }

    return {
      id: subtask.id || `${task}-subtask-${index + 1}`,
      task,
      name: subtask.name?.trim() || 'Untitled subtask',
      done: parseBoolean(subtask.done),
      assignee: subtask.assignee?.trim() ?? '',
    };
  });
}

function buildAssigneeDirectory(explicitAssignees, tasks, subtasks) {
  const byName = new Map();

  for (const assignee of explicitAssignees) {
    byName.set(assignee.name, assignee);
  }

  for (const item of [...tasks, ...subtasks]) {
    if (item.assignee && !byName.has(item.assignee)) {
      byName.set(item.assignee, { name: item.assignee, role: '', color: null });
    }
  }

  return [...byName.values()].map((assignee, index) => ({
    ...assignee,
    color: normalizeColor(assignee.color) ?? ASSIGNEE_PALETTE[index % ASSIGNEE_PALETTE.length],
    className: `assignee-${index}`,
  }));
}

function updateTableRow(markdown, table, rowLineIndex, updates) {
  const lines = markdown.split('\n');
  const row = splitMarkdownRow(lines[rowLineIndex]);
  const headers = canonicalHeaders(table);

  for (const [key, value] of Object.entries(updates)) {
    const columnIndex = headers.indexOf(key);

    if (columnIndex !== -1) {
      row[columnIndex] = String(value);
    }
  }

  lines[rowLineIndex] = formatMarkdownRow(row);
  return lines.join('\n');
}

function appendRowToTable(markdown, table, requiredColumns, rowData) {
  const missingColumns = requiredColumns.filter((column) => !canonicalHeaders(table).includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`Table is missing required columns: ${missingColumns.join(', ')}.`);
  }

  const lines = markdown.split('\n');
  const headers = canonicalHeaders(table);
  const row = headers.map((header) => rowData[header] ?? '');
  const insertIndex = table.rowLineIndexes.at(-1) + 1;

  lines.splice(insertIndex, 0, formatMarkdownRow(row));
  return lines.join('\n');
}

function getNextTaskId(project) {
  let index = project.tasks.length + 1;
  const ids = new Set(project.tasks.map((task) => task.id));

  while (ids.has(`task-${index}`)) {
    index += 1;
  }

  return `task-${index}`;
}

function getNextSubtaskId(project, taskId) {
  const count = project.subtasks.filter((subtask) => subtask.task === taskId).length + 1;
  let index = count;
  const ids = new Set(project.subtasks.map((subtask) => subtask.id));

  while (ids.has(`${taskId}-subtask-${index}`)) {
    index += 1;
  }

  return `${taskId}-subtask-${index}`;
}

function getNewTaskDates(project) {
  const latest = project.tasks.reduce(
    (date, task) => (parseDateOnly(task.end) > date ? parseDateOnly(task.end) : date),
    parseDateOnly(formatDate(new Date())),
  );
  const start = addDays(latest, 1);

  return {
    start: formatDate(start),
    end: formatDate(addDays(start, 2)),
  };
}

function validateTaskDependencies(tasks) {
  const ids = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    const missingDependencies = splitDependencies(task.dependencies).filter((id) => !ids.has(id));

    if (missingDependencies.length > 0) {
      throw new Error(`Task "${task.name}" depends on unknown id: ${missingDependencies.join(', ')}.`);
    }
  }
}

function findMarkdownTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isTableRow(lines[index]) || !isSeparatorRow(lines[index + 1])) {
      continue;
    }

    const rows = [];
    const rowLineIndexes = [];
    let rowIndex = index + 2;

    while (rowIndex < lines.length && isTableRow(lines[rowIndex])) {
      rows.push(splitMarkdownRow(lines[rowIndex]));
      rowLineIndexes.push(rowIndex);
      rowIndex += 1;
    }

    const headers = splitMarkdownRow(lines[index]);
    tables.push({
      headerLineIndex: index,
      separatorLineIndex: index + 1,
      headers,
      normalizedHeaders: headers.map(normalizeHeader),
      rows,
      rowLineIndexes,
    });
    index = rowIndex - 1;
  }

  return tables;
}

function findTaskTable(tables) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return headers.includes('start') && headers.includes('end') && (headers.includes('name') || headers.includes('task'));
  }) ?? null;
}

function findAssigneeTable(tables, taskTable) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return table !== taskTable && headers.includes('assignee') && (headers.includes('role') || headers.includes('color'));
  }) ?? null;
}

function findSubtaskTable(tables, taskTable) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return table !== taskTable && headers.includes('task') && headers.includes('name') && !headers.includes('start') && !headers.includes('end');
  }) ?? null;
}

function findRowLineIndexById(table, id, fallbackLineIndex = null) {
  if (Number.isInteger(fallbackLineIndex)) {
    return fallbackLineIndex;
  }

  const idColumnIndex = canonicalHeaders(table).indexOf('id');
  const rowIndex = table.rows.findIndex((row) => row[idColumnIndex] === id);

  return rowIndex === -1 ? null : table.rowLineIndexes[rowIndex];
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
}

function canonicalHeaders(table) {
  return table.normalizedHeaders.map((header) => HEADER_ALIASES[header] ?? header);
}

function normalizeHeader(header) {
  return String(header ?? '').trim().toLowerCase().replaceAll(/\s+/g, '-');
}

function normalizeDate(value, taskName, fieldName) {
  const text = String(value ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Task "${taskName}" has an invalid ${fieldName} date. Use YYYY-MM-DD.`);
  }

  return formatDate(parseDateOnly(text));
}

function normalizeProgress(value, taskName) {
  const progress = Number(String(value ?? '0').replace('%', '').trim() || '0');

  if (!Number.isFinite(progress)) {
    throw new Error(`Task "${taskName}" has an invalid progress value.`);
  }

  return Math.min(100, Math.max(0, Math.round(progress)));
}

function parseBoolean(value) {
  return ['true', 'yes', 'y', '1', 'done', 'x'].includes(String(value ?? '').trim().toLowerCase());
}

function splitDependencies(value) {
  return String(value ?? '')
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line ?? '');
}

function isSeparatorRow(line) {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line ?? '');
}

function splitMarkdownRow(line) {
  const trimmed = String(line ?? '').trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map((cell) => cell.trim());
}

function formatMarkdownRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function groupBy(items, getKey) {
  const grouped = new Map();

  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return grouped;
}

function normalizeColor(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}
