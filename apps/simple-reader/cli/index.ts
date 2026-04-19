#!/usr/bin/env node
import { defineCommand, runMain } from "citty"

import { authCommand } from "./commands/auth"
import { channelsCommand } from "./commands/channels"
import { feedsCommand } from "./commands/feeds"
import { outputCommand } from "./commands/output"
import { prefsCommand } from "./commands/prefs"
import { runCommand } from "./commands/run"
import { scheduleCommand } from "./commands/schedule"
import { statusCommand } from "./commands/status"

const main = defineCommand({
  meta: {
    name: "sr",
    version: "0.1.0",
    description: "simple-reader CLI — drives RSS + Signalist pipelines without Electron",
  },
  subCommands: {
    channels: channelsCommand,
    feeds: feedsCommand,
    run: runCommand,
    status: statusCommand,
    output: outputCommand,
    prefs: prefsCommand,
    auth: authCommand,
    schedule: scheduleCommand,
  },
})

runMain(main)
