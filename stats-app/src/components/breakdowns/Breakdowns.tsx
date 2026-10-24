import {
  type Color,
  Badge,
  Card,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@tremor/react'
import {
  compactFormat,
  numberFormat,
  formatBytes,
  STATUS_LABELS,
} from '../../lib/format'
import type { SummaryData, ResourceData } from '../../dashboard/metrics'
import { PanelHeader } from '../ui/PanelHeader'
import styles from './Breakdowns.module.css'

const diskLabels = new Map([
  ['root', 'Main filesystem'],
  ['builds', 'Temporary builds'],
  ['metrics', 'VictoriaMetrics'],
])

const statusColors = new Map<string, Color>([
  ['1xx', 'slate'],
  ['2xx', 'emerald'],
  ['3xx', 'sky'],
  ['4xx', 'amber'],
  ['5xx', 'rose'],
  ['other', 'stone'],
])

export function ResponseBreakdown({ data }: { data?: SummaryData }) {
  const total =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0

  const rows =
    data?.responses
      .filter(row => row.count != null && row.count > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)) ?? []

  return (
    <Card className={styles.card}>
      <PanelHeader
        title="Response breakdown"
        description="Count and share in the selected time range"
        unit={`${compactFormat.format(total)} responses`}
      />
      <Table className={styles.table} aria-label="Responses by status class">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Status class</TableHeaderCell>
            <TableHeaderCell>Distribution</TableHeaderCell>
            <TableHeaderCell className="text-right">Responses</TableHeaderCell>
            <TableHeaderCell className="text-right">Share</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.code}>
              <TableCell>
                <div className={styles.status}>
                  <Badge
                    size="xs"
                    color={statusColors.get(row.code) ?? 'stone'}
                  >
                    {row.code}
                  </Badge>
                  <span>{STATUS_LABELS.get(row.code) ?? 'Other'}</span>
                </div>
              </TableCell>
              <TableCell>
                <ProgressBar
                  value={((row.count ?? 0) / total) * 100}
                  color={statusColors.get(row.code) ?? 'stone'}
                  aria-label={`Distribution for ${row.code}`}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {numberFormat.format(Math.round(row.count ?? 0))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {numberFormat.format(((row.count ?? 0) / total) * 100)}%
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center">
                No response counts available yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

export function DiskBreakdown({ data }: { data?: ResourceData }) {
  return (
    <Card className={styles.card}>
      <PanelHeader
        title="Filesystem capacity"
        description="Separate mounts for the website, temporary builds, and metrics storage"
      />
      <Table className={styles.table} aria-label="Filesystem capacity">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Filesystem</TableHeaderCell>
            <TableHeaderCell className="text-right">Used</TableHeaderCell>
            <TableHeaderCell className="text-right">Available</TableHeaderCell>
            <TableHeaderCell className="text-right">Capacity</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data?.disks.map(disk => (
            <TableRow key={disk.mount}>
              <TableCell>{diskLabels.get(disk.mount)}</TableCell>
              {[disk.used, disk.available, disk.total].map((value, index) => (
                <TableCell key={index} className="text-right tabular-nums">
                  {value == null ? '—' : formatBytes(value)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
