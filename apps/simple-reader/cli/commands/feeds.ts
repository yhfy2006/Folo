import { defineCommand } from "citty"

import { addFeed, cleanupDeadYouTubeRss, listFeeds, removeFeed } from "../../main/services/feeds"
import { fail, printJson, printTable } from "../lib/output"
import { initRuntime } from "../lib/runtime"

const listCmd = defineCommand({
  meta: { name: "list", description: "List feeds, optionally filtered by channel" },
  args: {
    channel: { type: "string", description: "Channel id to filter by" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const feeds = listFeeds(args.channel || undefined)
    if (args.json) {
      printJson(feeds)
      return
    }
    printTable(
      feeds.map((f) => ({
        id: f.id.slice(0, 10),
        title: (f.title ?? "").slice(0, 40),
        url: f.url,
        error: f.error_message ? "!" : "",
      })),
      ["id", "title", "url", "error"],
    )
  },
})

const addCmd = defineCommand({
  meta: { name: "add", description: "Add a feed URL (optionally bound to a channel)" },
  args: {
    url: { type: "positional", required: true, description: "Feed URL" },
    channel: { type: "string", description: "Channel id to associate with" },
    title: { type: "string", description: "Override feed title" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const result = addFeed(args.url, {
      channelId: args.channel || undefined,
      title: args.title || undefined,
    })
    if (args.json) {
      printJson(result)
      return
    }
    const tag = result.alreadyExisted ? "existing" : "added"
    console.info(`[feeds] ${tag} feed ${result.feedId}`)
    if (result.groupId) console.info(`[feeds] linked to group ${result.groupId}`)
  },
})

const removeCmd = defineCommand({
  meta: { name: "remove", description: "Remove a feed by id" },
  args: {
    id: { type: "positional", required: true, description: "Feed id" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const result = removeFeed(args.id)
    if (args.json) {
      printJson(result)
      return
    }
    if (!result.removed) fail(`feed not found: ${args.id}`)
    console.info(`[feeds] removed ${args.id}`)
  },
})

const cleanupCmd = defineCommand({
  meta: {
    name: "cleanup",
    description: "Remove known-dead feeds (YouTube /feeds/videos.xml returns 404 globally)",
  },
  args: {
    "dead-youtube-rss": {
      type: "boolean",
      description: "Remove feeds that use youtube.com/feeds/videos.xml",
    },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    if (!args["dead-youtube-rss"]) {
      fail("pass --dead-youtube-rss (the only supported cleanup target right now)")
    }
    const result = cleanupDeadYouTubeRss()
    if (args.json) {
      printJson(result)
      return
    }
    console.info(`[feeds] removed ${result.removed} dead YouTube RSS feeds`)
    for (const url of result.urls) console.info(`  - ${url}`)
  },
})

export const feedsCommand = defineCommand({
  meta: { name: "feeds", description: "Manage RSS / YouTube feeds" },
  subCommands: {
    list: listCmd,
    add: addCmd,
    remove: removeCmd,
    cleanup: cleanupCmd,
  },
})
