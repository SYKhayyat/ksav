p = 'src/core/adapter.rs'
s = open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'

def sub(old, new):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, 1)

sub(
    "    struct Row {" + nl
    + "        name: String," + nl
    + "        os: Option<String>," + nl
    + "        broken: Option<&'static str>," + nl
    + "    }",
    "    struct Row {" + nl
    + "        name: String," + nl
    + "        os: Option<String>," + nl
    + "        broken: Option<&'static str>," + nl
    + "        live: Option<String>," + nl
    + "    }",
)
sub(
    "    impl Detected for Row {" + nl
    + "        fn detect_command(&self) -> &str {" + nl
    + "            &self.name" + nl
    + "        }" + nl
    + "    }",
    "    impl Detected for Row {" + nl
    + "        fn detect_command(&self) -> &str {" + nl
    + "            &self.name" + nl
    + "        }" + nl
    + "        fn detect_file(&self) -> Option<&str> {" + nl
    + "            self.live.as_deref()" + nl
    + "        }" + nl
    + "    }",
)
sub(
    "        Row {" + nl
    + "            name: name.into()," + nl
    + "            os: os.map(str::to_string)," + nl
    + "            broken: None," + nl
    + "        }",
    "        Row {" + nl
    + "            name: name.into()," + nl
    + "            os: os.map(str::to_string)," + nl
    + "            broken: None," + nl
    + "            live: None," + nl
    + "        }",
)
sub(
    "            first_present(&rows, &|c| c == \"firewalld\").map(|r| r.name.as_str()),",
    "            first_present(&rows, &|c| c == \"firewalld\", &|_| true).map(|r| r.name.as_str()),",
)
sub(
    "        assert!(first_present(&rows, &|_| false).is_none());",
    "        assert!(first_present(&rows, &|_| false, &|_| true).is_none());",
)
sub(
    "            first_present(&elsewhere, &|_| true).is_none(),",
    "            first_present(&elsewhere, &|_| true, &|_| true).is_none(),",
)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('adapter tests patched')
