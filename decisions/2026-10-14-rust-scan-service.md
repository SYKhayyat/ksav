# The lexical facts cross the worker boundary

Issue #19 asked for the front-end lexer to move to Rust/WASM, but the editor has
two different needs. CodeMirror decorations and insertion decisions require a
synchronous answer inside an update or click handler; a worker round trip cannot
replace those paths. Bracket healing, however, already runs in the asynchronous
compile path, and export warnings already wait for an engine result.

The Rust service therefore owns the structural facts those asynchronous paths
need: comments and delimiters, including command names, structural classification,
recovery behavior, and JavaScript UTF-16 offsets. The TypeScript `analyze` function
continues to own the policy of how those facts become diagnostics and repairs. It
can consume either the local facts or the service response, so the policy is not
duplicated across the transport boundary.

`runCompile` asks the service before building its render plan and refuses stale
answers when a newer compile or document switch wins. Older engines and failed
requests fall back to the synchronous scanner rather than blanking the preview.
Export warnings use the same service with a document identity/text check before
updating the status bar. The decoration paths remain synchronous and local by
design; moving them would trade typing correctness for a worker latency.

The wire contract is versioned and validates its UTF-16 text length at the client
boundary. Rust unit and service tests cover astral characters, Hebrew offsets,
comments, strings, raw regions, escaped content, prose parentheses, hash calls,
incomplete groups, malformed closers, and malformed requests.
