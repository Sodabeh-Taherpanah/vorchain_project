# Start Here

You only need **this file**. The other files (`CLAUDE.md`, `AGENTS.md`, `README.md`) are read by Claude automatically. Don't touch them.

## Step 1: Open Claude Code in the project
In the Terminal:
```bash
cd ~/my_real_project/vorchain
claude
```

## Step 2: Copy and paste these messages into Claude, one at a time
Wait until each one is finished before sending the next. When Claude asks for permission to run a command, choose **Yes**.

**Message 1 (setup):**
```
Use the devops agent: set up my machine and this repo for development. Install Node LTS via nvm, enable pnpm with corepack, run git init -b main, and check that everything works. Ask me before each command. Then tell me what I still need to do manually.
```

**Message 2 (plan):**
```
Use the architect agent: Plan Phase 1
```

**Message 3 (tooling):**
```
Use the devops agent: Implement Task 0 and CI
```

**Message 4 (first task):**
```
Use the builder agent: Implement P1-01
```

**Message 5 (check the task):**
```
Use the qa agent: Verify P1-01
```

## Step 3: Repeat
Send messages 4 and 5 again with the next task number: `P1-02`, then `P1-03`, and so on.
The list of all tasks is in `docs/backlog.md` (created by message 2).

## To stop
Type `/exit`. Next time, start again from Step 1 and continue with the next task number.
