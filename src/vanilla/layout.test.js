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
    expect(result.bars[1]).toMatchObject({ x: 200, width: 40, y: 116, progressWidth: 0 });
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
});
