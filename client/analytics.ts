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
type HasAdPlacement = {
  placement: 'homepage' | 'package_result'
}
type HasAdUnavailableReason = HasAdPlacement & {
  reason: 'script_error' | 'creative_timeout'
}

export default class Analytics {
  private static logEvent(
    eventName: string,
    eventData?: Record<string, unknown>
  ) {
    if (typeof window !== 'undefined' && typeof amplitude !== 'undefined') {
      amplitude.getInstance().logEvent(eventName, eventData)
    }
  }

  static pageView(pageType: string) {
    Analytics.logEvent('page_context_viewed', {
      page_type: pageType,
    })
  }

  static performedSearch(packageName: string) {
    Analytics.logEvent('search_performed', {
      package: packageName,
    })
  }

  static searchSuccess({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('search_succeeded', {
      package: packageName,
      timeTaken,
    })
  }

  static searchFailure({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('search_failed', {
      package: packageName,
      timeTaken,
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

  static advertisementImpression({ placement }: HasAdPlacement) {
    Analytics.logEvent('advertisement_impression', { placement })
  }

  static advertisementUnavailable({
    placement,
    reason,
  }: HasAdUnavailableReason) {
    Analytics.logEvent('advertisement_unavailable', { placement, reason })
  }
}
