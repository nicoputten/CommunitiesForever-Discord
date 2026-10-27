// Log lines on stdout/stderr with a UTC timestamp. Event ids and counts only: never message content, tokens or
// Discord user ids (docs/ARCHITECTURE.md "Privacy").

export interface Log {
  info(text: string): void;
  error(text: string): void;
}

function line(text: string): string {
  return `${new Date().toISOString()} ${text}`;
}

export const consoleLog: Log = {
  info: (text) => console.log(line(text)),
  error: (text) => console.error(line(text)),
};
