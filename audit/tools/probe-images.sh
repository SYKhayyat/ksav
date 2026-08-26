set -u
for img in \
  getsolus/solus:latest \
  solus/solus:latest \
  guix/guix:latest \
  metacall/guix:latest \
  registry.gitlab.com/nonguix/nonguix:latest \
  gentoo/stage3:latest \
  voidlinux/voidlinux:latest
do
  if docker manifest inspect "$img" >/dev/null 2>&1; then
    echo "PUBLISHED  $img"
  else
    echo "absent     $img"
  fi
done
