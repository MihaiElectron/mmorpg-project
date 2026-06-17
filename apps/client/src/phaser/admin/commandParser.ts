export type ParsedCommand = {
  name: string;
  args: string[];
  flags: Record<string, string>;
};

/**
 * Parse une commande de la forme :
 *   /commande arg1 arg2 --flag=valeur --bool
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const tokens = trimmed.slice(1).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const name = tokens[0].toLowerCase();
  const args: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("--")) {
      const eqIdx = tok.indexOf("=");
      if (eqIdx !== -1) {
        flags[tok.slice(2, eqIdx)] = tok.slice(eqIdx + 1);
      } else {
        flags[tok.slice(2)] = "true";
      }
    } else {
      args.push(tok);
    }
  }

  return { name, args, flags };
}
