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
  static pageView(pageType: string) {
    amplitude.getInstance().logEvent(`Viewed ${pageType}`, {
      path: window.location.pathname,
    })
  }

  static performedSearch(packageName: string) {
    amplitude.getInstance().logEvent('Search Performed', {
      package: packageName,
    })
  }

  static searchSuccess({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Search Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static searchFailure({ packageName, timeTaken }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Search Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static graphBarClicked({
    packageName,
    isDisabled,
  }: HasPackageName & HasIsDisabled) {
    amplitude.getInstance().logEvent('Bar Graph Clicked', {
      package: packageName,
      isDisabled,
    })
  }

  static scanPackageJsonDropped(itemCount: number) {
    amplitude.getInstance().logEvent('Scan packageJSON dropped', {
      itemCount,
    })
  }

  static performedScan() {
    amplitude.getInstance().logEvent('Scan Performed')
  }

  static scanParseError() {
    amplitude.getInstance().logEvent('Scan Parse Error')
  }

  static scanCompleted({
    timeTaken,
    successRatio,
  }: HasTimeTaken & HasSuccessRatio) {
    amplitude.getInstance().logEvent('Scan Parse Completed', {
      successRatio,
      timeTaken,
    })
  }

  static performedExportsAnalysis(packageName: string) {
    amplitude.getInstance().logEvent('Exports Analysis Performed', {
      package: packageName,
    })
  }

  static exportsAnalysisSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Exports Analysis Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsAnalysisFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Exports Analysis Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesSuccess({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Exports Size Calculated', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesFailure({
    packageName,
    timeTaken,
  }: HasPackageNameAndTimeTaken) {
    amplitude.getInstance().logEvent('Exports Size Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static mcpHeaderClicked({ open }: HasOpen) {
    amplitude.getInstance().logEvent('MCP Header Clicked', {
      open,
    })
  }

  static mcpToolsListed({ toolCount }: HasToolCount) {
    amplitude.getInstance().logEvent('MCP Tools Listed', {
      toolCount,
    })
  }

  static mcpToolCalled({ toolName }: HasToolName) {
    amplitude.getInstance().logEvent('MCP Tool Called', {
      toolName,
    })
  }

  static mcpActionFailed({ action }: HasAction) {
    amplitude.getInstance().logEvent('MCP Action Failed', {
      action,
    })
  }

  static mcpSetupSnippetCopied() {
    amplitude.getInstance().logEvent('MCP Setup Snippet Copied')
  }

  static mcpDocsOpened() {
    amplitude.getInstance().logEvent('MCP Docs Opened')
  }
}
