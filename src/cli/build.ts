export type PackageJson = {
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type SupportedBuilder = "astro" | "vite" | "storybook";

function runScriptArgs(packageManager: string, script: string, extraArgs: string[]): string[] {
  switch (packageManager) {
    case "yarn":
      return [script, ...extraArgs];
    case "bun":
      return ["run", script, ...extraArgs];
    default:
      return extraArgs.length > 0 ? ["run", script, "--", ...extraArgs] : ["run", script];
  }
}

export function buildCommand(packageManager: string, builder: SupportedBuilder, pkg: PackageJson, outDir: string): { command: string; args: string[] } {
  if (builder === "storybook") {
    const script = pkg.scripts?.["build-storybook"] ? "build-storybook" : "build";
    return { command: packageManager, args: runScriptArgs(packageManager, script, ["--output-dir", outDir]) };
  }
  if (builder === "astro") {
    return { command: packageManager, args: runScriptArgs(packageManager, "build", []) };
  }
  return {
    command: packageManager,
    args: runScriptArgs(packageManager, "build", ["--base=./", "--outDir", outDir])
  };
}
