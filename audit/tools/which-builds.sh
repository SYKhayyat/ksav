ps aux | grep '[d]ocker build' | sed 's/  */ /g' | cut -d' ' -f2,11-
