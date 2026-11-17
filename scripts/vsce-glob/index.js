import { glob as search } from "glob";

// Keep vsce 4.1.0's file discovery options while using glob's matcher.
export const glob = (pattern, options) =>
  search(pattern, {
    cwd: options.cwd,
    nodir: options.onlyFiles,
    follow: options.followSymbolicLinks,
    fs: options.fs,
    nocase: options.caseSensitiveMatch === false,
    dot: options.dot,
    ignore: options.ignore,
    posix: true,
  });
