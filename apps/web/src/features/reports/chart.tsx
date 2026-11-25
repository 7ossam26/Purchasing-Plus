import {
  formatDate,
  formatDuration,
  formatNumber,
  formatReportValue,
  locale,
  type ReportChart,
} from '@purchasing-plus/shared';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

import { useTheme } from '../../lib/theme.js';

ChartJS.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
);

export function ReportPlot({ chart }: { chart: ReportChart }) {
  // Colours come from the theme tokens; re-render (and re-read them) when the theme switches.
  useTheme();
  const styles = getComputedStyle(document.documentElement);
  const timeline = chart.type === 'line';
  const color = (token: string) =>
    styles.getPropertyValue('--color-' + token).trim();
  const options: ChartOptions<'bar' | 'line'> = {
    animation: false,
    maintainAspectRatio: false,
    locale,
    plugins: {
      legend: {
        rtl: true,
        labels: { color: color('ink'), font: { family: 'Cairo Variable' } },
      },
      tooltip: {
        rtl: true,
        callbacks: {
          title: ([point]) =>
            point ? (chart.labels[point.dataIndex] ?? '') : '',
          label: ({ datasetIndex, dataIndex }) => {
            const series = chart.series[datasetIndex];
            if (!series) return '';
            return [
              series.label,
              formatReportValue(series.values[dataIndex], series.kind),
            ].join(' ');
          },
          afterLabel: ({ dataIndex }) =>
            chart.table.rows[dataIndex]?.supplier?.toString() ?? '',
        },
      },
    },
    scales: {
      x: {
        type: timeline ? 'linear' : 'category',
        reverse: true,
        grid: { display: false },
        ticks: {
          color: color('concrete'),
          maxTicksLimit: 7,
          maxRotation: 0,
          ...(timeline
            ? {
                callback: (value: number | string) => formatDate(Number(value)),
              }
            : {}),
        },
      },
      y: {
        beginAtZero: chart.type === 'bar',
        grid: { color: color('seam') },
        ticks: {
          color: color('concrete'),
          callback: (value) =>
            chart.series[0]?.kind === 'duration'
              ? formatDuration(Number(value))
              : formatNumber(value),
        },
      },
    },
  };
  return (
    <div
      aria-hidden="true"
      className="relative h-64 min-w-0 rounded-panel border border-seam bg-paper p-3 sm:h-80 sm:p-4"
    >
      <Chart
        type={chart.type}
        options={options}
        data={{
          labels: chart.labels,
          datasets: chart.series.map(({ label, values }, index) => ({
            label,
            data: timeline
              ? values.map((value, index) => ({
                  x: Date.parse(String(chart.table.rows[index]?.date)),
                  y: value === null ? NaN : Number(value),
                }))
              : values.map((value) => (value === null ? null : Number(value))),
            backgroundColor: color(index === 0 ? 'ppr' : 'concrete'),
            borderColor: color(index === 0 ? 'ppr' : 'concrete'),
            borderWidth: 2,
          })),
        }}
      />
    </div>
  );
}
