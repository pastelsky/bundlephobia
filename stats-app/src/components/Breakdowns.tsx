import { Card } from '@tremor/react'
import {
  compactFormat,
  numberFormat,
  formatBytes,
  STATUS_LABELS,
} from '../format'
import type { SummaryData, ResourceData } from '../metrics'

const diskLabels = new Map([
  ['root', 'Main filesystem'],
  ['builds', 'Temporary builds'],
  ['metrics', 'VictoriaMetrics'],
])

export function ResponseBreakdown({ data }: { data?: SummaryData }) {
  const total =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0

  const rows =
    data?.responses
      .filter(row => row.count != null && row.count > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)) ?? []

  return (
    <Card className="breakdown-card">
      <div className="panel-heading">
        <div>
          <h2>Response breakdown</h2>
          <p>Count and share in the selected time range</p>
        </div>
        <span className="unit-label">
          {compactFormat.format(total)} responses
        </span>
      </div>
      <table className="response-table" aria-label="Responses by status class">
        <thead>
          <tr className="response-row table-heading">
            <th scope="col">Status class</th>
            <th scope="col">Distribution</th>
            <th scope="col">Responses</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr className="response-row" key={row.code}>
              <td className="response-label">
                <span className={`status-dot status-${row.code}`} />
                <strong>{row.code}</strong>
                <span>{STATUS_LABELS.get(row.code) ?? 'Other'}</span>
              </td>
              <td aria-label={`Distribution for ${row.code}`}>
                <span className="distribution">
                  <span
                    className={`distribution-fill status-${row.code}`}
                    style={{ width: `${((row.count ?? 0) / total) * 100}%` }}
                  />
                </span>
              </td>
              <td className="numeric">
                {numberFormat.format(Math.round(row.count ?? 0))}
              </td>
              <td className="numeric">
                {numberFormat.format(((row.count ?? 0) / total) * 100)}%
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-table">
                No response counts available yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

export function DiskBreakdown({ data }: { data?: ResourceData }) {
  return (
    <Card className="breakdown-card">
      <div className="panel-heading">
        <div>
          <h2>Filesystem capacity</h2>
          <p>
            Separate mounts for the website, temporary builds, and metrics
            storage
          </p>
        </div>
      </div>
      <table
        className="response-table capacity-table"
        aria-label="Filesystem capacity"
      >
        <thead>
          <tr className="response-row table-heading">
            <th scope="col">Filesystem</th>
            <th scope="col">Used</th>
            <th scope="col">Available</th>
            <th scope="col">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {data?.disks.map(disk => (
            <tr key={disk.mount} className="response-row">
              <td className="response-label">
                <strong>{diskLabels.get(disk.mount)}</strong>
              </td>
              {[disk.used, disk.available, disk.total].map((value, index) => (
                <td key={index} className="numeric">
                  {value == null ? '—' : formatBytes(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
