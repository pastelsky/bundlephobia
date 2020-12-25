export default class Analytics {
  static pageView(pageType) {
    amplitude.getInstance().logEvent(`Viewed ${pageType}`, {
      path: window.location.pathname,
    })
  }

  static performedSearch(packageName) {
    amplitude.getInstance().logEvent('Search Performed', {
      package: packageName,
    })
  }

  static searchSuccess({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Search Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static searchFailure({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Search Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static graphBarClicked({ packageName, isDisabled }) {
    amplitude.getInstance().logEvent('Bar Graph Clicked', {
      package: packageName,
      isDisabled,
    })
  }

  static scanPackageJsonDropped(itemCount) {
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

  static scanCompleted({ timeTaken, successRatio }) {
    amplitude.getInstance().logEvent('Scan Parse Completed', {
      successRatio,
      timeTaken,
    })
  }

  static performedExportsAnalysis(packageName) {
    amplitude.getInstance().logEvent('Exports Analysis Performed', {
      package: packageName,
    })
  }

  static exportsAnalysisSuccess({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Exports Analysis Successful', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsAnalysisFailure({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Exports Analysis Failed', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesSuccess({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Exports Size Calculated', {
      package: packageName,
      timeTaken,
    })
  }

  static exportsSizesFailure({ packageName, timeTaken }) {
    amplitude.getInstance().logEvent('Exports Size Failed', {
      package: packageName,
      timeTaken,
    })
  }
}
