import { addDays, formatDate, parseDateOnly } from './timeline.js';

export const TASK_COLUMNS = ['id', 'name', 'start', 'end', 'progress', 'dependencies', 'assignee'];
export const ASSIGNEE_COLUMNS = ['assignee', 'role', 'color'];
export const SUBTASK_COLUMNS = ['id', 'task', 'name', 'done', 'assignee'];
export const LANE_COLUMNS = ['id', 'name', 'color'];

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
  track: 'lane',
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

## Lanes

| id | name | color |
| --- | --- | --- |
| product | Product & Design | #087443 |
| engineering | Engineering | #3154d4 |

## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| discovery | Discovery and scope | 2026-05-07 | 2026-05-10 | 0 | | Maya | product |
| design | Design prototype | 2026-05-11 | 2026-05-16 | 0 | discovery | Leo | product |
| build | Build beta | 2026-05-17 | 2026-05-27 | 0 | design | Aisha | engineering |
| qa | QA and fixes | 2026-05-28 | 2026-06-03 | 0 | build | Quinn | engineering |
| launch | Launch prep | 2026-06-04 | 2026-06-07 | 20 | qa | Rowan | engineering |

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
  const laneTable = findLaneTable(tables, taskTable, assigneeTable, subtaskTable);
  const tasks = parseTasksFromTable(taskTable);
  validateTaskDependencies(tasks);
  const taskIds = new Set(tasks.map((task) => task.id));
  const subtasks = subtaskTable ? parseSubtasksFromTable(subtaskTable, taskIds) : [];
  const lanes = laneTable ? parseLanesFromTable(laneTable) : [];
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
    laneTable,
    tasks,
    subtasks,
    lanes,
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

export function collectTaskLaneOptions(project) {
  const lanes = new Set();
  const hasLaneTable = (project.lanes ?? []).length > 0;

  for (const lane of project.lanes ?? []) {
    lanes.add(lane.id);
  }

  if (!hasLaneTable) {
    for (const task of project.tasks) {
      const taskLane = String(task.lane ?? '').trim();
      if (taskLane) {
        lanes.add(taskLane);
      }
      lanes.add(task.id);
    }
  }

  return [...lanes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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

export function removeSubtaskById(markdown, subtaskId) {
  const project = parseProject(markdown);

  if (!project.subtaskTable) {
    throw new Error('No subtask table found.');
  }

  const rowLineIndex = findRowLineIndexById(project.subtaskTable, subtaskId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find subtask row for "${subtaskId}".`);
  }

  const lines = markdown.split('\n');
  lines.splice(rowLineIndex, 1);
  return lines.join('\n');
}

export function removeLaneRow(markdown, laneId) {
  const project = parseProject(markdown);

  if (!project.laneTable) {
    throw new Error('No lane table found.');
  }

  const rowLineIndex = findRowLineIndexById(project.laneTable, laneId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find lane row for "${laneId}".`);
  }

  let next = markdown;
  const headers = canonicalHeaders(project.taskTable);
  if (headers.includes('lane')) {
    for (const task of project.tasks) {
      if (task.lane === laneId) {
        next = updateTableRow(next, project.taskTable, task._markdownRowIndex, { lane: '' });
      }
    }
  }

  const refreshed = parseProject(next);
  const deleteIndex = findRowLineIndexById(refreshed.laneTable, laneId);
  if (deleteIndex === null) {
    throw new Error(`Could not find lane row for "${laneId}".`);
  }

  const lines = next.split('\n');
  lines.splice(deleteIndex, 1);
  return lines.join('\n');
}

export function updateLaneById(markdown, laneId, updates) {
  const project = parseProject(markdown);

  if (!project.laneTable) {
    throw new Error('No lane table found.');
  }

  const rowLineIndex = findRowLineIndexById(project.laneTable, laneId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find lane row for "${laneId}".`);
  }

  return updateTableRow(markdown, project.laneTable, rowLineIndex, updates);
}

export function removeMarkdownTask(markdown, taskId) {
  const project = parseProject(markdown);

  const rowLineIndex = findRowLineIndexById(project.taskTable, taskId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find task row for "${taskId}".`);
  }

  let next = markdown;

  // Remove subtasks belonging to this task (iterate in reverse line order to keep indices stable)
  const subtasks = project.subtasksByTask.get(taskId) ?? [];
  if (subtasks.length > 0 && project.subtaskTable) {
    const subtaskLineIndices = subtasks
      .map((s) => findRowLineIndexById(project.subtaskTable, s.id))
      .filter((i) => i !== null)
      .sort((a, b) => b - a);

    const lines = next.split('\n');
    for (const lineIndex of subtaskLineIndices) {
      lines.splice(lineIndex, 1);
    }
    next = lines.join('\n');
  }

  // Clean up dependency references to this task
  const refreshedForDeps = parseProject(next);
  for (const task of refreshedForDeps.tasks) {
    if (task.id === taskId) continue;

    const deps = splitDependencies(task.dependencies);
    if (!deps.includes(taskId)) continue;

    next = updateTableRow(next, refreshedForDeps.taskTable, task._markdownRowIndex, {
      dependencies: deps.filter((dependency) => dependency !== taskId).join(', '),
    });
  }

  const refreshed = parseProject(next);
  const deleteLineIndex = findRowLineIndexById(refreshed.taskTable, taskId);

  if (deleteLineIndex === null) {
    throw new Error(`Could not find task row for "${taskId}".`);
  }

  const lines = next.split('\n');
  lines.splice(deleteLineIndex, 1);
  return lines.join('\n');
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

export function reorderLaneRows(markdown, orderedIds) {
  const project = parseProject(markdown);

  if (!project.laneTable) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const rowById = new Map(
    project.lanes.map((lane) => [lane.id, lines[lane._markdownRowIndex]]),
  );
  const orderedRows = orderedIds.map((id) => rowById.get(id)).filter(Boolean);
  const remainingRows = project.lanes
    .filter((lane) => !orderedIds.includes(lane.id))
    .map((lane) => lines[lane._markdownRowIndex]);
  const sortedRows = [...orderedRows, ...remainingRows];

  project.laneTable.rowLineIndexes.forEach((lineIndex, index) => {
    lines[lineIndex] = sortedRows[index] ?? lines[lineIndex];
  });

  return lines.join('\n');
}

export function appendLaneRow(markdown) {
  const project = parseProject(markdown);

  if (!project.laneTable) {
    throw new Error('Add a lane table with columns: id, name, color.');
  }

  const existingIds = new Set(project.lanes.map((l) => l.id));
  let index = project.lanes.length + 1;
  while (existingIds.has(`lane-${index}`)) {
    index += 1;
  }

  const newLaneId = `lane-${index}`;
  const updated = appendRowToTable(markdown, project.laneTable, LANE_COLUMNS, {
    id: newLaneId,
    name: 'New lane',
    color: '',
  });

  return { markdown: updated, newLaneId };
}

export function appendMarkdownTask(markdown) {
  const project = parseProject(markdown);
  const dates = getNewTaskDates(project);
  const newTaskId = getNextTaskId(project);

  const updated = appendRowToTable(markdown, project.taskTable, TASK_COLUMNS, {
    id: newTaskId,
    name: 'New task',
    start: dates.start,
    end: dates.end,
    progress: '0',
    dependencies: '',
    assignee: '',
  });

  return { markdown: updated, newTaskId };
}

export function appendMarkdownTaskAfter(markdown, afterTaskId, lane) {
  const withLane = ensureTaskLaneColumn(markdown);
  const project = parseProject(withLane);
  const rowLineIndex = findRowLineIndexById(project.taskTable, afterTaskId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find task row for "${afterTaskId}".`);
  }

  const anchor = project.tasks.find((task) => task.id === afterTaskId);

  if (!anchor) {
    throw new Error(`Could not find task "${afterTaskId}".`);
  }

  const table = project.taskTable;
  const headers = canonicalHeaders(table);
  const missingColumns = TASK_COLUMNS.filter((column) => !headers.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`Table is missing required columns: ${missingColumns.join(', ')}.`);
  }

  const anchorEnd = parseDateOnly(anchor.end);
  const newStart = addDays(anchorEnd, 1 + 2);
  const newEnd = addDays(newStart, 4);
  const newId = getNextTaskId(project);
  const rowData = {
    id: newId,
    name: 'New task',
    start: formatDate(newStart),
    end: formatDate(newEnd),
    progress: '0',
    dependencies: afterTaskId,
    assignee: anchor.assignee?.trim() ?? '',
    lane,
  };
  const row = headers.map((header) => String(rowData[header] ?? ''));
  const lines = withLane.split('\n');
  lines.splice(rowLineIndex + 1, 0, formatMarkdownRow(row));

  return { markdown: lines.join('\n'), newTaskId: newId };
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

    const laneCell = String(task.lane ?? '').trim();

    return {
      id,
      name,
      start,
      end,
      progress: normalizeProgress(task.progress, name),
      dependencies: splitDependencies(task.dependencies).join(', '),
      assignee: task.assignee?.trim() ?? '',
      lane: laneCell,
      _markdownRowIndex: table.rowLineIndexes[index],
    };
  });
}

export function ensureTaskLaneColumn(markdown) {
  const project = parseProject(markdown);
  const table = project.taskTable;
  const headersCanon = canonicalHeaders(table);

  if (headersCanon.includes('lane')) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const nh = table.normalizedHeaders.map((header) => HEADER_ALIASES[header] ?? header);
  const assigneeIdx = nh.indexOf('assignee');
  const insertPos = assigneeIdx >= 0 ? assigneeIdx + 1 : nh.length;

  const newHeaders = [...table.headers];
  newHeaders.splice(insertPos, 0, 'lane');
  lines[table.headerLineIndex] = formatMarkdownRow(newHeaders);

  const sepCells = splitMarkdownRow(lines[table.separatorLineIndex]);
  sepCells.splice(insertPos, 0, '---');
  lines[table.separatorLineIndex] = formatMarkdownRow(sepCells);

  for (let index = 0; index < table.rows.length; index += 1) {
    const row = [...table.rows[index]];
    const lineIndex = table.rowLineIndexes[index];
    row.splice(insertPos, 0, '');
    lines[lineIndex] = formatMarkdownRow(row);
  }

  return lines.join('\n');
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

function findLaneTable(tables, taskTable, assigneeTable, subtaskTable) {
  const claimed = new Set([taskTable, assigneeTable, subtaskTable].filter(Boolean));
  return tables.find((table) => {
    if (claimed.has(table)) return false;
    const headers = table.normalizedHeaders;
    return headers.includes('id') && headers.includes('name') && headers.includes('color');
  }) ?? null;
}

function parseLanesFromTable(table) {
  const headers = canonicalHeaders(table);
  return table.rows.map((row, index) => {
    const lane = rowToObject(headers, row);
    return {
      id: String(lane.id ?? '').trim(),
      name: String(lane.name ?? '').trim(),
      color: normalizeColor(lane.color),
      _markdownRowIndex: table.rowLineIndexes[index],
    };
  }).filter((lane) => lane.id);
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
