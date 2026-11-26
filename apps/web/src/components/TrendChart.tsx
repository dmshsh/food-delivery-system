'use client';

import { useId, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDate, formatKzt, formatNumber } from '@/lib/format';
import type { ChartSeries } from '@/lib/types';

/**
 * One measure over time.
 *
 * A line, because the question is how trade moves, and a line is the form that
 * shows a direction rather than a set of separate amounts. One series only:
 * two measures on two scales in one frame is the dual-axis chart, which invites
 * people to read a crossing point that means nothing.
 *
 * Drawn as plain SVG. A charting library would be more code to ship and more
 * to learn than the twenty lines of arithmetic below, and it would not know how
 * to read this project's theme variables.
 *
 * The numbers under the chart, the hover readout and the table view all come
 * from the same series, so no two of them can disagree.
 */
export default function TrendChart({ series }: { series: ChartSeries }) {
  const { t, lang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const gradientId = useId();

  const points = series.points;
  const money = series.unit === 'tiyn';
  const format = (value: number) => (money ? formatKzt(value, lang) : formatNumber(value, lang));

  // The plot area, in the SVG's own coordinates. A viewBox rather than pixels,
  // so the chart fits whatever width the page gives it.
  const width = 720;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const { path, area, dots, ticks, top } = useMemo(() => {
    const values = points.map((p) => p.value ?? 0);
    // The axis starts at zero: a line chart of money that starts at the lowest
    // value turns a 2% change into a cliff.
    const highest = Math.max(1, ...values);
    const top = niceCeiling(highest);

    const x = (index: number) =>
      pad.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => pad.top + plotHeight - (value / top) * plotHeight;

    const drawn = points.map((p, i) => ({ ...p, x: x(i), y: y(p.value ?? 0), index: i }));
    const line = drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const under =
      drawn.length > 0
        ? `${line} L${drawn[drawn.length - 1].x.toFixed(1)},${pad.top + plotHeight} L${drawn[0].x.toFixed(1)},${pad.top + plotHeight} Z`
        : '';

    return {
      path: line,
      area: under,
      dots: drawn,
      top,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        value: top * fraction,
        y: pad.top + plotHeight - fraction * plotHeight,
      })),
    };
  }, [points, plotHeight, plotWidth, pad.left, pad.top]);

  if (points.length === 0) return null;

  const active = hover === null ? null : dots[hover];
  // Only the ends and the highest point are labelled. A number on every point
  // is a table drawn badly.
  const peak = dots.reduce((best, d) => (d.value !== null && (best === null || d.value > (best.value ?? 0)) ? d : best), dots[0]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{t(`chart.${series.metric}` as 'chart.revenue')}</h3>
        <button type="button" className="btn-secondary" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? t('chart.title') : t('chart.readAsTable')}
        </button>
      </div>

      {asTable ? (
        // The same series as rows. Not a fallback for failure — some people read
        // numbers faster than shapes, and a screen reader has nothing else to go on.
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t(`chart.${series.metric}` as 'chart.revenue')}</caption>
            <thead className="bg-stone-100 text-left text-stone-700">
              <tr>
                <th className="px-3 py-2">{t('accounting.day')}</th>
                <th className="px-3 py-2 text-right">{t(`chart.${series.metric}` as 'chart.revenue')}</th>
                <th className="px-3 py-2 text-right">{t('chart.orders')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.bucket} className="border-t border-stone-100">
                  <td className="whitespace-nowrap px-3 py-1.5">{formatDate(p.bucket, lang)}</td>
                  <td className="px-3 py-1.5 text-right">{p.value === null ? '—' : format(p.value)}</td>
                  <td className="px-3 py-1.5 text-right">{p.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="mt-3 w-full"
            style={{ height: 'auto' }}
            role="img"
            aria-label={t('chart.pointLabel', {
              bucket: `${formatDate(series.from, lang)} – ${formatDate(series.to, lang)}`,
              value: format(series.summary.max),
            })}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--chart-line))" stopOpacity="0.22" />
                <stop offset="100%" stopColor="rgb(var(--chart-line))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid and axis labels: recessive, so the line is what the eye lands on. */}
            {ticks.map((tick) => (
              <g key={tick.y}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="rgb(var(--chart-grid))"
                  strokeWidth="1"
                />
                <text x={pad.left - 8} y={tick.y + 4} textAnchor="end" className="fill-stone-500 text-[11px]">
                  {money ? Math.round(tick.value / 100).toLocaleString() : Math.round(tick.value).toLocaleString()}
                </text>
              </g>
            ))}

            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={path}
              fill="none"
              stroke="rgb(var(--chart-line))"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* The crosshair follows the nearest point rather than the pointer. */}
            {active && (
              <line
                x1={active.x}
                x2={active.x}
                y1={pad.top}
                y2={pad.top + plotHeight}
                stroke="rgb(var(--chart-line))"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {dots.map((dot) => (
              <g key={dot.bucket}>
                {/* The visible mark is small; the target around it is not. */}
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={hover === dot.index ? 5 : 3}
                  fill="rgb(var(--chart-line))"
                  stroke="rgb(var(--white))"
                  strokeWidth="2"
                />
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={14}
                  fill="transparent"
                  onMouseEnter={() => setHover(dot.index)}
                  onFocus={() => setHover(dot.index)}
                  tabIndex={0}
                  role="img"
                  aria-label={t('chart.pointLabel', {
                    bucket: formatDate(dot.bucket, lang),
                    value: dot.value === null ? '—' : format(dot.value),
                  })}
                />
              </g>
            ))}

            {/* Three labels, not thirty: the two ends and the highest point. */}
            {[dots[0], peak, dots[dots.length - 1]]
              .filter((d, i, all) => d && all.indexOf(d) === i)
              .map((dot) => (
                <text
                  key={`label-${dot.bucket}`}
                  x={Math.min(Math.max(dot.x, pad.left + 20), width - pad.right - 20)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-stone-500 text-[11px]"
                >
                  {shortDate(dot.bucket, lang)}
                </text>
              ))}
          </svg>

          <p className="mt-1 min-h-[1.5rem] text-sm text-stone-700" aria-live="polite">
            {active
              ? t('chart.pointLabel', {
                  bucket: formatDate(active.bucket, lang),
                  value: active.value === null ? '—' : format(active.value),
                })
              : ''}
          </p>
        </>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-stone-200 pt-3 text-sm">
        <div>
          <dt className="text-xs text-stone-600">{t('chart.highest')}</dt>
          <dd className="font-medium">{format(series.summary.max)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-600">{t('chart.average')}</dt>
          <dd className="font-medium">{format(series.summary.average)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-600">{t('chart.lowest')}</dt>
          <dd className="font-medium">{format(series.summary.min)}</dd>
        </div>
      </dl>
      {money && <p className="mt-1 text-xs text-stone-500">KZT</p>}
    </div>
  );
}

/** A round number at or above the highest value, so the axis labels read well. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function shortDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'short' });
}
