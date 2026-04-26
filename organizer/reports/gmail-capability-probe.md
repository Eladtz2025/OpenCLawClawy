# Gmail Capability Probe

Generated: 2026-04-26T19:59:48

mcporter local binary: True
mcporter people.getMe exit: 0
mcporter people.getMe output:
```

```
mcporter gmail.search exit: 1
mcporter gmail.search output:
```
mcporter.cmd : [mcporter] google-workspace appears offline (MCP error -32001: Request timed out).
At C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\probe-gmail-capabilities.ps1:19 char:15
+ ...   $search = & $mcporter call --server google-workspace --tool gmail.s ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: ([mcporter] goog...est timed out).:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
[mcporter] google-workspace appears offline (MCP error -32001: Request timed out).
[mcporter] MCP error -32001: Request timed out
McpError: MCP error -32001: Request timed out
    at McpError.fromError (file:///C:/Users/Itzhak/.openclaw/workspace/gmail-audit/node_modules/@modelcontextprotocol/s
dk/dist/esm/types.js:2048:16)
    at Timeout.timeoutHandler (file:///C:/Users/Itzhak/.openclaw/workspace/gmail-audit/node_modules/@modelcontextprotoc
ol/sdk/dist/esm/shared/protocol.js:713:58)
    at listOnTimeout (node:internal/timers:608:17)
    at process.processTimers (node:internal/timers:543:7) {
  code: -32001,
  data: { timeout: 60000 }
}
```
gws binary: False
