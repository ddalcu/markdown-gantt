import {
  dateToX,
  daysToPixels,
  getTimelineRange,
  getViewConfig,
  inclusiveDays,
  parseDateOnly,
} from './timeline.js';

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 72;
const BAR_HEIGHT = 24;
const SUBTASK_HEIGHT = 18;
const BAR_RADIUS = 8;

export function layoutTasks(tasks, viewMode = 'Week') {
  const config = getViewConfig(viewMode);
  const range = getTimelineRange(tasks, viewMode);
  let y = HEADER_HEIGHT;
  const bars = tasks.map((task, index) => {
    const x = Math.round(dateToX(parseDateOnly(task.start), range.start, config));
    const width = Math.max(
      10,
      Math.round(daysToPixels(inclusiveDays(task.start, task.end), config)),
    );
    const progress = clamp(Number(task.progress) || 0, 0, 100);
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const height = BAR_HEIGHT + subtasks.length * SUBTASK_HEIGHT;
    const bar = {
      id: task.id,
      task,
      x,
      y,
      width,
      height,
      radius: BAR_RADIUS,
      progress,
      progressWidth: Math.round((width * progress) / 100),
      customClass: task.custom_class ?? '',
      hasSubtasks: Boolean(task.hasSubtasks),
      subtasks,
    };

    y += Math.max(ROW_HEIGHT, height + 20);
    return bar;
  });

  return {
    bars,
    config,
    dependencies: layoutDependencies(tasks, bars),
    height: y + 20,
    range,
    rowHeight: ROW_HEIGHT,
  };
}

export function layoutDependencies(tasks, bars) {
  const barsById = new Map(bars.map((bar) => [bar.id, bar]));
  const connectors = [];

  for (const task of tasks) {
    for (const dependencyId of splitDependencies(task.dependencies)) {
      const from = barsById.get(dependencyId);
      const to = barsById.get(task.id);

      if (!from || !to) {
        continue;
      }

      connectors.push({
        from: dependencyId,
        to: task.id,
        points: {
          startX: from.x + from.width,
          startY: from.y + from.height / 2,
          endX: to.x,
          endY: to.y + to.height / 2,
        },
      });
    }
  }

  return connectors;
}

export function splitDependencies(value) {
  return String(value ?? '')
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
