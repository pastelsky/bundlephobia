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

export default class Analytics {
  private static logEvent(
    eventName: string,
    eventProperties?: Record<string, unknown>
  ) {
    if (typeof amplitude !== 'undefined') {
      amplitude.getInstance().logEvent(eventName, eventProperties)
    }
  }

  static pageView(pageType: string) {
    Analytics.logEvent(`Viewed ${pageType}`, {
      path: window.location.pathname,
    })
  }

  static performedSearch(packageName: string) {
    Analytics.logEvent('Search Performed', {
      package: packageName,
    })
  }

  static searchSuccess({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Search Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static searchFailure({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Search Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static graphBarClicked({
    packageName,
    isDisabled,
  }: HasPackageName & HasIsDisabled) {
    Analytics.logEvent('Bar Graph Clicked', {
      package: packageName,
      isDisabled,
    })
  }

  static scanPackageJsonDropped(itemCount: number) {
    Analytics.logEvent('Scan packageJSON dropped', {
      itemCount,
    })
  }

  static performedScan() {
    Analytics.logEvent('Scan Performed')
  }

  static scanParseError() {
    Analytics.logEvent('Scan Parse Error')
  }

  static scanCompleted({
    timeTaken,
    successRatio,
  }: HasTimeTaken & HasSuccessRatio) {
    Analytics.logEvent('Scan Parse Completed', {
      successRatio,
      timeTaken,
    })
  }

  static performedExportsAnalysis(packageName: string) {
    Analytics.logEvent('Exports Analysis Performed', {
      package: packageName,
    })
  }

  static exportsAnalysisSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Exports Analysis Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsAnalysisFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Exports Analysis Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Exports Size Calculated', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    Analytics.logEvent('Exports Size Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static mcpHeaderClicked({ open }: HasOpen) {
    Analytics.logEvent('MCP Header Clicked', {
      open,
    })
  }

  static mcpToolsListed({ toolCount }: HasToolCount) {
    Analytics.logEvent('MCP Tools Listed', {
      toolCount,
    })
  }

  static mcpToolCalled({ toolName }: HasToolName) {
    Analytics.logEvent('MCP Tool Called', {
      toolName,
    })
  }

  static mcpActionFailed({ action }: HasAction) {
    Analytics.logEvent('MCP Action Failed', {
      action,
    })
  }

  static mcpSetupSnippetCopied() {
    Analytics.logEvent('MCP Setup Snippet Copied')
  }

  static mcpDocsOpened() {
    Analytics.logEvent('MCP Docs Opened')
  }
}
