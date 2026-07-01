# LPS - Local Process

LPS is a macOS local process monitor. It opens a dark localhost GUI where you can watch running processes in real time, inspect local server links, manage startup commands, and stop selected processes when needed.

Everything is installed, configured, and started with the `lps` CLI.

## Installation

```sh
curl -fsSL https://github.com/OWNER/REPO/releases/latest/download/install.sh | bash
```

## Initial Setup

Run:

```sh
lps
```

The first run opens a step-by-step setup flow in your terminal.

Use:

- Up and Down arrows to move
- Left and Right arrows to change language
- Enter to toggle or save
- `b` to go back
- Escape or `q` to quit

You can set:

- Language
- Open GUI automatically when LPS starts
- Start LPS automatically when macOS logs in
- Automatic update checks
- AI CLI status visibility

Startup command management in the GUI is available only when auto start is enabled.

## GUI Usage

Open the GUI:

```sh
lps open
```

Default address:

```text
http://127.0.0.1:3737
```

To make `http://localhost` open the GUI through Nginx:

```sh
lps nginx on
```

In the GUI, you can:

- View live CPU, memory, process count, and update time
- Browse all running processes
- Open local server links such as `http://127.0.0.1:3000`
- Sort the process list by clicking a column header
- Pause and resume automatic refresh
- Select rows with Up and Down, then press Enter to terminate
- See the current version and install updates when available

## Commands

```sh
lps                 # Run setup if needed, then start the GUI
lps start           # Start the GUI server in the background
lps serve           # Run the GUI server in the foreground
lps stop            # Stop the background server
lps restart         # Restart the background server
lps open            # Open the GUI in your browser
lps status          # Show current status
lps setting         # Open the settings UI
lps version         # Print the current version
lps update check    # Check for the latest GitHub Release
lps update          # Install the latest release and restart
lps startup list    # List startup commands and latest results
lps startup add "Name" "command" [priority] [cwd]
lps startup edit <id> name=... command=... priority=... cwd=... enabled=true
lps startup enable <id>
lps startup disable <id>
lps startup delete <id>
lps nginx on        # Proxy http://localhost to the GUI
lps nginx off       # Remove the localhost proxy
lps nginx status    # Show localhost proxy status
lps autostart on    # Enable macOS login auto start
lps autostart off   # Disable macOS login auto start
```
