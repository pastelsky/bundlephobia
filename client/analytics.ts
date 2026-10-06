import { trackAmplitudeEvent } from './amplitude'
import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsRange,
} from '@bundlephobia/service-contracts/trends'

type TrendsContext = {
  packageCount: number
  metric: TrendsMetric
  range: TrendsRange
  groupBy: TrendsGroupBy
}

type TrendsSelection =
  | 'package_added'
  | 'package_removed'
  | 'metric'
  | 'range'
  | 'group_by'
  | 'major_releases'
  | 'minor_releases'

type TrendsLoadContext = {
  packageCount: number
  range: TrendsRange
  timeTaken: number
}

type AnalyticsValue = string | number | boolean | null | undefined

type AnalyticsEventData = Record<string, AnalyticsValue>

type HasPackageName = {
  packageName: string
}

type HasTimeTaken = {
  timeTaken: number
}

type HasIsDisabled = {
  isDisabled: boolean
}

type HasSuccessRatio = {
  successRatio: number
}

type HasPackageNameAndTimeTaken = HasPackageName & HasTimeTaken

export type PackageLoadSource =
  | 'page_load'
  | 'navigation'
  | 'search'
  | 'history'
  | 'scan'

type PackageLoadOutcome = HasPackageNameAndTimeTaken & {
  source: PackageLoadSource
}

type HasOpen = {
  open: boolean
}

type HasToolCount = {
  toolCount: number
}

type HasToolName = {
  toolName: string
}

type HasAction = {
  action: string
}

export default class Analytics {
  private static logEvent(eventName: string, eventData?: AnalyticsEventData) {
    trackAmplitudeEvent(eventName, eventData)
  }

  static pageView() {
    Analytics.logEvent('page_context_viewed')
  }

  static trendsDataLoaded(
    data: TrendsLoadContext & {
      downloadPackageCount: number
      starsPackageCount: number
      sizePackageCount: number
      warningPackageCount: number
    },
  ) {
    Analytics.logEvent('trends_data_loaded', data)
  }

  static trendsDataFailed(data: TrendsLoadContext) {
    Analytics.logEvent('trends_data_failed', data)
  }

  static trendsSelectionChanged(
    data: TrendsContext & {
      selection: TrendsSelection
      enabled?: boolean
    },
  ) {
    Analytics.logEvent('trends_selection_changed', data)
  }

  static trendsLinkCopied(data: TrendsContext) {
    Analytics.logEvent('trends_link_copied', data)
  }

  static trendsLinkCopyFailed(data: TrendsContext) {
    Analytics.logEvent('trends_link_copy_failed', data)
  }

  static performedSearch(packageName: string) {
    Analytics.logEvent('search_performed', {
      package: packageName,
    })
  }

  static packageLoadStarted(packageName: string, source: PackageLoadSource) {
    Analytics.logEvent('package_load_started', { package: packageName, source })
  }

  static packageResultViewed(packageName: string, source: PackageLoadSource) {
    Analytics.logEvent('package_result_viewed', {
      package: packageName,
      source,
    })
  }

  static searchSuccess({ packageName, timeTaken, source }: PackageLoadOutcome) {
    Analytics.logEvent('search_succeeded', {
      package: packageName,
      timeTaken,
      source,
    })
  }

  static searchFailure({ packageName, timeTaken, source }: PackageLoadOutcome) {
    Analytics.logEvent('search_failed', {
      package: packageName,
      timeTaken,
      source,
    })
  }

  static graphBarClicked({
    packageName,
    isDisabled,
  }: HasPackageName & HasIsDisabled) {
    Analytics.logEvent('bar_graph_clicked', {
      package: packageName,
      isDisabled,
    })
  }

  static trendsComparisonViewed(
    data: TrendsContext & {
      dataPackageCount: number
      warningPackageCount: number
    },
  ) {
    Analytics.logEvent('trends_comparison_viewed', data)
  }

  static scanPackageJsonDropped(itemCount: number) {
    Analytics.logEvent('scan_package_json_dropped', {
      itemCount,
    })
  }

  static performedScan() {
    Analytics.logEvent('scan_performed')
  }

  static scanParseError() {
    Analytics.logEvent('scan_parse_failed')
  }

  static scanCompleted({
    timeTaken,
    successRatio,
  }: HasTimeTaken & HasSuccessRatio) {
    Analytics.logEvent('scan_parse_completed', {
      successRatio,
      timeTaken,
    })
  }

  static performedExportsAnalysis(packageName: string) {
    Analytics.logEvent('exports_analysis_performed', {
      package: packageName,
    })
  }

  static exportsAnalysisSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('exports_analysis_succeeded', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsAnalysisFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('exports_analysis_failed', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('exports_size_calculated', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('exports_size_failed', {
      package: packageName,
      timeTaken,
    })
  }

  static mcpHeaderClicked({ open }: HasOpen) {
    Analytics.logEvent('mcp_header_clicked', {
      open,
    })
  }

  static mcpToolsListed({ toolCount }: HasToolCount) {
    Analytics.logEvent('mcp_tools_listed', {
      toolCount,
    })
  }

  static mcpToolCalled({ toolName }: HasToolName) {
    Analytics.logEvent('mcp_tool_called', {
      toolName,
    })
  }

  static mcpActionFailed({ action }: HasAction) {
    Analytics.logEvent('mcp_action_failed', {
      action,
    })
  }

  static mcpSetupSnippetCopied() {
    Analytics.logEvent('mcp_setup_snippet_copied')
  }

  static mcpDocsOpened() {
    Analytics.logEvent('mcp_docs_opened')
  }
}
