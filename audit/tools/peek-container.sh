c=$(docker ps -q --filter ancestor=shall-it-ubuntu | head -1)
[ -n "$c" ] || { echo "no ubuntu container running"; exit 0; }
echo "container: $c"
docker top "$c" 2>/dev/null | head -12
