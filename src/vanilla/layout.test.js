import { describe, expect, it } from 'vitest';
import { layoutTasks } from './layout.js';

describe('vanilla gantt layout', () => {
  it('lays out bars with inclusive widths and stable row order', () => {
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-09', progress: 50 },
        { id: 'b', name: 'B', start: '2026-05-10', end: '2026-05-10', progress: 0 },
      ],
      'Day',
    );

    expect(result.bars.map((bar) => bar.id)).toEqual(['a', 'b']);
    expect(result.bars[0]).toMatchObject({ x: 80, width: 120, y: 72, progressWidth: 60 });
    // Both tasks are unlaned and non-overlapping so they share one strip at the same y
    expect(result.bars[1]).toMatchObject({ x: 200, width: 40, y: 72, progressWidth: 0 });
  });

  it('preserves custom classes and computes dependency connectors', () => {
    const result = layoutTasks(
      [
        {
          id: 'brief',
          name: 'Brief',
          start: '2026-05-07',
          end: '2026-05-09',
          progress: 100,
          custom_class: 'assignee-0',
        },
        {
          id: 'design',
          name: 'Design',
          start: '2026-05-10',
          end: '2026-05-12',
          progress: 0,
          dependencies: 'brief',
          custom_class: 'assignee-1',
        },
      ],
      'Week',
    );

    expect(result.bars[0].customClass).toBe('assignee-0');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]).toMatchObject({ from: 'brief', to: 'design' });
    expect(result.dependencies[0].points.startX).toBeGreaterThan(result.bars[0].x);
  });

  it('places tasks that share a lane on the same strip base when dates do not overlap', () => {
    const result = layoutTasks(
      [
        {
          id: 'a',
          name: 'A',
          start: '2026-05-07',
          end: '2026-05-08',
          progress: 0,
          lane: 'team',
        },
        {
          id: 'b',
          name: 'B',
          start: '2026-05-10',
          end: '2026-05-10',
          progress: 0,
          lane: 'team',
        },
      ],
      'Day',
    );

    expect(result.bars.find((bar) => bar.id === 'a')?.y).toBe(72);
    expect(result.bars.find((bar) => bar.id === 'b')?.y).toBe(72);
  });

  it('stacks overlapping tasks in the same lane on separate layers', () => {
    const result = layoutTasks(
      [
        {
          id: 'a',
          name: 'A',
          start: '2026-05-07',
          end: '2026-05-09',
          progress: 0,
          lane: 'team',
        },
        {
          id: 'b',
          name: 'B',
          start: '2026-05-08',
          end: '2026-05-10',
          progress: 0,
          lane: 'team',
        },
      ],
      'Day',
    );

    const ya = result.bars.find((bar) => bar.id === 'a')?.y ?? 0;
    const yb = result.bars.find((bar) => bar.id === 'b')?.y ?? 0;
    expect(yb).toBeGreaterThan(ya);
  });

  it('orders chart lanes by first appearance of each lane key', () => {
    const result = layoutTasks(
      [
        {
          id: 'secondLane',
          name: 'Second lane first in list',
          start: '2026-05-07',
          end: '2026-05-07',
          progress: 0,
          lane: 'lane-b',
        },
        {
          id: 'firstLane',
          name: 'First lane second in list',
          start: '2026-05-07',
          end: '2026-05-07',
          progress: 0,
          lane: 'lane-a',
        },
      ],
      'Day',
    );

    const ySecond = result.bars.find((bar) => bar.id === 'secondLane')?.y ?? 0;
    const yFirst = result.bars.find((bar) => bar.id === 'firstLane')?.y ?? 0;
    expect(ySecond).toBeLessThan(yFirst);
  });

  it('uses lane table order when lanes metadata is provided', () => {
    const lanes = [
      { id: 'design', name: 'Design', color: '#b54708' },
      { id: 'dev', name: 'Development', color: '#3154d4' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
        { id: 'b', name: 'B', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'design' },
      ],
      'Day',
      lanes,
    );

    const yA = result.bars.find((bar) => bar.id === 'a')?.y ?? 0;
    const yB = result.bars.find((bar) => bar.id === 'b')?.y ?? 0;
    expect(yB).toBeLessThan(yA);
  });

  it('puts unlaned tasks at the bottom when lanes are provided', () => {
    const lanes = [
      { id: 'dev', name: 'Development', color: '#3154d4' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
        { id: 'b', name: 'B', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: '' },
      ],
      'Day',
      lanes,
    );

    const yA = result.bars.find((bar) => bar.id === 'a')?.y ?? 0;
    const yB = result.bars.find((bar) => bar.id === 'b')?.y ?? 0;
    expect(yB).toBeGreaterThan(yA);
  });

  it('returns laneStrips metadata with y, height, name, color, and key', () => {
    const lanes = [
      { id: 'dev', name: 'Development', color: '#3154d4' },
      { id: 'design', name: 'Design', color: '#b54708' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
        { id: 'b', name: 'B', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'design' },
      ],
      'Day',
      lanes,
    );

    expect(result.laneStrips).toHaveLength(2);
    expect(result.laneStrips[0]).toMatchObject({ key: 'dev', name: 'Development', color: '#3154d4' });
    expect(result.laneStrips[1]).toMatchObject({ key: 'design', name: 'Design', color: '#b54708' });
    expect(result.laneStrips[0].y).toBe(72);
    expect(result.laneStrips[0].height).toBeGreaterThan(0);
    expect(result.laneStrips[1].y).toBeGreaterThan(result.laneStrips[0].y);
  });

  it('includes an unlaned strip in laneStrips when tasks have no lane', () => {
    const lanes = [
      { id: 'dev', name: 'Development', color: '#3154d4' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
        { id: 'b', name: 'B', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: '' },
      ],
      'Day',
      lanes,
    );

    const unlaned = result.laneStrips.find((strip) => strip.key === '__unlaned__');
    expect(unlaned).toBeDefined();
    expect(unlaned.name).toBe('Unlaned');
    expect(unlaned.color).toBeNull();
  });

  it('renders empty lanes that have no tasks', () => {
    const lanes = [
      { id: 'dev', name: 'Development', color: '#3154d4' },
      { id: 'design', name: 'Design', color: '#b54708' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
      ],
      'Day',
      lanes,
    );

    expect(result.laneStrips).toHaveLength(2);
    expect(result.laneStrips[1]).toMatchObject({ key: 'design', name: 'Design' });
    expect(result.laneStrips[1].height).toBeGreaterThan(0);
  });

  it('returns laneStrips from first-appearance when no lanes metadata is given', () => {
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'team' },
        { id: 'b', name: 'B', start: '2026-05-08', end: '2026-05-08', progress: 0, lane: 'solo' },
      ],
      'Day',
    );

    expect(result.laneStrips).toHaveLength(2);
    expect(result.laneStrips[0]).toMatchObject({ key: 'team', name: 'team' });
    expect(result.laneStrips[1]).toMatchObject({ key: 'solo', name: 'solo' });
  });

  it('puts tasks with unknown lane ids into the unlaned strip', () => {
    const lanes = [
      { id: 'dev', name: 'Development', color: '#3154d4' },
    ];
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'dev' },
        { id: 'b', name: 'B', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: 'nonexistent' },
      ],
      'Day',
      lanes,
    );

    expect(result.bars.every((bar) => bar != null)).toBe(true);
    const unlaned = result.laneStrips.find((strip) => strip.key === '__unlaned__');
    expect(unlaned).toBeDefined();
    const yA = result.bars.find((bar) => bar.id === 'a')?.y ?? 0;
    const yB = result.bars.find((bar) => bar.id === 'b')?.y ?? 0;
    expect(yB).toBeGreaterThan(yA);
  });

  it('groups all unlaned tasks into a single strip when no lanes metadata is given', () => {
    const result = layoutTasks(
      [
        { id: 'a', name: 'A', start: '2026-05-07', end: '2026-05-07', progress: 0, lane: '' },
        { id: 'b', name: 'B', start: '2026-05-08', end: '2026-05-08', progress: 0, lane: '' },
      ],
      'Day',
    );

    expect(result.laneStrips).toHaveLength(1);
    expect(result.laneStrips[0].key).toBe('__unlaned__');
    expect(result.bars[0].y).toBe(result.bars[1].y);
  });
});
