function runScriptArgs(packageManager, script, extraArgs) {
    switch (packageManager) {
        case "yarn":
            return [script, ...extraArgs];
        case "bun":
            return ["run", script, ...extraArgs];
        default:
            return extraArgs.length > 0 ? ["run", script, "--", ...extraArgs] : ["run", script];
    }
}
export function buildCommand(packageManager, builder, pkg, outDir) {
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
