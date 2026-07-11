const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;

export function terminalText(value: unknown): string {
  return String(value).replace(CONTROL_CHARACTER_PATTERN, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(2, "0");
    return `\\x${code}`;
  });
}
