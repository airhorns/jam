import { $, when, whenever } from "@jam/core";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { SessionManager } from "../networking/session-manager";

interface TerminalEntry {
  terminal: Terminal;
  host: HTMLElement;
  lastOutput: string;
  disposeInput: () => void;
}

const terminals = new Map<string, TerminalEntry>();

export function startTerminalEmulator(sessionManager: SessionManager) {
  function syncSoon() {
    window.requestAnimationFrame(syncTerminals);
  }

  function syncTerminals() {
    const terminalFacts = when(
      ["terminal", $.terminalId, "status", $.status],
      ["terminal", $.terminalId, "output", $.output],
    );
    const activeTerminalIds = new Set<string>();

    for (const { terminalId, output } of terminalFacts) {
      const id = terminalId as string;
      activeTerminalIds.add(id);
      const host = document.getElementById(`terminal-host-${id}`);
      if (!host) continue;

      let entry = terminals.get(id);
      if (!entry || entry.host !== host) {
        entry?.disposeInput();
        entry?.terminal.dispose();

        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
          fontSize: 12,
          rows: 8,
          theme: {
            background: "#0d1117",
            foreground: "#c9d1d9",
            cursor: "#58a6ff",
            selectionBackground: "#264f78",
          },
        });
        terminal.open(host);
        const input = terminal.onData((data) => {
          void sessionManager.sendTerminalInput(id, data);
        });

        entry = {
          terminal,
          host,
          lastOutput: "",
          disposeInput: () => input.dispose(),
        };
        terminals.set(id, entry);
      }

      const text = (output as string | undefined) ?? "";
      if (text === entry.lastOutput) continue;
      if (text.startsWith(entry.lastOutput)) {
        entry.terminal.write(text.slice(entry.lastOutput.length));
      } else {
        entry.terminal.reset();
        entry.terminal.write(text);
      }
      entry.lastOutput = text;
    }

    for (const [id, entry] of terminals) {
      if (activeTerminalIds.has(id)) continue;
      entry.disposeInput();
      entry.terminal.dispose();
      terminals.delete(id);
    }
  }

  const disposers = [
    whenever(
      [
        ["terminal", $.terminalId, "status", $.status],
        ["terminal", $.terminalId, "output", $.output],
      ],
      syncSoon,
    ),
    whenever([["ui", "selectedTerminal", $.terminalId]], syncSoon),
  ];

  syncSoon();

  return () => {
    for (const dispose of disposers) dispose();
    for (const entry of terminals.values()) {
      entry.disposeInput();
      entry.terminal.dispose();
    }
    terminals.clear();
  };
}
