$ErrorActionPreference = 'Stop'
$dir = 'C:\Users\Administrator\Videos\Ksav-audit\out'
# build the token prefix from codepoints: mem(05DE) yod(05D9) lamed(05DC) he(05D4)
$prefix = -join @([char]0x05DE, [char]0x05D9, [char]0x05DC, [char]0x05D4)
$cut = Get-Content "$dir\05-spill-cut.probe.txt" -Raw -Encoding UTF8
$win = Get-Content "$dir\06-spill-window.probe.txt" -Raw -Encoding UTF8

function Tok([int]$n) { return $prefix + ('{0:d2}' -f $n) }

"CUT pages: $(([regex]::Matches($cut, 'page \d+')).Count)"
$bad = @()
foreach ($n in 1..100) { $c = ([regex]::Matches($cut, [regex]::Escape($(Tok $n)))).Count; if ($c -ne 1) { $bad += "$(Tok $n) x$c" } }
if ($bad.Count -eq 0) { 'CUT: all 100 tokens exactly once' } else { 'CUT bad:'; $bad }

"WIN pages: $(([regex]::Matches($win, 'page \d+')).Count)"
$multi = 0; $once = 0; $miss = @()
foreach ($n in 1..100) {
  $c = ([regex]::Matches($win, [regex]::Escape($(Tok $n)))).Count
  if ($c -ge 2) { $multi++ } elseif ($c -eq 1) { $once++ } else { $miss += (Tok $n) }
}
"WIN: repeated=$multi once=$once missing=$($miss.Count) $($miss -join ',')"

foreach ($name in @('05-spill-cut', '06-spill-window')) {
  $raw = Get-Content "$dir\$name.probe.txt" -Raw -Encoding UTF8
  $parts = ($raw -split 'page \d+') | Where-Object { $_.Trim().Length -gt 0 }
  "== $name : $($parts.Count) page sections"
  for ($i = 0; $i -lt $parts.Count; $i++) {
    $ys = ([regex]::Matches($parts[$i], 'y=\s*(\d+\.?\d*)') | ForEach-Object { [double]$_.Groups[1].Value })
    $tokens = 0
    foreach ($n in 1..100) { $tokens += ([regex]::Matches($parts[$i], [regex]::Escape($(Tok $n)))).Count }
    if ($ys.Count) { "p$($i+1): lines=$($ys.Count) yMin=$(($ys | Measure-Object -Minimum).Minimum) yMax=$(($ys | Measure-Object -Maximum).Maximum) noteTokens=$tokens" }
  }
}
