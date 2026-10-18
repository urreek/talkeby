import { promises as fs } from "node:fs";
import path from "node:path";

import { mediaKind, PREVIEW_DIRECTORY } from "../../shared/assistant-media.mjs";

async function listPreviewFiles(directory, group) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !mediaKind(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    const stat = await fs.lstat(filename);
    if (stat.isFile() && !stat.isSymbolicLink()) files.push({ filename, group, size: stat.size, modified: stat.mtimeMs });
  }
  return files;
}

async function collectPreviewFiles(root, excludedGroups) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.name) || excludedGroups.has(entry.name)) continue;
    const directory = path.join(root, entry.name);
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || path.relative(root, await fs.realpath(directory)) !== entry.name) continue;
    files.push(...await listPreviewFiles(directory, entry.name));
  }
  return files.sort((left, right) => left.modified - right.modified || left.filename.localeCompare(right.filename));
}

export async function cleanupManagedPreviews(projectRoot, {
  retentionHours = 168, excludedGroups = new Set(), now = Date.now(),
} = {}) {
  const project = await fs.realpath(projectRoot);
  const root = path.join(project, PREVIEW_DIRECTORY);
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(project, await fs.realpath(root)) !== PREVIEW_DIRECTORY) return;
    const files = await collectPreviewFiles(root, excludedGroups);
    for (const file of files) {
      if (now - file.modified < retentionHours * 3_600_000) continue;
      const resolved = await fs.realpath(file.filename);
      if (path.relative(root, resolved) !== path.join(file.group, path.basename(file.filename))) continue;
      await fs.unlink(file.filename);
      try { await fs.rmdir(path.dirname(file.filename)); }
      catch (error) { if (!["ENOTEMPTY", "ENOENT", "EEXIST"].includes(error.code)) throw error; }
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
  }
}

export class PreviewRetention {
  constructor({ projects, getActiveGroups, options, log }) {
    this.projects = projects;
    this.getActiveGroups = getActiveGroups;
    this.options = options;
    this.log = log;
    this.timer = null;
    this.pending = null;
  }

  sweep() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      for (const root of new Set(this.projects.values())) {
        try { await cleanupManagedPreviews(root, { ...this.options, excludedGroups: this.getActiveGroups() }); }
        catch (error) { this.log?.warn({ code: error.code || "preview_cleanup_failed" }, "Preview cleanup failed; check workspace permissions."); }
      }
    })().finally(() => { this.pending = null; });
    return this.pending;
  }

  start() {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    await this.pending;
  }
}
