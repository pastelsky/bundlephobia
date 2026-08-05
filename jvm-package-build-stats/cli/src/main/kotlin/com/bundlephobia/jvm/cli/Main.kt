package com.bundlephobia.jvm.cli

import kotlin.system.exitProcess

public fun main(args: Array<String>) {
    exitProcess(JvmPackageBuildStatsCli().execute(args))
}
