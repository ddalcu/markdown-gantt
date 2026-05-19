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
const LANE_PADDING_BOTTOM = 20;
const LAYER_GAP = 6;

const UNLANED_KEY = '__unlaned__';

export function layoutTasks(tasks, viewMode = 'Week', lanes = null) {
  const config = getViewConfig(viewMode);
  const range = getTimelineRange(tasks, viewMode);
  const laneMetaById = new Map((lanes ?? []).map((l) => [l.id, l]));
  const knownLaneIds = lanes && lanes.length > 0 ? new Set(lanes.map((l) => l.id)) : null;
  const laneOrder = buildLaneOrder(tasks, lanes);

  let yCursor = HEADER_HEIGHT;
  const barsById = new Map();
  const laneStrips = [];

  for (const laneKey of laneOrder) {
    const tasksInLane = tasks.filter((task) => resolveStripKey(task, knownLaneIds) === laneKey);
    const { bars: laneBars, stripHeight } = layoutLaneStrip(tasksInLane, yCursor, range, config);
    const meta = laneMetaById.get(laneKey);

    laneStrips.push({
      key: laneKey,
      name: laneKey === UNLANED_KEY ? 'Unlaned' : (meta?.name ?? laneKey),
      color: meta?.color ?? null,
      y: yCursor,
      height: stripHeight,
    });

    for (const bar of laneBars) {
      barsById.set(bar.id, bar);
    }

    yCursor += stripHeight;
  }

  const bars = tasks.map((task) => barsById.get(task.id));

  const stripHeights = laneStrips.map((s) => s.height);
  const sortStepPx =
    stripHeights.length === 0
      ? ROW_HEIGHT
      : Math.max(
          ROW_HEIGHT,
          Math.round(stripHeights.reduce((sum, height) => sum + height, 0) / stripHeights.length),
        );

  return {
    bars,
    config,
    dependencies: layoutDependencies(tasks, bars),
    height: yCursor + 20,
    laneStrips,
    range,
    rowHeight: ROW_HEIGHT,
    sortStepPx,
  };
}

function resolveStripKey(task, knownLaneIds = null) {
  const key = getLaneKey(task);
  if (!key) return UNLANED_KEY;
  if (knownLaneIds && !knownLaneIds.has(key)) return UNLANED_KEY;
  return key;
}

function buildLaneOrder(tasks, lanes) {
  if (lanes && lanes.length > 0) {
    const order = lanes.map((l) => l.id);
    const hasUnlaned = tasks.some((task) => !getLaneKey(task) || !order.includes(getLaneKey(task)));
    if (hasUnlaned) {
      order.push(UNLANED_KEY);
    }
    return order;
  }

  const order = [];
  const seen = new Set();
  for (const task of tasks) {
    const key = resolveStripKey(task);
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

export function getLaneKey(task) {
  return String(task?.lane ?? '').trim();
}

function layoutLaneStrip(tasksInLane, laneBaseY, range, config) {
  const layerById = assignOverlapLayers(tasksInLane);
  const maxLayer = Math.max(0, ...layerById.values());
  const layers = Array.from({ length: maxLayer + 1 }, () => []);

  for (const task of tasksInLane) {
    layers[layerById.get(task.id)].push(task);
  }

  let y = laneBaseY;
  const bars = [];

  for (let layerIndex = 0; layerIndex <= maxLayer; layerIndex += 1) {
    const inLayer = layers[layerIndex];
    let layerMaxHeight = 0;

    for (const task of inLayer) {
      const bar = createBar(task, y, range, config);
      layerMaxHeight = Math.max(layerMaxHeight, bar.height);
      bars.push(bar);
    }

    y += layerMaxHeight;

    if (layerIndex < maxLayer) {
      y += LAYER_GAP;
    }
  }

  const stripHeight = Math.max(
    ROW_HEIGHT,
    y - laneBaseY + LANE_PADDING_BOTTOM,
  );

  return { bars, stripHeight };
}

function createBar(task, y, range, config) {
  const x = Math.round(dateToX(parseDateOnly(task.start), range.start, config));
  const width = Math.max(
    10,
    Math.round(daysToPixels(inclusiveDays(task.start, task.end), config)),
  );
  const progress = clamp(Number(task.progress) || 0, 0, 100);
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const height = BAR_HEIGHT + subtasks.length * SUBTASK_HEIGHT;

  return {
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
}

function assignOverlapLayers(tasksInLane) {
  const sorted = [...tasksInLane].sort((a, b) => {
    const startCmp = parseDateOnly(a.start) - parseDateOnly(b.start);
    if (startCmp !== 0) {
      return startCmp;
    }

    return String(a.id).localeCompare(String(b.id));
  });

  const layers = [];
  const layerById = new Map();

  for (const task of sorted) {
    let placed = false;

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
      const peers = layers[layerIndex];
      const conflicts = peers.some((peer) => datesOverlap(peer, task));

      if (!conflicts) {
        peers.push(task);
        layerById.set(task.id, layerIndex);
        placed = true;
        break;
      }
    }

    if (!placed) {
      layers.push([task]);
      layerById.set(task.id, layers.length - 1);
    }
  }

  return layerById;
}

function datesOverlap(peer, task) {
  const a0 = parseDateOnly(peer.start);
  const a1 = parseDateOnly(peer.end);
  const b0 = parseDateOnly(task.start);
  const b1 = parseDateOnly(task.end);
  return a0 <= b1 && b0 <= a1;
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
