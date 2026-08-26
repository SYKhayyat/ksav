import io, sys

p = 'src/backends/builtin_backends.toml'
s = open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
T = '\t'

old_lines = [
    "# Tab-separated `name version output store-path`. The third and fourth columns are the",
    "# output name and the store path, and neither is a version.",
    "[backend.fixture]",
    "source = \"UNVERIFIED: written from `guix package -I`'s documented four-column layout; no guix image was reachable\"",
    "list = '''",
    "hello" + T + "2.12" + T + "out" + T + "/gnu/store/xxxx-hello-2.12",
    "emacs" + T + "29.1" + T + "out" + T + "/gnu/store/yyyy-emacs-29.1",
    "'''",
    "expect = [",
    '    "hello@2.12",',
    '    "emacs@29.1",',
    "]",
]
old = nl.join(old_lines) + nl

new_lines = [
    "# Four columns, tab-separated -- `name version output store-path` -- and each field is PADDED",
    "# WITH SPACES to a column width before its tab. The literal shape is `hello    <TAB>2.12.3 <TAB>",
    "# out<TAB>...`, so a reader that split on the tab alone would carry `hello    ` as the name.",
    "# `ws_name_version` splits on whitespace and is right; the fixture below is the real bytes",
    "# rather than the tidy ones, because the tidy ones would have agreed with a wrong reader too.",
    "#",
    "# The third and fourth columns are the output name and the store path, and neither is a",
    "# version.",
    "[backend.fixture]",
    'source = "captured from `guix package -I` in metacall/guix:latest (guix 43833af) on 2026-08-14 -- the run that also closed this backend\'s proving.rs exemption"',
    "list = '''",
    "nss-certs" + T + "3.101.4" + T + "out" + T + "/gnu/store/v9i76lmhx0rlq46wyypv62wh2s3igqcf-nss-certs-3.101.4",
    "hello    " + T + "2.12.3 " + T + "out" + T + "/gnu/store/ab584kfyc7pymc1cmdrkwzz3lwv86yf6-hello-2.12.3",
    "sed      " + T + "4.9    " + T + "out" + T + "/gnu/store/w7cxnqm5g12jnn1nm86dapmc6l4k40aa-sed-4.9",
    "'''",
    "expect = [",
    '    "nss-certs@3.101.4",',
    '    "hello@2.12.3",',
    '    "sed@4.9",',
    "]",
]
new = nl.join(new_lines) + nl

if old not in s:
    sys.stderr.write("MISS: the guix fixture block did not match verbatim\n")
    i = s.find('name = "guix"')
    sys.stderr.write(s[i:i + 900] if i >= 0 else "guix row not found")
    raise SystemExit(1)

open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new, 1))
print("guix fixture replaced with captured output")
