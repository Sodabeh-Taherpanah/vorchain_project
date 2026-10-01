'use client';

/**
 * The drawer's projection chart (ADR-0011). Only `projection-drawer.tsx` imports this module, through
 * `next/dynamic`, so Recharts stays out of the initial `/demo` bundle (backlog P1-18 criterion 4).
 * Colours are CSS variables from `globals.css`, so the chart follows light and dark mode.
 */
import type { IsoDate, ProjectionSeries } from '@vorchain/engine';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatIsoDate } from './analysis-settings-model.ts';
import {
  chartRows,
  formatShortDate,
  receiptMarkers,
  type ReceiptMarker,
} from './projection-model.ts';

const COLOR = {
  erp: 'var(--chart-1)',
  realistic: 'var(--chart-2)',
  stockOut: 'var(--chart-3)',
  safety: 'var(--chart-5)',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
  surface: 'var(--popover)',
} as const;

const ERP_DASH = '6 4';
const SAFETY_DASH = '2 4';
const CHART_HEIGHT = 300;
// End-of-day stock holds until the next day's movements, so steps are the honest shape, and the
// shaded stock-out area then follows the realistic line exactly.
const CURVE = 'stepAfter';

const MARKER_STYLE: Record<ReceiptMarker['view'], { fill: string; stroke: string }> = {
  // Hollow for the promised date, filled for the realistic one: shape differs, not only colour.
  erp: { fill: COLOR.surface, stroke: COLOR.erp },
  realistic: { fill: COLOR.realistic, stroke: COLOR.surface },
};

export interface ProjectionChartProps {
  readonly series: ProjectionSeries;
}

/** ERP view dashed, realistic view solid, stock-out shaded, safety stock and PO markers. */
export function ProjectionChart({ series }: ProjectionChartProps) {
  const t = useTranslations('demo.report.drawer');
  const format = useFormatter();
  const locale = useLocale();
  const rows = chartRows(series);
  const tick = { fill: COLOR.axis, fontSize: 12 };
  const number = (value: unknown) => (typeof value === 'number' ? format.number(value) : '');
  return (
    <div className="space-y-3">
      <ComposedChart
        data={rows}
        responsive
        style={{ width: '100%', height: CHART_HEIGHT }}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        // The surrounding figure carries the text summary and the table is the keyboard path, so
        // the SVG itself is not a second, unnamed focus stop.
        accessibilityLayer={false}
      >
        <CartesianGrid stroke={COLOR.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={tick}
          stroke={COLOR.grid}
          tickFormatter={(date: IsoDate) => formatShortDate(date, locale)}
          minTickGap={16}
        />
        <YAxis
          tick={tick}
          stroke={COLOR.grid}
          tickFormatter={number}
          width="auto"
          label={{ value: t('axis.stock'), angle: -90, position: 'insideLeft', fill: COLOR.axis }}
        />
        <Tooltip
          labelFormatter={(date) =>
            typeof date === 'string' ? formatIsoDate(date as IsoDate, locale) : ''
          }
          formatter={number}
          contentStyle={{
            background: COLOR.surface,
            borderColor: COLOR.grid,
            color: 'var(--popover-foreground)',
            borderRadius: 'var(--radius)',
          }}
        />
        <Area
          dataKey="shortfall"
          type={CURVE}
          baseValue={0}
          stroke="none"
          fill={COLOR.stockOut}
          fillOpacity={0.2}
          tooltipType="none"
          isAnimationActive="auto"
        />
        <ReferenceLine y={0} stroke={COLOR.stockOut} ifOverflow="extendDomain" />
        <ReferenceLine
          y={series.safetyStock}
          stroke={COLOR.safety}
          strokeDasharray={SAFETY_DASH}
          ifOverflow="extendDomain"
        />
        <Line
          dataKey="realisticStock"
          name={t('legend.realistic')}
          type={CURVE}
          stroke={COLOR.realistic}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive="auto"
        />
        {/* Drawn last so its dashes stay visible where both views are equal. */}
        <Line
          dataKey="erpStock"
          name={t('legend.erp')}
          type={CURVE}
          stroke={COLOR.erp}
          strokeWidth={2}
          strokeDasharray={ERP_DASH}
          dot={false}
          isAnimationActive="auto"
        />
        {receiptMarkers(series).map((marker) => (
          <ReferenceDot
            key={`${marker.view}-${marker.date}`}
            x={marker.date}
            y={marker.stock}
            r={5}
            strokeWidth={2}
            {...MARKER_STYLE[marker.view]}
          />
        ))}
      </ComposedChart>
      <Legend safetyStock={series.safetyStock} />
    </div>
  );
}

/** An HTML legend: localized, wraps on small screens, and names every mark's encoding. */
function Legend({ safetyStock }: { readonly safetyStock: number }) {
  const t = useTranslations('demo.report.drawer.legend');
  const line = (stroke: string, dash?: string, width = 2) => (
    <svg aria-hidden width="24" height="10" className="shrink-0">
      <line
        x1="0"
        y1="5"
        x2="24"
        y2="5"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
      />
    </svg>
  );
  const dot = (view: ReceiptMarker['view']) => (
    <svg aria-hidden width="14" height="14" className="shrink-0">
      <circle cx="7" cy="7" r="5" strokeWidth="2" {...MARKER_STYLE[view]} />
    </svg>
  );
  const items = [
    { key: 'erp', icon: line(COLOR.erp, ERP_DASH), label: t('erp') },
    { key: 'realistic', icon: line(COLOR.realistic, undefined, 2.5), label: t('realistic') },
    {
      key: 'stockOut',
      icon: (
        <span
          aria-hidden
          className="inline-block h-2.5 w-6 shrink-0 bg-critical/20 ring-1 ring-critical"
        />
      ),
      label: t('stockOut'),
    },
    {
      key: 'safety',
      icon: line(COLOR.safety, SAFETY_DASH),
      label: t('safetyStock', { value: safetyStock }),
    },
    { key: 'erpReceipt', icon: dot('erp'), label: t('erpReceipt') },
    { key: 'realisticReceipt', icon: dot('realistic'), label: t('realisticReceipt') },
  ];
  return (
    <ul
      aria-label={t('label')}
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {item.icon}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
