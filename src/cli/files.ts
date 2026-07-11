import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { lookup } from "mime-types";
import { ALLOWED_EXTENSIONS, normalizePreviewPath } from "../shared.js";

export type InputFile = {
  absolutePath: string;
  previewPath: string;
  size: number;
  mime: string;
};

export type UnsupportedInputFile = {
  previewPath: string;
  reason: string;
};

export class UnsupportedFilesError extends Error {
  constructor(readonly files: UnsupportedInputFile[]) {
    super("Unsupported files were found");
  }
}

const IGNORED_FILE_NAMES = new Set([
  ".DS_Store",
  ".gitkeep",
  "Thumbs.db",
  "desktop.ini"
]);

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules"
]);

function shouldIgnoreEntry(name: string, isDirectory: boolean): boolean {
  return isDirectory ? IGNORED_DIRECTORY_NAMES.has(name) : IGNORED_FILE_NAMES.has(name);
}

async function walkDirectory(root: string, current: string, output: InputFile[], unsupported: UnsupportedInputFile[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(root, absolutePath, output, unsupported);
      continue;
    }
    if (!entry.isFile()) continue;
    const file = await describeFile(root, absolutePath);
    if ("reason" in file) {
      unsupported.push(file);
    } else {
      output.push(file);
    }
  }
}

async function describeFile(root: string, absolutePath: string): Promise<InputFile | UnsupportedInputFile> {
  const previewPath = normalizePreviewPath(path.relative(root, absolutePath));
  const extension = path.extname(previewPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { previewPath, reason: extension ? `unsupported extension ${extension}` : "missing extension" };
  }
  const info = await stat(absolutePath);
  return {
    absolutePath,
    previewPath,
    size: info.size,
    mime: lookup(previewPath) || "application/octet-stream"
  };
}

export async function collectInputFiles(inputPath: string, options: { ignoreUnsupported?: boolean } = {}): Promise<{ root: string; files: InputFile[]; entrypoint: string }> {
  const absolute = path.resolve(inputPath);
  const info = await stat(absolute);
  const files: InputFile[] = [];
  const unsupported: UnsupportedInputFile[] = [];

  if (info.isDirectory()) {
    await walkDirectory(absolute, absolute, files, unsupported);
  } else if (info.isFile()) {
    if (shouldIgnoreEntry(path.basename(absolute), false)) throw new Error("No uploadable files found");
    const file = await describeFile(path.dirname(absolute), absolute);
    if ("reason" in file) {
      unsupported.push(file);
    } else {
      files.push(file);
    }
  } else {
    throw new Error(`${inputPath} is not a file or directory`);
  }

  if (unsupported.length > 0 && !options.ignoreUnsupported) throw new UnsupportedFilesError(unsupported);
  if (files.length === 0) throw new Error("No uploadable files found");
  files.sort((a, b) => a.previewPath.localeCompare(b.previewPath));

  const entrypoint = files.some((file) => file.previewPath === "index.html")
    ? "index.html"
    : files.find((file) => file.previewPath.endsWith(".html"))?.previewPath;
  if (!entrypoint) throw new Error("No HTML entrypoint found");

  return { root: info.isDirectory() ? absolute : path.dirname(absolute), files, entrypoint };
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
